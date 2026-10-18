/**
 * Plugin-owned skills: every `skills/<dir>/SKILL.md` this package ships is handed
 * to the DSH skill registry here.
 *
 * Why this file exists: a `skills/` folder inside a plugin package is **inert**
 * on its own — the filesystem provider only scans project and user roots, and
 * nothing else looks inside a plugin's payload. The plugin's host half has to
 * read the file and call `ctx.skills.register(...)`. `dsh-ppt` and `dsh-drawio`
 * are the precedents for this shape.
 *
 * This is also what makes the method survive a cleared workspace: the skill
 * lives under this package's own `skills/` directory, is registered process-wide
 * on every boot, and therefore shows up in **every** workspace — including ones
 * that have never rendered a frame.
 *
 * @module dsh-manim/skills
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Skill directories shipped under `skills/`. */
export const BUNDLED_SKILLS = ['manim-explainer'] as const

/** The slice of the skills service this module uses. */
interface SkillRegistry {
  register(input: {
    name: string
    description: string
    source: string
    content: string
    path: string
    resourceBase: { kind: 'directory'; path: string }
  }): unknown
}

/** The calling context, narrowed to what registration needs. */
interface SkillScope {
  skills: SkillRegistry
}

/** One parsed SKILL.md. */
export interface ParsedSkill {
  name?: string
  description: string
  body: string
}

/**
 * Split a SKILL.md into its frontmatter fields and its body.
 *
 * The registry stores `content` verbatim and takes the description as its own
 * field, so the `---` block has to come off here (parsing frontmatter is the
 * filesystem provider's job, not the registry's).
 *
 * @param raw - the whole file.
 * @returns the parsed skill.
 */
export function parseSkillMarkdown(raw: string): ParsedSkill {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!fm) throw new Error('SKILL.md has no frontmatter block')
  // The description may be a plain scalar or the folded block (`>` followed by
  // indented lines) that keeps the trigger keywords on their own lines.
  const block = fm[1].match(/^description:\s*>\s*\r?\n((?:[ \t]+.*\r?\n?)+)/m)
  let description: string | undefined
  if (block !== null) {
    description = block[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join(' ')
  } else {
    const hit = fm[1].match(/^description:\s*(.+)$/m)
    description = hit === null ? undefined : hit[1].trim().replace(/^["']|["']$/g, '')
  }
  if (!description) throw new Error('SKILL.md frontmatter has no description')
  const name = fm[1].match(/^name:\s*(.+)$/m)
  return {
    name: name === null ? undefined : name[1].trim().replace(/^["']|["']$/g, ''),
    description,
    body: raw.slice(fm[0].length).trim(),
  }
}

/**
 * Register every bundled skill on the calling context's scope.
 *
 * Failures degrade loudly per skill: a malformed SKILL.md is a console line, not
 * a broken plugin. Registration rides a Cordis effect on `scope`, so unloading
 * the plugin removes the skills again.
 *
 * @param scope - context carrying the skills service.
 */
export function registerBundledSkills(scope: SkillScope): void {
  for (const dir of BUNDLED_SKILLS) {
    try {
      const file = new URL(`../skills/${dir}/SKILL.md`, import.meta.url)
      const parsed = parseSkillMarkdown(readFileSync(file, 'utf8'))
      scope.skills.register({
        name: parsed.name ?? dir,
        description: parsed.description,
        source: 'bundled',
        content: parsed.body,
        path: fileURLToPath(file),
        // Lets the skill's own relative paths resolve from the skill body.
        resourceBase: { kind: 'directory', path: fileURLToPath(new URL(`../skills/${dir}/`, import.meta.url)) },
      })
    } catch (error) {
      console.error(`[dsh-manim] skill "${dir}" registration skipped: ${String(error)}`)
    }
  }
}
