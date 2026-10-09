/**
 * Several statuses, set from the cell that shows them.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/company-status-multiselect.mjs
 *
 * A company carries more than one status. The column stores them
 * comma-separated, the list API splits them, the filter splits them, the cell
 * draws one badge each — and the record page has always let a reader toggle as
 * many as apply. The one place that could not was the inline editor in the
 * cell showing those badges: a single <select>, which can only replace the
 * whole set with one of its members.
 *
 * Two things make this more than swapping a control:
 *
 *   • Statuses come in two halves. The global ones live in companies.status;
 *     the user-scoped ones live in company_user_statuses and reach the client
 *     as my_user_status_ids. The reader sees one row of badges, so the editor
 *     has to offer one list of checkboxes and write both halves back.
 *
 *   • The PATCH route reads `status` as the COMPLETE picture — it deletes any
 *     user-scoped mark whose value is absent from the payload. So sending the
 *     global half alone silently clears the reader's own user-scoped
 *     statuses, which is what the single-select did on every save.
 *
 * Driven in Chromium against the real component inside a scrolling table:
 * the menu opens on mount and is not clipped by the scroller (fixed, drawn at
 * y=230 below a scroller ending at 262), three options tick and one unticks,
 * an outside click commits ["Interested","My Watchlist"], and the X and
 * Escape both close having committed nothing.
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

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const table = strip('components/CompanyTable.tsx');
const multi = strip('components/InlineMultiSelect.tsx');

console.log('\n— the status cell edits a set, not a value —');
{
  /* Anchored on the status cell so a <select> left anywhere else in the file
     cannot make this pass. The slice runs forward from the cell's own case. */
  const at = table.indexOf("case 'status': return");
  eq('the status cell exists', at > -1, true);
  const cell = table.slice(at, at + 1800);
  eq('  and it is a real slice', cell.length > 400, true);

  eq('it edits with a multiselect', /<InlineMultiSelect/.test(cell), true);
  eq('  and no longer with a single select', /<select/.test(cell), false);
  eq('  offering every configured status', /options=\{statusOptions\}/.test(cell), true);
  // The draft is the comma-separated form the column already uses, so nothing
  // else in this file had to learn a new shape.
  eq('  reading the draft as a list',
    /selected=\{cellDraft\.split\(','\)\.map\(s => s\.trim\(\)\)\.filter\(Boolean\)\}/.test(cell), true);
  eq('  and writing it back as one', /onChange=\{\(values\) => setCellDraft\(values\.join\(','\)\)\}/.test(cell), true);
  /* The menu opens with the editor. The cell replaces a badge the reader has
     just clicked, so that click should have opened the menu too. */
  eq('  open from the click that opened the editor', /defaultOpen/.test(cell), true);
}

console.log('\n— both halves of a company’s statuses, in one list —');
{
  eq('the editor is seeded with both',
    /else if \(field === 'status'\) setCellDraft\(companyStatusValues\(company\)\.join\(','\)\);/.test(table), true);
  eq('  the global ones from the column',
    /const global = \(company\.status \|\| ''\)\.split\(','\)/.test(table), true);
  eq('  and the user-scoped ones from their ids',
    /\(company\.my_user_status_ids \|\| \[\]\)\s*\.map\(optId => userScopedStatusMap\.get\(optId\)\)/.test(table), true);

  /*
   * The whole selection is sent. The route strips the user-scoped values into
   * company_user_statuses and deletes any mark it does not see, so a payload
   * missing them is a payload that clears them.
   */
  eq('and the whole selection is what gets saved',
    /payload\.status = next\.join\(','\) \|\| null;/.test(table), true);
  eq('  with the user-scoped values still in it',
    /const next = draft\.split\(','\)\.map\(s => s\.trim\(\)\)\.filter\(Boolean\);/.test(table), true);
}

console.log('\n— and it only saves when something changed —');
{
  /*
   * Order is not a change. Ticking A then B and ticking B then A produce
   * different strings and the same set, and this PATCH cascades the status to
   * every attendee of the company — not a write to make for nothing.
   */
  eq('the comparison is a set comparison',
    /const same = next\.length === current\.length && next\.every\(v => current\.includes\(v\)\);/.test(table), true);
  eq('  against both halves', /const current = companyStatusValues\(company\);/.test(table), true);
  eq('  and an unchanged set just closes', /if \(same\) \{ setEditingCell\(null\); return; \}/.test(table), true);

  /*
   * The commit carries its own selection. The menu closes from a
   * document-level listener registered once; cellDraft read in there is the
   * copy from the render that registered it — the selection as it was before
   * the last checkbox.
   */
  eq('the commit passes the selection rather than reading it back',
    /onCommit=\{\(values\) => saveInlineEdit\(company, 'status', values\.join\(','\)\)\}/.test(table), true);
  eq('  which saveInlineEdit prefers over its state',
    /const draft = draftOverride \?\? cellDraft;/.test(table), true);

  // And the row redraws from the route's answer, which is the only place the
  // split between the two halves is authoritative.
  eq('the saved row is what the cell redraws from',
    /updated\.my_user_status_ids = Array\.isArray\(saved\?\.my_user_status_ids\)/.test(table), true);
}

console.log('\n— the menu is not clipped by the table —');
{
  /*
   * A cell sits inside a scrolling container. An absolutely positioned menu
   * is clipped by that container's overflow, which is why MultiSelectDropdown
   * — the form field — cannot be used here, and why this measures its trigger
   * and draws the menu fixed, as RepMultiSelect does.
   */
  eq('the menu is drawn against the viewport', /position: 'fixed',/.test(multi), true);
  eq('  from a measured trigger', /const rect = el\.getBoundingClientRect\(\);/.test(multi), true);
  eq('  flipping up when there is no room below',
    /const above = spaceBelow < MENU_H && rect\.top > spaceBelow;/.test(multi), true);
  eq('  and following the cell when it scrolls',
    /window\.addEventListener\('scroll', recalc, true\);/.test(multi), true);

  /*
   * Opening on mount has no click to measure from, and an effect is the first
   * moment the trigger exists.
   */
  eq('opening on mount measures too',
    /if \(defaultOpen && triggerRef\.current\) setPos\(measure\(triggerRef\.current\)\);/.test(multi), true);
}

console.log('\n— clicking away saves; the X does not —');
{
  // Every other inline editor in these tables saves on blur, so clicking away
  // from this one has to mean the same thing.
  eq('an outside click commits', /onCommitRef\.current\(selectedRef\.current\);/.test(multi), true);
  eq('  reading the selection from a ref, not the closure',
    /selectedRef\.current = selected;/.test(multi), true);

  /*
   * The cancel button is OUTSIDE this component, so the outside-click
   * listener sees it. mousedown runs before click, so without a guard the
   * commit lands first and the cancel then closes an already-saved cell —
   * the button would save the edit it exists to discard.
   */
  eq('except the cancel button',
    /if \(target instanceof Element && target\.closest\('\[data-inline-edit-cancel\]'\)\) return;/.test(multi), true);
  eq('  which is marked for it',
    /data-inline-edit-cancel/.test(strip('components/InlineEditField.tsx')), true);
  eq('and Escape discards', /if \(e\.key === 'Escape'\) \{ setOpen\(false\); setPos\(null\); onCancelRef\.current\?\.\(\); \}/.test(multi), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
