/**
 * dsh-manim routes: the `/dsh-manim/*` family behind a loopback fence.
 *
 * The shape is the one dsh-drawio, dsh-ssh, dsh-ppt and dsh-aionui-panel all
 * use: plain `fetch` + JSON envelope for operations, a bare GET for binary. No
 * typert remote machinery, so the panel works against a plain `curl` and a
 * broken panel cannot break the GUI's module graph.
 *
 * Two details are specific to video:
 *
 * * `GET /video` implements **HTTP Range**. A `<video>` element without range
 *   support cannot seek, and seeking is the whole interaction model of a
 *   storyboard: click a frame, jump to that moment.
 * * `GET /frame` serves a still **only from inside the plugin cache**. The
 *   route takes an absolute path because manim's driver reports absolute
 *   still paths, and an unguarded absolute-path file reader on a loopback HTTP
 *   server is a file-disclosure hole; the cache prefix is the entire allowed
 *   set, which is why nothing in a workspace needs to be readable here.
 *
 * @module dsh-manim/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { QUALITIES, type Config } from './config.ts'
import { isPathInside, type ManimService } from './service.ts'
import type { RenderEngine, RenderJob } from './engine.ts'

/** A JSON envelope the panel decodes. */
export type Envelope<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

const BAD_REQUEST = { code: 'invalid', message: 'malformed request' } as const

/** Loopback trust fence (the same one dsh-drawio / dsh-ppt apply). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** Read a JSON request body into an unknown value; null when unparseable. */
async function readJsonBody(req: IncomingMessage, limit = 1 << 20): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    chunks.push(buffer)
    total += buffer.length
    if (total > limit) return null
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** A required non-empty string field. */
function strField(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/** An optional string field, accepting the empty string. */
function strOrEmpty(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

/** An optional integer field. */
function intField(payload: unknown, key: string): number | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value))) return Math.round(Number(value))
  return null
}

/** Write a JSON envelope. */
function json(res: ServerResponse, envelope: Envelope<unknown>, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(envelope))
}

/** Write a failure with the HTTP status that fits the error code. */
function fail(res: ServerResponse, code: string, message: string): void {
  const status =
    code === 'workspace' ? 403
      : code === 'not-found' ? 404
        : code === 'invalid' ? 422
          : code === 'busy' ? 409
            : 500
  json(res, { ok: false, error: { code, message } }, status)
}

/** The wire shape of a job: everything the panel needs, no process handles. */
function jobView(job: RenderJob): Record<string, unknown> {
  return {
    id: job.id,
    path: job.path,
    scene: job.scene,
    quality: job.quality,
    state: job.state,
    progress: job.progress,
    log: job.log.slice(-120),
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    result: job.result,
    error: job.error,
    frames: job.frames,
    origin: job.origin,
  }
}

/**
 * Stream a file, honouring a single `Range` request.
 *
 * @param req - the request (for `Range`).
 * @param res - the response to write.
 * @param file - absolute path of an already-authorised file.
 * @param contentType - MIME type to declare.
 */
async function serveFile(req: IncomingMessage, res: ServerResponse, file: string, contentType: string): Promise<void> {
  let size: number
  try {
    const info = await stat(file)
    if (!info.isFile()) {
      res.writeHead(404)
      res.end()
      return
    }
    size = info.size
  } catch {
    res.writeHead(404)
    res.end()
    return
  }

  const range = req.headers.range
  const headers: Record<string, string> = {
    'content-type': contentType,
    'accept-ranges': 'bytes',
    'cache-control': 'no-cache',
  }
  if (typeof range === 'string') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (match !== null) {
      const start = match[1] === '' ? Math.max(0, size - Number(match[2])) : Number(match[1])
      const end = match[1] === '' || match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < size) {
        res.writeHead(206, {
          ...headers,
          'content-range': `bytes ${start}-${end}/${size}`,
          'content-length': String(end - start + 1),
        })
        createReadStream(file, { start, end }).pipe(res)
        return
      }
      res.writeHead(416, { 'content-range': `bytes */${size}` })
      res.end()
      return
    }
  }
  res.writeHead(200, { ...headers, 'content-length': String(size) })
  createReadStream(file).pipe(res)
}

/** MIME types this route family serves. */
const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.gif': 'image/gif',
  '.png': 'image/png',
}

/**
 * Register the `/dsh-manim` routes.
 *
 * @param ctx - context carrying the webServer service.
 * @param service - the gated workspace service.
 * @param engine - the running-job registry.
 * @param config - resolved plugin config.
 * @returns the route disposer.
 */
export function registerManimRoutes(
  ctx: Context,
  service: ManimService,
  engine: RenderEngine,
  config: Config,
): () => void {
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(req)) {
      json(res, { ok: false, error: { code: 'forbidden', message: 'loopback-only' } }, 403)
      return
    }
    if (req.method !== 'POST' && req.method !== 'GET') {
      res.writeHead(405)
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://x')

    if (req.method === 'GET') {
      switch (url.pathname) {
        case '/dsh-manim/video': {
          // Two ways to name the same artifact: a live/settled job id, or the
          // scene identity recorded in the index. The second is what makes a
          // render from a previous DSH session still playable.
          const id = url.searchParams.get('id')
          let file: string | null = null
          if (id !== null) {
            file = engine.get(id)?.result?.video ?? null
          } else {
            const root = url.searchParams.get('root') ?? ''
            const path = url.searchParams.get('path') ?? ''
            const quality = url.searchParams.get('quality') ?? ''
            const scene = url.searchParams.get('scene') ?? ''
            const gate = await service.gate(root)
            if (!gate.ok) {
              fail(res, 'workspace', gate.error)
              return
            }
            const records = await service.readIndex(gate.canonical)
            const record = records.find(
              (item) => item.sceneFile === path && item.quality === quality && (scene === '' || item.scene === scene),
            )
            file = record?.video ?? null
          }
          if (file === null) {
            res.writeHead(404)
            res.end()
            return
          }
          await serveFile(req, res, file, MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
          return
        }
        case '/dsh-manim/frame': {
          // Absolute path in, but only ever inside the plugin's own cache: the
          // stills this plugin produced. An arbitrary-path reader on a loopback
          // HTTP server is a file-disclosure hole; this prefix is the whole
          // permitted set.
          const file = url.searchParams.get('file') ?? ''
          const cache = resolve(config.cacheDir)
          if (file === '' || !isPathInside(cache, resolve(file))) {
            res.writeHead(403)
            res.end()
            return
          }
          await serveFile(req, res, resolve(file), MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
          return
        }
        default:
          res.writeHead(404)
          res.end()
          return
      }
    }

    // Everything below is POST-only JSON. Cross-site simple requests cannot set
    // `application/json`, so requiring it blocks form-based CSRF from driving
    // workspace operations.
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      fail(res, 'invalid', 'content-type must be application/json')
      return
    }
    const payload = await readJsonBody(req)
    if (payload === null) {
      fail(res, BAD_REQUEST.code, BAD_REQUEST.message)
      return
    }

    switch (url.pathname) {
      case '/dsh-manim/list': {
        const root = strField(payload, 'root')
        if (root === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message)
          return
        }
        const gate = await service.gate(root)
        if (!gate.ok) {
          fail(res, 'workspace', gate.error)
          return
        }
        const scenes = await service.listScenes(gate.canonical, { refresh: (payload as { refresh?: unknown }).refresh === true })
        json(res, {
          ok: true,
          value: {
            root: gate.canonical,
            scenes,
            jobs: engine.list().filter((job) => job.root === gate.canonical).map(jobView),
            qualities: QUALITIES,
            defaultQuality: config.defaultQuality,
            background: config.background,
            outputDir: config.outputDir,
          },
        })
        return
      }
      case '/dsh-manim/inspect': {
        const root = strField(payload, 'root')
        const path = strField(payload, 'path')
        if (root === null || path === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message)
          return
        }
        const gate = await service.gate(root)
        if (!gate.ok) {
          fail(res, 'workspace', gate.error)
          return
        }
        const target = await service.resolveScenePath(gate.canonical, path)
        if (!target.ok) {
          fail(res, 'invalid', target.error)
          return
        }
        const inspected = await service.inspectSceneFile(target.absolute)
        if (!inspected.ok) {
          fail(res, 'invalid', inspected.error ?? '无法解析场景文件')
          return
        }
        json(res, { ok: true, value: { path: target.absolute, scenes: inspected.scenes } })
        return
      }
      case '/dsh-manim/render': {
        const root = strField(payload, 'root')
        const path = strField(payload, 'path')
        if (root === null || path === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message)
          return
        }
        const gate = await service.gate(root)
        if (!gate.ok) {
          fail(res, 'workspace', gate.error)
          return
        }
        const target = await service.resolveScenePath(gate.canonical, path)
        if (!target.ok) {
          fail(res, 'invalid', target.error)
          return
        }
        const requestedScene = strField(payload, 'scene')
        const resolved = await service.resolveSceneName(target.absolute, requestedScene)
        if (!resolved.ok) {
          fail(res, 'invalid', resolved.error)
          return
        }
        const running = engine
          .list()
          .find((job) => job.root === gate.canonical && job.path === target.absolute && job.endedAt === null)
        if (running !== undefined) {
          fail(res, 'busy', `这个场景已经在渲染中（${running.scene ?? ''}），先取消或等它结束`)
          return
        }
        const quality = service.qualityFor(strField(payload, 'quality'))
        const job = await service.startRender({
          root: gate.canonical,
          path: target.absolute,
          scene: resolved.scene,
          quality,
          origin: 'panel',
        })
        json(res, { ok: true, value: { job: jobView(job) } })
        return
      }
      case '/dsh-manim/job': {
        const id = strField(payload, 'id')
        if (id === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message)
          return
        }
        const job = engine.get(id)
        if (job === undefined) {
          fail(res, 'not-found', '这个任务已经不在了（DSH 重启会清空任务，但视频文件还在）')
          return
        }
        // A job that has just finished is the moment its artifact needs
        // publishing, and the panel is the only thing polling — so the
        // work happens here rather than in a timer nobody owns.
        if (job.state === 'done' && job.result !== null && !job.published) {
          await service.publishRender(job.root, job)
        }
        json(res, { ok: true, value: { job: jobView(job) } })
        return
      }
      case '/dsh-manim/cancel': {
        const id = strField(payload, 'id')
        if (id === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message)
          return
        }
        const cancelled = engine.cancel(id)
        json(res, { ok: true, value: { cancelled } })
        return
      }
      case '/dsh-manim/forget': {
        const id = strField(payload, 'id')
        if (id === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message)
          return
        }
        json(res, { ok: true, value: { forgotten: engine.forget(id) } })
        return
      }
      case '/dsh-manim/storyboard': {
        const id = strField(payload, 'id')
        const root = strField(payload, 'root')
        const count = Math.max(2, Math.min(24, intField(payload, 'count') ?? 6))
        const width = Math.max(120, Math.min(1920, intField(payload, 'width') ?? 480))
        let video: string | null = null
        let keyPath: string | null = null
        let qualityId = ''
        if (id !== null) {
          const job = engine.get(id)
          if (job === undefined || job.result === null) {
            fail(res, 'not-found', '这个任务还没有渲染结果')
            return
          }
          video = job.result.video
          keyPath = job.path
          qualityId = job.quality
        } else if (root !== null) {
          const gate = await service.gate(root)
          if (!gate.ok) {
            fail(res, 'workspace', gate.error)
            return
          }
          const path = strField(payload, 'path')
          const quality = strField(payload, 'quality')
          const scene = strField(payload, 'scene')
          if (path === null || quality === null) {
            fail(res, BAD_REQUEST.code, BAD_REQUEST.message)
            return
          }
          const records = await service.readIndex(gate.canonical)
          const record = records.find(
            (item) => item.sceneFile === path && item.quality === quality && (scene === null || item.scene === scene),
          )
          if (record === undefined) {
            fail(res, 'not-found', '还没有这个场景在该画质下的渲染结果')
            return
          }
          video = record.video
          keyPath = record.sceneFile
          qualityId = record.quality
        }
        if (video === null || keyPath === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message)
          return
        }
        try {
          const frames = await service.storyboard({ video, keyPath, qualityId, count, width })
          if (id !== null) engine.setFrames(id, frames)
          json(res, { ok: true, value: { frames, video } })
        } catch (error) {
          fail(res, 'failed', error instanceof Error ? error.message : String(error))
        }
        return
      }
      case '/dsh-manim/template': {
        const root = strField(payload, 'root')
        if (root === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message)
          return
        }
        const gate = await service.gate(root)
        if (!gate.ok) {
          fail(res, 'workspace', gate.error)
          return
        }
        try {
          const created = await service.scaffold(
            gate.canonical,
            strField(payload, 'name') ?? 'Explainer',
            strOrEmpty(payload, 'dir') ?? 'animations',
          )
          json(res, {
            ok: true,
            value: { ...created, rel: created.path.slice(gate.canonical.length + 1).replaceAll('\\', '/') },
          })
        } catch (error) {
          fail(res, 'failed', error instanceof Error ? error.message : String(error))
        }
        return
      }
      case '/dsh-manim/probe': {
        json(res, { ok: true, value: await service.probe((payload as { force?: unknown }).force === true) })
        return
      }
      default:
        res.writeHead(404)
        res.end()
    }
  }

  const dispose = ctx.webServer.register({ kind: 'prefix', path: '/dsh-manim', handler })
  return () => dispose()
}
