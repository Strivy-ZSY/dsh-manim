"""Formulas without LaTeX.

Manim's `Tex` and `MathTex` shell out to `latex` and then `dvisvgm`. On this
machine neither can serve them — the MiKTeX 2.9 install segfaults on the
`standalone` class, and `dvisvgm` is absent from the distribution and from every
pip wheel — so a scene that reaches for `MathTex` dies at its first formula with

    ValueError: latex error converting to dvi

`mathtex()` is the way out: it typesets with matplotlib's built-in mathtext
engine (the one behind `$…$` in an axis label), which covers what an explainer
video actually needs — `\\frac`, `\\sqrt`, `\\sum`, `\\int`, `\\mathbb`,
`\\mathcal`, `\\hat`, `\\left(`/`\\right)`, sub- and superscripts — and needs no
external program.

Why a raster and not a vector:

* matplotlib's **SVG** output addresses repeated glyphs through
  `<use xlink:href="#…">`, which manim's SVG parser does not resolve; it dies
  with `TypeError: object of type 'NoneType' has no len()`.
* Reading matplotlib's **path data** directly and building filled `VMobject`
  contours loses the counters inside `e`, `o`, `θ`, `8` — manim fills each
  contour on its own, so the hole comes back solid.

Rasterising renders exactly what matplotlib drew. `SUPERSAMPLE` keeps it sharp
at 4K, and the colour is baked in at render time.

`math_to_image` is not used directly because it writes an opaque white
background (it calls `savefig` without `transparent=True`), which lands a visible
grey plate behind every formula on a dark scene.
"""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from manim import ImageMobject, MathTex, config

from .theme import INK

#: Device pixels rendered per on-screen pixel. 3 keeps a formula crisp through a
#: modest zoom on a 1080p frame without making the PNG large.
SUPERSAMPLE = 3

#: Points per manim unit. Measured, not assumed: a `Text` of `font_size=S` and a
#: mathtext parse at `FontProperties(size=S)` agree to within 0.3% when the
#: parse's point height is divided by this number, which is what lets a formula
#: and a label written at the same `size` line up.
POINTS_PER_UNIT = 72.0

_TEX_OK: bool | None = None

#: Accept `$x$` or `x`; mathtext needs the dollars.
_DOLLARS = re.compile(r"^\s*\$?(.*?)\$?\s*$", re.S)

#: Anything CJK, including the fullwidth punctuation that usually comes with it.
_CJK = re.compile(r"[⺀-鿿　-〿＀-￯]")


def has_latex() -> bool:
    """Whether `MathTex` can actually run here (needs both `latex` and `dvisvgm`).

    `DSH_MANIM_TEX=1` / `=0` overrides the probe, for a machine where TeX works
    but is not on PATH.
    """
    global _TEX_OK
    override = os.environ.get("DSH_MANIM_TEX")
    if override in ("0", "1"):
        return override == "1"
    if _TEX_OK is None:
        _TEX_OK = bool(shutil.which("latex") and shutil.which("dvisvgm"))
    return _TEX_OK


def target_pixel_height() -> int:
    """The height the *final* frame will have.

    Not simply `config.pixel_height`: the driver's plan pass runs on a 64×36
    canvas (see `driver.install_plan_hooks`) because it draws nothing, and
    deriving the raster resolution from that would (a) rerender every formula at
    a uselessly small size and (b) change the cache key, so the real render then
    pays for the same formula a second time at full size. The driver exports the
    job's real target so both passes agree.
    """
    override = os.environ.get("DSH_MANIM_TARGET_HEIGHT")
    if override is not None:
        try:
            value = int(override)
            if value > 0:
                return value
        except ValueError:
            pass
    return int(config.pixel_height)


def _cache_dir() -> Path:
    """Where rendered formula rasters live. Shared across renders on purpose."""
    override = os.environ.get("DSH_MANIM_CACHE")
    base = Path(override) if override else Path(tempfile.gettempdir()) / "dsh-manim"
    target = base / "mathtex"
    target.mkdir(parents=True, exist_ok=True)
    return target


def strip_dollars(expr: str) -> str:
    """`$x$` and `x` both mean `x` to the caller."""
    match = _DOLLARS.match(expr)
    return (match.group(1) if match is not None else expr).strip()


def _parse(expr: str, size: float):
    """matplotlib's measurement of `expr`: (width, height, depth) in points."""
    from matplotlib.font_manager import FontProperties
    from matplotlib.mathtext import MathTextParser

    # dpi=72 is what makes the returned numbers *points* rather than pixels.
    width, height, depth, _, _ = MathTextParser("path").parse(
        f"${expr}$", dpi=72, prop=FontProperties(size=size)
    )
    return float(width), float(height), float(depth)


def _render_png(expr: str, size: float, color: str, dpi: int, path: Path) -> tuple[float, float]:
    """Write one transparent-background PNG; return its size in manim units."""
    import matplotlib

    matplotlib.use("Agg", force=True)
    from matplotlib import figure
    from matplotlib.font_manager import FontProperties

    width, height, depth = _parse(expr, size)
    prop = FontProperties(size=size)
    # `facecolor="none"` on both the figure and the save is what keeps the
    # formula transparent on a dark scene.
    canvas = figure.Figure(figsize=(width / 72.0, height / 72.0), facecolor="none")
    # matplotlib anchors text at the baseline, and the parse's `depth` is how far
    # below it the descenders go, as a fraction of the box height.
    canvas.text(0, depth / height, f"${expr}$", fontproperties=prop, color=color)
    canvas.savefig(str(path), dpi=dpi, format="png", transparent=True)
    return width / POINTS_PER_UNIT, height / POINTS_PER_UNIT


def mathtex(
    expr: str,
    size: float = 48,
    color: str = INK,
    *,
    dpi: int | None = None,
    force_mathtext: bool = False,
) -> Any:
    """A formula as a mobject, ready for `play`, `next_to`, `scale`, …

    Parameters
    ----------
    expr
        LaTeX maths, with or without the surrounding `$`.
    size
        The same meaning as `Text(font_size=…)`, so a formula lines up with a
        label written at the same size.
    color
        Any colour manim accepts. With LaTeX this is applied to the vector
        mobject, so `set_color` still works afterwards; with mathtext it is baked
        into the raster, so it does not.
    dpi
        Raster resolution. Defaults to `SUPERSAMPLE` × the scene's pixel height.
    force_mathtext
        Skip the LaTeX probe. Set this when a working LaTeX produces a *worse*
        result than mathtext for a particular expression, or when the probe is
        right about TeX existing but wrong about it working. `DSH_MANIM_TEX=0`
        disables LaTeX everywhere instead.
    """
    # Chinese inside a formula is the one failure this function can make
    # *silently*, and it was observed in the wild: matplotlib's mathtext has no
    # CJK font, so `	ext{共享}` renders as a row of placeholder boxes without
    # raising, without a log line, and without changing the mobject's size — a
    # formula that looks fine in the code and wrong only in the finished video.
    # Refusing loudly is the only honest option; Chinese belongs in `text()`.
    if _CJK.search(expr):
        raise ValueError(
            "mathtex() 的表达式里有中文，matplotlib 的数学字体没有 CJK 字形，"
            "会静默画成一排空框（不报错、尺寸也不变）。中文请用 manimkit.text() 单独放，"
            f"公式里只留符号：{expr[:60]!r}"
        )

    if has_latex() and not force_mathtext:
        formula = MathTex(strip_dollars(expr), color=color)
        # Match `Text`'s scale: the parse gives the height this expression would
        # occupy in manim units, and MathTex sizes itself by its own rules.
        _, height, _ = _parse(strip_dollars(expr), size)
        formula.scale((height / POINTS_PER_UNIT) / max(formula.height, 1e-9))
        return formula

    clean = strip_dollars(expr)
    resolution = dpi or max(120, int(target_pixel_height() * SUPERSAMPLE))
    key = hashlib.sha1(f"{clean}|{size}|{color}|{resolution}".encode()).hexdigest()[:16]
    path = _cache_dir() / f"{key}.png"
    # The parse is needed either way — as the sizing source, and as the figure
    # geometry — so the cache only skips the rasterization itself.
    height_units = _parse(clean, size)[1] / POINTS_PER_UNIT
    if not path.exists():
        _render_png(clean, size, color, resolution, path)

    image = ImageMobject(str(path))
    image.scale(height_units / max(image.height, 1e-9))
    return image


def engine_note() -> str:
    """One line naming the engine in use, for a tool result or a log."""
    if has_latex():
        return "MathTex — LaTeX + dvisvgm"
    return "mathtext — matplotlib; no working LaTeX on this machine"
