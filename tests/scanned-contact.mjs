/**
 * What a scanned card contributes to an attendee's record.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/scanned-contact.mjs
 *
 * A scan that captured a phone number and an email threw both away the moment
 * it was matched to an attendee who already existed — which is the common case,
 * and the one where the details are most likely to be what was missing.
 *
 * The merge rules are BEHAVIOUR and are run here. Where they are called from is
 * structure, read off the routes, because there are two scan paths (match an
 * existing attendee, add a new one) and only one of them was carrying the
 * details at all.
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

const { cleanScannedEmail, cleanScannedPhone, contactFillFor } =
  await import('@/lib/scannedContact');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n— an address a camera read —');
{
  eq('an ordinary one comes through', cleanScannedEmail('Kevin@Teton.com'), 'kevin@teton.com');
  eq('  trimmed', cleanScannedEmail('  kevin@teton.com  '), 'kevin@teton.com');
  eq('  and lowercased, so the match path finds it later',
    cleanScannedEmail('KEVIN@TETON.COM'), 'kevin@teton.com');
  eq('  subdomains are fine', cleanScannedEmail('k@mail.teton.co.uk'), 'k@mail.teton.co.uk');
  eq('  and a plus address', cleanScannedEmail('k+alis@teton.com'), 'k+alis@teton.com');

  // The things OCR actually produces on a business card. A blank field beats a
  // wrong one, because the wrong one gets written to.
  eq('a website is not an address', cleanScannedEmail('www.teton.com'), null);
  eq('  nor is a bare handle', cleanScannedEmail('kevinwinn'), null);
  eq('  nor a line that lost its @ to a fold', cleanScannedEmail('kevin teton.com'), null);
  eq('  nor one with a space in it', cleanScannedEmail('kevin @teton.com'), null);
  eq('  nor two @s', cleanScannedEmail('kevin@@teton.com'), null);
  eq('  nor an @ with nothing before it', cleanScannedEmail('@teton.com'), null);
  eq('  nor a domain with no dot', cleanScannedEmail('kevin@teton'), null);
  eq('  nor a domain ending in one', cleanScannedEmail('kevin@teton.'), null);
  eq('  nor a domain starting with one', cleanScannedEmail('kevin@.com'), null);
  eq('nothing scanned is nothing stored', cleanScannedEmail(''), null);
  eq('  including whitespace', cleanScannedEmail('   '), null);
  eq('  and undefined', cleanScannedEmail(undefined), null);
}

console.log('\n— a number a camera read —');
{
  // Kept as written. Somebody will read it back off the screen, and imposing a
  // format here would mangle the extension and every number outside the US.
  eq('a US number keeps its formatting', cleanScannedPhone('(555) 123-4567'), '(555) 123-4567');
  eq('  an extension survives', cleanScannedPhone('(555) 123-4567 x24'), '(555) 123-4567 x24');
  eq('  and an international number', cleanScannedPhone('+44 20 7946 0958'), '+44 20 7946 0958');
  eq('  trimmed only', cleanScannedPhone('  555.123.4567  '), '555.123.4567');

  // A booth number is not a phone number, and both are printed on cards.
  eq('a booth number is not a phone number', cleanScannedPhone('Booth 412'), null);
  eq('  nor is a room number', cleanScannedPhone('Suite 300'), null);
  eq('  seven digits is the shortest real one', cleanScannedPhone('123-4567'), '123-4567');
  eq('  six is not', cleanScannedPhone('12-3456'), null);
  eq('  fifteen digits is E.164\'s ceiling', cleanScannedPhone('+123456789012345'), '+123456789012345');
  eq('  sixteen is two numbers run together', cleanScannedPhone('+1234567890123456'), null);
  eq('nothing scanned is nothing stored', cleanScannedPhone(''), null);
  eq('  including null', cleanScannedPhone(null), null);
}

console.log('\n— what the scan adds to somebody who already exists —');
{
  // The whole point: blanks get filled.
  eq('a blank record takes both',
    contactFillFor({ email: null, phone: null }, { email: 'k@teton.com', phone: '555-123-4567' }),
    { email: 'k@teton.com', phone: '555-123-4567', filled: ['email', 'phone'] });
  eq('  and reports what it filled',
    contactFillFor({}, { email: 'k@teton.com' }).filled, ['email']);
  eq('  one field at a time',
    contactFillFor({ email: 'old@teton.com' }, { email: 'k@teton.com', phone: '555-123-4567' }).filled,
    ['phone']);

  // An address somebody recorded beats one a camera read. The difference
  // between the two is usually a personal address against a work one, or a job
  // change — neither of which a scan should decide silently.
  eq('an existing email is never replaced',
    contactFillFor({ email: 'old@teton.com' }, { email: 'new@teton.com' }).email, null);
  eq('  nor an existing phone',
    contactFillFor({ phone: '555-000-0000' }, { phone: '555-123-4567' }).phone, null);
  eq('  and nothing is reported as filled',
    contactFillFor({ email: 'old@teton.com', phone: '555-000-0000' },
                   { email: 'new@teton.com', phone: '555-123-4567' }).filled, []);

  // An empty string in the column is a blank, not a value. Rows written by
  // older forms have them.
  eq('an empty string counts as blank',
    contactFillFor({ email: '', phone: '   ' }, { email: 'k@teton.com', phone: '555-123-4567' }).filled,
    ['email', 'phone']);

  // Junk never reaches the record, whether or not there is room for it.
  eq('a website does not fill an empty email',
    contactFillFor({}, { email: 'www.teton.com' }).filled, []);
  eq('  and a booth number does not fill an empty phone',
    contactFillFor({}, { phone: 'Booth 412' }).filled, []);
  eq('nothing scanned changes nothing', contactFillFor({}, {}).filled, []);
}

console.log('\n— both scan paths carry the details —');
{
  const confirm = strip('app/api/card-scan/confirm/route.ts');
  const addNew = strip('app/api/card-scan/add-new/route.ts');
  const modal = strip('components/BatchCardScanModal.tsx');

  // Matching an existing attendee took only the ids. The card's email and
  // phone were read, shown, and then dropped.
  eq('the match path accepts the card\'s details',
    /const \{ attendee_id, conference_id, email, phone \} = await request\.json\(\)/.test(confirm), true);
  eq('  and merges rather than overwrites',
    /contactFillFor\(row, \{ email, phone \}\)/.test(confirm), true);
  // COALESCE on the argument, not the column: a null argument leaves the
  // column alone, so one statement covers either field or both.
  eq('  writing only what it decided to write',
    /SET email = COALESCE\(\?, email\), phone = COALESCE\(\?, phone\)/.test(confirm), true);
  eq('  and reporting it back', /filled,/.test(confirm), true);

  // phone was in the body type and never destructured, so it reached this
  // route and went no further.
  eq('the add path no longer drops the phone',
    /const \{ first_name, last_name, title, email, phone, company_name, conference_id \} = body;/.test(addNew), true);
  eq('  and stores it', /INSERT INTO attendees \(first_name, last_name, title, company_id, email, phone\)/.test(addNew), true);
  eq('  through the same sanity check',
    /cleanScannedEmail\(email\),\s*\n\s*cleanScannedPhone\(phone\),/.test(addNew), true);

  // The client has to send them or none of the above runs.
  const confirmCall = modal.slice(modal.indexOf("'/api/card-scan/confirm'"), modal.indexOf("} else if (type === 'add')"));
  eq('the modal sends the card\'s email on a match',
    /email: card\.draft\.email \|\| undefined,/.test(confirmCall), true);
  eq('  and its phone', /phone: card\.draft\.phone \|\| undefined,/.test(confirmCall), true);
  const addCall = modal.slice(modal.indexOf("'/api/card-scan/add-new'"));
  eq('  and the phone when adding somebody new',
    /phone: card\.addDraft\.phone \|\| undefined,/.test(addCall), true);

  // Silence reads as the details having been dropped, which is what used to
  // happen — so the confirmation names them.
  eq('the reader is told what was added',
    /toast\.success\(`Added \$\{filled\.join\(' and '\)\} to their record`\)/.test(modal), true);

  // A scanned phone is saved now, so it must be visible and correctable first.
  eq('the add form has a phone field',
    /value=\{card\.addDraft\.phone\}/.test(modal) && /onAddFormChange\('phone', e\.target\.value\)/.test(modal), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
