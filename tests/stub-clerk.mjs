/**
 * Resolver hook that swaps @clerk/nextjs/server for a stub.
 *
 * Registered by the middleware test alone, not by tests/register-ts.mjs — no
 * other test should have a dependency silently replaced underneath it.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const STUB = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'stubs', 'clerk-server.mjs')).href;

export async function resolve(specifier, context, next) {
  if (specifier === '@clerk/nextjs/server') {
    return { url: STUB, shortCircuit: true };
  }
  return next(specifier, context);
}
