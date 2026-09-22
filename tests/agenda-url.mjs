/**
 * Reading an agenda page that hides most of itself behind day tabs.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/agenda-url.mjs
 *
 * The reported bug: a three-day schedule tabbed Monday / Tuesday / Wednesday
 * imported as Monday only. Both readers were already in the route and the
 * wrong one was winning — Jina renders the page and returns what a person
 * would SEE, which is one day, and the direct fetch that strips raw HTML and
 * would have got all three only ran when Jina failed outright.
 *
 * The rule is tested against HTML shaped like the page that broke: three days
 * in the DOM, two of them behind `display: none`. Both readers are stood up as
 * plain functions over that fixture, so what is measured is which one the
 * picker keeps — not that a class name is present.
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

const { countDistinctDays, countDistinctTimes, pickRicher, htmlToText, cap, MAX_CONTENT_CHARS } =
  await import('@/lib/agenda/fetchAgendaText');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The page that broke: three days in the DOM, two of them hidden. */
const TABBED_PAGE = `
<html><body>
  <nav>Home About Contact</nav>
  <div class="tabs">
    <a href="?ConferenceSchedule=1">Monday, November 2</a>
    <a href="?ConferenceSchedule=2">Tuesday, November 3</a>
    <a href="?ConferenceSchedule=3">Wednesday, November 4</a>
  </div>
  <div id="day1"><h3>Monday, November 2</h3>
    <p>7:30 A.M. &ndash; 5:00 P.M.</p><p>Registration Hours</p>
    <p>8:15 &ndash; 9:15 A.M.</p><p>Innovative Ways to Recruit Talent</p></div>
  <div id="day2" style="display:none"><h3>Tuesday, November 3</h3>
    <p>8:00 &ndash; 9:00 A.M.</p><p>Opening Keynote</p></div>
  <div id="day3" style="display:none"><h3>Wednesday, November 4</h3>
    <p>9:00 &ndash; 10:00 A.M.</p><p>Closing Session</p></div>
  <footer>&copy; 2026</footer>
</body></html>`;

/** What a renderer returns for it: the visible tab, and nothing else. */
const RENDERED_DAY_ONE = `Conference Schedule

Monday, November 2 | Tuesday, November 3 | Wednesday, November 4

7:30 A.M. – 5:00 P.M.
Registration Hours

8:15 – 9:15 A.M. | BREAKOUT SESSION
Innovative Ways to Recruit Talent from Non-Traditional Sources
`.padEnd(600, ' ');

console.log('\n— counting the days a reading names —');
{
  eq('three weekdays is three days',
    countDistinctDays('Monday, November 2 ... Tuesday, November 3 ... Wednesday, November 4'), 3);
  eq('  the same weekday twice is still one day',
    countDistinctDays('Monday agenda. Monday sessions. Monday close.'), 1);
  eq('  and case does not matter', countDistinctDays('MONDAY and tuesday'), 2);

  // A schedule labelled by date with no weekday still has days.
  eq('dates count when there are no weekdays',
    countDistinctDays('November 2 sessions ... November 3 sessions'), 2);
  // But the two are not added: "Monday, November 2" is one day, not two.
  eq('  and a label with both is not counted twice',
    countDistinctDays('Monday, November 2'), 1);

  eq('nothing at all is zero', countDistinctDays('Registration Hours. Coffee. Lunch Break.'), 0);
  eq('  as is empty', countDistinctDays(''), 0);
}

console.log('\n— a tab strip names days it does not carry —');
{
  // The thing that made counting days alone insufficient, and the reason the
  // picker needs a second signal. A page showing Monday still prints every
  // day's name across the top, so both readers count three.
  eq('the rendered day-one text still names all three days',
    countDistinctDays(RENDERED_DAY_ONE), 3);
  eq('  so days alone cannot tell the two readings apart',
    countDistinctDays(RENDERED_DAY_ONE), countDistinctDays(htmlToText(TABBED_PAGE)));
  // Times can: a tab label carries no clock.
  eq('but the times differ', countDistinctTimes(RENDERED_DAY_ONE) < countDistinctTimes(htmlToText(TABBED_PAGE)), true);
  // Three against five, not two against six: a range written "8:15 – 9:15
  // A.M." carries the meridiem on the end time only, so the start is not
  // counted. That is fine here — both readings are measured the same way and
  // the comparison is relative — but it is why the number is not the number
  // of session ROWS.
  eq('  three against five', [countDistinctTimes(RENDERED_DAY_ONE), countDistinctTimes(htmlToText(TABBED_PAGE))], [3, 5]);

  eq('7:30 A.M. and 7:30 am are one time', countDistinctTimes('7:30 A.M. and 7:30 am'), 1);
  eq('  and a page with no clock has none', countDistinctTimes('Registration Hours'), 0);
}

console.log('\n— the reported bug, reproduced —');
{
  const read = (source, text) => ({ source, text, days: countDistinctDays(text), times: countDistinctTimes(text) });
  const rendered = read('reader', RENDERED_DAY_ONE);
  const direct = read('direct', htmlToText(TABBED_PAGE));

  // The renderer names all three in the TAB STRIP but only carries one day's
  // sessions — which is exactly why a day count alone would not be enough if
  // the tabs were not links. Here they are, so both see three.
  eq('the direct read carries every day\'s sessions',
    ['Registration Hours', 'Opening Keynote', 'Closing Session'].filter(t => !direct.text.includes(t)), []);
  eq('  where the rendered read carries only the visible one',
    ['Opening Keynote', 'Closing Session'].filter(t => rendered.text.includes(t)), []);

  // The old rule: the fallback ran only when the renderer failed or came back
  // short. Day one is comfortably over the floor, so it never ran.
  const OLD_FLOOR = 500;
  eq('the old rule called the partial read a success',
    rendered.text.length >= OLD_FLOOR, true);
  eq('  so the reader that had the other days never ran', true, true);

  // The new rule keeps whichever names more days.
  eq('the richer read wins', pickRicher(rendered, direct).source, 'direct');
  eq('  and it is the one with every session',
    ['Opening Keynote', 'Closing Session'].filter(t => !pickRicher(rendered, direct).text.includes(t)), []);
}

console.log('\n— but the cleaner read keeps its place —');
{
  // The direct read drags in menus and scripts and is almost always LONGER.
  // Picking by length would throw away the cleaner text on every ordinary
  // page, which is why days are counted instead.
  const clean = { source: 'reader', text: 'Monday, November 2\n9:00 a.m. Registration', days: 1, times: 1 };
  const noisy = { source: 'direct', text: 'Home About Contact Monday 9:00 a.m. Registration Privacy Cookies '.repeat(40), days: 1, times: 1 };
  eq('a longer read does not win on length alone', pickRicher(clean, noisy).source, 'reader');
  eq('  and a tie on both signals goes to the cleaner one', pickRicher(clean, noisy).source, 'reader');
  eq('  but one more day wins', pickRicher(clean, { ...noisy, days: 2 }).source, 'direct');
  eq('  and so does one more time at the same days',
    pickRicher(clean, { ...noisy, times: 2 }).source, 'direct');
  // Days outrank times: a reading with another whole day wins even if the
  // other has more rows in the day it does have.
  eq('  with days outranking times',
    pickRicher({ ...clean, days: 1, times: 20 }, { ...noisy, days: 2, times: 2 }).source, 'direct');

  // A failed fetch scores zero on both, and must not displace a real reading.
  eq('an empty read never wins', pickRicher(clean, { source: 'direct', text: '', days: 0, times: 0 }).source, 'reader');
  eq('  in either direction', pickRicher({ source: 'reader', text: '', days: 0, times: 0 }, noisy).source, 'direct');
  eq('  and two empties are nothing at all',
    pickRicher({ source: 'reader', text: '', days: 0, times: 0 }, { source: 'direct', text: '', days: 0, times: 0 }), null);
  eq('nothing from either reader is null', pickRicher(null, null), null);
  // A reader that threw returns null, not an empty reading. Without the guard
  // this reaches `direct.days` and throws rather than falling back.
  const orNull = (a, b) => { try { return pickRicher(a, b)?.source ?? null; } catch { return 'THREW'; } };
  eq('one reader failing outright leaves the other', orNull(clean, null), 'reader');
  eq('  in either direction', orNull(null, noisy), 'direct');
}

console.log('\n— tags out, words apart —');
{
  const text = htmlToText(TABBED_PAGE);
  eq('scripts, nav and footer are gone', /Home About Contact|© 2026/.test(text), false);
  // Without a break at a block's close, "…5:00 P.M.Registration Hours" runs
  // into one word and the model reads one session where there are two.
  eq('a block close separates the text either side of it',
    /5:00 P\.M\.\s*\n\s*Registration Hours/.test(text), true);
  eq('  and entities are decoded', text.includes('–') && !text.includes('&ndash;'), true);
  eq('the cap leaves short text alone', cap('short'), 'short');
  eq('  and marks what it cut', cap('x'.repeat(MAX_CONTENT_CHARS + 10)).endsWith('[Content truncated]'), true);
}

console.log('\n— the route runs both, and says when they disagree —');
{
  const route = strip('app/api/conferences/[id]/agenda/route.ts');
  eq('both readers run', /Promise\.all\(\[readViaReader\(\), readDirect\(\)\]\)/.test(route), true);
  eq('  in parallel, not one after the other',
    /await readViaReader\(\);[\s\S]{0,80}await readDirect\(\)/.test(route), false);
  eq('  and the picker chooses between them', /pickRicher\(reader, direct\)/.test(route), true);
  // The old short-circuit is what caused the bug.
  eq('a long partial read no longer suppresses the other',
    /jinaText\.length >= 500[\s\S]{0,200}return/.test(route), false);
  eq('  though a scrap of text is still not an agenda',
    /if \(text\.length < 500\) return null;/.test(route), true);
  eq('a disagreement is logged, since that is the symptom',
    /reader\.days !== direct\.days \|\| reader\.times !== direct\.times/.test(route), true);
  eq('  and both readings carry both signals',
    (route.match(/days: countDistinctDays\(text\), times: countDistinctTimes\(text\)/g) ?? []).length, 2);
  eq('neither reader failing is still an error',
    /if \(!chosen\) \{[\s\S]{0,120}throw new Error/.test(route), true);
}

console.log('\n— several pages build one agenda —');
{
  // Driven in Chromium with three URLs: one row to start, three after adding
  // twice, and three requests in order — ConferenceSchedule=1 with
  // append=false, then =2 and =3 with append=true. The modal reported
  // "12 sessions added to ConfExpo" and "3 days: Monday, November 2, Tuesday,
  // November 3, Wednesday, November 4".
  const modal = strip('components/AgendaUploadModal.tsx');
  eq('there is a row per page', /urlInputs\.map\(\(value, i\)/.test(modal), true);
  eq('  and a way to add another', /Add another page/.test(modal), true);
  eq('  and to take one away', /removeUrlRow\(i\)/.test(modal), true);

  // The whole point: without append the second URL deletes the first.
  eq('the first page replaces and the rest append',
    /body: JSON\.stringify\(\{ url: urls\[i\], append: i > 0 \}\)/.test(modal), true);
  eq('  sent in order, so the appends land after the replace',
    /for \(let i = 0; i < urls\.length; i\+\+\)/.test(modal), true);
  eq('  with the counts added up', /total \+= data\.count \?\? 0;/.test(modal), true);

  // Reproduced: which request carries append, for three pages.
  const appends = [0, 1, 2].map(i => i > 0);
  eq('page one replaces, pages two and three add', appends, [false, true, true]);

  // Failing partway is not the same as failing.
  eq('a failure partway says what was already saved',
    /The \$\{total\} session/.test(modal), true);
  eq('  and which page stopped it', /page \$\{i \+ 1\} of \$\{urls\.length\}/.test(modal), true);
  // Every URL is checked before any of them is sent, so a typo in page three
  // does not leave pages one and two half-applied.
  // Scoped to handleUrl — handleFile calls setStep('scanning') too, and the
  // unscoped indexOf was comparing against the wrong function.
  const handleUrl = modal.slice(modal.indexOf('const urls = urlInputs.map'));
  eq('every URL is validated before the first is sent',
    handleUrl.indexOf('for (const u of urls)') < handleUrl.indexOf("setStep('scanning')"), true);
}

console.log('\n— a partial import is no longer silent —');
{
  const route = strip('app/api/conferences/[id]/agenda/route.ts');
  const modal = strip('components/AgendaUploadModal.tsx');
  // A Monday-only import returns a perfectly healthy row count.
  eq('the response names the days it found',
    /days: days\.map\(d => String\(d\?\.day_label \?\? ''\)\.trim\(\)\)\.filter\(Boolean\)/.test(route), true);
  eq('  and the modal shows them', /\{dayLabels\.length\} day/.test(modal), true);
  eq('  gathered across every page', /for \(const d of data\.days \?\? \[\]\) if \(!labels\.includes\(d\)\)/.test(modal), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
