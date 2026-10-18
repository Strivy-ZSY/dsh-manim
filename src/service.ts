/**
 * dsh-manim host service: everything that touches the filesystem.
 *
 * Three invariants hold for every path that arrives here from a browser or a
 * tool call, and they are the reason this file exists rather than the routes
 * doing the work:
 *
 * 1. **The root is a registered workspace.** `realpath` first, then a prefix
 *    check against `workspaceRegistry.list()`. A LAN-exposed dsh must not serve
 *    or write one workspace's files to another origin, and a symlink out of the
 *    workspace must not slip past a string comparison — so the check runs on the
 *    canonical path, never on the string the caller sent.
 * 2. **The cache lives outside the workspace.** Manim's default is to write
 *    `./media/…` next to the scene. That is a build artifact the user did not
 *    ask for, and a two-minute render leaves a `partial_movie_files` tree of
 *    hundreds of segments. Renders happen under `cacheDir`; the finished `.mp4`
 *    is the only thing that gets copied into the workspace, and only because a
 *    config option says so.
 * 3. **A render's artifact is addressable without its job.** Jobs are in-memory
 *    (see `engine.ts`); the `.mp4` is at a deterministic path recorded in
 *    `index/<workspace>.json`, so the panel can still find last week's render
 *    after DSH restarts.
 *
 * @module dsh-manim/service
 */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { appendFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace'
import { PLUGIN_ROOT, qualityById, type Config, type Quality } from './config.ts'
import { runDriver, runPythonSpec, type DriverEvent, type Frame, type RenderEngine, type RenderJob } from './engine.ts'

/** Directories that never hold scene files and are expensive to walk. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.venv', 'venv', '__pycache__', 'site-packages',
  'dist', 'build', '.next', '.cache', '.mypy_cache', '.pytest_cache', 'media',
  // Source checkouts of libraries (a Manim clone is the common one): its own
  // `manim/scene/*.py` files define `class ZoomedScene(Scene)` and would
  // otherwise be offered as "your scenes".
  'manim-main', 'manim', 'example_scenes', 'examples', 'tests', 'test',
])

/** Files that mark a directory as a package checkout rather than a scene folder. */
const LIBRARY_MARKERS = ['pyproject.toml', 'setup.py', 'setup.cfg']

/** Whether a directory is a library checkout (has packaging markers, is not the root). */
async function isLibraryCheckout(dir: string, isRoot: boolean): Promise<boolean> {
  if (isRoot) return false
  for (const marker of LIBRARY_MARKERS) {
    if (existsSync(join(dir, marker))) return true
  }
  return false
}

/** How deep the workspace scan goes looking for scene files. */
const MAX_SCAN_DEPTH = 5
/** Hard cap on `.py` files examined for `Scene` subclasses. */
const MAX_SCAN_FILES = 600
/** Cap on a file read while scanning (a 40 MB generated module is not a scene). */
const MAX_SCAN_BYTES = 512 * 1024

/** Cap on the client-failure log; the tail is kept, the head is dropped. */
const CLIENT_LOG_LIMIT = 256 * 1024

/** The gate verdict for one root. */
export type GateVerdict = { ok: true; canonical: string } | { ok: false; error: string }

/** Normalize a path for prefix comparison. */
export function normalizeForPrefix(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** The canonical prefix check: `child` must live inside (or equal) `root`. */
export function isPathInside(root: string, child: string): boolean {
  if (root === '' || child === '') return false
  const normRoot = normalizeForPrefix(root)
  const normChild = normalizeForPrefix(child)
  if (normChild === normRoot) return true
  return normChild.startsWith(`${normRoot}/`)
}

/** Canonicalize a root and require membership of a registered workspace. */
export async function verifyWorkspaceRoot(ctx: Context, root: string): Promise<GateVerdict> {
  if (typeof root !== 'string' || root === '') return { ok: false, error: 'empty workspace root' }
  let canonical: string
  try {
    canonical = await realpath(root)
  } catch {
    return { ok: false, error: 'path does not resolve on disk' }
  }
  try {
    for (const workspace of ctx.workspaceRegistry.list()) {
      if (isPathInside(workspace.path, canonical)) return { ok: true, canonical }
    }
  } catch (error) {
    return { ok: false, error: `workspace registry unavailable: ${error instanceof Error ? error.message : String(error)}` }
  }
  return { ok: false, error: 'path is not inside a registered workspace' }
}

/**
 * The registered workspace roots, as the panel needs them.
 *
 * The panel used to derive its root from the session list (`ctx.sessions.list`),
 * and that shape is not the same in every shell: a shell whose snapshot lacks
 * `byId[current].cwd` renders the "no workspace" notice with a perfectly good
 * project open. The host knows the truth, so it answers instead.
 *
 * @param ctx - context carrying the workspace registry.
 * @returns roots newest-first; an unreadable registry yields an empty list.
 */
export function listWorkspaceRoots(ctx: Context): Array<{ path: string; name: string }> {
  const roots: Array<{ path: string; name: string }> = []
  for (const row of workspaceRows(ctx)) {
    const path = [row.path, row.root, row.directory].find((value) => typeof value === 'string' && value !== '')
    if (typeof path !== 'string') continue
    // `Workspace` carries `title`; `name` and the basename are older/looser spellings.
    const name = [row.title, row.name].find((value) => typeof value === 'string' && value !== '')
    roots.push({ path, name: typeof name === 'string' ? name : basename(path) })
  }
  return roots
}

/** The registry's rows, or none when it is absent or unreadable. */
function workspaceRows(ctx: Context): Array<Record<string, unknown>> {
  let rows: unknown
  try {
    rows = (ctx as unknown as { workspaceRegistry?: { list?: () => unknown } }).workspaceRegistry?.list?.()
  } catch {
    return []
  }
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object') : []
}

/**
 * The workspace root a session belongs to, by session id.
 *
 * A session *list* entry carries `cwd` only optionally — the list is built from
 * persisted headers, and a row that has not been opened can legitimately omit it
 * — so reading the cwd off the list is not a reliable way to answer "which
 * workspace is this session in". The registry does answer it: each `Workspace`
 * lists the header-validated `sessionIds` that live under its path.
 *
 * @param ctx - context carrying the workspace registry.
 * @param sessionId - the session whose directory is wanted.
 * @returns the root path, or `null` when no workspace claims that session.
 */
export function findWorkspaceRootForSession(ctx: Context, sessionId: string, cwd?: string): string | null {
  // The client's own `cwd` is a valid answer when the registry cannot map the id:
  // validate it against the registered roots rather than trusting it outright.
  if (typeof cwd === 'string' && cwd !== '') {
    const canonical = (() => { try { return realpathSync(cwd) } catch { return '' } })()
    if (canonical !== '') {
      for (const row of workspaceRows(ctx)) {
        if (typeof row.path === 'string' && isPathInside(row.path, canonical)) return row.path
      }
    }
  }
  if (typeof sessionId !== 'string' || sessionId === '') return null
  const direct = (ctx as unknown as { workspaceRegistry?: { sessionPath?: (id: string) => unknown } })
    .workspaceRegistry?.sessionPath?.(sessionId)
  if (typeof direct === 'string' && direct !== '') return direct
  // `session-<uuid>` on disk, a bare uuid at runtime: compare without the prefix.
  const wanted = sessionId.replace(/^session-/, '').toLowerCase()
  for (const row of workspaceRows(ctx)) {
    const ids = row.sessionIds ?? row.sessions
    const owns = Array.isArray(ids) && ids.some((id) => typeof id === 'string'
      && id.replace(/^session-/, '').toLowerCase() === wanted)
    if (owns && typeof row.path === 'string' && row.path !== '') return row.path
  }
  return null
}

/** Canonicalize a file and require it to be inside some registered workspace. */
export async function verifyPathInSomeWorkspace(ctx: Context, target: string): Promise<GateVerdict> {
  if (typeof target !== 'string' || target === '') return { ok: false, error: 'empty path' }
  let canonical: string
  try {
    canonical = await realpath(target)
  } catch {
    return { ok: false, error: 'path does not resolve on disk' }
  }
  try {
    for (const workspace of ctx.workspaceRegistry.list()) {
      if (isPathInside(workspace.path, canonical)) return { ok: true, canonical }
    }
  } catch (error) {
    return { ok: false, error: `workspace registry unavailable: ${error instanceof Error ? error.message : String(error)}` }
  }
  return { ok: false, error: 'path is not inside a registered workspace' }
}

/** One scene file the panel can render. */
export interface SceneEntry {
  /** Absolute path. */
  path: string
  /** Workspace-relative path, `/` separated — what the UI shows. */
  rel: string
  /** Workspace-relative directory, `''` at the workspace root. */
  dir: string
  /** File size in bytes. */
  size: number
  /** Last modification time (ms). */
  mtime: number
  /** Scene class names, from a static scan. */
  scenes: string[]
  /** Renders this plugin knows about for this file, newest first. */
  renders: RenderRecord[]
}

/** A finished render, as persisted in the cache index. */
export interface RenderRecord {
  sceneFile: string
  scene: string
  quality: string
  /** Absolute path of the `.mp4`. */
  video: string
  /** The copy inside the workspace, when `outputDir` is set. */
  output?: string
  duration: number | null
  plays: number
  width: number
  height: number
  fps: number
  /** When the render finished (ms). */
  at: number
}

/** The persisted index for one workspace. */
interface IndexFile {
  renders: RenderRecord[]
}

/**
 * A cached plan: how many animations a scene has, and how long it runs.
 *
 * Keyed by the scene file's *revision* (mtime + size) because that is what makes
 * it safe to reuse: a plan is a property of the scene's code, not of the quality
 * it will be rendered at, so the draft's measurement is exactly the final
 * render's — but only while the code is unchanged.
 *
 * Worth caching because the plan pass is not cheap. It runs the whole scene
 * lifecycle a second time (construct, per-animation bookkeeping, teardown) and
 * on a 67-animation scene that measured **58 s** even after every rasterising
 * path was stubbed out — against a 51 s draft render, that is the difference
 * between iterating and waiting.
 */
export interface PlanRecord {
  plays: number
  duration: number
  scene: string
  /** Scene file mtime (ms) this plan was measured against. */
  mtime: number
  /** Scene file size, the second half of the revision key. */
  size: number
  at: number
}

/** The persisted plan cache. */
interface PlanFile {
  plans: Record<string, PlanRecord>
}

/** Cap on the renders remembered per workspace. */
const INDEX_LIMIT = 60

/**
 * A `Scene` subclass declaration, found without importing the file.
 *
 * Static rather than authoritative: the driver's `list` mode is the truth. This
 * exists so that listing 600 files does not mean 600 Python processes, and it is
 * deliberately generous — a false positive costs one wasted driver call, a false
 * negative hides a scene from the panel.
 */
const CLASS_PATTERN = /^class\s+([A-Za-z_]\w*)\s*\(\s*([^)]*)\)/gm

/** Scene class names declared in a Python source. */
export function scanScenes(source: string): string[] {
  const names: string[] = []
  for (const match of source.matchAll(CLASS_PATTERN)) {
    const bases = match[2]
    // A direct `Scene` subclass, or one inheriting from a class whose name ends
    // in Scene (ThreeDScene, MovingCameraScene, a project's own BaseScene).
    if (/\b\w*Scene\b/.test(bases) && !/^SceneBase$/.test(match[1])) names.push(match[1])
  }
  return [...new Set(names)]
}

/** Whether a workspace-relative path is worth scanning. */
function isSceneCandidate(relPath: string): boolean {
  const parts = relPath.split('/')
  if (parts.some((part) => SKIP_DIRS.has(part))) return false
  if (!relPath.endsWith('.py')) return false
  // Migrations, vendored trees and test fixtures all contain `class X(Scene)`
  // shaped noise often enough to be worth skipping by name.
  return !/(^|\/)(test_|conftest)/.test(relPath)
}

/** Recursively collect candidate scene files under a root. */
async function collectCandidates(root: string, dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_SCAN_DEPTH || out.length >= MAX_SCAN_FILES) return
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= MAX_SCAN_FILES) return
    const absolute = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      // A vendored clone (the Manim source, say) is not the user's scene tree.
      if (await isLibraryCheckout(absolute, false)) continue
      await collectCandidates(root, absolute, depth + 1, out)
      continue
    }
    if (!entry.isFile()) continue
    const rel = relative(root, absolute).replaceAll('\\', '/')
    if (isSceneCandidate(rel)) out.push(absolute)
  }
}

/** The stable cache key for a scene file. */
export function sceneKey(absPath: string): string {
  return createHash('sha1').update(normalizeForPrefix(absPath)).digest('hex').slice(0, 16)
}

/** The stable cache key for a workspace. */
function workspaceKey(root: string): string {
  return createHash('sha1').update(normalizeForPrefix(root)).digest('hex').slice(0, 16)
}

/** Make a string safe to use as a file name. */
export function safeName(value: string, fallback = 'scene'): string {
  const cleaned = value.replace(/[^\w.\-]+/g, '_').replace(/^[._]+/, '').slice(0, 80)
  return cleaned === '' ? fallback : cleaned
}

/**
 * The host half's operations.
 *
 * Constructed once per plugin mount and shared by the routes and the tools, so
 * both see the same job list and the same scan cache.
 */
export class ManimService {
  private readonly scanCache = new Map<string, { at: number; entries: SceneEntry[] }>()
  private probeCache: { at: number; value: Record<string, unknown> } | null = null

  /**
   * @param ctx - context carrying the workspace registry.
   * @param config - resolved plugin config.
   * @param engine - the running-job registry.
   */
  constructor(
    private readonly ctx: Context,
    readonly config: Config,
    private readonly engine: RenderEngine,
  ) {}

  // --- paths -------------------------------------------------------------

  /** Gate a workspace root: canonicalize it and require registration. */
  async gate(root: string): Promise<GateVerdict> {
    return await verifyWorkspaceRoot(this.ctx, root)
  }

  /** The cache directory for one scene at one quality. */
  private sceneDir(absPath: string, qualityId: string): string {
    return join(this.config.cacheDir, 'scenes', sceneKey(absPath), qualityId)
  }

  /** Manim's own working directory (its `media_dir`) for one scene+quality. */
  private mediaDir(absPath: string, qualityId: string): string {
    return join(this.sceneDir(absPath, qualityId), 'manim')
  }

  /** Where stills extracted from a render are written. */
  private framesDir(absPath: string, qualityId: string): string {
    return join(this.sceneDir(absPath, qualityId), 'frames')
  }

  /** The persisted render index for one workspace. */
  private indexPath(root: string): string {
    return join(this.config.cacheDir, 'index', `${workspaceKey(root)}.json`)
  }

  // --- scene discovery ---------------------------------------------------

  /**
   * Every scene file under a workspace.
   *
   * Cached for 20 s: the panel polls, and walking a large workspace on every
   * poll is the difference between a snappy tab and a spinning one. The TTL is
   * short enough that a file the agent just wrote shows up on the next refresh
   * without the user pressing anything.
   */
  async listScenes(root: string, options: { refresh?: boolean } = {}): Promise<SceneEntry[]> {
    const cached = this.scanCache.get(root)
    if (cached !== undefined && options.refresh !== true && Date.now() - cached.at < 20_000) {
      return cached.entries
    }
    const renders = await this.readIndex(root)
    const candidates: string[] = []
    await collectCandidates(root, root, 0, candidates)

    const entries: SceneEntry[] = []
    for (const absolute of candidates) {
      try {
        const info = await stat(absolute)
        if (info.size === 0 || info.size > this.config.maxSceneBytes) continue
        const source = await readFile(absolute, 'utf8')
        const scenes = scanScenes(source)
        if (scenes.length === 0) continue
        const rel = relative(root, absolute).replaceAll('\\', '/')
        entries.push({
          path: absolute,
          rel,
          dir: dirname(rel) === '.' ? '' : dirname(rel).replaceAll('\\', '/'),
          size: info.size,
          mtime: info.mtimeMs,
          scenes,
          renders: renders.filter((record) => record.sceneFile === absolute),
        })
      } catch {
        // A file that vanished between readdir and read is not an error.
      }
    }
    entries.sort((a, b) => b.mtime - a.mtime)
    this.scanCache.set(root, { at: Date.now(), entries })
    return entries
  }

  /** Drop the scan cache (after the plugin writes a scene file). */
  invalidateScan(root?: string): void {
    if (root === undefined) this.scanCache.clear()
    else this.scanCache.delete(root)
  }

  /** Resolve a scene path argument to an absolute path inside a workspace. */
  async resolveScenePath(root: string, path: string): Promise<{ ok: true; absolute: string } | { ok: false; error: string }> {
    const candidate = isAbsolute(path) ? path : resolve(root, path)
    let canonical: string
    try {
      canonical = await realpath(candidate)
    } catch {
      return { ok: false, error: `找不到文件：${path}` }
    }
    if (!isPathInside(root, canonical)) return { ok: false, error: `${path} 不在工作区 ${root} 内` }
    if (!canonical.endsWith('.py')) return { ok: false, error: '场景文件必须是 .py' }
    return { ok: true, absolute: canonical }
  }

  /**
   * Resolve a scene path for **writing**, where the file need not exist yet.
   *
   * `resolveScenePath` requires the file to resolve on disk, which is right for
   * reading and rendering and wrong for the first write of a new scene — that
   * version refused to create any file ("找不到文件") and made `manim_scene
   * (action='write')` useless for exactly the case it exists for. Here the
   * parent directory is what has to resolve, and the target still has to land
   * inside the workspace.
   */
  async resolveScenePathForWrite(root: string, path: string): Promise<{ ok: true; absolute: string } | { ok: false; error: string }> {
    const candidate = isAbsolute(path) ? path : resolve(root, path)
    if (!candidate.toLowerCase().endsWith('.py')) return { ok: false, error: '场景文件必须是 .py' }
    if (!isPathInside(root, candidate)) return { ok: false, error: `${path} 不在工作区 ${root} 内` }
    let parent: string
    try {
      parent = await realpath(dirname(candidate))
    } catch {
      return { ok: false, error: `目录不存在：${dirname(candidate)}` }
    }
    const absolute = join(parent, basename(candidate))
    if (!isPathInside(root, absolute)) return { ok: false, error: `${path} 解析后落在工作区外` }
    return { ok: true, absolute }
  }

  /**
   * Decide which `Scene` class a render means.
   *
   * Static, so it costs one file read rather than a Python process. The driver
   * repeats the check authoritatively before it renders anything, so a file this
   * scan misreads fails with the driver's own message rather than silently
   * rendering the wrong scene.
   */
  async resolveSceneName(
    absolute: string,
    requested?: string | null,
  ): Promise<{ ok: true; scene: string; scenes: string[] } | { ok: false; error: string }> {
    let source: string
    try {
      source = await readFile(absolute, 'utf8')
    } catch (error) {
      return { ok: false, error: `无法读取场景文件：${error instanceof Error ? error.message : String(error)}` }
    }
    const scenes = scanScenes(source)
    if (scenes.length === 0) {
      return { ok: false, error: `这个文件里没有 Scene 子类：${basename(absolute)}` }
    }
    if (requested !== undefined && requested !== null && requested !== '') {
      if (!scenes.includes(requested)) {
        return { ok: false, error: `文件里没有名为 ${requested} 的场景；它定义了：${scenes.join(', ')}` }
      }
      return { ok: true, scene: requested, scenes }
    }
    if (scenes.length > 1) {
      return { ok: false, error: `文件里有多个场景，请指明 scene：${scenes.join(', ')}` }
    }
    return { ok: true, scene: scenes[0], scenes }
  }

  /** Ask the driver for the authoritative scene list of one file. */
  async inspectSceneFile(absolute: string): Promise<{ ok: boolean; scenes: Array<{ name: string; doc: string; bases: string[] }>; error?: string }> {
    try {
      const events = await runDriver({
        pythonPath: this.config.pythonPath,
        driverPath: this.config.driverPath,
        spec: { mode: 'list', sceneFile: absolute },
        cwd: dirname(absolute),
        timeoutMs: 90_000,
      })
      const result = lastResult(events)
      const scenes = (result?.scenes ?? []) as Array<{ name: string; doc: string; bases: string[] }>
      return { ok: true, scenes }
    } catch (error) {
      return { ok: false, scenes: [], error: error instanceof Error ? error.message : String(error) }
    }
  }

  // --- render index ------------------------------------------------------

  /**
   * Read the persisted render index for a workspace.
   *
   * Every record is checked against the disk and its path repaired when the film
   * can be found again (see `repairRecord`). The path is *persisted*, so a record
   * written by an older driver keeps whatever location that version computed —
   * and that has been wrong here: a draft render was indexed as
   * `…/draft/manim/videos/480p15/UnetrppExplainer.mp4` while the film had always
   * been at `…/draft/manim/videos/UnetrppExplainer/480p15/UnetrppExplainer.mp4`.
   * Repaired on read rather than written back: the index file stays the driver's
   * to own, and the check costs one `stat` per record.
   *
   * A record whose film is really gone is returned as-is — the index is the only
   * note that the render happened, and a caller that opens it gets the file
   * system's error, which says more than "there is no such render".
   */
  async readIndex(root: string): Promise<RenderRecord[]> {
    try {
      const raw = await readFile(this.indexPath(root), 'utf8')
      const parsed = JSON.parse(raw) as IndexFile
      if (!Array.isArray(parsed.renders)) return []
      return await Promise.all(parsed.renders.map((record) => this.repairRecord(record)))
    } catch {
      return []
    }
  }

  /**
   * One indexed record, with `video` pointing at the film that is really there.
   *
   * Two candidates, in order of how much they prove:
   *
   * * `output` — the copy publishing wrote into the workspace. `publishRender`
   *   copies the film it has just rendered in the same breath as it writes this
   *   record, so while it is still there it *is* the record's film. It also
   *   outlives the cache being cleaned, which is one way a record loses its
   *   `video`.
   * * a film of the same name in the render's quality directory, for records
   *   whose copy was renamed or deleted, or never made (`outputDir: ''`).
   *
   * Neither is a guess about *content*: both are films of this scene at this
   * quality, and the one the record was written from is preferred over the one
   * merely lying around.
   */
  private async repairRecord(record: RenderRecord): Promise<RenderRecord> {
    if (existsSync(record.video)) return record
    if (record.output !== undefined && existsSync(record.output)) return { ...record, video: record.output }
    const located = await this.locateVideo(record)
    return located === null ? record : { ...record, video: located }
  }

  /**
   * Find a record's mp4 when the path baked into it does not exist.
   *
   * manim decides where the film goes: `videos/<module>/<quality>/<name>.mp4`,
   * where `module` is the scene *file*'s stem and `name` the scene class. The
   * driver has computed that wrong before — it once left the module level out and
   * indexed `videos/<quality>/<name>.mp4` — and because the path is persisted,
   * such a record never heals by itself.
   *
   * So: look where the driver puts films today, then where it used to. The name
   * is taken from the stale path itself, which is the one thing it gets right,
   * and the search never wanders deeper — an mp4 of the same name can be a
   * leftover film from an earlier revision of the scene (this machine has exactly
   * that, with a different duration and a different mtime).
   */
  private async locateVideo(record: RenderRecord): Promise<string | null> {
    const videos = join(this.sceneDir(record.sceneFile, record.quality), 'manim', 'videos')
    const name = basename(record.video)
    const moduleName = basename(record.sceneFile).replace(/\.[^.]+$/, '')
    return (await this.newestUnder(join(videos, moduleName), name)) ?? (await this.newestUnder(videos, name))
  }

  /**
   * The newest `<dir>/<sub>/<name>` that any subdirectory of `dir` holds, or null.
   *
   * Exactly one level down on purpose: that is the quality folder. Going deeper
   * would reach `partial_movie_files`, which holds one mp4 per animation — the
   * finished film is never among them. When several subdirectories hold the name
   * (qualities, or a film left behind by an older revision), the newest wins: the
   * record was written when its render finished.
   */
  private async newestUnder(dir: string, name: string): Promise<string | null> {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return null
    }
    const found: Array<{ file: string; at: number }> = []
    for (const entry of entries) {
      const file = join(dir, entry, name)
      try {
        found.push({ file, at: (await stat(file)).mtimeMs })
      } catch {
        // Not a directory, or no film of that name in it — the next one may be.
      }
    }
    if (found.length === 0) return null
    found.sort((a, b) => b.at - a.at)
    return found[0].file
  }

  /** Add one finished render to the index. */
  async rememberRender(root: string, record: RenderRecord): Promise<void> {
    const existing = await this.readIndex(root)
    const key = (item: RenderRecord): string => `${item.sceneFile}|${item.scene}|${item.quality}`
    const next = [record, ...existing.filter((item) => key(item) !== key(record))].slice(0, INDEX_LIMIT)
    const file = this.indexPath(root)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify({ renders: next } satisfies IndexFile, null, 2), 'utf8')
  }

  // --- plans -------------------------------------------------------------

  /** The plan cache file (one for the whole plugin, keyed by scene). */
  private planFile(): string {
    return join(this.config.cacheDir, 'index', 'plans.json')
  }

  /** Every cached plan. */
  async readPlans(): Promise<Record<string, PlanRecord>> {
    try {
      const parsed = JSON.parse(await readFile(this.planFile(), 'utf8')) as PlanFile
      return parsed.plans ?? {}
    } catch {
      return {}
    }
  }

  /**
   * The cached plan for a scene file, if it still matches the file's revision.
   *
   * @param absolute - the scene file.
   * @param scene - the scene class the plan must belong to.
   * @returns the plan, or null when there is none / it is stale.
   */
  async planFor(absolute: string, scene: string): Promise<PlanRecord | null> {
    const plans = await this.readPlans()
    const record = plans[sceneKey(absolute)]
    if (record === undefined || record.scene !== scene) return null
    try {
      const info = await stat(absolute)
      // A scene file that changed invalidates its own plan: the animation count
      // and the total duration are properties of that code.
      if (info.mtimeMs !== record.mtime || info.size !== record.size) return null
    } catch {
      return null
    }
    return record
  }

  /** Store a measured plan against the scene file's current revision. */
  async rememberPlan(absolute: string, scene: string, plays: number, duration: number | null): Promise<void> {
    if (plays <= 0 || duration === null || duration <= 0) return
    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(absolute)
    } catch {
      return
    }
    const plans = await this.readPlans()
    plans[sceneKey(absolute)] = { plays, duration, scene, mtime: info.mtimeMs, size: info.size, at: Date.now() }
    const file = this.planFile()
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify({ plans } satisfies PlanFile, null, 2), 'utf8')
  }

  // --- rendering ---------------------------------------------------------

  /** The quality preset for an id, falling back to the configured default. */
  qualityFor(id?: string | null): Quality {
    return qualityById(id ?? '') ?? qualityById(this.config.defaultQuality) ?? qualityById('1080p60')!
  }

  /**
   * Build the driver spec for a render.
   *
   * When a plan is already cached for this scene revision the driver is told to
   * skip its own plan pass and handed the numbers instead — same progress bar,
   * same pre-flight guarantees already spent, ~58 s saved on a large scene.
   *
   * @param absolute - the scene file.
   * @param scene - the scene class.
   * @param quality - the quality preset.
   * @param plan - a cached plan, or null to let the driver measure one.
   * @param encoders - how many segments may encode concurrently.
   */
  private renderSpec(
    absolute: string,
    scene: string,
    quality: Quality,
    plan: PlanRecord | null,
    encoders: number,
  ): Record<string, unknown> {
    return {
      mode: 'render',
      sceneFile: absolute,
      sceneName: scene,
      mediaDir: this.mediaDir(absolute, quality.id),
      outputName: safeName(scene),
      width: quality.width,
      height: quality.height,
      fps: quality.fps,
      background: this.config.background,
      format: 'mp4',
      encoders,
      plan: plan === null,
      ...(plan === null ? {} : { totalPlays: plan.plays, totalDuration: plan.duration }),
    }
  }

  /**
   * Start a render.
   *
   * @param input - workspace root, scene file (absolute), scene class, quality.
   * @returns the job handle the panel polls.
   */
  async startRender(input: {
    root: string
    path: string
    scene: string
    quality: Quality
    origin: 'tool' | 'panel'
    /** `true` forces a fresh plan pass, `false` never plans, `auto` reuses a cached one. */
    plan?: boolean | 'auto'
  }): Promise<RenderJob> {
    const cached = input.plan === false ? null : await this.planFor(input.path, input.scene)
    const usePlan = input.plan === true ? null : cached
    return this.engine.start(
      this.renderSpec(
        input.path,
        input.scene,
        input.quality,
        usePlan,
        this.config.maxInflightEncoders,
      ),
      {
        root: input.root,
        path: input.path,
        scene: input.scene,
        quality: input.quality.id,
        origin: input.origin,
      },
    )
  }

  /**
   * Copy a finished render into the workspace and record it.
   *
   * The copy exists because the cache is a cache — it can be pruned, and it is
   * not somewhere the user would think to look for the video they just made.
   */
  async publishRender(root: string, job: RenderJob): Promise<RenderRecord | null> {
    if (job.result === null) return null
    if (job.published) return null
    job.published = true
    const record: RenderRecord = {
      sceneFile: job.path,
      scene: job.scene ?? basename(job.path, '.py'),
      quality: job.quality,
      video: job.result.video,
      duration: job.result.duration,
      plays: job.result.plays,
      width: job.result.width,
      height: job.result.height,
      fps: job.result.fps,
      at: Date.now(),
    }
    if (this.config.outputDir !== '') {
      try {
        const targetDir = join(root, this.config.outputDir)
        await mkdir(targetDir, { recursive: true })
        const target = join(targetDir, `${safeName(record.scene)}-${job.quality}.mp4`)
        const bytes = await readFile(job.result.video)
        await writeFile(target, bytes)
        record.output = target
        job.result.output = target
      } catch (error) {
        // A failed copy must not lose the render: the artifact is still in the
        // cache, and the panel shows it from there.
        job.log.push(`[warn] 复制到工作区失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    await this.rememberRender(root, record)
    // The render itself is the most accurate plan there is: it counted the
    // animations and ran the clock. Remember it so the *next* render of this
    // scene (the final 1080p60 after a draft, say) skips the plan pass entirely.
    await this.rememberPlan(job.path, record.scene, record.plays, record.duration)
    this.invalidateScan(root)
    return record
  }

  /** Wait for a job to reach a terminal state (used by the tools). */
  async waitFor(jobId: string, timeoutMs: number): Promise<RenderJob | null> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const job = this.engine.get(jobId)
      if (job === undefined) return null
      if (job.endedAt !== null) {
        if (job.state === 'done' && job.result !== null) await this.publishRender(job.root, job)
        return this.engine.get(jobId) ?? job
      }
      if (Date.now() > deadline) return job
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  // --- stills ------------------------------------------------------------

  /**
   * Extract stills from a rendered video.
   *
   * The times are the interesting part: evenly spaced samples are what the panel
   * puts under the player as a storyboard, and they are also how the model looks
   * at its own output without watching it — an agent that can see four frames of
   * the animation it just made catches the mistakes (overlapping labels, text
   * off the frame, a missed fade) that a "rendered successfully" line hides.
   */
  async storyboard(input: {
    video: string
    keyPath: string
    qualityId: string
    count?: number
    times?: number[]
    width?: number
  }): Promise<Frame[]> {
    const outDir = this.framesDir(input.keyPath, input.qualityId)
    await mkdir(outDir, { recursive: true })
    const times = input.times ?? []
    const events = await runDriver({
      pythonPath: this.config.pythonPath,
      driverPath: this.config.driverPath,
      spec: {
        mode: 'frames',
        video: input.video,
        times,
        count: times.length === 0 ? (input.count ?? 6) : 0,
        outDir,
        frameWidth: input.width ?? 0,
      },
      timeoutMs: 120_000,
    })
    const result = lastResult(events)
    return (result?.frames ?? []) as Frame[]
  }

  // --- scaffolding -------------------------------------------------------

  /** The bundled starter scene template. */
  starterTemplate(): string {
    const file = fileURLToPath(new URL('../templates/starter.py', import.meta.url))
    return file
  }

  /**
   * Write a new scene file from the bundled template.
   *
   * @param root - workspace root.
   * @param name - file stem and default scene class name.
   * @param dir - workspace-relative directory; defaults to `animations`.
   */
  async scaffold(root: string, name: string, dir = 'animations'): Promise<{ path: string; scene: string }> {
    const fileName = `${safeName(name)}.py`
    const targetDir = resolve(root, dir === '' ? '.' : dir)
    if (!isPathInside(root, targetDir)) throw new Error('目标目录不在工作区内')
    await mkdir(targetDir, { recursive: true })
    const target = join(targetDir, fileName)
    if (existsSync(target)) throw new Error(`文件已存在：${relative(root, target).replaceAll('\\', '/')}`)
    const sceneClass = safeClassName(name)
    const template = await readFile(this.starterTemplate(), 'utf8')
    await writeFile(target, template.replaceAll('__SCENE_CLASS__', sceneClass), 'utf8')
    this.invalidateScan(root)
    return { path: target, scene: sceneClass }
  }

  // --- narration ---------------------------------------------------------

  /**
   * Which text-to-speech engines work here, and what voices they offer.
   *
   * `edge` is Microsoft Edge's read-aloud service through the `edge-tts`
   * package: free, no API key, and its Chinese voices are close to human.
   * `sapi` is Windows' own offline synthesiser — robotic, but it works with the
   * network down, which is the difference between "narrated draft" and "no
   * narration at all". The panel and the tool both ask here rather than
   * hard-coding a voice name.
   */
  async voiceInventory(): Promise<{ engines: Record<string, boolean>; voices: unknown[]; errors: string[] }> {
    const events = await runPythonSpec({
      pythonPath: this.config.pythonPath,
      scriptPath: this.config.voicePath,
      spec: { mode: 'list' },
      timeoutMs: 120_000,
    })
    const result = lastResult(events) ?? {}
    return {
      engines: (result.engines as Record<string, boolean>) ?? {},
      voices: (result.voices as unknown[]) ?? [],
      errors: (result.errors as string[]) ?? [],
    }
  }

  /**
   * Synthesise narration lines and write a cue sheet beside them.
   *
   * The cue sheet is the point: it carries each line's absolute start offset, so
   * the scene never has to reconstruct a timeline from durations by hand (a
   * scene that gets that arithmetic wrong drifts a second behind the voice by
   * the end, and nothing in the render reports it).
   *
   * @param input - workspace, output directory, lines, engine and voice.
   */
  async speak(input: {
    root: string
    dir: string
    lines: Array<{ id?: string; text: string }>
    voice?: string
    rate?: string
    engine?: string
    gap?: number
  }): Promise<Record<string, unknown>> {
    const outDir = resolve(input.root, input.dir === '' ? '.' : input.dir)
    if (!isPathInside(input.root, outDir)) throw new Error('目标目录不在工作区内')
    await mkdir(outDir, { recursive: true })
    const events = await runPythonSpec({
      pythonPath: this.config.pythonPath,
      scriptPath: this.config.voicePath,
      spec: {
        mode: 'speak',
        outDir,
        lines: input.lines,
        gap: input.gap ?? 0.35,
        ...(input.voice === undefined ? {} : { voice: input.voice }),
        ...(input.rate === undefined ? {} : { rate: input.rate }),
        ...(input.engine === undefined ? {} : { engine: input.engine }),
      },
      // From the workspace: a relative `outDir` in the spec is not used (we pass
      // an absolute one), but a project-local config should still apply.
      cwd: input.root,
      timeoutMs: 15 * 60_000,
    })
    const result = lastResult(events)
    if (result === null) throw new Error('语音合成没有返回结果')
    const sheet = typeof result.sheet === 'string' ? result.sheet : ''
    return {
      ...result,
      sheetRel: sheet === '' ? '' : relative(input.root, sheet).split(sep).join('/'),
      filesRel: ((result.files as Array<Record<string, unknown>>) ?? []).map((file) => relative(input.root, String(file.path)).split(sep).join('/')),
    }
  }

  // --- runtime probe -----------------------------------------------------

  /** Whether the bundled runtime is usable, cached for a minute. */
  /**
   * Finished films sitting in the workspace, whether or not this plugin made them.
   *
   * The render index only knows about jobs *this* installation ran. A workspace
   * that already contains `animations/*.mp4` — produced by another DSH home, a
   * previous install, or by hand — is exactly what a user expects to find in the
   * 文件 menu, so the list is built from the disk, not from the index.
   *
   * @param root - the canonical workspace root.
   * @returns films newest first.
   */
  async scanVideos(root: string): Promise<Array<{ rel: string; name: string; at: number; size: number }>> {
    const dir = join(root, this.config.outputDir)
    let names: string[]
    try {
      names = (await readdir(dir)).filter((name) => /\.(mp4|webm|mov|m4v)$/i.test(name))
    } catch {
      return []
    }
    const found: Array<{ rel: string; name: string; at: number; size: number }> = []
    for (const name of names) {
      const abs = join(dir, name)
      try {
        const info = await stat(abs)
        if (!info.isFile()) continue
        found.push({ rel: `${this.config.outputDir}/${name}`, name, at: info.mtimeMs, size: info.size })
      } catch {
        // A file that vanished between readdir and stat is simply not listed.
      }
    }
    return found.sort((a, b) => b.at - a.at)
  }

  /**
   * Build the render runtime on the user's behalf.
   *
   * The venv is ~500 MB of Python and cannot be produced at install time (a
   * package install must not run a long download, and pnpm would gate a build
   * script anyway). Doing it from a button here is the difference between "read
   * this command and go find the install directory" and "click 搭建运行时".
   *
   * @returns the tail of the run and a fresh probe.
   */
  async setupRuntime(): Promise<{ ok: boolean; code: number; output: string; probe: Record<string, unknown> }> {
    const script = join(PLUGIN_ROOT, 'runtime', 'setup-runtime.mjs')
    if (!existsSync(script)) {
      return { ok: false, code: -1, output: `missing ${script}`, probe: await this.probe(true) }
    }
    const output = await new Promise<string>((resolve) => {
      const child = spawn(process.execPath, [script], { cwd: PLUGIN_ROOT, windowsHide: true })
      let buffer = ''
      const collect = (chunk: unknown): void => {
        buffer += String(chunk)
        if (buffer.length > 8000) buffer = buffer.slice(-8000)
      }
      child.stdout?.on('data', collect)
      child.stderr?.on('data', collect)
      const timer = setTimeout(() => { try { child.kill() } catch { /* already gone */ } }, 30 * 60 * 1000)
      child.on('close', (code) => { clearTimeout(timer); resolve(`${buffer}
[exit ${String(code)}]`) })
      child.on('error', (error) => { clearTimeout(timer); resolve(`${buffer}
[spawn error] ${error.message}`) })
    })
    const probe = await this.probe(true)
    return { ok: probe.pythonPresent === true, code: probe.pythonPresent === true ? 0 : 1, output, probe }
  }

  /**
   * Append a browser-side failure to a file next to the render cache.
   *
   * Written for one reason: when the panel is what breaks, the renderer console is
   * not reachable, and "nothing showed up" is not a report. The file is bounded by
   * truncating from the head.
   *
   * @param entry - the failure the panel reported.
   */
  async appendClientLog(entry: { where?: unknown; message?: unknown; stack?: unknown }): Promise<void> {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      where: typeof entry.where === 'string' ? entry.where : '',
      message: typeof entry.message === 'string' ? entry.message : String(entry.message ?? ''),
      stack: typeof entry.stack === 'string' ? entry.stack.slice(0, 4000) : '',
    }) + String.fromCharCode(10)
    const file = join(this.config.cacheDir, 'client-failures.log')
    try {
      await mkdir(this.config.cacheDir, { recursive: true })
      await appendFile(file, line, 'utf8')
      const size = (await stat(file)).size
      if (size > CLIENT_LOG_LIMIT) {
        const kept = (await readFile(file, 'utf8')).slice(-Math.floor(CLIENT_LOG_LIMIT / 2))
        await writeFile(file, kept, 'utf8')
      }
    } catch {
      // Logging must never bubble: the caller is already reporting a failure.
    }
  }

  async probe(force = false): Promise<Record<string, unknown>> {
    if (!force && this.probeCache !== null && Date.now() - this.probeCache.at < 60_000) {
      return this.probeCache.value
    }
    const base = {
      pythonPath: this.config.pythonPath,
      pythonPresent: existsSync(this.config.pythonPath),
      driverPath: this.config.driverPath,
      driverPresent: existsSync(this.config.driverPath),
      cacheDir: this.config.cacheDir,
      pluginRoot: PLUGIN_ROOT,
    }
    if (!base.pythonPresent) {
      const value = {
        ok: false,
        ...base,
        error: '运行时还没装好：跑 node runtime/setup-runtime.mjs 建它。'
          + '如果已经装过但公式/渲染报依赖错，跑 node runtime/setup-runtime.mjs --repair。'
          + '不要直接往这个 venv 里 pip install —— 钉住的版本写在那个脚本里。',
      }
      this.probeCache = { at: Date.now(), value }
      return value
    }
    try {
      const events = await runDriver({
        pythonPath: this.config.pythonPath,
        driverPath: this.config.driverPath,
        spec: { mode: 'probe' },
        timeoutMs: 120_000,
      })
      const result = lastResult(events)
      const value = { ...base, ...(result ?? {}), ok: result?.ok !== false }
      this.probeCache = { at: Date.now(), value }
      return value
    } catch (error) {
      const value = { ok: false, ...base, error: error instanceof Error ? error.message : String(error) }
      this.probeCache = { at: Date.now(), value }
      return value
    }
  }
}

/** The `result` event of a driver run, or null. */
function lastResult(events: DriverEvent[]): Record<string, unknown> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].ev === 'result') return events[index] as Record<string, unknown>
  }
  return null
}

/** Turn a free-form name into a Python class name. */
export function safeClassName(value: string): string {
  // Split on everything that is not alphanumeric — `_` included, so
  // `my_explainer_v2` becomes `MyExplainerV2` rather than `My_explainer_v2`.
  const parts = value.split(/[^A-Za-z0-9]+/).filter((part) => part !== '')
  const joined = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  const cleaned = joined.replace(/^[^A-Za-z_]+/, '')
  return cleaned === '' ? 'Explainer' : cleaned.slice(0, 60)
}

/** Whether a path is inside a directory, tolerant of case on Windows. */
export function within(root: string, candidate: string): boolean {
  return isPathInside(root, candidate) || normalizeForPrefix(candidate).startsWith(normalizeForPrefix(root) + sep)
}
