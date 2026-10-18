/**
 * Shell icons, resolved by capability rather than by import name.
 *
 * The shell's primitive package is not one API across builds: the desktop build
 * this plugin was developed against exports `IconPlayOutline16`-style names, and
 * the official build exports `IconPlayOutlineRegular`-style names. A static
 * `import { IconPlayOutline16 }` therefore binds to `undefined` on the other
 * build, and React renders that as error #130 — "element type is invalid" — with
 * nothing in the message naming the icon.
 *
 * So: resolve from the module namespace, try each known spelling, and draw a
 * glyph ourselves if none of them exist. The fallback is deliberately dumb — it
 * is the difference between "one icon looks generic" and "the panel is blank".
 *
 * @module dsh-manim/client/icons
 */

import type { ComponentType, JSX, MouseEventHandler, ReactNode } from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

/** Props every shell icon takes. */
export interface GlyphProps {
  className?: string
}

/** The namespace as a lookup table. */
const TABLE = primitives as unknown as Record<string, unknown>

/** Draw a rounded square; stands in for any icon this build does not ship. */
function FallbackGlyph({ className }: GlyphProps): JSX.Element {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="4.5" y="4.5" width="7" height="7" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/** Names this build had to substitute, reported once through the panel's log. */
export const MISSING_ICONS: string[] = []

/** Resolve the first spelling this build actually exports. */
function candidate(names: readonly string[]): ComponentType<GlyphProps> {
  for (const name of names) {
    const value = TABLE[name]
    if (typeof value === 'function' || (value !== null && typeof value === 'object')) {
      return value as ComponentType<GlyphProps>
    }
  }
  MISSING_ICONS.push(names[0] ?? '(unknown)')
  return FallbackGlyph
}

/** A chevron pointing down (dropdown affordance). */
export const IconChevronDown = candidate(['IconChevronDownOutline14', 'IconChevronDownOutlineRegular'])
/** Download (save the finished film). */
export const IconDownload = candidate(['IconDownloadOutline16', 'IconDownloadOutlineRegular'])
/** Open a file (the scene picker). */
export const IconFolderOpen = candidate([
  'IconFolderOpenOutline16',
  'IconFolderOpenOutlineRegular',
  'IconBrowseOutlineRegular',
])
/** Busy spinner shown while a render runs. */
export const IconLoading = candidate(['IconLoadingOutline16', 'IconLoadingOutlineRegular'])
/** Start a render. */
export const IconPlay = candidate(['IconPlayOutline16', 'IconPlayOutlineRegular'])
/** New scene. */
export const IconPlus = candidate(['IconPlusOutline16', 'IconPlusOutlineRegular'])
/** Re-scan the workspace. */
export const IconRefresh = candidate(['IconRefreshOutline16', 'IconRefreshOutlineRegular'])
/** Cancel the running render. */
export const IconStop = candidate(['IconStopFill16', 'IconStopFillRegular', 'IconStopOutlineRegular'])

/*
 * The two components the panel cannot do without are resolved the same way.
 *
 * Both exist in every build seen so far, but a missing `Button` is the same #130
 * as a missing icon, and the failure is total rather than cosmetic. The
 * stand-ins keep the panel usable and visibly plainer instead of blank.
 */

/** Props the panel passes to the shell's Button. */
export interface ShellButtonProps {
  children?: ReactNode
  icon?: ReactNode
  size?: string
  variant?: string
  title?: string
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
  className?: string
}

/** Props the panel passes to the shell's Menu (a dropdown anchored to a trigger). */
export interface ShellMenuProps {
  open?: boolean
  anchor?: ReactNode
  items?: readonly unknown[]
  selectedId?: string
  onSelect?: (id: string) => void
  portal?: boolean
  getAnchorRect?: () => unknown
  [key: string]: unknown
}

function PlainButton({ children, icon, title, disabled, onClick, className }: ShellButtonProps): JSX.Element {
  return (
    <button type="button" className={className} title={title} disabled={disabled} onClick={onClick}>
      {icon}
      {children}
    </button>
  )
}

/** The trigger alone: without the shell's overlay there is nothing to anchor to. */
function PlainMenu({ anchor }: ShellMenuProps): JSX.Element {
  return <>{anchor}</>
}

/** The shell's Button, or a plain one. */
export const ShellButton: ComponentType<ShellButtonProps> =
  typeof TABLE.Button === 'function' ? (TABLE.Button as ComponentType<ShellButtonProps>) : PlainButton

/** The shell's Menu, or just its trigger. */
export const ShellMenu: ComponentType<ShellMenuProps> =
  (typeof TABLE.Menu === 'function' || (TABLE.Menu !== null && typeof TABLE.Menu === 'object'))
    ? (TABLE.Menu as ComponentType<ShellMenuProps>)
    : PlainMenu
