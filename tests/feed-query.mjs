/**
 * The activity feed's union query, its two scopes, and its 90-day boundary.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/feed-query.mjs
 *
 * Nine kinds assembled from eight tables that were each shaped for some other
 * purpose. The assertions worth having are the ones that catch a branch reading
 * the wrong column: a UNION where one arm is silently empty still returns rows,
 * still sorts, and still looks like a working feed.
 *
 * So every kind is seeded and asserted individually, and the scope and boundary
 * tests assert BOTH that the right things are in and that the wrong things are
 * out — an over-inclusive filter passes an "is it there" test perfectly.
 *
 * Time is injected (`nowMs`) rather than taken from the clock, so the 90-day
 * boundary can be tested at the boundary instead of near it.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-feed-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
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

const { fetchFeed, inProgressConferences } = await import('@/lib/feed/query');
const { COLOUR_BY_KIND, FEED_KINDS, rendersBody, matchesFilter, ALL_SCOPE_DAYS } =
  await import('@/lib/feed/types');
const { resolveActors, actorKey, SYSTEM_ACTOR } = await import('@/lib/feed/actors');

// ── A fixed clock ────────────────────────────────────────────────────────────
// 2026-06-15 12:00 UTC. Everything below is placed relative to this, so the
// 90-day boundary lands on an exact timestamp rather than near one.
const NOW = Date.parse('2026-06-15T12:00:00Z');
const ts = (msAgo) => new Date(NOW - msAgo).toISOString().slice(0, 19).replace('T', ' ');
const DAY = 86_400_000;
const HOUR = 3_600_000;

// ── Conferences ──────────────────────────────────────────────────────────────
// RUNNING spans today. ENDED finished a month ago. FUTURE has not started.
// OVERRIDDEN is dated in the past but forced to in_progress, which is the case
// an inlined date comparison gets wrong.
const RUNNING = 1, ENDED = 2, FUTURE = 3, OVERRIDDEN = 4, HISTORICAL = 5;
await db.execute(`INSERT INTO conferences (id, name, start_date, end_date, location) VALUES
  (1, 'ALIS FWD',   '2026-06-14', '2026-06-17', 'Denver'),
  (2, 'OHCA Annual','2026-05-01', '2026-05-03', 'Columbus'),
  (3, 'Next Year',  '2026-11-01', '2026-11-03', 'Austin')`);
await db.execute(`INSERT INTO conferences (id, name, start_date, end_date, location, stage_override)
  VALUES (4, 'Forced Open', '2025-01-01', '2025-01-02', 'Reno', 'in_progress')`);
await db.execute(`INSERT INTO conferences (id, name, start_date, end_date, location, is_historical)
  VALUES (5, 'Old Show', '2024-01-01', '2024-01-02', 'Vegas', 1)`);

// ── People, companies, actors ────────────────────────────────────────────────
await db.execute(`INSERT INTO companies (id, name, company_type) VALUES
  (1, 'Arrow Senior Living', 'Operator'), (2, 'Inspiren', 'Competitor')`);
await db.execute(`INSERT INTO attendees (id, first_name, last_name, title, company_id, seniority, created_at)
  VALUES (1, 'Robyn', 'Yerger', 'COO', 1, 'C-Suite', '${ts(30 * DAY)}')`);
await db.execute(`INSERT INTO attendees (id, first_name, last_name, title, company_id, created_at)
  VALUES (2, 'Philip', 'Gisi', 'CEO', 1, '${ts(30 * DAY)}')`);

// Three actor vocabularies, all present, so the resolver is exercised for real.
await db.execute(`INSERT INTO config_options (id, category, value) VALUES (900, 'user', 'Kevin Winn')`);
await db.execute(`INSERT INTO config_options (id, category, value) VALUES (901, 'touchpoints', 'Hallway Catch')`);
await db.execute(`INSERT INTO users (id, email, password_hash, role, email_verified, display_name)
  VALUES (10, 'sarah@t.test', 'x', 'user', 1, 'Sarah Chen')`);

// ── One row per kind, all inside the running conference ──────────────────────
await db.execute(`INSERT INTO meetings (id, attendee_id, conference_id, meeting_date, meeting_time,
    scheduled_by, outcome, created_at, outcome_set_at)
  VALUES (1, 1, ${RUNNING}, '2026-06-16', '14:00', '900', 'Verbal commit', '${ts(5 * DAY)}', '${ts(1 * HOUR)}')`);
await db.execute(`INSERT INTO meetings (id, attendee_id, conference_id, meeting_date, meeting_time,
    scheduled_by, created_at)
  VALUES (2, 2, ${RUNNING}, '2026-06-17', '09:00', '900', '${ts(2 * HOUR)}')`);
await db.execute(`INSERT INTO attendee_touchpoints (id, attendee_id, conference_id, option_id, logged_by, created_at)
  VALUES (1, 1, ${RUNNING}, 901, '900', '${ts(3 * HOUR)}')`);
await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id,
    author_user_id, attendee_name, note_type, created_at)
  VALUES (1, 'attendee', 1, 'They want a pilot in two communities first.', ${RUNNING}, 10, 'Robyn Yerger', 'note', '${ts(4 * HOUR)}')`);
await db.execute(`INSERT INTO pinned_notes (id, note_id, entity_type, entity_id, pinned_by,
    conference_name, attendee_name, created_at)
  VALUES (1, 1, 'attendee', 1, 'Marcus Silva', 'ALIS FWD', 'Robyn Yerger', '${ts(5 * HOUR)}')`);
await db.execute(`INSERT INTO vendor_relationships (id, company_id, related_company_id, rep_id,
    vendor_type, relationship_status, created_at)
  VALUES (1, 1, 2, 900, 'SaaS', 'Active pilot', '${ts(6 * HOUR)}')`);
await db.execute(`INSERT INTO conference_attendees (conference_id, attendee_id, created_at, created_by)
  VALUES (${RUNNING}, 1, '${ts(7 * HOUR)}', 'Brianna Tate')`);
await db.execute(`INSERT INTO social_events (id, conference_id, entered_by, event_name, event_type,
    venue_name, event_date, invite_only, created_at)
  VALUES (1, ${RUNNING}, 'Kevin Winn', 'Teton VBC Dinner', 'Dinner', 'The Bellagio', '2026-06-16', 'Yes', '${ts(8 * HOUR)}')`);
await db.execute(`INSERT INTO social_event_rsvps (social_event_id, attendee_id, rsvp_status, rsvp_set_at, rsvp_by)
  VALUES (1, 1, 'yes', '${ts(9 * HOUR)}', 'Kevin Winn')`);

const feed = (scope, extra = {}) => fetchFeed(db, { scope, nowMs: NOW, limit: 100, ...extra });
const kindsOf = r => r.items.map(i => i.kind);

// ── Which conferences are running ────────────────────────────────────────────

console.log('\n— the in-progress set —');
{
  const running = await inProgressConferences(db, NOW);
  const ids = running.map(c => c.id).sort();
  // OVERRIDDEN is dated in 2025 and would fail a date comparison. It is in the
  // set because stage_override says so — the reason this calls
  // computeConferenceStage rather than inlining the dates.
  eq('running plus overridden, not ended or future', ids, [RUNNING, OVERRIDDEN]);
  // computeConferenceStage THROWS on a historical conference, so one leaking
  // through would take the whole feed down rather than adding a row.
  eq('  and never the historical one', ids.includes(HISTORICAL), false);
}

// ── All nine kinds ───────────────────────────────────────────────────────────

console.log('\n— every kind appears —');
{
  const r = await feed('active');
  const seen = new Set(kindsOf(r));
  const missing = FEED_KINDS.filter(k => !seen.has(k));
  // A union arm reading the wrong column returns nothing and the query still
  // works. This is the assertion that catches it.
  eq('all nine kinds are returned', missing, []);
}

console.log('\n— newest first —');
{
  const r = await feed('active');
  const times = r.items.map(i => i.occurredAt);
  eq('strictly reverse chronological', times, [...times].sort().reverse());
  // The meeting was CREATED five days ago and marked held an hour ago. It sorts
  // by when it was held, which is the whole reason outcome_set_at exists.
  eq('a meeting held sorts by when it was held, not booked', kindsOf(r)[0], 'meeting_held');
}

console.log('\n— each kind gets the right colour and shape —');
{
  const r = await feed('active');
  const byKind = Object.fromEntries(r.items.map(i => [i.kind, i]));

  eq('meetings are blue', [byKind.meeting_held.colour, byKind.meeting_scheduled.colour],
    ['meetings', 'meetings']);
  eq('touchpoints are purple', byKind.touchpoint.colour, 'touchpoints');
  eq('both note kinds are navy', [byKind.note.colour, byKind.note_pinned.colour], ['notes', 'notes']);
  eq('relationships are coral', byKind.vendor_relationship.colour, 'relationships');
  eq('the three people kinds are teal',
    [byKind.attendee_added.colour, byKind.social_event_created.colour, byKind.rsvp.colour],
    ['people', 'people', 'people']);
  eq('five colours, not nine', new Set(Object.values(COLOUR_BY_KIND)).size, 5);

  // Pinning is an attribute of a note, not a colour of its own.
  eq('a pinned note draws the amber rule', byKind.note_pinned.pinned, true);
  eq('  and an ordinary note does not', byKind.note.pinned, false);
  eq('  and nothing else is ever pinned',
    r.items.filter(i => i.pinned && i.kind !== 'note_pinned').length, 0);
}

console.log('\n— a note card shows its text, and only a note card —');
{
  const r = await feed('active');
  const byKind = Object.fromEntries(r.items.map(i => [i.kind, i]));
  // A note card that does not show its text is a card saying a note exists.
  eq('the note carries its body', byKind.note.body, 'They want a pilot in two communities first.');
  eq('  and the pinned note carries the pinned note\'s text', byKind.note_pinned.body != null, true);
  const others = r.items.filter(i => !rendersBody(i.kind) && i.body != null);
  eq('no other kind carries a body', others.map(i => i.kind), []);
  eq('rendersBody agrees with the data',
    FEED_KINDS.filter(rendersBody), ['note', 'note_pinned']);
}

console.log('\n— the conference pill —');
{
  const r = await feed('active');
  const byKind = Object.fromEntries(r.items.map(i => [i.kind, i]));
  eq('an id-backed pill is named and linkable',
    [byKind.meeting_held.conference.id, byKind.meeting_held.conference.name], [RUNNING, 'ALIS FWD']);
  // pinned_notes stores a NAME and no id. Matched back to an id where the name
  // still matches a conference, so the pill links like every other one.
  eq('a pinned note\'s free-text conference is matched back to its id',
    [byKind.note_pinned.conference.id, byKind.note_pinned.conference.name], [RUNNING, 'ALIS FWD']);
  // A vendor relationship is a company fact. It has no conference and must not
  // borrow one.
  eq('a vendor relationship has no conference pill', byKind.vendor_relationship.conference, null);
}

console.log('\n— the actor —');
{
  const r = await feed('active');
  const byKind = Object.fromEntries(r.items.map(i => [i.kind, i]));
  eq('a config_options id resolves', byKind.meeting_held.actor.name, 'Kevin Winn');
  eq('a users.id resolves', byKind.note.actor.name, 'Sarah Chen');
  eq('free text resolves to itself', byKind.note_pinned.actor.name, 'Marcus Silva');
  eq('  and seeds its own avatar', byKind.note_pinned.actor.avatarSeed, 'Marcus Silva');
  eq('nobody is left blank', r.items.filter(i => !i.actor.name).length, 0);
}

console.log('\n— an unattributable row is the system actor, not a broken card —');
{
  await db.execute(`INSERT INTO conference_attendees (conference_id, attendee_id, created_at)
    VALUES (${RUNNING}, 2, '${ts(10 * HOUR)}')`);
  const r = await feed('active');
  const orphan = r.items.find(i => i.kind === 'attendee_added' && i.subject === 'Philip Gisi');
  eq('a row with no actor renders as the system actor', orphan.actor.system, true);
  eq('  named, not blank', orphan.actor.name, 'Parlay');
  eq('  and not flagged as a failed lookup', orphan.actor.unresolved, false);
}
{
  const map = await resolveActors(db, [{ source: 'rep_config', id: '99999' }]);
  const missing = map.get(actorKey({ source: 'rep_config', id: '99999' }));
  // A deleted rep profile must not blank the card or print a bare number.
  eq('a deleted rep profile resolves to a named fallback', missing.name, 'Unknown user');
  eq('  flagged as unresolved', missing.unresolved, true);
  eq('  and NOT as the system actor — a person did this', missing.system, false);
}

// ── Scope ────────────────────────────────────────────────────────────────────

console.log('\n— in progress vs all —');
{
  // Same instant, on the conference that ENDED a month ago.
  await db.execute(`INSERT INTO attendee_touchpoints (id, attendee_id, conference_id, option_id, logged_by, created_at)
    VALUES (2, 1, ${ENDED}, 901, '900', '${ts(35 * DAY)}')`);

  const scoped = await feed('active');
  const all = await feed('all');

  const scopedConfs = new Set(scoped.items.map(i => i.conference?.id ?? null));
  eq('in progress excludes the ended conference', scopedConfs.has(ENDED), false);
  eq('  and returns fewer items than all', scoped.items.length < all.items.length, true);
  eq('all includes it', all.items.some(i => i.conference?.id === ENDED), true);
  // The over-inclusive half. A scope filter that let everything through would
  // pass every assertion above.
  eq('  and in progress genuinely dropped that row',
    scoped.items.filter(i => i.conference?.id === ENDED).length, 0);
}
{
  // A pinned note naming a conference that is NOT running. Its branch cannot be
  // filtered in SQL — the name has no id — so this proves the TS-side filter.
  await db.execute(`INSERT INTO pinned_notes (id, note_id, entity_type, entity_id, pinned_by,
      conference_name, attendee_name, created_at)
    VALUES (2, 1, 'attendee', 1, 'Marcus Silva', 'OHCA Annual', 'Robyn Yerger', '${ts(11 * HOUR)}')`);
  const scoped = await feed('active');
  eq('a pin naming an ended conference is dropped from in progress',
    scoped.items.filter(i => i.kind === 'note_pinned' && i.conference?.name === 'OHCA Annual').length, 0);
  const all = await feed('all');
  eq('  but is present under all',
    all.items.some(i => i.kind === 'note_pinned' && i.conference?.name === 'OHCA Annual'), true);
}
{
  // A pin naming a conference that no longer exists under that name. It still
  // renders — unlinked — rather than vanishing.
  await db.execute(`INSERT INTO pinned_notes (id, note_id, entity_type, entity_id, pinned_by,
      conference_name, attendee_name, created_at)
    VALUES (3, 1, 'attendee', 1, 'Marcus Silva', 'A Show That Was Renamed', 'Robyn Yerger', '${ts(12 * HOUR)}')`);
  const all = await feed('all');
  const orphan = all.items.find(i => i.conference?.name === 'A Show That Was Renamed');
  eq('an unmatched conference name still renders a pill', orphan != null, true);
  eq('  with no id, so it is not a link', orphan.conference.id, null);
}
{
  // The vendor-relationship join: no conference column, included under
  // in_progress because one of its companies has an attendee at a running show.
  const scoped = await feed('active');
  eq('a vendor relationship reaches in progress via its companies\' attendees',
    scoped.items.some(i => i.kind === 'vendor_relationship'), true);

  await db.execute(`INSERT INTO companies (id, name) VALUES (3, 'Unrelated Co'), (4, 'Also Unrelated')`);
  await db.execute(`INSERT INTO vendor_relationships (id, company_id, related_company_id, rep_id, created_at)
    VALUES (2, 3, 4, 900, '${ts(13 * HOUR)}')`);
  const after = await feed('active');
  eq('  and one whose companies are at no running show is excluded',
    after.items.filter(i => i.kind === 'vendor_relationship' && i.subject === 'Also Unrelated').length, 0);
  const all = await feed('all');
  eq('  while all still shows it',
    all.items.some(i => i.kind === 'vendor_relationship' && i.subject === 'Also Unrelated'), true);
}

console.log('\n— nothing running —');
{
  // Both in-progress conferences pushed into the past. The scope now has
  // nothing to filter by, which is the default view between shows.
  await db.execute(`UPDATE conferences SET stage_override = NULL WHERE id = ${OVERRIDDEN}`);
  await db.execute(`UPDATE conferences SET start_date = '2026-01-01', end_date = '2026-01-02' WHERE id = ${RUNNING}`);

  const scoped = await feed('active');
  eq('active returns nothing', scoped.items.length, 0);
  // The empty state has to tell "no show is running" apart from "a show is
  // running and nobody did anything", and they read very differently.
  eq('  and says why — no conference is in progress', scoped.activeConferenceIds, []);
  const all = await feed('all');
  eq('  while all still has plenty', all.items.length > 5, true);

  await db.execute(`UPDATE conferences SET start_date = '2026-06-14', end_date = '2026-06-17' WHERE id = ${RUNNING}`);
  await db.execute(`UPDATE conferences SET stage_override = 'in_progress' WHERE id = ${OVERRIDDEN}`);
}

// ── The 90-day boundary ──────────────────────────────────────────────────────

console.log(`\n— the ${ALL_SCOPE_DAYS}-day boundary —`);
{
  // Three touchpoints, straddling the cutoff by an hour either side.
  await db.execute(`INSERT INTO attendee_touchpoints (id, attendee_id, conference_id, option_id, logged_by, created_at)
    VALUES (10, 1, ${ENDED}, 901, '900', '${ts(ALL_SCOPE_DAYS * DAY - HOUR)}'),
           (11, 1, ${ENDED}, 901, '900', '${ts(ALL_SCOPE_DAYS * DAY + HOUR)}'),
           (12, 1, ${ENDED}, 901, '900', '${ts(400 * DAY)}')`);

  const all = await feed('all');
  const times = new Set(all.items.map(i => i.occurredAt));
  eq('an hour inside the window is included', times.has(ts(ALL_SCOPE_DAYS * DAY - HOUR)), true);
  eq('an hour outside it is not', times.has(ts(ALL_SCOPE_DAYS * DAY + HOUR)), false);
  eq('and something a year old certainly is not', times.has(ts(400 * DAY)), false);

  // in_progress is NOT windowed — a long conference can run past 90 days and
  // its activity belongs to it regardless of age.
  const scoped = await feed('active');
  eq('the window does not apply to in progress',
    scoped.items.every(i => i.occurredAt >= ts(ALL_SCOPE_DAYS * DAY)), true);
}

// ── Paging ───────────────────────────────────────────────────────────────────

console.log('\n— paging —');
{
  const first = await fetchFeed(db, { scope: 'all', nowMs: NOW, limit: 3 });
  eq('returns exactly the limit', first.items.length, 3);
  eq('  and says there is more', first.hasMore, true);

  const next = await fetchFeed(db, { scope: 'all', nowMs: NOW, limit: 3, before: first.items[2].occurredAt });
  eq('the next page is strictly older', next.items.every(i => i.occurredAt < first.items[2].occurredAt), true);
  const overlap = next.items.filter(i => first.items.some(f => f.id === i.id));
  eq('  and does not repeat the first', overlap, []);

  const everything = await fetchFeed(db, { scope: 'all', nowMs: NOW, limit: 200 });
  eq('the last page says there is no more', everything.hasMore, false);
}

// ── The type filter ──────────────────────────────────────────────────────────

console.log('\n— the chip filter —');
{
  eq('all matches everything', FEED_KINDS.every(k => matchesFilter(k, 'all')), true);
  eq('meetings matches exactly the two meeting kinds',
    FEED_KINDS.filter(k => matchesFilter(k, 'meetings')), ['meeting_held', 'meeting_scheduled']);
  eq('notes matches both note kinds',
    FEED_KINDS.filter(k => matchesFilter(k, 'notes')), ['note', 'note_pinned']);
  eq('people matches the three people kinds',
    FEED_KINDS.filter(k => matchesFilter(k, 'people')),
    ['attendee_added', 'social_event_created', 'rsvp']);
  eq('every kind is reachable by exactly one chip',
    FEED_KINDS.every(k => ['meetings', 'touchpoints', 'notes', 'relationships', 'people']
      .filter(f => matchesFilter(k, f)).length === 1), true);
}

// ── RSVP ─────────────────────────────────────────────────────────────────────

console.log('\n— RSVPs —');
{
  // A maybe is not news; attended is a fact recorded after the event rather
  // than a response to an invitation.
  await db.execute(`INSERT INTO social_event_rsvps (social_event_id, attendee_id, rsvp_status, rsvp_set_at, rsvp_by)
    VALUES (1, 2, 'maybe', '${ts(14 * HOUR)}', 'Kevin Winn')`);
  const r = await feed('active');
  const rsvps = r.items.filter(i => i.kind === 'rsvp');
  // Capitalised: the pill is a rendered decision, not the raw stored token.
  // See "an RSVP reports a decision" below for the multi-value cases.
  eq('a yes is reported', rsvps.some(i => i.pills.includes('Yes')), true);
  eq('a maybe is not', rsvps.some(i => /maybe/i.test(i.pills.join(','))), false);
  eq('  and it names the attendee and the event',
    [rsvps[0].subject, rsvps[0].detail1], ['Robyn Yerger', 'Teton VBC Dinner']);
}
{
  // The reason rsvp_set_at exists rather than reusing updated_at: the guest
  // ranking route bumps updated_at, and a rank edit is not an RSVP.
  const before = (await feed('active')).items.filter(i => i.kind === 'rsvp').length;
  await db.execute(`UPDATE social_event_rsvps SET team_rank = 3, updated_at = datetime('now')
    WHERE social_event_id = 1 AND attendee_id = 1`);
  const after = (await feed('active')).items.filter(i => i.kind === 'rsvp').length;
  eq('changing a guest rank does not appear as an RSVP', after, before);
}

// ── Links ────────────────────────────────────────────────────────────────────

console.log('\n— cards link to the record —');
{
  const r = await feed('active');
  const byKind = Object.fromEntries(r.items.map(i => [i.kind, i]));
  eq('a meeting opens the attendee', byKind.meeting_held.href, '/attendees/1');
  eq('a touchpoint opens the attendee', byKind.touchpoint.href, '/attendees/1');
  eq('a vendor relationship opens the company', byKind.vendor_relationship.href, '/companies/1');
  eq('a social event opens its conference', byKind.social_event_created.href, '/conferences/1');
  eq('nothing has an empty href string', r.items.filter(i => i.href === '').length, 0);
}

// ── The five bugs found in the live preview ─────────────────────────────────

console.log('\n— a meeting booked by more than one rep —');
{
  // scheduled_by is a comma-separated LIST of config_option ids, and older rows
  // hold plain names. Passing the raw string as one id made every meeting in
  // the feed read "Unknown user" while the attendee page showed the right rep.
  await db.execute(`INSERT INTO config_options (id, category, value) VALUES (902, 'user', 'Ace Ventura')`);
  await db.execute(`INSERT INTO meetings (id, attendee_id, conference_id, meeting_date, meeting_time,
      scheduled_by, created_at)
    VALUES (20, 1, ${RUNNING}, '2026-06-16', '14:00', '900,902', '${ts(20 * HOUR)}')`);
  const item = (await feed('active')).items.find(i => i.id.includes('meeting_scheduled') && i.occurredAt === ts(20 * HOUR));
  eq('a two-rep meeting names the first and counts the rest', item.actor.name, 'Kevin Winn +1');
  eq('  and is not "Unknown user"', item.actor.unresolved, false);
  // Same person leading means the same avatar, whether or not they had help.
  eq('  seeded from the lead rep, so the avatar matches theirs', item.actor.avatarSeed, 'Kevin Winn');
}
{
  // A row written before ids were stored holds the name itself.
  await db.execute(`INSERT INTO meetings (id, attendee_id, conference_id, meeting_date, meeting_time,
      scheduled_by, created_at)
    VALUES (21, 1, ${RUNNING}, '2026-06-16', '15:00', 'Harry Dunn', '${ts(21 * HOUR)}')`);
  const item = (await feed('active')).items.find(i => i.occurredAt === ts(21 * HOUR));
  eq('a legacy name resolves to itself', item.actor.name, 'Harry Dunn');
  eq('  without being flagged unresolved', item.actor.unresolved, false);
}
{
  const { resolveActors, actorKey } = await import('@/lib/feed/actors');
  const ref = { source: 'rep_config', id: '900,99999' };
  const got = (await resolveActors(db, [ref])).get(actorKey(ref));
  // One bad id in a list must not lose the good one.
  eq('an unresolvable id in a list does not lose the resolvable one', got.name, 'Kevin Winn');
}

{
  // The stored list can repeat an id — the same rep recorded more than once on
  // one meeting. Counting the repeats produced "Parlay User +2" for a meeting
  // one person logged.
  await db.execute(`INSERT INTO meetings (id, attendee_id, conference_id, meeting_date, meeting_time,
      scheduled_by, created_at)
    VALUES (22, 1, ${RUNNING}, '2026-06-16', '16:00', '900,900,900', '${ts(26 * HOUR)}')`);
  const item = (await feed('active')).items.find(i => i.occurredAt === ts(26 * HOUR));
  eq('a repeated rep id is one person, not three', item.actor.name, 'Kevin Winn');
}
{
  // Two DIFFERENT reps still count, so the dedupe has not simply flattened
  // every list to its first entry.
  await db.execute(`INSERT INTO meetings (id, attendee_id, conference_id, meeting_date, meeting_time,
      scheduled_by, created_at)
    VALUES (23, 1, ${RUNNING}, '2026-06-16', '17:00', '900,902,900', '${ts(27 * HOUR)}')`);
  const item = (await feed('active')).items.find(i => i.occurredAt === ts(27 * HOUR));
  eq('  while two distinct reps still read as two', item.actor.name, 'Kevin Winn +1');
}

console.log('\n— a note whose author predates author_user_id —');
{
  // entity_notes.author_user_id is only set on notes written since it was
  // added; older rows carry the author's name in `rep`. Falling through to the
  // system actor made those cards read "Parlay" — the system actor's own name —
  // for notes a person wrote.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, rep, attendee_name, created_at)
    VALUES (40, 'attendee', 1, 'An older note with no author id.', ${RUNNING}, 'Parlay User', 'Robyn Yerger', '${ts(28 * HOUR)}')`);
  const item = (await feed('active')).items.find(i => i.occurredAt === ts(28 * HOUR));
  eq('the rep name is used', item.actor.name, 'Parlay User');
  eq('  and it is not the system actor', item.actor.system, false);
  eq('  nor flagged unresolved', item.actor.unresolved, false);
}
{
  // With neither, it genuinely is nobody — and that must still read as the
  // system actor rather than a blank.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, attendee_name, created_at)
    VALUES (41, 'attendee', 1, 'No author at all.', ${RUNNING}, 'Robyn Yerger', '${ts(29 * HOUR)}')`);
  const item = (await feed('active')).items.find(i => i.occurredAt === ts(29 * HOUR));
  eq('no author and no rep is the system actor', item.actor.system, true);
  eq('  named Parlay, deliberately', item.actor.name, 'Parlay');
}
{
  // The same fallback on the two other free-text actors, so an empty column
  // does not become an actor called "".
  await db.execute(`INSERT INTO social_events (id, conference_id, event_name, event_type, event_date, invite_only, created_at)
    VALUES (50, ${RUNNING}, 'An event nobody signed', 'Dinner', '2026-06-16', 'No', '${ts(30 * HOUR)}')`);
  const item = (await feed('active')).items.find(i => i.occurredAt === ts(30 * HOUR));
  eq('a social event with no entered_by is the system actor', item.actor.system, true);
  eq('  and never a blank name', item.actor.name.length > 0, true);
}

console.log('\n— a conference is in progress on its LAST day —');
{
  const { computeConferenceStage } = await import('@/lib/conference-stage');
  const c = { start_date: '2026-09-09', end_date: '2026-09-11' };
  // new Date('2026-09-11') is midnight at the START of the 11th, so `now <= end`
  // ended a three-day show after two. validate-conference-stage gates writes on
  // the same function, so actions allowed only during a conference were refused
  // on its closing day.
  eq('the morning of the last day', computeConferenceStage(c, Date.parse('2026-09-11T00:00:01Z')), 'in_progress');
  eq('the evening of the last day', computeConferenceStage(c, Date.parse('2026-09-11T23:59:00Z')), 'in_progress');
  eq('  and the day after is not', computeConferenceStage(c, Date.parse('2026-09-12T00:00:01Z')), 'post_conference');
  eq('the day before the start is still planning',
    computeConferenceStage(c, Date.parse('2026-09-08T20:00:00Z')), 'planning');
}
{
  // The same boundary, through the feed's own scope.
  const onLastDay = await fetchFeed(db, { scope: 'active', nowMs: Date.parse('2026-06-17T18:00:00Z'), limit: 100 });
  eq('the feed still scopes to a conference on its closing day',
    onLastDay.activeConferenceIds.includes(RUNNING), true);
}

console.log('\n— an RSVP reports a decision, not the stored string —');
{
  // rsvp_status is a comma-separated multi-select, so 'maybe,no' is a real value.
  // Attendee 2 already has a maybe from the section above; this changes it.
  await db.execute(`UPDATE social_event_rsvps SET rsvp_status = 'maybe,no', rsvp_set_at = '${ts(22 * HOUR)}'
    WHERE social_event_id = 1 AND attendee_id = 2`);
  await db.execute(`UPDATE social_event_rsvps SET rsvp_status = 'maybe,yes' WHERE social_event_id = 1 AND attendee_id = 1`);
  const rsvps = (await feed('active')).items.filter(i => i.kind === 'rsvp');
  const all = rsvps.flatMap(i => i.pills);
  eq('a stored "maybe,yes" shows Yes', all.includes('Yes'), true);
  eq('a stored "maybe,no" shows No', all.includes('No'), true);
  eq('  and no card prints a maybe', all.some(p => /maybe/i.test(p)), false);
  eq('  nor the raw comma-separated value', all.some(p => p.includes(',')), false);
}

console.log('\n— a note names the record it is on —');
{
  // entity_notes carries denormalised attendee_name / company_name that plenty
  // of rows simply do not have. Those were rendering as "Note on a record".
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, created_at)
    VALUES (30, 'attendee', 1, 'No denormalised name on this row.', ${RUNNING}, 10, '${ts(23 * HOUR)}')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, created_at)
    VALUES (31, 'company', 1, 'A company note.', ${RUNNING}, 10, '${ts(24 * HOUR)}')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, created_at)
    VALUES (32, 'conference', ${RUNNING}, 'A conference note.', ${RUNNING}, 10, '${ts(25 * HOUR)}')`);
  const items = (await feed('active')).items;
  const byTs = t => items.find(i => i.occurredAt === ts(t));
  eq('an attendee note names the attendee', byTs(23 * HOUR).subject, 'Robyn Yerger');
  eq('  and their company in the subtitle', byTs(23 * HOUR).detail2, 'Arrow Senior Living');
  eq('a company note names the company', byTs(24 * HOUR).subject, 'Arrow Senior Living');
  eq('a conference note names the conference', byTs(25 * HOUR).subject, 'ALIS FWD');
  eq('nothing in the page says "a record"', items.filter(i => i.subject === 'a record').length, 0);
}

console.log('\n— the Upcoming scope —');
{
  // FUTURE starts in November and has no activity yet; give it some. Prep for a
  // show months out is exactly what this view is for, so it is NOT windowed.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, attendee_name, created_at)
    VALUES (60, 'attendee', 1, 'Prep note for a show that has not started.', ${FUTURE}, 10, 'Robyn Yerger', '${ts(2 * DAY)}')`);
  await db.execute(`INSERT INTO meetings (id, attendee_id, conference_id, meeting_date, meeting_time, scheduled_by, created_at)
    VALUES (60, 1, ${FUTURE}, '2026-11-02', '10:00', '900', '${ts(3 * DAY)}')`);

  const upcoming = await feed('upcoming');
  eq('shows activity for a conference that has not started',
    upcoming.items.every(i => i.conference?.id === FUTURE || i.conference == null), true);
  eq('  including its prep note', upcoming.items.some(i => i.occurredAt === ts(2 * DAY)), true);
  // The over-inclusive half: a running conference must NOT leak into Upcoming.
  eq('  and nothing from the running conference',
    upcoming.items.filter(i => i.conference?.id === RUNNING).length, 0);
  eq('  nor the ended one', upcoming.items.filter(i => i.conference?.id === ENDED).length, 0);

  const active = await feed('active');
  eq('while Active excludes the future conference',
    active.items.filter(i => i.conference?.id === FUTURE).length, 0);
  eq('  and the two scopes are genuinely different sets',
    upcoming.items.length > 0 && active.items.length > 0
      && upcoming.items[0].id !== active.items[0].id, true);
}
{
  // Both counts come back whatever scope was asked for: `active` decides
  // whether the client polls, and it must not be blanked by viewing Upcoming.
  const upcoming = await feed('upcoming');
  eq('the active count is reported even from the Upcoming scope',
    upcoming.activeConferenceIds.length > 0, true);
  const active = await feed('active');
  eq('  and the upcoming count from the Active scope',
    active.upcomingConferenceIds.includes(FUTURE), true);
}
{
  // Upcoming is not date-windowed. A note far older than the 90 days that `all`
  // allows still belongs to a conference that has not happened.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, attendee_name, created_at)
    VALUES (61, 'attendee', 1, 'Very early prep.', ${FUTURE}, 10, 'Robyn Yerger', '${ts(200 * DAY)}')`);
  const upcoming = await feed('upcoming');
  eq('an old prep note is still upcoming activity',
    upcoming.items.some(i => i.occurredAt === ts(200 * DAY)), true);
  const all = await feed('all');
  eq('  while All still refuses it, being 200 days old',
    all.items.some(i => i.occurredAt === ts(200 * DAY)), false);
}
{
  // No conference in planning at all — the empty state has to tell that apart
  // from "a show is coming and nobody has prepped".
  await db.execute(`UPDATE conferences SET start_date = '2026-01-01', end_date = '2026-01-02' WHERE id = ${FUTURE}`);
  const upcoming = await feed('upcoming');
  eq('with nothing in planning, Upcoming returns nothing', upcoming.items.length, 0);
  eq('  and says so', upcoming.upcomingConferenceIds, []);
  await db.execute(`UPDATE conferences SET start_date = '2026-11-01', end_date = '2026-11-03' WHERE id = ${FUTURE}`);
}

console.log('\n— a user is named by their rep profile —');
{
  // users.display_name is often unset, and falling to the email printed
  // "kwinn@useparlay.app" on a card where every other surface says "Parlay
  // User" — the same person under two names in one list.
  await db.execute(`INSERT INTO config_options (id, category, value) VALUES (910, 'user', 'Parlay User')`);
  await db.execute(`INSERT INTO users (id, email, password_hash, role, email_verified, config_id)
    VALUES (11, 'kwinn@useparlay.app', 'x', 'user', 1, 910)`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, attendee_name, created_at)
    VALUES (70, 'attendee', 1, 'A note by a user with no display_name.', ${RUNNING}, 11, 'Robyn Yerger', '${ts(31 * HOUR)}')`);
  const item = (await feed('active')).items.find(i => i.occurredAt === ts(31 * HOUR));
  eq('the rep profile wins over the email', item.actor.name, 'Parlay User');
  eq('  and no card shows an email address',
    (await feed('active')).items.some(i => i.actor.name.includes('@')), false);
}
{
  // With no rep profile, display_name is next, and the email only last —
  // a name is still better than nothing.
  await db.execute(`INSERT INTO users (id, email, password_hash, role, email_verified, display_name)
    VALUES (12, 'noprofile@t.test', 'x', 'user', 1, 'No Profile')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, attendee_name, created_at)
    VALUES (71, 'attendee', 1, 'By someone with no rep profile.', ${RUNNING}, 12, 'Robyn Yerger', '${ts(32 * HOUR)}')`);
  const item = (await feed('active')).items.find(i => i.occurredAt === ts(32 * HOUR));
  eq('display_name is the fallback when there is no rep profile', item.actor.name, 'No Profile');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
