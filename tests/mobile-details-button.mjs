/**
 * The Details button, and the panel it raises.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/mobile-details-button.mjs
 *
 * One field type that is not a question. It puts a Details button beside
 * Submit on a phone and holds the text that button reveals — the time, the
 * address, what to bring — which somebody filling in an RSVP on their phone
 * wants to check without leaving the form.
 *
 * It only appears where it is any use: the phone layout of a form opened from
 * its public link. A desktop card has room for the words as text, and the
 * editor's own preview is not where anybody reads them.
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

const builder = strip('components/FormBuilderModal.tsx');
const page = strip('app/forms/page.tsx');
const migrations = strip('lib/db-migrations.ts');
const fieldsPost = strip('app/api/conference-forms/[id]/fields/route.ts');
const fieldsPut = strip('app/api/conference-forms/[id]/fields/[fieldId]/route.ts');
const publicRead = strip('app/api/public/conference-forms/route.ts');

console.log('\n— the field that carries text instead of collecting it —');
{
  eq('the builder offers it', /\{ value: 'mobile_details', label: 'Mobile Event Details Button' \}/.test(builder), true);
  eq('  with a body rather than a placeholder', /function DetailsBody\(\{ value, onChange \}/.test(builder), true);
  // It asks nothing, so a placeholder, a required flag and a list of options
  // would all be settings for a question it does not pose.
  eq('  and none of the settings a question needs',
    /\{isDetails\(newField\.field_type\) \? \(/.test(builder)
      && /showOptionsFor\(newField\.field_type\) && !isDetails\(newField\.field_type\)/.test(builder), true);
  eq('  editable after the fact, too', /value=\{editDraft\.rich_content \?\? ''\}/.test(builder), true);

  eq('the text has a column of its own', /ALTER TABLE form_fields ADD COLUMN rich_content TEXT/.test(migrations), true);
  eq('  which the insert writes', /rich_content \|\| null/.test(fieldsPost), true);
  eq('  the update writes', /sets\.push\('rich_content = \?'\)/.test(fieldsPut), true);
  eq('  and the public read returns', /rich_content: ef\.rich_content \? String\(ef\.rich_content\) : null/.test(publicRead), true);
}

console.log('\n— where the button appears —');
{
  // A details field is not drawn among the questions.
  eq('it is not rendered as a field', /if \(field\.field_type === 'mobile_details'\) return null;/.test(page), true);
  eq('  and only the first one counts',
    /const detailsField = form\?\.fields\.find\(f => f\.field_type === 'mobile_details' && f\.rich_content\);/.test(page), true);
  // Beside Submit, which gives up its full width for it.
  eq('the button sits beside Submit', /\{!isDesktop && detailsField && \(/.test(page), true);
  eq('  in the same row', /<div className="px-6 pb-6 flex items-center gap-2">/.test(page), true);
  eq('  with Submit taking the rest of it', /className="flex-1 py-3 rounded-xl text-sm font-bold/.test(page), true);
}

console.log('\n— and what it raises —');
{
  /*
   * Inside the card, not over the page: what is being read belongs to the
   * form, so the panel is pinned to the card's own edges and the page around
   * it does not move.
   */
  eq('the panel is pinned to the card', /className="relative my-auto mx-auto w-full max-w-\[480px\]/.test(page), true);
  eq('  and covers it rather than the screen', /className=\{`absolute inset-0 z-20 flex flex-col transition-transform/.test(page), true);
  // Mounted while down, so there is a position to animate from.
  eq('  rising from below rather than appearing',
    /detailsOpen \? 'translate-y-0' : 'translate-y-full pointer-events-none'/.test(page), true);
  /*
   * `inert` is not used: these React types take a boolean, React 18 drops an
   * unknown boolean prop, and inert={true} never reached the DOM — measured.
   * A panel that is only translated away still holds its buttons, so they
   * leave the tab order instead.
   */
  eq('  out of reach while it is down', /tabIndex=\{detailsOpen \? 0 : -1\}/.test(page), true);
  eq('  and hidden from a screen reader', /aria-hidden=\{!detailsOpen\}/.test(page), true);
  // An evening's worth of directions is longer than the form it covers.
  eq('the text scrolls inside the panel', /className="prose prose-sm max-w-none flex-1 overflow-y-auto px-6 py-4"/.test(page), true);
  eq('  and is sanitised, like every other stored HTML here',
    /dangerouslySetInnerHTML=\{\{ __html: sanitizeHtml\(detailsField\.rich_content \?\? ''\) \}\}/.test(page), true);
  eq('there are two ways back', /Back to the form/.test(page) && /aria-label="Close the details"/.test(page), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
