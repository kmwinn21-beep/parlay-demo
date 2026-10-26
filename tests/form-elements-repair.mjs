/**
 * The table a half-finished rebuild left stranded.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/form-elements-repair.mjs
 *
 * Reported from a live tenant: every request to the form canvas came back
 * 500, "no such table: form_elements". Opening the form editor read nothing
 * and Add Text saved nothing.
 *
 * Migration 486 widens form_elements' element_type CHECK to allow 'video',
 * which SQLite cannot do in place: it builds form_elements_new, copies the
 * rows, DROPs the original and RENAMEs the new one into its place. The runner
 * swallows each statement's error, because an already-applied migration is
 * expected to fail — so a database that got as far as the DROP and no further
 * is left with no form_elements, a form_elements_new holding its rows, and a
 * version counter saying the work is done. schemaReconcile cannot help: it
 * repairs missing COLUMNS in tables that exist, and skips tables that do not.
 *
 * So this is RUN against a real SQLite database put into that state, because
 * reading the source cannot tell you whether the repair converges — or
 * whether it damages a database that was fine to begin with.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const envDir = mkdtempSync(join(tmpdir(), 'elements-env-'));
process.env.TURSO_DATABASE_URL = `file:${join(envDir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';

const { migrations } = await import('@/lib/db-migrations');
const { seedFreshDb } = await import('@/lib/db');
const require_ = createRequire(process.cwd() + '/package.json');
const { createClient } = require_('@libsql/client');

const dir = mkdtempSync(join(tmpdir(), 'elements-'));
let dbn = 0;
/*
 * A tenant database as provisioning leaves one: the base tables seeded, then
 * every migration applied. The migration list alone is not a schema — the
 * tables it alters are created by seedFreshDb.
 */
const freshDb = async () => {
  const db = createClient({ url: `file:${join(dir, `t${++dbn}.db`)}` });
  await seedFreshDb(db);
  for (const sql of migrations) await db.execute(sql).catch(() => {});
  return db;
};
/** A conference and a form to hang elements on — form_elements has a FK. */
const seedForm = async (db) => {
  await db.execute(`INSERT INTO conferences (id, name, start_date, end_date, location)
                    VALUES (1, 'NIC Fall', '2026-10-20', '2026-10-23', 'Chicago, IL')`);
  await db.execute(`INSERT INTO conference_forms (id, conference_id, name) VALUES (8, 1, 'TopGolf')`);
};
const tables = async (db) => (await db.execute(
  `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'form_elements%'`,
)).rows.map(r => String(r.name)).sort();
const cols = async (db, t) => (await db.execute(`PRAGMA table_info(${t})`)).rows.map(r => String(r.name));

console.log('\n— a healthy database —');
{
  const db = await freshDb();
  eq('has the table, and no leftover beside it', await tables(db), ['form_elements']);
  eq('  with the columns the canvas reads',
    (await cols(db, 'form_elements')).filter(c => ['object_fit', 'focal_x', 'focal_y', 'corner_style'].includes(c)).sort(),
    ['corner_style', 'focal_x', 'focal_y', 'object_fit']);
  // The repair runs on every database, healthy ones included. It must leave
  // this one exactly as it found it.
  const before = await db.execute(`SELECT sql FROM sqlite_master WHERE name = 'form_elements'`);
  for (const sql of migrations) await db.execute(sql).catch(() => {});
  const after = await db.execute(`SELECT sql FROM sqlite_master WHERE name = 'form_elements'`);
  eq('  and a second pass changes nothing about it',
    String(after.rows[0]?.sql), String(before.rows[0]?.sql));
  eq('    nor leaves anything behind', await tables(db), ['form_elements']);
}

console.log('\n— the database the rebuild stopped halfway through —');
{
  const db = await freshDb();
  await seedForm(db);
  /*
   * Exactly where migration 486 was interrupted: the copy exists, built the
   * way that migration builds it — constraints and all, not a loose
   * SELECT-into — the original is gone, and the rename never happened.
   */
  const rebuild = migrations.find(m => /CREATE TABLE form_elements_new/.test(m));
  await db.execute(rebuild);
  await db.execute(`INSERT INTO form_elements_new (conference_form_id, element_type, x, y, width, height, z_index, content)
                    VALUES (8, 'text', 40, 40, 280, 180, 0, '<p>Saved before the outage</p>')`);
  await db.execute('DROP TABLE form_elements');
  eq('starts with no form_elements at all', await tables(db), ['form_elements_new']);

  // What the route does, and what the tenant saw.
  const before = await db.execute('SELECT id FROM form_elements').then(() => null, e => String(e.message));
  eq('  so reading the canvas fails', /no such table: form_elements/.test(before ?? ''), true);

  // The repair is the migration list itself, replayed as a cold start does.
  for (const sql of migrations) await db.execute(sql).catch(() => {});

  eq('after the repair the table is back', await tables(db), ['form_elements']);
  eq('  carrying the rows that were stranded in the copy',
    (await db.execute(`SELECT content FROM form_elements WHERE conference_form_id = 8`)).rows.map(r => String(r.content)),
    ['<p>Saved before the outage</p>']);
  eq('  and the canvas can write to it again',
    await db.execute(`INSERT INTO form_elements (conference_form_id, element_type, x, y, width, height, z_index, content)
                      VALUES (8, 'text', 10, 10, 280, 180, 1, '<p>New text</p>')`).then(() => true, () => false), true);
}

console.log('\n— the database that lost the table outright —');
{
  const db = await freshDb();
  await seedForm(db);
  await db.execute('DROP TABLE form_elements');
  eq('starts with nothing of the sort', await tables(db), []);

  for (const sql of migrations) await db.execute(sql).catch(() => {});

  eq('the backstop creates it', await tables(db), ['form_elements']);
  /*
   * And in the shape the table has TODAY. A restore from the original
   * migration 480 would have the narrow CHECK — image and text only — so a
   * repaired tenant could never add a video element, and nothing would say
   * why.
   */
  eq('  with corner_style, added long after it was first created',
    (await cols(db, 'form_elements')).includes('corner_style'), true);
  eq('  and a CHECK wide enough for a video',
    await db.execute(`INSERT INTO form_elements (conference_form_id, element_type, x, y, width, height, z_index, content)
                      VALUES (8, 'video', 0, 0, 300, 220, 0, 'https://example.com/v.mp4')`).then(() => true, () => false), true);
  eq('    and still narrow enough to refuse nonsense',
    await db.execute(`INSERT INTO form_elements (conference_form_id, element_type, x, y, width, height, z_index, content)
                      VALUES (8, 'chart', 0, 0, 300, 220, 0, null)`).then(() => true, () => false), false);
  eq('  and the index the reads use',
    (await db.execute(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_form_elements_form'`)).rows.length, 1);
}

console.log('\n— and the rebuild that widened it for shapes —');
{
  /*
   * Widening the element_type CHECK means rebuilding the table again, which
   * is the operation that stranded it the first time. So the second rebuild
   * is written to survive being interrupted, and is followed by the same
   * repair: whatever a pass leaves behind, the next one finishes.
   */
  const db = await freshDb();
  await seedForm(db);
  eq('a shape is a kind of element now',
    await db.execute(`INSERT INTO form_elements (conference_form_id, element_type, x, y, width, height, z_index, content, corner_style)
                      VALUES (8, 'shape', 0, 0, 200, 120, 0, null, 'circle')`).then(() => true, () => false), true);
  eq('  with an edge of its own',
    (await cols(db, 'form_elements')).filter(c => c.startsWith('border_')).sort(), ['border_color', 'border_width']);
  eq('  and the fill it shares with text panels',
    (await cols(db, 'form_elements')).filter(c => c.startsWith('background_')).sort(),
    ['background_color', 'background_opacity']);
  eq('  while nonsense is still refused',
    await db.execute(`INSERT INTO form_elements (conference_form_id, element_type, x, y, width, height, z_index, content)
                      VALUES (8, 'spreadsheet', 0, 0, 200, 120, 0, null)`).then(() => true, () => false), false);

  // Interrupted between the DROP and the RENAME, exactly as before.
  const rebuilds = migrations.filter(m => /CREATE TABLE IF NOT EXISTS form_elements_new/.test(m));
  eq('the second rebuild creates its copy only if it has to', rebuilds.length, 1);
  await db.execute(rebuilds[0]);
  await db.execute(`INSERT INTO form_elements_new (conference_form_id, element_type, x, y, width, height, z_index, content, corner_style)
                    VALUES (8, 'shape', 5, 5, 120, 120, 0, null, 'circle')`);
  await db.execute('DROP TABLE form_elements');
  for (const sql of migrations) await db.execute(sql).catch(() => {});
  eq('  and an interrupted one still converges', await tables(db), ['form_elements']);
  eq('    with the shape that was stranded in it',
    (await db.execute(`SELECT corner_style FROM form_elements WHERE width = 120`)).rows.map(r => String(r.corner_style)),
    ['circle']);
}

rmSync(dir, { recursive: true, force: true });
rmSync(envDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
