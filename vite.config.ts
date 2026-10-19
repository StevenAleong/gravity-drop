import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vite';

/**
 * A fingerprint of everything that decides how a race plays out: the `src/sim/` code and the physics
 * engine's version. History entries save it, and a race can only be replayed while it still matches.
 * Line endings and path separators are normalised so a Windows checkout and the Linux Pages build agree.
 * It includes subfolders (the course's segments and finishes live in their own).
 */
function simVersion() {
  const hash = createHash('sha256');
  const dir = 'src/sim';
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).replace(/\\/g, '/'))
    .sort();
  for (const file of files) {
    hash.update(file + '\0' + readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n') + '\0');
  }
  const rapier = 'node_modules/@dimforge/rapier2d-compat/package.json';
  hash.update(JSON.parse(readFileSync(rapier, 'utf8')).version);
  return hash.digest('hex').slice(0, 12);
}

// Relative base so the build works on GitHub Pages under any repo name.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  define: { __SIM_VERSION__: JSON.stringify(simVersion()) },
});
