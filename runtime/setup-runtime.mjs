/**
 * Build the plugin's Python runtime.
 *
 * The plugin does not use the machine's `python`. It creates its own virtual
 * environment under `runtime/venv` and installs manim into it, for three
 * reasons:
 *
 * 1. **The user's interpreter is theirs.** People run numpy/scipy/opencv out of
 *    their own environment for real work. Installing a renderer into it is not a
 *    plugin's business, and pinning numpy down to what manim wants is a good way
 *    to break somebody's project.
 * 2. **`pip` availability is not a given.** A conda base env is the one place
 *    `pip install` is the wrong answer; a venv makes that decision once, here,
 *    instead of on every render.
 * 3. **Reproducibility.** `manim==0.22.0` in a venv is a fact the plugin can
 *    state; "whatever manim is on PATH" is not, and the difference shows up as a
 *    render that works on one machine and not another.
 *
 * Why the versions are pinned, and why matplotlib is here at all:
 *
 * * `manim` 0.22 encodes through PyAV in-process — **no ffmpeg binary is needed**,
 *   which is the single biggest reason this runtime installs cleanly on a Windows
 *   box with nothing on PATH.
 * * `matplotlib` is not a manim dependency. It is what `manimkit.mathtex()` uses to
 *   typeset formulas, so the plugin needs **no TeX distribution and no `dvisvgm`**
 *   — a full LaTeX toolchain is the most common thing missing (or broken) on a
 *   fresh machine. If a working LaTeX *is* present, `has_latex()` upgrades to real
 *   `MathTex` automatically.
 *
 * Usage:
 *
 *   node runtime/setup-runtime.mjs                 # create/repair the venv
 *   node runtime/setup-runtime.mjs --python <exe>  # a specific base interpreter
 *   node runtime/setup-runtime.mjs --check         # verify only, install nothing
 *   node runtime/setup-runtime.mjs --force         # rebuild from scratch
 *
 * @module dsh-manim/runtime/setup-runtime
 */

import { spawnSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const runtimeDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(runtimeDir, '..')
const venvDir = join(runtimeDir, 'venv')

/** Pinned so a render that works today still works next month. */
const REQUIREMENTS = ['manim==0.22.0', 'matplotlib>=3.8']

/**
 * Optional, and installed separately so a failure is not fatal.
 *
 * `edge-tts` is the good-sounding narration engine (Microsoft Edge's read-aloud
 * service: free, no API key, Chinese voices close to human). It needs the network
 * at *synthesis* time, and it is not needed at all if only the offline Windows
 * engine is wanted — so a machine without it still has narration, just the
 * robotic kind, and this script says so instead of failing.
 */
const OPTIONAL = ['edge-tts>=7']

/** The interpreter inside the venv. */
function venvPython() {
  return process.platform === 'win32' ? join(venvDir, 'Scripts', 'python.exe') : join(venvDir, 'bin', 'python')
}

/** Run a command, inheriting stdio so pip's progress is visible. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true, ...options })
  if (result.error) throw new Error(`cannot run ${command}: ${result.error.message}`)
  return result.status ?? 1
}

/** Capture a command's stdout (used for --version probes). */
function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true })
  if (result.error || result.status !== 0) return null
  return (result.stdout ?? '').trim()
}

/** Find a base interpreter to build the venv from. */
function findBasePython(explicit) {
  if (explicit !== undefined) return explicit
  for (const candidate of process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']) {
    const version = capture(candidate, ['-V'])
    if (version !== null) return candidate
  }
  throw new Error('no python interpreter found; pass --python <path>')
}

/**
 * Point the venv at `runtime/`, so `import manimkit` works.
 *
 * A `.pth` file rather than an editable install: the package lives in this
 * plugin's tree (so editing `manimkit/*.py` takes effect immediately, which is
 * the point), and `pip install -e` would need a build backend and would break the
 * moment the plugin directory moves. A `.pth` is one line and is rewritten by
 * this script whenever it is run.
 */
function writePathFile(python) {
  const probe = capture(python, ['-c', 'import sysconfig; print(sysconfig.get_paths()["purelib"])'])
  if (probe === null) throw new Error('cannot locate the venv site-packages directory')
  const target = join(probe, 'dsh-manim-kit.pth')
  const wanted = `${runtimeDir}\n`
  if (existsSync(target) && readFileSync(target, 'utf8') === wanted) return target
  writeFileSync(target, wanted, 'utf8')
  return target
}

/** Ask the driver what this runtime can do. */
function verify() {
  const python = venvPython()
  if (!existsSync(python)) return { ok: false, reason: `no interpreter at ${python}` }
  const driver = join(runtimeDir, 'engine', 'driver.py')
  const result = spawnSync(python, [driver, '{"mode":"probe"}'], { encoding: 'utf8', windowsHide: true })
  const voice = spawnSync(python, [join(runtimeDir, 'engine', 'voice.py'), '{"mode":"list"}'], { encoding: 'utf8', windowsHide: true })
  const line = (result.stdout ?? '').split('\n').reverse().find((item) => item.includes('"ev": "result"'))
  if (line === undefined) {
    return { ok: false, reason: (result.stderr ?? '').trim().split('\n').slice(-6).join('\n') || 'driver produced no result' }
  }
  try {
    const info = JSON.parse(line)
    const voiceLine = (voice.stdout ?? '').split('\n').reverse().find((item) => item.includes('"ev": "result"'))
    if (voiceLine !== undefined) {
      try {
        info.narration = JSON.parse(voiceLine).engines
      } catch {
        info.narration = null
      }
    }
    return { ok: true, info }
  } catch {
    return { ok: false, reason: `unparseable probe output: ${line}` }
  }
}

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const force = args.includes('--force')
const pythonArg = args.indexOf('--python')
const explicitPython = pythonArg === -1 ? undefined : args[pythonArg + 1]

if (checkOnly) {
  const status = verify()
  if (status.ok) {
    console.log('runtime OK')
    console.log(JSON.stringify(status.info, null, 2))
    process.exit(0)
  }
  console.error(`runtime NOT ready: ${status.reason}`)
  console.error(`run: node "${join(runtimeDir, 'setup-runtime.mjs')}"`)
  process.exit(1)
}

console.log(`plugin:  ${pluginRoot}`)
console.log(`runtime: ${runtimeDir}`)

if (force && existsSync(venvDir)) {
  console.log('--force: removing the existing venv')
  rmSync(venvDir, { recursive: true, force: true })
}

if (!existsSync(venvPython())) {
  const base = findBasePython(explicitPython)
  console.log(`creating venv from ${base} …`)
  mkdirSync(runtimeDir, { recursive: true })
  const code = run(base, ['-m', 'venv', venvDir])
  if (code !== 0) {
    console.error('creating the venv failed. On Debian/Ubuntu this usually means python3-venv is missing.')
    process.exit(code)
  }
} else {
  console.log('venv already present')
}

const python = venvPython()

// Upgrade pip first: an old pip resolves manim's dependency set differently, and
// the failure that produces ("no matching distribution for X") points nowhere
// near the cause.
console.log('upgrading pip …')
run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '--upgrade', 'pip'])

console.log(`installing ${REQUIREMENTS.join(' ')} … (downloads ~120 MB the first time)`)
const install = run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', ...REQUIREMENTS])
if (install !== 0) {
  console.error('installing manim failed. If the machine has no direct internet, point pip at a mirror:')
  console.error('  node runtime/setup-runtime.mjs   # after setting PIP_INDEX_URL')
  process.exit(install)
}

console.log(`installing ${OPTIONAL.join(' ')} … (optional: higher-quality narration)`)
const optional = run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', ...OPTIONAL])
if (optional !== 0) {
  console.log('  edge-tts 装不上（离线机器 / 镜像里没有）。旁白仍可用 Windows 离线引擎：')
  console.log("    manim_voice(action='speak', engine='sapi', voice='Microsoft Huihui Desktop')")
}

const pth = writePathFile(python)
console.log(`wrote ${pth}`)

const status = verify()
if (!status.ok) {
  console.error(`\nruntime NOT ready: ${status.reason}`)
  process.exit(1)
}

const info = status.info
console.log('\nmanim runtime ready')
console.log(`  python   ${info.python}`)
console.log(`  manim    ${info.manim}`)
console.log(`  pyav     ${info.av}   (video encoding; no ffmpeg binary needed)`)
console.log(`  mathtext ${info.matplotlib ?? 'NOT INSTALLED — formulas will not render'}`)
console.log(`  latex    ${info.tex === true ? 'available' : 'unavailable — use manimkit.mathtex() for formulas'}`)
const narration = info.narration ?? {}
console.log(`  voice    edge=${narration.edge ? 'available' : 'no'} · sapi=${narration.sapi ? 'available' : 'no'}`)
