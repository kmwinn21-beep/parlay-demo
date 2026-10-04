/**
 * Points a route's auth and database at stubs that let it RUN: authentication
 * always passes, and getDb opens the real SQLite file named by STUB_DB_URL.
 *
 * Registered only by the child process in tests/register-route-stubs.mjs, so
 * no other test sees these.
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
export { resolve as _unused } from './ts-resolver.mjs';
import { resolve as base } from './ts-resolver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUBS = {
  '@/lib/auth': join(HERE, 'stubs', 'authOk.ts'),
  '@/lib/getDb': join(HERE, 'stubs', 'realDb.ts'),
};

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub && !String(context.parentURL ?? '').includes('/tests/stubs/')) {
    return { url: pathToFileURL(stub).href, format: 'module-typescript', shortCircuit: true };
  }
  return base(specifier, context, next);
}
