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
    /<div className="w-full h-full overflow-hidden rounded-xl" style=\{\{ color: textColor, background: fill \}\}>/.test(modal), true);
  eq('  and carries the colour the text will be drawn in', /style=\{\{ color: textColor \}\}/.test(modal), true);
  eq('  with no white card left under it', /rounded-xl bg-white"><RichTextEditor/.test(modal), false);
}

console.log('\n— a copy of an element —');
{
  eq('the toolbar offers one', /title="Duplicate"/.test(modal), true);
  eq('  landing clear of the original', /x: el\.x \+ DUPLICATE_OFFSET/.test(modal), true);
  // Above everything, by the one rule that also clears the form card — see
  // "where a new element lands" below.
  eq('  and above everything, like a new element',
    /duplicateElement = useCallback\(async \(el: FormElement\) => \{\n    const nextZ = nextElementZ\(\);/.test(modal), true);

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

  // Escape drops the group and shuts the fill picker with it.
  eq('escape lets the group go',
    /if \(e\.key !== 'Escape'\) return;[\s\S]{0,60}setSelectedIds\(new Set\(\)\);/.test(modal), true);
  eq('  and so does leaving edit mode',
    /if \(!isEditMode\) \{ setSelectedIds\(new Set\(\)\); setFillOpenFor\(null\); return; \}/.test(modal), true);
  eq('  a removed element leaves it too', /if \(!prev\.has\(id\)\) return prev;/.test(modal), true);
}

console.log('\n— where a new element lands —');
{
  /*
   * Reported: clicking Add Text appeared to do nothing. It did — the element
   * was created, centred in the viewport where the form card also is, with a
   * z of zero against the card's 1000. It was underneath the card the whole
   * time.
   */
  eq('new elements clear the form card, not just the other elements',
    /Math\.max\(formMeta\.form_z_index, \.\.\.elements\.map\(e => e\.z_index\), -1\) \+ 1/.test(modal), true);
  eq('  and a duplicate uses the same rule', /const nextZ = nextElementZ\(\);/.test(modal), true);

  // And they are put beside the card rather than over it, on the side that
  // has room — never under the settings drawer, which is where they used to
  // be dropped before the centring.
  eq('they are placed beside the card', /const right = cardX \+ cardWidth \+ GAP;/.test(modal), true);
  eq('  the other side when the first has no room', /const left = cardX - GAP - width;/.test(modal), true);
  eq('    but never under the settings drawer', /if \(left >= DRAWER_WIDTH \+ GAP\) return \{ x: left, y \};/.test(modal), true);
  eq('  and centred when neither side fits',
    /return \{ x: Math\.max\(0, Math\.round\(\(window\.innerWidth - width\) \/ 2\)\), y \};/.test(modal), true);
}

console.log('\n— the rubber band —');
{
  // Intersection, not containment: the useful gesture is a stroke across a
  // row of things rather than a careful loop around them.
  eq('the band takes everything it touches',
    /el\.x < right && el\.x \+ el\.width > left && el\.y < bottom && el\.y \+ el\.height > top/.test(modal), true);
  /*
   * One check keeps it out of the way of every element's own drag, the form
   * card's, the settings drawer and the close button: the pointer must have
   * gone down on the canvas itself and nothing inside it.
   */
  eq('  and starts only on bare canvas',
    /if \(!isEditMode \|\| e\.button !== 0 \|\| e\.target !== canvasRef\.current\) return;/.test(modal), true);
  eq('  drawn in the same coordinate space the elements are placed in',
    /<div ref=\{canvasRef\} onPointerDown=\{startBand\} className="relative h-full w-full overflow-hidden">/.test(modal), true);
  eq('  shift adds to the group, a bare drag replaces it',
    /const next = prev\.add \? new Set\(current\) : new Set<number>\(\);/.test(modal), true);
  eq('  so a click on empty canvas clears', /setBand\(\{ x0: x, y0: y, x1: x, y1: y, add: e\.shiftKey \}\)/.test(modal), true);
  eq('  and it listens to nothing while it is drawn', /pointer-events-none absolute border border-dashed/.test(modal), true);
}

console.log('\n— a fill behind the words —');
{
  const elementsRoute2 = strip('app/api/conference-forms/[id]/elements/route.ts');
  const publicRoute = strip('app/api/public/conference-forms/route.ts');

  /*
   * Colour and opacity are stored apart rather than as one rgba string: a
   * colour input cannot read rgba, and nudging the opacity of a string means
   * parsing it back out. They are put together in exactly one place, so the
   * editor and the public page cannot disagree about what a half-transparent
   * panel looks like.
   */
  eq('one function turns the two into CSS', /export function elementFill\(color: string \| null, opacity: number \| null\)/.test(modal), true);
  eq('  no colour means no fill at all', /if \(!color\) return undefined;/.test(modal), true);
  eq('  a junk colour is ignored rather than drawn', /if \(!\/\^\[0-9a-f\]\{6\}\$\/i\.test\(hex\)\) return undefined;/.test(modal), true);
  eq('  and the percentage is clamped', /Math\.min\(100, Math\.max\(0, opacity \?\? 100\)\)/.test(modal), true);

  // Drawn while editing too: judging white text on a 40% panel means seeing
  // the panel.
  eq('the editor draws it', /style=\{\{ color: textColor, background: fill \}\}/.test(modal), true);
  eq('  and so does the public page', /background: elementFill\(el\.background_color, el\.background_opacity\)/.test(publicForm), true);
  eq('    from the same function',
    /import \{ buildAccentBackground, elementFill, shapeRadius \}/.test(publicForm), true);

  // Text panels and shapes. An image brings its own background and a video
  // is one, so neither offers a fill.
  eq('text and shapes offer one, media does not',
    /\{\(el\.element_type === 'text' \|\| el\.element_type === 'shape'\) && \([\s\S]{0,400}title="Background colour"/.test(modal), true);
  eq('  the opacity appears once there is a colour to see through',
    /\{el\.background_color && \([\s\S]{0,300}type="range"/.test(modal), true);
  eq('  and clearing it writes a null rather than a black',
    /updateElement\(el\.id, \{ background_color: null \}\)/.test(modal), true);

  for (const [label, route] of [['the editor', elementsRoute2], ['the public read', publicRoute]]) {
    eq(`${label} returns both fields`, /background_color, background_opacity/.test(route), true);
    eq(`  with no fill left as null`, /background_color: r\.background_color \? String\(r\.background_color\) : null/.test(route), true);
    eq(`  and a missing opacity read as full`, /background_opacity: r\.background_opacity != null \? Number\(r\.background_opacity\) : 100/.test(route), true);
  }
  // A duplicate is a copy of the thing, fill included.
  eq('a duplicate carries the fill', /background_color: el\.background_color/.test(modal), true);
}

console.log('\n— shapes —');
{
  const elementsRoute3 = strip('app/api/conference-forms/[id]/elements/route.ts');
  const drawer = strip('components/FormEditDrawer.tsx');
  const migrations = strip('lib/db-migrations.ts');

  eq('the drawer offers three of them', /onAddShape\(corner\)/.test(drawer), true);
  eq('  rectangle, rounded and circle',
    /\['square', 'Rectangle', 'rounded-none'\][\s\S]{0,120}\['circle', 'Circle', 'rounded-full'\]/.test(drawer), true);
  // An unfilled, unbordered rectangle is an invisible rectangle, and dropping
  // one of those on the canvas looks exactly like the bug this editor had.
  eq('  and a new one arrives visible',
    /background_color: '#94a3b8',\n              background_opacity: 75,/.test(modal), true);

  /*
   * A circle is 50%, so it follows the element as it is resized: dragging one
   * wide gives an ellipse, which is what dragging a circle wide should do.
   */
  eq('one function decides the corner', /export function shapeRadius\(cornerStyle: string\)/.test(modal), true);
  eq('  a circle follows the box', /if \(cornerStyle === 'circle'\) return '50%';/.test(modal), true);
  eq('  and the public page draws from it too', /borderRadius: shapeRadius\(el\.corner_style\)/.test(publicForm), true);

  eq('a shape is drawn as a box with an edge', /function ShapeElementCanvas\(\{ element \}: \{ element: FormElement \}\)/.test(modal), true);
  eq('  with the fill text panels use', /const fill = elementFill\(element\.background_color, element\.background_opacity\);/.test(modal), true);
  eq('  and no edge at all when it has no width',
    /width > 0 && element\.border_color \? `\$\{width\}px solid \$\{element\.border_color\}` : undefined/.test(modal), true);
  // Choosing a border colour is how somebody asks for a border.
  eq('  picking a colour gives it a width',
    /border_width: el\.border_width > 0 \? el\.border_width : 2,/.test(modal), true);

  /*
   * Layering is not gated by what an element is: the four controls sit in
   * every element's toolbar, so a shape can go behind a photograph or in
   * front of the form card like anything else. Measured in the editor —
   * Send to back renumbers the whole stack, the form card included.
   */
  eq('a shape layers like everything else',
    /\{isEditMode && \([\s\S]*?title="Send to back"/.test(modal), true);
  eq('  against the form card too, which is in the same stack',
    /\{ kind: 'form' as const, id: 'form' as const, z: formMeta\.form_z_index \}/.test(modal), true);

  eq('the API takes the fourth kind', /\['image', 'text', 'video', 'shape'\]\.includes\(element_type\)/.test(elementsRoute3), true);
  eq('  and carries the edge', /border_color, border_width/.test(elementsRoute3), true);

  /*
   * Widening that CHECK means rebuilding the table — the operation that
   * stranded it on a live tenant. The rebuild is written to survive being
   * interrupted, and the repair that finished the last one is repeated after
   * it. tests/form-elements-repair.mjs runs that against a real database.
   */
  eq('the rebuild creates its copy only if it has to',
    /CREATE TABLE IF NOT EXISTS form_elements_new/.test(migrations), true);
  eq('  drops the original only if it is there', /DROP TABLE IF EXISTS form_elements/.test(migrations), true);
  eq('  and is followed by the repair that finishes it',
    migrations.lastIndexOf('ALTER TABLE form_elements_new RENAME TO form_elements')
      > migrations.indexOf('CREATE TABLE IF NOT EXISTS form_elements_new'), true);
}

console.log('\n— aligning and indenting a line —');
{
  const editor = strip('components/RichTextEditor.tsx');
  const publicPage = strip('app/forms/page.tsx');

  /*
   * Both are properties of the BLOCK, which is what makes them behave the
   * way a word processor's do: a caret sitting in a paragraph aligns that
   * paragraph, and a selection across three does all three. Nothing has to
   * be selected, and nothing else is touched.
   */
  eq('alignment and indent live on the block', /export const BlockLayout = Extension\.create\(\{/.test(editor), true);
  eq('  on paragraphs and headings', /addOptions\(\) \{ return \{ types: \['paragraph', 'heading'\] \}; \}/.test(editor), true);
  eq('  and the editor loads it', /FontSize,\n    BlockLayout,/.test(editor), true);

  eq('three alignments', /\['left', 'Align left'[\s\S]{0,200}\['right', 'Align right'/.test(editor), true);
  eq('  and pressing the active one clears it',
    /setTextAlign\(editor\.isActive\(\{ textAlign: align \}\) \? null : align\)/.test(editor), true);

  eq('indent moves in steps', /export const INDENT_STEP = 24;/.test(editor), true);
  eq('  with a floor and a ceiling', /Math\.min\(MAX_INDENT, Math\.max\(0, \(node\.attrs\.indent \|\| 0\) \+ by\)\)/.test(editor), true);
  // Every block the selection touches, not just the one the caret is in.
  eq('  across everything the selection touches', /state\.doc\.nodesBetween\(from, to, /.test(editor), true);

  /*
   * Two attributes, one style attribute. mergeAttributes joins them rather
   * than letting the second overwrite the first — measured: an indented
   * centred line stores `text-align: center; margin-left: 48px`.
   */
  eq('alignment is written as style', /style: `text-align: \$\{attributes\.textAlign\}`/.test(editor), true);
  eq('  and indent as a margin', /style: `margin-left: \$\{steps \* INDENT_STEP\}px`/.test(editor), true);
  // Stored HTML is read back when the element is opened again.
  eq('  both read back out of the HTML',
    /parseHTML: \(element: HTMLElement\) => element\.style\.textAlign \|\| null/.test(editor)
      && /parseInt\(element\.style\.marginLeft \|\| '0', 10\)/.test(editor), true);
}

console.log('\n— and the spaces somebody types —');
{
  const publicPage = strip('app/forms/page.tsx');
  /*
   * Measured: six typed spaces put the first glyph 31px in while editing and
   * 0px in once rendered, because HTML collapses a run of spaces to one. The
   * editor keeps them (ProseMirror sets pre-wrap on its own content), so
   * every place that renders the stored HTML has to keep them too or the
   * text moves on save.
   */
  eq('the form card keeps them', /background: fill, whiteSpace: 'pre-wrap'/.test(modal), true);
  eq('  the public page keeps them', /style=\{\{ whiteSpace: 'pre-wrap' \}\}/.test(publicPage), true);
  eq('  and so does the details panel', /color: textColor, whiteSpace: 'pre-wrap'/.test(publicPage), true);
}

console.log('\n— the form card\u2019s actions, named —');
{
  const tab = strip('components/ConferenceFormsTab.tsx');
  /*
   * Six unlabelled glyphs is a guessing game, and a desktop has room for the
   * words. They are hidden below lg, where the row would wrap to three lines
   * and push the Expand button off the card.
   */
  for (const label of ['Download', 'Form Settings', 'Add/edit Form Fields', 'Duplicate Form', 'Generate Link', 'Delete Form']) {
    eq(`${label} is named beside its icon`,
      new RegExp(`<span className="hidden lg:inline">${label.replace('/', '\\/')}</span>`).test(tab), true);
  }
  eq('  and the row wraps rather than growing',
    /<div className="flex flex-wrap items-center gap-1">/.test(tab), true);
  // The titles stay: they are what a phone has instead of the words.
  eq('  while the tooltips stay for the phone', /title="Export to Excel"/.test(tab), true);
}

console.log('\n— the public form, on a phone —');
{
  // Two name boxes sharing a 360px line leave about 150px each.
  eq('first and last name stack, and pair from sm',
    /<div key=\{field\.id\} className="grid grid-cols-1 sm:grid-cols-2 gap-3">/.test(publicForm), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
