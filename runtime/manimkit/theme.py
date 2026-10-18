"""The house palette, and the one font decision nobody wants to re-make.

Two rules, both learned from watching the first drafts:

1. **A video that opens on pure black looks unfinished.** The background is a
   very dark blue-grey, so panels and captions can sit "on" something. Manim's
   own default is `#000000`; `theme()` sets this one.
2. **Chinese and Latin need different typefaces.** Manim's default font stack
   has no CJK coverage, and Pango's fallback for a missing glyph is a tofu box,
   not an exception — so a wrong font shows up as a correctly-sized row of
   empty rectangles in the finished video. `text()` picks per string.

The colours are a categorical set with enough separation to stay distinguishable
after video compression, which is where thin, saturated lines turn to mush.
"""

from __future__ import annotations

import re
from typing import Any

from manim import Text, config

# --- palette ---------------------------------------------------------------

#: Page background. Near-black, but with enough blue that white text has a visible edge.
BG = "#10141c"
#: Primary text.
INK = "#f2f5fa"
#: Secondary text, captions, de-emphasised labels.
MUTED = "#98a4b8"
#: The one colour that means "this is the thing to look at".
ACCENT = "#4d9cff"
#: Structural lines (panel borders, dividers).
GRID = "#2b3446"
OK = "#3fbf7f"
WARN = "#f0a23c"
BAD = "#ef5f6b"

#: Categorical fill/stroke colours, in the order diagrams should reach for them.
COLORS = ("#4d9cff", "#3fbf7f", "#f0a23c", "#b07cff", "#ef5f6b", "#37c2d0")

#: Latin typeface. `None` means "leave it to Pango", which is the right answer:
#: naming a font that is not installed makes Pango fall back *silently* — the
#: render succeeds and the log says `couldn't load font "DejaVu Sans"`,
#: which is how a whole video ends up in a typeface nobody chose.
FONT_LATIN: str | None = None
#: CJK typeface. Microsoft YaHei on Windows; Pango resolves the family name.
FONT_ZH = "Microsoft YaHei"

_CJK = re.compile(r"[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]")


def font_for(source: str) -> str | None:
    """Pick the typeface for a string, preferring CJK when it contains any.

    Mixed strings are the common case ("MaskDiff 方法概览"). The CJK face
    renders the Latin part acceptably; the Latin face renders the CJK part as a
    row of tofu boxes, and does it without failing. So one CJK character decides
    the whole string.
    """
    return FONT_ZH if _CJK.search(source or "") else FONT_LATIN


def text(source: str, size: float = 32, color: str = INK, **kwargs: Any) -> Text:
    """`Text` with the right typeface chosen for `source`.

    Pass `font=` to override. Everything else is forwarded to `Text`.
    """
    font = kwargs.pop("font", font_for(source))
    if font:
        kwargs["font"] = font
    kwargs.setdefault("color", color)
    return Text(source, font_size=size, **kwargs)


def theme(background: str = BG) -> None:
    """Apply the house background to manim's global config.

    Called by the driver before rendering. Scene files do not need it; it exists
    so that `manim` run by hand from the venv still gets the same look, via
    `python -c "import manimkit; manimkit.theme()"`.
    """
    config.background_color = background
