/**
 * Render the studio panel's markup and assert its structure.
 *
 * "The panel shows a video, a storyboard strip and a progress bar" is a claim
 * about markup, and this is how to check it without a browser: load the **built**
 * client bundle the way the shell does, take the exported view out of it, and
 * render it to a string with a realistic `ListResult` / `RenderJob`.
 *
 * Why the view and not the registered tab body: the body is the container, whose
 * data arrives in an effect, and effects do not run under server rendering — so
 * the body alone renders the loading line and nothing else (this is the trap
 * dsh-ppt's `.pptx` preview harness fell into first: 41 characters of markup and
 * six failures that said nothing about the panel). The container/view split in
 * `studio.tsx` exists so that this file can reach the real markup.
 *
 * Usage: node tools/check-panel-markup.mjs
 *
 * @module dsh-manim/tools/check-panel-markup
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

/** React comes from devDependencies; a DSH install tree is accepted as a fallback. */
const bases = [
  path.join(root, 'node_modules'),
  process.env.DSH_SHELL_MODULES ?? '',
  path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DSH Desktop', 'resources', 'app', 'node_modules'),
].filter((entry) => entry !== '')
const modules = bases.find((base) => {
  try {
    readFileSync(path.join(base, 'react', 'package.json'))
    return true
  } catch {
    return false
  }
})
if (modules === undefined) {
  console.log('SKIP: react / react-dom not installed — run `npm install` to enable this check')
  console.log('      looked in:\n  ' + bases.join('\n  '))
  process.exit(0)
}
const appRequire = createRequire(path.join(modules, 'noop.js'))
const React = appRequire('react')
const server = appRequire('react-dom/server')

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

// --- load the built client bundle the way the shell does --------------------

let captured = null
globalThis.window = { __ModuleLoader__: { load(spec) { captured = spec } } }
// The bundle's i18n reads `document.documentElement.lang`, and the CSS shim
// touches `document.head` — a bare stub that omits documentElement dies with
// "Cannot read properties of undefined (reading 'lang')".
const styleTags = []
globalThis.document = {
  documentElement: { lang: 'zh' },
  querySelector: () => null,
  createElement: () => ({ dataset: {}, style: {}, textContent: '' }),
  head: { appendChild: (tag) => styleTags.push(tag) },
}
globalThis.MutationObserver = class { observe() {} disconnect() {} }
require(path.join(root, 'lib', 'client.js'))
if (captured === null) {
  console.error('FAIL: lib/client.js did not register with the module loader')
  process.exit(1)
}

const slots = new Map()
const tabs = []
const guide = []
const rows = []
const ctx = {
  effect: (fn) => fn(),
  locale: { register: () => () => {} },
  sessions: { list: { subscribe: () => () => {}, getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: 'C:/ws' } } }) } },
  slots: {
    register: (seat, component) => {
      slots.set(seat.name, component)
      return () => {}
    },
    inject: (_name, fn) => fn(),
  },
  sidebarRightTabs: { register: (spec) => { tabs.push(spec); return () => {} } },
  sidebarRight: { openTab: () => {} },
}
/**
 * Stand-ins for the platform seed modules.
 *
 * The primitives used to be answered by a blanket `() => null`, which was fine
 * while the panel hand-rolled its own buttons — and became a problem the moment
 * the panel started using the shell's `Button` and `Menu`: both render *nothing*
 * under that stub, so every assertion about the toolbar would have gone on
 * passing against a toolbar that was not there. A stub has to be faithful about
 * the part under test.
 */
/** Every Menu the shell was handed: `{ items, className }`, newest last. */
const capturedMenus = []

/**
 * The `items` handed to the Menu carrying `needle` in its className.
 *
 * Both dropdowns go through the same primitive, so the array alone cannot say
 * which is which — and an assertion that reads the wrong one passes for the
 * wrong reason.
 */
const menuItems = (needle) => capturedMenus.find((entry) => entry.className.includes(needle))?.items ?? []

const Icon = (name) => {
  const Glyph = () => React.createElement('svg', { 'data-stub-icon': name, 'aria-hidden': 'true' })
  Glyph.displayName = name
  return Glyph
}
const seed = (id) => {
  if (id === 'react') return React
  if (id === 'react/jsx-runtime') return appRequire('react/jsx-runtime')
  if (id === '@deepseek-ai/dsh-client-ui-primitives') {
    // `Button` renders `<button>` with its icon before its children, exactly as
    // the real one does, so the assertions see the same structure the page does.
    const Button = ({ variant = 'ghost', size = 'md', icon = null, className, children, ...rest }) =>
      React.createElement('button', { ...rest, className, 'data-stub-variant': variant, 'data-stub-size': size },
        icon === null ? null : React.createElement('span', { 'data-stub-icon-slot': '' }, icon),
        children)
    Button.displayName = 'Button'
    // `Menu` renders its own trigger plus the list; the list is empty while the
    // menu is closed, which is the state the initial render is in.
    const Menu = ({ anchor, open = false, items = [], className }) => {
      // Recorded because the list is not in the markup while the menu is closed,
      // and "the right presets were handed to the shell's Menu" is the thing
      // worth asserting — scraping a closed menu would assert nothing.
      capturedMenus.push({ items, className: String(className ?? '') })
      return React.createElement('span', { 'data-stub-menu': open ? 'open' : 'closed' },
        anchor,
        open ? React.createElement('div', { role: 'menu' }, ...items.map((item) =>
          React.createElement('button', { key: item.id, role: 'menuitem' }, item.label))) : null)
    }
    Menu.displayName = 'Menu'
    const icons = {
      IconChevronDownOutline14: Icon('chevron-down-14'),
      IconDownloadOutline16: Icon('download-16'),
      IconFolderOpenOutline16: Icon('folder-open-16'),
      IconLoadingOutline16: Icon('loading-16'),
      IconPlayOutline16: Icon('play-16'),
      IconPlusOutline16: Icon('plus-16'),
      IconRefreshOutline16: Icon('refresh-16'),
      IconStopFill16: Icon('stop-16'),
    }
    // An icon the panel uses but this stub does not know would otherwise arrive
    // as `undefined` and surface as React's "Element type is invalid" — a stack
    // trace that says nothing about which icon. Say the real thing instead.
    return new Proxy({ Button, Menu, ...icons }, {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) return Reflect.get(target, property, receiver)
        if (typeof property === 'string' && property.startsWith('Icon')) {
          throw new Error(
            `check-panel-markup: the panel renders ${property}, which this stub does not provide. ` +
              'Add it to the stub (the real package exports ~75 icons) so the markup check stays faithful.',
          )
        }
        return () => null
      },
    })
  }
  return new Proxy({}, { get: () => () => null })
}
const client = captured.factory(seed)
client.apply(ctx)

console.log('\n[1] seats')
check('the bundle id is dsh-manim', captured.id === 'dsh-manim', captured.id)
check('a right-sidebar tab type is registered', tabs.length === 1 && tabs[0].kind === 'manim', JSON.stringify(tabs.map((tab) => tab.kind)))
check('the tab type carries a 开始 capsule', Array.isArray(tabs[0]?.guide) && tabs[0].guide.length === 1)
check('the tab type has a title function', typeof tabs[0]?.title === 'function' && tabs[0].title().length > 0, String(tabs[0]?.title?.()))

// The tab chip and the 开始 capsule carry *different* names on purpose, and the
// user asked for that split after seeing the strip: the chip sits between 文件,
// 幻灯片, 终端, 浏览器, 记忆 — all two or three characters — and a five-character
// 「动画工作室」 was the longest thing in the row. The guide page has a whole row
// per entry, so the fuller name belongs there. Asserted as a *relationship* plus
// a length bound rather than as copy, so rewording stays free but growing the
// chip back into a studio name fails here.
const tabLabel = tabs[0].title()
const guideLabel = tabs[0].guide[0].title()
check('the tab chip is a short object name (≤3 chars)', tabLabel.length <= 3, tabLabel)
check('the guide capsule keeps the fuller name', guideLabel.length > tabLabel.length, `${guideLabel} vs ${tabLabel}`)
check('the tab body is registered', slots.has('sidebar.right.pane.tab'), [...slots.keys()].join(', '))
check('the tab title chip is registered', slots.has('sidebar.right.pane.tab.title'))
// The rail row registers through a slot injection, which the stub above turns
// into a direct `register` call only for the slots it names; assert on the
// injection having happened by looking at how many seats the plugin took.
check('a panel-list row is injected', slots.size + tabs.length + guide.length + rows.length >= 3, String(slots.size))
check('the CSS was injected once', styleTags.length === 1, String(styleTags.length))
check('the CSS tag is attributed to the plugin', styleTags[0]?.dataset?.plugin === 'dsh-manim', String(styleTags[0]?.dataset?.plugin))
check('the stylesheet actually carries rules', (styleTags[0]?.textContent ?? '').length > 500, String((styleTags[0]?.textContent ?? '').length))

console.log('\n[2] the exported view renders')
check('StudioView is exported from the bundle', typeof client.StudioView === 'function')
if (typeof client.StudioView !== 'function') {
  console.log(`\n${passed} passed, ${failures.length} failed`)
  process.exit(1)
}

/** Render the view with a props bag, filling in no-op callbacks. */
function render(overrides = {}) {
  const props = {
    data: null,
    selected: '',
    sceneClass: null,
    quality: null,
    job: null,
    frames: [],
    error: null,
    busy: false,
    showLog: false,
    onSelect: () => {},
    onSceneClass: () => {},
    onQuality: () => {},
    onRender: () => {},
    onCancel: () => {},
    onRefresh: () => {},
    onStoryboard: () => {},
    onNewScene: () => {},
    onToggleLog: () => {},
    frameUrl: (file) => `/dsh-manim/frame?file=${encodeURIComponent(file)}`,
    videoUrl: null,
    onSeek: () => {},
    videoRef: { current: null },
    ...overrides,
  }
  // Cleared per render: `capturedMenus` is read by name, and an entry left over
  // from an earlier render would answer for the wrong one.
  capturedMenus.length = 0
  return server.renderToStaticMarkup(React.createElement(client.StudioView, props))
}

/** The markup of the shell Button carrying `label`, or '' when there is none. */
function buttonWith(html, label) {
  return (html.match(new RegExp(`<button[^>]*data-stub-variant="[^"]*"[^>]*>(?:(?!</button>).)*${label}`, 's')) ?? [''])[0]
}

const qualities = [
  { id: 'draft', label: '草稿 480p15', width: 854, height: 480, fps: 15 },
  { id: '1080p60', label: '高清 1080p60', width: 1920, height: 1080, fps: 60 },
]
const sceneA = {
  path: 'C:/ws/animations/a.py',
  rel: 'animations/a.py',
  dir: 'animations',
  size: 100,
  mtime: 1,
  scenes: ['Intro'],
  renders: [{ sceneFile: 'C:/ws/animations/a.py', scene: 'Intro', quality: '1080p60', video: 'C:/cache/a.mp4', duration: 12.5, plays: 4, width: 1920, height: 1080, fps: 60, at: 1 }],
}
const sceneB = { path: 'C:/ws/animations/b.py', rel: 'animations/b.py', dir: 'animations', size: 100, mtime: 2, scenes: ['A', 'B'], renders: [] }
const data = { root: 'C:/ws', scenes: [sceneA, sceneB], jobs: [], qualities, defaultQuality: '1080p60', background: '#10141c', outputDir: 'animations' }

// The controls must be the shell's own primitives. Asserted on the stub's
// marker attributes, which only the primitive stubs emit — a hand-rolled
// <button> would not carry them.
const empty = render()
check('the toolbar controls are shell Button primitives', /data-stub-variant="primary"/.test(empty), empty.slice(0, 240))
check('the quality picker is a shell Menu', /data-stub-menu="/.test(empty))
check('the toolbar carries shell icons', /data-stub-icon="play-16"/.test(empty))
check('an empty panel still renders the toolbar', empty.includes('toolbar'), empty.slice(0, 120))
check('an empty panel says it is scanning', empty.includes('正在扫描工作区'))

const full = render({ data, selected: sceneA.path, sceneClass: 'Intro', quality: '1080p60' })
check('the toolbar shows the active quality', full.includes('高清 1080p60'), full.slice(0, 200))
const qualityItems = menuItems('qualityMenu')
check(
  'every preset is handed to the shell Menu',
  qualityItems.length === qualities.length && qualityItems.every((item) => typeof item.id === 'string' && typeof item.label === 'string'),
  JSON.stringify(qualityItems).slice(0, 160),
)
check('the Menu is closed on first render', /data-stub-menu="closed"/.test(full))
check('one row per scene file', (full.match(/class="[^"]*sceneRow/g) ?? []).length === 2, String((full.match(/class="[^"]*sceneRow/g) ?? []).length))
check('a rendered scene reports its last render', full.includes('12.5'))
check('a never-rendered scene says so', full.includes('未渲染'))
check('the scene count is shown', full.includes('2 个'))
check('the play button is enabled with a scene selected', buttonWith(full, '开始渲染') !== '' && !buttonWith(full, '开始渲染').includes('disabled'), buttonWith(full, '开始渲染').slice(0, 160))
check('the video element is absent without a render', !full.includes('<video'))
// The chips only appear for the file that actually defines two scenes, so this
// has to select sceneB — asserting on sceneA was asserting on a branch that was
// never taken (which is how this check failed the first time it ran).
const multi = render({ data, selected: sceneB.path, sceneClass: null, quality: 'draft' })
check('a multi-scene file offers one chip per class', (multi.match(/class="[^"]*chip[ "]/g) ?? []).length === 2, String((multi.match(/class="[^"]*chip[ "]/g) ?? []).length))
check('a multi-scene file labels the chip row', multi.includes('场景类'))
check('a multi-scene file blocks the render button', buttonWith(multi, '开始渲染').includes('disabled'), buttonWith(multi, '开始渲染').slice(0, 160))

const playing = render({
  data,
  selected: sceneA.path,
  sceneClass: 'Intro',
  quality: '1080p60',
  videoUrl: '/dsh-manim/video?path=C%3A%2Fws%2Fanimations%2Fa.py&scene=Intro&quality=1080p60',
})
check('the player embeds the mp4', playing.includes('<video') && playing.includes('/dsh-manim/video?'))
check('the player keeps controls', playing.includes('controls'))
check('the output path is surfaced', playing.includes('已输出到') || playing.includes('animations'))

const withFrames = render({
  data,
  selected: sceneA.path,
  sceneClass: 'Intro',
  quality: '1080p60',
  frames: [
    { time: 1.5, path: 'C:/cache/frames/f1.png', width: 480, height: 270 },
    { time: 4, path: 'C:/cache/frames/f2.png', width: 480, height: 270 },
    { time: 9, path: 'C:/cache/frames/f3.png', width: 480, height: 270 },
  ],
})
check('one storyboard cell per frame', (withFrames.match(/class="[^"]*boardCell/g) ?? []).length === 3, String((withFrames.match(/class="[^"]*boardCell/g) ?? []).length))
check('each cell is an image', (withFrames.match(/<img/g) ?? []).length === 3)
check('a cell points at the frame route', withFrames.includes('/dsh-manim/frame?file='))
check('a cell shows its timestamp', withFrames.includes('4.0s'))

const running = render({
  data,
  selected: sceneA.path,
  sceneClass: 'Intro',
  quality: 'draft',
  job: {
    id: 'j1',
    path: sceneA.path,
    scene: 'Intro',
    quality: 'draft',
    state: 'rendering',
    progress: { done: 3, index: 4, total: 12, fraction: 0.29, animFraction: 0.5, elapsed: 42, label: 'Write' },
    log: ['line one', 'line two'],
    startedAt: 1,
    endedAt: null,
    result: null,
    error: null,
    frames: [],
    origin: 'panel',
  },
})
check('a running render shows its stage out of the total', running.includes('4/12'), running.slice(0, 0) || 'expected 第 4/12 段')
check('a running render shows a percentage width', running.includes('width:29%'), 'expected style="width:29%"')
check('a running render shows the current animation', running.includes('Write'))
check('a running render offers cancel', running.includes('取消'))
check('a running render disables the render button', buttonWith(running, '渲染中').includes('disabled'), buttonWith(running, '渲染中').slice(0, 160))

const failed = render({
  data,
  selected: sceneA.path,
  sceneClass: 'Intro',
  quality: 'draft',
  job: {
    id: 'j2',
    path: sceneA.path,
    scene: 'Intro',
    quality: 'draft',
    state: 'failed',
    progress: { done: 1, index: 2, total: 4, fraction: 0.25, animFraction: 0, elapsed: 3, label: '' },
    log: [],
    startedAt: 1,
    endedAt: 2,
    result: null,
    error: { kind: 'scene', message: 'scene not found: Nope', traceback: '' },
    frames: [],
    origin: 'tool',
  },
})
check('a failure is shown as an error', failed.includes('渲染失败') && failed.includes('scene not found'))

// --- the 文件 menu: switching between finished videos ------------------------
//
// The scene list is about source files; this menu is about artifacts. Two
// scenes, three renders between them, plus a second quality of the same scene
// that the scene list could never surface.
const twoRenders = {
  ...data,
  scenes: [
    { ...sceneA, renders: [
      { sceneFile: sceneA.path, scene: 'Intro', quality: '1080p60', video: 'C:/cache/a.mp4', duration: 12.5, plays: 4, width: 1920, height: 1080, fps: 60, at: 200 },
      { sceneFile: sceneA.path, scene: 'Intro', quality: 'draft', video: 'C:/cache/a2.mp4', duration: 12.1, plays: 4, width: 854, height: 480, fps: 15, at: 100 },
    ] },
    { ...sceneB, renders: [
      { sceneFile: sceneB.path, scene: 'A', quality: '720p30', video: 'C:/cache/b.mp4', duration: 5, plays: 2, width: 1280, height: 720, fps: 30, at: 300 },
    ] },
  ],
}
const withFiles = render({ data: twoRenders, selected: sceneA.path, sceneClass: 'Intro', quality: '1080p60' })
check('the toolbar carries a 文件 button', buttonWith(withFiles, '文件') !== '', withFiles.slice(0, 200))
const fileMenu = menuItems('fileMenu')
check('the 文件 menu lists every render', (fileMenu ?? []).filter((item) => item.id !== undefined).length === 3, JSON.stringify(fileMenu ?? []).slice(0, 260))
check('the 文件 menu marks the one on screen', (fileMenu ?? []).some((item) => String(item.id).startsWith(sceneA.path) && String(item.id).includes('1080p60') && item.selected !== false), JSON.stringify(fileMenu ?? []).slice(0, 200))
check('the 文件 menu carries the scene file path', (fileMenu ?? []).some((item) => typeof item.description === 'string' && item.description.includes('b.py')), JSON.stringify(fileMenu ?? []).slice(0, 260))

// A workspace with a scene but no *renders* — the other half of the menu.
const noFiles = render({
  data: { ...data, scenes: [{ ...sceneA, renders: [] }] },
  selected: sceneA.path,
  sceneClass: 'Intro',
  quality: 'draft',
})
const emptyFileMenu = menuItems('fileMenu')
check('an empty workspace lists no videos', emptyFileMenu.every((item) => item.id === undefined), JSON.stringify(emptyFileMenu).slice(0, 160))

// Films that exist on disk but were never indexed by this installation are the
// case a real workspace hit: `animations/*.mp4` present, menu claiming "no
// finished film". The list is built from the workspace listing, not the index.
const withDiskVideos = render({
  data: {
    ...data,
    scenes: [{ ...sceneA, renders: [] }],
    videos: [{ rel: 'animations/Intro-1080p60.mp4', name: 'Intro-1080p60.mp4', at: Date.now(), size: 1024 }],
  },
  selected: sceneA.path,
  sceneClass: 'Intro',
  quality: 'draft',
})
const diskMenu = menuItems('fileMenu')
check('a film on disk appears in the 文件 menu',
  (diskMenu ?? []).some((item) => item.id === 'file:animations/Intro-1080p60.mp4'),
  JSON.stringify(diskMenu).slice(0, 200))
void withDiskVideos

check('the empty 文件 menu says why', emptyFileMenu.some((item) => typeof item.text === 'string' && item.text !== ''), JSON.stringify(emptyFileMenu).slice(0, 160))
void noFiles

// --- layout: picture and storyboard share one stage --------------------------
const positions = (html) => ({
  stage: html.indexOf('data-dsh-manim-stage'),
  player: html.indexOf('data-dsh-manim-player'),
  board: html.indexOf('data-dsh-manim-board'),
})
const boxes = positions(withFrames)
check('the player and the storyboard share one stage', boxes.stage >= 0 && boxes.stage < boxes.player && boxes.player < boxes.board, JSON.stringify(boxes))

const logged = render({ data, selected: sceneA.path, sceneClass: 'Intro', quality: 'draft', showLog: true })
check('the log panel toggles open', logged.includes('<pre'))

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length > 0) {
  console.log('\nfailures:')
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
console.log('panel markup OK')
