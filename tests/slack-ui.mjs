/**
 * Every error a Slack route can redirect with reaches the user as a sentence.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/slack-ui.mjs
 *
 * The routes never answer a raw 500. They redirect back to a settings screen
 * with `?error=<code>`, which means the screen is the only thing standing
 * between a user and the string `slack_wrong_workspace`.
 *
 * So this does not hardcode a list of codes. It READS the route sources and
 * extracts every literal that can end up in that param — the `settingsError('…')`
 * calls and the refusal ternaries — then asserts each one has a message. A new
 * `settingsError('slack_something_new')` added without a message fails here
 * rather than shipping a blank banner.
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

const { SLACK_ERROR_MESSAGES, slackErrorMessage } = await import('@/lib/slack/errorMessages');

const ROUTES = {
  'install': 'app/api/slack/install/route.ts',
  'install callback': 'app/api/slack/oauth/callback/route.ts',
  'connect': 'app/api/slack/connect/route.ts',
  'connect callback': 'app/api/slack/connect/callback/route.ts',
};

/**
 * Every error code one route file can put in the URL.
 *
 * Two shapes produce one: `settingsError('literal')`, and the refusal ternary
 * `settingsError(auth.refusal === 'unauthenticated' ? 'a' : 'b')`, whose two
 * branches the first pattern does not see.
 */
function codesEmittedBy(file) {
  const source = readFileSync(file, 'utf8');
  const codes = new Set();
  for (const m of source.matchAll(/settingsError\(\s*'([a-z_]+)'\s*\)/g)) codes.add(m[1]);
  for (const m of source.matchAll(/settingsError\([^)]*\?\s*'([a-z_]+)'\s*:\s*'([a-z_]+)'/g)) {
    codes.add(m[1]);
    codes.add(m[2]);
  }
  return [...codes].sort();
}

console.log('\n— every code a route emits has a message —');

const everyCode = new Set();
for (const [name, file] of Object.entries(ROUTES)) {
  const codes = codesEmittedBy(file);
  eq(`${name} emits some codes`, codes.length > 0, true);
  const missing = codes.filter(c => !(c in SLACK_ERROR_MESSAGES));
  eq(`  all of ${name}'s are covered`, missing, []);
  codes.forEach(c => everyCode.add(c));
}

console.log('\n— and each message is one a person can act on —');
{
  const codes = [...everyCode].sort();
  console.log(`  (${codes.length} distinct: ${codes.join(', ')})`);

  const blank = codes.filter(c => !slackErrorMessage(c) || slackErrorMessage(c).trim() === '');
  eq('none renders blank', blank, []);

  const raw = codes.filter(c => slackErrorMessage(c).includes(c));
  eq('none leaks its raw code into the message', raw, []);

  const unpunctuated = codes.filter(c => !/[.!]$/.test(slackErrorMessage(c)));
  eq('each is a complete sentence', unpunctuated, []);

  const short = codes.filter(c => slackErrorMessage(c).length < 25);
  eq('none is a stub', short, []);
}

console.log('\n— the fallbacks —');
{
  eq('no param yields no banner at all', slackErrorMessage(null), null);
  eq('an empty param likewise', slackErrorMessage(''), null);
  eq('undefined likewise', slackErrorMessage(undefined), null);
  // A user who arrives with a mangled or hand-edited URL gets a sentence, not
  // the string they typed and not an empty red box.
  const unknown = slackErrorMessage('slack_not_a_real_code');
  eq('an unrecognised param still yields a sentence', typeof unknown === 'string' && unknown.length > 25, true);
  eq('  and does not echo it back', unknown.includes('slack_not_a_real_code'), false);
  eq('  nor a would-be injection', slackErrorMessage('<script>').includes('<script>'), false);
}

console.log('\n— the table has nothing spare —');
{
  // A message for a code no route emits is either a leftover from a deleted
  // path or a typo in one that exists. Both are worth knowing about.
  const orphans = Object.keys(SLACK_ERROR_MESSAGES).filter(c => !everyCode.has(c));
  eq('every message corresponds to a reachable code', orphans, []);
}

console.log('\n— what the screens do with a workspace that is not there —');
{
  const account = readFileSync('components/SlackSettings.tsx', 'utf8');
  // The not-installed branch must explain rather than offer a control that
  // leads to a failure the user cannot fix.
  // The branch now sits after the revoked one — see below — so it is sliced
  // between its own opening and the linked branch that follows it.
  const notInstalled = account.slice(
    account.indexOf(') : !status.workspace ? ('),
    account.indexOf(') : status.link ?'),
  );
  eq('the not-installed branch exists', notInstalled.length > 0, true);
  eq('  offers no link to a connect route', notInstalled.includes('/api/slack/connect'), false);
  eq('  offers no button', /<button/.test(notInstalled), false);
  eq('  and says who can fix it', /administrator/i.test(notInstalled), true);
}

console.log('\n— a workspace Slack has revoked —');
{
  const ui = readFileSync('components/SlackSettings.tsx', 'utf8');
  // The failure shape this codebase keeps producing is a green light with
  // nothing arriving behind it. A revoked workspace must not read as Connected.
  eq('the admin badge is driven by revokedAt', ui.includes("const revoked = workspace?.revokedAt != null"), true);
  const badge = ui.slice(ui.indexOf('revoked ? \'bg-red-100'), ui.indexOf('</span>', ui.indexOf('revoked ? \'bg-red-100')));
  eq('  and reads as disconnected, not merely unbadged', badge.includes('Disconnected in Slack'), true);
  eq('  with Reconnect promoted to the primary action',
    ui.includes("revoked ? 'btn-primary' : 'btn-secondary'"), true);
  // The individual's card must not claim a working link either, and must not
  // offer them a control for a problem only an administrator can fix.
  const userBranch = ui.slice(ui.indexOf('{status.workspace?.revokedAt != null ?'), ui.indexOf(') : !status.workspace ? ('));
  eq('the member card has its own revoked branch', userBranch.length > 0, true);
  eq('  offering no control', /<button|href="\/api\/slack\/connect"/.test(userBranch), false);
  eq('  and saying an administrator must reconnect', /administrator/i.test(userBranch), true);

  const status = readFileSync('app/api/slack/status/route.ts', 'utf8');
  eq('the endpoint actually reports it', status.includes('revokedAt: workspace.revokedAt'), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
