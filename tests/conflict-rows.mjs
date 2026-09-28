/**
 * The upload review modal's two questions, and which column each answer lights.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/conflict-rows.mjs
 *
 * One layout asks two different things. A FIELD row asks which of two values to
 * keep, so accepting takes the one on the right. An IDENTITY row asks whether a
 * name in the file is an existing company, so answering YES uses the existing
 * record on the LEFT and answering no performs the action on the right.
 *
 * `accept` therefore points at different columns on different rows, and the
 * modal used to assume it always pointed right. Pressing "Same company" bolded
 * `Add "X" as a new company` — the outcome of the button the reader had not
 * pressed. Nothing was miswritten to the database; the screen just described
 * the opposite of what it was about to do, on the one answer here that cannot
 * be undone from anywhere in the app.
 *
 * Three sections:
 *
 *   1. The rule itself, as pure functions, both ways round.
 *   2. What the conflicts route sends for an identity row — the labels, the
 *      column it points accept at, and captions that name the outcome.
 *   3. The modal's structure: per-section column headers and bulk controls, so
 *      one click cannot merge every fuzzy match in a file.
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
  acceptColumn, columnFor, isChosen, captionFor,
  DEFAULT_ACCEPT_CAPTION, DEFAULT_IGNORE_CAPTION,
} = await import('@/lib/conflictRows');

/** A field row: two candidate values, accept takes the proposed one. */
const FIELD = {};
/** An identity row: accept means "same company", which is the existing one. */
const IDENTITY = {
  acceptShows: 'current',
  acceptCaption: '← 3 attendees join this company',
  ignoreCaption: '← 3 attendees get a new company',
};

// ── 1. The rule ──────────────────────────────────────────────────────────────

console.log('\n— a field row points accept at the proposed value —');
{
  eq('accept lights the proposed column', columnFor(FIELD, 'accept'), 'proposed');
  eq('ignore lights the current column', columnFor(FIELD, 'ignore'), 'current');
  eq('  and that is the default with nothing declared', acceptColumn(FIELD), 'proposed');
}

console.log('\n— an identity row points accept at the existing company —');
{
  // The whole point: "Same company" attaches the file's attendees to the
  // company already in the database, which is the left-hand column.
  eq('accept lights the current column', columnFor(IDENTITY, 'accept'), 'current');
  eq('ignore lights the proposed column', columnFor(IDENTITY, 'ignore'), 'proposed');
  eq('  as declared by the row', acceptColumn(IDENTITY), 'current');
}

console.log('\n— exactly one column is lit, and never both —');
for (const [name, row] of [['field', FIELD], ['identity', IDENTITY]]) {
  for (const answer of ['accept', 'ignore']) {
    const lit = ['current', 'proposed'].filter(col => isChosen(row, answer, col));
    eq(`${name} row, ${answer}: one column lit`, lit, [columnFor(row, answer)]);
  }
  // An unanswered row highlights nothing — the reader has not chosen yet, and
  // a row that looks answered is a row nobody checks.
  eq(`${name} row: nothing is lit before an answer`,
    ['current', 'proposed'].filter(col => isChosen(row, null, col)), []);
  eq(`${name} row: nor when the answer is missing`,
    ['current', 'proposed'].filter(col => isChosen(row, undefined, col)), []);
}

console.log('\n— the caption follows the highlight —');
{
  // Keyed on the column, not on the answer, so the words under a lit column are
  // always that column's outcome. Keyed on the answer they could drift apart,
  // which is the bug one level down.
  eq('field row: the proposed column carries the accept words',
    captionFor(FIELD, 'proposed'), DEFAULT_ACCEPT_CAPTION);
  eq('field row: the current column carries the ignore words',
    captionFor(FIELD, 'current'), DEFAULT_IGNORE_CAPTION);

  eq('identity row: the existing company carries the accept words',
    captionFor(IDENTITY, 'current'), IDENTITY.acceptCaption);
  eq('identity row: the other column carries the ignore words',
    captionFor(IDENTITY, 'proposed'), IDENTITY.ignoreCaption);

  // The generic wording describes picking between two values, so a row whose
  // columns are a record and an action must not fall back to it.
  for (const col of ['current', 'proposed']) {
    eq(`identity row: ${col} does not fall back to the generic wording`,
      [DEFAULT_ACCEPT_CAPTION, DEFAULT_IGNORE_CAPTION].includes(captionFor(IDENTITY, col)), false);
  }
}

// ── 2. What the route sends ──────────────────────────────────────────────────

const CONFLICTS = 'app/api/conferences/[id]/attendees/upload/conflicts/route.ts';
const UPLOAD = 'app/api/conferences/[id]/attendees/upload/route.ts';
const MODAL = 'components/ConflictResolutionModal.tsx';

console.log('\n— the identity row the conflicts route builds —');
{
  const src = readFileSync(CONFLICTS, 'utf8');
  const row = src.slice(src.indexOf("entityType: 'company_identity'"), src.indexOf('detail: `${who}'));

  eq('accept is pointed at the existing company', /acceptShows: 'current'/.test(row), true);
  eq('the affirmative answer is "Same company"', /acceptLabel: 'Same company'/.test(row), true);
  // "Different" named the judgement and left the consequence to be inferred;
  // the reader already gave the judgement by pressing the button, and what they
  // cannot see is what it does.
  eq('the other answer names its outcome', /ignoreLabel: 'New company'/.test(row), true);
  eq('  and is not the old judgement-only wording', /ignoreLabel: 'Different'/.test(row), false);

  // Both captions say where the file's attendees end up, which is the only
  // thing this answer decides. Counted rather than matched loosely: a caption
  // on one side only is how the row stops explaining itself half the time.
  const captions = row.match(/(accept|ignore)Caption: `← \$\{who\} [^`]+`/g) ?? [];
  eq('both answers say where the attendees land', captions.length, 2);

  // `who` is already "1 attendee" or "4 attendees", so the verb has to agree
  // with it or a one-person company reads "1 attendee get a new one". Every
  // caption carries its own agreement rather than one covering for the other.
  eq('  and both agree in number',
    captions.filter(c => /affected === 1 \? '\w+' : '\w+'/.test(c)).length, 2);

  // The safe default survives. A duplicate company is visible and mergeable; a
  // wrong merge is silent, and this modal is the only place it is recorded.
  eq('an unanswered name still becomes a new company',
    /defaultResolution: 'ignore'/.test(row), true);
}

console.log('\n— and the upload route still reads it that way —');
{
  // The display fix must not have quietly inverted the meaning underneath it.
  // `accept` attaching to the existing company is what makes "Same company" the
  // accept label rather than the ignore one.
  const src = readFileSync(UPLOAD, 'utf8');
  const branch = src.slice(src.indexOf('const answer = identityRes('), src.indexOf('const answer = identityRes(') + 700);
  eq('accept attaches to the matched company',
    /answer === 'accept'[\s\S]{0,200}companyIdCache\.set\(coName, hit\.match\.id\)/.test(branch), true);
  eq('  and is remembered as confirmed', /decision: 'confirmed'/.test(branch), true);
  eq('anything else creates a new company',
    /else \{[\s\S]{0,120}companyIdCache\.set\(coName, -1\)/.test(branch), true);
  eq('  but only an explicit no is remembered',
    /if \(answer === 'ignore'\)[\s\S]{0,120}decision: 'rejected'/.test(branch), true);
}

// ── 3. The modal's structure ─────────────────────────────────────────────────

const modal = readFileSync(MODAL, 'utf8');

console.log('\n— the two kinds of row are separated —');
{
  eq('identity rows are grouped', /identityRows = conflicts\.filter\(c => c\.entityType === 'company_identity'\)/.test(modal), true);
  eq('everything else is a field row', /fieldRows = conflicts\.filter\(c => c\.entityType !== 'company_identity'\)/.test(modal), true);

  // Each section labels its own columns. Headed at the modal level, the labels
  // could only be right for one kind of row, and a file carrying both — the
  // ordinary case — labelled the identity rows with field-row wording.
  eq('the identity section names an existing company',
    /\['Name in file', 'Existing Company', 'Otherwise'\]/.test(modal), true);
  eq('the field section keeps the value wording',
    /\['Name \/ Field', 'Current Value', 'Proposed Value'\]/.test(modal), true);
  // The column labels must come from the section, not from a single header that
  // guesses which kind of row is on screen.
  eq('no modal-level guess at which labels to use',
    /identityCount > 0 && fieldCount === 0 \? 'Existing Company'/.test(modal), false);
}

console.log('\n— the identity section says the answer is durable —');
{
  const section = modal.slice(modal.indexOf("'Company matches'"), modal.indexOf("'Name in file'"));
  eq('it says the answer is remembered', /remembered/.test(section), true);
  eq('  and what silence does', /added as new companies/.test(section), true);
}

console.log('\n— bulk answers are scoped to one section —');
{
  // The stakes differ. Accepting every field difference overwrites values that
  // can be edited back; accepting every identity row merges companies and
  // writes a permanent alias for each, with no screen anywhere to undo it.
  eq('Accept All touches field rows only',
    /Accept All', \(\) => setAll\(fieldRows, 'accept'\)/.test(modal), true);
  eq('Ignore All touches field rows only',
    /Ignore All', \(\) => setAll\(fieldRows, 'ignore'\)/.test(modal), true);
  eq('no bulk control answers every row at once',
    /setAll\(conflicts,/.test(modal), false);

  // Merging in bulk asks first; adding new companies in bulk does not, because
  // that is the reversible direction.
  eq('merging them all asks first',
    /'All same company', \(\) => setConfirmMergeAll\(true\)/.test(modal), true);
  eq('  and only merges once confirmed',
    /Yes, merge all', \(\) => \{\s*\n\s*setAll\(identityRows, 'accept'\)/.test(modal), true);
  eq('adding them all as new is immediate',
    /'All new companies', \(\) => setAll\(identityRows, 'ignore'\)/.test(modal), true);
}

console.log('\n— the row no longer decides by entity type —');
{
  // The mapping is data on the row now. A component that branched on the type
  // had to be edited for every new kind of question, and got this one backwards.
  const render = modal.slice(modal.indexOf('const renderRow'), modal.indexOf('const sectionHead'));
  eq('the highlight comes from the shared rule', /isChosen\(c, res, col\)/.test(render), true);
  eq('  and so does the caption', /captionFor\(c, col\)/.test(render), true);
  eq('captions are no longer blanked for identity rows',
    /entityType === 'company_identity' \? '' :/.test(render), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
