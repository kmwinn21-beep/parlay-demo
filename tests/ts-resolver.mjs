/**
 * Lets a test import a `.ts` module that imports another one.
 *
 * `--experimental-strip-types` runs TypeScript, but Node still resolves like
 * Node: `./companyFamilies` is not a file, so a lib module importing a sibling
 * the way the bundler expects fails the moment a test loads it. The tests here
 * import `.ts` paths explicitly and hit this on the second hop.
 *
 * Two rewrites, both only ever applied to a specifier Node has already failed
 * to resolve:
 *
 *   `@/lib/db`     →  <repo root>/lib/db   — the tsconfig path alias
 *   `./foo`        →  `./foo.ts`           — the missing extension
 *   `next/server`  →  `next/server.js`     — a subpath the bundler resolves
 *                                            through conditions Node does not
 *
 * Plus one attribute: a `.json` import needs `with { type: 'json' }` under
 * Node's ESM loader, which the bundler does not require and the source does not
 * write. lib/parsers imports a lookup table that way, so any test reaching it
 * failed on the JSON rather than on anything it was testing.
 *
 * The fix belongs in the test runner rather than in the source: writing
 * `./companyFamilies.ts` in the app's own imports would need
 * `allowImportingTsExtensions` turned on for the whole project, changing how
 * every file is allowed to import every other file so that a test can run.
 * This stays inside tests/.
 *
 * Registered by tests/register-ts.mjs; see the run line at the top of each test.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export async function resolve(specifier, context, next) {
  // Supply the import attribute Node wants for JSON, which the app's own
  // imports do not carry because the bundler does not need it.
  if (/\.json$/.test(specifier)) {
    const resolved = await next(specifier, context);
    return { ...resolved, format: 'json', importAttributes: { type: 'json' } };
  }

  // The alias is rewritten before the first attempt: `@/lib/db` is a bare
  // specifier as far as Node is concerned, and would be reported as a missing
  // package rather than as a path it could not find.
  const spec = specifier.startsWith('@/')
    ? pathToFileURL(join(REPO_ROOT, specifier.slice(2))).href
    : specifier;

  try {
    return await next(spec, context);
  } catch (error) {
    const isPath = spec.startsWith('.') || spec.startsWith('file:');
    if (isPath && !/\.[mc]?[jt]sx?$/.test(spec)) {
      // `.ts` first, then the shapes a dependency's own extensionless relative
      // import can take. Guessing only `.ts` breaks any package a test loads.
      for (const candidate of [`${spec}.ts`, `${spec}.js`, `${spec}/index.js`, `${spec}/index.ts`]) {
        try {
          return await next(candidate, context);
        } catch { /* try the next shape */ }
      }
      throw error;
    }
    // A bare subpath like `next/server` that the bundler reaches through export
    // conditions Node does not apply. Only retried when it already looks like a
    // subpath — a bare package name that failed to resolve failed for its own
    // reasons, and hiding that behind a guess would report the wrong problem.
    if (!isPath && spec.includes('/') && !/\.[mc]?[jt]sx?$/.test(spec)) {
      return next(`${spec}.js`, context);
    }
    throw error;
  }
}
