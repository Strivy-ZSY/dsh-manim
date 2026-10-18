"""manimkit — the house style for explainer animations in DSH.

Scene files written for this plugin import from here, which keeps them short and
makes every video look like it came from the same studio:

    from manim import *
    from manimkit import *

    class HowItWorks(Scene):
        def construct(self):
            title = text("MaskDiff 一次采样", size=44)
            self.play(Write(title))
            self.play(FadeIn(caption("把重建误差当成扩散过程的起始噪声")))

Three modules, each solving one thing the raw library leaves to taste:

* :mod:`manimkit.theme` — the palette and the auto-picked CJK/Latin font.
* :mod:`manimkit.mathkit` — formulas without LaTeX (see the module docstring:
  this machine has no working LaTeX, and manim's `MathTex` needs it).
* :mod:`manimkit.layout` — caption bars, panels, chips and arrows.
* :mod:`manimkit.narration` — the voice track: `narration()` to add it,
  `hold()` to wait out a line so the picture and the voice stay in step.

Everything is a thin wrapper over manim; nothing here hides a global.
"""

from .theme import (
    ACCENT,
    BAD,
    BG,
    COLORS,
    FONT_LATIN,
    FONT_ZH,
    GRID,
    INK,
    MUTED,
    OK,
    WARN,
    font_for,
    text,
)
from .mathkit import has_latex, mathtex
from .layout import arrow, caption, chip, panel, section_title, underline
from .narration import cue, find_cue_sheet, hold, narration
