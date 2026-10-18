"""dsh-manim narration helper: text → WAV files a scene can `add_sound()`.

Why this file exists
--------------------
manim mixes audio natively — `Scene.add_sound(path, time_offset=…)` and the
encoder writes an AAC track (verified: the output mp4 carries both a `h264` and
an `aac` stream). What it does **not** do is produce the audio. This fills that
gap, and it has to fill it in a very specific format:

    **WAV, PCM, 24 kHz, mono.**

Because manim loads `add_sound` input through `pydub`, and pydub decodes
anything that is not a WAV by shelling out to `ffmpeg`/`avconv` — which this
machine does not have (manim 0.22 only needs PyAV for *video*, so the missing
binary never showed up until audio). Both engines below therefore end at a WAV,
converting through PyAV when the engine's native format is MP3.

Two engines, and why both
-------------------------
* `edge` — Microsoft Edge's read-aloud service, via the `edge-tts` package. No
  API key, no cost, and the Chinese voices are close to human (`Xiaoxiao`,
  `Yunxi`, `Yunyang`). Needs network.
* `sapi` — Windows' own offline synthesiser (`Microsoft Huihui Desktop`,
  zh-CN). Robotic, but it works with the network down, which is the difference
  between "I can render a narrated draft" and "I cannot render at all".

`engine: auto` tries `edge` and falls back to `sapi`, saying which one it used.

Output contract (stdout, one JSON object per line) — same shape as
`engine/driver.py`, for the same reason: the host half is a reader, not an
interpreter.

    {"ev":"result","engine":"edge","files":[{"id":"b1","path":"…","duration":3.41}]}
    {"ev":"error","kind":"network","message":"…"}

Usage: `python voice.py '<json spec>'` (spec: mode / engine / voice / rate /
lines / outDir).
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

_REAL_STDOUT = sys.stdout
sys.stdout = sys.stderr
for _stream in (_REAL_STDOUT, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def emit(**event: object) -> None:
    """Write one NDJSON event. Never raises."""
    try:
        _REAL_STDOUT.write(json.dumps(event, ensure_ascii=False) + "\n")
        _REAL_STDOUT.flush()
    except (BrokenPipeError, ValueError, OSError):
        pass


#: Output format every engine is normalised to. 24 kHz mono is what the Edge
#: service returns natively, and PCM WAV is the one format pydub reads without
#: an external program.
SAMPLE_RATE = 24000

#: How long a line may be before the engine is asked for a whole paragraph.
#: Not a hard limit — the split happens on sentence punctuation, so a long line
#: becomes several files rather than a truncated one.
MAX_CHARS = 600


def duration_of(path: Path) -> float:
    """Seconds of an audio file, read with PyAV (no ffmpeg binary needed)."""
    import av

    container = av.open(str(path))
    try:
        length = float(container.duration or 0) / 1e6
        if length > 0:
            return round(length, 3)
        # Some containers report no duration; fall back to counting frames.
        stream = container.streams.audio[0]
        total = 0.0
        for frame in container.decode(audio=0):
            total += float(frame.samples) / float(stream.rate or SAMPLE_RATE)
        return round(total, 3)
    finally:
        container.close()


def to_wav(source: Path, target: Path) -> None:
    """Transcode anything PyAV can read into mono PCM WAV.

    `layout="mono"` is explicit on purpose: PyAV's `add_stream("pcm_s16le")`
    defaults to stereo, so an mp3 that came in mono goes out as two identical
    channels — twice the bytes for no information, and a subtly different
    waveform from what the engine actually said.
    """
    import av

    with av.open(str(source)) as incoming:
        resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
        with av.open(str(target), mode="w") as outgoing:
            stream = outgoing.add_stream("pcm_s16le", rate=SAMPLE_RATE, layout="mono")
            for frame in incoming.decode(audio=0):
                for resampled in resampler.resample(frame):
                    for packet in stream.encode(resampled):
                        outgoing.mux(packet)
            for resampled in resampler.resample(None):
                for packet in stream.encode(resampled):
                    outgoing.mux(packet)
            for packet in stream.encode(None):
                outgoing.mux(packet)


# ---------------------------------------------------------------------------
# engines
# ---------------------------------------------------------------------------

def edge_available() -> bool:
    """Whether the `edge-tts` package is importable."""
    try:
        import edge_tts  # noqa: F401

        return True
    except Exception:
        return False


def edge_voices() -> list[dict]:
    """Chinese voices Edge offers, as `{id, gender, tags}`."""
    import asyncio

    import edge_tts

    async def collect() -> list[dict]:
        raw = await edge_tts.list_voices()
        return [
            {
                "id": voice.get("ShortName", ""),
                "gender": voice.get("Gender", ""),
                "tags": ", ".join(voice.get("VoiceTag", {}).get("ContentCategories", []) or []),
                "personalities": ", ".join(voice.get("VoiceTag", {}).get("VoicePersonalities", []) or []),
            }
            for voice in raw
            if str(voice.get("Locale", "")).startswith("zh")
        ]

    return asyncio.run(collect())


def speak_edge(text: str, voice: str, rate: str, target: Path) -> None:
    """Synthesise `text` with Edge, then normalise it to WAV."""
    import asyncio

    import edge_tts

    async def run() -> None:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        await communicate.save(str(mp3))

    mp3 = target.with_suffix(".mp3")
    asyncio.run(run())
    try:
        to_wav(mp3, target)
    finally:
        mp3.unlink(missing_ok=True)


def sapi_voices() -> list[dict]:
    """Windows' installed offline voices.

    Delimited text, **not** `ConvertTo-Json`: `VoiceInfo.Culture` is a
    `CultureInfo`, which Windows PowerShell 5.1 serialises as a string and
    PowerShell 7 as a deeply nested object — and 7 also truncates that object at
    its default serialisation depth, with the warning on stderr. Parsing
    `name|culture|gender` lines behaves identically under both, and they do not
    even agree on which voices exist (7 sees both registry views).
    """
    script = (
        "Add-Type -AssemblyName System.Speech; "
        "(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | "
        "ForEach-Object { $i = $_.VoiceInfo; "
        "Write-Output ($i.Name + '|' + $i.Culture.Name + '|' + $i.Gender) }"
    )
    raw = _powershell(script)
    if raw is None:
        return []
    voices: list[dict] = []
    seen: set[str] = set()
    for line in raw.splitlines():
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 3 or parts[0] == "" or parts[0] in seen:
            continue
        seen.add(parts[0])
        voices.append({"id": parts[0], "culture": parts[1], "gender": parts[2]})
    return voices


def speak_sapi(text: str, voice: str, rate: str, target: Path) -> None:
    """Synthesise offline with Windows SAPI.

    `rate` arrives in Edge's `+20%`/`-10%` grammar because that is what the tool
    takes from the model; SAPI wants -10…10, roughly a third of the percentage.
    """
    try:
        numeric = int(str(rate).replace("%", "").replace("+", ""))
    except ValueError:
        numeric = 0
    sapi_rate = max(-10, min(10, round(numeric / 3)))
    escaped_name = voice.replace("'", "''")
    escaped_text = text.replace("'", "''")
    script = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        f"try {{ $s.SelectVoice('{escaped_name}') }} catch {{}}; "
        f"$s.Rate = {sapi_rate}; "
        f"$s.SetOutputToWaveFile('{str(target).replace(chr(92), chr(92) * 2)}'); "
        f"$s.Speak('{escaped_text}'); "
        "$s.Dispose()"
    )
    if _powershell(script) is None:
        raise RuntimeError("Windows 语音合成失败（PowerShell/SAPI 不可用）")


def _powershell(script: str) -> str | None:
    """Run a PowerShell script, returning stdout (None on any failure)."""
    for executable in ("pwsh", "powershell"):
        try:
            result = subprocess.run(
                [executable, "-NoProfile", "-NonInteractive", "-Command", script],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=180,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        if result.returncode == 0:
            return result.stdout.strip()
    return None


# ---------------------------------------------------------------------------
# job
# ---------------------------------------------------------------------------

def pick_engine(requested: str, voice: str) -> str:
    """Resolve `auto` to a concrete engine, preferring the good-sounding one."""
    if requested in ("edge", "sapi"):
        return requested
    # A SAPI voice name is a Windows voice description ("Microsoft Huihui
    # Desktop"); an Edge voice is a locale-tagged identifier. The voice the
    # caller asked for is a better hint than the default order.
    if voice and not voice.startswith("zh-") and "." not in voice[:6] and "Microsoft" in voice:
        return "sapi"
    if edge_available():
        return "edge"
    return "sapi"


def cache_root() -> Path:
    """Where synthesised lines live between jobs."""
    override = os.environ.get("DSH_MANIM_CACHE")
    base = Path(override) if override else Path(tempfile.gettempdir()) / "dsh-manim"
    target = base / "voice"
    target.mkdir(parents=True, exist_ok=True)
    return target


def mode_list(spec: dict) -> dict:
    """Report which engines work here and what voices they offer."""
    engines = {"edge": edge_available(), "sapi": os.name == "nt"}
    voices: list[dict] = []
    errors: list[str] = []
    if engines["edge"]:
        try:
            for voice in edge_voices():
                voices.append({**voice, "engine": "edge"})
        except Exception as error:  # noqa: BLE001 - reported, never raised
            engines["edge"] = False
            errors.append(f"edge 音色列表取不到：{error}")
    if engines["sapi"]:
        for voice in sapi_voices():
            voices.append({**voice, "engine": "sapi"})
    voices.sort(key=lambda item: (item["engine"], item["id"]))
    return {"ok": True, "engines": engines, "voices": voices, "errors": errors}


def split_long(text: str) -> list[str]:
    """Break an over-long line on sentence punctuation rather than truncating it.

    Silent truncation is this repository's recurring bug; a line that is too long
    for one synthesis call becomes two files, not a sentence that stops halfway.
    """
    if len(text) <= MAX_CHARS:
        return [text]
    import re

    pieces = re.split(r"(?<=[。！？；.!?;])\s*", text)
    out: list[str] = []
    current = ""
    for piece in pieces:
        if not piece:
            continue
        if current and len(current) + len(piece) > MAX_CHARS:
            out.append(current)
            current = piece
        else:
            current += piece
    if current:
        out.append(current)
    # A single sentence longer than the cap cannot be split on punctuation; cut
    # it on a comma boundary so nothing is dropped.
    final: list[str] = []
    for chunk in out:
        while len(chunk) > MAX_CHARS:
            cut = chunk.rfind("，", 0, MAX_CHARS)
            if cut <= 0:
                cut = MAX_CHARS
            final.append(chunk[:cut])
            chunk = chunk[cut:]
        final.append(chunk)
    return [item for item in final if item.strip() != ""]


def mode_speak(spec: dict) -> dict:
    """Synthesise every line, returning one WAV + duration per line."""
    lines = spec.get("lines") or []
    if not isinstance(lines, list) or not lines:
        raise ValueError("lines is required and must be a non-empty array")
    out_dir = Path(spec.get("outDir") or ".")
    out_dir.mkdir(parents=True, exist_ok=True)
    engine = pick_engine(str(spec.get("engine") or "auto"), str(spec.get("voice") or ""))
    voice = str(spec.get("voice") or ("zh-CN-XiaoxiaoNeural" if engine == "edge" else "Microsoft Huihui Desktop"))
    if engine == "sapi" and not voice:
        voice = "Microsoft Huihui Desktop"
    rate = str(spec.get("rate") or "+0%")
    reusable = spec.get("reuse", True) is not False

    # Silences between lines. Narration with no air between sentences sounds
    # rushed no matter how good the voice is, and the gap is what gives the
    # animation a beat to land on.
    gap = float(spec.get("gap", 0.35))

    files: list[dict] = []
    for index, raw in enumerate(lines):
        if isinstance(raw, str):
            item = {"id": f"line{index + 1:02d}", "text": raw}
        elif isinstance(raw, dict):
            item = {"id": str(raw.get("id") or f"line{index + 1:02d}"), "text": str(raw.get("text") or "")}
        else:
            continue
        text = item["text"].strip()
        if text == "":
            continue
        for part_index, part in enumerate(split_long(text)):
            suffix = "" if part_index == 0 else f"-{part_index + 1}"
            line_id = f"{item['id']}{suffix}"
            safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in line_id)[:60]
            # The cache key covers everything that can change the audio, so a
            # re-run of an unchanged script is free and a changed line is not
            # silently served from the old one.
            key = hashlib.sha1(f"{part}|{voice}|{rate}|{engine}".encode()).hexdigest()[:12]
            target = out_dir / f"{safe}-{key}.wav"
            if not (reusable and target.exists()):
                if engine == "edge":
                    speak_edge(part, voice, rate, target)
                else:
                    speak_sapi(part, voice, rate, target)
            files.append(
                {
                    "id": line_id,
                    "text": part,
                    "path": str(target),
                    "duration": duration_of(target),
                    "engine": engine,
                    "voice": voice,
                }
            )
    if not files:
        raise ValueError("每条 line 都是空的")

    # A cue sheet: the same WAVs plus where each one starts. Written so the scene
    # does not have to reconstruct a timeline from durations by hand — a scene
    # that gets that arithmetic wrong is a scene whose narration drifts a second
    # behind the picture by the end, which nothing in the render reports.
    cues: list[dict] = []
    cursor = 0.0
    for entry in files:
        cues.append(
            {
                "id": entry["id"],
                "text": entry["text"],
                "file": Path(entry["path"]).name,
                "duration": entry["duration"],
                "at": round(cursor, 3),
                "engine": entry["engine"],
                "voice": entry["voice"],
            }
        )
        cursor += float(entry["duration"]) + gap
    total = max(0.0, cursor - gap)
    sheet = {
        "engine": engine,
        "voice": voice,
        "rate": rate,
        "gap": gap,
        "total": round(total, 3),
        "cues": cues,
    }
    sheet_path = out_dir / "cues.json"
    sheet_path.write_text(json.dumps(sheet, ensure_ascii=False, indent=2), encoding="utf-8")
    emit(ev="result", ok=True, engine=engine, voice=voice, files=files, cues=cues, total=round(total, 3), sheet=str(sheet_path))
    return {"ok": True, "engine": engine, "voice": voice, "files": files, "cues": cues, "total": round(total, 3), "sheet": str(sheet_path)}


MODES = {"list": mode_list, "speak": mode_speak}


def main(argv: list[str]) -> int:
    raw = argv[1] if len(argv) > 1 else "{}"
    if raw.startswith("@"):
        raw = Path(raw[1:]).read_text(encoding="utf-8")
    try:
        spec = json.loads(raw)
    except json.JSONDecodeError as error:
        emit(ev="error", kind="invalid", message=f"spec 不是合法 JSON：{error}")
        return 2
    handler = MODES.get(str(spec.get("mode") or "list"))
    if handler is None:
        emit(ev="error", kind="invalid", message=f"unknown mode {spec.get('mode')!r}")
        return 2
    try:
        result = handler(spec)
    except Exception as error:  # noqa: BLE001 - every failure becomes an event
        import traceback

        kind = "network" if any(word in str(error).lower() for word in ("connect", "resolve", "timeout", "websocket")) else "internal"
        emit(ev="error", kind=kind, message=str(error), traceback=traceback.format_exc()[-2000:])
        return 1
    if str(spec.get("mode")) == "list":
        emit(ev="result", **result)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
