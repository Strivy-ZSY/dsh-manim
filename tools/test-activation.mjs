/**
 * Activation harness: does the plugin still activate on a shell that offers less?
 *
 * A Cordis context is a Proxy: reading a service that was not injected THROWS, it
 * does not return undefined. That makes "just read the field and check for
 * undefined" a startup-crash bug, not a style question — v1.1.2 did exactly that
 * with `ctx.documentPreviews` and took the official desktop client down with
 * `web boot: 1 entry did not activate / dsh-manim: failed`.
 *
 * So both halves are activated here against a *strict* context, under the service
 * subsets a foreign shell can plausibly present. Every scenario must activate.
 *
 *   node tools/test-activation.mjs
 */

import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const require = createRequire(join(root, 'noop.js'))

let passed = 0
const failures = []
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`  ok   ${name}`) }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

/** A context that throws on any service it was not given, like Cordis does. */
function strictCtx(services) {
  return new Proxy({ ...services }, {
    get(target, prop) {
      if (prop in target) return target[prop]
      if (typeof prop === 'symbol') return undefined
      throw new Error(`service '${String(prop)}' is not available (not injected)`)
    },
    has: () => true,
  })
}

// ---------------------------------------------------------------------------
console.log('[1] host half')

const hostUrl = pathToFileURL(join(root, 'lib', 'index.js')).href
const host = await import(hostUrl)
check('host exports name/apply/inject',
  typeof host.name === 'string' && typeof host.apply === 'function' && Array.isArray(host.inject),
  JSON.stringify(host.inject))

const hostBase = {
  tools: { register: () => () => {} },
  webServer: { register: () => () => {} },
  workspaceRegistry: {
    list: () => [
      { id: 'w1', path: 'C:/work/one', title: 'one', sessionIds: ['s1'] },
      { id: 'w2', path: 'C:/work/two', title: 'two', sessionIds: [] },
    ],
  },
  logger: { info() {}, warn() {}, error() {} },
  effect: (fn) => { try { fn() } catch {} },
  on: () => () => {},
  inject: (_names, fn) => { try { fn?.({}) } catch {} },
}

for (const [label, services] of [
  ['full host services', hostBase],
  ['registry with list() only', { ...hostBase, workspaceRegistry: { list: () => [] } }],
  ['no session service (not injected)', hostBase],
]) {
  let error = null
  try { await host.apply(strictCtx(services), {}) } catch (caught) { error = caught }
  check(`host activates: ${label}`, error === null, error === null ? '' : String(error.message ?? error).slice(0, 140))
}

// ---------------------------------------------------------------------------
console.log('\n[2] client half')

const sandbox = {
  window: { __ModuleLoader__: { load: (definition) => { sandbox.__loaded = definition } } },
  console,
  URL,
  URLSearchParams,
  Blob: class {},
  setTimeout,
  clearTimeout,
  fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, value: {} }) }),
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {}, dataset: {}, appendChild() {}, setAttribute() {}, setAttributeNS() {},
      removeAttribute() {}, addEventListener() {}, remove() {},
    }),
    createTextNode: () => ({}),
    head: { appendChild() {} },
    body: { appendChild() {} },
    documentElement: { appendChild() {} },
    addEventListener() {},
  },
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(readFileSync(join(root, 'lib', 'client.js'), 'utf8'), sandbox)

const loaded = sandbox.__loaded
check('client bundle registers itself', loaded !== null && loaded !== undefined)
check('client bundle id equals the package name', loaded?.id === 'dsh-manim', String(loaded?.id))

const shim = {
  react: require('react'),
  'react/jsx-runtime': require('react/jsx-runtime'),
}
const client = loaded.factory((name) => {
  if (shim[name] !== undefined) return shim[name]
  return new Proxy({}, { get: () => () => ({}) })
})
check('client exports apply', typeof client.apply === 'function')
check('client declares inject', Array.isArray(client.inject), JSON.stringify(client.inject))

let registeredPreview = null
const clientBase = {
  effect: (fn) => { try { fn() } catch {} },
  locale: { register: () => () => {} },
  slots: { inject: (_name, fn) => { fn(); return () => {} }, register: () => () => {} },
  // Official shapes: `ctx.sessions.list` is a snapshot store whose `current`
  // always names the session on screen; `ctx.workspaces.list` rows carry the
  // sessions that live under them (`sessionIds`). Their intersection is how the
  // panel learns which workspace it is in without asking.
  sessions: { list: { getSnapshot: () => ({ ids: ['s1'], byId: {}, current: 's1', phase: 'ready' }), subscribe: () => () => {} } },
  workspaces: {
    list: {
      getSnapshot: () => ({
        items: [
          { workspaceId: 'w1', path: 'C:/work/111', title: '111', sessionIds: ['s1'] },
          { workspaceId: 'w2', path: 'C:/work/default', title: 'default-workspace', sessionIds: [] },
        ],
      }),
      subscribe: () => () => {},
    },
  },
  sidebarRight: { openTab: () => {} },
  sidebarRightTabs: { register: () => () => {} },
  documentPreviews: { register: (definition) => { registeredPreview = definition } },
  // The optional-dependency channel: the callback runs only when the service is
  // present, which is how the video preview registers.
  inject: (names, callback) => {
    const scope = {}
    for (const name of names) if (clientBase[name] !== undefined) scope[name] = clientBase[name]
    if (Object.keys(scope).length === names.length) callback({ ...clientBase, ...scope })
  },
}

for (const [label, services] of [
  ['all services present', clientBase],
  ['no documentPreviews (foreign shell)', { ...clientBase, documentPreviews: undefined }],
  ['no slots', { ...clientBase, slots: undefined }],
  ['no sessions service', { ...clientBase, sessions: undefined }],
  ['no sidebar services', { ...clientBase, sidebarRight: undefined, sidebarRightTabs: undefined }],
]) {
  let error = null
  try { await client.apply(strictCtx(services)) } catch (caught) { error = caught }
  check(`client activates: ${label}`, error === null, error === null ? '' : String(error.message ?? error).slice(0, 140))
}

// ---------------------------------------------------------------------------
console.log('[3] panel renders when the shell ships none of the icon names')

const ReactForRender = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

/** Load the bundle again with a primitives table that has no icons at all. */
function loadWithPrimitives(table) {
  const box = { ...sandbox }
  box.window = { __ModuleLoader__: { load: (definition) => { box.__loaded = definition } } }
  vm.createContext(box)
  vm.runInContext(readFileSync(join(root, 'lib', 'client.js'), 'utf8'), box)
  return box.__loaded.factory((name) => {
    if (name === 'react') return ReactForRender
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return table
    return new Proxy({}, { get: () => () => ({}) })
  })
}

const ButtonLike = (props) => ReactForRender.createElement('button', { 'data-stub': 'button' }, props.icon ?? null, props.children ?? null)
const MenuLike = (props) => ReactForRender.createElement('span', { 'data-stub': 'menu' }, props.anchor ?? null)

const viewProps = {
  data: null, selected: '', sceneClass: null, quality: null, job: null, frames: [],
  error: null, busy: false, showLog: false,
  onSelect: () => {}, onSceneClass: () => {}, onQuality: () => {}, onRender: () => {},
  onCancel: () => {}, onRefresh: () => {}, onStoryboard: () => {}, onNewScene: () => {},
  onToggleLog: () => {}, frameUrl: () => '', videoUrl: () => '', onSeek: () => {},
  videoRef: { current: null },
}

for (const [label, table] of [
  ['official naming, no size-suffixed icons', { Button: ButtonLike, Menu: MenuLike, IconPlayOutlineRegular: () => ReactForRender.createElement('svg', { 'data-stub': 'icon' }) }],
  ['no icons and no Button/Menu at all', {}],
]) {
  let error = null
  let html = ''
  try {
    const client2 = loadWithPrimitives(table)
    html = renderToStaticMarkup(ReactForRender.createElement(client2.StudioView, viewProps))
  } catch (caught) {
    error = caught
  }
  check('view renders: ' + label, error === null, error === null ? '' : String(error.message ?? error).slice(0, 160))
  check('view is not empty: ' + label, html.replace(/<[^>]*>/g, '').trim().length > 0)
}

// ---------------------------------------------------------------------------
console.log('[4] no Node API is used without being imported')

// Twice now a route shipped with a bare `spawn` / `randomUUID`, and the panel got
// "X is not defined" only when the user clicked. Neither the type-checker nor the
// bundler rejects a global that does not exist. This is the cheap static net.
const NODE_APIS = [
  'spawn', 'spawnSync', 'randomUUID', 'createHash', 'existsSync', 'realpathSync',
  'readFile', 'writeFile', 'appendFile', 'mkdir', 'readdir', 'stat', 'realpath',
  'basename', 'dirname', 'join', 'relative', 'resolve', 'isAbsolute', 'extname',
]
const LF = String.fromCharCode(10)
const sources = []
const walkSource = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) { walkSource(path); continue }
    const isTs = entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')
    if (isTs) sources.push(path)
  }
}
walkSource(join(root, 'src'))

/** Is `api` called as a bare function (not as a property) anywhere in `text`? */
function callsBare(text, api) {
  let from = 0
  for (;;) {
    const at = text.indexOf(api, from)
    if (at === -1) return false
    from = at + api.length
    const before = at === 0 ? ' ' : text[at - 1]
    const after = text.slice(at + api.length).trimStart()
    const isProperty = before === '.' || before === '_' || /[A-Za-z0-9]/.test(before)
    if (!isProperty && after.startsWith('(')) return true
  }
}

const offenders = []
for (const file of sources) {
  const text = readFileSync(file, 'utf8')
  const importText = text.split(LF).filter((line) => line.startsWith('import ')).join(LF)
  for (const api of NODE_APIS) {
    if (!callsBare(text, api)) continue
    if (importText.includes(api)) continue
    // A local binding of the same name is not the Node API (`new Promise((resolve) => …)`).
    const declared = ['const ' + api, 'let ' + api, 'function ' + api, '(' + api + ',', '(' + api + ')', api + ' =']
    if (declared.some((needle) => text.includes(needle))) continue
    offenders.push(file.replace(root, '') + ': ' + api)
  }
}
check('every Node API used in src is imported', offenders.length === 0, offenders.join(', '))

// The official plugin page draws a package's own mark from the manifest `icon`
// field (or an `./icon` export); without it the card falls back to the default
// illustration, which is how this plugin shipped looking like a placeholder.
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check('the manifest declares an icon', typeof manifest.icon === 'string' && manifest.icon !== '')
check('the declared icon ships with the package',
  typeof manifest.icon === 'string' && existsSync(join(root, manifest.icon))
  && (manifest.files ?? []).some((entry) => entry === manifest.icon))

// ---------------------------------------------------------------------------
// The panel must land in the workspace whose session is on screen — the exact
// complaint when it asked instead: two workspaces registered, session in one.
check(
  'workspace root follows the session on screen',
  client.detectedWorkspaceRoot() === 'C:/work/111',
  JSON.stringify(client.detectedWorkspaceRoot()),
)
check('video preview registers through the optional dependency', registeredPreview?.id === 'dsh-manim-video', JSON.stringify(registeredPreview?.extensions ?? null))

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length > 0) {
  console.log('\nfailures:')
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
console.log('activation harness OK')
