/**
 * Filling in the copies a note never got.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/note-backfill.mjs
 *
 * One note is stored three times — attendee, company, conference. The notes
 * popover on a row could not do that (it is handed an attendee id and a
 * conference name, and no company), so its notes landed on the attendee alone.
 * The write path is fixed; this covers the rows already in the database.
 *
 * Run against a real SQLite database, because the whole question is which rows
 * exist afterwards.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { findMissingNoteCopies, writeMissingNoteCopies } from '@/lib/notes/backfillCopies';
import { findNoteCopies } from '@/lib/notes/copies';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const dir = mkdtempSync(join(tmpdir(), 'note-backfill-'));
const db = createClient({ url: `file:${join(dir, 'db.sqlite')}` });

await db.execute('CREATE TABLE conferences (id INTEGER PRIMARY KEY, name TEXT)');
await db.execute('CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT)');
await db.execute('CREATE TABLE attendees (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, company_id INTEGER)');
await db.execute(`CREATE TABLE entity_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT, entity_id INTEGER, content TEXT,
  conference_name TEXT, conference_id INTEGER, rep TEXT, attendee_name TEXT, company_name TEXT,
  tagged_users TEXT, lets_talk INTEGER DEFAULT 0, author_user_id INTEGER, note_type TEXT,
  meeting_id INTEGER, insight_counts TEXT, status TEXT, touchpoint_type TEXT, created_at TEXT)`);
await db.execute({ sql: 'INSERT INTO conferences (id, name) VALUES (?, ?)', args: [15, 'NCAL DAY'] });
await db.execute({ sql: 'INSERT INTO companies (id, name) VALUES (?, ?)', args: [4570, 'Dial Senior Living'] });
await db.execute({ sql: 'INSERT INTO attendees VALUES (?, ?, ?, ?)', args: [900, 'Jacqueline', 'Kadavy', 4570] });
await db.execute({ sql: 'INSERT INTO attendees VALUES (?, ?, ?, ?)', args: [901, 'Nobody', 'Atall', null] });

const note = async (o) => {
  const r = await db.execute({
    sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, conference_id,
            rep, attendee_name, company_name, author_user_id, note_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [o.type, o.id, o.content, o.confName ?? null, o.confId ?? null, o.rep ?? 'Kevin Winn',
      o.att ?? null, o.co ?? null, o.author ?? 1, o.noteType ?? 'note', o.at],
  });
  return Number(r.rows[0].id);
};

/* 1. The reported shape: an attendee note, alone, with no labels. */
const orphan = await note({ type: 'attendee', id: 900, content: 'in booth demo - loving it', confName: 'NCAL DAY', confId: 15, at: '2026-10-12 13:44:00' });
/* 2. One that was written properly — all three rows, seconds apart. */
const whole = await note({ type: 'attendee', id: 900, content: 'already fanned out', confName: 'NCAL DAY', confId: 15, at: '2026-10-11 09:00:00' });
await note({ type: 'company', id: 4570, content: 'already fanned out', confName: 'NCAL DAY', confId: 15, at: '2026-10-11 09:00:02' });
await note({ type: 'conference', id: 15, content: 'already fanned out', confName: 'NCAL DAY', confId: 15, at: '2026-10-11 09:00:03' });
/* 3. An attendee with no company — only the conference copy is owed. */
await note({ type: 'attendee', id: 901, content: 'no company here', confName: 'NCAL DAY', confId: 15, at: '2026-10-12 10:00:00' });
/* 4. No conference at all — only the company copy is owed. */
await note({ type: 'attendee', id: 900, content: 'general note', confName: 'General Note', at: '2026-10-12 11:00:00' });
/* 5. An older row carrying only the conference NAME, from before conference_id existed. */
await note({ type: 'attendee', id: 900, content: 'by name only', confName: 'NCAL DAY', at: '2025-05-01 08:00:00' });
/* 6. Same words, different person, far apart in time — NOT a copy of anything. */
await note({ type: 'attendee', id: 901, content: 'in booth demo - loving it', confName: 'NCAL DAY', confId: 15, at: '2026-09-01 10:00:00' });

console.log('\n— what is missing —');
const missing = await findMissingNoteCopies(db);
{
  eq('the orphan is owed both copies',
    missing.filter(m => m.sourceId === orphan).map(m => m.entityType).sort(), ['company', 'conference']);
  eq('  and the note already fanned out is owed nothing',
    missing.filter(m => m.sourceId === whole).length, 0);
  eq('an attendee with no company is owed only the conference',
    missing.filter(m => m.entityId === 15 && m.createdAt.startsWith('2026-10-12 10')).map(m => m.entityType), ['conference']);
  eq('  and a note with no conference only the company',
    missing.filter(m => m.createdAt.startsWith('2026-10-12 11')).map(m => m.entityType), ['company']);
  // conference_id was added to this table later; older rows carry only the text.
  eq('a conference named but not linked is still resolved',
    missing.filter(m => m.createdAt.startsWith('2025-05-01')).map(m => m.entityType).sort(), ['company', 'conference']);
  eq('nothing is proposed against an attendee', missing.every(m => m.entityType !== 'attendee'), true);
}

console.log('\n— filling them in —');
{
  const before = Number((await db.execute('SELECT COUNT(*) n FROM entity_notes')).rows[0].n);
  const wrote = await writeMissingNoteCopies(db, missing);
  const after = Number((await db.execute('SELECT COUNT(*) n FROM entity_notes')).rows[0].n);
  eq('it writes what it said it would', wrote, missing.length);
  eq('  and nothing else', after - before, missing.length);

  const copies = await db.execute({
    sql: `SELECT entity_type, entity_id, attendee_name, company_name, conference_id, created_at, rep, author_user_id
          FROM entity_notes WHERE content = ? ORDER BY entity_type`,
    args: ['in booth demo - loving it'],
  });
  const forJacqueline = copies.rows.filter(r => String(r.created_at).startsWith('2026-10-12'));
  eq('the orphan now has all three', forJacqueline.map(r => String(r.entity_type)), ['attendee', 'company', 'conference']);
  eq('  the company is the attendee’s own', Number(forJacqueline.find(r => r.entity_type === 'company').entity_id), 4570);

  /*
   * The names the popover never sent. Without them the note draws in the
   * conference's list with nothing on it saying who it is about.
   */
  const co = forJacqueline.find(r => r.entity_type === 'company');
  eq('the copies name the attendee', String(co.attendee_name), 'Jacqueline Kadavy');
  eq('  and the company', String(co.company_name), 'Dial Senior Living');

  /*
   * The timestamp is the ORIGINAL's, which is what makes everything else
   * work: lib/notes/copies pairs rows within ten seconds, so a copy stamped
   * today would not be recognised as one.
   */
  eq('a copy carries the original’s time', String(co.created_at), '2026-10-12 13:44:00');
  const paired = await findNoteCopies(db, orphan);
  eq('  so the app sees them as one note', paired.copies.map(c => c.entityType).sort(), ['company', 'conference']);
  eq('  and can name the records', paired.copies.map(c => c.label).sort(), ['Dial Senior Living', 'NCAL DAY']);
}

console.log('\n— and running it again does nothing —');
{
  const second = await findMissingNoteCopies(db);
  eq('nothing is missing the second time', second.length, 0);
  const before = Number((await db.execute('SELECT COUNT(*) n FROM entity_notes')).rows[0].n);
  await writeMissingNoteCopies(db, second);
  const after = Number((await db.execute('SELECT COUNT(*) n FROM entity_notes')).rows[0].n);
  eq('  and no row is written', after, before);
}

console.log('\n— and it can be held back —');
{
  await note({ type: 'attendee', id: 900, content: 'brand new orphan', confName: 'NCAL DAY', confId: 15, at: '2026-10-13 09:00:00' });
  await note({ type: 'attendee', id: 900, content: 'ancient orphan', confName: 'NCAL DAY', confId: 15, at: '2024-01-01 09:00:00' });

  const since = await findMissingNoteCopies(db, { since: '2026-01-01' });
  eq('since leaves the old ones alone', since.every(m => m.createdAt >= '2026-01-01'), true);
  eq('  and still finds the new one', since.filter(m => m.createdAt.startsWith('2026-10-13')).length, 2);
  eq('a limit caps the work', (await findMissingNoteCopies(db, { limit: 1 })).length, 1);
  // Reporting must never write.
  const n = Number((await db.execute('SELECT COUNT(*) n FROM entity_notes')).rows[0].n);
  await findMissingNoteCopies(db);
  eq('looking changes nothing', Number((await db.execute('SELECT COUNT(*) n FROM entity_notes')).rows[0].n), n);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
