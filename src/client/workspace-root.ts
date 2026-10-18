/**
 * Which workspace the panel is in.
 *
 * The answer already exists in the client: `ctx.workspaces` holds the shell's
 * workspace rows, and each row lists the sessions that live under it
 * (`WorkspaceView.sessionIds`), while `ctx.sessions.list.getSnapshot().current`
 * names the session on screen. Intersecting the two is exact — no directory
 * guessing, and no question for the user.
 *
 * Why not the session's `cwd`: the list is projected from persisted headers and
 * `cwd` is optional there, so a perfectly open session can carry no directory at
 * all. That is what kept producing "pick a workspace" over an open project.
 *
 * Both services are read through `ctx.inject`, so a shell without them simply
 * never calls back and the older fallbacks still apply.
 *
 * @module dsh-manim/client/workspace-root
 */

/** Latest root derived from the shell ('' when unknown). */
let detected = ''

/** Subscribers that re-render when the derivation changes. */
const listeners = new Set<() => void>()

/** The shell-derived root, '' when there is none. */
export function detectedWorkspaceRoot(): string {
  return detected
}

/** Subscribe to changes of the derived root. */
export function subscribeWorkspaceRoot(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Publish only real changes. */
function publish(next: string): void {
  if (next === detected) return
  detected = next
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // One broken subscriber must not take the rest down.
    }
  }
}

/** The slice of a workspace row this module reads. */
interface WorkspaceRow {
  path?: unknown
  title?: unknown
  sessionIds?: unknown
}

/** The slice of the sessions list store this module reads. */
interface SessionsStore {
  getSnapshot?: () => { current?: unknown; byId?: unknown }
  subscribe?: (listener: () => void) => unknown
}

/** The slice of `ctx.workspaces` this module reads. */
interface WorkspacesService {
  list?: {
    getSnapshot?: () => { items?: unknown }
    subscribe?: (listener: () => void) => unknown
  }
}

/** Strings only. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The session id currently on screen. */
function currentSessionId(sessions: SessionsStore | undefined): string {
  try {
    return text(sessions?.getSnapshot?.().current)
  } catch {
    return ''
  }
}

/** A directory a session records, when the shell exposes one at all. */
function sessionCwd(sessions: SessionsStore | undefined, id: string): string {
  try {
    const byId = sessions?.getSnapshot?.().byId as Record<string, { cwd?: unknown }> | undefined
    if (byId === undefined || id === '') return ''
    return text(byId[id]?.cwd)
  } catch {
    return ''
  }
}

/** Pick the workspace the given session belongs to. */
function derive(workspaces: WorkspacesService | undefined, sessions: SessionsStore | undefined): string {
  let rows: WorkspaceRow[] = []
  try {
    const items = workspaces?.list?.getSnapshot?.().items
    if (Array.isArray(items)) rows = items as WorkspaceRow[]
  } catch {
    return ''
  }
  if (rows.length === 0) return ''

  const id = currentSessionId(sessions)
  if (id !== '') {
    const owner = rows.find((row) => Array.isArray(row.sessionIds) && row.sessionIds.includes(id))
    const path = text(owner?.path)
    if (path !== '') return path
  }

  // No session match: a directory the session records is still authoritative.
  const cwd = sessionCwd(sessions, id).replaceAll(String.fromCharCode(92), '/').replace(/\/+$/, '')
  if (cwd !== '') {
    const inside = rows.find((row) => {
      const path = text(row.path).replaceAll(String.fromCharCode(92), '/').replace(/\/+$/, '')
      return path !== '' && (cwd === path || cwd.startsWith(`${path}/`))
    })
    const found = text(inside?.path)
    if (found !== '') return found
  }

  // One workspace is unambiguous.
  if (rows.length === 1) return text(rows[0]?.path)
  return ''
}

/**
 * Follow the derived root for as long as the shell keeps reporting it.
 *
 * @param ctx - client root context.
 * @param sessions - the session list store the panel already subscribes to.
 */
export function registerWorkspaceDetection(ctx: unknown, sessions?: SessionsStore): void {
  const runtime = ctx as {
    inject?: (names: string[], callback: (scope: Record<string, unknown>) => unknown) => unknown
  }
  if (typeof runtime.inject !== 'function') return
  try {
    runtime.inject(['workspaces'], (scope) => {
      const workspaces = scope.workspaces as WorkspacesService | undefined
      const update = (): void => { publish(derive(workspaces, sessions)) }
      update()
      for (const source of [workspaces?.list, sessions]) {
        if (source !== undefined && typeof source.subscribe === 'function') {
          try {
            source.subscribe(update)
          } catch {
            // A store that refuses the subscription still leaves the first read.
          }
        }
      }
    })
  } catch {
    // No workspace service in this shell: the host fallbacks still apply.
  }
}
