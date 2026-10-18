"""The furniture every explainer clip ends up rebuilding by hand.

These are deliberately small and few. Each one earns its place by removing a
decision that is otherwise re-made (differently) in every scene — a caption bar
that is a different height in every shot reads as carelessness, and a video whose
blocks are laid out ad hoc looks worse than its content deserves.

Nothing here sets a global or animates anything; every function returns a
mobject you position and play yourself.
"""

from __future__ import annotations

from typing import Any

from manim import (
    DOWN,
    LEFT,
    RIGHT,
    UP,
    Arrow,
    Group,
    Line,
    RoundedRectangle,
    VGroup,
    config,
)

from .theme import ACCENT, BG, GRID, INK, MUTED, text


def caption(
    source: str,
    size: float = 28,
    width: float | None = None,
    color: str = INK,
    bar: str = BG,
    opacity: float = 0.85,
    position: Any = None,
) -> VGroup:
    """A sentence pinned near the bottom edge, on its own bar.

    The bar is what makes a caption readable over a busy frame, and the fixed
    default width is what stops the camera from appearing to jump when the
    caption text changes between beats.
    """
    label = text(source, size=size, color=color)
    bar_width = width if width is not None else config.frame_width - 1.4
    box = RoundedRectangle(
        corner_radius=0.14,
        width=bar_width,
        height=label.height + 0.44,
        stroke_width=0,
        fill_color=bar,
        fill_opacity=opacity,
    )
    group = VGroup(box, label)
    # Keep the caption inside the safe area: a bar touching the frame edge gets
    # clipped by players that letterbox non-standard aspect ratios.
    if position is None:
        position = DOWN * (config.frame_height / 2 - 0.55)
    group.move_to(position)
    return group


def panel(
    content: Any,
    title: str | None = None,
    color: str = ACCENT,
    fill: str = BG,
    fill_opacity: float = 0.6,
    pad_x: float = 0.34,
    pad_y: float = 0.26,
) -> Group:
    """Wrap a mobject in a titled, rounded box — the architecture-diagram block.

    `color` tints the border only; a saturated fill would fight with whatever is
    drawn inside. The title rides on the top edge so the box stays compact.

    `Group`, not `VGroup`: `content` is typed `Any`, and one of the things scenes
    legitimately put in a panel is a `mathtex()` formula — which is an
    `ImageMobject`, and `VGroup.add` rejects any non-`VMobject` with
    "Only values of type VMobject can be added as submobjects". `Group` accepts
    both, and costs nothing here: nothing in this module relies on `VGroup`'s
    vector-only behaviour.
    """
    box = RoundedRectangle(
        corner_radius=0.16,
        width=content.width + pad_x * 2,
        height=content.height + pad_y * 2,
        stroke_color=color,
        stroke_width=2.5,
        fill_color=fill,
        fill_opacity=fill_opacity,
    )
    box.move_to(content.get_center())
    group = Group(box, content)
    if title:
        label = text(title, size=22, color=color)
        label.move_to(box.get_top())
        label.add_background_rectangle(color=BG, opacity=1, buff=0.08)
        group.add(label)
    return group


def chip(source: str, color: str = ACCENT, size: float = 22) -> VGroup:
    """A small pill label — for tags on a block, or a step number.

    The text stays `INK` while the pill carries the colour: accent-coloured
    glyphs at this size read as washed out on a dark frame, and the pill is
    already doing the colour coding.
    """
    label = text(source, size=size, color=INK)
    pill = RoundedRectangle(
        corner_radius=0.5,
        width=label.width + 0.36,
        height=label.height + 0.2,
        stroke_color=color,
        stroke_width=2,
        fill_color=color,
        fill_opacity=0.16,
    )
    pill.move_to(label)
    return VGroup(pill, label)


def arrow(
    start: Any,
    end: Any,
    color: str = MUTED,
    buff: float = 0.12,
    stroke_width: float = 4,
) -> Arrow:
    """An arrow between two mobjects, with the buff that keeps heads visible.

    Anchors are chosen from the pair's relative position, so the same call works
    for a row of blocks and for a column of them. An arrow drawn on the
    straight line between centres disappears into the boxes it connects — which
    is why this always leaves from an edge.
    """
    offset = end.get_center() - start.get_center()
    horizontal = abs(offset[0]) >= abs(offset[1])
    if horizontal:
        tip = RIGHT if offset[0] >= 0 else LEFT
        tail = -tip
    else:
        tip = UP if offset[1] >= 0 else DOWN
        tail = -tip
    # `tip` points from start towards end, so the arrow leaves start's *far*
    # edge and lands on end's *near* one. Swapping these draws the arrow
    # backwards, straight through both boxes.
    return Arrow(
        start.get_edge_center(tip),
        end.get_edge_center(tail),
        buff=buff,
        color=color,
        stroke_width=stroke_width,
        max_tip_length_to_length_ratio=0.12,
    )


def underline(mobject: Any, color: str = ACCENT, stroke_width: float = 5) -> Line:
    """A short accent rule under a title, sized to the text, not to the frame."""
    rule = Line(
        LEFT * (mobject.width / 2),
        RIGHT * (mobject.width / 2),
        color=color,
        stroke_width=stroke_width,
    )
    rule.next_to(mobject, DOWN, buff=0.12)
    return rule


def section_title(source: str, kicker: str | None = None, size: float = 48) -> VGroup:
    """The title treatment for a new section: an optional kicker, a title, a rule.

    The kicker is the small upper label ("第 2 步") and exists because a bare
    title gives the viewer no sense of where they are in the argument.
    """
    title = text(source, size=size, color=INK)
    group = VGroup(title)
    if kicker:
        tag = text(kicker, size=24, color=ACCENT)
        tag.next_to(title, UP, buff=0.18)
        group.add(tag)
    group.add(underline(title))
    return group
