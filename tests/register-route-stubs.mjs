/**
 * Registers the route stub loader alongside the ordinary TypeScript resolver.
 * Used only by the child process in tests/config-categories.mjs.
 */
import { register } from 'node:module';

register('./route-stub-loader.mjs', import.meta.url);
