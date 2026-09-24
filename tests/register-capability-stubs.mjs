/**
 * Registers the stub loader alongside the ordinary TypeScript resolver.
 * Used only by the child process in tests/require-capability.mjs.
 */
import { register } from 'node:module';

register('./capability-stub-loader.mjs', import.meta.url);
