/**
 * The 动画工作室's shell seats: the tab type, the tab body and the sidebar row.
 *
 * Three registrations, each solving one thing the shell does not offer directly:
 *
 * 1. **The tab type** (`sidebarRightTabs`) — a page kind the right sidebar can
 *    open by name, with a 开始 capsule so the studio is reachable from the guide.
 * 2. **The tab body** — the body seat, plus a chip seat so the tab strip shows
 *    the studio's own mark before its title.
 * 3. **The sidebar row** (`sidebar.panellist`) — registered through the shell's
 *    own slot so the row inherits its markup, colours, tooltip, `rail-in`
 *    animation and collapsed behaviour. The one thing the shell cannot know is
 *    that this row lives in a *right-sidebar tab*, so the row's own
 *    `selectPanel(id)` handler — whose panel id nothing renders — is a dead end.
 *    The click is therefore taken off the ROW, before React's root sees it, and
 *    turned into `openTab`.
 *
 * @module dsh-manim/client/panel-row
 */

import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { Studio, type SessionListStore } from './studio.tsx'
import { StudioMark, StudioRailGlyph } from './panel-icon.tsx'
import { StudioTabTitle } from './tab-title.tsx'
import { t } from './i18n.ts'
import type { StudioRemote } from './api.ts'
import { PanelBoundary, useMountReport } from './error-boundary.tsx'

/** What the seats need from the plugin body. */
export interface StudioSeats {
  /** Binds one workspace root to a fresh API client. */
  makeApi: (root: string) => StudioRemote
  /** The tab system id, the body seat key, and the tab type's kind. */
  id: string
  kind: string
  /** The locale namespace the shell passes to the tab body. */
  locale: string
}

/** The tab body: a flex column that hands the width and height straight to the panel. */
function StudioPane({ makeApi, sessions }: { makeApi: (root: string) => StudioRemote; sessions: SessionListStore }): JSX.Element {
  return (
    <div
      data-dsh-manim-pane-host=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 'auto',
        height: '100%',
        minHeight: '0',
        minWidth: '0',
        overflow: 'hidden',
      }}
    >
      <Studio makeApi={makeApi} sessions={sessions} />
    </div>
  )
}

/** Props the shell passes to a `sidebar.panellist` entry. */
interface PanelIconProps {
  /** 16px while the sidebar is wide, 18px on the collapsed rail. */
  size?: number
  /** Whether this row's panel is the selected one (never true for a tab). */
  active?: boolean
}

/**
 * Build the glyph component for the 动画 row.
 *
 * @param open - opens (or focuses) the studio tab in the right sidebar.
 * @returns the component to register under the `sidebar.panellist` slot.
 */
export function makePanelIcon(open: () => void): (props: PanelIconProps) => JSX.Element {
  return function ManimPanelIcon({ size = 16 }: PanelIconProps): JSX.Element {
    const host = useRef<HTMLSpanElement>(null)

    useEffect(() => {
      const row = host.current?.closest('button')
      if (row === null || row === undefined) return
      /** Swallow the row's own `selectPanel` and open the tab instead. */
      const onClick = (event: MouseEvent): void => {
        event.stopPropagation()
        open()
      }
      row.addEventListener('click', onClick)
      return () => {
        row.removeEventListener('click', onClick)
      }
    }, [open])

    // `display: contents` keeps the SVG the flex child of the shell's
    // `.panelGlyph` box; this element exists only to reach the row.
    return (
      <span ref={host} style={{ display: 'contents' }}>
        <StudioRailGlyph size={size} />
      </span>
    )
  }
}

/**
 * Register the three shell seats.
 *
 * @param ctx - the client plugin context.
 * @param seats - the API binder and the tab identity.
 */
export function registerManimStudio(ctx: ClientContext, seats: StudioSeats): void {
  const { makeApi, id, kind, locale } = seats

  // The right sidebar owns the dock, the tab chrome, the column width, the
  // fullscreen toggle and the collapse behaviour, so the studio is a tab in it
  // rather than a grid column of our own: it shares the dock with the built-in
  // 文件 tab and inherits all of the shell's own behaviour.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id,
    kind,
    priority: 'extension',
    title: () => t('tab.label'),
    // 开始 (the guide page) lists one capsule per registered type; without this
    // entry the studio simply does not exist there. The capsule wears the right
    // sidebar's dialect — the colour variant at the family's 26px — while the
    // rail row above wears the monochrome one.
    guide: [{
      order: 40,
      title: () => t('guide.title'),
      description: () => t('guide.description'),
      icon: ({ className }: { className?: string }) => <StudioMark size={26} className={className} />,
    }],
  }), 'dsh-manim: tab type')

  /** Open (or focus) the studio tab; a no-op while no session surface is mounted. */
  const openStudio = (): void => {
    try {
      ctx.sidebarRight.openTab(kind)
    } catch (error) {
      console.error('[dsh-manim] openTab failed:', error)
    }
  }

  // The tab body. A closure rather than a module-level component so the API
  // binder and the session store ride along.
  // Same trap as `documentPreviews`: an uninjected service throws on read.
  let sessions: SessionListStore | undefined
  try {
    sessions = ctx.sessions.list as unknown as SessionListStore
  } catch {
    sessions = undefined
  }
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: id,
    locale,
  }, function ManimPane(): JSX.Element {
    // A thrown body renders as an empty pane in the shell, which is
    // indistinguishable from "the plugin does nothing". Keep the failure visible.
    useMountReport('动画工作室')
    return (
      <PanelBoundary where="动画工作室">
        <StudioPane makeApi={makeApi} sessions={sessions} />
      </PanelBoundary>
    )
  })), 'dsh-manim: 动画工作室 tab body')

  // The chip's content: the mark *and the title* — the seat renders only what
  // this component returns, so leaving the title out gives a wordless chip.
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: id,
  }, StudioTabTitle)), 'dsh-manim: 动画工作室 tab title')

  // The sidebar row. Order decides the row's position: the shell sorts
  // `sidebar.panellist` entries by `order` ascending, and 使用统计 registers at
  // 30 — sitting at 25 puts 动画 between the 工作台 (20) and it.
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id,
    order: 25,
    label: () => t('entry.label'),
    locale,
  }, makePanelIcon(openStudio))), 'dsh-manim: sidebar row')
}
