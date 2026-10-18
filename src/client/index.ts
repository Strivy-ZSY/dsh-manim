/**
 * dsh-manim, browser half: the 动画工作室 as a **tab of the right sidebar**,
 * plus the sidebar row that opens it.
 *
 * Host communication goes over the `/dsh-manim` HTTP routes via plain `fetch` —
 * no typert remote machinery (the family pattern: dsh-drawio, dsh-ssh, dsh-ppt
 * and dsh-aionui-panel do the same). Failure policy: DOM mounting problems are
 * logged, never thrown — an external plugin must not take the web GUI down.
 *
 * This entry is a `.ts` on purpose (the build's client entry point is
 * `src/client/index.ts`): every surface that needs JSX lives in its own `.tsx`,
 * so the plugin body stays a plain registration script.
 *
 * @module dsh-manim/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { StudioApi, type StudioRemote } from './api.ts'
import { registerManimStudio } from './panel-row.tsx'
import { registerVideoPreview } from './video-preview.tsx'
import { registerWorkspaceDetection } from './workspace-root.ts'
import { Studio, StudioView } from './studio.tsx'
import { EN, ZH } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Studio surface copy. */
    'manim': string
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'manim'

/** Plugin name: matches the package name, the graph row id and the bundle id. */
export const name = 'dsh-manim'

/** Services the surfaces read. */
export const inject = ['slots', 'locale', 'sessions', 'sidebarRight', 'sidebarRightTabs']

/** This implementation's identity in the tab system, and its body's seat key. */
export const MANIM_ID = 'dsh-manim'

/** The page kind this plugin owns; a tab is opened by kind, not by address. */
export const MANIM_KIND = 'manim'

/**
 * Re-exported so the panel's markup can be rendered and asserted on its own
 * (`tools/check-panel-markup.mjs`).
 *
 * The container needs a session store and a live route to show anything, and
 * effects do not run under server rendering — so a harness that could only reach
 * the registered body would see the loading line and nothing else, which is
 * exactly the trap dsh-ppt's preview harness fell into first.
 */
export { Studio, StudioView }
export type { SessionListStore, StudioViewProps } from './studio.tsx'

/** Bind one workspace root to a fresh API client (rebuilt on session switch). */
function makeApi(root: string): StudioRemote {
  return new StudioApi(root)
}

/**
 * Browser plugin body: the dictionary and the 动画工作室 surfaces.
 *
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-manim: dictionaries')
  registerManimStudio(ctx, { makeApi, id: MANIM_ID, kind: MANIM_KIND, locale: NS })
  // Rendered .mp4 files are ours, and the shell's own preview set has no video
  // renderer: without this, clicking one opens an empty tab. A shell without the
  // document-preview service must not lose the studio over it — activation
  // failures are fatal to startup (crash-*.log: "dsh-manim: failed").
  // Which workspace is open is the shell's fact, not something to ask the user.
  try {
    registerWorkspaceDetection(ctx)
  } catch (error) {
    console.warn('[dsh-manim] workspace detection skipped:', error)
  }
  try {
    registerVideoPreview(ctx)
  } catch (error) {
    console.warn('[dsh-manim] video preview skipped:', error)
  }
}
