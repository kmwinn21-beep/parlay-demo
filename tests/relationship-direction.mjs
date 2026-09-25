/**
 * Reading a directional relationship from the other company's side.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/relationship-direction.mjs
 *
 * vendor_relationships stores one row, written from the point of view of
 * whoever logged it. Every read filtered on company_id alone —
 * related_company_id was written, returned as an output column, and never once
 * appeared in a WHERE clause — so a relationship logged on Abshire's page
 * existed on Abshire's page and nowhere else.
 *
 * The inversion is the dangerous half. "Current Vendor" on Abshire → Abbott
 * means Abbott is Abshire's vendor; shown unchanged on Abbott's page it claims
 * the exact opposite, in a field reps use to decide who to sell against. So
 * that is BEHAVIOUR and is run here. The SQL shape is structure, read off the
 * file, because a union that binds its arguments wrong fails silently by
 * returning one half.
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

const { statusesFor, isInverted, collapsePairs } = await import('@/lib/relationshipDirection');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// What the migration seeds: three invert, the rest are the same fact from
// either end.
const INV = {
  'Current Vendor': 'Customer',
  'Former Vendor': 'Former Customer',
  'Evaluating': 'Prospect',
  'Preferred Partner': null,
  'Active Pilot': null,
  'Other': null,
};

console.log('\n— the same fact, from the other end —');
{
  // The row as written is never touched on the side that wrote it.
  eq('an outbound row reads as written',
    statusesFor(['Current Vendor'], 'outbound', INV), ['Current Vendor']);
  eq('  whatever the status', statusesFor(['Evaluating'], 'outbound', INV), ['Evaluating']);

  // The one that matters: Abbott is Abshire's vendor, so from Abbott's side
  // Abshire is a customer. Left unchanged this card would say Abshire sells
  // to Abbott.
  eq('a vendor at one end is a customer at the other',
    statusesFor(['Current Vendor'], 'inbound', INV), ['Customer']);
  eq('  and a former vendor a former customer',
    statusesFor(['Former Vendor'], 'inbound', INV), ['Former Customer']);
  eq('  being evaluated makes them a prospect',
    statusesFor(['Evaluating'], 'inbound', INV), ['Prospect']);

  // Some relationships read the same from either end, and rewriting those
  // would invent a distinction that is not there.
  eq('a preferred partner is one both ways',
    statusesFor(['Preferred Partner'], 'inbound', INV), ['Preferred Partner']);
  eq('  and so is an active pilot',
    statusesFor(['Active Pilot'], 'inbound', INV), ['Active Pilot']);

  // Multi-select: a row can carry several, and each inverts on its own.
  eq('each status in a row inverts separately',
    statusesFor(['Current Vendor', 'Preferred Partner'], 'inbound', INV),
    ['Customer', 'Preferred Partner']);

  // An account that adds its own option has no inverse until somebody fills
  // one in. Showing it unchanged is a smaller error than guessing.
  eq('an option with no inverse reads unchanged',
    statusesFor(['Reseller'], 'inbound', INV), ['Reseller']);
  eq('  and so does one the config has never heard of',
    statusesFor(['Something New'], 'inbound', {}), ['Something New']);
  eq('nothing to invert is nothing', statusesFor([], 'inbound', INV), []);

  eq('isInverted knows which ones change', isInverted('Current Vendor', INV), true);
  eq('  and which do not', isInverted('Preferred Partner', INV), false);
  eq('  including an unknown one', isInverted('Reseller', INV), false);
  // An inverse equal to the value is the same as none — an account could
  // type it, and it must not make the card explain a change that did not
  // happen.
  eq('  and one that inverts to itself', isInverted('Other', { Other: 'Other' }), false);
}

console.log('\n— one card per pair —');
{
  const row = (id, subject, related, direction, statuses) => ({
    id, subject_id: subject, related_company_id: related, direction,
    relationship_status: statuses,
  });

  // The ordinary case: only one company logged it.
  eq('a single row is left alone',
    collapsePairs([row(1, 10, 20, 'outbound', ['Current Vendor'])], INV).length, 1);
  eq('  and keeps its direction',
    collapsePairs([row(1, 10, 20, 'inbound', ['Current Vendor'])], INV)[0].direction, 'inbound');

  // Two reps recorded the same pair from opposite ends. Before this they never
  // met; now they land on the same page.
  //
  // Note what can actually be stored: every option in the list is written from
  // the vendor's side, so there is no way to record "they are my customer".
  // The only pair that can genuinely agree is a symmetric status, which both
  // ends would log with the same word.
  const both = [
    row(1, 10, 20, 'outbound', ['Preferred Partner']),
    row(2, 10, 20, 'inbound', ['Preferred Partner']),
  ];
  const collapsed = collapsePairs(both, INV);
  eq('a pair logged at both ends becomes one card', collapsed.length, 1);
  eq('  and it is the row this page owns', collapsed[0].id, 1);
  eq('  naming the other end', collapsed[0].counterpart.id, 2);
  eq('  and saying the two agree', collapsed[0].conflict, false);

  // Each end recorded the other as its vendor. Read from here that is "they
  // sell to me" and "they think I sell to them" — mutual, or one of them is
  // wrong, and either way a rep should look.
  const mutual = collapsePairs([
    row(1, 10, 20, 'outbound', ['Current Vendor']),
    row(2, 10, 20, 'inbound', ['Current Vendor']),
  ], INV);
  eq('two ends each calling the other a vendor is flagged', mutual[0].conflict, true);
  eq('  with the far side read from this side',
    mutual[0].counterpart.statuses, ['Customer']);

  // The same pair, but the far side says something else entirely.
  const disagree = collapsePairs([
    row(1, 10, 20, 'outbound', ['Preferred Partner']),
    row(2, 10, 20, 'inbound', ['Former Vendor']),
  ], INV);
  eq('a pair that disagrees is flagged', disagree[0].conflict, true);
  eq('  with the far side\'s words kept', disagree[0].counterpart.statuses, ['Former Customer']);

  // Two companies that were both asked for is genuinely two cards, one per
  // page. Keying on the pair alone would collapse them into one and lose a
  // whole side of the map.
  const twoSubjects = collapsePairs([
    row(1, 10, 20, 'outbound', ['Current Vendor']),
    row(1, 20, 10, 'inbound', ['Current Vendor']),
  ], INV);
  eq('one row read for both its companies stays two cards', twoSubjects.length, 2);
  eq('  one per subject', twoSubjects.map(r => r.subject_id).sort(), [10, 20]);

  // Two different companies, both related to the same vendor. The
  // pre-conference view asks for every company at a conference at once, so
  // this is the ordinary case there — keying on the far end alone would merge
  // one operator's vendor relationship into another's and lose a card.
  const sharedVendor = collapsePairs([
    row(1, 10, 30, 'outbound', ['Current Vendor']),
    row(2, 20, 30, 'outbound', ['Evaluating']),
  ], INV);
  eq('two companies sharing a vendor keep a card each', sharedVendor.length, 2);
  eq('  one per subject', sharedVendor.map(r => r.subject_id).sort(), [10, 20]);

  // Unrelated pairs are not merged.
  eq('different related companies stay apart',
    collapsePairs([
      row(1, 10, 20, 'outbound', ['Current Vendor']),
      row(2, 10, 30, 'outbound', ['Evaluating']),
    ], INV).length, 2);
  eq('nothing in is nothing out', collapsePairs([], INV), []);
}

console.log('\n— the query asks both ways —');
{
  const lib = strip('lib/relationshipThread.ts');

  // The bug in one line: related_company_id was never a filter.
  eq('the subject can be either end of the row',
    /half\('vr\.company_id', 'vr\.related_company_id', 'outbound'/.test(lib)
    && /half\('vr\.related_company_id', 'vr\.company_id', 'inbound'/.test(lib), true);
  eq('  joined as one result', /UNION ALL/.test(lib), true);
  // Each half has its own IN list, so binding the ids once returns half the
  // rows and no error at all.
  eq('  with the ids bound once per half',
    /args: \[\.\.\.companyIds, \.\.\.companyIds\]/.test(lib), true);
  eq('each row says which end it was read for',
    /\$\{subject\} AS subject_id/.test(lib), true);
  eq('  and where the row actually lives',
    /vr\.company_id AS logged_on_company_id/.test(lib), true);
  // The other end is what the card names, so the join has to follow the
  // subject rather than always pointing at related_company_id.
  eq('the company joined is the far end of whichever half',
    /LEFT JOIN companies c ON c\.id = \$\{other\}/.test(lib), true);

  // The parent/child exclusion is about the pair, not the direction, so it
  // must not be flipped along with everything else.
  eq('the parent/child exclusion stays keyed to the stored row',
    (lib.match(/me\.id = vr\.company_id AND me\.parent_company_id = vr\.related_company_id/g) ?? []).length, 1);

  // One presenter, because the company record and the pre-conference views
  // both render the same card.
  eq('both routes present through the same function',
    /presentRelationships\(res\.rows, threads, inverses\)/.test(strip('app/api/vendor-relationships/route.ts'))
    && /presentRelationships\(vendorRelsRes\.rows, vendorThreads, vendorInverses\)/
      .test(strip('app/api/conferences/[id]/pre-conference/route.ts')), true);
  eq('  and neither maps the rows by hand any more',
    /relationship_status: splitList\(r\.relationship_status\)/
      .test(strip('app/api/conferences/[id]/pre-conference/route.ts')), false);
}

console.log('\n— the inverse words come from config —');
{
  const mig = readFileSync('lib/db-migrations.ts', 'utf8');
  eq('the column exists', /ALTER TABLE config_options ADD COLUMN inverse_value TEXT/.test(mig), true);
  eq('  and is backfilled for the three that invert',
    ['Customer', 'Former Customer', 'Prospect']
      .every(v => new RegExp(`SET inverse_value = '${v}'`).test(mig)), true);
  // Symmetric statuses are left NULL rather than set to themselves, so the
  // card can tell "same both ways" from "nobody has said".
  eq('  leaving the symmetric ones alone',
    /inverse_value = '(Preferred Partner|Active Pilot)'/.test(mig), false);
  // The backfill must not overwrite an account that already set its own.
  eq('  without overwriting an account\'s own wording',
    (mig.match(/AND inverse_value IS NULL/g) ?? []).length, 3);

  // A tenant that has not run the migration yields an empty map, which reads
  // as every status symmetric — the same answer as before inbound rows were
  // shown at all.
  const lib = strip('lib/relationshipThread.ts');
  eq('a missing column is an empty map, not a failure',
    /catch\(\(\) => \(\{ rows: \[\] as Record<string, unknown>\[\] \}\)\)/.test(lib), true);
  // db.ts brings older tenants up to date outside the migration list.
  eq('older tenants get the column too',
    /\['inverse_value', 'ALTER TABLE config_options ADD COLUMN inverse_value TEXT'\]/
      .test(readFileSync('lib/db.ts', 'utf8')), true);
}

console.log('\n— an inbound card belongs to the other record —');
{
  const card = strip('components/VendorRelationshipCard.tsx');
  eq('the card knows which side it is on',
    /const inbound = shown\.direction === 'inbound';/.test(card), true);
  // The row lives on their record: their rep, their thread, the page that can
  // edit it. Offering Edit here would write to a record nobody is looking at.
  eq('  and offers no edit or delete on an inbound row',
    /\{!inbound && \(onEdit \|\| onDelete\) && \(/.test(card), true);
  eq('  nor an Update, which writes to that same row',
    /\{!readOnly && !inbound && \(/.test(card), true);
  eq('saying where it was logged', /Logged on\{' '\}/.test(card), true);
  eq('  and what it says at its own end', /shown\.as_written/.test(card), true);
  eq('a disagreement between the two ends is shown',
    /shown\.conflict \? 'text-amber-700' : 'text-gray-500'/.test(card), true);

  // as_written is set only when the words actually changed, or every card
  // would carry an explanation of a change that did not happen.
  const lib = strip('lib/relationshipThread.ts');
  eq('the explanation only appears when the words changed',
    /as_written: shown\.join\(\) !== written\.join\(\) \? written : null/.test(lib), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
