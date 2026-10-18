/**
 * Materialize the built client bundle the way DSH's browser loader does.
 *
 * The loader (`@deepseek-ai/dsh-client-modules`) runs `lib/client.js` for its
 * side effect only — `window.__ModuleLoader__.load({ id, factory })` registers a
 * factory — and materializes it later with a `require` that answers **seed
 * words** (the platform table) and **registered factories** (dynamic graph
 * rows). Anything else throws inside the page, and the boot reports it as
 * 「部分插件加载失败 / Some plugins failed to load」 for the whole plugin:
 *
 *   client-modules: require("@deepseek-ai/dsh-util-workspace-path") missed the
 *   module table — not a platform seed word, not a materialized module, and no
 *   registered package factory (a build-time externals drift, or a dynamic
 *   dependency that did not arrive)
 *
 * That is exactly what happened on 2026-09-27: the browser half kept a
 * browser-safe shell package `external` "to share the shell's parser", but the
 * shell never seeds it and it declares no `dsh.client` row — so it was neither
 * of the two things the table can answer. The host half had always inlined it;
 * only the page was broken, and a build that exits 0 while shipping that bundle
 * is a build that lies.
 *
 * So: run the bundle, call the factory, and let the stub `require` below throw
 * the loader's own error for anything it cannot answer. Usage:
 *
 *   node tools/check-client-modules.mjs [lib/client.js]
 *
 * The optional argument checks another artifact (a `.bak-*` of a bundle the GUI
 * rejected, say) against this package's declarations.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLATFORM_SEED_MODULES, moduleRequestsOf, stripClientSuffix } from './platform-modules.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = process.argv[2] === undefined
  ? path.join(root, 'lib', 'client.js')
  : path.resolve(process.argv[2])
const text = readFileSync(bundlePath, 'utf8')

/** The bundle's own package name: the id it must register and the row it becomes. */
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const expectedId = packageJson.name

/**
 * Stand-ins for the seed words this bundle legitimately requires. A proxy keeps
 * the check about *module arrival* rather than about React's API: the factory
 * body only defines components here, it does not render them.
 */
const seeds = {
  react: new Proxy({}, { get: (_, key) => (key === '__esModule' ? true : () => ({})) }),
  'react/jsx-runtime': { jsx: () => ({}), jsxs: () => ({}), Fragment: Symbol('Fragment') },
  '@deepseek-ai/dsh-client-ui-primitives': new Proxy({}, { get: () => () => ({}) }),
}

const failures = []

/**
 * Names this package declares it needs beyond the seed table. `external` is the
 * module request itself; `inject` is the ordering that makes the named row's
 * factory arrive first — either way the loader can answer it, so the stub below
 * answers it too (a proxy, because this check is about *arrival*, not about the
 * other plugin's API).
 */
const declared = new Set([
  ...(packageJson.dsh?.client?.external ?? []),
  ...(packageJson.dsh?.client?.inject ?? []),
].map(stripClientSuffix))

/** Stand-ins for the modules the loader can answer, so the factory can run. */
function stubFor(spec) {
  if (spec in seeds) return seeds[spec]
  if (PLATFORM_SEED_MODULES.has(spec)) return new Proxy({}, { get: () => () => ({}) })
  if (declared.has(stripClientSuffix(spec))) return new Proxy({}, { get: () => () => ({}) })
  return undefined
}

// 1. Execute the bundle: it must register exactly one factory, under its own id.
let registration
globalThis.window = { __ModuleLoader__: { load: (value) => { registration = value } } }
try {
  new Function(text)()
} catch (error) {
  console.error(`FAIL ${bundlePath} threw while registering its factory`)
  console.error(`     ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
if (registration === undefined) {
  console.error(`FAIL ${bundlePath} never called window.__ModuleLoader__.load({ id, factory })`)
  process.exit(1)
}
if (registration.id !== expectedId) {
  failures.push(`registered id "${registration.id}" but package.json is "${expectedId}"`)
}
if (typeof registration.factory !== 'function') failures.push('the registration carries no factory function')

// 2. Materialize it with the loader's resolution rules and nothing else.
const asked = []
let exports_
try {
  exports_ = registration.factory((spec) => {
    asked.push(spec)
    const stub = stubFor(spec)
    if (stub !== undefined) return stub
    throw new Error(`client-modules: require("${spec}") missed the module table — not a platform seed word, not a materialized module, and no registered package factory`)
  })
} catch (error) {
  console.error(`FAIL ${bundlePath} cannot be materialized by the browser module table`)
  console.error(`     ${error instanceof Error ? error.message : String(error)}`)
  const requests = moduleRequestsOf(text)
  console.error(`     bundle requests: ${requests.join(', ') || '(none)'}`)
  for (const spec of requests) if (!PLATFORM_SEED_MODULES.has(spec)) console.error(`     not a seed word: ${spec} — inline it (tools/build.mjs INLINE_SHELL_PACKAGES)`)
  process.exit(1)
}

// 3. A materialized plugin half must be a plugin: the loader refuses one without apply.
if (typeof exports_.apply !== 'function') failures.push('the materialized exports carry no apply()')
if (exports_.name !== expectedId) failures.push(`exported name "${String(exports_.name)}" does not match "${expectedId}"`)

// 4. Everything the bundle actually asked for must be answerable. Declared names
//    are only reported: provider and cycle rules for a dynamic row belong to the
//    host composer, not to this check.
const notes = []
const requests = [...new Set(asked)].sort()
for (const spec of requests) {
  if (PLATFORM_SEED_MODULES.has(spec)) continue
  if (declared.has(stripClientSuffix(spec))) {
    notes.push(`require("${spec}") is answered by a dynamic row (declared, not a seed word)`)
    continue
  }
  failures.push(`require("${spec}") is neither a platform seed word nor declared in dsh.client.external/inject`)
}

console.log(`${bundlePath}`)
console.log(`  registered id:   ${registration.id}`)
console.log(`  module requests: ${requests.length === 0 ? '(none)' : requests.join(', ')}`)
console.log(`  exports:         name=${String(exports_.name)} inject=${JSON.stringify(exports_.inject ?? [])}`)
for (const note of notes) console.log(`  note: ${note}`)
if (failures.length > 0) {
  console.error('\nFAIL the browser module table cannot serve this bundle:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('OK every module request is answerable and the factory materializes')
