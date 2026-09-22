/**
 * The registry, now that it holds a target the model is never asked about.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/suggestion-targets.mjs
 *
 * The registry had two jobs that used to be the same list: what the extractor
 * asks Haiku to look for, and what a stored suggestion is allowed to be. The
 * activity suggestion belongs to the second only — it is raised in the browser
 * by a local scanner. Putting it in the first would have the model hunting for
 * meetings as well, which changes what comes back for the vendor targets it IS
 * being asked about.
 *
 * So the assertion that matters most here is a negative one: the prompt the
 * model sees is byte-for-byte what it was before this target existed.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const { SUGGESTION_TARGETS, EXTRACTED_TARGETS, getTarget, dedupeKey } =
  await import('@/lib/suggestions/registry');
const { buildPrompt } = await import('@/lib/suggestions/extract');

console.log('\n— the model is not asked about the activity target —');
{
  eq('the registry holds it', !!getTarget('logged_activity'), true);
  eq('  and it is marked as raised by the browser',
    getTarget('logged_activity').clientProposed, true);
  eq('  so the extractor never sees it',
    EXTRACTED_TARGETS.some(t => t.key === 'logged_activity'), false);
  eq('the extractor still sees both vendor targets',
    EXTRACTED_TARGETS.map(t => t.key), ['vendor_relationship', 'company_sub_types']);
  eq('  which is every target that is not client-proposed',
    EXTRACTED_TARGETS.length, SUGGESTION_TARGETS.filter(t => !t.clientProposed).length);

  // The prompt is assembled from the target list, so this is the test that
  // says vendor extraction was not disturbed. Built both ways and compared.
  const ctx = { noteId: 1, content: 'Met with Kevin. They use Yardi.', companyId: 7, companyName: 'Mission Health' };
  const options = new Map([
    ['other_relationship_status', ['Evaluating', 'Current Vendor']],
    ['vendor_type', ['EHR', 'CRM']],
  ]);
  const shipped = buildPrompt(ctx, EXTRACTED_TARGETS, options);
  const asItWas = buildPrompt(ctx, SUGGESTION_TARGETS.filter(t => !t.clientProposed), options);
  eq('the prompt is exactly what it was before this target existed', shipped, asItWas);
  eq('  and says nothing about meetings or touchpoints',
    /logged_activity|touchpoint/i.test(shipped), false);
  // If the filter were ever dropped, the prompt would grow. Pin that it hasn't.
  const withActivity = buildPrompt(ctx, SUGGESTION_TARGETS, options);
  eq('  where including it would have changed the prompt',
    withActivity === shipped, false);

  // The comparison above proves the filtered LIST is right; this proves the
  // extractor is the thing using it. extractFromNote needs an API key and a
  // database to call, so the wiring is read rather than run.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('lib/suggestions/extract.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  eq('the extractor builds its prompt from the filtered list',
    /const targets = EXTRACTED_TARGETS;/.test(src), true);
  eq('  and does not reach for the unfiltered one',
    /SUGGESTION_TARGETS/.test(src), false);
}

console.log('\n— what accepting one does —');
{
  const target = getTarget('logged_activity');
  eq('it writes nothing on accept', target.write, 'open_form');
  eq('  which is not a table write', target.write === 'create_child', false);
  eq('  nor a column write', target.write === 'set_field', false);
  // The route must skip applyTarget for these, or accepting would 400 on
  // "No write defined for logged_activity".
  const { readFileSync } = await import('node:fs');
  const route = readFileSync('app/api/suggestions/route.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  eq('the route performs no write for an open_form target',
    /if \(action === 'accept' && target\.write !== 'open_form'\)/.test(route), true);
  eq('  and still performs one for every other target',
    /const applied = await applyTarget\(db, target, entityId, payload, user\.email\);/.test(route), true);
  // Nothing in applyTarget knows this key, which is the point: if the guard
  // above were removed the error would be loud rather than silent.
  eq('applyTarget has no branch for it', /target\.key === 'logged_activity'/.test(route), false);
}

console.log('\n— the card has nothing to edit —');
{
  const target = getTarget('logged_activity');
  eq('every field is context, not a choice',
    target.fields.filter(f => !f.readOnly).map(f => f.key), []);
  eq('  and none of them is bound to a config list',
    target.fields.filter(f => f.optionCategory).map(f => f.key), []);
  eq('  nor names a company to create',
    target.fields.some(f => f.companyRef), false);
  eq('it carries what the card has to show',
    target.fields.map(f => f.key), ['phrase', 'attendee_name', 'company_name', 'conference_name']);
}

console.log('\n— saving the same note twice is one suggestion —');
{
  const payload = {
    phrase: 'Met with', attendee_name: 'Kevin Winn',
    company_name: 'Mission Health', conference_name: 'NextGen Summit',
  };
  const a = dedupeKey('logged_activity', 'company', 7, payload);
  const b = dedupeKey('logged_activity', 'company', 7, { ...payload, conference_name: 'Something Else' });
  eq('the detected phrase is what identifies it', a, b);
  eq('  and it is not the whole payload stringified', /NextGen Summit/.test(a), false);

  const other = dedupeKey('logged_activity', 'company', 7, { ...payload, phrase: 'Had coffee' });
  eq('a different reading of the same note is a different suggestion', a === other, false);
  const otherCompany = dedupeKey('logged_activity', 'company', 9, payload);
  eq('  and so is the same reading on another company', a === otherCompany, false);
  // The unique index is (COALESCE(source_note_id,0), dedupe_key), so the note
  // is the other half of what keeps these apart.
  eq('the key does not include the note — the index supplies that',
    /\d+:/.test(a.replace('logged_activity:company:7:', '')), false);
}

console.log('\n— Save for Later writes the row the popup never had —');
{
  const { readFileSync } = await import('node:fs');
  const chooser = readFileSync('components/ActivityDetectedPrompt.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  eq('there is a fourth answer', />\s*\{saving \? 'Saving…' : 'Review later'\}\s*</.test(chooser), true);
  eq('  named as the vendor prompt names the same idea',
    /Save for Later/.test(chooser), false);
  // The vendor prompt's "Review later" drops a row the extractor already
  // wrote. Nothing has been written here, so this has to create it.
  eq('  and it POSTs rather than just closing',
    /const res = await fetch\('\/api\/suggestions', \{\s*method: 'POST',/.test(chooser), true);
  eq('  naming the target the registry gates on',
    /target_key: 'logged_activity',/.test(chooser), true);
  // A save that failed must not be reported as one — the question stays open
  // rather than disappearing with nothing written behind it.
  eq('  and a non-ok response is treated as a failure',
    /if \(!res\.ok\) throw new Error\(\);/.test(chooser), true);
  eq('  filed against the company, which is where the section reads from',
    /entity_type: 'company',\s*entity_id: companyId,/.test(chooser), true);
  eq('  scoped to the note when the flow knew its id',
    /source_note_id: note\?\.noteId \?\? null,/.test(chooser), true);
  eq('  carrying the sentence, so it can be judged cold days later',
    /quote: sentenceAround\(/.test(chooser), true);
  eq('  and the ids the form needs to reopen where the note was',
    /company_id: companyId,\s*attendee_id: attendeeId,\s*conference_id: conferenceId,/.test(chooser), true);

  // With no company there is nowhere for Suggested Updates to show it.
  eq('the button is not offered when there is no record to file it against',
    /\{companyId != null && \(/.test(chooser), true);
  eq('a failed save says so rather than closing quietly',
    /Could not save that\. Nothing was logged\./.test(chooser), true);
  eq('  and the question stays open',
    /catch \{\s*toast\.error\('Could not save that\. Nothing was logged\.'\);/.test(chooser), true);
}

console.log('\n— the deferred card asks the same question —');
{
  const { readFileSync } = await import('node:fs');
  const section = readFileSync('components/SuggestedUpdatesSection.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  eq('an activity group is one whose targets open a form',
    /group\.members\.every\(m => getTarget\(m\.target_key\)\?\.write === 'open_form'\)/.test(section), true);
  eq('  and an empty group is not one', /group\.members\.length > 0/.test(section), true);
  eq('it offers Meeting and Touchpoint, the same question as the popup',
    [/onClick=\{\(\) => openForm\('meeting', group\)\}/.test(section),
     /onClick=\{\(\) => openForm\('touchpoint', group\)\}/.test(section)], [true, true]);
  // The branch itself, not a character window between two strings — the gap
  // between them is whatever the formatting happens to be.
  const activityBranch = section.slice(
    section.indexOf('isActivity(group) ? ('), section.indexOf(') : ('));
  eq('  and Disregard, which dismisses the stored row rather than just hiding it',
    /review\(group, 'dismiss'\)/.test(activityBranch) && /Disregard/.test(activityBranch), true);
  eq('  where Disregard is the only way out that writes nothing new',
    (activityBranch.match(/review\(group, 'accept'\)/g) ?? []).length, 0);
  eq('  with no fourth button, because it is already saved',
    /Save for Later/.test(section), false);
  eq('a vendor group keeps Accept and Dismiss',
    /onClick=\{\(\) => review\(group, 'accept'\)\}/.test(section), true);
  // An activity card is already saved and has nothing to edit, so the old
  // blurb was wrong on both counts for half of what the section now shows.
  eq('the blurb is true of both kinds',
    /Nothing is added to the record until you confirm it/.test(section), true);
  eq('  and no longer claims nothing is saved',
    /Nothing is saved until you accept it/.test(section), false);

  eq('the meeting form opens on Log here too', /defaultMode="log"/.test(section), true);
  eq('  reopened where the note was',
    /prefillCompanyId=\{num\(logging\.payload\.company_id\)\}/.test(section), true);
  // The rule that makes deferring safe to press.
  eq('the suggestion is answered only when the form saves',
    /onSuccess=\{\(\) => void onLogged\(logging\.group\)\}/.test(section)
      && /onLogged=\{\(\) => void onLogged\(logging\.group\)\}/.test(section), true);
  eq('  and closing without saving leaves it pending',
    /onClose=\{\(\) => setLogging\(null\)\}/.test(section), true);
  // Opening the form is not answering the question. Pressing Meeting and then
  // closing without saving must leave the card exactly where it was, which is
  // what makes Save for Later safe to press.
  const openFormBody = section.slice(
    section.indexOf('const openForm ='), section.indexOf('const onLogged ='));
  eq('opening a form does not answer the suggestion',
    /review\(/.test(openFormBody), false);
  eq('  it only records which form is open',
    /setLogging\(\{ kind, group, payload: group\.members\[0\]\?\.payload \?\? \{\} \}\)/.test(openFormBody), true);
  eq('  with the modal left mounted, so its follow-on step survives',
    /const onLogged = async \(group: SuggestionGroup\) => \{\s*await review\(group, 'accept'\);\s*\};/.test(section), true);

  // A touchpoint close is not a touchpoint save; the wrapper had no way to
  // say which until onLogged was forwarded.
  const card = readFileSync('components/DashboardActionCard.tsx', 'utf8');
  eq('the touchpoint modal can report a real save',
    /onLogged\?: \(\) => void;\n\}\) \{/.test(card), true);
}

console.log('\n— a read-only field is context, not a text box —');
{
  const { readFileSync } = await import('node:fs');
  const card = readFileSync('components/SuggestionGroupCard.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  eq('the card branches on it', /group\.fields\.map\(f => f\.readOnly \?/.test(card), true);
  eq('  showing the label and the value', /\{f\.label\}:<\/span>\{' '\}/.test(card), true);
  eq('  and nothing at all when there is no value',
    /String\(group\.draft\[f\.key\] \?\? ''\)\.trim\(\) \?/.test(card), true);
}

console.log('\n— the attendee record has the section at all —');
{
  const { readFileSync } = await import('node:fs');
  const page = readFileSync('app/attendees/[id]/page.tsx', 'utf8');
  eq('it is mounted', /<SuggestedUpdatesSection entityType="attendee" entityId=\{Number\(id\)\} \/>/.test(page), true);
  eq('  and imported', /import \{ SuggestedUpdatesSection \}/.test(page), true);
  // The GET resolves an attendee to their employer, so one row shows in both
  // places — which is why the chooser files exactly one.
  const route = readFileSync('app/api/suggestions/route.ts', 'utf8');
  eq('an attendee lookup falls through to the company',
    /if \(entityType === 'attendee'\) \{[\s\S]{0,200}lookupType = 'company'/.test(route), true);
  const company = readFileSync('app/companies/[id]/page.tsx', 'utf8');
  eq('  and the company record still has its own', /entityType="company"/.test(company), true);
}

console.log('\n— deferring it does not immediately re-ask —');
{
  // The bug this closes: pressing Review later stored the row, the vendor
  // prompt polled, found it as a fresh suggestion, and asked again with
  // different words — Confirm / Review later / Ignore over the top of a
  // question that had just been answered.
  const { readFileSync } = await import('node:fs');
  const prompt = readFileSync('components/SuggestionPrompt.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  eq('the vendor prompt shows only what the extractor found',
    /!getTarget\(r\.target_key\)\?\.clientProposed/.test(prompt), true);
  eq('  applied where it picks up fresh rows',
    /const fresh = rows\.filter\(r =>\s*!seen\.current\.has\(r\.id\) && !getTarget\(r\.target_key\)\?\.clientProposed\);/.test(prompt), true);

  // Reproduced against the real predicate, with the real registry.
  const rows = [
    { id: 1, target_key: 'vendor_relationship' },
    { id: 2, target_key: 'logged_activity' },
    { id: 3, target_key: 'company_sub_types' },
  ];
  const seen = new Set();
  const fresh = rows.filter(r => !seen.has(r.id) && !getTarget(r.target_key)?.clientProposed);
  eq('a deferred activity is not offered again by the prompt',
    fresh.map(r => r.id), [1, 3]);
  eq('  while the vendor suggestions from the same note still are',
    fresh.every(r => getTarget(r.target_key).clientProposed !== true), true);
  // An unknown key must not be silently swallowed — that would hide a target
  // added later that nobody remembered to classify.
  const unknown = [{ id: 4, target_key: 'something_new' }]
    .filter(r => !getTarget(r.target_key)?.clientProposed);
  eq('an unrecognised target is still shown rather than dropped', unknown.length, 1);

  // The record is where it went, and that section shows it.
  const section = readFileSync('components/SuggestedUpdatesSection.tsx', 'utf8');
  eq('the record section does not filter it out',
    /clientProposed/.test(section), false);
}

console.log('\n— the poll is not spent behind the form —');
{
  // The reported bug: choose Touchpoint on the chooser, fill the form in, and
  // the vendor suggestion from the same note never appears. The poll runs for
  // twelve seconds from the moment the note is saved, a touchpoint takes
  // longer than that to fill in, so all ten attempts ran behind the modal and
  // it gave up before the extractor answered.
  //
  // Measured in Chromium with the extractor landing at +14s and the form
  // closed at +32s: without the pause, 10 polls all issued behind the modal
  // and the prompt is LOST; with it, 0 polls while the form is open, then 1 on
  // close and the prompt appears.
  const { readFileSync } = await import('node:fs');
  const prompt = readFileSync('components/SuggestionPrompt.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  eq('the poll waits while the activity flow has the screen',
    /while \(isActivityFlowOpen\(\) && Date\.now\(\) < pauseDeadline\) \{/.test(prompt), true);
  eq('  reading the flag live, not a value captured when the poll started',
    /isActivityFlowOpen\(\)/.test(prompt) && /import \{ useActivityFlowOpen, isActivityFlowOpen \}/.test(prompt), true);
  // The pause must sit BEFORE the fetch, or an attempt is still spent.
  const loop = prompt.slice(prompt.indexOf('for (let i = 0; i < POLL_ATTEMPTS'));
  eq('  before the fetch, so no attempt is consumed behind the modal',
    loop.indexOf('isActivityFlowOpen()') < loop.indexOf('await fetch('), true);
  // And it must not run forever if a form is left open on a locked phone.
  eq('the wait has a floor under it', /const pauseDeadline = Date\.now\(\) \+ MAX_PAUSE_MS;/.test(prompt), true);
  eq('  which is minutes, not the twelve seconds it is protecting',
    /const MAX_PAUSE_MS = 5 \* 60_000;/.test(prompt), true);

  // The budget itself is unchanged — this changes WHEN it is spent, not how
  // much of it there is.
  eq('ten attempts, as before', /const POLL_ATTEMPTS = 10;/.test(prompt), true);
  eq('  at the same interval', /const POLL_MS = 1200;/.test(prompt), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
