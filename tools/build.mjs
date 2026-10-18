/**
 * dsh-manim build: the host bundle (`lib/index.js`) and the browser bundle
 * (`lib/client.js`).
 *
 * Two very different shapes, for the same reason dsh-ppt and dsh-drawio have two:
 *
 * - The host half is loaded by absolute path from the profile patch layer, so it
 *   must be a single self-contained ESM file with no bare imports that could
 *   resolve outside DSH's module graph. esbuild bundles `src/**` into one file
 *   with `node:*` (and everything else) left external — the host half has no
 *   runtime dependencies at all.
 *
 * - The browser half is fetched by DSH's client-module loader, which expects a
 *   `window.__ModuleLoader__.load({ id, factory })` wrapper whose `factory`
 *   receives `require` for the platform seed modules. React and the design system
 *   come from that `require`, so the shell keeps ONE React and ONE primitives
 *   instance. CSS modules are compiled to `local-css` and injected as a single
 *   `<style>` tag by the shim below.
 *
 *   That `require` is answered by the platform seed table or by a dynamic graph
 *   row (a package that itself declares `dsh.client`), and by nothing else.
 *   **"Browser-safe" does not mean "in the module table"**: only seed words may
 *   stay external, and everything else has to be inlined — see
 *   {@link assertClientExternals} and `tools/check-client-modules.mjs`.
 *
 * Usage: node tools/build.mjs [--dry] [--client] [--host]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLATFORM_SEED_MODULES, moduleRequestsOf, stripClientSuffix } from './platform-modules.mjs'
import { sourceStamp as computeSourceStamp } from './source-stamp.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

/** Build stamp baked into the browser bundle; also the bundle's identity in a page. */
const PLUGIN_ID = 'dsh-manim'

/** esbuild comes from this package's own devDependencies (`npm install`). */
const ESBUILD_ROOTS = [
  path.join(root, 'node_modules'),
  process.env.DSH_ESBUILD_ROOT ?? '',
].filter((entry) => entry !== '')

/** Load esbuild from whichever tree has it. */
async function loadEsbuild() {
  for (const base of ESBUILD_ROOTS) {
    const candidate = path.join(base, 'esbuild', 'lib', 'main.js')
    if (existsSync(candidate)) {
      const module = await import(new URL(`file://${candidate.replaceAll('\\', '/')}`).href)
      return module.build ?? module.default?.build
    }
  }
  throw new Error('esbuild not found — run `npm install` first (it is a devDependency), or point DSH_ESBUILD_ROOT at a node_modules tree that has it')
}

/**
 * Resolve the sources' relative imports to real files before esbuild does.
 *
 * Two reasons this is not optional here, both learned the hard way in dsh-ppt:
 *
 * 1. The sources use explicit `.ts` / `.tsx` extensions (the form Node's own
 *    type-stripping wants, so the same files run under plain `node`). esbuild
 *    strips the extension and then fails to find the file.
 * 2. esbuild's own parent-directory resolution is wrong for a path with a
 *    dot-prefixed segment, because `path.dirname` treats `.mini` as a file name.
 */
const TS_RESOLVE = {
  name: 'ts-file-resolve',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.importer === '') {
        // The entry point, as written on the command line.
        const candidate = path.resolve(args.path)
        return existsSync(candidate) ? { path: candidate, namespace: 'file' } : undefined
      }
      if (!args.path.startsWith('.')) return undefined
      const candidate = path.normalize(path.resolve(args.importer, '..', args.path))
      return existsSync(candidate) ? { path: candidate, namespace: 'file' } : undefined
    })
  },
}

/**
 * Resolve one shell package out of the installed DSH runtime.
 *
 * The plugin tree has no `node_modules` of its own — registration is by absolute
 * path precisely so the profile's `package.json` and `pnpm-lock.yaml` stay
 * untouched — so a bare import of a shell package cannot be resolved from here.
 * The browser half is fine (the loader's `require` seed supplies it), but the
 * HOST half has to be a single self-contained file, so the one shell helper it
 * uses is inlined. This plugin currently inlines nothing
 * ({@link INLINE_SHELL_PACKAGES} is empty), so this resolver exists only as the
 * seam for the first one that is needed — adding a package means adding a
 * transitive tree to the bundle, which is a decision, not a default.
 */
const SHELL_MODULES = [
  process.env.DSH_SHELL_MODULES,
  'E:\\DSH Desktop\\resources\\app\\node_modules',
  'D:\\DSH Desktop\\resources\\app\\node_modules',
  path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DSH Desktop', 'resources', 'app', 'node_modules'),
].filter((entry) => typeof entry === 'string' && entry !== '')

/** The shell packages this build inlines instead of leaving external. */
const INLINE_SHELL_PACKAGES = []

/** Which installed copies of shell packages a build inlined, for the build log. */
const INLINED_SHELL_HITS = []

const SHELL_RESOLVE = {
  name: 'dsh-shell-packages',
  setup(build) {
    if (INLINE_SHELL_PACKAGES.length === 0) return
    const pattern = new RegExp(`^(${INLINE_SHELL_PACKAGES.map((p) => p.replaceAll('/', '\\/')).join('|')})$`)
    build.onResolve({ filter: pattern }, (args) => {
      for (const base of SHELL_MODULES) {
        const dir = path.join(base, ...args.path.split('/'))
        const manifest = path.join(dir, 'package.json')
        if (!existsSync(manifest)) continue
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
        const entry = typeof pkg.main === 'string' ? pkg.main : 'lib/index.js'
        const resolved = path.join(dir, entry)
        if (existsSync(resolved)) {
          const hit = `${args.path}@${pkg.version ?? '?'} ← ${base}`
          if (!INLINED_SHELL_HITS.includes(hit)) INLINED_SHELL_HITS.push(hit)
          return { path: resolved, namespace: 'file' }
        }
      }
      throw new Error(`cannot inline ${args.path}: not found in\n  ${SHELL_MODULES.join('\n  ')}`)
    })
  },
}

/**
 * Specifiers the browser half keeps external. Seed words only — the platform
 * table these come from lives in `tools/platform-modules.mjs`, because the
 * loader's `require` walks seed table → memoized record → registered factory and
 * throws "missed the module table" for anything else.
 */
const CLIENT_EXTERNAL = [
  'react',
  'react/jsx-runtime',
  'react-dom/client',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/**
 * The specifiers esbuild actually left external in an output, read from its
 * metafile. This — not the option list above — is what a `require("…")` in the
 * bundle will ask the page for, so this is what the gate must judge.
 *
 * @param metafile - the build's metafile (`metafile: true`).
 * @returns every external import specifier of every output.
 */
function externalImportsOf(metafile) {
  const external = new Set()
  for (const output of Object.values(metafile.outputs ?? {})) {
    for (const item of output.imports ?? []) {
      if (item.external === true) external.add(item.path)
    }
  }
  return external
}

/**
 * Refuse to ship a client bundle that externs a module the browser module table
 * cannot answer.
 *
 * The gate judges what esbuild **actually externalized** (its metafile), not the
 * `external` option list: a config edit that hands esbuild a different list must
 * not slip past the check. This is the check that was missing on 2026-09-27 in
 * dsh-ppt: `external` held a browser-safe shell package that is neither a seed
 * word nor a `dsh.client` row, the build exited 0, and the page answered
 * "Failed to load plugins" for the whole GUI.
 *
 * @param externals - specifiers esbuild externalized, from `externalImportsOf`.
 * @throws {Error} listing every externed specifier that nothing can answer.
 */
function assertClientExternals(externals) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const declared = new Set((pkg.dsh?.client?.external ?? []).map(stripClientSuffix))
  const answerable = (spec) => {
    if (PLATFORM_SEED_MODULES.has(spec)) return true
    return declared.has(stripClientSuffix(spec))
  }
  const unanswerable = [...externals].filter((spec) => !answerable(spec)).sort()
  if (unanswerable.length > 0) {
    throw new Error([
      'client bundle externs module(s) the browser module table cannot answer:',
      ...unanswerable.map((spec) => `  - ${spec}`),
      '',
      'The loader answers require() from the platform seed table',
      `  (${[...PLATFORM_SEED_MODULES].join(', ')})`,
      'or from a dynamic row named by dsh.client.external (a package that declares',
      "dsh.client platform 'web'). A browser-safe npm package is neither, so it must be",
      'INLINED: add it to INLINE_SHELL_PACKAGES so SHELL_RESOLVE bakes in the copy the',
      'installed shell ships, and keep it out of the client build\'s external list.',
    ].join('\n'))
  }
}

/**
 * The CSS-module shim: one `<style>` per source file, attributed, self-healing.
 *
 * Three properties, each from a real failure mode in this shell:
 *
 * 1. **`data-plugin` is set BEFORE the tag enters the document.** The module
 *    loader, immediately after a factory returns, claims every
 *    `style:not([data-plugin])` as its own and removes it on unload — so an
 *    unattributed tag can be claimed by whichever plugin was evaluated next, and
 *    deleted with it.
 * 2. **Re-install if it disappears.** A hot reload (or anything else that unloads
 *    this plugin's styles) can leave the panel unstyled; re-adding is cheap and
 *    the panel must not depend on the shell's unload bookkeeping being right.
 * 3. **Refresh stale content.** A hot reload replaces the module but not the tag
 *    it inserted last time, so a changed stylesheet would otherwise never take
 *    effect until a full window refresh.
 *
 * @param css - compiled CSS text.
 * @param id - the plugin id the tag is attributed to.
 * @returns a JS snippet to prepend to the bundle factory.
 */
function cssShim(css, id) {
  if (css === undefined) return ''
  return `//#region ${PLUGIN_ID} styles
const css = ${JSON.stringify(css.trim())};
const tagId = ${JSON.stringify(`${id}/styles.css`)};
const styleSelector = "style[data-plugin-css=" + JSON.stringify(tagId) + "]";
const installStyles = () => {
	if (typeof document === "undefined" || document.head === null) return;
	const existing = document.querySelector(styleSelector);
	if (existing !== null) {
		// Same tag, newer build: keep it in step instead of leaving the old rules.
		if (existing.textContent !== css) existing.textContent = css;
		return;
	}
	const tag = document.createElement("style");
	tag.dataset.plugin = ${JSON.stringify(id)};
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
};
installStyles();
if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.head !== null) {
	new MutationObserver(() => { if (document.querySelector(styleSelector) === null) installStyles(); })
		.observe(document.head, { childList: true });
}
//#endregion
`
}

const indent = (text, pad) => text.split('\n').map((line) => (line === '' ? '' : pad + line)).join('\n')

/**
 * Write a file, but only when its bytes would change.
 *
 * `dsh-client-hmr` watches the bundle; rewriting an identical file still moves
 * its mtime and still triggers a reload of the plugin mid-turn. See the stamp's
 * note for what that cost.
 *
 * @param file - absolute path.
 * @param text - the new content.
 * @returns whether the file was written.
 */
function writeIfChanged(file, text) {
  try {
    if (readFileSync(file, 'utf8') === text) return false
  } catch {
    // Missing or unreadable: fall through and write it.
  }
  writeFileSync(file, text)
  return true
}

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const onlyClient = args.includes('--client')
const onlyHost = args.includes('--host')
const esbuildBuild = await loadEsbuild()

if (!onlyClient) {
  const result = await esbuildBuild({
    entryPoints: [path.join(root, 'src/index.ts')],
    bundle: true,
    write: false,
    outfile: path.join(root, 'lib/index.js'),
    format: 'esm',
    platform: 'node',
    target: 'node22',
    // Everything except the inlined helpers stays external, so this config
    // cannot silently alter what the file depends on at load time.
    external: ['node:*', '@deepseek-ai/*'],
    plugins: [TS_RESOLVE, SHELL_RESOLVE],
    logLevel: 'warning',
    legalComments: 'none',
  })
  const js = result.outputFiles.find((file) => file.path.endsWith('.js'))
  if (js === undefined) throw new Error('esbuild produced no host output')
  if (dry) console.log(`host dry run: ${js.text.length} bytes`)
  else {
    const wrote = writeIfChanged(path.join(root, 'lib/index.js'), js.text)
    console.log(`lib/index.js: ${js.text.length} bytes${wrote ? '' : ' (unchanged, not rewritten)'}`)
  }
}

if (!onlyHost) {
  /**
   * The build stamp, baked into the browser bundle.
   *
   * The window does NOT pick up a rebuilt `lib/client.js` until it is refreshed,
   * and a stale client half looks exactly like a code bug — the same panel, the
   * same pixels, none of the fixes. A stamp makes the running revision a fact the
   * page can be asked for, instead of something to argue about.
   *
   * It is a hash of the SOURCES, not a clock reading: a timestamp changes on
   * every build even when nothing else did, so every build rewrote
   * `lib/client.js` — and `dsh-client-hmr` reloads a client plugin whenever its
   * bundle changes, leaving the shell's in-flight loading skeleton unstyled until
   * the window was refreshed.
   */
  const stamp = computeSourceStamp(root)
  const result = await esbuildBuild({
    entryPoints: [path.join(root, 'src/client/index.ts')],
    bundle: true,
    write: false,
    outdir: path.join(root, 'lib'),
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    loader: { '.css': 'local-css' },
    define: { __DSH_MANIM_BUILD__: JSON.stringify(stamp) },
    plugins: [TS_RESOLVE, SHELL_RESOLVE],
    // Seed words only — see the note on `assertClientExternals`.
    external: CLIENT_EXTERNAL,
    // The gate below reads what esbuild externalized from this metafile, so the
    // option list above is never trusted on its own.
    metafile: true,
    logLevel: 'warning',
    legalComments: 'none',
  })
  const js = result.outputFiles.find((file) => file.path.endsWith('.js'))
  const css = result.outputFiles.find((file) => file.path.endsWith('.css'))
  if (js === undefined) throw new Error('esbuild produced no client output')
  const bundle = `window.__ModuleLoader__.load({
	id: ${JSON.stringify(PLUGIN_ID)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${indent(cssShim(css?.text, PLUGIN_ID), '\t\t')}${indent(js.text.trimEnd(), '\t\t')}
		return module.exports;
	}
});
`
  // Checked before anything is written: an unanswerable external is a load-time
  // failure in the page, so it must never reach lib/client.js.
  assertClientExternals(externalImportsOf(result.metafile))
  const requests = moduleRequestsOf(bundle)
  console.log(`  module requests: ${requests.length === 0 ? '(none)' : requests.join(', ')}`)
  console.log(`  build stamp: ${stamp}`)
  for (const hit of INLINED_SHELL_HITS) console.log(`  inlined shell package: ${hit}`)
  if (dry) console.log(`client dry run: ${bundle.length} bytes (css ${css?.text.length ?? 0})`)
  else {
    const wrote = writeIfChanged(path.join(root, 'lib/client.js'), bundle)
    console.log(`lib/client.js: ${bundle.length} bytes (css ${css?.text.length ?? 0})${wrote ? '' : ' (unchanged, not rewritten)'}`)
  }
}

// A quick guard: the loader refuses a bundle that does not export apply/name.
if (!dry) {
  for (const file of readdirSync(path.join(root, 'lib'))) {
    if (!file.endsWith('.js')) continue
    const text = readFileSync(path.join(root, 'lib', file), 'utf8')
    if (text.length === 0) throw new Error(`lib/${file} is empty`)
  }
}
