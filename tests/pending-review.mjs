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

  // Authorship was tried here and taken back out: it pulled in companies
  // outside the caller's book whenever they happened to write the note, which
  // stops "my accounts" meaning what it means everywhere else. The cost is
  // real and worth pinning — a suggestion on an UNASSIGNED company does not
  // appear, even one read from your own note.
  eq('who wrote the note does not decide whose queue it is in',
    /note_author_id/.test(route), false);
  eq('  and assignment is the only rule',
    /\.filter\(r => mine\.has\(Number\(r\.entity_id\)\)\)/.test(route), true);

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
  // The consequence of assignment-only, stated where it can be seen: an
  // unassigned company is absent however the suggestion got there.
  eq('  nor an unassigned one, whoever wrote the note', mine.has(60), false);
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
  eq('the suggestion cards inside start collapsed, as on a record',
    /<SuggestionGroupCard\s*\n\s*key=\{group\.key\}\s*\n\s*index=\{i \+ 1\}\s*\n\s*collapsible/.test(section), true);
  eq('the subtitle says where these came from',
    /Suggested updates based on your logged notes/.test(section), true);
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
  // Not a fraction: Floor Notes' own height, so the two bottom edges land on
  // one line and the queue starts level with Targets. Measured at 1400px with
  // Floor Notes at 489px — both bottoms at 513, both tops at 537.
  eq('the feed ends where Floor Notes ends',
    /sharing \? 'lg:h-\[489px\]' : 'lg:h-full'/.test(col), true);
  eq('  rather than a percentage that drifts when Targets changes height',
    /lg:h-\[\d+%\]/.test(col), false);
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

  // Below lg there is no column to divide, so every rule that divides it must
  // be gated. Asserted as "none of them is ungated" rather than by counting
  // the gated ones, which only held while the class names stayed the same.
  // Height rules only. `duration-300` also appears ungated on the button's
  // chevron, which SHOULD animate on a phone — it is not dividing anything.
  const heightRules = col.match(/(?:lg:)?(?:h-\[489px\]|h-full|transition-\[height\]|max-h-none)/g) ?? [];
  eq('there are height rules to check', heightRules.length >= 4, true);
  eq('  and every one of them is gated to lg',
    heightRules.filter(r => !r.startsWith('lg:')), []);

  const feed = strip('components/DashboardFeed.tsx');
  eq('the feed takes a footer without knowing what goes in it',
    /footer\?: React\.ReactNode;/.test(feed), true);
  eq('  rendered below the stream, outside it',
    /\{footer && <div className="flex-shrink-0 pt-2">\{footer\}<\/div>\}/.test(feed), true);
  eq('  and the feed knows nothing about the queue',
    /PendingReview/.test(feed), false);
}

console.log('\n— one name for one thing —');
{
  const section = strip('components/SuggestedUpdatesSection.tsx');
  eq('the record queue is called what the dashboard queue is called',
    /Pending Review/.test(section), true);
  eq('  and not two things', /Suggested Updates/.test(section), false);
}

console.log('\n— confidence reads at a glance —');
{
  const card = strip('components/SuggestionGroupCard.tsx');
  // Measured in Chromium: Low rgb(185,28,28), Med rgb(180,83,9),
  // High rgb(4,120,87) — red, amber, green.
  eq('three words, not a sentence',
    /low: \{ label: 'Low'/.test(card) && /medium: \{ label: 'Med'/.test(card)
      && /high: \{ label: 'High'/.test(card), true);
  eq('  coloured red, amber and green',
    [/low:[^}]*text-red-700/.test(card), /medium:[^}]*text-amber-700/.test(card),
     /high:[^}]*text-emerald-700/.test(card)], [true, true, true]);
  eq('  with the fill a wash of the same colour',
    [/low:[^}]*bg-red-50/.test(card), /medium:[^}]*bg-amber-50/.test(card),
     /high:[^}]*bg-emerald-50/.test(card)], [true, true, true]);
  eq('  and a full-strength border', /border-red-300/.test(card) && /border-emerald-300/.test(card), true);
  // It used to hide itself on high, which made absence a fourth state nothing
  // explained.
  eq('the pill is always shown', /confidence !== 'high' &&/.test(card), false);
  eq('  and an unrated one is not left blank',
    /\?\? CONFIDENCE\.medium/.test(card), true);
}

console.log('\n— four answers fit inside the sheet —');
{
  const chooser = strip('components/ActivityDetectedPrompt.tsx');
  // Measured in Chromium: at max-w-md the last button ran past the card's
  // right edge. At max-w-xl the sheet is 576px and all four sit inside it,
  // Disregard ending at 968 against an edge at 988.
  eq('the sheet is wide enough for them', /sm:max-w-xl/.test(chooser), true);
  eq('  and they wrap rather than overflow if it ever is not',
    /sm:flex-row sm:flex-wrap/.test(chooser), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
