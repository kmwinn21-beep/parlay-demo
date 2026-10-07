/**
 * Reaching an attendee from the meeting card.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/contact-badges.mjs
 *
 * A rep in a conference hall wants to ring the person they are about to meet,
 * not read their number off a record two screens away. Every attendee row on
 * the card carries two slots: a phone badge and an envelope where there is
 * something behind them, a dotted plus where there is not.
 *
 * The link building is RUN, because that is where this breaks: numbers arrive
 * as somebody typed them — "(512) 555-0143", "+1 512 555 0143", "ask Kevin" —
 * and a tel: with brackets in it is not reliably dialled.
 *
 * Driven in Chromium at 390px: filled and dotted slots land per person, the
 * phone badge opens a sheet offering tel:5125550143 and sms:5125550143, Save
 * is refused until the field holds something dialable, saving PATCHes
 * {"phone":"(512) 555-0110"} to /api/attendees/21, and the dotted plus becomes
 * a live badge without a reload.
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

const { telHref, smsHref, mailtoHref, normalizePhone, hasContactDetails } =
  await import('@/lib/contactLinks');

console.log('\n— a number a dialler will take —');
{
  /*
   * The scheme first: tel: dials on iOS and Android. callto: is the old Skype
   * one and does nothing on a phone, which is the kind of thing that looks
   * fine until somebody is standing in a hall tapping it.
   */
  eq('the scheme is tel', telHref('5125550143'), 'tel:5125550143');
  eq('  and sms for a text', smsHref('5125550143'), 'sms:5125550143');

  // Numbers are typed by people, and a tel: with brackets in it is not
  // reliably handled.
  eq('brackets and spaces come out', telHref('(512) 555-0143'), 'tel:5125550143');
  eq('  dots too', normalizePhone('512.555.0143'), '5125550143');
  // The leading + is what makes an international number dial from abroad.
  eq('  but the leading plus stays', normalizePhone('+1 512 555 0143'), '+15125550143');

  // Extensions are a real thing in this data and diallers do understand them.
  eq('an extension survives, in the form tel: defines',
    normalizePhone('512-555-0143 x204'), '5125550143;ext=204');
  eq('  however it was written', normalizePhone('512 555 0143 ext. 204'), '5125550143;ext=204');

  /*
   * A field holding words is not a number. Linking it would draw a badge that
   * dials nothing, which is worse than drawing no badge.
   */
  eq('words are not a number', telHref('ask Kevin'), null);
  eq('  nor is nothing', telHref(''), null);
  eq('  nor whitespace', telHref('   '), null);
  eq('  nor absent', telHref(null), null);
  eq('  nor undefined', telHref(undefined), null);
}

console.log('\n— and an address a mail client will take —');
{
  eq('a plain address', mailtoHref('lee@paradigm.com'), 'mailto:lee@paradigm.com');
  eq('  trimmed', mailtoHref('  lee@paradigm.com '), 'mailto:lee@paradigm.com');
  /*
   * Not validation. The address came out of a CRM field somebody typed, and
   * refusing to link an odd-looking one helps nobody — only the shape that
   * cannot possibly work is rejected.
   */
  eq('something with no @ is not an address', mailtoHref('no-at-sign'), null);
  eq('  and empty is not either', mailtoHref(''), null);
  // A space in an address would otherwise break the URL.
  eq('a space is escaped rather than dropped',
    mailtoHref('lee smith@paradigm.com'), 'mailto:lee%20smith@paradigm.com');
}

console.log('\n— is there anything to reach them with —');
{
  eq('a phone counts', hasContactDetails({ phone: '5125550143' }), true);
  eq('  an email counts', hasContactDetails({ email: 'a@b.com' }), true);
  eq('  neither does not', hasContactDetails({ phone: null, email: null }), false);
  // Junk in the field is the same as nothing: neither can be acted on.
  eq('  and junk is the same as neither',
    hasContactDetails({ phone: 'n/a', email: 'unknown' }), false);
}

console.log('\n— the card draws two slots, always —');
{
  const table = strip('components/MeetingsTable.tsx');

  /*
   * Filled where there is something, dotted where there is not — so the pair
   * is in the same place on every row, and a row with nothing says that
   * nobody has looked rather than saying nothing at all.
   */
  /* The avatar's own size on this card, so the three circles on a row read as
     one set rather than two big ones and a small one. */
  eq('a badge is the size of the avatar beside it',
    /const CONTACT_BADGE =\s*\n\s*'w-6 h-6 rounded-full/.test(table), true);
  eq('  which is what the avatar uses', /className="w-6 h-6 text-\[9px\]/.test(table), true);

  /*
   * And level with it, not 2px above.
   *
   * The primary attendee's row is items-start and drops its avatar by mt-0.5
   * onto the name's line; the guests' rows are items-center and do not. The
   * badges did not match that, so they sat 2px high on the primary rows and
   * level on the guests' — measured, and enough to read as staggered down a
   * card. Measured after: every badge's centre is 0.0px from its avatar's, and
   * the columns stand at 287, 317 and 353 on every row.
   */
  eq('  and sits where that avatar sits', /className=\{`flex items-center gap-1\.5 flex-shrink-0 \$\{className\}`\}/.test(table), true);
  eq('    taking the primary row’s own offset', /onAdd=\{\(person, field\) => setAddContact\(\{ person, field \}\)\}\s*\n\s*className="mt-0\.5"/.test(table), true);

  eq('a filled phone badge opens the sheet', /onPhone\(person\)/.test(table), true);
  eq('  the envelope is a plain mailto', /href=\{mail\}/.test(table), true);
  eq('  and the empty half is a dotted plus',
    /border-dashed border-gray-300 text-gray-400/.test(table), true);
  eq('  drawn for whichever half is missing',
    (table.match(/<AddContactBadge kind="(phone|email)"/g) ?? []).length, 2);

  /*
   * Both rows on the card. A card with badges on the primary attendee and
   * none on the person beside them reads as though the guest had no details
   * rather than as though nobody had looked.
   */
  eq('the primary attendee has them',
    /person=\{withEdits\(\{ id: m\.attendee_id/.test(table), true);
  eq('  and so does every guest', /person=\{withEdits\(\{ id: extra\.id/.test(table), true);
  // The row is itself clickable, so a badge must not also open the card.
  eq('  without the row swallowing the tap',
    /e\.stopPropagation\(\); onPhone\(person\)/.test(table), true);

  /*
   * Call or text, as a sheet — the shape the outcome picker already uses.
   * Anchors, not handlers: the browser owns these schemes.
   */
  eq('the sheet offers both', /href=\{tel\}/.test(table) && /href=\{sms\}/.test(table), true);
  eq('  and portals out of the card',
    /createPortal\([\s\S]{0,2000}z-\[70\][\s\S]{0,3000}document\.body/.test(table), true);
}

console.log('\n— and the missing half can be filled in —');
{
  const table = strip('components/MeetingsTable.tsx');

  // One field, through the endpoint the attendee's own form writes to, so what
  // is typed here lands on their record rather than only on this meeting.
  eq('it saves onto the attendee',
    /fetch\(`\/api\/attendees\/\$\{person\.id\}`, \{\s*\n\s*method: 'PATCH'/.test(table), true);
  eq('  one field at a time', /JSON\.stringify\(\{ \[field\]: trimmed \}\)/.test(table), true);

  /*
   * Save is refused until the value would actually produce a link — the same
   * test the badge applies when deciding to draw itself, so a value that saves
   * is a value that shows.
   */
  eq('nothing unusable can be saved',
    /const usable = field === 'phone' \? telHref\(trimmed\) !== null : mailtoHref\(trimmed\) !== null;/.test(table), true);
  eq('  and the button says so', /disabled=\{!usable \|\| saving\}/.test(table), true);

  /*
   * The meetings arrive as a prop, so a save has nowhere to land until the
   * parent refetches — and the badge just filled in would go back to a dotted
   * plus. Keyed by attendee, because the same person can be on several
   * meetings on screen.
   */
  eq('the badge fills in at once', /const \[contactEdits, setContactEdits\]/.test(table), true);
  eq('  for that person on every meeting shown',
    /\.\.\.\(contactEdits\[p\.id\] \?\? \{\}\)/.test(table), true);
  // A failure must say what happened rather than silently doing nothing.
  eq('  and a failure names itself', /Could not save: \$\{err instanceof Error/.test(table), true);
}

console.log('\n— the data reaches the card —');
{
  const route = strip('app/api/meetings/route.ts');
  const extras = strip('lib/additionalAttendees.ts');
  // Both columns already existed on attendees; neither was being selected.
  eq('the meeting carries both', /a\.email,\s*\n\s*a\.phone,/.test(route), true);
  eq('  and returns them', /phone: r\.phone != null \? String\(r\.phone\) : null,/.test(route), true);
  eq('a guest carries them too', /a\.email, a\.phone, a\.photo_url/.test(extras), true);
  eq('  and the record declares the phone', /phone: string \| null;/.test(extras), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
