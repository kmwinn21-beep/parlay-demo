/**
 * One person, one set of initials, wherever their name was stored.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/display-names.mjs
 *
 * Several columns are documented as display names and filled with email
 * addresses: `pinned_notes.pinned_by` always, `entity_notes.rep` whenever the
 * author has no rep profile, `upload_jobs.created_by_email` by its own name.
 *
 * Two surfaces each grew their own way of turning that into a pill and
 * disagreed in front of the user — the note card showed "KW" for Kevin Winn
 * while the pinned-note pill beside it showed "KE", the first two letters of
 * "kevin@…". The rule is first initial and last initial, and an address with no
 * separator has no surname in it, so it yields ONE letter rather than a second
 * letter invented from the first name.
 *
 * The real fix is upstream: resolve the address to a rep profile before it
 * reaches a pill. These tests cover both halves — the lookup, and the fallback
 * for when the lookup finds nobody.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-display-names-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
delete process.env.CLERK_SECRET_KEY;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

const { db, dbReady, seedFreshDb } = await import('@/lib/db');
await dbReady;
await seedFreshDb(db);

const { looksLikeEmail, resolveNamesByEmail, displayNameFor } = await import('@/lib/displayNames');
const { getPersonInitials, getRepInitials } = await import('@/lib/useUserOptions');

// ── The pill ─────────────────────────────────────────────────────────────────

console.log('\n— first initial and last initial —');
{
  eq('a two-part name', getPersonInitials('Kevin Winn'), 'KW');
  // First and LAST, not every word — the rule the user asked for.
  eq('a middle name does not get a letter', getPersonInitials('Kevin James Winn'), 'KW');
  eq('one name gives one letter', getPersonInitials('Kevin'), 'K');
  eq('extra spacing is ignored', getPersonInitials('  Kevin   Winn  '), 'KW');
  eq('nothing gives nothing', getPersonInitials(''), '');
  eq('  including null', getPersonInitials(null), '');
}
{
  // The reported bug. "kevin@teton.ai" was rendering as KE.
  eq('an address with no separator gives ONE letter, not two',
    getPersonInitials('kevin@teton.ai'), 'K');
  eq('  a dotted address gives first and last', getPersonInitials('kevin.winn@teton.ai'), 'KW');
  eq('  an underscored one too', getPersonInitials('kevin_winn@teton.ai'), 'KW');
  eq('  and a hyphenated one', getPersonInitials('kevin-winn@teton.ai'), 'KW');
  eq('  three parts still take first and last', getPersonInitials('kevin.j.winn@teton.ai'), 'KW');
}
{
  // A name is never treated as an address, and vice versa.
  eq('a name goes through the name rule', getPersonInitials('Winn'), getRepInitials('Winn'));
}

// ── The lookup that should make the fallback rare ────────────────────────────

console.log('\n— an address resolves to the name people use —');
{
  await db.execute(`INSERT INTO config_options (id, category, value) VALUES (900, 'user', 'Kevin Winn')`);
  await db.execute(`INSERT INTO users (id, email, password_hash, role, email_verified, config_id)
    VALUES (1, 'kevin@teton.ai', 'x', 'administrator', 1, 900)`);
  // No rep profile, but a display_name.
  await db.execute(`INSERT INTO users (id, email, password_hash, role, email_verified, display_name)
    VALUES (2, 'sam@teton.ai', 'x', 'user', 1, 'Sam Reed')`);
  // Neither. The email is all there is.
  await db.execute(`INSERT INTO users (id, email, password_hash, role, email_verified)
    VALUES (3, 'nobody@teton.ai', 'x', 'user', 1)`);

  const names = await resolveNamesByEmail(db,
    ['kevin@teton.ai', 'sam@teton.ai', 'nobody@teton.ai', 'ghost@teton.ai']);

  eq('the rep profile wins', names.get('kevin@teton.ai'), 'Kevin Winn');
  eq('  display_name is next', names.get('sam@teton.ai'), 'Sam Reed');
  eq('  the email is the floor', names.get('nobody@teton.ai'), 'nobody@teton.ai');
  eq('  and an address belonging to no user is simply absent',
    names.has('ghost@teton.ai'), false);
}
{
  // Case is not a reason to fail to recognise somebody, and it can differ on
  // EITHER side: the value stored on the pin, or the address on the user row.
  const names = await resolveNamesByEmail(db, ['Kevin@Teton.AI']);
  eq('a mixed-case stored value still matches', displayNameFor('Kevin@Teton.AI', names), 'Kevin Winn');

  await db.execute(`INSERT INTO config_options (id, category, value) VALUES (901, 'user', 'Dana Fox')`);
  await db.execute(`INSERT INTO users (id, email, password_hash, role, email_verified, config_id)
    VALUES (4, 'Dana.Fox@Teton.AI', 'x', 'user', 1, 901)`);
  const stored = await resolveNamesByEmail(db, ['dana.fox@teton.ai']);
  eq('  and a mixed-case address on the user row matches too',
    displayNameFor('dana.fox@teton.ai', stored), 'Dana Fox');
}
{
  const names = await resolveNamesByEmail(db, ['kevin@teton.ai']);
  eq('a resolved address becomes a name', displayNameFor('kevin@teton.ai', names), 'Kevin Winn');
  eq('  and then yields the right initials',
    getPersonInitials(displayNameFor('kevin@teton.ai', names)), 'KW');
  eq('an unresolved address stays itself',
    displayNameFor('ghost@teton.ai', names), 'ghost@teton.ai');
  // The case that made the two pills disagree: a value that is ALREADY a name
  // must not be sent through the lookup and lost.
  eq('a stored name is left exactly alone',
    displayNameFor('Marcus Silva', names), 'Marcus Silva');
}
{
  // No addresses in, no query out — the resolver is called on every page of
  // pinned notes, including the ones written before pinned_by held emails.
  const names = await resolveNamesByEmail(db, ['Marcus Silva', '', 'not an email']);
  eq('nothing email-shaped means nothing to resolve', names.size, 0);
}

console.log('\n— what counts as an address —');
{
  eq('a plain address', looksLikeEmail('kevin@teton.ai'), true);
  eq('a name is not one', looksLikeEmail('Kevin Winn'), false);
  eq('  nor is a name with an at sign', looksLikeEmail('Kevin @ Teton'), false);
  eq('  nor a domain with no dot', looksLikeEmail('kevin@localhost'), false);
  eq('  nor an empty string', looksLikeEmail(''), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
