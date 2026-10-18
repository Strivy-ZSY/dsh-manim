/**
 * The tab chip's content for the 动画工作室 tab.
 *
 * The sidebar shell renders the chip from a slot so a tab can carry its own mark
 * before its title. **The title is part of what this component returns, not
 * something the shell appends** — the seat calls the component with the slot's
 * `useTabInfo` hook and renders only its output, so a title component that draws
 * a glyph and nothing else leaves the chip with no text at all. That is exactly
 * what dsh-ppt's first version did, and what the user reported ("展开没有文字").
 *
 * The chip wears the **colour** dialect of the mark, because the right sidebar is
 * the file-type icon family's territory; the left rail gets the monochrome one.
 * See `panel-icon.tsx`.
 *
 * @module dsh-manim/client/tab-title
 */

import type { JSX } from 'react'
import { StudioMark } from './panel-icon.tsx'
import styles from './studio.module.css'

/** The slice of `useTabInfo()`'s result this chip reads. */
interface TabInfo {
  tab: { title: string }
}

/** What the seat injects into a title component. */
export interface TabTitleProps {
  useTabInfo: () => TabInfo
}

/**
 * The chip content: the coloured mark at chip size, then the tab's own title.
 *
 * @param props - the seat's framework-bound tab reader.
 * @returns the chip's content.
 */
export function StudioTabTitle({ useTabInfo }: TabTitleProps): JSX.Element {
  const { tab } = useTabInfo()
  return (
    <>
      <StudioMark size={16} className={styles.titleIcon} />
      {tab.title}
    </>
  )
}
