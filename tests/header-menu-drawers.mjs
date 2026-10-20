/**
 * The header's four menus, as drawers on a phone.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/header-menu-drawers.mjs
 *
 * Go To, Add New, Outstanding Follow Ups and Notifications are dropdowns
 * anchored to their icon: a panel 224 to 288px wide, pinned to a corner,
 * holding a list that runs to forty conferences or a hundred follow-ups. On a
 * phone that is a column a third of the screen wide, scrolling inside a
 * scrolling page, with rows too small to hit and — on notifications — an
 * action that only appears on hover, which a finger cannot do.
 *
 * Below sm each opens the same sheet instead. What is checked here: that one
 * component draws all four, that each menu's list is written ONCE and drawn by
 * both the dropdown and the drawer (the way the two can never drift), and the
 * handful of rules the drawer has to keep — where it stops, what the scrim
 * covers, and the things a finger has to be able to reach.
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

const drawer = strip('components/MobileMenuDrawer.tsx');
const header = strip('components/Header.tsx');
const follow = strip('components/OutstandingFollowUps.tsx');
const bell = strip('components/NotificationBell.tsx');

console.log('\n— the sheet the four of them share —');
{
  eq('it is a phone’s, and only a phone’s', /className="sm:hidden fixed inset-0 z-\[180\]/.test(drawer), true);
  // The same measure every other phone drawer in the app stops at.
  eq('  capped at the header’s bottom edge', /className="drawer-mobile-responsive pointer-events-auto relative/.test(drawer), true);
  eq('  a portal, so no menu’s corner can clip it', /createPortal\(/.test(drawer), true);

  /*
   * The frame lets taps through and the two things inside it take them back:
   * the strip where the app header is has to stay live, or the only way from
   * one menu to another is to close this one first — and tapping the icon you
   * can plainly see is what anyone does next.
   */
  eq('the header stays live behind it', /flex items-end pointer-events-none/.test(drawer), true);
  eq('  and undimmed: the scrim starts below it',
    /className="absolute inset-x-0 bottom-0 bg-black\/40 pointer-events-auto"\n\s*style=\{\{ top: 'var\(--mobile-header-h\)' \}\}/.test(drawer), true);
  eq('  the scrim closes it', /onClick=\{onClose\}\n\s*aria-hidden/.test(drawer), true);
  eq('  and so does Escape', /if \(e\.key === 'Escape'\) onClose\(\);/.test(drawer), true);

  eq('it says what it is', /role="dialog"/.test(drawer) && /aria-label=\{title\}/.test(drawer), true);
  eq('  and has a way out that is 36px square',
    /aria-label="Close"[\s\S]{0,120}w-9 h-9/.test(drawer), true);

  // A group heading that pins while its own group runs under it, as the
  // calendar's days do.
  eq('its sections can pin', /\$\{sticky \? 'sticky top-0 z-10' : ''\}/.test(drawer), true);
}

console.log('\n— each menu, written once and drawn twice —');
{
  /*
   * The point of the exercise. Eight all-but-identical blocks of markup became
   * one list; the conference list and the two feeds became one variable each.
   * A menu whose two forms are written out twice is a menu that will disagree
   * with itself within a month.
   */
  eq('Add New is a list, not eight copies', /const ADD_NEW_ITEMS: Array<\{/.test(header), true);
  eq('  drawn by the panel', /\{ADD_NEW_ITEMS\.map\(item => \{/.test(header), true);
  eq('  and by the drawer', /\{ADD_NEW_ITEMS\.filter\(i => i\.group === group\)\.map\(item => \{/.test(header), true);
  // The drawer has width for the line that says what each one is for.
  eq('  where each one says what it is for', /hint: 'Brief or informal attendee interaction\(s\)'/.test(header), true);
  eq('  and they split where the day splits',
    /label=\{group === 'there' \? 'While you are there' : 'Back at the desk'\}/.test(header), true);

  eq('the conference list is one function', /const conferenceList = \(mobile: boolean\) => \{/.test(header), true);
  eq('  called by both', (header.match(/conferenceList\((true|false)\)/g) ?? []).length, 2);
  // What somebody standing in the hall opens the list to confirm.
  eq('  and the running one says which day it is on',
    /On now\{conferenceDayOf\(conf, today\)\}/.test(header), true);

  eq('the follow-ups list is one variable', /const menuBody = \(/.test(follow), true);
  eq('  drawn by both', (follow.match(/\{menuBody\}/g) ?? []).length, 2);
  eq('the notifications list is one variable', /const listRows = \(/.test(bell), true);
  eq('  drawn by both', (bell.match(/\{listRows\}/g) ?? []).length, 2);
}

console.log('\n— and the things a finger has to reach —');
{
  /*
   * Reported by anyone who has tried it: the tick that marks a notification
   * read is opacity-0 until hover, and a touch screen has no hover — so on a
   * phone the control is not merely small, it is not there.
   */
  eq('the mark-read tick is there without a pointer',
    /sm:opacity-0 sm:group-hover:opacity-100/.test(bell), true);
  eq('  and is a 32px target', /p-2 sm:p-1 rounded hover:bg-gray-200/.test(bell), true);
  // Done and delete sat at 26px and 24px inside a 384px panel.
  eq('Done is a 34px target below sm', /px-3\.5 py-2 sm:px-2\.5 sm:py-1 text-xs font-medium border/.test(follow), true);
  eq('  and so is delete', /p-2 sm:p-1 text-red-400/.test(follow), true);

  // Above sm every one of them is the dropdown it always was.
  eq('a desktop keeps its dropdowns', [
    /\{showAddNew && !isPhone && \(/.test(header),
    /\{showConferences && !isPhone && \(/.test(header),
    /\{open && mounted && !isPhone && createPortal\(/.test(follow),
    /\{open && !isPhone && \(/.test(bell),
  ], [true, true, true, true]);
  // And a CSS guard besides, for the frame before isPhone has measured.
  eq('  hidden below sm either way', [
    /className="hidden sm:block absolute right-0 top-full mt-1 w-56/.test(header),
    /className="hidden sm:block absolute right-0 top-full mt-1 w-72/.test(header),
    /className="hidden sm:flex bg-white border border-gray-200 rounded-2xl/.test(follow),
    /className="hidden sm:block absolute right-0 top-full mt-2 w-96/.test(bell),
  ], [true, true, true, true]);
  eq('  and the phone gets the drawer instead', [
    /\{showAddNew && isPhone && \(/.test(header),
    /\{showConferences && isPhone && \(/.test(header),
    /\{open && isPhone && \(/.test(follow),
    /\{open && isPhone && \(/.test(bell),
  ], [true, true, true, true]);
}

console.log('\n— a tap inside the drawer is not a tap outside the menu —');
{
  /*
   * Reported: every control in every one of the four drawers did nothing but
   * dismiss it, and a follow-up group closed the drawer instead of opening.
   *
   * Each menu closes on a mousedown outside its own element, which is right
   * for a dropdown and wrong the moment the same menu is drawn in a PORTAL:
   * the drawer is a child of <body>, so `ref.contains` called every tap
   * inside it an outside one. The menu shut on mousedown and the button under
   * the finger never saw its click.
   */
  eq('the three handlers ask whether the drawer owns the tap', [
    /if \(isInsideMobileMenuDrawer\(e\.target\)\) return;/.test(header),
    /if \(isInsideMobileMenuDrawer\(e\.target\)\) return;/.test(follow),
    /if \(isInsideMobileMenuDrawer\(e\.target\)\) return;/.test(bell),
  ], [true, true, true]);
  eq('  and the question is asked of the drawer, once',
    /export function isInsideMobileMenuDrawer\(target: EventTarget \| null\): boolean \{/.test(drawer), true);
  eq('  by the mark the sheet carries', /closest\('\[data-mobile-menu-drawer\]'\)/.test(drawer), true);
  // The scrim is a SIBLING of the sheet, not inside it, so it still closes.
  eq('  while the scrim stays outside it',
    drawer.indexOf('bg-black/40') < drawer.indexOf('data-mobile-menu-drawer'), true);
}

console.log('\n— which day of the conference it is —');
{
  // Read off the dates rather than counted by hand, and silent where the
  // dates cannot answer: a one-day conference needs no counting out, and a
  // bad pair should go quiet rather than print "day -3 of 0".
  const src = readFileSync('components/Header.tsx', 'utf8');
  eq('it is computed from the dates', /function conferenceDayOf\(/.test(src), true);
  eq('  and says nothing for a single day', /if \(span < 2 \|\| which < 1 \|\| which > span\) return '';/.test(src), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
