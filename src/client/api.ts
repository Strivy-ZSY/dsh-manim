/**
 * Browser-side API client for the `/dsh-manim` route family.
 *
 * Plain `fetch`, same origin, JSON envelope — the pattern dsh-drawio, dsh-ssh,
 * dsh-aio-nui and dsh-ppt already use, rather than typert remote machinery. The
 * console stays readable when a route is probed with `curl`, and the panel cannot
 * take the module graph down with it.
 *
 * The wire types are imported with `import type`, so nothing from the host half
 * (or its `node:*` imports) reaches the browser bundle — the build erases them.
 *
 * @module dsh-manim/client/api
 */

import type { Frame, RenderJob } from '../engine.ts'
import type { RenderRecord, SceneEntry } from '../service.ts'

/** A quality preset as the panel needs it. */
export interface QualityOption {
  id: string
  label: string
  width: number
  height: number
  fps: number
}

/** What `/list` answers with. */
export interface ListResult {
  root: string
  scenes: SceneEntry[]
  jobs: Array<Record<string, unknown> & { id: string; state: string }>
  qualities: QualityOption[]
  defaultQuality: string
  background: string
  outputDir: string
}

/** What `/inspect` answers with. */
export interface InspectResult {
  path: string
  scenes: Array<{ name: string; doc: string; bases: string[] }>
}

/** The job view the routes send (a `RenderJob` with no process handles). */
export type JobView = Omit<RenderJob, never>

/** `error` from the JSON envelope. */
export interface ApiErrorShape {
  code: string
  message: string
}

/** Error carrying the route's JSON error code and message. */
export class ManimApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ManimApiError'
  }
}

/** POST one JSON envelope request, or throw a ManimApiError. */
async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new ManimApiError(`network error: ${error instanceof Error ? error.message : String(error)}`, 'network')
  }
  let envelope: { ok: boolean; value?: T; error?: ApiErrorShape }
  try {
    envelope = (await response.json()) as typeof envelope
  } catch {
    throw new ManimApiError(`HTTP ${response.status}: invalid JSON response`, 'protocol')
  }
  if (envelope.ok !== true) {
    throw new ManimApiError(envelope.error?.message ?? `HTTP ${response.status}`, envelope.error?.code ?? 'protocol')
  }
  return envelope.value as T
}

/** The studio's host face. */
export interface StudioRemote {
  list: (request: { root: string; refresh?: boolean }) => Promise<ListResult>
  inspect: (request: { root: string; path: string }) => Promise<InspectResult>
  render: (request: { root: string; path: string; scene?: string; quality?: string }) => Promise<{ job: JobView }>
  job: (request: { id: string }) => Promise<{ job: JobView }>
  cancel: (request: { id: string }) => Promise<{ cancelled: boolean }>
  forget: (request: { id: string }) => Promise<{ forgotten: boolean }>
  storyboard: (request: {
    id?: string
    root?: string
    path?: string
    scene?: string
    quality?: string
    count?: number
    width?: number
  }) => Promise<{ frames: Frame[]; video: string }>
  template: (request: { root: string; name?: string; dir?: string }) => Promise<{ path: string; scene: string; rel: string }>
  probe: (request: { force?: boolean }) => Promise<Record<string, unknown>>
  /** A URL usable directly as a `<video src>`. */
  videoUrl: (request: { id?: string; root?: string; path?: string; scene?: string; quality?: string }) => string
  /** A URL usable directly as an `<img src>`. */
  frameUrl: (file: string) => string
}

/** Fetch-based implementation. */
export class StudioApi implements StudioRemote {
  /** @param root - the workspace root (session cwd) every call is bound to. */
  constructor(private readonly root: string) {}

  list(request: { root: string; refresh?: boolean }): Promise<ListResult> {
    return post<ListResult>('/dsh-manim/list', { root: this.root, refresh: request.refresh === true })
  }

  inspect(request: { root: string; path: string }): Promise<InspectResult> {
    return post<InspectResult>('/dsh-manim/inspect', { root: this.root, path: request.path })
  }

  render(request: { root: string; path: string; scene?: string; quality?: string }): Promise<{ job: JobView }> {
    return post<{ job: JobView }>('/dsh-manim/render', {
      root: this.root,
      path: request.path,
      ...(request.scene === undefined ? {} : { scene: request.scene }),
      ...(request.quality === undefined ? {} : { quality: request.quality }),
    })
  }

  job(request: { id: string }): Promise<{ job: JobView }> {
    return post<{ job: JobView }>('/dsh-manim/job', { id: request.id })
  }

  cancel(request: { id: string }): Promise<{ cancelled: boolean }> {
    return post<{ cancelled: boolean }>('/dsh-manim/cancel', { id: request.id })
  }

  forget(request: { id: string }): Promise<{ forgotten: boolean }> {
    return post<{ forgotten: boolean }>('/dsh-manim/forget', { id: request.id })
  }

  storyboard(request: {
    id?: string
    root?: string
    path?: string
    scene?: string
    quality?: string
    count?: number
    width?: number
  }): Promise<{ frames: Frame[]; video: string }> {
    return post<{ frames: Frame[]; video: string }>('/dsh-manim/storyboard', {
      ...request,
      ...(request.id === undefined ? { root: this.root } : {}),
    })
  }

  template(request: { root: string; name?: string; dir?: string }): Promise<{ path: string; scene: string; rel: string }> {
    return post<{ path: string; scene: string; rel: string }>('/dsh-manim/template', {
      root: this.root,
      ...(request.name === undefined ? {} : { name: request.name }),
      ...(request.dir === undefined ? {} : { dir: request.dir }),
    })
  }

  probe(request: { force?: boolean }): Promise<Record<string, unknown>> {
    return post<Record<string, unknown>>('/dsh-manim/probe', { force: request.force === true })
  }

  videoUrl(request: { id?: string; root?: string; path?: string; scene?: string; quality?: string }): string {
    const query = new URLSearchParams()
    if (request.id !== undefined) query.set('id', request.id)
    else {
      query.set('root', this.root)
      if (request.path !== undefined) query.set('path', request.path)
      if (request.scene !== undefined) query.set('scene', request.scene)
      if (request.quality !== undefined) query.set('quality', request.quality)
    }
    return `/dsh-manim/video?${query.toString()}`
  }

  frameUrl(file: string): string {
    return `/dsh-manim/frame?file=${encodeURIComponent(file)}`
  }
}
