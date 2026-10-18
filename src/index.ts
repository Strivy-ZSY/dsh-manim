/**
 * dsh-manim — a Manim animation studio for the DeepSeek Harness web GUI.
 *
 * Host half: the `/dsh-manim` HTTP routes (workspace-gated scene listing, the
 * render engine, video/still streaming, scaffolding) and the three agent tools
 * (`manim_scene` / `manim_render` / `manim_frames`). The browser half (exports
 * `./client`) mounts the sidebar row and the 动画工作室 tab.
 *
 * The renderer itself is a Python process this plugin owns: manim 0.22 lives in
 * `runtime/venv`, created by `runtime/setup-runtime.mjs`. Nothing here shells out
 * to a `python` on PATH, and nothing installs into the user's own interpreter.
 *
 * Function plugin — no default export (the Loader unwraps
 * `exports.default ?? exports`).
 *
 * @module dsh-manim
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-workspace'
import { resolveConfig, type Config } from './config.ts'
import { RenderEngine } from './engine.ts'
import { ManimService } from './service.ts'
import { registerManimRoutes } from './routes.ts'
import { registerBundledSkills } from './skills.ts'
import { buildAgentTools } from './tools.ts'

export const name = 'dsh-manim'

/** Hard services: the tool registry, the workspace registry, the web server. */
export const inject = ['tools', 'workspaceRegistry', 'webServer']

export { resolveConfig, QUALITIES, DEFAULT_QUALITY, TOOL_IDS, qualityById, defaultPythonPath, PLUGIN_ROOT } from './config.ts'
export type { Config, Quality, RawConfig, ToolId } from './config.ts'
export { RenderEngine, runDriver, runPythonSpec, parseEvent } from './engine.ts'
export type { DriverEvent, DriverSpec, Frame, JobProgress, JobState, RenderJob, RenderResult } from './engine.ts'
export { ManimService, isPathInside, normalizeForPrefix, parseSetupProgress, safeClassName, safeName, scanScenes, sceneKey, findWorkspaceRootForSession, listWorkspaceRoots, verifyPathInSomeWorkspace, verifyWorkspaceRoot } from './service.ts'
export type { GateVerdict, PlanRecord, RenderRecord, SceneEntry, SetupStep } from './service.ts'
export { registerManimRoutes } from './routes.ts'
export { BUNDLED_SKILLS, parseSkillMarkdown, registerBundledSkills } from './skills.ts'
export type { ParsedSkill } from './skills.ts'
export { buildAgentTools } from './tools.ts'
export type { ManimToolResult } from './tools.ts'

/**
 * Mount the plugin: the `/dsh-manim` routes and the agent tools (config-gated).
 *
 * No `Config` schema is exported on purpose: cordis only validates when a plugin
 * publishes one (`resolveConfig` returns the raw value when `runtime.Config` is
 * absent), which keeps a permissive `config` block in the profile patch from
 * being able to refuse the plugin at boot. Values are normalized here instead,
 * and an unknown key is ignored.
 *
 * @param ctx - context carrying tools + workspaceRegistry + webServer.
 * @param config - raw loader config; defaults applied through `resolveConfig`.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved = resolveConfig(config)

  // A positive attach marker on the log. A plugin that loads but silently fails
  // to attach looks identical to one that was never listed, and nothing else in
  // this file can prove it ran.
  try {
    ctx.logger?.info?.('dsh-manim: 动画工作室已 attach')
  } catch {
    // apply() must never throw for a logging failure.
  }

  const engine = new RenderEngine({
    pythonPath: resolved.pythonPath,
    driverPath: resolved.driverPath,
    jobTtlSeconds: resolved.jobTtlSeconds,
    renderTimeoutSeconds: resolved.renderTimeoutSeconds,
  })
  ctx.effect(() => () => engine.dispose(), 'dsh-manim: render engine')

  const service = new ManimService(ctx, resolved, engine)

  const disposeRoutes = registerManimRoutes(ctx, service, engine, resolved)
  ctx.effect(() => () => disposeRoutes(), 'dsh-manim: /dsh-manim routes')

  // Plugin-owned skills: a `skills/` folder inside a plugin package is inert
  // until the host hands its content to the registry. `skills` is a soft
  // dependency — this closure simply never runs where the service is absent.
  // Registering on the process-wide context is what makes the method available
  // in every workspace rather than only the one that happens to hold a scene.
  ctx.inject(['skills'], (scope) => {
    try {
      registerBundledSkills(scope as unknown as Parameters<typeof registerBundledSkills>[0])
    } catch (error) {
      console.error(`[dsh-manim] skills registration skipped: ${String(error)}`)
    }
  })

  // Agent tools: expose the configured subset. `tools` is a hard dependency, so
  // a missing registry is a real wiring fault and should surface rather than be
  // swallowed.
  const definitions = buildAgentTools(ctx, service, engine, resolved)
  ctx.effect(() => {
    const disposers = definitions.map((definition) => ctx.tools.register(definition))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, `dsh-manim: ${definitions.length} agent tool(s)`)

  // Keep a reference so the service stays reachable for the plugin's lifetime.
  void service
}
