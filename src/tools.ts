/**
 * The three agent-visible tools: `manim_scene`, `manim_render`, `manim_frames`.
 *
 * They exist as a set because making an explainer video is a loop, and each tool
 * is one step of it: write (or pick) a scene, render it, *look* at the result.
 * The third one is the one that changes the quality of the output — an agent
 * that can see four stills of the animation it just rendered fixes overlapping
 * labels and text that ran off the frame, which a "rendered successfully" line
 * cannot tell it about.
 *
 * @module dsh-manim/tools
 */

import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { QUALITIES, exposed, qualityById, type Config, type ToolId } from './config.ts'
import type { Frame, RenderEngine, RenderJob } from './engine.ts'
import type { ManimService, RenderRecord, SceneEntry } from './service.ts'
import { safeClassName } from './service.ts'

/** The shared result shape. Every tool returns these keys so the chat renderer is uniform. */
export interface ManimToolResult {
  ok: boolean
  action: string
  /** One-line summary for the model. */
  summary: string
  /** Markdown-ish detail the chat shows. */
  detail: string
  /** Files this call produced or touched. */
  files: string[]
  error?: string
}

/** Output JSON schema (author-style annotations; matches dsh-tools). */
const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    action: { type: 'string', required: true },
    summary: { type: 'string', required: true },
    detail: { type: 'string', required: true },
    files: { type: 'array', items: { type: 'string' }, required: true },
    error: { type: 'string' },
  },
} as const

/** The current session's cwd, best effort ('' when unknown). */
function sessionCwd(ctx: Context): string {
  try {
    const sessions = ctx.sessions.list()
    for (let i = sessions.length - 1; i >= 0; i -= 1) {
      const session = sessions[i] as unknown as { meta?: { cwd?: unknown }; cwd?: unknown }
      const cwd = session.meta?.cwd ?? session.cwd
      if (typeof cwd === 'string' && cwd !== '') return cwd
    }
  } catch {
    // Session store unavailable: fall through.
  }
  return ''
}

/** Resolve a path argument: absolute stays absolute, relative joins the cwd. */
function resolvePathArg(ctx: Context, path: string | undefined): string {
  if (path === undefined || path === '') return ''
  if (isAbsolute(path)) return path
  const cwd = sessionCwd(ctx)
  return cwd === '' ? '' : resolve(cwd, path)
}

/** The workspace root a call should operate in: explicit, else the session cwd. */
function rootFor(ctx: Context, root: string | undefined): string {
  return root !== undefined && root !== '' ? resolve(root) : sessionCwd(ctx)
}

/** Format seconds as `m 分 s 秒`. */
function humanDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '未知'
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  return `${minutes} 分 ${rest} 秒`
}

/** A short line describing a scene entry. */
function describeScene(entry: SceneEntry, root: string): string {
  const latest = entry.renders[0]
  const stamp = latest === undefined ? '未渲染' : `已渲染 ${latest.quality} · ${humanDuration(latest.duration)}`
  const relativePath = relative(root, entry.path).replaceAll('\\', '/')
  return `${relativePath} — ${entry.scenes.join(', ')} · ${stamp}`
}

/**
 * Syntax-check a Python file with the render interpreter.
 *
 * Cheaper than a render and much cheaper than debugging one: a `SyntaxError`
 * from `py_compile` names the line, and it is the single most common mistake
 * when a scene is written in one shot.
 */
async function syntaxCheck(config: Config, file: string): Promise<{ ok: boolean; message: string }> {
  // `ast.parse`, not `py_compile`: py_compile writes a `__pycache__/` next to the
  // file, which would litter the user's workspace with build droppings for a file
  // the plugin only ever needs to read. ast.parse reports the same SyntaxError
  // with line and column and writes nothing.
  const probe = 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read(), filename=sys.argv[1])'
  return await new Promise((resolvePromise) => {
    const child = spawn(config.pythonPath, ['-c', probe, file], {
      cwd: dirname(file),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (error) => resolvePromise({ ok: false, message: `无法运行 Python：${error.message}` }))
    child.on('close', (code) => {
      resolvePromise(code === 0 ? { ok: true, message: '' } : { ok: false, message: stderr.trim().slice(-1200) })
    })
  })
}

/** The agent-facing view of a finished job. */
function jobReport(job: RenderJob): string {
  const lines: string[] = []
  const result = job.result
  if (result !== null) {
    lines.push(`视频：${result.output ?? result.video}`)
    if (result.output !== undefined) lines.push(`（缓存副本：${result.video}）`)
    lines.push(
      `画质：${result.width}×${result.height} @ ${result.fps}fps · 时长 ${humanDuration(result.duration)} · ${result.plays} 段动画`,
    )
  }
  if (job.log.length > 0) {
    // Only the tail, and only lines that carry information: manim's rich logger
    // pads and wraps, so a raw dump is 90% box characters.
    const interesting = job.log
      .filter((line) => /error|warning|Error|Warning|Traceback|failed/i.test(line) || line.startsWith('[warn]') || line.startsWith('[error]'))
      .slice(-12)
    if (interesting.length > 0) {
      lines.push('日志要点：')
      lines.push(...interesting.map((line) => `  ${line}`))
    }
  }
  return lines.join('\n')
}

/** `manim_scene`: list / read / write / template / env. */
function sceneTool(ctx: Context, service: ManimService, config: Config): ToolDefinition {
  return defineTool({
    name: 'manim_scene',
    description: [
      '[dsh-manim] Scene files for Manim explainer animations — list, read, write, and scaffold.',
      "action='list': every scene file in the workspace, with its Scene classes and whether it has been rendered.",
      "action='read': the full source of one scene file (use this before editing it).",
      "action='write': create or replace a scene file with the given source. Runs a syntax check and returns any error with its line number — a scene that does not compile cannot be rendered.",
      "action='template': scaffold a new scene file from the bundled starter (a working example with the house theme, captions and a formula). Do this FIRST for a new video instead of writing a scene from scratch.",
      "action='env': what this machine's Manim runtime can do (version, whether LaTeX is available, quality presets).",
      'Conventions: put scene files under `animations/`. Import `from manimkit import *` for the house theme (`text()`, `caption()`, `panel()`, `chip()`, `arrow()`, `section_title()`, `mathtex()`).',
    ].join('\n'),
    parameters: {
      action: { type: 'string', enum: ['list', 'read', 'write', 'template', 'env'], description: 'What to do', required: true },
      path: { type: 'string', description: 'Scene file path (absolute or workspace-relative). Required for read/write.' },
      scene: { type: 'string', description: 'Scene class name, for a file that defines several' },
      source: { type: 'string', description: 'Python source, for action=write' },
      name: { type: 'string', description: 'For action=template: file name and scene class name' },
      dir: { type: 'string', description: "For action=template: workspace-relative directory (default 'animations')" },
      root: { type: 'string', description: 'Workspace root; defaults to the session workspace' },
    },
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: (value as ManimToolResult).detail }],
    },
    async execute(args) {
      const input = args as {
        action?: string
        path?: string
        scene?: string
        source?: string
        name?: string
        dir?: string
        root?: string
      }
      const action = input.action ?? 'list'
      const root = rootFor(ctx, input.root)
      if (root === '') {
        return fail(action, '无法确定工作区：没有会话工作目录，请显式传 root')
      }
      const gate = await service.gate(root)
      if (!gate.ok) return fail(action, gate.error)

      if (action === 'list') {
        const scenes = await service.listScenes(gate.canonical)
        if (scenes.length === 0) {
          return {
            ok: true,
            action,
            summary: '工作区里还没有场景文件',
            detail:
              `工作区 ${gate.canonical} 里没有找到 Scene 子类。\n` +
              "用 manim_scene(action='template', name='MyExplainer') 起一个带主题和字幕的起始场景。",
            files: [],
          }
        }
        return {
          ok: true,
          action,
          summary: `${scenes.length} 个场景文件`,
          detail: [`工作区 ${gate.canonical}：`, ...scenes.map((entry) => `· ${describeScene(entry, gate.canonical)}`)].join('\n'),
          files: scenes.map((entry) => entry.path),
        }
      }

      if (action === 'env') {
        const probe = await service.probe()
        const lines = [
          `Python：${String(probe.pythonPath ?? '?')} ${probe.pythonPresent === true ? '（就绪）' : '（缺失）'}`,
          `Manim：${String(probe.manim ?? '未安装')} · PyAV ${String(probe.av ?? '?')} · matplotlib ${String(probe.matplotlib ?? '?')}`,
          `LaTeX：${probe.tex === true ? `可用（${String(probe.latex)}）` : '不可用 —— 用 manimkit.mathtex() 而不是 MathTex/Tex'}`,
          `缓存目录：${String(probe.cacheDir ?? config.cacheDir)}`,
          `画质预设：${QUALITIES.map((quality) => quality.id).join(' / ')}`,
          `背景色：${config.background} · 成片复制到：${config.outputDir === '' ? '不复制' : `${config.outputDir}/`}`,
        ]
        if (probe.ok !== true) lines.push(`⚠️ ${String(probe.error ?? '运行时不可用')}`)
        return { ok: probe.ok === true, action, summary: probe.ok === true ? '运行时就绪' : '运行时不可用', detail: lines.join('\n'), files: [] }
      }

      if (action === 'template') {
        try {
          const created = await service.scaffold(gate.canonical, input.name ?? 'Explainer', input.dir ?? 'animations')
          const relativePath = relative(gate.canonical, created.path).replaceAll('\\', '/')
          return {
            ok: true,
            action,
            summary: `已创建 ${relativePath}`,
            detail: [
              `已创建 ${relativePath}（场景类 ${created.scene}）。`,
              '接下来：打开它、改成本次要讲的内容，然后 manim_render(path=…)。',
              '先按草稿画质渲染（quality="draft"）确认节奏和版式，再出高清。',
            ].join('\n'),
            files: [created.path],
          }
        } catch (error) {
          return fail(action, error instanceof Error ? error.message : String(error))
        }
      }

      const absolute = resolvePathArg(ctx, input.path)
      if (absolute === '') return fail(action, 'path is required')

      // Reading requires the file to exist; writing is how it comes to exist.
      const target = action === 'write'
        ? await service.resolveScenePathForWrite(gate.canonical, absolute)
        : await service.resolveScenePath(gate.canonical, absolute)
      if (!target.ok) return fail(action, target.error)

      if (action === 'read') {
        const source = await readFile(target.absolute, 'utf8')
        const lines = source.split('\n')
        const shown = lines.slice(0, 900)
        return {
          ok: true,
          action,
          summary: `${basename(target.absolute)} · ${lines.length} 行`,
          detail: [
            `${relative(gate.canonical, target.absolute).replaceAll('\\', '/')}（${lines.length} 行）`,
            '```python',
            ...shown,
            ...(lines.length > shown.length ? [`… 还有 ${lines.length - shown.length} 行`] : []),
            '```',
          ].join('\n'),
          files: [target.absolute],
        }
      }

      if (action === 'write') {
        const source = input.source
        if (typeof source !== 'string' || source.trim() === '') return fail(action, 'source is required for write')
        await writeFile(target.absolute, source, 'utf8')
        service.invalidateScan(gate.canonical)
        const check = await syntaxCheck(config, target.absolute)
        const relativePath = relative(gate.canonical, target.absolute).replaceAll('\\', '/')
        if (!check.ok) {
          return {
            ok: false,
            action,
            summary: `${relativePath} 语法错误`,
            detail: [`已写入 ${relativePath}，但语法检查没通过：`, '```', check.message, '```'].join('\n'),
            files: [target.absolute],
            error: 'syntax error',
          }
        }
        const resolved = await service.resolveSceneName(target.absolute, input.scene)
        const sceneLine = resolved.ok ? `场景类：${resolved.scene}` : `⚠️ ${resolved.error}`
        return {
          ok: true,
          action,
          summary: `${relativePath} 已保存`,
          detail: [`已写入 ${relativePath}，语法检查通过。`, sceneLine, `下一步：manim_render(path='${relativePath}', quality='draft')`].join('\n'),
          files: [target.absolute],
        }
      }

      return fail(action, `未知 action：${action}`)
    },
  })
}

/** Build the failure result every tool shares. */
function fail(action: string, message: string): ManimToolResult {
  return { ok: false, action, summary: message, detail: `❌ ${message}`, files: [], error: message }
}

/** `manim_render`: render a scene and (by default) look at the result. */
function renderTool(ctx: Context, service: ManimService, engine: RenderEngine, config: Config): ToolDefinition {
  return defineTool({
    name: 'manim_render',
    description: [
      '[dsh-manim] Render a Manim scene to an .mp4 and return its path, duration and — by default — still frames you can look at with read_image.',
      'Before rendering it needs to know how many animations the scene has and how long it runs, so it can show a real progress bar and fail fast on a broken scene. That measurement is cached per scene revision: the first render of a scene pays for it, every later render (the final 1080p60 after a draft, say) reuses it. Set plan="always" to force a fresh measurement or plan="never" to skip it.',
      'The render is synchronous: this call returns when the video exists (or the timeout expires). It typically takes 30 s for a 20 s draft and several minutes for 1080p60.',
      "quality='draft' (480p15) is the iteration setting; '720p30', '1080p60' (default), '1440p60' and '4k60' are the shipping ones. Always iterate on draft, then render the final quality once the content is right.",
      'frames=0 skips the stills; the default 4 are written to the plugin cache and their absolute paths are returned for read_image.',
      'NOTE: LaTeX is unavailable on this machine — use `mathtex()` from manimkit for formulas, never MathTex/Tex.',
    ].join('\n'),
    parameters: {
      path: { type: 'string', description: 'Scene file (absolute or workspace-relative)', required: true },
      scene: { type: 'string', description: 'Scene class; omit when the file defines exactly one' },
      quality: { type: 'string', description: "Quality preset id: 'draft' | '720p30' | '1080p60' | '1440p60' | '4k60'" },
      plan: {
        type: 'string',
        description:
          "When to run the measuring pre-flight pass. 'auto' (default) reuses the plan cached from a previous render of this scene and only measures when the scene file changed; 'always' forces a fresh measurement; 'never' skips it (no total for the progress bar, and a broken scene fails at render time instead of up front).",
      },
      frames: { type: 'number', description: 'How many evenly spaced stills to extract afterwards (default 4, 0 = none)' },
      notes: { type: 'string', description: 'A one-line note recorded with the render, e.g. what changed in this iteration' },
      root: { type: 'string', description: 'Workspace root; defaults to the session workspace' },
    },
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: (value as ManimToolResult).detail }],
    },
    async execute(args) {
      const input = args as {
        path?: string
        scene?: string
        quality?: string
        plan?: string
        frames?: number
        notes?: string
        root?: string
      }
      const action = 'render'
      const root = rootFor(ctx, input.root)
      if (root === '') return fail(action, '无法确定工作区：没有会话工作目录，请显式传 root')
      const gate = await service.gate(root)
      if (!gate.ok) return fail(action, gate.error)

      const absolute = resolvePathArg(ctx, input.path)
      if (absolute === '') return fail(action, 'path is required')
      const target = await service.resolveScenePath(gate.canonical, absolute)
      if (!target.ok) return fail(action, target.error)

      const planArg = input.plan ?? 'auto'
      if (!['auto', 'always', 'never'].includes(planArg)) {
        return fail(action, `plan 只能是 auto / always / never，收到 ${planArg}`)
      }
      const planMode: boolean | 'auto' = planArg === 'always' ? true : planArg === 'never' ? false : 'auto'

      const requested = input.quality === undefined ? undefined : qualityById(input.quality)
      if (input.quality !== undefined && requested === undefined) {
        return fail(action, `未知画质 ${input.quality}；可用：${QUALITIES.map((q) => q.id).join(', ')}`)
      }
      const quality = requested ?? service.qualityFor(null)
      const resolved = await service.resolveSceneName(target.absolute, input.scene)
      if (!resolved.ok) return fail(action, resolved.error)

      const frameCount = Math.max(0, Math.min(12, Math.round(input.frames ?? 4)))
      const job = await service.startRender({
        root: gate.canonical,
        path: target.absolute,
        scene: resolved.scene,
        quality,
        origin: 'tool',
        plan: planMode,
      })

      // Block until it finishes. A render is the whole point of the call: a
      // "started, poll me later" answer would push the loop back onto the model
      // with no way to observe it.
      const settled = await service.waitFor(job.id, 30 * 60 * 1000)
      if (settled === null) return fail(action, '渲染任务丢失了')
      if (settled.state !== 'done') {
        const reason = settled.error?.message ?? (settled.state === 'cancelled' ? '已取消' : '渲染未完成')
        return {
          ok: false,
          action,
          summary: `渲染失败：${reason}`,
          detail: [
            `❌ ${reason}`,
            settled.progress.done > 0 ? `已完成 ${settled.progress.done}${settled.progress.total === null ? '' : `/${settled.progress.total}`} 段动画。` : '',
            settled.error?.traceback === undefined ? '' : ['```', settled.error.traceback.slice(-2000), '```'].join('\n'),
            jobReport(settled),
          ]
            .filter((line) => line !== '')
            .join('\n'),
          files: [],
          error: reason,
        }
      }

      const files: string[] = []
      let frameNote = ''
      if (frameCount > 0 && settled.result !== null) {
        try {
          const frames = await service.storyboard({
            video: settled.result.video,
            keyPath: settled.path,
            qualityId: settled.quality,
            count: frameCount,
            width: 720,
          })
          engine.setFrames(settled.id, frames)
          files.push(...frames.map((frame) => frame.path))
          frameNote = [
            `分镜 ${frames.length} 帧（用 read_image 看它们，确认版式和文字没有重叠/出框）：`,
            ...frames.map((frame: Frame) => `  第 ${frame.time.toFixed(1)}s → ${frame.path}`),
          ].join('\n')
        } catch (error) {
          frameNote = `⚠️ 抽帧失败：${error instanceof Error ? error.message : String(error)}`
        }
      }

      const notes = typeof input.notes === 'string' && input.notes !== '' ? `备注：${input.notes}` : ''
      return {
        ok: true,
        action,
        summary: `${settled.scene ?? basename(settled.path)} 渲染完成 · ${quality.id} · ${humanDuration(settled.result?.duration ?? null)}`,
        detail: [
          `✅ ${settled.scene ?? ''} @ ${quality.id}`,
          jobReport(settled),
          notes,
          frameNote,
          '要看片子在面板里点「动画」标签；成片路径见上。',
        ]
          .filter((line) => line !== '')
          .join('\n'),
        files: settled.result === null ? [] : [settled.result.output ?? settled.result.video, ...files],
      }
    },
  })
}

/**
 * `manim_voice`: narration — which voices exist, and turning a script into audio.
 *
 * The tool that makes the video *speak*. It deliberately stops at "WAV files plus
 * a cue sheet with absolute offsets": manim already mixes audio
 * (`Scene.add_sound`), and `manimkit.narration()` is the one line that reads the
 * cue sheet. What this adds are the two things a render pipeline cannot invent —
 * a voice, and a timeline.
 *
 * Nothing has to be downloaded for it to work. `edge` is Microsoft Edge's
 * read-aloud service through the `edge-tts` package (free, no API key, Chinese
 * voices close to human); `sapi` is Windows' own offline synthesiser (robotic,
 * but it works with the network down). `auto` prefers `edge` and falls back,
 * saying which it used.
 */
function voiceTool(ctx: Context, service: ManimService): ToolDefinition {
  return defineTool({
    name: 'manim_voice',
    description: [
      '[dsh-manim] Narration for an explainer video: list the text-to-speech voices available here, or synthesise a script into WAV files plus a cue sheet.',
      'No voice model needs downloading. `edge` (Microsoft Edge read-aloud) is free, needs no API key, and its Chinese voices are close to human; `sapi` (Windows offline) is robotic but works with no network. auto tries edge and falls back to sapi, and says which one it used.',
      "action='list': the engines that work here and every Chinese voice they offer — call this first, and again if synthesis fails.",
      "action='speak': synthesise `lines` into WAVs plus a `cues.json` cue sheet. Give each line an `id`; the sheet records that line's `at` (absolute start offset) and `duration`.",
      'Then in the scene: `cues = narration(self, "voice/cues.json")` adds the whole voice track at once, and `hold(self, cues, "b1")` waits out the rest of that line — write the animation for a beat, call hold(), and the picture sits exactly as long as the voice runs. That is what keeps picture and voice in step without timing anything by hand.',
      'The picture must be at least as long as the voice: the muxer drops an over-long narration at the video end, silently. The render emits a warning when that happens — do not ignore it.',
      'Chinese inside `mathtex()` is refused on purpose (it would render as empty boxes). Chinese belongs in `text()`; formulas take symbols only.',
    ].join('\n'),
    parameters: {
      action: { type: 'string', enum: ['list', 'speak'], description: 'list voices, or synthesise a script', required: true },
      lines: {
        type: 'array',
        description: 'action=speak: the script, one entry per beat — [{ id, text }]',
        items: { type: 'object', additionalProperties: true },
      },
      voice: { type: 'string', description: "Voice id, e.g. 'zh-CN-XiaoxiaoNeural' (default), or 'Microsoft Huihui Desktop' for the offline engine" },
      rate: { type: 'string', description: "Speaking rate in Edge's grammar, e.g. '+10%' or '-15%' (default '+0%')" },
      engine: { type: 'string', description: "'auto' (default), 'edge', or 'sapi'" },
      gap: { type: 'number', description: 'Silence between lines, seconds (default 0.35)' },
      dir: { type: 'string', description: "Workspace-relative output directory (default 'animations/voice')" },
      root: { type: 'string', description: 'Workspace root; defaults to the session workspace' },
    },
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: (value as ManimToolResult).detail }],
    },
    async execute(args) {
      const input = args as {
        action?: string
        lines?: Array<{ id?: string; text?: string }>
        voice?: string
        rate?: string
        engine?: string
        gap?: number
        dir?: string
        root?: string
      }
      const action = input.action ?? 'list'
      const root = rootFor(ctx, input.root)
      if (root === '') return fail(action, '无法确定工作区：没有会话工作目录，请显式传 root')
      const gate = await service.gate(root)
      if (!gate.ok) return fail(action, gate.error)

      if (action === 'list') {
        try {
          const inventory = await service.voiceInventory()
          const withEngine = (name: string): Array<Record<string, unknown>> =>
            inventory.voices.filter((voice) => (voice as { engine?: string }).engine === name) as Array<Record<string, unknown>>
          const edge = withEngine('edge')
          const sapi = withEngine('sapi')
          const line = (voice: Record<string, unknown>): string => {
            const extras = [voice.gender, voice.tags ?? voice.culture].filter((value) => typeof value === 'string' && value !== '')
            return `  ${String(voice.id)}${extras.length === 0 ? '' : ` · ${extras.join(' · ')}`}`
          }
          const engines = Object.entries(inventory.engines)
          const usable = engines.some(([, ok]) => ok)
          const detail = [
            `可用引擎：${engines.map(([name, ok]) => `${name}=${ok ? '可用' : '不可用'}`).join(' · ')}`,
            '',
            `edge（在线，推荐）— ${edge.length} 个中文音色：`,
            ...edge.map(line),
            '',
            `sapi（Windows 离线，断网时兜底）— ${sapi.length} 个：`,
            ...sapi.map(line),
            ...(inventory.errors.length === 0 ? [] : ['', ...inventory.errors.map((error) => `⚠️ ${error}`)]),
          ].join('\n')
          return {
            ok: usable,
            action,
            summary: usable ? `在线 ${edge.length} 个音色 · 离线 ${sapi.length} 个` : '没有可用的语音引擎',
            detail,
            files: [],
            ...(usable ? {} : { error: '没有可用的语音引擎' }),
          }
        } catch (error) {
          return fail(action, error instanceof Error ? error.message : String(error))
        }
      }

      if (action === 'speak') {
        const lines = (input.lines ?? [])
          .map((item, index) => ({ id: String(item.id ?? `b${index + 1}`), text: String(item.text ?? '').trim() }))
          .filter((item) => item.text !== '')
        if (lines.length === 0) return fail(action, 'speak 需要 lines（每句要有 text）')
        // A guardrail, not a silent truncation: this repo has been bitten by
        // "succeeded, but quietly dropped the tail" more than once.
        if (lines.length > 80) return fail(action, `lines 最多 80 句（收到 ${lines.length}）`)
        try {
          const result = await service.speak({
            root: gate.canonical,
            dir: input.dir ?? 'animations/voice',
            lines,
            ...(input.voice === undefined ? {} : { voice: input.voice }),
            ...(input.rate === undefined ? {} : { rate: input.rate }),
            ...(input.engine === undefined ? {} : { engine: input.engine }),
            ...(input.gap === undefined ? {} : { gap: input.gap }),
          })
          const cues = (result.cues as Array<Record<string, unknown>>) ?? []
          const files = (result.filesRel as string[]) ?? []
          const sheetRel = String(result.sheetRel ?? '')
          // The sheet path as the scene should write it: relative to the scene
          // file's own directory, which is where the renderer's cwd points.
          const sheetForScene = sheetRel.replace(/^animations\//, '')
          const firstId = String(cues[0]?.id ?? 'b1')
          const detail = [
            `✅ ${lines.length} 句 · 引擎 ${String(result.engine)} · 音色 ${String(result.voice)} · 旁白总长 ${String(result.total)} 秒`,
            '',
            ...cues.map((cue) => `  ${String(cue.id)}  at=${Number(cue.at).toFixed(2)}s  dur=${Number(cue.duration).toFixed(2)}s  ${String(cue.text)}`),
            '',
            `cue sheet：${sheetRel}`,
            '',
            '场景里这样用（动画写在前，hold() 把这一拍撑到旁白说完）：',
            '```python',
            'from manimkit import hold, narration',
            '',
            '    def construct(self):',
            `        cues = narration(self, "${sheetForScene}")`,
            '        self.play(Write(title), run_time=1.0)',
            `        hold(self, cues, "${firstId}")`,
            '```',
            '画面总长必须 ≥ 旁白总长，否则结尾会被静默切掉（渲染时会给你告警）。',
          ].join('\n')
          return {
            ok: true,
            action,
            summary: `${lines.length} 句旁白已生成 · 总长 ${String(result.total)} 秒 · ${String(result.engine)}`,
            detail,
            files: [sheetRel, ...files].filter((item) => item !== ''),
          }
        } catch (error) {
          return fail(action, error instanceof Error ? error.message : String(error))
        }
      }

      return fail(action, `未知 action：${action}`)
    },
  })
}

/** `manim_frames`: pull stills out of an existing render. */
function framesTool(ctx: Context, service: ManimService, engine: RenderEngine): ToolDefinition {
  return defineTool({
    name: 'manim_frames',
    description: [
      '[dsh-manim] Extract still frames (PNG) from a rendered Manim video, and return their absolute paths so read_image can look at them.',
      'Use it to check an animation without re-rendering: confirm a caption is readable, a formula fits, nothing overlaps, and the beats land where you intended.',
      'Give either `times` (exact seconds) or `count` (evenly spaced samples, the default 6). `path` names the scene file whose latest render you want; omit it to use the most recent render in the workspace.',
    ].join('\n'),
    parameters: {
      path: { type: 'string', description: 'Scene file whose latest render to use; omit for the most recent render in the workspace' },
      scene: { type: 'string', description: 'Scene class name' },
      quality: { type: 'string', description: 'Quality preset id of the render to use' },
      count: { type: 'number', description: 'Number of evenly spaced frames (default 6, ignored when times is given)' },
      times: { type: 'string', description: 'Comma-separated seconds, e.g. "0.5,3,7.5" — overrides count' },
      width: { type: 'number', description: 'PNG width in pixels (default 720)' },
      root: { type: 'string', description: 'Workspace root; defaults to the session workspace' },
    },
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: (value as ManimToolResult).detail }],
    },
    async execute(args) {
      const action = 'frames'
      const input = args as {
        path?: string
        scene?: string
        quality?: string
        count?: number
        times?: string
        width?: number
        root?: string
      }
      const root = rootFor(ctx, input.root)
      if (root === '') return fail(action, '无法确定工作区：没有会话工作目录，请显式传 root')
      const gate = await service.gate(root)
      if (!gate.ok) return fail(action, gate.error)

      const records = await service.readIndex(gate.canonical)
      let record: RenderRecord | undefined
      if (input.path !== undefined && input.path !== '') {
        const absolute = resolvePathArg(ctx, input.path)
        const target = await service.resolveScenePath(gate.canonical, absolute)
        if (!target.ok) return fail(action, target.error)
        record = records.find(
          (item) =>
            item.sceneFile === target.absolute &&
            (input.scene === undefined || item.scene === input.scene) &&
            (input.quality === undefined || item.quality === input.quality),
        )
        if (record === undefined) {
          return fail(action, `还没有这个场景的渲染结果；先 manim_render(path='${input.path}')`)
        }
      } else {
        record = records[0]
        if (record === undefined) return fail(action, '工作区里还没有渲染结果，先跑 manim_render')
      }

      // `''.split(',')` is `['']`, and `Number('')` is 0 — which is finite, so a
      // missing `times` argument used to arrive as the single timestamp 0 and
      // silently overrode `count`. Drop empty parts before converting.
      const times = (input.times ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '')
        .map((part) => Number(part))
        .filter((value) => Number.isFinite(value) && value >= 0)
      const width = Math.max(160, Math.min(1920, Math.round(input.width ?? 720)))
      try {
        const frames = await service.storyboard({
          video: record.video,
          keyPath: record.sceneFile,
          qualityId: record.quality,
          count: Math.max(1, Math.min(24, Math.round(input.count ?? 6))),
          times,
          width,
        })
        const latest = engine.latestFor(gate.canonical, record.sceneFile)
        if (latest !== undefined) engine.setFrames(latest.id, frames)
        return {
          ok: true,
          action,
          summary: `${frames.length} 帧 · ${basename(record.sceneFile)}`,
          detail: [
            `${basename(record.sceneFile)}（${record.scene} @ ${record.quality}，时长 ${humanDuration(record.duration)}）的 ${frames.length} 帧：`,
            ...frames.map((frame: Frame) => `  第 ${frame.time.toFixed(2)}s → ${frame.path}`),
            '用 read_image 打开它们检查画面。',
          ].join('\n'),
          files: frames.map((frame) => frame.path),
        }
      } catch (error) {
        return fail(action, error instanceof Error ? error.message : String(error))
      }
    },
  })
}

/**
 * Build the configured subset of the tools.
 *
 * @param ctx - host context (sessions, workspace registry).
 * @param service - the gated service.
 * @param engine - the job registry.
 * @param config - resolved plugin config.
 * @returns the tool definitions, in the order they should be listed.
 */
export function buildAgentTools(
  ctx: Context,
  service: ManimService,
  engine: RenderEngine,
  config: Config,
): ToolDefinition[] {
  const all: Array<[string, ToolDefinition]> = [
    ['manim_scene', sceneTool(ctx, service, config)],
    ['manim_render', renderTool(ctx, service, engine, config)],
    ['manim_frames', framesTool(ctx, service, engine)],
    ['manim_voice', voiceTool(ctx, service)],
  ]
  return all
    .filter(([id]) => exposed(config, id as ToolId))
    .map(([, definition]) => definition)
}

/** Re-exported for tests: the class-name helper the template write path uses. */
export { safeClassName }
