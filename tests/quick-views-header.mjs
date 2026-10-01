/**
 * The Quick Views card's header.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/quick-views-header.mjs
 *
 * Attendees / Agenda / Meetings was the one panel on the dashboard with no
 * name on it. The header it gained has to read as the same furniture as the
 * cards around it rather than as its own thing — so what is pinned here is
 * that it uses the SAME classes as Floor Notes, not that it uses some
 * particular set of them.
 *
 * The computed result was measured in Chromium against Floor Notes beside it:
 * DM Serif Display, 600, 18px, rgb(34,58,94) for the title and
 * rgb(58,80,107) for the icon, identical on both. These assertions are what
 * keeps the two in step after that.
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

const card = strip('components/DashboardActionCard.tsx');
const floor = strip('components/QuickNotesSection.tsx');

console.log('\n— it wears the same header as the cards around it —');
{
  /*
   * Read off Floor Notes rather than written out again. A literal copy of the
   * classes here would pass while the two drifted apart, which is the one
   * thing this is for.
   */
  const floorTitle = /<span className="([^"]*font-serif[^"]*)">Floor Notes<\/span>/.exec(floor);
  eq('Floor Notes’ title classes were found', floorTitle !== null, true);
  const want = new Set((floorTitle?.[1] ?? '').split(/\s+/).filter(c =>
    /^(text-lg|font-semibold|text-brand-primary|font-serif)$/.test(c)));
  eq('  it is the four that describe the type',
    Array.from(want).sort(), ['font-semibold', 'font-serif', 'text-brand-primary', 'text-lg']);

  const quickTitle = /<span className="([^"]*)">Quick Views<\/span>/.exec(card);
  eq('Quick Views has a title', quickTitle !== null, true);
  const have = new Set((quickTitle?.[1] ?? '').split(/\s+/));
  eq('  carrying every one of them',
    Array.from(want).filter(c => !have.has(c)), []);

  // The icon's colour, likewise taken from Floor Notes rather than restated.
  const floorIcon = /<svg className="w-5 h-5 (text-[a-z-]+) flex-shrink-0"/.exec(floor);
  eq('Floor Notes’ icon colour was found', floorIcon?.[1], 'text-brand-secondary');
  eq('  and the Quick Views icon matches it',
    new RegExp(`className="w-5 h-5 ${floorIcon?.[1]} flex-shrink-0"`).test(card), true);
}

console.log('\n— the icon is the supplied artwork —');
{
  /*
   * Filled at its own 32px viewBox, unlike the stroked 24px icons elsewhere.
   * Reproducing it as a stroked path would be a different drawing.
   */
  eq('drawn at the viewBox it was given',
    /viewBox="0 0 32 32" fill="currentColor"/.test(card), true);
  // Both halves: the panel-with-chevron, and the outer rounded rectangle.
  // One without the other is half an icon that still renders.
  eq('  the chevron and divider path', card.includes('M18.14 22c-.29 0-.58-.11-.81-.33'), true);
  eq('  and the surrounding panel', card.includes('M28.43 27.71H3.29c-1.89 0-3.43-1.54-3.43-3.43'), true);
  // Decorative: the heading beside it already names the card.
  eq('  hidden from assistive tech', /viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"/.test(card), true);
}

console.log('\n— and a pill says which conference —');
{
  eq('the pill reads the active conference',
    /<span className="truncate">\{activeConference\.name\}<\/span>/.test(card), true);
  eq('  drawn only when one is set', /\{activeConference && \(/.test(card), true);
  /*
   * Desktop only. The phone has the conference BUTTON immediately below this,
   * saying the same name and able to change it, so a pill beside the title
   * would be the second copy of one fact on the smaller screen.
   */
  eq('  desktop only, beside the mobile conference button',
    /hidden lg:inline-flex[^"]*rounded-full bg-green-50/.test(card), true);
  eq('    which is still there on a phone',
    /<div className="lg:hidden mb-3">\s*\n\s*<SetConferenceButton \/>/.test(card), true);

  // The tiles still fill what the header leaves, rather than the header
  // pushing them off the bottom of a fixed-height card.
  eq('the tiles take the remaining height',
    /<div className="flex flex-row gap-1 flex-1 items-center">/.test(card), true);
  eq('  and the card no longer centres everything as one block',
    /card h-full flex flex-col justify-center/.test(card), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
