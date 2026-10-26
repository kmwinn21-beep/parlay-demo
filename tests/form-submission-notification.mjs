/**
 * Telling the person who built a form that somebody filled it in.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/form-submission-notification.mjs
 *
 * A public form's link goes out to people outside the account, and the
 * submissions land in a tab nobody is watching. The conference already gets a
 * notification — to its internal attendee list, one line, no answers — which
 * is not the same thing as telling the one person who built the form and is
 * waiting on what was said.
 *
 * So: an in-app row and an email addressed to `conference_forms.created_by`,
 * with the form's name and every label/value pair in the email body. Three
 * things have to hold for that to be worth having, and each is asserted here
 * against a real tenant database running the real migrations:
 *
 *   the recipient is the CREATOR, resolved from created_by, not the conference;
 *   the email carries the ANSWERS, not a sentence about there being some;
 *   and it is best-effort — a form with no resolvable creator writes nothing
 *   and raises nothing, because the submission is already saved by then.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';

const dir = mkdtempSync(join(tmpdir(), 'parlay-formnotif-'));
const MASTER_URL = `file:${join(dir, 'master.db')}`;
const TENANT_URL = `file:${join(dir, 'tenant.db')}`;

process.env.TURSO_DATABASE_URL = MASTER_URL;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET ??= 'test-secret-at-least-thirty-two-characters-long';
process.env.NEXT_PUBLIC_BASE_URL = 'https://work.useparlay.app';
// Keeps lib/email.ts in its log-only mode; nothing here may send mail.
delete process.env.SMTP_HOST;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const cleanup = () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };
process.on('exit', cleanup);

const { dbReady, seedFreshDb } = await import('@/lib/db');
await dbReady;

const tenant = createClient({ url: TENANT_URL });
await seedFreshDb(tenant);

const { notifyFormSubmission } = await import('@/lib/notifications');
const { buildFormSubmissionEmailHtml } = await import('@/lib/email');
const { SLACK_EVENTS, OPT_OUT_EVENTS, slackColumn } = await import('@/lib/slack/preferences');

// ── The fixture: a conference, a form, and the person who built it ───────────

const CREATOR_ID = 9101;
const CREATOR_EMAIL = 'kwinn@useparlay.app';
const CONFERENCE_ID = 7001;
const FORM_ID = 8001;
const ORPHAN_FORM_ID = 8002;   // created_by points at nobody
const NULL_FORM_ID = 8003;     // created_by is null

await tenant.execute({
  sql: `INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'x')`,
  args: [CREATOR_ID, CREATOR_EMAIL],
});
await tenant.execute({
  sql: `INSERT INTO conferences (id, name, start_date, end_date, location)
        VALUES (?, 'Senior Living Innovation Forum', '2026-05-04', '2026-05-06', 'Napa, CA')`,
  args: [CONFERENCE_ID],
});
await tenant.execute({
  sql: `INSERT INTO conference_forms (id, conference_id, name, created_by) VALUES (?, ?, 'Happy Hour RSVP', ?)`,
  // Deliberately a different case to the users row: created_by is whatever
  // string the session carried when the form was saved.
  args: [FORM_ID, CONFERENCE_ID, 'KWinn@UseParlay.app'],
});
await tenant.execute({
  sql: `INSERT INTO conference_forms (id, conference_id, name, created_by) VALUES (?, ?, 'Orphan Form', 'gone@elsewhere.test')`,
  args: [ORPHAN_FORM_ID, CONFERENCE_ID],
});
await tenant.execute({
  sql: `INSERT INTO conference_forms (id, conference_id, name) VALUES (?, ?, 'Legacy Form')`,
  args: [NULL_FORM_ID, CONFERENCE_ID],
});

const VALUES = [
  { label: 'Name', value: 'Dana Reyes' },
  { label: 'Company', value: 'MorningStar Senior Living' },
  { label: 'Email Address', value: 'dana@morningstar.test' },
  { label: 'Attending?', value: 'Yes' },
  { label: 'Dietary notes', value: '' },
];

const submit = (formId = FORM_ID) => notifyFormSubmission(tenant, {
  conferenceFormId: formId,
  formName: formId === FORM_ID ? 'Happy Hour RSVP' : 'Other Form',
  conferenceId: CONFERENCE_ID,
  conferenceName: 'Senior Living Innovation Forum',
  submitterName: 'Dana Reyes',
  submitterCompany: 'MorningStar Senior Living',
  values: VALUES,
});

const rows = async () => (await tenant.execute({
  sql: `SELECT * FROM notifications WHERE user_id = ? ORDER BY id`,
  args: [CREATOR_ID],
})).rows;
const reset = () => tenant.execute('DELETE FROM notifications');

// ── Who hears about it ──────────────────────────────────────────────────────

console.log('\n— the creator, not the conference —');
{
  await reset();
  await submit();
  const got = await rows();
  eq('one notification, to the form\'s creator', got.length, 1);
  eq('  which names the form, not the conference', String(got[0]?.record_name), 'Happy Hour RSVP');
  eq('  and says who submitted it',
    String(got[0]?.message), 'Dana Reyes from MorningStar Senior Living submitted your "Happy Hour RSVP" form');
  // The row opens the conference; the email and the DM carry the deeper link.
  eq('  pointing at the conference record', [String(got[0]?.entity_type), Number(got[0]?.entity_id)],
    ['conference', CONFERENCE_ID]);
  eq('  attributed to the public form rather than a user',
    [String(got[0]?.changed_by_email), got[0]?.changed_by_config_id], ['Public Form Submission', null]);
  eq('  and unread', Number(got[0]?.is_read), 0);
}

console.log('\n— a creator who cannot be resolved —');
{
  /*
   * Both of these are ordinary states, not errors: a form built before
   * created_by was recorded, and one built by somebody who has since left the
   * account. The submission itself has already been written by the time this
   * runs, so neither may throw and neither may write a row addressed to
   * nobody.
   */
  await reset();
  await submit(ORPHAN_FORM_ID);
  eq('an address with no user writes nothing', (await rows()).length, 0);
  await submit(NULL_FORM_ID);
  eq('a form with no created_by writes nothing', (await rows()).length, 0);
  await notifyFormSubmission(tenant, {
    conferenceFormId: 999999, formName: 'Nothing', conferenceId: CONFERENCE_ID,
    conferenceName: '', submitterName: 'X', submitterCompany: null, values: [],
  });
  eq('  and a form id that does not exist is silent too', (await rows()).length, 0);
}

console.log('\n— and the switch that turns it off —');
{
  /*
   * Opt-out, unlike the note-engagement events: you published the link, so the
   * submissions are the thing you were waiting for. A row that pre-dates these
   * columns reads as "receives" for the same reason the three oldest events do.
   */
  const cols = (await tenant.execute(`PRAGMA table_info(notification_preferences)`)).rows;
  const byName = new Map(cols.map(c => [String(c.name), c]));
  eq('the in-app column defaults to on',
    [String(byName.get('form_submission_received')?.dflt_value),
     String(byName.get('form_submission_received_email')?.dflt_value)], ['1', '1']);
  eq('  while Slack\'s defaults to off, like every event',
    String(byName.get('form_submission_received_slack')?.dflt_value), '0');
  eq('  and the event is one a user can ask for in Slack',
    SLACK_EVENTS.includes('form_submission_received')
      && OPT_OUT_EVENTS.includes('form_submission_received')
      && byName.has(slackColumn('form_submission_received')), true);

  await reset();
  await tenant.execute({
    sql: `INSERT INTO notification_preferences (user_id, form_submission_received, form_submission_received_email)
          VALUES (?, 0, 0)`,
    args: [CREATOR_ID],
  });
  await submit();
  eq('a creator who switched it off gets no row', (await rows()).length, 0);

  await tenant.execute({
    sql: `UPDATE notification_preferences SET form_submission_received = 1 WHERE user_id = ?`,
    args: [CREATOR_ID],
  });
  await reset();
  await submit();
  eq('  and switching it back on restores it', (await rows()).length, 1);
}

// ── What the email actually says ─────────────────────────────────────────────

console.log('\n— the email carries the answers —');
{
  const html = buildFormSubmissionEmailHtml({
    to: CREATOR_EMAIL,
    formName: 'Happy Hour RSVP',
    conferenceName: 'Senior Living Innovation Forum',
    submitterName: 'Dana Reyes',
    submitterCompany: 'MorningStar Senior Living',
    values: VALUES,
    link: `https://work.useparlay.app/conferences/${CONFERENCE_ID}?tab=forms`,
  });
  eq('the form is named', html.includes('Happy Hour RSVP'), true);
  eq('  and so is the conference', html.includes('Senior Living Innovation Forum'), true);
  eq('  and who filled it in', html.includes('Dana Reyes from MorningStar Senior Living'), true);
  const missing = VALUES.filter(v => !html.includes(v.label) || (v.value && !html.includes(v.value)));
  eq('every submitted label and value appears', missing.map(v => v.label), []);
  // An unanswered optional field is listed with a dash rather than dropped:
  // "they left it blank" is information the reader would otherwise have to
  // infer from an absence.
  eq('  an unanswered field shows as a dash', /Dietary notes[\s\S]{0,200}—/.test(html), true);
  eq('the link goes to the Forms tab, where the submissions are',
    html.includes(`/conferences/${CONFERENCE_ID}?tab=forms`), true);
}

console.log('\n— values are typed by strangers, so they are escaped —');
{
  // A public link: anyone can submit anything, and this body is HTML.
  const html = buildFormSubmissionEmailHtml({
    to: CREATOR_EMAIL,
    formName: '<script>alert(1)</script>',
    conferenceName: '',
    submitterName: 'Mallory "M" <b>',
    submitterCompany: null,
    values: [{ label: '<img src=x onerror=alert(1)>', value: '<script>alert(2)</script>' }],
    link: null,
  });
  eq('no script tag survives', html.includes('<script>'), false);
  eq('  nor an image with a handler', html.includes('<img src=x'), false);
  eq('  and the text is still there, escaped', html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'), true);
  eq('  including a quote in a name', html.includes('Mallory &quot;M&quot;'), true);
}

console.log('\n— the route calls it —');
{
  const { readFileSync } = await import('node:fs');
  const route = readFileSync('app/api/public/form-submissions/route.ts', 'utf8');
  eq('the public submission route notifies the creator', /await notifyFormSubmission\(db, \{/.test(route), true);
  // Both notifications fire: the conference-wide one is not replaced by this.
  eq('  as well as the conference\'s internal attendees',
    /await notifyConferenceInternalAttendees\(db, \{/.test(route), true);
  // The same list the submissions table reads, so the email matches the row.
  eq('  with the values it just stored, name included',
    /values: valuesWithName\.map\(/.test(route), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
