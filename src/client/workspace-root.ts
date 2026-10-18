/**
 * The workspace the shell currently has open, read through its own service.
 *
 * The panel used to derive this from the session list, then from a host lookup by
 * session id, and asked the user to pick when both came back empty — which reads
 * as "the plugin does not know where I am" even though the shell does. The shell's
 * own selection is the authority; everything else is a fallback for shells that do
 * not offer it.
 *
 * The service is read through `ctx.inject`, so a shell without it simply never
 * calls back: no capability, no failure.
 *
 * @module dsh-manim/client/workspace-root
 */

/** Latest root the shell reported ('' when unknown). */
let detected = ''

/** Subscribers that re-render when the shell's selection changes. */
const listeners = new Set<() => void>()

/** The shell-reported root, '' when there is none yet. */
export function detectedWorkspaceRoot(): string {
  return detected
}

/** Subscribe to changes of the shell-reported root. */
export function subscribeWorkspaceRoot(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Publish a new root when it actually changed. */
function publish(next: string): void {
  if (next === detected) return
  detected = next
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // A broken subscriber must not break the others.
    }
  }
}

/** The path a workspace-ish value names, or ''. */
function pathOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  for (const key of ['path', 'root', 'directory', 'dir']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return ''
}

/** Best-effort read of the controller's current workspace selection. */
function readController(controller: unknown): string {
  if (controller === null || typeof controller !== 'object') return pathOf(controller)
  const record = controller as Record<string, unknown>
  // Shapes seen or plausible: a value, a getter, or state {current}.
  const direct = pathOf(record.current ?? record.selected ?? record.active ?? record.workspace)
  if (direct !== '') return direct
  for (const key of ['getCurrent', 'currentWorkspace', 'getSelected']) {
    const fn = record[key]
    if (typeof fn === 'function') {
      try {
        const value = pathOf((fn as () => unknown).call(controller))
        if (value !== '') return value
      } catch {
        // Try the next spelling.
      }
    }
  }
  const state = record.state
  if (state !== null && typeof state === 'object') {
    const nested = pathOf((state as Record<string, unknown>).current ?? (state as Record<string, unknown>).selected)
    if (nested !== '') return nested
  }
  // A selection expressed as an id: resolve it against the list.
  const id = record.currentId ?? record.selectedId
  const list = record.list
  if (typeof list === 'function') {
    try {
      const rows = (list as () => unknown).call(controller)
      if (Array.isArray(rows)) {
        const hit = typeof id === 'string'
          ? rows.find((row) => row !== null && typeof row === 'object' && (row as Record<string, unknown>).id === id)
          : rows[0]
        const value = pathOf(hit)
        if (value !== '') return value
      }
    } catch {
      // Fall through.
    }
  }
  return ''
}

/**
 * Follow the shell's current workspace, when the shell offers the service.
 *
 * @param ctx - client root context.
 */
export function registerWorkspaceDetection(ctx: unknown): void {
  const runtime = ctx as { inject?: (names: string[], callback: (scope: Record<string, unknown>) => unknown) => unknown }
  if (typeof runtime.inject !== 'function') return
  try {
    runtime.inject(['workspaceController'], (scope) => {
      const controller = scope.workspaceController
      const read = (): void => { publish(readController(controller)) }
      read()
      const record = controller as Record<string, unknown> | null
      for (const key of ['subscribe', 'onChange', 'on', 'watch']) {
        const fn = record?.[key]
        if (typeof fn === 'function') {
          try {
            ;(fn as (cb: () => void) => unknown).call(controller, read)
            break
          } catch {
            // Unsupported signature; polling is not worth it — the next mount re-reads.
          }
        }
      }
    })
  } catch {
    // No controller: the session/host fallbacks still apply.
  }
}
