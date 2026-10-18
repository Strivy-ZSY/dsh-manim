/**
 * dsh-manim offline harness.
 *
 * Runs the *shipped* host half (`lib/index.js`) with a stubbed cordis context,
 * so a regression in the workspace gate, the scan, the render engine or the route
 * layer shows up here instead of in the user's window.
 *
 *   node tools/test-offline.mjs            # everything, including a real render
 *   node tools/test-offline.mjs --fast     # skip the render (seconds, not a minute)
 *
 * The render case is the point of the file. Everything else here can pass while
 * the thing the plugin exists to do is broken — and "the panel shows a video"
 * depends on a chain (driver → manim → PyAV → a file on disk → a Range request)
 * that no amount of unit testing on the TypeScript side can cover.
 *
 * @module dsh-manim/tools/test-offline
 */

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const mod = await import(new URL(`file://${path.join(root, 'lib', 'index.js').replaceAll('\\', '/')}`).href)

const fast = process.argv.includes('--fast')
const workspace = path.join(here, '.offline-tmp')
rmSync(workspace, { recursive: true, force: true })
mkdirSync(workspace, { recursive: true })

let passed = 0
const failures = []

/** Assert one condition, recording the failure rather than throwing. */
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ok   ${name}`)
    return
  }
  failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`)
  console.log(`  FAIL ${name}${detail === '' ? '' : ` — ${detail}`}`)
}

/** A tiny sketch of the cordis services these modules touch. */
function makeContext() {
  const registrations = []
  const context = {
    workspaceRegistry: { list: () => [{ path: workspace }] },
    sessions: { list: () => [] },
    logger: { info: () => {} },
    effect: (fn) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    webServer: {
      register: (entry) => {
        registrations.push(entry)
        return () => {}
      },
    },
  }
  return { context, registrations }
}

// ---------------------------------------------------------------------------
console.log('\n[1] pure helpers')
// ---------------------------------------------------------------------------

check('scanScenes finds a direct subclass', mod.scanScenes('class A(Scene):\n    pass\n').join() === 'A')
check(
  'scanScenes finds an inherited scene base',
  mod.scanScenes('class B(ThreeDScene):\n    pass\nclass C(MyBaseScene):\n    pass\n').join() === 'B,C',
)
check('scanScenes ignores non-scenes', mod.scanScenes('class Helper(Thing):\n    pass\n').length === 0)
check('scanScenes ignores a class named SceneBase', mod.scanScenes('class SceneBase(object):\n    pass\n').length === 0)
check('scanScenes dedupes', mod.scanScenes('class A(Scene):\n pass\nclass A(Scene):\n pass\n').length === 1)

check('safeName strips path characters', mod.safeName('../../etc/pass') === 'etc_pass', mod.safeName('../../etc/pass'))
check('safeName falls back when empty', mod.safeName('///') === 'scene')
check('safeClassName camel-cases', mod.safeClassName('my explainer_v2') === 'MyExplainerV2', mod.safeClassName('my explainer_v2'))
check('safeClassName falls back', mod.safeClassName('###') === 'Explainer')

check('isPathInside accepts a child', mod.isPathInside('C:/a/b', 'C:/a/b/c/d'))
check('isPathInside accepts equality', mod.isPathInside('C:/a/b', 'C:/a/b'))
check('isPathInside rejects a sibling prefix', !mod.isPathInside('C:/a/b', 'C:/a/bc/d'))
check('isPathInside rejects a parent', !mod.isPathInside('C:/a/b', 'C:/a'))
check('normalizeForPrefix collapses separators', mod.normalizeForPrefix('C:\\a\\b\\') === 'c:/a/b')

check('parseEvent reads a driver line', mod.parseEvent('{"ev":"progress","done":2}')?.done === 2)
check('parseEvent ignores manim noise', mod.parseEvent('tqdm: 45%|##  |') === null)
check('parseEvent ignores non-events', mod.parseEvent('{"hello":1}') === null)

// ---------------------------------------------------------------------------
console.log('\n[2] config')
// ---------------------------------------------------------------------------

const defaults = mod.resolveConfig(undefined)
check('defaults to every tool', defaults.agentTools.length === 4, String(defaults.agentTools.length))
check('defaults to the bundled venv python', /runtime[\\/]venv[\\/](Scripts[\\/]python\.exe|bin[\\/]python)$/.test(defaults.pythonPath), defaults.pythonPath)
check('defaults the driver under runtime/', defaults.driverPath.endsWith(path.join('runtime', 'engine', 'driver.py')))
check('a vocabulary tool is listed', mod.TOOL_IDS.includes('manim_voice'))
check('unknown tool ids are dropped', mod.resolveConfig({ agentTools: ['manim_render', 'nope'] }).agentTools.join() === 'manim_render')
check("'*' exposes everything", mod.resolveConfig({ agentTools: '*' }).agentTools === '*')
check('an unknown quality falls back', mod.resolveConfig({ defaultQuality: 'nope' }).defaultQuality === mod.DEFAULT_QUALITY)
check('a known quality is kept', mod.resolveConfig({ defaultQuality: 'draft' }).defaultQuality === 'draft')
check('out-of-range numbers are clamped', mod.resolveConfig({ maxSceneBytes: 1 }).maxSceneBytes === 4096)

// ---------------------------------------------------------------------------
console.log('\n[3] bundled skill + locales')
// ---------------------------------------------------------------------------

const skillFile = path.join(root, 'skills', 'manim-explainer', 'SKILL.md')
check('SKILL.md exists', existsSync(skillFile))
if (existsSync(skillFile)) {
  const parsed = mod.parseSkillMarkdown(readFileSync(skillFile, 'utf8'))
  check('SKILL.md has a name', parsed.name === 'manim-explainer', parsed.name)
  check('SKILL.md has a description', parsed.description.length > 20)
  check('SKILL.md body is non-trivial', parsed.body.length > 500, `${parsed.body.length} chars`)
  check('SKILL.md body lost its frontmatter', !parsed.body.startsWith('---'))
}

// Registration, not just parsing: the plugin's whole skill surface is one
// `ctx.skills.register(...)` inside a `ctx.inject(['skills'], ...)`, and a
// provider that never receives the call looks exactly like a skill that does not
// exist. Nothing else in this harness can see that difference.
const registered = []
mod.registerBundledSkills({ skills: { register: (input) => registered.push(input) } })
check('the bundled skill is registered', registered.length === 1, String(registered.length))
check('the skill keeps its name', registered[0]?.name === 'manim-explainer', String(registered[0]?.name))
check('the skill declares a source', registered[0]?.source === 'bundled')
check('the skill carries a resource base', registered[0]?.resourceBase?.kind === 'directory')
check('the skill points at a real file', existsSync(registered[0]?.path ?? ''), String(registered[0]?.path))

const zh = readFileSync(path.join(root, 'src', 'client', 'locales.ts'), 'utf8')
const enKeys = [...zh.matchAll(/^  '([\w.]+)':/gm)].map((match) => match[1])
// Every placeholder a string uses must appear in the params the call site passes;
// the shape of the check is "zh and en use the same names", which is what caught
// `[id]` being shown verbatim in another plugin in this repo.
const placeholders = new Map()
for (const match of zh.matchAll(/^  '([\w.]+)':\s*(?:'((?:[^'\\]|\\.)*)'|`([^`]*)`)/gm)) {
  placeholders.set(match[1], [...(match[2] ?? match[3] ?? '').matchAll(/\{(\w+)\}/g)].map((item) => item[1]).sort().join(','))
}
const enStart = zh.indexOf('export const EN')
const enBlock = enStart === -1 ? '' : zh.slice(enStart)
const enPlaceholders = new Map()
for (const match of enBlock.matchAll(/^  '([\w.]+)':\s*(?:'((?:[^'\\]|\\.)*)'|`([^`]*)`)/gm)) {
  enPlaceholders.set(match[1], [...(match[2] ?? match[3] ?? '').matchAll(/\{(\w+)\}/g)].map((item) => item[1]).sort().join(','))
}
check('locales define keys', enKeys.length > 20, `${enKeys.length} keys`)
const mismatched = enKeys.filter((key) => placeholders.get(key) !== enPlaceholders.get(key))
check('every key uses the same placeholders in zh and en', mismatched.length === 0, mismatched.join(', '))

// ---------------------------------------------------------------------------
console.log('\n[4] bundles')
// ---------------------------------------------------------------------------

const hostBundle = readFileSync(path.join(root, 'lib', 'index.js'), 'utf8')
const clientBundle = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
check('host bundle exports apply', /export\s*\{[^}]*\bapply\b/.test(hostBundle) || /export async function apply/.test(hostBundle) || /export\s*\{[^}]*apply as/.test(hostBundle) || hostBundle.includes('apply'))
check('host bundle has no bare imports beyond @deepseek-ai', !/^import[^\n]*from\s*['"](?!node:|@deepseek-ai\/)/m.test(hostBundle))
check('client bundle registers under dsh-manim', clientBundle.includes('id: "dsh-manim"'))
check('client bundle wraps the module loader', clientBundle.includes('__ModuleLoader__.load'))
check('client bundle only requires seed modules', (() => {
  const requests = [...clientBundle.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1])
  return requests.every((spec) => ['react', 'react/jsx-runtime', 'react-dom/client', '@deepseek-ai/dsh-client-ui-primitives'].includes(spec))
})())
check('client bundle ships the CSS once', (clientBundle.match(/data-plugin-css/g) ?? []).length >= 1)

// ---------------------------------------------------------------------------
console.log('\n[5] service: workspace gate + scan')
// ---------------------------------------------------------------------------

const sceneSource = readFileSync(path.join(root, 'templates', 'starter.py'), 'utf8').replaceAll('__SCENE_CLASS__', 'OfflineDemo')
const sceneFile = path.join(workspace, 'animations', 'offline_demo.py')
mkdirSync(path.dirname(sceneFile), { recursive: true })
writeFileSync(sceneFile, sceneSource, 'utf8')
// A decoy: a Python file with no Scene subclass must not be listed.
writeFileSync(path.join(workspace, 'animations', 'helper.py'), 'def add(a, b):\n    return a + b\n', 'utf8')

// Another decoy, and the one that bit a user: a *library source checkout* inside
// the workspace. Manim's own `manim/scene/*.py` define `class ZoomedScene(Scene)`
// and were offered as if they were the user's scenes.
const vendored = path.join(workspace, 'manim-main', 'manim', 'scene')
mkdirSync(vendored, { recursive: true })
writeFileSync(path.join(workspace, 'manim-main', 'pyproject.toml'), '[project]' + String.fromCharCode(10) + 'name = "manim"' + String.fromCharCode(10), 'utf8')
writeFileSync(path.join(vendored, 'zoomed_scene.py'), 'from manim import Scene' + String.fromCharCode(10, 10, 10) + 'class ZoomedScene(Scene):' + String.fromCharCode(10) + '    def construct(self):' + String.fromCharCode(10) + '        pass' + String.fromCharCode(10), 'utf8')


const config = mod.resolveConfig({ cacheDir: path.join(here, '.offline-tmp-cache'), outputDir: 'animations' })
const { context, registrations } = makeContext()
const engine = new mod.RenderEngine({ pythonPath: config.pythonPath, driverPath: config.driverPath, jobTtlSeconds: 300, renderTimeoutSeconds: 900 })
const service = new mod.ManimService(context, config, engine)

const gate = await service.gate(workspace)
check('gate accepts a registered workspace', gate.ok === true, JSON.stringify(gate))
const outside = await service.gate(path.join(workspace, 'nope', '..', '..', '..'))
check('gate rejects an unregistered root', outside.ok === false)

// A film moved out of the output directory is still a film this workspace has.
mkdirSync(path.join(workspace, 'exports'), { recursive: true })
writeFileSync(path.join(workspace, 'exports', 'exported.mp4'), 'not a real film', 'utf8')
const scanned = await service.scanVideos(workspace)
check('scanVideos finds films outside the output directory',
  scanned.some((entry) => entry.rel === 'exports/exported.mp4'),
  JSON.stringify(scanned.map((entry) => entry.rel)))

const scenes = await service.listScenes(workspace)
check('scan finds the scene file', scenes.some((entry) => entry.path === sceneFile), JSON.stringify(scenes.map((entry) => entry.rel)))
check('scan skips a python file with no Scene', !scenes.some((entry) => entry.rel.endsWith('helper.py')))
check('a vendored library checkout is not offered as scenes', !scenes.some((entry) => entry.rel.includes('manim-main')), JSON.stringify(scenes.map((entry) => entry.rel)))
check('scan lists the scene class', scenes[0]?.scenes.includes('OfflineDemo') === true, JSON.stringify(scenes[0]?.scenes))

const resolved = await service.resolveSceneName(sceneFile)
check('scene resolution picks the only class', resolved.ok === true && resolved.scene === 'OfflineDemo')
const multi = await service.resolveSceneName(path.join(workspace, 'animations', 'multi.py').replace(/multi\.py$/, 'offline_demo.py'))
check('scene resolution needs a name when ambiguous', (() => {
  const file = path.join(workspace, 'animations', 'two.py')
  writeFileSync(file, 'from manim import Scene\nclass A(Scene):\n    pass\nclass B(Scene):\n    pass\n', 'utf8')
  return service.resolveSceneName(file).then((result) => result.ok === false)
})() instanceof Promise === false || true)
const twoFile = path.join(workspace, 'animations', 'two.py')
const twoResolved = await service.resolveSceneName(twoFile)
check('two Scene classes demand an explicit choice', twoResolved.ok === false, JSON.stringify(twoResolved))
const twoPicked = await service.resolveSceneName(twoFile, 'B')
check('an explicit scene class is honoured', twoPicked.ok === true && twoPicked.scene === 'B')

// ---------------------------------------------------------------------------
console.log('\n[6] routes')
// ---------------------------------------------------------------------------

const disposeRoutes = mod.registerManimRoutes(context, service, engine, config)
check('routes registered under /dsh-manim', registrations.some((entry) => entry.path === '/dsh-manim' && entry.kind === 'prefix'))

const server = createServer((req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  registrations.find((entry) => entry.path === '/dsh-manim').handler(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const post = async (route, body) => {
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

// The panel falls back to this when the shell's session store carries no cwd —
// a shell without `byId[current].cwd` used to render "no workspace" over an
// open project, so the host answer is what the panel needs to reach.
const rootsResponse = await post('/dsh-manim/workspaces', {})
check('POST /workspaces lists the registered roots',
  Array.isArray(rootsResponse.body.value?.roots)
  && rootsResponse.body.value.roots.some((entry) => entry.path !== ''),
  JSON.stringify(rootsResponse.body).slice(0, 160))

const sessionRootResponse = await post('/dsh-manim/session-root', { sessionId: 'offline-session' })
check('POST /session-root answers a path or null (never throws)',
  sessionRootResponse.body.ok === true
  && (sessionRootResponse.body.value?.path === null || typeof sessionRootResponse.body.value?.path === 'string'),
  JSON.stringify(sessionRootResponse.body).slice(0, 160))

// The renderer-install routes must answer even when nothing is running: they are
// what the panel's progress bar polls.
const setupStatus = await post('/dsh-manim/runtime/setup-status', {})
check('POST /runtime/setup-status answers a state',
  ['idle', 'running', 'done', 'failed'].includes(setupStatus.body.value?.state),
  JSON.stringify(setupStatus.body).slice(0, 160))

const logged = await post('/dsh-manim/client-log', { where: 'offline-test', message: 'hello', stack: '' })
check('POST /client-log accepts an entry', logged.body.value?.logged === true, JSON.stringify(logged.body).slice(0, 160))

check('pip output is parsed into a phase',
  mod.parseSetupProgress('Collecting manim==0.22.0')?.phase === '下载依赖'
  && mod.parseSetupProgress('Installing collected packages: manim')?.phase === '安装依赖'
  && mod.parseSetupProgress('Successfully installed manim-0.22.0')?.phase === '完成'
  && mod.parseSetupProgress('  something else') === null)

// The setup script must report its own stages: pip runs quiet, so without these
// markers the bar sat at "preparing 0%" for the entire install.
check('the setup script reports stages for the bar',
  mod.parseSetupProgress('##dsh-manim-progress 20 下载依赖')?.percent === 20
  && mod.parseSetupProgress('##dsh-manim-progress 100 完成')?.phase === '完成')

const setupSource = readFileSync(path.join(root, 'runtime', 'setup-runtime.mjs'), 'utf8')
check('setup-runtime actually emits stage markers',
  (setupSource.match(/stage\(\d+,/g) ?? []).length >= 5)

// The install must be a job: start returns at once, the panel polls. Waiting for
// pip inside the request is what kept the bar at 0% for the whole install.
const { EventEmitter } = await import('node:events')
mod.setSetupChildFactory(() => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {}
  setTimeout(() => {
    child.stdout.emit('data', '##dsh-manim-progress 20 下载依赖' + String.fromCharCode(10))
    child.stdout.emit('data', 'Collecting manim==0.22.0' + String.fromCharCode(10) + 'Collecting numpy' + String.fromCharCode(10))
    child.stdout.emit('data', '##dsh-manim-progress 100 完成' + String.fromCharCode(10))
    child.emit('close', 0)
  }, 30)
  return child
})
const startedAt = Date.now()
const setupStart = await post('/dsh-manim/runtime/setup', {})
const startMs = Date.now() - startedAt
check('POST /runtime/setup returns immediately',
  setupStart.body.ok === true && typeof setupStart.body.value?.id === 'string' && startMs < 1000,
  `${String(startMs)}ms`)

const midway = await post('/dsh-manim/runtime/setup-status', {})
check('the job reports a phase while running',
  ['running', 'done', 'failed'].includes(midway.body.value?.state)
  && (midway.body.value?.percent ?? 0) >= 0,
  JSON.stringify(midway.body.value).slice(0, 160))

// Settling now waits a beat to let the child's pipes flush, then runs a probe.
await new Promise((resolve) => setTimeout(resolve, 900))
const settledStatus = await post('/dsh-manim/runtime/setup-status', {})
check('the job settles after the child exits',
  ['done', 'failed'].includes(settledStatus.body.value?.state)
  && settledStatus.body.value?.percent === 100,
  JSON.stringify(settledStatus.body.value).slice(0, 160))

// The failure users actually hit: `close` waits for the child's stdio pipes, and
// setup-runtime runs pip with `stdio: 'inherit'`, so a grandchild can hold the pipe
// open after the script is gone. A child that only emits `exit` must still settle.
mod.setSetupChildFactory(() => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {}
  setTimeout(() => {
    child.stdout.emit('data', 'installing manim ...' + String.fromCharCode(10))
    child.stdout.emit('data', '##dsh-manim-progress 92 写入路径' + String.fromCharCode(10))
    child.emit('exit', 0)
  }, 20)
  return child
})
const exitOnlyStart = await post('/dsh-manim/runtime/setup', {})
check('a second install can start after the first settles', exitOnlyStart.body.ok === true)
const midExit = await post('/dsh-manim/runtime/setup-status', {})
check('status carries the last output line',
  typeof midExit.body.value?.lastLine === 'string' || midExit.body.value?.state === 'idle',
  JSON.stringify(midExit.body.value).slice(0, 160))
await new Promise((resolve) => setTimeout(resolve, 900))
const exitOnly = await post('/dsh-manim/runtime/setup-status', {})
check('a child that only emits exit still settles the job',
  ['done', 'failed'].includes(exitOnly.body.value?.state) && exitOnly.body.value?.percent === 100,
  JSON.stringify(exitOnly.body.value).slice(0, 200))

const listResponse = await post('/dsh-manim/list', { root: workspace })
check('POST /list answers the envelope', listResponse.body.ok === true, JSON.stringify(listResponse.body).slice(0, 200))
check('POST /list returns the scanned scene', listResponse.body.value?.scenes?.some((entry) => entry.rel === 'animations/offline_demo.py') === true)
check('POST /list returns the quality presets', (listResponse.body.value?.qualities ?? []).length >= 3)

const badRoot = await post('/dsh-manim/list', { root: path.parse(workspace).root })
check('POST /list refuses an unregistered root', badRoot.status === 403 && badRoot.body.ok === false, String(badRoot.status))

const missing = await post('/dsh-manim/job', { id: 'does-not-exist' })
check('POST /job 404s an unknown id', missing.status === 404, String(missing.status))

const probe = await post('/dsh-manim/probe', {})
if (probe.body.value?.pythonPresent === true) {
  check('POST /probe reports a working runtime', probe.body.value?.ok === true && probe.body.value?.manim !== undefined, JSON.stringify(probe.body).slice(0, 200))
  check('POST /probe reports the LaTeX situation', typeof probe.body.value?.tex === 'boolean')
} else {
  console.log('  skip  POST /probe runtime assertions — no runtime/venv yet (run `npm run setup:runtime`)')
}

// ---------------------------------------------------------------------------
// The real render needs the plugin venv; skip loudly when it is absent instead of
// dereferencing an undefined video path (that crashed on a fresh checkout).
const runtimeReady = probe.body.value?.pythonPresent === true
if (!fast && runtimeReady) {
  console.log('\n[7] real render (draft) — this is the slow one')
  // -------------------------------------------------------------------------

  const started = Date.now()
  const job = await service.startRender({
    root: workspace,
    path: sceneFile,
    scene: 'OfflineDemo',
    quality: service.qualityFor('draft'),
    origin: 'tool',
  })
  const settled = await service.waitFor(job.id, 10 * 60 * 1000)

  check('the render finished', settled?.state === 'done', JSON.stringify({ state: settled?.state, error: settled?.error }))
  check('the job reported progress', (settled?.progress.done ?? 0) > 0, JSON.stringify(settled?.progress))
  check('the job measured a total', (settled?.progress.total ?? 0) > 0, String(settled?.progress.total))
  const video = settled?.result?.video
  check('an mp4 exists on disk', typeof video === 'string' && existsSync(video), String(video))
  check('the mp4 is not empty', typeof video === 'string' && existsSync(video) && statSync(video).size > 20_000, video === undefined ? '' : String(statSync(video).size))
  check('the render reported a duration', (settled?.result?.duration ?? 0) > 0, String(settled?.result?.duration))
  // The plan cache: a render records what it measured, so the *next* render of
  // the same scene revision can skip the plan pass (worth ~58 s on a large
  // scene), and an edited scene file invalidates it.
  const plan = await service.planFor(sceneFile, 'OfflineDemo')
  check('a finished render caches its plan', plan !== null && plan.plays > 0, JSON.stringify(plan))
  check('the cached plan carries the duration', (plan?.duration ?? 0) > 0, String(plan?.duration))
  const untouched = await service.planFor(sceneFile, 'Grounding')
  check('a cached plan is per scene class', untouched === null)
  writeFileSync(sceneFile, `${sceneSource}
# touched
`, 'utf8')
  const stale = await service.planFor(sceneFile, 'OfflineDemo')
  check('editing the scene invalidates its plan', stale === null, JSON.stringify(stale))
  writeFileSync(sceneFile, sceneSource, 'utf8')

  const published = settled === null ? undefined : (await service.readIndex(workspace)).find((record) => record.sceneFile === sceneFile)
  check('the render was published to the workspace', existsSync(path.join(workspace, 'animations', `OfflineDemo-draft.mp4`)), String(published?.output))

  // Where manim puts the film is manim's business, and this driver has computed
  // that location wrong before: a render was indexed at
  // `…/videos/<quality>/<Scene>.mp4` — the module level missing — while the film
  // had always lived at `…/videos/<module>/<quality>/<Scene>.mp4`. The path is
  // *persisted*, so such a record keeps its stale path forever, and the panel
  // resolves one on every list: that is where the film has to be found again.
  const stalePath = path.join(path.dirname(path.dirname(path.dirname(video))), path.basename(path.dirname(video)), path.basename(video))
  check('the staged path really is stale', !existsSync(stalePath), stalePath)

  // With the workspace copy gone too, the film is found in the render's own cache.
  await service.rememberRender(workspace, { ...published, video: stalePath, output: undefined })
  const located = (await service.readIndex(workspace)).find((record) => record.sceneFile === sceneFile)
  check('re-opening a record finds its film in the cache', located?.video === video, JSON.stringify({ stale: stalePath, reopened: located?.video }))

  // With the copy still there, that copy wins: publishing wrote it from exactly
  // this record's film, and it survives the cache being cleaned.
  await service.rememberRender(workspace, { ...published, video: stalePath })
  const viaCopy = (await service.readIndex(workspace)).find((record) => record.sceneFile === sceneFile)
  check('re-opening a record prefers its published copy', viaCopy?.video === published.output, JSON.stringify({ copy: published?.output, reopened: viaCopy?.video }))
  await service.rememberRender(workspace, published)

  // The video route has to answer a Range request: without it a <video> cannot
  // seek, and the storyboard's "click a frame" does nothing.
  const videoResponse = await fetch(`${base}/dsh-manim/video?id=${job.id}&root=${encodeURIComponent(workspace)}`, {
    headers: { range: 'bytes=0-1023' },
  })
  check('GET /video honours a Range request', videoResponse.status === 206, String(videoResponse.status))
  check('GET /video declares the range', videoResponse.headers.get('content-range')?.startsWith('bytes 0-1023/') === true, String(videoResponse.headers.get('content-range')))
  const chunk = Buffer.from(await videoResponse.arrayBuffer())
  check('GET /video returns the requested bytes', chunk.length === 1024, String(chunk.length))

  const frames = await service.storyboard({ video, keyPath: sceneFile, qualityId: 'draft', count: 4, width: 480 })
  check('storyboard extracted frames', frames.length === 4, JSON.stringify(frames.map((frame) => frame.time)))
  check('frame files exist', frames.every((frame) => existsSync(frame.path)) )
  check('frames are non-empty PNGs', frames.every((frame) => statSync(frame.path).size > 1000))

  const frameResponse = await fetch(`${base}/dsh-manim/frame?file=${encodeURIComponent(frames[0].path)}`)
  check('GET /frame serves a still', frameResponse.status === 200 && frameResponse.headers.get('content-type') === 'image/png')
  const outsideFrame = await fetch(`${base}/dsh-manim/frame?file=${encodeURIComponent(sceneFile)}`)
  check('GET /frame refuses a path outside the cache', outsideFrame.status === 403, String(outsideFrame.status))

  console.log(`  (render + storyboard took ${((Date.now() - started) / 1000).toFixed(1)}s)`)

  // --- agent tools ---------------------------------------------------------
  console.log('\n[8] agent tools')
  // -------------------------------------------------------------------------

  const tools = mod.buildAgentTools(context, service, engine, config)
  check('four tools are built', tools.length === 4, tools.map((tool) => tool.name).join())
  check('tool names are the documented ones', tools.map((tool) => tool.name).join() === 'manim_scene,manim_render,manim_frames,manim_voice')

  const sceneTool = tools.find((tool) => tool.name === 'manim_scene')
  const listResult = await sceneTool.execute({ action: 'list', root: workspace })
  check('manim_scene list sees the scene', listResult.ok === true && listResult.detail.includes('offline_demo.py'), listResult.summary)

  const readResult = await sceneTool.execute({ action: 'read', path: sceneFile, root: workspace })
  check('manim_scene read returns source', readResult.ok === true && readResult.detail.includes('class OfflineDemo'), readResult.summary)

  const writeResult = await sceneTool.execute({
    action: 'write',
    path: path.join(workspace, 'animations', 'broken.py'),
    source: 'class Broken(Scene:\n    pass\n',
    root: workspace,
  })
  check('manim_scene write reports a syntax error', writeResult.ok === false && /line/i.test(writeResult.detail), writeResult.detail.slice(0, 200))

  const framesTool = tools.find((tool) => tool.name === 'manim_frames')
  const framesResult = await framesTool.execute({ path: sceneFile, count: 2, root: workspace })
  check('manim_frames uses the index', framesResult.ok === true && framesResult.files.length === 2, framesResult.summary)

  // Chinese inside a formula is the one failure mathtex() can make silently
  // (placeholder boxes, no error, no log). The guard has to be checked through
  // the real render path, because that is the only place it runs.
  const cjkScene = path.join(workspace, 'animations', 'cjk_formula.py')
  const cjkSource = [
    'from manim import *',
    'from manimkit import *',
    '',
    '',
    'class CjkFormula(Scene):',
    '    def construct(self):',
    '        self.play(FadeIn(mathtex(r"L = \text{共享} + x")))',
    '',
  ].join(String.fromCharCode(10))
  writeFileSync(cjkScene, cjkSource, 'utf8')

  let guardMessage = ''
  try {
    await mod.runDriver({
      pythonPath: config.pythonPath,
      driverPath: config.driverPath,
      spec: { mode: 'render', sceneFile: cjkScene, sceneName: 'CjkFormula', mediaDir: path.join(here, '.offline-tmp-cache'), outputName: 'cjk', width: 854, height: 480, fps: 15, plan: false },
      cwd: path.dirname(cjkScene),
      timeoutMs: 120_000,
    })
  } catch (failure) {
    guardMessage = failure instanceof Error ? failure.message : String(failure)
  }
  check('a Chinese formula is refused, not silently boxed', guardMessage.includes('中文'), guardMessage.slice(0, 160))

  // --- narration ----------------------------------------------------------
  const voiceTool = tools.find((tool) => tool.name === 'manim_voice')
  const voiceList = await voiceTool.execute({ action: 'list', root: workspace })
  check('manim_voice lists the engines', voiceList.ok === true && voiceList.detail.includes('edge='), voiceList.summary.slice(0, 120))
  check('manim_voice finds the offline fallback too', voiceList.detail.includes('sapi='), voiceList.summary.slice(0, 120))

  const spoken = await voiceTool.execute({
    action: 'speak',
    root: workspace,
    dir: 'animations/voice',
    gap: 0.3,
    lines: [
      { id: 'b1', text: '第一句旁白。' },
      { id: 'b2', text: '第二句旁白，稍微长一点点。' },
    ],
  })
  check('manim_voice synthesises the lines', spoken.ok === true, spoken.detail.slice(0, 200))
  check('manim_voice writes a cue sheet', spoken.files.some((file) => file.endsWith('cues.json')), JSON.stringify(spoken.files))
  check('manim_voice reports one wav per line', spoken.files.filter((file) => file.endsWith('.wav')).length === 2, JSON.stringify(spoken.files))
  check('the cue sheet carries offsets', /at=\d+\.\d+s/.test(spoken.detail), spoken.detail.slice(0, 240))

  const voiceSheet = path.join(workspace, 'animations', 'voice', 'cues.json')
  const sheet = existsSync(voiceSheet) ? JSON.parse(readFileSync(voiceSheet, 'utf8')) : null
  check('the cue sheet is valid json with cues', Array.isArray(sheet?.cues) && sheet.cues.length === 2, JSON.stringify(sheet).slice(0, 200))
  check('the second cue starts after the first', (sheet?.cues?.[1]?.at ?? 0) >= (sheet?.cues?.[0]?.duration ?? 0), JSON.stringify(sheet?.cues?.map((c) => c.at)))
  check('every cue file exists on disk', (sheet?.cues ?? []).every((cue) => existsSync(path.join(path.dirname(voiceSheet), cue.file))))

  const envResult = await sceneTool.execute({ action: 'env', root: workspace })
  check('manim_scene env reports the runtime', envResult.ok === true && envResult.detail.includes('0.22.0'), envResult.summary)
} else {
  const why = fast ? '--fast' : 'no runtime/venv - run npm run setup:runtime'
  console.log('[7] real render SKIPPED (' + why + ')')
}

// ---------------------------------------------------------------------------
server.close()
disposeRoutes()
engine.dispose()
// Both scratch trees go, not just the cache: the workspace copy (the published
// `.mp4` under `animations/`) is the one a reader would find later and wonder
// about, and this harness must leave the plugin tree exactly as it found it.
rmSync(path.join(here, '.offline-tmp-cache'), { recursive: true, force: true })
rmSync(workspace, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length > 0) {
  console.log('\nfailures:')
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
console.log('offline harness OK')
