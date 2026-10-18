/**
 * The platform module table a DSH client bundle may `require`.
 *
 * The browser loader (`@deepseek-ai/dsh-client-modules`) answers a plugin
 * factory's `require` from exactly two places:
 *
 *   1. the **platform seed table** — `staticModules` in the web shell's boot,
 *      listed below, and
 *   2. a **dynamic graph row** — a package that itself declares `dsh.client`
 *      with `platform: 'web'` (a bundle may name it in `dsh.client.external`).
 *
 * Anything else throws at materialization time, in the page, for the whole
 * plugin:
 *
 *   client-modules: require("@deepseek-ai/dsh-util-workspace-path") missed the
 *   module table — not a platform seed word, not a materialized module, and no
 *   registered package factory
 *
 * A **browser-safe npm package is neither** of the two, which is why
 * `@deepseek-ai/dsh-util-workspace-path` has to be inlined into the bundle
 * rather than listed as external (2026-09-27: that assumption failed the plugin
 * with "Failed to load plugins").
 *
 * Refresh when DSH is upgraded — the table lives in the shell bundle, seeded by
 * the function that builds `staticModules`:
 *
 *   Select-String -Path "<app>\node_modules\@deepseek-ai\dsh-web-frontend\dist\assets\index-*.js" `
 *     -Pattern 'staticModules'
 *
 * @module tools/platform-modules
 */

/** Seed words the shell materializes before any plugin bundle runs. */
export const PLATFORM_SEED_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

/** Normalize a specifier the way the module graph does: `<pkg>/client` aliases `<pkg>`. */
export function stripClientSuffix(spec) {
  return spec.endsWith('/client') ? spec.slice(0, -7) : spec
}

/** Every `require("…")` specifier a built client bundle asks the loader for. */
export function moduleRequestsOf(bundleText) {
  const requests = new Set()
  for (const match of bundleText.matchAll(/require\(\s*(["'])([^"']+)\1\s*\)/g)) requests.add(match[2])
  return [...requests].sort()
}
