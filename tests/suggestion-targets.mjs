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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
