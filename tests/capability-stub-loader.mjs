/**
 * Points requireCapability's two dependencies at the stubs in tests/stubs,
 * leaving every other specifier to the ordinary resolver. Registered only by
 * the child process in tests/require-capability.mjs.
 */
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
export { resolve as _unused } from './ts-resolver.mjs';
import { resolve as base } from './ts-resolver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUBS = {
  '@/lib/auth': join(HERE, 'stubs', 'auth.ts'),
  '@/lib/getDb': join(HERE, 'stubs', 'getDb.ts'),
};

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub && !String(context.parentURL ?? '').includes('/tests/stubs/')) {
    return { url: pathToFileURL(stub).href, format: 'module-typescript', shortCircuit: true };
  }
  return base(specifier, context, next);
}
