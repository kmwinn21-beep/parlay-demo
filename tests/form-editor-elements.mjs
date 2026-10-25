/**
 * The form canvas: writing on it, copying from it, moving several things at once.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/form-editor-elements.mjs
 *
 * Three things the editor could not do, and one the public form got wrong.
 *
 * A text element was typed on a white card, so writing meant to sit over a
 * photograph was composed as black on white and only became itself on save.
 * There was no way to copy an element, so a second caption in the same style
 * was built again by hand. And elements moved one at a time, which takes a
 * laid-out group of them apart every time the group needs nudging.
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
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

const modal = strip('components/ExpandedFormModal.tsx');
const elementsRoute = strip('app/api/conference-forms/[id]/elements/route.ts');
const publicForm = strip('app/forms/page.tsx');

console.log('\n— typing on the page, not on a card —');
{
  eq('the editing surface is transparent',
    /<div className="w-full h-full overflow-hidden rounded-xl" style=\{\{ color: textColor \}\}>/.test(modal), true);
  eq('  and carries the colour the text will be drawn in', /style=\{\{ color: textColor \}\}/.test(modal), true);
  eq('  with no white card left under it', /rounded-xl bg-white"><RichTextEditor/.test(modal), false);
}

console.log('\n— a copy of an element —');
{
  eq('the toolbar offers one', /title="Duplicate"/.test(modal), true);
  eq('  landing clear of the original', /x: el\.x \+ DUPLICATE_OFFSET/.test(modal), true);
  eq('  and above everything, like a new element',
    /const nextZ = elements\.length > 0 \? Math\.max\(\.\.\.elements\.map\(e => e\.z_index\)\) \+ 1 : 0;[\s\S]{0,400}duplicate/i.test(modal)
      || /duplicateElement[\s\S]{0,300}Math\.max\(\.\.\.elements\.map\(e => e\.z_index\)\) \+ 1/.test(modal), true);

  /*
   * How a media element is framed has to travel with the copy. The insert
   * took none of these — they were defaults only, which nothing missed until
   * something was duplicated — so a copied image would have lost its crop,
   * its focal point and its corners, and the editor would have shown it
   * correctly until the next reload.
   */
  for (const field of ['object_fit', 'focal_x', 'focal_y', 'corner_style']) {
    eq(`  carrying ${field}`, new RegExp(`${field}: el\\.${field}`).test(modal), true);
    eq(`    which the insert now stores`, new RegExp(`${field}`).test(elementsRoute), true);
  }
  eq('  and the insert validates what it is given',
    /object_fit === 'cover' \? 'cover' : 'contain'/.test(elementsRoute), true);
  eq('    for the corners too', /corner_style === 'square' \? 'square' : 'rounded'/.test(elementsRoute), true);
}

console.log('\n— several at once —');
{
  eq('elements join a group by their own tick', /onClick=\{\(\) => toggleSelected\(el\.id\)\}/.test(modal), true);
  eq('  which says it is in one', /aria-pressed=\{selectedIds\.has\(el\.id\)\}/.test(modal), true);
  eq('  and wears a different ring', /selectedIds\.has\(el\.id\) \? 'ring-brand-highlight' : 'ring-white\/60'/.test(modal), true);

  eq('a drag starts by recording where everyone stood', /onDragStart=\{\(\) => beginGroupDrag\(el\.id\)\}/.test(modal), true);
  // Offsets from the start, not a sum of frames: a long drag cannot drift.
  eq('  and the others follow by the distance travelled',
    /const dx = Math\.round\(x - from\.x\);/.test(modal), true);
  eq('  clamped at the edge, as the dragged one is',
    /x: Math\.max\(0, o\.x \+ dx\), y: Math\.max\(0, o\.y \+ dy\)/.test(modal), true);
  // Dragging something outside the group is an ordinary single move.
  eq('  while dragging a non-member drops the group',
    /if \(!selectedIds\.has\(id\)\) \{[\s\S]{0,80}setSelectedIds\(new Set\(\)\);[\s\S]{0,40}groupDrag\.current = null;/.test(modal), true);
  // The writes go out on drop, not per frame per element.
  eq('  and the group is written once, on drop',
    /for \(const \[id, pos\] of groupOffsets\(origins, el\.id, d\.x, d\.y\) \?\? \[\]\) \{\n                  updateElement\(id, pos\);/.test(modal), true);

  eq('escape lets the group go', /if \(e\.key === 'Escape'\) setSelectedIds\(new Set\(\)\);/.test(modal), true);
  eq('  and so does leaving edit mode', /if \(!isEditMode\) \{ setSelectedIds\(new Set\(\)\); return; \}/.test(modal), true);
  eq('  a removed element leaves it too', /if \(!prev\.has\(id\)\) return prev;/.test(modal), true);
}

console.log('\n— the public form, on a phone —');
{
  // Two name boxes sharing a 360px line leave about 150px each.
  eq('first and last name stack, and pair from sm',
    /<div key=\{field\.id\} className="grid grid-cols-1 sm:grid-cols-2 gap-3">/.test(publicForm), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
