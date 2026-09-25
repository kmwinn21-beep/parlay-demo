/**
 * Whether a vendor / other relationship should still be believed.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/relationship-staleness.mjs
 *
 * The derivation is BEHAVIOUR and is run here against a frozen clock. Where
 * the pieces sit on the card and what the write endpoint does to the row are
 * structure, read off the files — the card renders on four surfaces and the
 * endpoint's two branches differ by one column that is easy to set in both.
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

const {
  freshnessOf, monthsSince, confirmationLabel,
  STALE_AFTER_MONTHS, AGEING_AFTER_MONTHS,
} = await import('@/lib/relationshipStaleness');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// A fixed clock. Everything below is relative to it, so the suite does not
// start failing six months from now.
const NOW = new Date('2026-09-23T12:00:00Z');
const monthsAgo = (n) => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - Math.round(n * 30.44));
  // The stored shape: UTC, space-separated, no zone marker.
  return d.toISOString().replace('T', ' ').slice(0, 19);
};

console.log('\n— measuring the silence —');
{
  eq('a stamp from this morning is no months old', Math.floor(monthsSince(monthsAgo(0), NOW)), 0);
  eq('  three months reads as three', Math.round(monthsSince(monthsAgo(3), NOW)), 3);
  eq('  eighteen as eighteen', Math.round(monthsSince(monthsAgo(18), NOW)), 18);

  eq('a stamp that already names its zone is left alone',
    monthsSince('2026-09-23T12:00:00Z', NOW), 0);

  // Clock skew between a tenant database and the browser is small but real.
  eq('a stamp in the future is not negatively old',
    monthsSince('2027-01-01 00:00:00', NOW), 0);

  eq('no stamp is not an age of zero', monthsSince('', NOW), null);
  eq('  nor is null', monthsSince(null, NOW), null);
  eq('  nor is a shape that will not parse', monthsSince('last tuesday', NOW), null);
}

console.log('\n— the stored shape is read as UTC, wherever the reader is —');
{
  // This is the one assertion that cannot be made in this process: the
  // container runs in UTC, so local and UTC agree and a missing fix-up looks
  // identical to a working one. Run in a western zone it is the difference
  // between "seven hours old" and "five hours in the future".
  //
  // A child process is the only way to change TZ, which V8 reads once at
  // startup. Worth the spawn: the same bug in formatStamp is what the card's
  // own comment warns about, and it is invisible to every test run on a UTC
  // box.
  const probe = `
    const { monthsSince, confirmationLabel } = await import('@/lib/relationshipStaleness');
    const now = new Date('2026-09-23T19:00:00Z');
    console.log(JSON.stringify({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hours: monthsSince('2026-09-23 12:00:00', now) * 30.44 * 24,
      label: confirmationLabel({ status_as_of: '2025-03-01 00:30:00' }, now),
      monthEnd: confirmationLabel({ status_as_of: '2025-03-31 20:00:00' }, now),
    }));
  `;
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [
    '--experimental-strip-types', '--import', './tests/register-ts.mjs',
    '--input-type=module', '--eval', probe,
  ], { env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' });
  const got = JSON.parse(out.trim().split('\n').pop());

  eq('the child really is in a western zone', got.tz, 'America/Los_Angeles');
  // 19:00Z minus 12:00Z is seven hours. Parsed as local it would be 19:00Z
  // minus 19:00 Pacific — five hours in the future, which monthsSince clamps
  // to 0, so the mutant reads as brand new rather than as seven hours old.
  eq('a bare stamp is seven hours old, not zero', Math.round(got.hours), 7);
  // The same fix-up in the label: 00:30 UTC on 1 March is the evening of
  // 28 February in Pacific time, so a missing Z moves it into the month before.
  eq('  and a stamp near midnight keeps its month', got.label, 'Confirmed Mar 2025');
  // The other end of the same month, which the UTC formatting alone does not
  // save: parsed as local, 20:00 on 31 March in Pacific is 03:00 on 1 April
  // UTC, and the label rolls into the next month.
  eq('  as does one late on the last day', got.monthEnd, 'Confirmed Mar 2025');
}

console.log('\n— how much to trust it —');
{
  eq('confirmed last month is fresh',
    freshnessOf({ status_as_of: monthsAgo(1) }, NOW), 'fresh');
  eq('  eight months starts to show',
    freshnessOf({ status_as_of: monthsAgo(8) }, NOW), 'ageing');
  eq('  eighteen months is stale',
    freshnessOf({ status_as_of: monthsAgo(18) }, NOW), 'stale');

  // The thresholds themselves, so moving a constant is a decision rather
  // than an accident.
  eq('the ageing threshold is inclusive',
    freshnessOf({ status_as_of: monthsAgo(AGEING_AFTER_MONTHS + 0.05) }, NOW), 'ageing');
  eq('  and just under it is still fresh',
    freshnessOf({ status_as_of: monthsAgo(AGEING_AFTER_MONTHS - 0.2) }, NOW), 'fresh');
  eq('the stale threshold is inclusive',
    freshnessOf({ status_as_of: monthsAgo(STALE_AFTER_MONTHS + 0.05) }, NOW), 'stale');
  eq('  and just under it is merely ageing',
    freshnessOf({ status_as_of: monthsAgo(STALE_AFTER_MONTHS - 0.2) }, NOW), 'ageing');

  // A person beats a date in both directions. They heard something on a
  // conference floor that no timestamp knows about.
  eq('a flag beats a fresh date',
    freshnessOf({ stale: true, status_as_of: monthsAgo(0) }, NOW), 'stale');

  // Writing a relationship down was itself a confirmation, on that day.
  eq('never confirmed falls back to when it was written',
    freshnessOf({ created_at: monthsAgo(20) }, NOW), 'stale');
  eq('  and a recent one is fresh on that basis',
    freshnessOf({ created_at: monthsAgo(1) }, NOW), 'fresh');
  eq('  with status_as_of winning when both exist',
    freshnessOf({ status_as_of: monthsAgo(1), created_at: monthsAgo(20) }, NOW), 'fresh');

  // An account that has not run the migration has neither column. Every card
  // on the page turning grey on deploy day is the worse of the two errors.
  eq('no dates at all reads as fresh, not stale', freshnessOf({}, NOW), 'fresh');
}

console.log('\n— what the card says about it —');
{
  eq('a confirmation this month says so in words',
    confirmationLabel({ status_as_of: monthsAgo(0) }, NOW), 'Confirmed this month');
  eq('  an older one names the month',
    confirmationLabel({ status_as_of: '2025-03-14 09:00:00' }, NOW), 'Confirmed Mar 2025');
  eq('  falling back to the creation date',
    confirmationLabel({ created_at: '2025-03-14 09:00:00' }, NOW), 'Confirmed Mar 2025');
  eq('nothing to go on says nobody ever has',
    confirmationLabel({}, NOW), 'Never confirmed');
  eq('  and so does a stamp that will not parse',
    confirmationLabel({ status_as_of: 'whenever' }, NOW), 'Never confirmed');

  // "Confirmed" rather than "Updated" is the whole distinction: the date
  // answers when somebody vouched for the relationship, not when the row was
  // last written.
  const lib = strip('lib/relationshipStaleness.ts');
  eq('the label never reads as an edit', /Updated \$\{|`Updated /.test(lib), false);
}

console.log('\n— stale is not a status —');
{
  const card = strip('components/VendorRelationshipCard.tsx');
  // The six status colours carry meaning already. A stale card is drained,
  // not recoloured, and the pill is outlined rather than filled so it does not
  // read with the weight of a statement of fact.
  eq('the stale card is washed out', /isStale \? 'border-gray-200 border-dashed bg-gray-50\/70' : 'border-gray-200'/.test(card), true);
  eq('  and its contents dimmed', /isStale \? 'opacity-60' : ''/.test(card), true);
  eq('  with an outlined pill, not a filled one',
    /border border-dashed border-gray-400 text-gray-500 bg-white/.test(card), true);
  // The status pills still render on a stale card: what the relationship was
  // is exactly the thing worth keeping.
  eq('the status is still shown on a stale card',
    /\{isStale && <StalePill \/>\}\s*\n\s*\{shown\.relationship_status\.map/.test(card), true);
  // Freshness is derived, not read off a column, so a relationship nobody has
  // opened still ages.
  eq('freshness is derived rather than stored', /const freshness = freshnessOf\(shown\);/.test(card), true);

  const reg = readFileSync('lib/db-migrations.ts', 'utf8');
  eq('no Stale option was added to the status list',
    /'other_relationship_status', 'Stale'/.test(reg), false);
  eq('  and Former Vendor, which already existed, is untouched',
    /'other_relationship_status', 'Former Vendor'/.test(reg), true);
}

console.log('\n— what an update does to the row —');
{
  const api = strip('app/api/vendor-relationships/updates/route.ts');

  // The author is the session's user. An author the client can name is not
  // attribution, and the thread's only value is that each entry is attributable.
  eq('the author comes from the session', /authResult\.id\]/.test(api) || /authResult\.id,/.test(api), true);
  eq('  and never from the request body',
    /author_user_id.*=.*body|const \{[^}]*author/.test(api), false);

  // The status before the entry is read from the row, not taken from the
  // client: two people updating a minute apart would otherwise both record the
  // status they loaded, and the slower one would claim a transition that never
  // happened.
  eq('the prior status is read from the row',
    /SELECT relationship_status FROM vendor_relationships WHERE id = \?/.test(api), true);
  eq('  and a missing relationship is a 404', /status: 404/.test(api), true);
  eq('an update needs a note', /An update needs a note/.test(api), true);

  // The two branches differ by exactly one thing, and it is the point of the
  // whole feature: flagging a card says you do NOT know it is current, so
  // stamping today's date on it would say the opposite.
  const staleBranch = api.slice(api.indexOf('if (stale) {'), api.indexOf('} else {'));
  const freshBranch = api.slice(api.indexOf('} else {'));
  eq('confirming stamps the date and clears the flag',
    /stale = 0/.test(freshBranch) && /status_as_of = datetime\('now'\)/.test(freshBranch), true);
  eq('flagging sets the flag', /stale = 1/.test(staleBranch), true);
  eq('  and leaves the confirmation date alone',
    /status_as_of/.test(staleBranch), false);
  // Both branches move updated_at: the row did change, whichever was chosen.
  eq('both branches touch updated_at',
    /updated_at = datetime\('now'\)/.test(staleBranch) && /updated_at = datetime\('now'\)/.test(freshBranch), true);
  // An unchanged status must not be written as a transition, or every
  // confirmation would read as a change in the thread.
  eq('an unchanged status is not recorded as a transition',
    /const changed = after !== null && after !== '' && after !== before;/.test(api), true);
  eq('  and COALESCE leaves the column alone when nothing changed',
    /relationship_status = COALESCE\(\?, relationship_status\)/.test(api), true);
}

console.log('\n— the thread —');
{
  const shared = strip('lib/relationshipThread.ts');
  // One query for the whole section. A company with twenty vendors would
  // otherwise be twenty round trips to render a collapsed section.
  eq('the thread loads in one query, not one per card',
    /WHERE ru\.relationship_id IN \(\$\{ids\.map\(\(\) => '\?'\)\.join\(','\)\}\)/.test(shared), true);
  eq('  newest first', /ORDER BY ru\.created_at DESC, ru\.id DESC/.test(shared), true);
  // users has display_name and email. There is no name column, and the catch
  // around this query would have turned that into a silently empty thread.
  eq('the author name comes from a column that exists',
    /COALESCE\(NULLIF\(u\.display_name, ''\), u\.email\) AS author_name/.test(shared), true);
  eq('  and a tenant without the table gets an empty thread, not a 500',
    /catch\(\(\) => \(\{ rows: \[\] as Record<string, unknown>\[\] \}\)\)/.test(shared), true);

  // Old tenants may lack any combination of the stamp and staleness columns,
  // and a failed select would show no relationships at all.
  eq('every column combination is tried before giving up',
    /for \(const staleness of STALENESS_COLUMNS\)/.test(shared) && /for \(const stamps of STAMPS\)/.test(shared), true);
  eq('  with no staleness columns reading as never-confirmed and not stale',
    /NULL AS vr_status_as_of, 0 AS vr_stale/.test(shared), true);

  const card = strip('components/VendorRelationshipCard.tsx');
  eq('the thread shows who wrote each entry', /\{u\.author_name \|\| 'Unknown'\}/.test(card), true);
  eq('  and the transition when there was one',
    /\{u\.status_before\.length > 0 \? `\$\{u\.status_before\.join\(', '\)\} → ` : ''\}/.test(card), true);
  eq('  collapsing past the first two', /updates\.slice\(0, 2\)/.test(card), true);
}

console.log('\n— one card, not four —');
{
  // The card renders on the company record, both pre-conference relationship
  // views and the relationship map drawer. A second copy is how the three
  // agenda-upload buttons drifted apart.
  const importers = ['components/VendorRelationshipsSection.tsx', 'components/pre-conference/RelationshipsTab.tsx'];
  for (const f of importers) {
    eq(`${f} imports the card`,
      /from '@\/components\/VendorRelationshipCard'/.test(readFileSync(f, 'utf8')), true);
  }
  // The drawer reaches it through CompanyRelationshipColumns rather than
  // rendering its own.
  eq('the map drawer goes through the shared columns',
    /CompanyRelationshipColumns/.test(readFileSync('components/RelationshipMapDrawer.tsx', 'utf8')), true);
  // Nothing should be declaring a card inside the section any more.
  eq('the section no longer declares a card',
    /function VendorRelationshipCard/.test(strip('components/VendorRelationshipsSection.tsx')), false);

  const card = strip('components/VendorRelationshipCard.tsx');
  // The button needs nothing from the caller, so it is not the caller's to
  // wire. Asking four surfaces to pass an onUpdate is how it ends up on one.
  // Also gated on the row being this record's own: an inbound relationship
  // lives on the other company's record, and updating it from here would
  // write to a record the reader is not looking at.
  eq('the Update button needs no wiring from the surface',
    /\{!readOnly && !inbound && \(/.test(card), true);
  eq('  and the form state lives in the card', /const \[updating, setUpdating\] = useState\(false\);/.test(card), true);
  eq('  so no surface passes an onUpdate handler',
    /onUpdate=\{/.test(readFileSync('components/pre-conference/RelationshipsTab.tsx', 'utf8')
      + readFileSync('components/VendorRelationshipsSection.tsx', 'utf8')), false);

  // The form loads its own options for the same reason.
  const form = strip('components/RelationshipUpdateForm.tsx');
  eq('the form fetches its own status options',
    /fetch\('\/api\/config\?category=other_relationship_status'\)/.test(form), true);

  // Verified in Chromium at 1280 and 390 wide: the button renders on both, the
  // stale card shows its pill, and a save appears in the thread with its
  // author and its transition without any reload.
  eq('the card applies what was saved without a reload',
    /updates: \[saved\.update, \.\.\.\(rel\.updates \?\? \[\]\)\]/.test(card), true);
  eq('  reading everything through that view',
    /const shown: VendorRelationship = saved/.test(card), true);
  // The write endpoint hands the entry back for exactly this reason.
  eq('  and the endpoint returns what it wrote',
    /RETURNING id, created_at/.test(strip('app/api/vendor-relationships/updates/route.ts')), true);
  // Flagging did not move the confirmation date, so the card must not show
  // today's for it.
  eq('  with no confirmation date when it was flagged',
    /status_as_of: stale \? '' :/.test(strip('app/api/vendor-relationships/updates/route.ts')), true);
}

console.log('\n— the keyboard stays down on a phone —');
{
  const form = strip('components/RelationshipUpdateForm.tsx');
  // On a phone the form is a sheet sliding up from the bottom. Focusing the
  // note throws the keyboard over it before the reader has seen what it is
  // asking — including the stale toggle, which is the point of the form.
  eq('focus is desktop-only', /if \(isDesktop === true\) bodyRef\.current\?\.focus\(\);/.test(form), true);
  // React's autoFocus only applies on mount, and useIsDesktop returns null
  // until its effect has measured — so autoFocus never fired at all. Confirmed
  // in Chromium: with autoFocus the active element was the button on both
  // sizes; with the effect it is the textarea at 1280 and the button at 390.
  eq('  and not left to autoFocus, which never fires here',
    /autoFocus/.test(form), false);
  eq('  keyed to the measurement, so it runs once it lands',
    /\}, \[isDesktop\]\);/.test(form), true);
}

console.log('\n— one query, not two —');
{
  const shared = strip('lib/relationshipThread.ts');
  const main = strip('app/api/vendor-relationships/route.ts');
  const pre = strip('app/api/conferences/[id]/pre-conference/route.ts');

  // The pre-conference route had this query written out again, and its own
  // comment claimed it matched the company record's. It did not: it was
  // missing the staleness columns, so every relationship rendered there read
  // as freshly confirmed with an empty history.
  eq('the company record calls the shared query', /vendorRelsQuery\(db, \[Number\(companyId\)\]\)/.test(main), true);
  eq('  the pre-conference route calls it too', /vendorRelsQuery\(db, companyIds\)/.test(pre), true);
  // Neither should still be assembling the select. Both did, and they had
  // already diverged.
  eq('  and neither selects the columns itself',
    /vr\.relationship_status, vr\.strength, vr\.vendor_type, vr\.notes,/.test(pre + main), false);
  eq('  with the thread loaded the same way',
    /loadRelationshipThreads\(db, /.test(pre) && /loadRelationshipThreads\(db, /.test(main), true);
  eq('the shared query carries the staleness columns',
    /vr\.status_as_of AS vr_status_as_of, vr\.stale AS vr_stale/.test(shared), true);
  eq('  and the parent\/child exclusion that is part of the shape',
    /me\.parent_company_id = vr\.related_company_id/.test(shared), true);
  // Both routes go through presentRelationships now, so the staleness fields
  // are mapped once rather than in each route.
  eq('  and the pre-conference response exposes them',
    /presentRelationships\(vendorRelsRes\.rows, vendorThreads, vendorInverses\)/.test(pre)
    && /stale: Number\(r\.vr_stale \?\? 0\) === 1,/.test(strip('lib/relationshipThread.ts')), true);

  // The entry shape is declared once too. Two copies is how a card and a
  // route drift apart a field at a time.
  eq('the update shape is declared in one place',
    /export interface RelationshipUpdate/.test(shared), true);
  eq('  and the card imports rather than redeclares it',
    /export interface RelationshipUpdate/.test(strip('components/VendorRelationshipCard.tsx')), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
