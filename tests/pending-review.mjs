/**
 * The dashboard's Pending Review queue.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/pending-review.mjs
 *
 * Three claims, of three different kinds.
 *
 * WHOSE it is, which is behaviour: the queue is narrowed to the signed-in
 * user's accounts, because the extractor proposes on every note anyone writes
 * and the unnarrowed list is the whole account's backlog.
 *
 * HOW it is grouped, also behaviour: one card per company, however many notes
 * the suggestions were read from.
 *
 * WHERE it sits, which is structure, because a grid class that is not there
 * cannot be measured either. The geometry it implies is measured in Chromium
 * and recorded on the assertions.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const { companiesAssignedTo } = await import('@/lib/guestFilters');
const { groupSuggestions } = await import('@/lib/suggestions/group');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n— the queue is the caller\'s own accounts —');
{
  const route = strip('app/api/suggestions/route.ts');

  eq('there is an account-wide mode', /searchParams\.get\('scope'\) === 'mine'/.test(route), true);
  eq('  which does not need a record to scope it',
    route.indexOf("scope') === 'mine'") < route.indexOf('entity_type and entity_id are required'), true);
  eq('it asks only for what is still pending',
    /WHERE rs\.status = 'pending'/.test(route), true);
  eq('  joined to the company, for the header and the avatar',
    /LEFT JOIN companies co ON co\.id = rs\.entity_id AND rs\.entity_type = 'company'/.test(route), true);
  eq('  and bounded, so one query cannot return a year of backlog',
    /LIMIT \?/.test(route) && /args: \[500\]/.test(route), true);

  // The narrowing uses the same matcher the pick-lists do, which is what makes
  // an assignment written before ids were stored still count as yours.
  eq('it narrows with the shared matcher rather than its own SQL',
    /companiesAssignedTo\(companies, \[\{ id: configId \?\? 0, value: repName \}\]\)/.test(route), true);
  eq('  and returns nothing at all for a caller it cannot identify',
    /if \(configId == null && !repName\) return \[\];/.test(route), true);

  // Reproduced against the real matcher: the rule being relied on.
  const rows = [
    { id: 12, assigned_user: '900' },
    { id: 40, assigned_user: '901' },
    { id: 55, assigned_user: '900,901' },
    { id: 60, assigned_user: null },
    { id: 70, assigned_user: 'Kevin Winn' },
  ];
  const mine = companiesAssignedTo(rows, [{ id: 900, value: 'Kevin Winn' }]);
  eq('mine by id, by shared assignment, and by legacy name',
    [...mine].sort((a, b) => a - b), [12, 55, 70]);
  eq('  and somebody else\'s account is not in my queue', mine.has(40), false);
  eq('  nor an unassigned one', mine.has(60), false);
}

console.log('\n— one card per company, not per note —');
{
  const sug = (id, entityId, target) => ({
    id, target_key: target, entity_type: 'company', entity_id: entityId,
    payload: target === 'logged_activity'
      ? { phrase: 'Met with', attendee_name: 'Tonia' }
      : { related_company_name: 'Teton', relationship_status: ['Current Vendor'] },
    quote: 'met with Tonia and they use Teton', confidence: 'medium',
  });
  // Three suggestions, two companies, read from three different notes.
  const rows = [
    sug(1, 12, 'logged_activity'),
    sug(2, 12, 'vendor_relationship'),
    sug(3, 40, 'vendor_relationship'),
  ];

  // Reproduced from the component: group per company, then within it.
  const byCompany = Array.from(new Set(rows.map(r => r.entity_id)))
    .map(id => ({ id, groups: groupSuggestions(rows.filter(r => r.entity_id === id)) }))
    .filter(c => c.groups.length > 0);

  eq('two companies, from three suggestions', byCompany.map(c => c.id).sort((a, b) => a - b), [12, 40]);
  eq('  and the count on a card is its suggestions, not its groups',
    byCompany.map(c => c.groups.reduce((n, g) => n + g.members.length, 0)).sort(), [1, 2]);

  const section = strip('components/PendingReviewSection.tsx');
  eq('the component groups the same way',
    /groupSuggestions\(rows\.filter\(r => r\.entity_id === entry\.id\)\)/.test(section), true);
  eq('  and counts members, not groups',
    /company\.groups\.reduce\(\(n, g\) => n \+ g\.members\.length, 0\)/.test(section), true);
  eq('one company is open at a time',
    /setOpenCompany\(prev => prev === company\.id \? null : company\.id\)/.test(section), true);
  eq('the card carries an avatar, a name and a count',
    /<CompanyAvatar name=\{company\.name\} \/>/.test(section)
      && /\{company\.name\}/.test(section) && /\{count\}/.test(section), true);
  eq('  with the count on the right of the row',
    section.indexOf('{company.name}') < section.indexOf('{count}'), true);

  // Global, not scoped to the conference the rest of the dashboard follows.
  eq('nothing scopes the queue to a conference',
    /conference_id=|scope=active|activeConference/.test(section), false);
  eq('  and it asks for the account-wide list',
    /fetch\('\/api\/suggestions\?scope=mine'/.test(section), true);

  // It is the queue's job to disappear when there is nothing in it.
  eq('an empty queue renders nothing at all',
    /if \(!loaded \|\| byCompany\.length === 0\) return null;/.test(section), true);
  eq('  and says so to the column, which needs to know about zero',
    /if \(loaded\) onCount\?\.\(rows\.length\)/.test(section), true);
}

console.log('\n— acting on one here is acting on it anywhere —');
{
  const section = strip('components/PendingReviewSection.tsx');
  // The whole point of the shared module: the dashboard must not be able to
  // answer a card differently from the record page.
  eq('the queue uses the shared actions', /<SuggestionActions/.test(section), true);
  eq('  and the shared modals', /\{modals\}/.test(section), true);
  eq('  with no decision logic of its own',
    /open_form|NewMeetingModal|TouchpointQuickModal|method: 'PATCH'/.test(section), false);
  eq('  and the same card component the record page uses',
    /<SuggestionGroupCard/.test(section), true);
}

console.log('\n— the column divides, and gives the space back —');
{
  const col = strip('components/DashboardRightColumn.tsx');
  const page = strip('app/page.tsx');

  eq('the dashboard renders the column, not the feed directly',
    /<DashboardRightColumn \/>/.test(page) && !/DashboardFeed/.test(page), true);

  // Measured in Chromium at 1400x820 with a 712px column: collapsed, the feed
  // is 413px and the queue 275px — 413 + 24 gap + 275 = 712. Expanding takes
  // the feed to 712 through an intermediate 651, so it animates rather than
  // jumping, and the queue is not visible. Collapsing restores 413/275.
  eq('the feed keeps most of the column and gives up the rest',
    /sharing \? 'lg:h-\[58%\]' : 'lg:h-full'/.test(col), true);
  eq('  and the change is animated',
    /lg:transition-\[height\] lg:duration-300/.test(col), true);
  eq('expanding hides the queue rather than scrolling past it',
    /expanded \? 'hidden' : 'contents'/.test(col), true);
  // Unmounting would drop the fetch and forget which company was open.
  eq('  without unmounting it, so collapsing does not start again',
    /\{PendingReviewSection\}|<PendingReviewSection/.test(col), true);

  eq('the button sits at the bottom of the feed, in its footer slot',
    /footer=\{/.test(col), true);
  eq('  and says which way it goes',
    /\{expanded \? 'Collapse Feed' : 'Expand Feed'\}/.test(col), true);
  // A feed already at full height has nothing to expand into.
  eq('there is no button when nothing is competing for the space',
    /footer=\{pending !== null && pending > 0 \?/.test(col), true);
  eq('  and the feed takes the whole column then',
    /const sharing = pending !== null && pending > 0 && !expanded;/.test(col), true);

  // Below lg there is no column to divide.
  eq('none of the dividing applies on a phone',
    (col.match(/lg:h-\[58%\]|lg:h-full|lg:transition/g) ?? []).length >= 3, true);

  const feed = strip('components/DashboardFeed.tsx');
  eq('the feed takes a footer without knowing what goes in it',
    /footer\?: React\.ReactNode;/.test(feed), true);
  eq('  rendered below the stream, outside it',
    /\{footer && <div className="flex-shrink-0 pt-2">\{footer\}<\/div>\}/.test(feed), true);
  eq('  and the feed knows nothing about the queue',
    /PendingReview/.test(feed), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
