"""dsh-manim render driver.

One process, one job. The host half (`lib/index.js`) spawns this with a JSON
spec on the command line and reads **newline-delimited JSON events from stdout**;
everything a human would read — manim's own logging, Python tracebacks — goes to
stderr and is forwarded by the host as a log tail.

Why a driver instead of `python -m manim render`:

1. **The media directory is ours.** The CLI writes `./media/…` into the user's
   workspace. This driver points `config.media_dir` at the plugin cache, so a
   render leaves the workspace alone (the finished `.mp4` is copied in on
   purpose, by the host, not as a side effect).
2. **Progress is machine-readable.** The CLI's tqdm bar is a terminal artifact.
   Here every animation boundary and every ~0.25 s of an animation emits an
   event, so the panel gets a real progress bar.
3. **A plan pass.** `plan: true` first runs `construct()` with the renderer's
   draw call stubbed out and the frame rate at 1 — seconds instead of minutes —
   to learn the animation count and total duration, which the UI needs for
   "第 3/12 段, 预计 1 分 24 秒". It doubles as a syntax/scene-name pre-flight
   check. It runs **in the same process** as the render: importing manim costs
   ~8 s on this machine, and paying it twice would make the plan pass more
   expensive than the draft render it is supposed to make predictable.
4. **No ffmpeg on PATH.** Manim 0.22 encodes through PyAV in-process, so the
   only external program this needs is the interpreter itself.

Standing output contract (stdout, one JSON object per line):

    {"ev":"hello",  "manim":"0.22.0","python":"3.12.4"}
    {"ev":"scenes", "scenes":[…]}                  # mode=list
    {"ev":"plan",   "plays":12,"duration":84.3}
    {"ev":"phase",  "phase":"render","state":"start"}
    {"ev":"progress","plays":3,"total":12,"frame":0.42,"time":5.1,"label":"…"}
    {"ev":"frames", "frames":[{"time":1.5,"path":"…"}]}   # mode=frames
    {"ev":"result", "ok":true,"video":"…","duration":84.3,"plays":12}
    {"ev":"error",  "message":"…","kind":"scene|tex|timeout|internal"}

Runs on the interpreter inside `runtime/venv` (see `../setup-runtime.mjs`), but
imports nothing from the plugin beyond the stdlib and manim itself.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import time
import traceback
from pathlib import Path

#: The canvas the plan pass runs on. Fixed rather than aspect-matched: the plan
#: pass measures counts and durations, and a wrong aspect ratio cannot change
#: either — while a fixed size keeps one less variable in the comparison.
PLAN_WIDTH = 64
PLAN_HEIGHT = 36

#: When this process started. Progress `elapsed` is measured from here, not from
#: the render pass: importing manim (~8 s on this machine) plus the plan pass are
#: time the user spent waiting, and a counter that says "0.4 s" after a twenty
#: second wait reads as a lie.
_STARTED_AT = time.time()

# ---------------------------------------------------------------------------
# stdout is the event channel; take it before manim can write to it
# ---------------------------------------------------------------------------
#
# Manim's rich console and its logger both default to `sys.stdout` at write
# time. A single stray line would break the host's NDJSON reader, so the real
# stdout is captured here and `sys.stdout` is rebound to stderr for the rest of
# the process. Manim's banner therefore lands in the log tail, which is where a
# human wants it anyway.

_REAL_STDOUT = sys.stdout
sys.stdout = sys.stderr
for _stream in (_REAL_STDOUT, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def emit(**event: object) -> None:
    """Write one NDJSON event. Never raises: a broken pipe must not kill a render."""
    try:
        _REAL_STDOUT.write(json.dumps(event, ensure_ascii=False) + "\n")
        _REAL_STDOUT.flush()
    except (BrokenPipeError, ValueError, OSError):
        pass


def log(text: str, level: str = "info") -> None:
    """Human-readable line for the stderr tail the host forwards."""
    print(f"[dsh-manim] {text}", file=sys.stderr, flush=True)
    emit(ev="log", level=level, text=text)


# ---------------------------------------------------------------------------
# spec
# ---------------------------------------------------------------------------

class Spec:
    """The job description, with every field optional except the mode."""

    def __init__(self, raw: dict) -> None:
        self.raw = raw
        self.mode: str = str(raw.get("mode") or "render")
        self.scene_file = raw.get("sceneFile")
        self.scene_name = raw.get("sceneName") or None
        self.media_dir = raw.get("mediaDir")
        self.output_name = raw.get("outputName") or None
        self.width = int(raw.get("width") or 1920)
        self.height = int(raw.get("height") or 1080)
        self.fps = int(raw.get("fps") or 60)
        self.background = raw.get("background") or None
        self.transparent = bool(raw.get("transparent") or False)
        self.format = str(raw.get("format") or "mp4")
        self.save_last_frame = bool(raw.get("saveLastFrame") or False)
        # Off for a re-render of something already measured; on by default so a
        # first render shows a real progress bar and fails fast on a bad scene.
        self.plan = raw.get("plan", True) is not False
        # How many segments may be encoded *while* the scene keeps rendering.
        self.encoders = int(raw.get("encoders") or 4)
        self.total_plays = raw.get("totalPlays")
        self.total_duration = raw.get("totalDuration")
        # mode=frames
        self.video = raw.get("video")
        self.times = raw.get("times") or []
        self.count = int(raw.get("count") or 0)
        self.out_dir = raw.get("outDir")
        self.frame_width = raw.get("frameWidth") or None


# ---------------------------------------------------------------------------
# manim plumbing
# ---------------------------------------------------------------------------

# Bound by `import_manim`; module-level so the mode handlers read naturally.
config = None
Scene = None
Manager = None


def import_manim() -> None:
    """Import manim once and report the versions on the event channel."""
    global config, Scene, Manager
    import manim
    from manim import Scene as SceneClass
    from manim import config as manim_config
    from manim.manager import Manager as ManagerClass

    config, Scene, Manager = manim_config, SceneClass, ManagerClass
    emit(ev="hello", manim=manim.__version__, python=sys.version.split()[0])


class Patches:
    """A restore log for monkeypatches, restored in reverse on exit.

    Restoring matters because the plan pass and the render pass patch the *same*
    classes: leaving the plan pass's no-op `CairoRenderer.render` installed
    would produce a video with nothing in it.
    """

    def __init__(self) -> None:
        self._saved: list[tuple[type, str, object]] = []

    def set(self, owner: type, name: str, value: object) -> None:
        self._saved.append((owner, name, owner.__dict__.get(name)))  # type: ignore[arg-type]
        setattr(owner, name, value)

    def restore(self) -> None:
        while self._saved:
            owner, name, raw = self._saved.pop()
            if raw is None:
                try:
                    delattr(owner, name)
                except AttributeError:
                    pass
            else:
                setattr(owner, name, raw)


def load_scene_module(scene_file: str):
    """Import a user scene file exactly the way manim's own loader does.

    Called **once** per process: `module_ops.get_module` execs the file, so a
    second call would re-run any module-level work for no reason.
    """
    from manim.utils.module_ops import get_module, get_scene_classes_from_module

    module = get_module(Path(scene_file).resolve())
    return module, get_scene_classes_from_module(module)


def pick_scene(classes: list, name: str | None):
    """Resolve the scene class: by name when given, else the only/last one."""
    if not classes:
        raise LookupError(
            "no Scene subclass found in this file — define one, e.g. `class MyScene(Scene):`"
        )
    if name:
        for candidate in classes:
            if candidate.__name__ == name:
                return candidate
        raise LookupError(
            f"scene {name!r} not found; this file defines: "
            + ", ".join(c.__name__ for c in classes)
        )
    return classes[0] if len(classes) == 1 else classes[-1]


def apply_config(spec: Spec) -> None:
    """Point manim's global config at this job."""
    # manimkit derives its formula-raster resolution from this rather than from
    # `config.pixel_height`, so the plan pass (64×36) and the render pass (the
    # real size) hash to the same cached PNG instead of rendering each formula
    # twice. See `manimkit.mathkit.target_pixel_height`.
    os.environ["DSH_MANIM_TARGET_HEIGHT"] = str(spec.height)
    if spec.media_dir:
        config.media_dir = str(Path(spec.media_dir).resolve())
    config.pixel_width = spec.width
    config.pixel_height = spec.height
    config.frame_rate = spec.fps
    config.format = spec.format
    # The driver owns progress reporting, so the tqdm bar would only duplicate
    # it in a form the host cannot parse.
    config.progress_bar = "none"
    config.verbosity = "WARNING"
    # Manim's default is 1: encode each segment's file before the next animation
    # starts, i.e. encoding and rendering never overlap. 4 is manim's own
    # recommendation for typical hardware and it is what turns a 67-animation
    # scene from "render, encode, render, encode…" into a pipeline. The cost is
    # memory: each in-flight encoder can hold `encoder_queue_size` (8) full
    # frames, so an 8.3 MB 1080p buffer × 8 × extra encoders.
    config.max_inflight_encoders = max(1, spec.encoders)
    config.preview = False
    config.show_in_file_browser = False
    config.write_all = False
    config.save_sections = False
    config.transparent = spec.transparent
    config.save_last_frame = spec.save_last_frame
    config.notify_outdated_version = False
    # The plain CLI sets this; we do not go through the CLI, and scene-side
    # helpers (manimkit.narration) use it to locate files relative to the scene
    # rather than relative to whatever the working directory happens to be.
    if spec.scene_file:
        config.input_file = str(Path(spec.scene_file).resolve())
    if spec.background:
        config.background_color = spec.background
    if spec.output_name:
        config.output_file = spec.output_name


# ---------------------------------------------------------------------------
# progress
# ---------------------------------------------------------------------------

class Progress:
    """Turns manim's render lifecycle into throttled progress events.

    Two counters, deliberately distinct: `done` is how many animations have
    finished, `index` is the number of the one running now. Mixing them is how
    the first version reported "第 5/4 段" on a four-animation scene.
    """

    def __init__(self, total: int | None) -> None:
        self.total = total
        self.done = 0
        self.index = 0
        self.label = ""
        self.frame_fraction = 0.0
        self.started = _STARTED_AT
        self._last_emit = 0.0

    def note_play_start(self, index: int, label: str) -> None:
        self.index = index
        self.done = max(self.done, index - 1)
        self.label = label
        self.frame_fraction = 0.0
        # Always emit a boundary: the UI wants the label change immediately.
        self.emit(force=True)

    def note_frame(self, fraction: float) -> None:
        self.frame_fraction = min(max(fraction, 0.0), 1.0)
        self.emit()

    def note_play_end(self) -> None:
        self.done = max(self.done, self.index)
        self.frame_fraction = 0.0
        self.emit(force=True)

    def emit(self, force: bool = False) -> None:
        now = time.time()
        if not force and now - self._last_emit < 0.25:
            return
        self._last_emit = now
        # Whole-render fraction: animations finished plus how far into the
        # current one the clock has reached. Without a plan pass `total` is
        # unknown and the UI falls back to a per-animation bar plus elapsed time.
        if self.total:
            frame = min(1.0, (self.done + self.frame_fraction) / self.total)
        else:
            frame = None
        emit(
            ev="progress",
            plays=self.index,
            done=self.done,
            total=self.total,
            frame=None if frame is None else round(frame, 4),
            animFraction=round(self.frame_fraction, 4),
            elapsed=round(now - self.started, 2),
            label=self.label,
        )


def animation_label(args: tuple) -> str:
    """A short human label for the animations in one `play()` call."""
    names = []
    for argument in args[:3]:
        name = type(argument).__name__
        if name.startswith("_"):
            name = getattr(argument, "__name__", name)
        names.append(name)
    if not names:
        return "play"
    return ", ".join(names) + ("…" if len(args) > 3 else "")


def install_progress_hooks(patches: Patches, progress: Progress) -> None:
    """Wrap `Manager.play` (animation boundaries) and `Scene.update_to_time`
    (progress *inside* one long animation).

    `Manager.play` is the chokepoint for every animation — `Scene.play` and
    `Scene.wait` both funnel through it — so one wrapper counts them all. The
    per-frame hook is what keeps a 20-second `Write()` from looking frozen.
    """
    original_play = Manager.play  # type: ignore[union-attr]
    original_update = Scene.update_to_time  # type: ignore[union-attr]

    def play(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        progress.note_play_start(self.num_plays + 1, animation_label(args))
        try:
            return original_play(self, *args, **kwargs)
        finally:
            progress.note_play_end()

    def update_to_time(self, t, *args, **kwargs):  # type: ignore[no-untyped-def]
        result = original_update(self, t, *args, **kwargs)
        duration = getattr(self, "duration", 0.0) or 0.0
        if duration > 0:
            progress.note_frame(float(t) / float(duration))
        return result

    patches.set(Manager, "play", play)  # type: ignore[arg-type]
    patches.set(Scene, "update_to_time", update_to_time)  # type: ignore[arg-type]


def install_plan_hooks(patches: Patches) -> None:
    """Make the plan pass cheap without changing what it measures.

    The plan pass exists to answer two questions — how many animations, and how
    long — and it answers them from `scale.duration`, which manim computes in
    `compile_animation_data` before any pixels exist. So everything that draws
    can go.

    **Which is more than "the draw call".** The first version stubbed only
    `CairoRenderer.render` and the plan pass still cost 126 seconds on a
    67-animation 1080p scene. Three other paths rasterise:

    * `save_static_frame_data` — called once *per animation*, and it goes through
      `update_frame`, not `render`.
    * `update_frame` itself — the shared entry point for both of the above, and
      for the frozen-frame path every `self.wait` takes.
    * `freeze_current_frame` — sizes a frame buffer for the wait's duration.

    What that costs is *not* the pixel fill: shrinking the canvas to 64×36 only
    took the same pass from 126 s to 68 s, because the bulk is walking and
    preparing the mobject tree (cairo path construction for every `Text` glyph
    outline) once per animation. Stubbing `update_frame` is what removes that.

    Safe because the plan pass runs with `config.dry_run = True`, which makes
    `output_spec.format` NONE — so `SceneFileWriter.write_frame` returns before
    it touches the (now absent) pixels.

    `Scene.validate_run_time` also stops clamping: with the frame rate forced to
    1 a 0.4 s animation would otherwise be widened to 1 s and every reported
    duration inflated. Timings come from `Animation.run_time`, which does not
    depend on the frame rate, so dropping the clamp keeps them exact.
    """
    from manim.renderer.cairo_renderer import CairoRenderer

    def plan_render(self, scene, time, moving_mobjects=None):
        # Draw nothing, and do not touch the clock either: `plan_play` sets the
        # clock exactly once per play, from the animation's own duration.
        return None

    def plan_play(self, scene, *args, **kwargs):
        # A frozen frame never reaches `CairoRenderer.render`; the renderer's own
        # `play` decides between the frozen branch and `play_internal`. This
        # mirrors that structure with the drawing paths removed.
        #
        # **The clock is the delicate part.** `renderer.time` is a timeline scene
        # code can read, and manimkit's `hold()` uses it to wait out a narration
        # line. Two wrong versions came before this one:
        #
        #   * leaving it alone (the first stub set) — `hold()` saw zero elapsed
        #     time for every beat and the plan measured a different scene;
        #   * advancing it by `1/frame_rate` per frame, as `add_frame` does — but
        #     the plan pass runs at 1 fps, so a 0.5 s animation advanced the clock
        #     a whole second. Across this scene's five short beats that added up
        #     to a plan of 10.0 s for a render that is 11.4 s.
        #
        # Setting it once per play to `start + scene.duration` is exact, and it
        # costs nothing: the frame loop still runs at 1 fps, only the clock is
        # honest. The real render quantises to whole frames (≤ 1/fps of drift),
        # which is smaller than anything a viewer or a `hold()` can notice.
        started = self.time
        self.update_skipping_status()
        scene.compile_animation_data(*args, **kwargs)
        scene.begin_animations()
        if not scene.is_current_animation_frozen_frame():
            scene.play_internal()
        for animation in scene.animations:
            animation.finish()
            animation.clean_up_from_scene(scene)
        self.time = started + float(scene.duration or 0.0)
        self.num_plays += 1

    patches.set(CairoRenderer, "render", plan_render)
    patches.set(CairoRenderer, "play", plan_play)
    patches.set(CairoRenderer, "update_frame", lambda *args, **kwargs: None)
    patches.set(CairoRenderer, "save_static_frame_data", lambda *args, **kwargs: None)
    patches.set(CairoRenderer, "freeze_current_frame", lambda *args, **kwargs: None)
    patches.set(
        Scene,  # type: ignore[arg-type]
        "validate_run_time",
        staticmethod(lambda run_time, method=None, parameter_name="run_time": run_time),
    )


# ---------------------------------------------------------------------------
# modes
# ---------------------------------------------------------------------------

def mode_list(spec: Spec) -> dict:
    """Inventory a scene file: every Scene subclass it defines."""
    if spec.scene_file is None:
        raise ValueError("sceneFile is required")
    _, classes = load_scene_module(spec.scene_file)
    scenes = [
        {
            "name": scene_class.__name__,
            "bases": [b.__name__ for b in scene_class.__mro__[1:3]],
            "doc": (scene_class.__doc__ or "").strip().split("\n")[0][:160],
        }
        for scene_class in classes
    ]
    emit(ev="scenes", scenes=scenes)
    return {"ok": True, "scenes": scenes, "module": Path(spec.scene_file).stem}


def plan_scene(spec: Spec, patches: Patches) -> dict:
    """Run `construct()` with drawing disabled and report what it would render."""
    plans = Patches()
    # The plan pass needs the same job config the render gets — `input_file` in
    # particular, which is how scene-side helpers locate their own assets. It
    # used to be skipped here, and choosing `mode=plan` then behaved differently
    # from the plan inside `mode=render`: same scene, same flags, one of them
    # could not find `voice/cues.json`.
    apply_config(spec)
    original_pixels = (config.pixel_width, config.pixel_height)
    original_text_dir = config.text_dir
    # **Keep the plan pass out of the text cache.**
    #
    # `Text._text2svg` passes `config["pixel_width"]`/`["pixel_height"]` to
    # `manimpango.text2svg` as the Pango layout box, and writes the result to
    # `config.text_dir` under a hash that does **not** include those numbers. So
    # rendering a `Text` on the plan pass's 64×36 canvas writes a *wrapped,
    # truncated* SVG into the shared cache, and the real render then reuses it:
    # every title and caption comes out cut off at 64 px, with no error anywhere.
    # That is exactly what happened, and it is why the frames are worth looking
    # at. Pointing `text_dir` at a throwaway directory makes the plan pass's text
    # renders land nowhere, at the cost of rendering them once more for real.
    plan_text_dir = Path(tempfile.mkdtemp(prefix="dsh-manim-plan-texts-"))
    config.text_dir = plan_text_dir
    try:
        # 1 fps: the frame loop runs once per second of animation rather than
        # once per frame. `install_plan_hooks` keeps the reportable timings
        # exact anyway, and a dry run turns media output off entirely.
        config.frame_rate = 1
        config.dry_run = True
        # And shrink the canvas. Stubbing `CairoRenderer.render` is NOT enough to
        # make the plan pass cheap: the renderer still rasterises through
        # `update_frame`, which `save_static_frame_data` calls once per animation
        # and which frozen frames (every `self.wait`) go through. Both draw into
        # a buffer of `pixel_width × pixel_height`, so at 1080p the "cheap" plan
        # pass was costing 126 seconds on a 67-animation scene — 19% of the whole
        # final render, spent on pixels nobody will ever look at. Mobject
        # geometry is in manim units and does not depend on the canvas, so the
        # counts and durations are identical; only the rasterising gets ~1000×
        # cheaper.
        config.pixel_width = PLAN_WIDTH
        config.pixel_height = PLAN_HEIGHT
        install_plan_hooks(plans)

        _, classes = load_once(spec.scene_file)
        scene_class = pick_scene(classes, spec.scene_name)

        plays = 0
        total = 0.0
        original_play = Manager.play  # type: ignore[union-attr]

        def counting_play(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            nonlocal plays, total
            plays += 1
            result = original_play(self, *args, **kwargs)
            # manim's own number, read back off the scene after the animation —
            # the duration it actually rendered, not a re-derivation from
            # `run_time` that can disagree (a Write's run time is not simply
            # the kwarg when the kwarg is absent).
            rendered = float(getattr(self.scene, "duration", 0.0) or 0.0)
            if rendered <= 0:
                for argument in args:
                    rendered = max(rendered, float(getattr(argument, "run_time", 0.0) or 0.0))
            total += rendered
            return result

        plans.set(Manager, "play", counting_play)  # type: ignore[arg-type]
        scene_class().render()
        result = {"plays": plays, "duration": round(total, 3), "scene": scene_class.__name__}
        emit(ev="plan", **result)
        return result
    finally:
        plans.restore()
        config.dry_run = False
        config.frame_rate = spec.fps
        config.pixel_width, config.pixel_height = original_pixels
        config.text_dir = original_text_dir
        shutil.rmtree(plan_text_dir, ignore_errors=True)


# The scene module is imported once and reused by the plan and render passes:
# `module_ops.get_module` execs the file, so importing twice would re-run any
# module-level work for nothing.
_LOADED: tuple | None = None


def load_once(scene_file: str):
    """Import the scene module, or return the already-imported one."""
    global _LOADED
    if _LOADED is None:
        _LOADED = load_scene_module(scene_file)
    return _LOADED


def render_scene(spec: Spec, patches: Patches) -> dict:
    """The real thing: render one scene to a media file."""
    apply_config(spec)
    config.dry_run = False

    _, classes = load_once(spec.scene_file)
    scene_class = pick_scene(classes, spec.scene_name)

    total = int(spec.total_plays) if spec.total_plays else None
    if total is None and spec.plan:
        try:
            planned = plan_scene(spec, patches)
            total = planned["plays"] or None
        except Exception as error:  # noqa: BLE001 - the plan pass is optional
            # A scene that cannot be planned often cannot be rendered either,
            # but "often" is not "always" (a construct() that reads a file the
            # render creates, say), so this degrades to a render without totals
            # rather than refusing to start. The real error surfaces below.
            log(f"plan pass failed, rendering without totals: {error}", level="warn")
            apply_config(spec)
            config.dry_run = False
            _, classes = load_once(spec.scene_file)
            scene_class = pick_scene(classes, spec.scene_name)

    progress = Progress(total)
    install_progress_hooks(patches, progress)

    emit(ev="phase", phase="render", state="start", scene=scene_class.__name__)
    scene = scene_class()
    scene.render()
    emit(ev="phase", phase="render", state="end")

    manager = getattr(scene, "manager", None)
    writer = getattr(manager, "file_writer", None) or getattr(scene, "file_writer", None)
    video = None
    final = getattr(writer, "final_file_path", None)
    if final is not None:
        video = str(final)
    else:
        planned_path = getattr(writer, "movie_file_path", None)
        if planned_path is not None:
            video = str(planned_path)

    if video and not Path(video).exists():
        raise FileNotFoundError(f"manim reported {video!r} but nothing is there")

    audio = None
    if video and Path(video).exists() and spec.format == "mp4":
        audio = inspect_audio(Path(video))
        if audio is not None and audio["overflow"] is not None and audio["overflow"] > 0.25:
            # The muxer is configured with `shortest`, so a narration that runs
            # past the last animation is cut off at the picture — silently. This
            # is the one audio failure that looks exactly like success.
            emit(
                ev="log",
                level="warn",
                text=(
                    f"旁白比画面长 {audio['overflow']:.2f} 秒，结尾被截断了："
                    "画面总长要 ≥ 旁白总长（manimkit 的 hold() 就是干这个的）"
                ),
            )

    rendered = getattr(manager, "time", None)
    return {
        "ok": True,
        "video": video,
        **({} if audio is None else {"audio": audio}),
        "plays": progress.index,
        "duration": None if rendered is None else round(float(rendered), 3),
        "scene": scene_class.__name__,
        "width": spec.width,
        "height": spec.height,
        "fps": spec.fps,
        "plannedPlays": total,
    }


def inspect_audio(path: Path) -> dict | None:
    """Report an mp4's audio/video lengths, and by how much the audio overruns.

    Read with PyAV so this needs no ffmpeg binary — and reads the *finished
    container*, which is the only place the loss happens: manim muxes with
    `shortest=1`, so an over-long narration is dropped at the video's end
    without an error anywhere upstream.
    """
    try:
        import av
    except Exception:
        return None
    try:
        container = av.open(str(path))
    except Exception:
        return None
    try:
        video_stream = next((s for s in container.streams if s.type == "video"), None)
        audio_stream = next((s for s in container.streams if s.type == "audio"), None)
        if audio_stream is None:
            return {"present": False, "videoDuration": None, "audioDuration": None, "overflow": None}
        video_length = float(video_stream.duration * video_stream.time_base) if video_stream.duration else 0.0
        audio_length = float(audio_stream.duration * audio_stream.time_base) if audio_stream.duration else 0.0
        overflow = None
        if video_length > 0 and audio_length > 0:
            overflow = round(audio_length - video_length, 3)
        return {
            "present": True,
            "videoDuration": round(video_length, 3),
            "audioDuration": round(audio_length, 3),
            "overflow": overflow,
        }
    finally:
        container.close()


def mode_frames(spec: Spec) -> dict:
    """Pull stills out of a rendered video — storyboards and agent inspection.

    Decodes the container once (PyAV is already a manim dependency, so this
    needs no ffmpeg binary) and keeps the frame nearest each requested timestamp.
    """
    import av

    targets = [float(t) for t in spec.times]
    out_dir = Path(spec.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not targets and spec.count > 0:
        container = av.open(spec.video)
        length = float(container.duration or 0) / 1e6 if container.duration else 0.0
        container.close()
        if length <= 0:
            raise ValueError("cannot read this video's duration")
        # Evenly spaced, but never the very first or very last frame: an opening
        # title card and the closing fade are the two least informative frames
        # in an explainer clip.
        step = length / (spec.count + 1)
        targets = [round(step * (i + 1), 3) for i in range(spec.count)]

    wanted = sorted(set(targets))
    best: dict[float, tuple[float, object]] = {}
    container = av.open(spec.video)
    try:
        for frame in container.decode(video=0):
            stamp = float(frame.time or 0.0)
            for target in wanted:
                current = best.get(target)
                if current is None or abs(stamp - target) < abs(current[0] - target):
                    best[target] = (stamp, frame)
    finally:
        container.close()

    written = []
    for target in wanted:
        entry = best.get(target)
        if entry is None:
            continue
        image = entry[1].to_image()  # type: ignore[union-attr]
        if spec.frame_width and image.width > spec.frame_width:
            ratio = spec.frame_width / image.width
            image = image.resize((int(image.width * ratio), max(1, int(image.height * ratio))))
        path = out_dir / f"frame-{target:07.3f}.png"
        image.save(path)
        written.append(
            {"time": target, "path": str(path), "width": image.width, "height": image.height}
        )
    emit(ev="frames", frames=written)
    return {"ok": True, "frames": written}


def mode_probe(spec: Spec) -> dict:
    """Environment report: what this interpreter can and cannot do."""
    import shutil

    import manim

    info: dict = {"ok": True, "manim": manim.__version__, "python": sys.version.split()[0]}
    try:
        import av

        info["av"] = av.__version__
    except Exception as error:  # pragma: no cover - reported, never raised
        info["av"] = None
        info["avError"] = str(error)
    try:
        import matplotlib

        info["matplotlib"] = matplotlib.__version__
    except Exception:
        info["matplotlib"] = None
    # LaTeX is optional. `Tex`/`MathTex` need a working latex *and* dvisvgm, and
    # a machine with neither is still perfectly usable: `Text` (Pango) does
    # titles and labels, and manimkit's `mathtex()` covers the formulas.
    info["latex"] = shutil.which("latex")
    info["dvisvgm"] = shutil.which("dvisvgm")
    info["tex"] = bool(info["latex"] and info["dvisvgm"])
    return info


# ---------------------------------------------------------------------------

MODES = {
    "list": mode_list,
    "plan": plan_scene,
    "render": render_scene,
    "frames": mode_frames,
    "probe": mode_probe,
}

# Modes that take the patch log and materialise the scene module.
_PATCHED = {"plan", "render"}
_SETUP = {"plan", "render"}


def main(argv: list[str]) -> int:
    # The host passes the spec inline; `@file` exists for a spec too large for
    # one command line (a render with hundreds of frame timestamps).
    raw_spec = argv[1] if len(argv) > 1 else "{}"
    if raw_spec.startswith("@"):
        raw_spec = Path(raw_spec[1:]).read_text(encoding="utf-8")
    spec = Spec(json.loads(raw_spec))

    handler = MODES.get(spec.mode)
    if handler is None:
        emit(ev="error", kind="internal", message=f"unknown mode {spec.mode!r}")
        return 2

    patches = Patches()
    try:
        if spec.mode in _SETUP:
            import_manim()
        if spec.mode in _PATCHED:
            result = handler(spec, patches)
        else:
            result = handler(spec)
    except Exception as error:  # noqa: BLE001 - every failure becomes an event
        emit(
            ev="error",
            kind=classify(error),
            message=str(error) or type(error).__name__,
            traceback=traceback.format_exc()[-4000:],
        )
        return 1
    finally:
        patches.restore()
    emit(ev="result", **result)
    return 0


def classify(error: BaseException) -> str:
    """Bucket a failure so the UI can say something better than a traceback."""
    text = f"{type(error).__name__}: {error}".lower()
    if "dvisvgm" in text:
        return "tex"
    if "latex" in text or "tex_to_svg" in text:
        return "tex"
    if isinstance(error, FileNotFoundError):
        return "missing"
    if isinstance(error, LookupError):
        return "scene"
    if isinstance(error, SyntaxError):
        return "syntax"
    return "internal"


if __name__ == "__main__":
    sys.exit(main(sys.argv))
