import type { Client } from '@libsql/client';

/**
 * A libSQL client that survives the far side closing a pooled connection.
 *
 * ── What goes wrong ────────────────────────────────────────────────────────
 *
 * The HTTP client talks to Turso over keep-alive connections that Node pools
 * and reuses. A pooled connection can be closed by the server — or by anything
 * between us and it — while it sits idle, and nothing tells us: the close
 * arrives as a FIN that is only noticed when the next request is written into
 * the socket. The request then fails before it is ever answered:
 *
 *   TypeError: fetch failed
 *     [cause]: SocketError: other side closed { code: 'UND_ERR_SOCKET' }
 *
 * This is not a database error. No statement ran, no transaction opened, and
 * the same request on a fresh connection succeeds — which is exactly what a
 * retry gets, because each HTTP request opens its own stream and the dead
 * socket is discarded on the way out.
 *
 * Reported as a Fetch Failed toast when adding a conference with an attendee
 * list: the import does its reading, spends a while matching companies with
 * nothing to send, and the first write after that pause lands in a socket the
 * server has already finished with. The longer the pause, the likelier it is,
 * which is why it hits the big imports and not the small ones.
 *
 * ── What this does about it ────────────────────────────────────────────────
 *
 * Retries the call, twice, on a transport failure only. A failure the database
 * itself reported — a constraint, a syntax error, a missing table — is not
 * retried: it would fail identically and the caller is owed the error.
 *
 * A retried write could in principle be applied twice, if the request did
 * reach the server and only the answer was lost. That window is small and the
 * alternative is not safety but loss: today the import dies halfway, leaving a
 * conference with no attendees and a toast that says nothing. `batch` is one
 * transaction, so a retry repeats all of it or none of it — never half.
 */

/** Errors that mean the request never got an answer, rather than a bad one. */
const TRANSPORT_CODES = new Set([
  'UND_ERR_SOCKET',          // the socket closed under us — the one reported
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',               // DNS gave up for a moment
]);

/** The same thing said in words, for the layers that drop the code. */
const TRANSPORT_MESSAGES = [
  'fetch failed',
  'other side closed',
  'socket hang up',
  'terminated',
  'network error',
];

/**
 * Whether an error is the connection failing rather than the database
 * answering. Walks the cause chain, because the code is usually two levels
 * down: a TypeError wrapping a SocketError wrapping nothing.
 */
export function isTransportError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof e.code === 'string' && TRANSPORT_CODES.has(e.code)) return true;
    if (typeof e.message === 'string') {
      const m = e.message.toLowerCase();
      if (TRANSPORT_MESSAGES.some(t => m.includes(t))) return true;
    }
    current = e.cause;
  }
  return false;
}

/** How long to wait before each retry. Long enough to get a different socket. */
const BACKOFF_MS = [50, 250];

/** The calls worth retrying: one request each, and stateless over HTTP. */
const RETRIED = new Set(['execute', 'batch', 'executeMultiple', 'migrate']);

export async function withDbRetry<T>(label: string, call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= BACKOFF_MS.length || !isTransportError(error)) throw error;
      // Worth a line in the log: a retry that works is invisible otherwise,
      // and a connection dropping often enough to matter should be visible.
      console.warn(`[db] ${label} lost its connection, retrying (${attempt + 1}/${BACKOFF_MS.length})`);
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }
}

/**
 * The client, with its one-shot calls retried.
 *
 * A Proxy rather than a wrapper object so everything else about the client —
 * `transaction`, `sync`, `close`, `closed`, `protocol` — is the client's own.
 * `transaction` is deliberately not retried: it holds server-side state across
 * calls, and replaying one call of several would not put it back.
 */
export function withRetries(client: Client): Client {
  return new Proxy(client, {
    /*
     * Everything is read and called against the CLIENT, never against the
     * proxy. The client is a class with private fields: a method invoked with
     * the proxy as `this` cannot reach them and throws, and so can a getter
     * handed the proxy as its receiver. So `closed` is read here rather than
     * through the proxy, and every function comes back bound.
     */
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      const fn = value as (...a: unknown[]) => unknown;
      if (typeof prop !== 'string' || !RETRIED.has(prop)) return fn.bind(target);
      return (...args: unknown[]) =>
        withDbRetry(prop, () => Promise.resolve(fn.apply(target, args)));
    },
  });
}
