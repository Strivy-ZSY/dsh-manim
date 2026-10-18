/**
 * The 动画工作室 mark — one drawing, two of the shell's icon dialects.
 *
 * ## Why two dialects
 *
 * The shell draws icons in two families, and using the wrong one makes a row
 * look like a foreign object next to its neighbours:
 *
 * - **Chrome** — the left rail (`sidebar.panellist`): monochrome stroke in
 *   `currentColor`, so the shell can repaint it for idle / hover / selected /
 *   collapsed. A hard-coded colour here would be the one row that ignores the
 *   theme. The 24×24 grid, 2px stroke and round joins are the family's.
 * - **Colour** — the right sidebar, i.e. the tab chip *and* the 开始 guide
 *   capsule: the file-type family's construction, "one rounded solid body in the
 *   category colour plus the detail marks in `--dsw-static-neutral-00`".
 *
 * ## Why violet
 *
 * The 开始 page lists every registered type's capsule side by side, so the tint
 * has to stay distinguishable *in that row*: the built-in 文件 is the family's
 * blue, the 画板 is amber, the PPT 工作台 is red, the 浏览器 is a deeper blue, the
 * 终端 is near-black, 记忆 is green. Violet is the one hue in the family's set
 * still unclaimed, and it is also the family's own default for an unknown
 * category — which is the honest reading of a plugin the shell has never heard
 * of.
 *
 * ## The shape
 *
 * A screen with a play mark: the shortest way to say "video", and the two shapes
 * (rounded plate + triangle) stay legible at 16px in the tab chip, which is the
 * size that decides. The back sheet is the family's layered idiom, and like the
 * PPT mark's it is deliberately allowed to vanish below ~18px rather than turn
 * into a stray nub beside the frame.
 *
 * @module dsh-manim/client/panel-icon
 */

import type { CSSProperties, JSX } from 'react'
import styles from './studio.module.css'

/** Geometry in the chrome variant's 24×24 box — the rail family's own grid. */
const CHROME_VIEWBOX = '0 0 24 24'
/** Geometry in the colour variant's 28×28 box — the file-type family's grid. */
const COLOR_VIEWBOX = '0 0 28 28'

/** The mark's tint in the file-type dialect. */
const STUDIO_VIOLET = '#8b5cf6'

/**
 * The chrome dialect: one rounded frame with a play mark inside.
 *
 * The frame spans x 2.6→21.4, y 3.4→20.6 — the same 18.8-unit horizontal extent
 * the 使用统计 hint and the 画板 use. That is not cosmetic: `svg` width/height is
 * the *viewBox* size, not the ink size, so a mark drawn smaller inside its box
 * reads as a smaller icon at the same `size`, which is exactly the bug the PPT
 * mark shipped once and had to be measured to find.
 *
 * @returns the rail's group of paths.
 */
function ChromePaths(): JSX.Element {
  return (
    <>
      {/* The screen. rx 2.4 on a 17.2-tall frame keeps the ~15% radius the
          family's other frames use. */}
      <path d="M5 3.4h14a2.4 2.4 0 0 1 2.4 2.4v12.4a2.4 2.4 0 0 1-2.4 2.4H5a2.4 2.4 0 0 1-2.4-2.4V5.8A2.4 2.4 0 0 1 5 3.4Z" />
      {/* The play mark, optically centred (a triangle's visual centre sits left
          of its bounding box's, so the shape is nudged right of the frame's). */}
      <path d="M10.1 9.3 15.6 12.6 10.1 15.9Z" strokeWidth="2.2" strokeLinejoin="round" />
    </>
  )
}

/**
 * The colour dialect: the family's layered plate, with the play mark knocked out
 * in the neutral.
 *
 * @returns the body in `currentColor` and the mark in the neutral.
 */
function ColorPaths(): JSX.Element {
  return (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
        {/* The back sheet: an open rounded corner above and to the right, read
            as a second frame at 26px and as nothing at all below ~18px. */}
        <path d="M9.6 4.2h11.2a3.4 3.4 0 0 1 3.4 3.4v2.2" />
      </g>
      <path
        d="M5.6 6.6h16.8a3.2 3.2 0 0 1 3.2 3.2v8.6a3.2 3.2 0 0 1-3.2 3.2H5.6a3.2 3.2 0 0 1-3.2-3.2v-8.6a3.2 3.2 0 0 1 3.2-3.2Z"
        fill="currentColor"
      />
      <g color="var(--dsw-static-neutral-00)" data-dsh-manim-mark="">
        <path d="M11.4 9.9 18 14l-6.6 4.1Z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </g>
    </>
  )
}

/**
 * The 动画工作室 mark.
 *
 * @param props - `size` follows the shell's own sizing: 16px on a wide sidebar,
 *   18px on the collapsed rail, 16px in a tab chip, 26px in the 开始 guide's
 *   capsule. `variant` picks the dialect — `chrome` (monochrome stroke, the left
 *   rail) or `color` (the rounded file-type mark, the right sidebar).
 * @returns the glyph element.
 */
export function StudioGlyph({
  size = 16,
  variant = 'chrome',
  className,
}: {
  size?: number
  variant?: 'chrome' | 'color'
  className?: string
}): JSX.Element {
  const merged = className ?? ''
  const color = variant === 'color'
  const base = color ? styles.studioMark : styles.railMark
  const classes = merged === '' ? base : `${merged} ${base}`

  return (
    <svg
      viewBox={color ? COLOR_VIEWBOX : CHROME_VIEWBOX}
      width={size}
      height={size}
      className={classes}
      fill="none"
      {...(color
        ? {}
        : { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      data-dsh-manim-glyph=""
      data-dsh-manim-variant={variant}
    >
      {color ? <ColorPaths /> : <ChromePaths />}
    </svg>
  )
}

/**
 * The colour dialect at a placement, with the family tint forced to violet.
 *
 * `display: contents` keeps the SVG the flex child of whatever box the shell put
 * it in — the chip's mark and the guide capsule's — the way the shell's own file
 * glyphs do it. Without the wrapper the mark comes out in the family's default
 * for an unknown category.
 *
 * @param props.size - rendered edge length.
 * @param props.className - the seat's placement class.
 * @returns the tinted mark.
 */
export function StudioMark({ size = 26, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <span style={{ display: 'contents', '--dsh-file-type-icon-color': STUDIO_VIOLET } as CSSProperties}>
      <StudioGlyph size={size} variant="color" className={className} />
    </span>
  )
}

/**
 * The rail-row placement: the monochrome dialect at the shell's own size.
 *
 * @param props - the shell's `sidebar.panellist` icon props.
 * @returns the rail glyph.
 */
export function StudioRailGlyph({ size = 16 }: { size?: number }): JSX.Element {
  return <StudioGlyph size={size} variant="chrome" />
}
