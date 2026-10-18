"""Narration: put the voice track under the animation, and keep them in step.

The cue sheet this reads is written by `runtime/engine/voice.py` (behind the
`manim_voice` tool) and looks like:

```json
{ "voice": "zh-CN-XiaoxiaoNeural", "gap": 0.35, "total": 41.2,
  "cues": [ { "id": "b1", "text": "…", "file": "b1-9f3a.wav",
              "duration": 3.24, "at": 0.0 }, … ] }
```

Two functions, and the second one is the important one:

* :func:`narration` hands every cue to manim's `add_sound`, so the whole voice
  track is one line in the scene.
* :func:`hold` waits out the *rest of a line*, which is what makes an
  **audio-first** scene possible: write the animation for a beat, then call
  `hold()` and let the picture sit there exactly as long as the narration runs.
  Sizing the animation by hand from a stopwatch transcript is the alternative,
  and it drifts.

`hold` reads `scene.renderer.time`, which is the timeline the renderer actually
plays. That is also why the plan pass has to keep the clock moving (see
`driver.install_plan_hooks`): a scene that reads this clock but is measured in a
pass where it stands still produces a plan for a different scene.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from manim import logger

__all__ = ["cue", "find_cue_sheet", "hold", "narration"]


def _resolve(sheet: str | Path) -> Path:
    """Find a cue sheet from a relative path.

    Tried against the working directory first — which is how the render driver
    runs a scene, `cwd = 场景文件所在目录` — and then against the scene file's own
    directory, taken from manim's `config.input_file`. The second try is what
    makes `narration(self, "voice/cues.json")` work when a scene is rendered from
    somewhere else (the plain `manim` CLI, a test harness, an editor's run
    button), instead of failing with a path that looks correct in the source.
    """
    path = Path(sheet)
    if path.is_absolute() or path.exists():
        return path
    try:
        from manim import config

        beside = Path(str(config.input_file)).parent / path
        if beside.exists():
            return beside
    except Exception:
        pass
    return path


def find_cue_sheet(sheet: str | Path = "voice/cues.json") -> Path | None:
    """Locate a cue sheet, or None when there is none.

    The same search :func:`narration` uses, exposed so a scene can decide
    *whether* it has narration without re-implementing the lookup. Doing that
    lookup by hand is how the starter template came to render silently without
    audio: its own `Path("voice/cues.json").exists()` was evaluated against the
    working directory, while the renderer's working directory is not always the
    scene's.
    """
    found = _resolve(sheet)
    return found if found.exists() else None


def _load(sheet: str | Path) -> tuple[dict, Path]:
    """Read a cue sheet, resolving its directory for the audio paths."""
    path = _resolve(sheet)
    if not path.exists():
        raise FileNotFoundError(
            f"找不到旁白 cue sheet：{sheet}（按 {path} 找过）。先用 manim_voice(action='speak') 生成。"
        )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"cue sheet 不是合法 JSON：{path}（{error}）") from error
    if not isinstance(data, dict) or not isinstance(data.get("cues"), list):
        raise ValueError(f"cue sheet 结构不对（缺少 cues 数组）：{path}")
    return data, path.parent


def narration(scene: Any, sheet: str | Path, gain: float | None = None) -> dict:
    """Add every cue in a sheet to the scene, at its own offset.

    Paths are resolved against the sheet's directory at call time, so the scene
    works no matter where it is rendered from — the alternative (storing paths
    relative to the render cwd) breaks the moment someone renders with a
    different working directory.

    Parameters
    ----------
    scene
        the `Scene` being constructed.
    sheet
        path to `cues.json` (usually `voice/cues.json` next to the scene file).
    gain
        optional amplification, passed through to `add_sound`.

    Returns
    -------
    The sheet, so the scene can use :func:`hold` and read `total`.
    """
    data, base = _load(sheet)
    for entry in data["cues"]:
        audio = base / str(entry["file"])
        if not audio.exists():
            raise FileNotFoundError(f"cue {entry.get('id')!r} 的音频不存在：{audio}")
        scene.add_sound(str(audio), time_offset=float(entry.get("at", 0.0) or 0.0), gain=gain)
    return data


def cue(sheet: dict, cue_id: str) -> dict:
    """One cue by id, with a message that lists what is actually there."""
    for entry in sheet.get("cues", []):
        if str(entry.get("id")) == str(cue_id):
            return entry
    known = ", ".join(str(entry.get("id")) for entry in sheet.get("cues", [])) or "(空)"
    raise KeyError(f"cue sheet 里没有 {cue_id!r}；它有：{known}")


def hold(scene: Any, sheet: dict, cue_id: str, extra: float = 0.0, until: float = 1.0) -> float:
    """Wait out the rest of one narration line.

    Returns the seconds actually waited (0.0 when the picture already ran past
    the line — and that case logs a warning, because a beat that overruns its
    narration is the one timing mistake a render does not report: the voice
    simply keeps talking over the next beat).

    Parameters
    ----------
    scene
        the `Scene` being constructed.
    sheet
        the cue sheet returned by :func:`narration`.
    cue_id
        which line to wait out.
    extra
        seconds of silence to leave after the line (a breath, not a pause).
    until
        How far into the line to wait, as a fraction (default 1.0 = the end).
        This exists so a long line can hold a picture that needs to *change* in
        the middle of it::

            hold(self, cues, "b3", until=0.55)      # 讲到一半
            self.play(Indicate(cost, color=OK))     # 当场指出那个数字
            hold(self, cues, "b3")                  # 再把剩下半句等完

        Without it a nine-second line means nine seconds of a frozen frame, which
        is what "narration added on top" looks like — and the difference between
        that and a lecture is entirely in these mid-line beats.
    """
    entry = cue(sheet, cue_id)
    span = float(entry.get("duration", 0.0)) * min(max(float(until), 0.0), 1.0)
    end = float(entry.get("at", 0.0)) + span + (float(extra) if until >= 1.0 else 0.0)
    # `renderer.time` is the clock the renderer plays against; `scene.manager`
    # exposes it on 0.22, and older scenes fall back to the renderer directly.
    clock = getattr(getattr(scene, "manager", None), "time", None)
    if clock is None:
        clock = getattr(getattr(scene, "renderer", None), "time", 0.0)
    remaining = end - float(clock or 0.0)
    if remaining <= 0.05:
        if remaining < -0.05:
            logger.warning(
                f"这一拍（cue {cue_id}）比旁白慢了 {-remaining:.2f} 秒：画面还在演，旁白已经跑到下一句了。",
            )
        return 0.0
    scene.wait(remaining)
    return remaining
