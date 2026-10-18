/**
 * dsh-manim plugin config.
 *
 * Every field is optional and every field has a working default, because the
 * plugin has to survive a profile patch that says `config: {}` — a missing key
 * must not be the reason a render fails.
 *
 * @module dsh-manim/config
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** All agent-visible tool ids. */
export const TOOL_IDS = ['manim_scene', 'manim_render', 'manim_frames', 'manim_voice'] as const

export type ToolId = (typeof TOOL_IDS)[number]

/** A resolution preset the panel and the tools both offer. */
export interface Quality {
  /** Stable id, also used as a cache directory name. */
  id: string
  /** Human label. */
  label: string
  width: number
  height: number
  fps: number
}

/**
 * The presets, in the order the panel shows them.
 *
 * `draft` exists because iteration speed is the whole game when authoring an
 * animation: a 480p15 pass of a two-minute scene renders in about a twentieth
 * of the 1080p60 time, and at that size layout and timing problems are already
 * visible.
 */
export const QUALITIES: readonly Quality[] = [
  { id: 'draft', label: '草稿 480p15', width: 854, height: 480, fps: 15 },
  { id: '720p30', label: '标清 720p30', width: 1280, height: 720, fps: 30 },
  { id: '1080p60', label: '高清 1080p60', width: 1920, height: 1080, fps: 60 },
  { id: '1440p60', label: '超清 1440p60', width: 2560, height: 1440, fps: 60 },
  { id: '4k60', label: '4K 2160p60', width: 3840, height: 2160, fps: 60 },
]

/** The preset a render uses when the caller names none. */
export const DEFAULT_QUALITY = '1080p60'

/** Resolve a quality id, or `undefined` when it is not one of the presets. */
export function qualityById(id: string): Quality | undefined {
  return QUALITIES.find((quality) => quality.id === id)
}

/** Where the plugin's own files live (`<plugin>/`, from `lib/index.js`). */
export const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Config after defaults have been applied. */
export interface Config {
  /** Tool ids the model may call; `'*'` exposes all, `[]` exposes none. */
  agentTools: ToolId[] | '*'
  /** Python interpreter running manim. Defaults to the bundled venv. */
  pythonPath: string
  /** The render driver script. */
  driverPath: string
  /** The narration helper script (`engine/voice.py`). */
  voicePath: string
  /** Root of the media cache (renders, manim's internal caches, stills). */
  cacheDir: string
  /**
   * Workspace-relative directory a finished `.mp4` is copied into.
   * `''` disables the copy and leaves the video in the cache only.
   */
  outputDir: string
  /** Scene background colour (any CSS colour manim accepts). */
  background: string
  /** Quality id used when a call names none. */
  defaultQuality: string
  /** Scene files larger than this are not scanned for `Scene` subclasses. */
  maxSceneBytes: number
  /** Seconds a finished job stays queryable. */
  jobTtlSeconds: number
  /**
   * How many of a render's segments may be encoded while the scene keeps
   * rendering.
   *
   * manim's default is **1**, which means encode and render never overlap: each
   * animation's file is written before the next animation starts. manim's own
   * comment calls 4 "a good value on typical hardware", and on a 67-animation
   * scene that serialisation is a real share of the wall clock. The cost of
   * raising it is memory — each in-flight encoder can hold `encoder_queue_size`
   * (8) full frames, ~8 MB each at 1080p.
   */
  maxInflightEncoders: number
  /**
   * Hard ceiling on one render, after which the process is killed.
   *
   * Generous on purpose: a 4K60 render of a three-minute scene genuinely takes
   * tens of minutes, and killing it at ten would be the plugin's fault, not the
   * user's. The panel has a cancel button for the case where it is stuck.
   */
  renderTimeoutSeconds: number
}

/** Raw loader config (all fields optional). */
export interface RawConfig {
  agentTools?: unknown
  pythonPath?: unknown
  driverPath?: unknown
  voicePath?: unknown
  cacheDir?: unknown
  outputDir?: unknown
  background?: unknown
  defaultQuality?: unknown
  maxSceneBytes?: unknown
  jobTtlSeconds?: unknown
  renderTimeoutSeconds?: unknown
  maxInflightEncoders?: unknown
}

/**
 * The interpreter inside the plugin's own venv.
 *
 * `runtime/setup-runtime.mjs` creates it; `runtime/README.md` explains why the
 * plugin carries a virtual environment instead of using whatever `python` is on
 * PATH (short version: anaconda's base environment is the user's, and installing
 * a renderer into it is not this plugin's business).
 */
export function defaultPythonPath(): string {
  const root = join(PLUGIN_ROOT, 'runtime', 'venv')
  const windows = join(root, 'Scripts', 'python.exe')
  return existsSync(windows) ? windows : join(root, 'bin', 'python')
}

/** Apply defaults to the raw loader config. */
export function resolveConfig(raw: RawConfig | undefined): Config {
  const tools = raw?.agentTools
  const agentTools: ToolId[] | '*' =
    tools === '*'
      ? '*'
      : Array.isArray(tools)
        ? tools.filter((id): id is ToolId => (TOOL_IDS as readonly string[]).includes(id))
        : [...TOOL_IDS]

  const quality = typeof raw?.defaultQuality === 'string' ? raw.defaultQuality : ''
  const number = (value: unknown, fallback: number, min: number, max: number): number =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, Math.round(value)))
      : fallback

  return {
    agentTools,
    pythonPath: typeof raw?.pythonPath === 'string' && raw.pythonPath !== '' ? raw.pythonPath : defaultPythonPath(),
    driverPath:
      typeof raw?.driverPath === 'string' && raw.driverPath !== ''
        ? raw.driverPath
        : join(PLUGIN_ROOT, 'runtime', 'engine', 'driver.py'),
    voicePath:
      typeof raw?.voicePath === 'string' && raw.voicePath !== ''
        ? raw.voicePath
        : join(PLUGIN_ROOT, 'runtime', 'engine', 'voice.py'),
    cacheDir:
      typeof raw?.cacheDir === 'string' && raw.cacheDir !== ''
        ? raw.cacheDir
        : join(PLUGIN_ROOT, 'cache'),
    outputDir: typeof raw?.outputDir === 'string' ? raw.outputDir : 'animations',
    background: typeof raw?.background === 'string' && raw.background !== '' ? raw.background : '#10141c',
    defaultQuality: qualityById(quality) ? quality : DEFAULT_QUALITY,
    maxSceneBytes: number(raw?.maxSceneBytes, 512 * 1024, 4096, 64 * 1024 * 1024),
    jobTtlSeconds: number(raw?.jobTtlSeconds, 1800, 60, 86400),
    renderTimeoutSeconds: number(raw?.renderTimeoutSeconds, 3600, 60, 43200),
    maxInflightEncoders: number(raw?.maxInflightEncoders, 4, 1, 32),
  }
}

/** Whether a tool id is exposed by the config. */
export function exposed(config: Config, id: ToolId): boolean {
  return config.agentTools === '*' || config.agentTools.includes(id)
}
