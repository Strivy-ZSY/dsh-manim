/**
 * The 动画工作室 body: pick a scene, render it, watch it, look at the storyboard.
 *
 * Split into a **container** ({@link Studio}, which owns the state, the polling
 * and the API calls) and a **view** ({@link StudioView}, pure props → markup).
 * That split exists for one reason: the view can be rendered to a string with
 * fake data (`tools/check-panel-markup.mjs`), which is the only way to assert
 * "the panel is not blank, and the storyboard strip has one cell per frame"
 * without a browser. dsh-ppt's `.pptx` preview keeps the same split for the same
 * reason — and the bug that check caught there ("展开没有文字", a title component
 * returning only a glyph) is exactly the class of thing a type-checked,
 * correctly-wired component tree still gets wrong.
 *
 * Layout is a vertical stack rather than the two-pane arrangement a desktop app
 * would use, because the right sidebar is ~420px wide and full height — every
 * extra column costs the video width it does not have.
 *
 * Two behaviours are worth knowing before editing the container:
 *
 * * **Polling, not streaming.** A render is a Python process writing NDJSON that
 *   the host collects; the panel asks `/job` for the current picture every
 *   600 ms while a job is live. A stream would need a second transport for a
 *   payload that is one small object, and the shell's other panels poll too.
 * * **State survives a tab switch and a reload in a module-level cache.** The
 *   shell keeps every tab mounted now (patches/dockkit-tab-keepalive), so
 *   component state would survive a tab switch on its own; the cache is what
 *   makes the *selected scene and quality* survive a window reload.
 *
 * @module dsh-manim/client/studio
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, RefObject } from 'react'
import {
  Button,
  IconChevronDownOutline14,
  IconDownloadOutline16,
  IconFolderOpenOutline16,
  IconLoadingOutline16,
  IconPlayOutline16,
  IconPlusOutline16,
  IconRefreshOutline16,
  IconStopFill16,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Frame } from '../engine.ts'
import type { RenderRecord, SceneEntry } from '../service.ts'
import { ManimApiError, type JobView, type ListResult, type QualityOption, type StudioRemote, type WorkspaceRoot } from './api.ts'
import { formatDuration, t } from './i18n.ts'
import styles from './studio.module.css'

/**
 * Join CSS-module class names.
 *
 * The build compiles `*.css` as `local-css`, so a bare string in `className`
 * would be an unknown (and therefore unstyled) class. Every name in this file
 * goes through here instead, and the `keyof typeof styles` bound makes a typo a
 * compile error rather than a silently unstyled div.
 */
function cx(...names: Array<keyof typeof styles | false | null | undefined>): string {
  return names.filter((name): name is keyof typeof styles => typeof name === 'string').map((name) => styles[name]).join(' ')
}

/** The slice of the shell's session store this panel reads. */
export interface SessionListStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => { current?: string; byId: Record<string, { cwd?: string }> }
}

/** What the panel remembers across a tab switch or a window reload. */
interface StudioMemory {
  selected: string
  sceneClass: string | null
  quality: string | null
}

/**
 * Per-workspace panel memory.
 *
 * Bounded on purpose: a user with a dozen session workspaces should not
 * accumulate a dozen entries, and the oldest is the least likely to be wanted.
 */
const MEMORY = new Map<string, StudioMemory>()
const MEMORY_LIMIT = 6

/**
 * The workspace the user picked when the session carried no cwd.
 *
 * Module scope, not component state: the shell unmounts a panel when its tab is
 * closed, and re-opening the tab should not ask again.
 */
let chosenRoot = ''

/** Read (or create) the remembered state for a workspace. */
function memoryFor(root: string): StudioMemory {
  const existing = MEMORY.get(root)
  if (existing !== undefined) return existing
  const fresh: StudioMemory = { selected: '', sceneClass: null, quality: null }
  MEMORY.set(root, fresh)
  if (MEMORY.size > MEMORY_LIMIT) {
    const oldest = MEMORY.keys().next().value
    if (oldest !== undefined && oldest !== root) MEMORY.delete(oldest)
  }
  return fresh
}

/**
 * The current session's cwd, read defensively.
 *
 * `ctx.sessions.list` is not one shape across shells: the official desktop shell
 * and other shells expose the same idea under different field names, and a panel
 * that only understands one of them shows "no workspace" while a project is open.
 * Every known spelling is tried, and an unrecognised one returns '' — the caller
 * then falls back to the host's registered roots rather than guessing.
 */
function currentRoot(sessions: SessionListStore | undefined): string {
  if (sessions === undefined || typeof sessions.getSnapshot !== 'function') return ''
  let snapshot: unknown
  try {
    snapshot = sessions.getSnapshot()
  } catch {
    return ''
  }
  if (snapshot === null || typeof snapshot !== 'object') return ''
  const view = snapshot as Record<string, unknown>
  const pick = (value: unknown): string => (typeof value === 'string' && value !== '' ? value : '')

  // The current session object may itself be the snapshot's `current`.
  const current = view.current ?? view.currentId ?? view.activeId ?? view.active
  if (current !== null && typeof current === 'object') {
    const direct = pick((current as Record<string, unknown>).cwd)
    if (direct !== '') return direct
  }
  const id = typeof current === 'string' ? current : ''

  const byId = view.byId ?? view.sessions ?? view.items
  const fromMap = (): string => {
    if (byId === null || byId === undefined) return ''
    if (Array.isArray(byId)) {
      const hit = byId.find((row) => row !== null && typeof row === 'object'
        && pick((row as Record<string, unknown>).id ?? (row as Record<string, unknown>).sessionId) === id)
      return hit === undefined ? '' : pick((hit as Record<string, unknown>).cwd)
    }
    if (typeof byId !== 'object') return ''
    const hit = (byId as Record<string, unknown>)[id]
    if (hit !== null && typeof hit === 'object') return pick((hit as Record<string, unknown>).cwd)
    return ''
  }
  const mapped = fromMap()
  if (mapped !== '') return mapped

  // No usable current session: a single entry is unambiguous.
  const rows = Array.isArray(byId) ? byId : byId !== null && typeof byId === 'object' ? Object.values(byId as Record<string, unknown>) : []
  const cwds = rows
    .map((row) => (row !== null && typeof row === 'object' ? pick((row as Record<string, unknown>).cwd) : ''))
    .filter((cwd) => cwd !== '')
  return cwds.length === 1 ? cwds[0] : ''
}

/**
 * The selected session's id.
 *
 * Unlike `cwd`, this one is always on the list snapshot: the shaping code
 * validates `current` against the rows, and a session that has never been opened
 * still has an id. That makes it the reliable half of "which workspace am I in" —
 * the host turns the id into a directory through the workspace registry.
 */
function currentSessionId(sessions: SessionListStore | undefined): string {
  if (sessions === undefined || typeof sessions.getSnapshot !== 'function') return ''
  let snapshot: unknown
  try {
    snapshot = sessions.getSnapshot()
  } catch {
    return ''
  }
  if (snapshot === null || typeof snapshot !== 'object') return ''
  const view = snapshot as Record<string, unknown>
  for (const key of ['current', 'currentId', 'selected', 'activeId'] as const) {
    const value = view[key]
    if (typeof value === 'string' && value !== '') return value
    if (value !== null && typeof value === 'object') {
      const nested = (value as Record<string, unknown>).id ?? (value as Record<string, unknown>).sessionId
      if (typeof nested === 'string' && nested !== '') return nested
    }
  }
  return ''
}

/** Subscribe both halves of the session identity ('' for either when unknown). */
function useSession(sessions: SessionListStore | undefined): { root: string; id: string } {
  const [state, setState] = useState(() => ({ root: currentRoot(sessions), id: currentSessionId(sessions) }))
  useEffect(() => {
    if (sessions === undefined || typeof sessions.subscribe !== 'function') return
    return sessions.subscribe(() => setState({ root: currentRoot(sessions), id: currentSessionId(sessions) }))
  }, [sessions])
  return state
}

/** One row of the scene list. */
function SceneRow({
  entry,
  active,
  render,
  onSelect,
}: {
  entry: SceneEntry
  active: boolean
  render: RenderRecord | undefined
  onSelect: () => void
}): JSX.Element {
  return (
    <button type="button" className={cx('sceneRow', active && 'sceneRowActive')} onClick={onSelect}>
      <span className={cx('sceneName')}>{entry.rel}</span>
      <span className={cx('sceneMeta')}>
        {entry.scenes.join(', ')}
        <span className={cx('sceneDot')}>·</span>
        {render === undefined
          ? t('scene.never')
          : t('scene.rendered', { quality: render.quality, duration: formatDuration(render.duration) })}
      </span>
    </button>
  )
}

/** Everything {@link StudioView} renders from. */
export interface StudioViewProps {
  data: ListResult | null
  selected: string
  sceneClass: string | null
  quality: string | null
  job: JobView | null
  frames: Frame[]
  error: string | null
  busy: boolean
  showLog: boolean
  onSelect: (path: string) => void
  onSceneClass: (name: string) => void
  onQuality: (id: string) => void
  onRender: () => void
  onCancel: () => void
  onRefresh: () => void
  onStoryboard: () => void
  onNewScene: () => void
  onToggleLog: () => void
  frameUrl: (file: string) => string
  videoUrl: string | null
  onSeek: (time: number) => void
  videoRef: RefObject<HTMLVideoElement | null>
}

/**
 * The studio's markup, as a pure function of its props.
 *
 * @param props - state plus callbacks; see {@link StudioViewProps}.
 * @returns the panel element.
 */
export function StudioView(props: StudioViewProps): JSX.Element {
  const {
    data, selected, sceneClass, quality, job, frames, error, busy, showLog,
    onSelect, onSceneClass, onQuality, onRender, onCancel, onRefresh, onStoryboard,
    onNewScene, onToggleLog, frameUrl, videoUrl, onSeek, videoRef,
  } = props

  const entry = data?.scenes.find((scene) => scene.path === selected) ?? null
  const qualities = data?.qualities ?? []
  const activeQuality: QualityOption | undefined = qualities.find((option) => option.id === quality) ?? qualities[0]

  // The two dropdowns are the only piece of UI state the view owns — they are
  // transients of the shell's `Menu`, not part of the panel's remembered state.
  const [qualityOpen, setQualityOpen] = useState(false)
  const [fileOpen, setFileOpen] = useState(false)

  /**
   * Every finished render in this workspace, newest first.
   *
   * The scene list at the bottom is about *source files*; this is about
   * *artifacts*. Without it, watching a clip you rendered ten minutes ago means
   * finding its scene file in that list first — and a scene rendered at two
   * qualities appears once, so the other cut is effectively hidden.
   */
  const renders = useMemo(
    () =>
      (data?.scenes ?? [])
        .flatMap((scene) => scene.renders.map((render) => ({ render, rel: scene.rel })))
        .sort((a, b) => b.render.at - a.render.at),
    [data],
  )
  const currentRenderKey =
    entry === null || activeQuality === undefined
      ? ''
      : `${entry.path}|${activeQuality.id}|${sceneClass ?? ''}`

  const record = ((): RenderRecord | undefined => {
    if (entry === null) return undefined
    return (
      entry.renders.find((item) => item.quality === quality && (sceneClass === null || item.scene === sceneClass)) ??
      entry.renders.find((item) => item.quality === quality)
    )
  })()

  const liveJob = job !== null && job.path === selected ? job : null
  const running = liveJob !== null && liveJob.endedAt === null
  const progress = liveJob?.progress

  const statusText = ((): string => {
    if (liveJob === null) return ''
    switch (liveJob.state) {
      case 'planning':
        return t('render.planning')
      case 'rendering':
        return progress?.total == null
          ? t('render.stageUnknown', { done: progress?.done ?? 1 })
          : t('render.stage', { done: (progress?.done ?? 0) + 1, total: progress.total })
      case 'done':
        return t('render.done')
      case 'cancelled':
        return t('render.cancelled')
      default:
        return t('render.failed')
    }
  })()

  const percent = progress?.fraction == null ? null : Math.round(progress.fraction * 100)
  const remaining =
    progress !== undefined && progress.fraction !== null && progress.fraction > 0.02
      ? progress.elapsed / progress.fraction - progress.elapsed
      : null

  return (
    <div className={cx('studio')} data-dsh-manim-pane="">
      {data === null && error === null ? <div className={cx('notice')}>{t('panel.loading')}</div> : null}

      {/* toolbar — every control here is a shell primitive, so the panel wears
          the same capsule geometry, focus ring and hover as the panes next to
          it rather than a look-alike of its own. */}
      <div className={cx('toolbar')}>
        <Menu
          open={fileOpen}
          anchor={
            <Button
              size="sm"
              variant="ghost"
              icon={<IconFolderOpenOutline16 />}
              title={t('files.tip')}
              disabled={renders.length === 0}
              onClick={() => setFileOpen((open) => !open)}
            >
              {t('files.toggle')}
            </Button>
          }
          items={
            renders.length === 0
              ? [{ type: 'label', text: t('files.empty') } as const]
              : [
                  { type: 'label', text: t('files.title') } as const,
                  ...renders.map(({ render, rel }) => ({
                    id: `${render.sceneFile}|${render.quality}|${render.scene}`,
                    label: `${render.scene} · ${render.quality} · ${formatDuration(render.duration)}`,
                    // The scene file is what disambiguates two scenes that share
                    // a class name, and it is what the user recognises.
                    description: rel,
                  })),
                ]
          }
          selectedId={currentRenderKey}
          onSelect={(id) => {
            const [sceneFile, qualityId, sceneName] = String(id).split('|')
            if (sceneFile !== undefined && sceneFile !== '') onSelect(sceneFile)
            if (sceneName !== undefined && sceneName !== '') onSceneClass(sceneName)
            if (qualityId !== undefined && qualityId !== '') onQuality(qualityId)
            setFileOpen(false)
          }}
          onClose={() => setFileOpen(false)}
          portal
          align="start"
          className={cx('fileMenu')}
        />
        <Menu
          open={qualityOpen}
          anchor={
            <Button
              size="sm"
              variant="ghost"
              icon={<IconChevronDownOutline14 />}
              title={t('quality.draftHint')}
              disabled={qualities.length === 0}
              onClick={() => setQualityOpen((open) => !open)}
            >
              {activeQuality?.label ?? t('quality.label')}
            </Button>
          }
          items={qualities.map((option) => ({ id: option.id, label: option.label }))}
          selectedId={activeQuality?.id}
          onSelect={(id) => {
            onQuality(String(id))
            setQualityOpen(false)
          }}
          onClose={() => setQualityOpen(false)}
          portal
          align="start"
          className={cx('qualityMenu')}
        />
        <Button
          size="sm"
          variant="primary"
          icon={running ? <IconLoadingOutline16 /> : <IconPlayOutline16 />}
          onClick={onRender}
          disabled={busy || running || entry === null || sceneClass === null}
        >
          {running ? t('render.running') : t('render.start')}
        </Button>
        {running ? (
          <Button size="sm" variant="ghost" icon={<IconStopFill16 />} onClick={onCancel}>
            {t('render.cancel')}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className={cx('iconOnly')}
          icon={<IconRefreshOutline16 />}
          onClick={onRefresh}
          title={t('panel.refresh')}
          aria-label={t('panel.refresh')}
        />
      </div>

      {error !== null ? <div className={cx('error')}>{t('panel.error', { message: error })}</div> : null}

      {/*
        Two columns when the pane is wide enough, one when it is not — decided
        by `flex-wrap`, not by a width query, because "wide" is a property of the
        *sidebar* and a viewport media query cannot see it. A full-screen pane
        puts the storyboard beside the picture (where it was empty space); a
        419px sidebar stacks it underneath, which is the only thing that fits.
      */}
      <div className={cx('stage')} data-dsh-manim-stage="">
        <div className={cx('stageMain')}>
          {/* player */}
          <div className={cx('player')} data-dsh-manim-player="">
            {videoUrl === null ? (
              <div className={cx('playerEmpty')}>{t('render.noServe')}</div>
            ) : (
              // `key` forces a fresh element when the source changes: reusing the
              // element across two renders keeps the previous video's currentTime
              // and duration until the new metadata lands, which reads as the wrong
              // video for a moment.
              <video key={videoUrl} ref={videoRef} className={cx('video')} src={videoUrl} controls preload="metadata" />
            )}
          </div>

          {liveJob !== null ? (
            <div className={cx('status')} data-dsh-manim-status={liveJob.state}>
              <div className={cx('statusLine')}>
                <span className={liveJob.state === 'failed' ? cx('stateBad') : cx('stateOk')}>{statusText}</span>
                {progress !== undefined ? (
                  <span className={cx('muted')}>{t('render.elapsed', { time: formatDuration(progress.elapsed) })}</span>
                ) : null}
                {remaining !== null && running ? (
                  <span className={cx('muted')}>{t('render.remaining', { time: formatDuration(remaining) })}</span>
                ) : null}
                {liveJob.result !== null && liveJob.result.duration !== null ? (
                  <span className={cx('muted')}>{t('render.duration', { time: formatDuration(liveJob.result.duration) })}</span>
                ) : null}
              </div>
              {running ? (
                <div className={cx('bar')} data-dsh-manim-bar={percent === null ? 'indeterminate' : String(percent)}>
                  <div
                    className={cx('barFill', percent === null && 'barIndeterminate')}
                    style={percent === null ? undefined : { width: `${percent}%` }}
                  />
                </div>
              ) : null}
              {progress?.label ? <div className={cx('muted', 'ellipsis')}>{progress.label}</div> : null}
              {liveJob.error !== null && liveJob.error !== undefined ? (
                <div className={cx('error')}>{liveJob.error.message}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={cx('stageSide')}>
          {/* storyboard */}
          <div className={cx('section', 'sectionFlat')}>
            <div className={cx('sectionHead')}>
              <span className={cx('sectionTitle')}>{t('board.title')}</span>
              <span className={cx('muted')}>{t('board.hint')}</span>
              <Button
                size="sm"
                variant="ghost"
                icon={<IconDownloadOutline16 />}
                onClick={onStoryboard}
                disabled={busy || entry === null}
              >
                {busy ? t('board.generating') : t('board.generate')}
              </Button>
            </div>
            {frames.length === 0 ? (
              <div className={cx('muted', 'small')}>{t('board.empty')}</div>
            ) : (
              <div className={cx('board')} data-dsh-manim-board={frames.length}>
                {frames.map((frame) => (
                  <button
                    key={`${frame.time}-${frame.path}`}
                    type="button"
                    className={cx('boardCell')}
                    title={t('board.seek', { time: frame.time.toFixed(1) })}
                    onClick={() => onSeek(frame.time)}
                  >
                    <img className={cx('boardImg')} src={frameUrl(frame.path)} alt={`${frame.time.toFixed(1)}s`} loading="lazy" />
                    <span className={cx('boardTime')}>{frame.time.toFixed(1)}s</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* scene files */}
      <div className={cx('section')}>
        <div className={cx('sectionHead')}>
          <span className={cx('sectionTitle')}>{t('scene.title')}</span>
          <span className={cx('muted')}>{t('scene.count', { count: data?.scenes.length ?? 0 })}</span>
          <Button size="sm" variant="ghost" icon={<IconPlusOutline16 />} onClick={onNewScene} disabled={busy}>
            {busy ? t('scene.creating') : t('scene.new')}
          </Button>
        </div>
        {data !== null && data.scenes.length === 0 ? (
          <div className={cx('muted', 'small')}>{t('panel.emptyHint')}</div>
        ) : (
          <div className={cx('scenes')} data-dsh-manim-scenes={data?.scenes.length ?? 0}>
            {(data?.scenes ?? []).map((sceneEntry) => (
              <SceneRow
                key={sceneEntry.path}
                entry={sceneEntry}
                active={sceneEntry.path === selected}
                render={sceneEntry.renders.find((item) => item.quality === quality)}
                onSelect={() => onSelect(sceneEntry.path)}
              />
            ))}
          </div>
        )}
        {entry !== null && entry.scenes.length > 1 ? (
          <div className={cx('chips')}>
            <span className={cx('muted', 'small')}>{t('scene.class')}</span>
            {entry.scenes.map((name) => (
              <button
                key={name}
                type="button"
                className={cx('chip', name === sceneClass && 'chipActive')}
                onClick={() => onSceneClass(name)}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* artifact + log */}
      <div className={cx('section')}>
        <div className={cx('sectionHead')}>
          <span className={cx('sectionTitle')}>{t('log.title')}</span>
          <Button size="sm" variant="ghost" onClick={onToggleLog}>
            {showLog ? t('log.hide') : t('log.show')}
          </Button>
        </div>
        {liveJob?.result?.output !== undefined ? (
          <div className={cx('small', 'muted', 'ellipsis')} title={liveJob.result.output}>
            {t('player.output', { path: liveJob.result.output })}
          </div>
        ) : record?.output !== undefined ? (
          <div className={cx('small', 'muted', 'ellipsis')} title={record.output}>
            {t('player.output', { path: record.output })}
          </div>
        ) : null}
        {showLog ? (
          <pre className={cx('log')}>
            {liveJob !== null && liveJob.log.length > 0 ? liveJob.log.join('\n') : t('log.empty')}
          </pre>
        ) : null}
      </div>
    </div>
  )
}

/** Props the shell hands the tab body. */
export interface StudioProps {
  /** Binds one workspace root to a fresh API client. */
  makeApi: (root: string) => StudioRemote
  sessions: SessionListStore
}

/**
 * The 动画工作室 container: state, polling and API calls.
 *
 * @param props - the API binder and the session store.
 * @returns the panel element.
 */
export function Studio({ makeApi, sessions }: StudioProps): JSX.Element {
  const session = useSession(sessions)
  const sessionRoot = session.root
  const [picked, setPicked] = useState<string>(chosenRoot)
  const [roots, setRoots] = useState<WorkspaceRoot[] | null>(null)
  const root = sessionRoot !== '' ? sessionRoot : picked
  const api = useMemo(() => (root === '' ? null : makeApi(root)), [makeApi, root])

  // The session list is not the only place a cwd can come from: shells differ in
  // what `ctx.sessions.list` exposes, and one that omits `byId[current].cwd`
  // rendered "no workspace" over an open project. Ask the host, which knows its
  // registered workspaces, and auto-pick when there is exactly one.
  useEffect(() => {
    if (sessionRoot !== '' || picked !== '') return
    let live = true
    const api = makeApi('')
    void (async () => {
      // Preferred: the host maps the session id to its workspace through the
      // registry, so the panel opens the workspace the user is *in* rather than
      // asking. The list entry's `cwd` is optional, which is why this exists.
      if (session.id !== '') {
        try {
          const resolved = await api.sessionRoot(session.id)
          if (live && typeof resolved.path === 'string' && resolved.path !== '') {
            chosenRoot = resolved.path
            setPicked(resolved.path)
            return
          }
        } catch {
          // Fall through to the list.
        }
      }
      try {
        const value = await api.workspaces()
        if (!live) return
        const list = value.roots ?? []
        setRoots(list)
        if (list.length === 1) {
          chosenRoot = list[0].path
          setPicked(list[0].path)
        }
      } catch {
        if (live) setRoots([])
      }
    })()
    return () => { live = false }
  }, [makeApi, sessionRoot, picked, session.id])
  const memory = useMemo(() => memoryFor(root), [root])

  const [data, setData] = useState<ListResult | null>(null)
  const [selected, setSelected] = useState<string>(memory.selected)
  const [sceneClass, setSceneClass] = useState<string | null>(memory.sceneClass)
  const [quality, setQuality] = useState<string | null>(memory.quality)
  const [job, setJob] = useState<JobView | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  /** Job id whose index refresh has already been requested, so the poll cannot loop. */
  const refreshedFor = useRef<string>('')
  /**
   * Which render the stills on screen came from, as `<file>|<scene>|<quality>|<at>`.
   *
   * A ref on purpose: it records what has been fetched without being a dependency
   * of the fetch, so loading a storyboard cannot re-trigger the effect that
   * loaded it. `''` means "nothing loaded yet".
   */
  const framesKey = useRef<string>('')

  // --- data -----------------------------------------------------------------

  const load = useCallback(
    async (refresh = false) => {
      if (api === null) return
      try {
        const next = await api.list({ root, refresh })
        setData(next)
        setError(null)
        setSelected((current) => {
          if (current !== '' && next.scenes.some((scene) => scene.path === current)) return current
          return next.scenes[0]?.path ?? ''
        })
        setQuality((current) => current ?? next.defaultQuality)
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure))
      }
    },
    [api, root],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Re-scan when the window regains focus: the agent writes scene files while the
  // user is looking at the chat, and the panel is the thing that should notice
  // without anyone pressing 刷新.
  useEffect(() => {
    if (api === null) return
    const onFocus = (): void => void load(true)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [api, load])

  // --- derived --------------------------------------------------------------

  const entry = useMemo(() => data?.scenes.find((scene) => scene.path === selected) ?? null, [data, selected])
  const activeQuality: QualityOption | undefined = useMemo(
    () => data?.qualities.find((option) => option.id === quality) ?? data?.qualities[0],
    [data, quality],
  )
  const record = useMemo(() => {
    if (entry === null) return undefined
    return (
      entry.renders.find((item) => item.quality === quality && (sceneClass === null || item.scene === sceneClass)) ??
      entry.renders.find((item) => item.quality === quality)
    )
  }, [entry, quality, sceneClass])

  const liveJob = job !== null && job.path === selected ? job : null
  const running = liveJob !== null && liveJob.endedAt === null

  /**
   * Identity of the render the player is currently showing.
   *
   * The timestamp is part of it on purpose: re-rendering the same scene at the
   * same quality produces a different video under the same file/scene/quality, and
   * without `at` the stills of the previous one would stay on screen as if they
   * described the new one.
   */
  const recordKey = record === undefined ? '' : `${record.sceneFile}|${record.scene}|${record.quality}|${record.at}`

  const videoUrl = useMemo(() => {
    if (api === null) return null
    if (liveJob !== null && liveJob.state === 'done' && liveJob.result !== null) return api.videoUrl({ id: liveJob.id })
    if (record !== undefined) return api.videoUrl({ path: record.sceneFile, scene: record.scene, quality: record.quality })
    return null
  }, [api, liveJob, record])

  // --- remember -------------------------------------------------------------

  useEffect(() => {
    memory.selected = selected
    memory.sceneClass = sceneClass
    memory.quality = quality
  }, [memory, selected, sceneClass, quality])

  // Selecting a different file resets the class choice and the visible job.
  //
  // Keyed on the selected PATH, not on `entry`: `entry` is a `useMemo` over
  // `data`, and `data` is replaced by every refresh — including the one a
  // finished render triggers. Keying on the object would clear the player and the
  // storyboard immediately after the render that produced them.
  const lastSelected = useRef<string>('')
  useEffect(() => {
    if (entry === null || lastSelected.current === entry.path) return
    lastSelected.current = entry.path
    // Keep the current class when the new file also defines it. Selecting a past
    // render sets file + class + quality in one go, and the version that always
    // reset the class threw away the class the menu had just picked.
    setSceneClass((current) =>
      current !== null && entry.scenes.includes(current) ? current : entry.scenes.length === 1 ? entry.scenes[0] : null,
    )
    setJob(null)
    setFrames([])
    framesKey.current = ''
  }, [entry])

  // --- polling --------------------------------------------------------------

  // The deps are primitives on purpose: `liveJob` is derived from `job`, which
  // this effect sets on every poll, so depending on the object would tear down
  // and rebuild the interval every 600 ms.
  const liveJobId = liveJob?.id ?? ''
  const liveJobEnded = liveJob?.endedAt ?? null
  useEffect(() => {
    if (api === null || liveJobId === '' || liveJobEnded !== null) return
    let cancelled = false
    const timer = setInterval(() => {
      void (async () => {
        try {
          const next = await api.job({ id: liveJobId })
          if (cancelled) return
          setJob(next.job)
          if (next.job.frames.length > 0) setFrames(next.job.frames)
        } catch (failure) {
          if (cancelled) return
          if (failure instanceof ManimApiError && failure.code === 'not-found') {
            // The host restarted and dropped the in-memory job. The artifact is
            // still on disk, so fall back to the index rather than showing a
            // dead spinner.
            setJob(null)
            void load(true)
          } else {
            setError(failure instanceof Error ? failure.message : String(failure))
          }
        }
      })()
    }, 600)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [api, liveJobId, liveJobEnded, load])

  // When a render finishes, re-scan so the artifact it produced becomes the
  // record on screen — and its storyboard can then be drawn by the effect below.
  useEffect(() => {
    if (api === null || liveJob === null || liveJob.state !== 'done' || liveJob.result === null) return
    if (refreshedFor.current === liveJob.id) return
    refreshedFor.current = liveJob.id
    const timer = setTimeout(() => void load(true), 400)
    return () => clearTimeout(timer)
  }, [api, liveJob, load])

  /**
   * Pull the stills of whatever render is on screen, once per render.
   *
   * The user picks a finished render to *look* at it; making them press 抽取分镜
   * to see the very thing they just selected is busywork. One fetch per render
   * identity, guarded by `framesKey` — a ref, so it cannot feed back into this
   * effect — and skipped while a render is live, whose stills arrive with the
   * job itself.
   */
  useEffect(() => {
    if (api === null || running || record === undefined || recordKey === '') return
    if (framesKey.current === recordKey) return
    framesKey.current = recordKey
    void (async () => {
      try {
        const result = await api.storyboard({
          path: record.sceneFile,
          scene: record.scene,
          quality: record.quality,
          count: 6,
          width: 480,
        })
        // A slow response must not paint over a newer selection.
        if (framesKey.current === recordKey) setFrames(result.frames)
      } catch (failure) {
        // A storyboard is a convenience, so a failure here must not look like a
        // failed render — the film may well play fine. It must not look like
        // "nothing to see" either: a record outlives the file it points at, and
        // then there is really nothing playing. Say which it is, and drop the key
        // so 抽取分镜 can try again instead of caching the miss.
        if (framesKey.current === recordKey) {
          framesKey.current = ''
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }
    })()
  }, [api, record, recordKey, running])

  // --- actions --------------------------------------------------------------

  const startRender = useCallback(async () => {
    if (api === null || entry === null || activeQuality === undefined) return
    if (sceneClass === null) {
      setError(t('scene.multiple'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.render({ root, path: entry.path, scene: sceneClass, quality: activeQuality.id })
      setJob(result.job)
      setFrames([])
      framesKey.current = ''
      refreshedFor.current = ''
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }, [activeQuality, api, entry, root, sceneClass])

  const cancelRender = useCallback(async () => {
    if (api === null || liveJob === null) return
    try {
      await api.cancel({ id: liveJob.id })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }, [api, liveJob])

  const makeStoryboard = useCallback(async () => {
    if (api === null || entry === null || activeQuality === undefined) return
    setBusy(true)
    try {
      const result =
        liveJob !== null && liveJob.state === 'done'
          ? await api.storyboard({ id: liveJob.id, count: 6, width: 480 })
          : await api.storyboard({
              path: entry.path,
              scene: sceneClass ?? undefined,
              quality: activeQuality.id,
              count: 6,
              width: 480,
            })
      setFrames(result.frames)
      framesKey.current = recordKey
      setError(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }, [activeQuality, api, entry, liveJob, recordKey, sceneClass])

  const newScene = useCallback(async () => {
    if (api === null) return
    const name = window.prompt(t('scene.newPrompt'), 'Explainer')
    if (name === null || name.trim() === '') return
    setBusy(true)
    try {
      const created = await api.template({ root, name: name.trim() })
      await load(true)
      setSelected(created.path)
      setSceneClass(created.scene)
      setError(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }, [api, load, root])

  /**
   * Switching quality switches *which render* the player shows, so the stills on
   * screen are about a different video — they have to go, or the storyboard
   * silently lies about what is playing. Emptying them is enough: the auto-fetch
   * effect sees a new render identity and pulls that render's stills.
   */
  const changeQuality = useCallback((id: string) => {
    setQuality(id)
    setFrames([])
  }, [])

  const seek = useCallback((time: number) => {
    const video = videoRef.current
    if (video === null) return
    video.currentTime = time
    void video.play()
  }, [])

  // --- render ---------------------------------------------------------------

  if (root === '') {
    const candidates = roots ?? []
    if (candidates.length > 1) {
      return (
        <div className={cx('rootPicker')}>
          <p className={cx('rootPickerTitle')}>{t('panel.pickRoot')}</p>
          <p className={cx('rootPickerHint')}>{t('panel.pickRootHint')}</p>
          {candidates.map((candidate) => (
            <button
              key={candidate.path}
              type="button"
              className={cx('rootItem')}
              onClick={() => {
                chosenRoot = candidate.path
                setPicked(candidate.path)
              }}
            >
              <span className={cx('rootItemName')}>{candidate.name}</span>
              <span className={cx('rootItemPath')}>{candidate.path}</span>
            </button>
          ))}
        </div>
      )
    }
    return <div className={cx('notice')}>{t('panel.noRoot')}</div>
  }

  return (
    <StudioView
      data={data}
      selected={selected}
      sceneClass={sceneClass}
      quality={quality}
      job={job}
      frames={frames}
      error={error}
      busy={busy}
      showLog={showLog}
      onSelect={setSelected}
      onSceneClass={setSceneClass}
      onQuality={changeQuality}
      onRender={() => void startRender()}
      onCancel={() => void cancelRender()}
      onRefresh={() => void load(true)}
      onStoryboard={() => void makeStoryboard()}
      onNewScene={() => void newScene()}
      onToggleLog={() => setShowLog((value) => !value)}
      frameUrl={(file) => api?.frameUrl(file) ?? ''}
      videoUrl={videoUrl}
      onSeek={seek}
      videoRef={videoRef}
    />
  )
}
