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
 *   `@/lib/db`  →  <repo root>/lib/db      — the tsconfig path alias
 *   `./foo`     →  `./foo.ts`              — the missing extension
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
  // The alias is rewritten before the first attempt: `@/lib/db` is a bare
  // specifier as far as Node is concerned, and would be reported as a missing
  // package rather than as a path it could not find.
  const spec = specifier.startsWith('@/')
    ? pathToFileURL(join(REPO_ROOT, specifier.slice(2))).href
    : specifier;

  try {
    return await next(spec, context);
  } catch (error) {
    // Only rewrite extensionless paths — a bare package name that failed to
    // resolve failed for its own reasons, and hiding that behind a ".ts" guess
    // would report the wrong problem.
    const isPath = spec.startsWith('.') || spec.startsWith('file:');
    if (isPath && !/\.[mc]?[jt]sx?$/.test(spec)) {
      return next(`${spec}.ts`, context);
    }
    throw error;
  }
}
