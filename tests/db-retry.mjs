/**
 * A dropped connection is not a failed import.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/db-retry.mjs
 *
 * Adding a conference with an attendee list died with a Fetch Failed toast
 * and this in the server log:
 *
 *   POST /api/conferences error: [TypeError: fetch failed]
 *     [cause]: SocketError: other side closed { code: 'UND_ERR_SOCKET' }
 *
 * No statement ran. The HTTP client pools keep-alive connections, the far side
 * finished with one while it sat idle, and the next request written into it
 * failed before it was ever answered. The byte counts in the log say the same:
 * 15,342 written and 4,395 read on that socket, which is the sixteen small
 * reads the route makes before its first write — and the write itself is the
 * request that found the socket gone. The longer the pause before it, the
 * likelier the drop, which is why the big imports hit it and the small ones
 * do not.
 *
 * So this is RUN, against a libSQL server that drops a connection the way the
 * real one did: the failure is reproduced with the plain client, and the same
 * drop is survived with the wrapped one. Reading the retry code would not have
 * caught the thing that actually broke first — a Proxy whose methods reached a
 * class's private fields through the wrong `this`.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import http from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { withRetries, isTransportError } from '@/lib/dbRetry';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

const TOKEN = 'x'.repeat(441);

/**
 * A libSQL server speaking enough of the pipeline protocol to answer, and
 * dropping the connection on the nth request the way a pooled one that the
 * far side has finished with does.
 */
function libsqlServer({ dropOn = [] } = {}) {
  let served = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      served++;
      if (dropOn.includes(served)) { req.socket.destroy(); return; }
      const requests = JSON.parse(body).requests ?? [];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        baton: null,
        base_url: null,
        results: requests.map(r => {
          if (r.type === 'batch') {
            return { type: 'ok', response: { type: 'batch', result: {
              step_results: r.batch.steps.map(() => ({ cols: [], rows: [], affected_row_count: 1, last_insert_rowid: '1' })),
              step_errors: r.batch.steps.map(() => null),
            } } };
          }
          if (r.type !== 'execute') return { type: 'ok', response: { type: r.type } };
          return { type: 'ok', response: { type: 'execute', result: {
            cols: [], rows: [], affected_row_count: 1, last_insert_rowid: '1',
            replication_index: null, rows_read: 0, rows_written: 1, query_duration_ms: 1,
          } } };
        }),
      }));
    });
  });
  return {
    server,
    served: () => served,
    listen: async () => {
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      return `http://127.0.0.1:${server.address().port}`;
    },
  };
}

/** The import's first write: one transaction, a hundred and thirty-five rows. */
const BATCH = Array.from({ length: 135 }, (_, i) => ({
  sql: 'INSERT INTO companies (name) VALUES (?)', args: [`Co ${i}`],
}));

console.log('\n— the failure, reproduced —');
{
  const { server, listen } = libsqlServer({ dropOn: [2] });
  const url = await listen();
  const db = createClient({ url, authToken: TOKEN });
  await db.execute('SELECT 1');

  let error = null;
  try { await db.batch(BATCH, 'write'); } catch (e) { error = e; }

  // The error from the production log, in a test: a TypeError whose cause
  // carries the socket code, and no rows written.
  eq('a dropped connection fails the write', error !== null, true);
  eq('  as a fetch failure', error?.message, 'fetch failed');
  eq('  caused by the socket closing', error?.cause?.code ?? error?.cause?.cause?.code, 'UND_ERR_SOCKET');
  server.close();
}

console.log('\n— and survived —');
{
  const { server, listen, served } = libsqlServer({ dropOn: [2] });
  const url = await listen();
  const db = withRetries(createClient({ url, authToken: TOKEN }));
  await db.execute('SELECT 1');

  const results = await db.batch(BATCH, 'write');
  eq('the same drop is retried through', results.length, 135);
  // Three: the read, the request that was dropped, and the one that worked.
  eq('  on the next connection', served(), 3);
  server.close();
}

console.log('\n— but only while it is the connection failing —');
{
  // A database error is the answer, not the absence of one. Retrying would
  // fail identically and the caller is owed the error.
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const requests = JSON.parse(body).requests ?? [];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ baton: null, base_url: null, results: requests.map(r => (
        r.type === 'execute'
          ? { type: 'error', error: { message: 'no such table: nope', code: 'SQLITE_UNKNOWN' } }
          : { type: 'ok', response: { type: r.type } }
      )) }));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;

  let attempts = 0;
  const inner = createClient({ url, authToken: TOKEN });
  const counted = new Proxy(inner, {
    get(t, p) {
      const v = Reflect.get(t, p, t);
      if (typeof v !== 'function') return v;
      if (p === 'execute') return (...a) => { attempts++; return v.apply(t, a); };
      return v.bind(t);
    },
  });

  let message = null;
  try { await withRetries(counted).execute('SELECT * FROM nope'); } catch (e) { message = e.message; }
  eq('a SQL error comes straight back', message, 'SQLITE_UNKNOWN: no such table: nope');
  eq('  without a second attempt', attempts, 1);
  server.close();
}

console.log('\n— and it gives up rather than hammering —');
{
  const { server, listen, served } = libsqlServer({ dropOn: [1, 2, 3, 4, 5, 6] });
  const url = await listen();
  const db = withRetries(createClient({ url, authToken: TOKEN }));

  let error = null;
  const started = Date.now();
  try { await db.execute('SELECT 1'); } catch (e) { error = e; }
  // Two retries and then the error, rather than a loop against a server that
  // is simply gone.
  eq('a connection that never comes back still fails', error?.message, 'fetch failed');
  eq('  after three attempts', served(), 3);
  // 50ms then 250ms. Enough to land on another socket, not enough to matter.
  eq('  and not instantly', Date.now() - started >= 250, true);
  server.close();
}

console.log('\n— what counts as the connection failing —');
{
  // Walked down the cause chain, because the code is two levels below the
  // error the caller sees: a TypeError wrapping a SocketError.
  eq('the reported error', isTransportError(
    Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })
  ), true);
  eq('  a reset', isTransportError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })), true);
  eq('  a hang-up said in words only', isTransportError(new Error('socket hang up')), true);
  eq('  and one buried three deep', isTransportError(
    new Error('a', { cause: new Error('b', { cause: Object.assign(new Error('c'), { code: 'EPIPE' }) }) })
  ), true);

  eq('a SQL error is not', isTransportError(Object.assign(new Error('no such table: t'), { code: 'SQLITE_UNKNOWN' })), false);
  eq('  nor a constraint', isTransportError(Object.assign(new Error('UNIQUE constraint failed'), { code: 'SQLITE_CONSTRAINT' })), false);
  eq('  nor nothing at all', isTransportError(null) || isTransportError(undefined), false);
  // A cause chain that points at itself must not spin.
  const loop = new Error('round');
  loop.cause = loop;
  eq('  and a circular cause terminates', isTransportError(loop), false);
}

console.log('\n— the client is otherwise untouched —');
{
  /*
   * The hazard the browser of this problem walked into: the client is a class
   * with private fields, so a method invoked with the PROXY as `this` cannot
   * reach them and throws, and so can a getter handed the proxy as its
   * receiver. Everything is read and called against the client itself.
   */
  const dir = mkdtempSync(join(tmpdir(), 'db-retry-'));
  const db = withRetries(createClient({ url: `file:${join(dir, 'x.sqlite')}` }));

  await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
  await db.batch([{ sql: 'INSERT INTO t (v) VALUES (?)', args: ['a'] }], 'write');
  await db.executeMultiple("INSERT INTO t (v) VALUES ('b'); INSERT INTO t (v) VALUES ('c');");
  eq('execute, batch and executeMultiple all write', Number((await db.execute('SELECT COUNT(*) c FROM t')).rows[0].c), 3);

  // Deliberately not retried — it holds state across calls, and replaying one
  // call of several would not put it back. It still has to WORK.
  const tx = await db.transaction('write');
  await tx.execute({ sql: 'INSERT INTO t (v) VALUES (?)', args: ['d'] });
  await tx.commit();
  eq('  and a transaction still commits', Number((await db.execute('SELECT COUNT(*) c FROM t')).rows[0].c), 4);

  eq('a getter still reads', db.closed, false);
  db.close();
  eq('  and close still closes', db.closed, true);
}

console.log('\n— and every client a request can reach is wrapped —');
{
  const master = strip('lib/db.ts');
  const tenant = strip('lib/getDb.ts');
  const byHand = strip('lib/tenantDb.ts');

  eq('master', /export const db = withRetries\(createClient\(\{/.test(master), true);
  eq('  the tenant a session resolves to', /const client = withRetries\(createClient\(\{/.test(tenant), true);
  eq('  the tenant a token search opens', /tenantClient = withRetries\(createClient\(\{/.test(tenant), true);
  eq('  and the one built by hand', /return withRetries\(createClient\(\{ url: tursoDbUrl/.test(byHand), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
