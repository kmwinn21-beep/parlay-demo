/**
 * Copying a social event's public form link from the event itself.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/social-event-form-link.mjs
 *
 * A form can be tied to a social event — it is what collects the RSVPs — and
 * once a public link has been generated for it, that link is what gets pasted
 * into an invitation. Finding it meant leaving the Social tab for the Forms
 * tab, opening the right form's link panel and copying from there, which is
 * three steps away from the event the link is for.
 *
 * So the event's own action menu offers it, and the kebab wears a green dot
 * so a closed menu still says the link exists. Both hang off the same thing:
 * a token from the API, returned only for a form that is BOTH linked to the
 * event and published. No form, or a form nobody has generated a link for,
 * and there is nothing to copy — those must look identical, because they are.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-sevform-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
delete process.env.CLERK_SECRET_KEY;
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

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

// ── The address itself ───────────────────────────────────────────────────────

console.log('\n— the link —');
{
  // Browser-only: it reads the origin off `window`, which is why it is built
  // in the client and only the token travels from the server.
  globalThis.window = { location: { origin: 'https://work.useparlay.app' } };
  const { publicFormUrl } = await import('@/lib/publicFormUrl');

  eq('carries the token and the account',
    publicFormUrl('tok-abc', 'acct-teton'),
    'https://work.useparlay.app/forms?token=tok-abc&aid=acct-teton');
  // A single-account installation has no account row; 'master' is the id the
  // forms page reads as "the master database".
  eq('  falling back to master where there is no account',
    publicFormUrl('tok-abc', null), 'https://work.useparlay.app/forms?token=tok-abc&aid=master');
  eq('and is empty without a token', publicFormUrl(null, 'acct-teton'), '');
  eq('  or with an empty one', publicFormUrl('', 'acct-teton'), '');
  delete globalThis.window;
}

console.log('\n— one definition of it —');
{
  /*
   * Two places hand out this link now. A second hand-written copy of its
   * shape is a link that works until one of them is changed.
   */
  const formsTab = strip('components/ConferenceFormsTab.tsx');
  const table = strip('components/SocialEventsTable.tsx');
  eq('the forms tab builds it through the helper',
    /from '@\/lib\/publicFormUrl'/.test(formsTab), true);
  eq('  and no longer assembles its own', /\/forms\?token=\$\{/.test(formsTab), false);
  eq('the social events table uses the same one',
    /from '@\/lib\/publicFormUrl'/.test(table) && /\/forms\?token=\$\{/.test(table) === false, true);
}

// ── What the API says there is to copy ───────────────────────────────────────

const { createClient } = await import('@libsql/client');
const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

const ACCOUNT = 'acct-sev';
const tenantUrl = `file:${join(dir, 'tenant.db')}`;
const tenant = createClient({ url: tenantUrl });
await seedFreshDb(tenant);
await db.execute({
  sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
        VALUES (?, 'Sev Co', 'a@sev.test', ?, '')`,
  args: [ACCOUNT, tenantUrl],
});
const cookie = `auth_token=${await signToken({
  id: 1500, email: 'rep@sev.test', role: 'administrator', emailVerified: true, accountId: ACCOUNT,
})}`;

await tenant.execute({
  sql: `INSERT INTO conferences (id, name, start_date, end_date, location)
        VALUES (800, 'Dallas TopGolf', '2026-11-04', '2026-11-04', 'Dallas, TX')`,
});

/** Four events, covering every state the badge has to tell apart. */
const EVENTS = [
  [1, 'Happy Hour — published form'],
  [2, 'Dinner — form, no link generated'],
  [3, 'Breakfast — no form at all'],
  [4, 'Reception — form linked to a different event'],
];
for (const [id, name] of EVENTS) {
  await tenant.execute({
    sql: `INSERT INTO social_events (id, conference_id, event_name, event_date, invite_only)
          VALUES (?, 800, ?, '2026-11-04', 'No')`,
    args: [id, name],
  });
}

await tenant.execute({
  sql: `INSERT INTO conference_forms (id, conference_id, name, social_event_id, is_public, public_token)
        VALUES (10, 800, 'Happy Hour RSVP', 1, 1, 'tok-happy')`,
});
// Linked, but never published: is_public is 0 and the token means nothing yet.
await tenant.execute({
  sql: `INSERT INTO conference_forms (id, conference_id, name, social_event_id, is_public, public_token)
        VALUES (11, 800, 'Dinner RSVP', 2, 0, 'tok-dinner')`,
});
// Published, but tied to no event — a general conference form.
await tenant.execute({
  sql: `INSERT INTO conference_forms (id, conference_id, name, social_event_id, is_public, public_token)
        VALUES (12, 800, 'Booth Signup', NULL, 1, 'tok-booth')`,
});

const route = await import('@/app/api/social-events/route');
const rows = await (await route.GET(
  new NextRequest('https://parlay.test/api/social-events?conference_id=800', { headers: { cookie } }),
)).json();
const byName = new Map(rows.map(r => [r.event_name, r]));

console.log('\n— which events have something to copy —');
{
  eq('all four events come back', rows.length, 4);
  eq('a published linked form hands over its token',
    byName.get('Happy Hour — published form')?.public_form_token, 'tok-happy');
  eq('  and its name, for the toast',
    byName.get('Happy Hour — published form')?.public_form_name, 'Happy Hour RSVP');
  /*
   * The two silences. A form with no public link is not a link you can send
   * somebody, and marking the event as having one would promise a menu entry
   * that copies nothing.
   */
  eq('a linked form with no public link hands over nothing',
    byName.get('Dinner — form, no link generated')?.public_form_token, null);
  eq('an event with no form hands over nothing',
    byName.get('Breakfast — no form at all')?.public_form_token, null);
  eq('and a published form tied to no event reaches none of them',
    rows.filter(r => r.public_form_token === 'tok-booth').length, 0);
}

console.log('\n— a link generated later —');
{
  // The toggle in the Forms tab is the only thing standing between the Dinner
  // form and a copyable link, so flipping it must be all it takes.
  await tenant.execute(`UPDATE conference_forms SET is_public = 1 WHERE id = 11`);
  const after = await (await route.GET(
    new NextRequest('https://parlay.test/api/social-events?conference_id=800', { headers: { cookie } }),
  )).json();
  eq('shows up on the event with no other change',
    after.find(r => r.event_name === 'Dinner — form, no link generated')?.public_form_token, 'tok-dinner');
}

// ── The menu ─────────────────────────────────────────────────────────────────

console.log('\n— the dot and the entry are one fact —');
{
  const parts = strip('components/SocialEventCardParts.tsx');
  const table = strip('components/SocialEventsTable.tsx');

  /*
   * Both are driven by the presence of `onCopyFormLink`. A separate boolean
   * saying "this event has a link" is how a badge comes to promise an entry
   * that is not in the menu.
   */
  eq('the handler is what the menu takes', /onCopyFormLink\?: \(\) => void;/.test(parts), true);
  eq('  the dot is drawn only when it is given',
    /\{onCopyFormLink && \(\s*<span[\s\S]{0,300}bg-green-600/.test(parts), true);
  // Wider window than the dot's: the entry carries an icon path between its
  // opening tag and its label.
  eq('  and so is the entry', /\{onCopyFormLink && \(\s*<button[\s\S]{0,700}Copy Form Link/.test(parts), true);
  eq('the table passes it only for an event with a token',
    /onCopyFormLink=\{ev\.public_form_token \? \(\) => handleCopyFormLink\(ev\) : undefined\}/.test(table), true);
}

console.log('\n— and they are the same green —');
{
  const parts = strip('components/SocialEventCardParts.tsx');
  const dot = parts.slice(parts.indexOf('{onCopyFormLink && ('));
  eq('the dot sits on the kebab\'s top-right corner',
    /absolute -top-0\.5 -right-0\.5 w-2\.5 h-2\.5 rounded-full bg-green-600/.test(dot), true);
  // Against a white card and a gray hover fill, an unringed dot reads as part
  // of the icon.
  eq('  ringed so it reads as a badge', /ring-2 ring-white/.test(dot), true);
  // Which it can only sit on if the button is a positioning context.
  eq('  positioned against the button', /className=\{`relative p-1\.5 rounded-lg/.test(parts), true);
  // Exactly the same value, not merely the same hue — measured in the browser
  // as rgb(22, 163, 74) on both.
  eq('the entry is written in that same green', /text-green-600 hover:bg-green-50[\s\S]{0,400}Copy Form Link/.test(parts), true);
  eq('  and the dot is not a different one', /bg-green-(?!600)\d00/.test(dot.slice(0, 600)), false);
  // Delete stays red, Edit stays gray: the green is this one entry's meaning,
  // not a new palette for the menu.
  eq('  while Delete keeps its red', /text-red-600 hover:bg-red-50[\s\S]{0,400}Delete/.test(parts), true);
}

console.log('\n— a third entry does not fit inside the card —');
{
  /*
   * Found by driving it, not by reading it. The card is `overflow-hidden`
   * and the menu used to end a few pixels inside its bottom edge, so adding
   * Copy Form Link clipped Delete away entirely: still in the DOM, painted
   * nowhere, and the next card answering a click at its coordinates. The
   * menu ran to 686px against a card ending at 658.
   *
   * So it is portalled to the body and positioned against the kebab. After
   * the change the same measurement reports no clipping ancestor at all, and
   * on the lowest card (kebab at 709 in a 740 viewport) the menu flips above
   * to 611–677 with Delete hit-testing as Delete.
   */
  const parts = strip('components/SocialEventCardParts.tsx');
  eq('the menu is portalled out of the card', /createPortal\(/.test(parts), true);
  eq('  and positioned in viewport coordinates', /className="fixed z-\[10000\] w-44/.test(parts), true);
  eq('  measured against the kebab, right-aligned',
    /left: Math\.max\(8, r\.right - MENU_WIDTH\)/.test(parts), true);
  eq('  flipping above when there is no room below',
    /const flip = below \+ height > window\.innerHeight - 8/.test(parts), true);
  /*
   * A fixed panel measured once drifts away from its button as the page
   * moves, so scrolling closes it. The listener is capturing, because the
   * page scrolls inside a div rather than the window.
   */
  eq('  and closing on scroll rather than drifting',
    /window\.addEventListener\('scroll', onScroll, true\)/.test(parts), true);
  // Outside-click now has two places to look: the panel is no longer inside
  // the wrapper that the handler was checking.
  eq('an outside click still has to miss the panel too',
    /if \(wrapRef\.current\?\.contains\(t\) \|\| menuRef\.current\?\.contains\(t\)\) return;/.test(parts), true);
}

console.log('\n— copying it —');
{
  const table = strip('components/SocialEventsTable.tsx');
  const fn = table.slice(table.indexOf('const handleCopyFormLink'), table.indexOf('const handleDelete'));
  eq('writes the built link to the clipboard', /navigator\.clipboard\.writeText\(url\)/.test(fn), true);
  eq('  naming the form in the confirmation', /Link to "\$\{ev\.public_form_name\}" copied/.test(fn), true);
  /*
   * Clipboard access is refused outside a secure context and in some embedded
   * browsers, and a success toast for a copy that did not happen is worse
   * than the failure.
   */
  eq('  and saying so when the browser refuses', /toast\.error\('Failed to copy the link'\)/.test(fn), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
