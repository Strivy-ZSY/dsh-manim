/**
 * The fingerprint of everything that can change a bundle.
 *
 * Shared by `tools/build.mjs` (which bakes it into the bundle, so a page can say
 * which revision it is running) and the check tools (which compare it, to prove
 * the bundle on disk was built from the sources on disk). One implementation,
 * because two would drift and a stale stamp is exactly the sort of thing nobody
 * notices.
 *
 * It is a HASH, not a clock reading, and that is load-bearing: `dsh-client-hmr`
 * reloads a client plugin whenever its bundle changes, so a timestamp stamp made
 * every build rewrite the file — hot-reloading the plugin mid-turn, which left the
 * shell's in-flight loading skeleton unstyled until the window was refreshed.
 * Identical sources must produce an identical stamp.
 *
 * @module dsh-manim/tools/source-stamp
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Hash `src/**` plus every BUILD INPUT into eight hex characters.
 *
 * `package.json` because the client's external list and module table live there, and
 * the build script itself because it owns the CSS shim and the esbuild options — a
 * change there changes the bundle, so a stamp that ignored it would let two
 * different bundles claim the same revision. (Learned the honest way: editing the
 * shim left the stamp unchanged, which is exactly the "same stamp, different bytes"
 * confusion the stamp exists to prevent.)
 *
 * Sorted, so the result depends on contents and not on directory order.
 *
 * @param root - the plugin root.
 * @returns e.g. `7310e968`.
 */
export function sourceStamp(root) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) files.push(full)
    }
  }
  walk(path.join(root, 'src'))
  files.push(
    path.join(root, 'package.json'),
    path.join(root, 'tools', 'build.mjs'),
    path.join(root, 'tools', 'source-stamp.mjs'),
    path.join(root, 'tools', 'platform-modules.mjs'),
  )
  const hash = createHash('sha256')
  for (const file of files.sort()) {
    hash.update(path.relative(root, file).replaceAll('\\', '/'))
    hash.update('\u0000')
    hash.update(readFileSync(file))
    hash.update('\u0000')
  }
  return hash.digest('hex').slice(0, 8)
}
