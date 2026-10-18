/**
 * The render engine: one Python process per job, progress as it happens.
 *
 * The driver (`runtime/engine/driver.py`) writes newline-delimited JSON events
 * on stdout and human logs on stderr; this module is the reader. Keeping the
 * contract that narrow is deliberate — it means the render side can be tested
 * and iterated on from a terminal (`node tools/render-check.mjs`) without DSH
 * running at all, and a crash inside manim can never take the host down with it.
 *
 * Jobs live in memory only. A render is not resumable — if DSH restarts
 * mid-render the process is gone — so the plugin never pretends otherwise; what
 * survives a restart is the *artifact*, which sits at a predictable path the
 * service can find again (see `service.ts`).
 *
 * @module dsh-manim/engine
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'

/** Where a job is in its life. */
export type JobState = 'planning' | 'rendering' | 'done' | 'failed' | 'cancelled'

/** Progress as the panel needs it. */
export interface JobProgress {
  /** Animations finished. */
  done: number
  /** Number of the animation running now (1-based; 0 before the first). */
  index: number
  /** Total animations, once the plan pass has measured them. */
  total: number | null
  /** 0..1 over the whole render, or null while the total is unknown. */
  fraction: number | null
  /** 0..1 within the current animation. */
  animFraction: number
  /** Seconds since the render pass started. */
  elapsed: number
  /** What is being played right now, e.g. `Write, FadeIn`. */
  label: string
}

/** A still extracted from a finished render. */
export interface Frame {
  time: number
  path: string
  width: number
  height: number
}

/** The outcome of a successful render. */
export interface RenderResult {
  video: string
  duration: number | null
  plays: number
  width: number
  height: number
  fps: number
  /** A copy inside the workspace, when `outputDir` is set. */
  output?: string
}

/** One render job. */
export interface RenderJob {
  id: string
  /** The workspace this job belongs to (an absolute root path). */
  root: string
  /** The scene file, absolute. */
  path: string
  /** The scene class, once known. */
  scene: string | null
  /** The quality id used. */
  quality: string
  state: JobState
  progress: JobProgress
  /** Tail of the driver's stderr, newest last (capped). */
  log: string[]
  startedAt: number
  endedAt: number | null
  result: RenderResult | null
  error: { kind: string; message: string; traceback?: string } | null
  /** Stills pulled from the finished video on request. */
  frames: Frame[]
  /**
   * Whether `publishRender` has already copied and indexed this render.
   *
   * A separate flag rather than "no `result.output` yet": with `outputDir: ''`
   * there is never an output path, so that test would re-publish (and re-write
   * the index file) on every single poll.
   */
  published: boolean
  /** Whether this job was started by a tool call or by the panel. */
  origin: 'tool' | 'panel'
}

/** The spec the driver understands (see `runtime/engine/driver.py`). */
export interface DriverSpec {
  mode: 'list' | 'plan' | 'render' | 'frames' | 'probe'
  sceneFile?: string
  sceneName?: string | null
  mediaDir?: string
  outputName?: string | null
  width?: number
  height?: number
  fps?: number
  background?: string | null
  transparent?: boolean
  format?: string
  plan?: boolean
  totalPlays?: number | null
  video?: string | null
  times?: number[]
  count?: number
  outDir?: string | null
  frameWidth?: number | null
}

/** One parsed driver event. */
export interface DriverEvent {
  ev: 'hello' | 'scenes' | 'plan' | 'phase' | 'progress' | 'frames' | 'log' | 'result' | 'error'
  [key: string]: unknown
}

/**
 * Environment every Python child gets.
 *
 * `PYTHONDONTWRITEBYTECODE` is the important one: importing a scene file writes
 * `__pycache__/` next to it, which puts build droppings in the user's workspace
 * for a file the plugin promised only to read. manim itself does not care either
 * way — it imports each scene once per process.
 */
export const PYTHON_ENV: NodeJS.ProcessEnv = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }

/** Ring-buffer size for the log tail the panel shows. */
const LOG_LIMIT = 400
/** Seconds a finished job stays in the map before it is pruned. */
const SWEEP_INTERVAL_MS = 60_000

/**
 * Run one driver invocation to completion and collect its events.
 *
 * Used for the short modes (`list`, `probe`, `frames`) where there is nothing to
 * watch: they finish in a second or two and the caller wants the answer, not a
 * handle.
 *
 * @param options - interpreter, script, spec, working directory, timeout.
 * @returns every event the driver emitted, in order.
 */
export async function runDriver(options: {
  pythonPath: string
  driverPath: string
  spec: DriverSpec | Record<string, unknown>
  cwd?: string
  timeoutMs?: number
}): Promise<DriverEvent[]> {
  const { pythonPath, driverPath, spec, cwd, timeoutMs = 120_000 } = options
  return await runPythonSpec({ pythonPath, scriptPath: driverPath, spec, cwd, timeoutMs })
}

/**
 * Run one of the plugin's Python helpers and collect its NDJSON events.
 *
 * Shared by the render driver and the narration helper (`engine/voice.py`)
 * because they deliberately speak the same protocol — stdout is events, stderr
 * is for humans — so the failure handling, the timeout and the environment are
 * written (and fixed) once.
 *
 * @param options - interpreter, script, JSON spec, working directory, timeout.
 * @returns every event the script emitted, in order.
 */
export async function runPythonSpec(options: {
  pythonPath: string
  scriptPath: string
  spec: Record<string, unknown>
  cwd?: string
  timeoutMs?: number
}): Promise<DriverEvent[]> {
  const { pythonPath, scriptPath: driverPath, spec, cwd, timeoutMs = 120_000 } = options
  return await new Promise<DriverEvent[]>((resolve, reject) => {
    const events: DriverEvent[] = []
    let stderr = ''
    const child = spawn(pythonPath, [driverPath, JSON.stringify(spec)], {
      cwd: cwd ?? dirname(driverPath),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: PYTHON_ENV,
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`driver timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    let buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const event = parseEvent(line)
        if (event !== null) events.push(event)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-8000)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`cannot start ${pythonPath}: ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const tail = parseEvent(buffer)
      if (tail !== null) events.push(tail)
      const failure = events.find((event) => event.ev === 'error')
      if (failure !== undefined) {
        reject(new Error(String(failure.message ?? 'driver failed')))
        return
      }
      if (code !== 0) {
        reject(new Error(`driver exited with code ${code}\n${stderr.slice(-1200)}`))
        return
      }
      resolve(events)
    })
  })
}

/** Parse one NDJSON line, tolerating anything the driver or manim printed. */
export function parseEvent(line: string): DriverEvent | null {
  const text = line.trim()
  if (text === '' || !text.startsWith('{')) return null
  try {
    const value = JSON.parse(text) as unknown
    if (typeof value !== 'object' || value === null) return null
    const record = value as Record<string, unknown>
    if (typeof record.ev !== 'string') return null
    return record as DriverEvent
  } catch {
    return null
  }
}

/** The empty progress record a job starts with. */
function initialProgress(): JobProgress {
  return { done: 0, index: 0, total: null, fraction: null, animFraction: 0, elapsed: 0, label: '' }
}

/**
 * Owns the running jobs and the processes behind them.
 *
 * One instance per plugin mount; the routes poll it and the tools await it.
 */
export class RenderEngine {
  private readonly jobs = new Map<string, RenderJob>()
  private readonly children = new Map<string, ChildProcessWithoutNullStreams>()
  private readonly timer: NodeJS.Timeout

  /**
   * @param options - interpreter and driver to spawn, job TTL, and the hard
   *   ceiling on one render.
   */
  constructor(
    private readonly options: {
      pythonPath: string
      driverPath: string
      jobTtlSeconds: number
      renderTimeoutSeconds: number
    },
  ) {
    this.timer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS)
    // A render can outlive the plugin in a dev loop; do not hold the process
    // open just for the sweeper.
    this.timer.unref?.()
  }

  /** Stop the sweeper and kill anything still running. */
  dispose(): void {
    clearInterval(this.timer)
    for (const id of [...this.children.keys()]) this.cancel(id)
  }

  /** Every job, newest first. */
  list(): RenderJob[] {
    return [...this.jobs.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  /** One job by id. */
  get(id: string): RenderJob | undefined {
    return this.jobs.get(id)
  }

  /** The most recent job for one scene file, if any. */
  latestFor(root: string, path: string): RenderJob | undefined {
    return this.list().find((job) => job.root === root && job.path === path)
  }

  /** Drop a finished job from the map (the artifact stays on disk). */
  forget(id: string): boolean {
    const job = this.jobs.get(id)
    if (job === undefined || job.endedAt === null) return false
    this.jobs.delete(id)
    return true
  }

  /**
   * Start a render.
   *
   * @param spec - the driver spec (mode `render`).
   * @param meta - identity the job needs for lookups.
   * @returns the job, already in `planning` state.
   */
  start(
    spec: DriverSpec,
    meta: { root: string; path: string; scene: string | null; quality: string; origin: 'tool' | 'panel' },
  ): RenderJob {
    const id = randomUUID()
    const job: RenderJob = {
      id,
      root: meta.root,
      path: meta.path,
      scene: meta.scene,
      quality: meta.quality,
      state: 'planning',
      progress: initialProgress(),
      log: [],
      startedAt: Date.now(),
      endedAt: null,
      result: null,
      error: null,
      frames: [],
      published: false,
      origin: meta.origin,
    }
    this.jobs.set(id, job)
    this.spawnJob(job, spec)
    return job
  }

  /** Ask a running job to stop. Returns whether it was running. */
  cancel(id: string): boolean {
    const child = this.children.get(id)
    const job = this.jobs.get(id)
    if (child === undefined || job === undefined) return false
    job.state = 'cancelled'
    job.endedAt = Date.now()
    this.children.delete(id)
    child.kill()
    // A Python process that is mid-encode ignores a polite kill surprisingly
    // often; escalate rather than leave a render eating cores forever.
    const escalate = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // Already gone.
      }
    }, 4000)
    escalate.unref?.()
    this.pushLog(job, '已请求取消渲染', 'warn')
    return true
  }

  /** Register stills the service extracted for a finished job. */
  setFrames(id: string, frames: Frame[]): void {
    const job = this.jobs.get(id)
    if (job !== undefined) job.frames = frames
  }

  private spawnJob(job: RenderJob, spec: DriverSpec): void {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(this.options.pythonPath, [this.options.driverPath, JSON.stringify(spec)], {
        // Run from the scene's directory so a project-local `manim.cfg` and
        // relative asset paths behave the way they would under the plain CLI.
        cwd: spec.sceneFile === undefined ? dirname(this.options.driverPath) : dirname(spec.sceneFile),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: PYTHON_ENV,
      })
    } catch (error) {
      job.state = 'failed'
      job.endedAt = Date.now()
      job.error = { kind: 'spawn', message: error instanceof Error ? error.message : String(error) }
      return
    }

    this.children.set(job.id, child)
    this.pushLog(job, `python ${this.options.pythonPath}`, 'info')

    const deadline = setTimeout(() => {
      this.pushLog(job, `渲染超过 ${this.options.renderTimeoutSeconds}s，已终止`, 'error')
      this.cancel(job.id)
    }, this.options.renderTimeoutSeconds * 1000)
    deadline.unref?.()

    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      const lines = stdout.split('\n')
      stdout = lines.pop() ?? ''
      for (const line of lines) {
        const event = parseEvent(line)
        if (event !== null) this.handleEvent(job, event)
      }
    })

    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      const lines = stderr.split('\n')
      stderr = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim() !== '') this.pushLog(job, line.trimEnd(), 'info')
      }
    })

    child.on('error', (error) => {
      clearTimeout(deadline)
      this.pushLog(job, `无法启动渲染进程：${error.message}`, 'error')
      this.finish(job, 'failed', { kind: 'spawn', message: error.message })
    })

    child.on('close', (code) => {
      clearTimeout(deadline)
      this.children.delete(job.id)
      if (stderr.trim() !== '') this.pushLog(job, stderr.trimEnd(), 'info')
      if (job.state === 'cancelled' || job.state === 'done') return
      if (job.error !== null) {
        this.finish(job, 'failed', job.error)
        return
      }
      if (code !== 0) {
        this.finish(job, 'failed', { kind: 'exit', message: `渲染进程退出码 ${code}` })
        return
      }
      // A zero exit with no result means the driver died between the last event
      // and its result line — treat it as a failure rather than a silent no-op.
      this.finish(job, 'failed', { kind: 'protocol', message: '渲染进程没有返回结果' })
    })
  }

  private handleEvent(job: RenderJob, event: DriverEvent): void {
    switch (event.ev) {
      case 'progress': {
        job.state = 'rendering'
        const total = typeof event.total === 'number' ? event.total : null
        job.progress = {
          done: typeof event.done === 'number' ? event.done : job.progress.done,
          index: typeof event.plays === 'number' ? event.plays : job.progress.index,
          total,
          fraction: typeof event.frame === 'number' ? event.frame : null,
          animFraction: typeof event.animFraction === 'number' ? event.animFraction : 0,
          elapsed: typeof event.elapsed === 'number' ? event.elapsed : 0,
          label: typeof event.label === 'string' ? event.label : '',
        }
        break
      }
      case 'plan': {
        job.state = 'planning'
        job.progress.total = typeof event.plays === 'number' ? event.plays : null
        if (typeof event.scene === 'string') job.scene = event.scene
        this.pushLog(
          job,
          `计划：共 ${job.progress.total ?? '?'} 段动画，总时长 ${typeof event.duration === 'number' ? event.duration.toFixed(1) : '?'} 秒`,
          'info',
        )
        break
      }
      case 'phase': {
        if (event.state === 'start' && event.phase === 'render') {
          job.state = 'rendering'
          job.progress = { ...job.progress, elapsed: 0 }
          this.pushLog(job, '开始渲染', 'info')
        }
        break
      }
      case 'log': {
        this.pushLog(job, String(event.text ?? ''), String(event.level ?? 'info'))
        break
      }
      case 'result': {
        const video = typeof event.video === 'string' ? event.video : null
        if (video === null) {
          this.finish(job, 'failed', { kind: 'protocol', message: '结果里没有视频路径' })
          return
        }
        job.result = {
          video,
          duration: typeof event.duration === 'number' ? event.duration : null,
          plays: typeof event.plays === 'number' ? event.plays : job.progress.done,
          width: typeof event.width === 'number' ? event.width : 0,
          height: typeof event.height === 'number' ? event.height : 0,
          fps: typeof event.fps === 'number' ? event.fps : 0,
        }
        if (typeof event.scene === 'string') job.scene = event.scene
        job.progress.done = job.result.plays
        job.progress.fraction = 1
        this.finish(job, 'done', null)
        break
      }
      case 'error': {
        job.error = {
          kind: String(event.kind ?? 'internal'),
          message: String(event.message ?? '渲染失败'),
          ...(typeof event.traceback === 'string' ? { traceback: event.traceback } : {}),
        }
        break
      }
      default:
        break
    }
  }

  private finish(job: RenderJob, state: JobState, error: RenderJob['error']): void {
    if (job.endedAt !== null) return
    job.state = state
    job.endedAt = Date.now()
    job.error = error
    this.children.delete(job.id)
  }

  private pushLog(job: RenderJob, text: string, level: string): void {
    job.log.push(level === 'info' ? text : `[${level}] ${text}`)
    if (job.log.length > LOG_LIMIT) job.log.splice(0, job.log.length - LOG_LIMIT)
  }

  private sweep(): void {
    const cutoff = Date.now() - this.options.jobTtlSeconds * 1000
    for (const job of this.jobs.values()) {
      if (job.endedAt !== null && job.endedAt < cutoff) this.jobs.delete(job.id)
    }
  }
}
