/**
 * Lets a test import a `.ts` module that imports another one.
 *
 * `--experimental-strip-types` runs TypeScript, but Node still resolves like
 * Node: `./companyFamilies` is not a file, so a lib module importing a sibling
 * the way the bundler expects fails the moment a test loads it. The tests here
 * import `.ts` paths explicitly and hit this on the second hop.
 *
 * The fix belongs in the test runner rather than in the source: writing
 * `./companyFamilies.ts` in the app's own imports would need
 * `allowImportingTsExtensions` turned on for the whole project, changing how
 * every file is allowed to import every other file so that a test can run.
 * This stays inside tests/.
 *
 * Registered by tests/register-ts.mjs; see the run line at the top of each test.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    // Only rewrite relative, extensionless specifiers — a bare package name
    // that failed to resolve failed for its own reasons, and hiding that
    // behind a ".ts" guess would report the wrong problem.
    if (specifier.startsWith('.') && !/\.[mc]?[jt]sx?$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw error;
  }
}
