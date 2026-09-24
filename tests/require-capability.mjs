/**
 * The server-side half of the Role Scope matrix.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/require-capability.mjs
 *
 * The matrix has fifteen capabilities. Six were read by a component; none by
 * any API route. Unticking "Delete or merge companies & attendees" for Sales
 * Rep saved, read back on the next load, and changed nothing at all — the
 * button stayed and so did the DELETE behind it.
 *
 * resolveCapabilities is BEHAVIOUR and is run here. Which route carries which
 * guard is structure, read off the files, because the guard is one line that
 * is easy to leave off a new handler and impossible to notice when it is
 * missing.
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

const { resolveCapabilities, DEFAULT_ROLE_CAPABILITIES, LOCKED_ADMIN_CAPS, ALL_ROLES, CAPABILITY_LABELS } =
  await import('@/lib/auth-shared');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n— who holds what —');
{
  // The three the matrix calls out as destructive.
  eq('a sales rep cannot delete or merge',
    resolveCapabilities('sales_rep', {}).delete_merge, false);
  eq('  nor can a manager', resolveCapabilities('manager', {}).delete_merge, false);
  eq('  a coordinator can', resolveCapabilities('conference_coordinator', {}).delete_merge, true);
  eq('  and an administrator can', resolveCapabilities('administrator', {}).delete_merge, true);

  // delete_merge is not locked, so an account can grant it. This is the one of
  // the three that the matrix genuinely configures.
  eq('granting delete_merge to a sales rep takes effect',
    resolveCapabilities('sales_rep', { sales_rep: { delete_merge: true } }).delete_merge, true);
  eq('  and revoking it from a coordinator does too',
    resolveCapabilities('conference_coordinator', { conference_coordinator: { delete_merge: false } }).delete_merge, false);

  // The other two are in LOCKED_ADMIN_CAPS, which resolveCapabilities forces
  // off for every non-admin whatever the account stored. Enforcing them is
  // therefore equivalent to an administrator check — worth stating, because
  // the admin screen shows them as checkboxes.
  for (const cap of LOCKED_ADMIN_CAPS) {
    eq(`${cap} cannot be granted to a non-admin`,
      resolveCapabilities('manager', { manager: { [cap]: true } })[cap], false);
    eq('  but the administrator always holds it',
      resolveCapabilities('administrator', {})[cap], true);
  }

  // An administrator is resolved from the defaults, never from stored
  // overrides — locking themselves out of user management would be permanent.
  eq('an administrator cannot be stripped of anything',
    resolveCapabilities('administrator', { administrator: { manage_users: false, delete_merge: false } }),
    DEFAULT_ROLE_CAPABILITIES.administrator);

  // Every role resolves to a complete map, or a route guard reads undefined
  // and refuses somebody who should be allowed.
  const keys = Object.keys(DEFAULT_ROLE_CAPABILITIES.administrator);
  for (const role of ALL_ROLES) {
    eq(`${role} resolves every capability`,
      Object.keys(resolveCapabilities(role, {})).sort().join(), keys.slice().sort().join());
  }
  // An unknown role falls back rather than resolving to undefined everywhere.
  eq('an unrecognised role falls back to user',
    resolveCapabilities('nonsense', {}).view_data, DEFAULT_ROLE_CAPABILITIES.user.view_data);
}

console.log('\n— the guard actually refuses —');
{
  // Structural assertions cannot tell a guard that denies from one that only
  // looks like it does: deleting the `if (!caps[capability])` leaves every
  // mention of 403 in the file intact. So this runs requireCapability for
  // real, in a child process whose loader points lib/auth and lib/getDb at
  // stubs in tests/stubs — the session and the stored overrides become env
  // vars, and everything else, including resolveCapabilities, is the real
  // thing.
  const { execFileSync } = await import('node:child_process');
  const run = (env) => {
    const out = execFileSync(process.execPath, [
      '--experimental-strip-types',
      '--import', './tests/register-capability-stubs.mjs',
      'tests/stubs/probe.mjs',
    ], { env: { ...process.env, STUB_NO_SESSION: '', STUB_ROLE: '', STUB_STORED: '',
                STUB_ACCOUNT: '', STUB_DB_THROWS: '', STUB_CAP: '',
                NEXT_PUBLIC_DEMO_MODE: '', ...env },
         encoding: 'utf8' });
    const line = out.split('\n').find(l => l.startsWith('RESULT '));
    return JSON.parse(line.slice('RESULT '.length));
  };

  eq('a sales rep is refused delete_merge',
    run({ STUB_ROLE: 'sales_rep', STUB_CAP: 'delete_merge' }).status, 403);
  eq('  and told which permission it was',
    run({ STUB_ROLE: 'sales_rep', STUB_CAP: 'delete_merge' }).capability, 'delete_merge');
  eq('a coordinator is allowed through',
    run({ STUB_ROLE: 'conference_coordinator', STUB_CAP: 'delete_merge' }).status, 'allowed');
  eq('no session at all is a 401',
    run({ STUB_NO_SESSION: '1', STUB_CAP: 'delete_merge' }).status, 401);

  // The account's own override is what makes delete_merge worth having as a
  // capability rather than a role check.
  eq('granting it to a sales rep lets them through',
    run({ STUB_ROLE: 'sales_rep', STUB_CAP: 'delete_merge',
          STUB_STORED: JSON.stringify({ sales_rep: { delete_merge: true } }) }).status, 'allowed');
  eq('  and revoking it from a coordinator stops them',
    run({ STUB_ROLE: 'conference_coordinator', STUB_CAP: 'delete_merge',
          STUB_STORED: JSON.stringify({ conference_coordinator: { delete_merge: false } }) }).status, 403);

  // The locked three cannot be granted, however the row is edited.
  eq('a manager cannot be granted manage_system_config',
    run({ STUB_ROLE: 'manager', STUB_CAP: 'manage_system_config',
          STUB_STORED: JSON.stringify({ manager: { manage_system_config: true } }) }).status, 403);
  eq('  while the administrator holds it',
    run({ STUB_ROLE: 'administrator', STUB_CAP: 'manage_system_config' }).status, 'allowed');
  eq('  and cannot be stripped of it',
    run({ STUB_ROLE: 'administrator', STUB_CAP: 'manage_system_config',
          STUB_STORED: JSON.stringify({ administrator: { manage_system_config: false } }) }).status, 'allowed');

  // A tenant that has never opened the matrix has no row, and one whose table
  // predates it throws. Both must read as "no overrides", not "no permissions".
  eq('a tenant with no stored row falls back to the defaults',
    run({ STUB_ROLE: 'conference_coordinator', STUB_CAP: 'delete_merge' }).status, 'allowed');
  eq('  and so does one whose read throws',
    run({ STUB_ROLE: 'conference_coordinator', STUB_CAP: 'delete_merge', STUB_DB_THROWS: '1' }).status, 'allowed');
  eq('  without letting anyone through who should not be',
    run({ STUB_ROLE: 'sales_rep', STUB_CAP: 'delete_merge', STUB_DB_THROWS: '1' }).status, 403);

  // Reading another tenant's matrix would apply one account's rules to
  // another. The account asked for is the caller's own.
  eq('the overrides are read from the caller\'s account',
    run({ STUB_ROLE: 'sales_rep', STUB_CAP: 'delete_merge', STUB_ACCOUNT: 'acct_42' }).askedFor, 'acct_42');

  // The three intelligence pages, refused for real rather than asserted.
  eq('a sales rep is refused Program Intelligence',
    run({ STUB_ROLE: 'sales_rep', STUB_CAP: 'view_program_intelligence' }).status, 403);
  eq('  and a manager is not',
    run({ STUB_ROLE: 'manager', STUB_CAP: 'view_program_intelligence' }).status, 'allowed');
  eq('a stakeholder is refused Program Planner',
    run({ STUB_ROLE: 'stakeholder', STUB_CAP: 'view_program_planner' }).status, 403);
  eq('  and a coordinator is not',
    run({ STUB_ROLE: 'conference_coordinator', STUB_CAP: 'view_program_planner' }).status, 'allowed');
  eq('revoking Program Planner refuses the data too',
    run({ STUB_ROLE: 'manager', STUB_CAP: 'view_program_planner',
          STUB_STORED: JSON.stringify({ manager: { view_program_planner: false } }) }).status, 403);
  eq('  and granting Program Intelligence opens it',
    run({ STUB_ROLE: 'sales_rep', STUB_CAP: 'view_program_intelligence',
          STUB_STORED: JSON.stringify({ sales_rep: { view_program_intelligence: true } }) }).status, 'allowed');

  // Demo mode matches requireAdmin, where every visitor is an administrator
  // and the middleware fakes the writes.
  eq('demo mode lets a sales rep through',
    run({ STUB_ROLE: 'sales_rep', STUB_CAP: 'delete_merge', NEXT_PUBLIC_DEMO_MODE: 'true' }).status, 'allowed');
}

console.log('\n— the guard itself —');
{
  const lib = strip('lib/requireCapability.ts');

  eq('no session is still a 401', /status: 401/.test(lib), true);
  eq('  and a missing capability is a 403', /status: 403/.test(lib), true);
  eq('  naming which one, so the client can say',
    /\{ error: '[^']+', capability \}/.test(lib), true);

  // Mirrors requireAdmin deliberately. A demo that refuses what the product
  // allows is a demo of something else.
  eq('demo mode behaves as it does for requireAdmin',
    /process\.env\.NEXT_PUBLIC_DEMO_MODE === 'true'/.test(lib), true);

  // Failing closed on a read error would lock every role out of everything on
  // a tenant that has never opened the matrix — there is no row until it is
  // saved once.
  eq('a missing settings row means no overrides, not no permissions',
    /catch\(\(\) => \(\{ rows: \[\] as Record<string, unknown>\[\] \}\)\)/.test(lib), true);
  eq('  and malformed JSON reads the same way', /catch \{[\s\S]{0,60}\}/.test(lib), true);

  // The tenant's own row. Reading the wrong database would apply one account's
  // matrix to another.
  eq('the overrides come from the caller\'s own tenant',
    /getDb\(accountId\)/.test(lib) && /user\.accountId/.test(lib), true);
  eq('  keyed per account in the cache', /cache\.get\(key\)/.test(lib), true);
  eq('  with a way to drop it after a save', /export function invalidateRoleCapabilities/.test(lib), true);
}

console.log('\n— delete and merge are guarded —');
{
  // The four routes that destroy a record. Checked by handler, because these
  // files also carry GET and PUT, which are not governed by this capability.
  const deletes = [
    ['app/api/companies/[id]/route.ts', 'DELETE'],
    ['app/api/attendees/[id]/route.ts', 'DELETE'],
  ];
  for (const [file, method] of deletes) {
    const s = strip(file);
    const start = s.indexOf(`export async function ${method}(`);
    const body = s.slice(start, start + 400);
    eq(`${file} ${method} requires delete_merge`,
      /requireCapability\(request, 'delete_merge'\)/.test(body), true);
    // The read and the edit on the same record are not this capability.
    const get = s.slice(s.indexOf('export async function GET('), s.indexOf('export async function GET(') + 400);
    eq('  and the GET beside it is untouched', /requireAuth\(request\)/.test(get), true);
  }
  for (const file of ['app/api/companies/merge/route.ts', 'app/api/attendees/merge/route.ts']) {
    eq(`${file} requires delete_merge`,
      /requireCapability\(request, 'delete_merge'\)/.test(strip(file)), true);
    eq('  and no longer settles for any session',
      /requireAuth\(request\)/.test(strip(file)), false);
  }

  // Refusing without saying why reads as a bug rather than as an answer.
  eq('the duplicates panel shows the server\'s reason',
    /toast\.error\(err\.error \|\| 'Merge failed\.'\)/.test(strip('components/DuplicateCompaniesPanel.tsx')), true);
}

console.log('\n— system config and user management are guarded —');
{
  // Five write handlers were reachable by any authenticated session: no
  // requireAdmin, no inline role check. A sales rep could rewrite the
  // account's territories or its title normalisation rules.
  const wasOpen = [
    ['app/api/admin/section-config/route.ts', 'PUT'],
    ['app/api/admin/territories/route.ts', 'POST'],
    ['app/api/admin/territories/[id]/route.ts', 'PUT'],
    ['app/api/admin/territories/[id]/route.ts', 'DELETE'],
    ['app/api/title-normalization-rules/route.ts', 'POST'],
  ];
  for (const [file, method] of wasOpen) {
    const s = strip(file);
    const start = s.indexOf(`export async function ${method}(`);
    const body = s.slice(start, start + 400);
    eq(`${file} ${method} now requires manage_system_config`,
      /requireCapability\(request, 'manage_system_config'\)/.test(body), true);
  }

  // The rest already checked the role by hand, one file at a time. Routed
  // through the matrix they cannot drift apart, and a handler added without a
  // guard is a visible omission rather than an invisible one.
  const configFiles = [
    'app/api/admin/icp-rules/route.ts', 'app/api/admin/icp-rules/[id]/route.ts',
    'app/api/admin/icp-ai-assist/route.ts', 'app/api/admin/recompute-icp/route.ts',
    'app/api/admin/settings/route.ts', 'app/api/admin/upload-logo/route.ts',
    'app/api/admin/table-config/route.ts', 'app/api/admin/custom-columns/route.ts',
    'app/api/admin/competitors/route.ts', 'app/api/admin/unit-type/route.ts',
    'app/api/admin/effectiveness/route.ts', 'app/api/config/route.ts',
    // These two name their argument `req`, not `request`. The first pass
    // matched on the argument name and skipped them silently, which is the
    // failure mode this whole list exists to catch.
    'app/api/admin/competitors/route.ts', 'app/api/admin/competitors/[id]/route.ts',
  ];
  for (const file of configFiles) {
    const s = strip(file);
    eq(`${file} routes writes through the matrix`,
      /requireCapability\(\w+, 'manage_system_config'\)/.test(s), true);
    // The hand-rolled checks are gone, so there is one place this is decided.
    eq('  with no hand-rolled role check left',
      /role !== 'administrator'/.test(s), false);
  }

  // The matrix's own save is governed by the matrix — manage_role_scope was
  // the third locked capability and was not enforced either.
  const rc = strip('app/api/admin/role-capabilities/route.ts');
  eq('saving the matrix requires manage_role_scope',
    /requireCapability\(request, 'manage_role_scope'\)/.test(rc), true);
  // Guards read through a short cache, so a save that does not drop it is not
  // enforced until it expires.
  eq('  and drops the guard cache so it applies at once',
    /invalidateRoleCapabilities\(authResult\?\.accountId\)/.test(rc), true);

  for (const file of ['app/api/admin/users/route.ts', 'app/api/admin/users/[id]/route.ts']) {
    eq(`${file} requires manage_users`,
      /requireCapability\(request, 'manage_users'\)/.test(strip(file)), true);
  }

  // Reads stay open. Branding, config options and territory names are needed
  // to render the app for everybody.
  const settings = strip('app/api/admin/settings/route.ts');
  const get = settings.slice(settings.indexOf('export async function GET('));
  eq('reading settings is still open to any session',
    /requireAuth\(request\)/.test(get.slice(0, 300)), true);
  const config = strip('app/api/config/route.ts');
  eq('  and so is reading config options',
    /requireAuth\(request\)/.test(config.slice(config.indexOf('export async function GET('), config.indexOf('export async function GET(') + 300)), true);
}

console.log('\n— a capability per intelligence page —');
{
  // Program Intelligence was gated on view_pre_post_conference ||
  // view_effectiveness, which is neither of those things. Program Planner had
  // no gate anywhere — not the sidebar, not the page, not its twenty-one API
  // routes. Calendar Intelligence already had its own key; it keeps it.
  eq('both new capabilities are in the matrix',
    ['view_program_intelligence', 'view_program_planner']
      .every(k => k in DEFAULT_ROLE_CAPABILITIES.administrator), true);
  eq('  and are labelled for the admin screen',
    ['view_program_intelligence', 'view_program_planner']
      .map(k => CAPABILITY_LABELS[k]),
    ['View Program Intelligence', 'View Program Planner']);
  eq('  neither is admin-locked, so both are configurable',
    LOCKED_ADMIN_CAPS.some(k => k.startsWith('view_program')), false);

  // The defaults reproduce exactly who reached each page before this, so
  // nobody loses access on deploy. What changes is that it can now be said
  // otherwise.
  const pi = Object.fromEntries(ALL_ROLES.map(r => [r, resolveCapabilities(r, {}).view_program_intelligence]));
  eq('Program Intelligence defaults match the old proxy', pi, {
    sales_rep: false, manager: true, analyst: true, conference_coordinator: false,
    user: true, administrator: true, stakeholder: false,
  });
  // The old expression, evaluated against the same defaults, for proof rather
  // than assertion: the new key must agree with it role for role.
  const oldProxy = Object.fromEntries(ALL_ROLES.map(r => {
    const c = resolveCapabilities(r, {});
    return [r, r !== 'stakeholder' && (c.view_pre_post_conference || c.view_effectiveness)];
  }));
  eq('  and agree with it role for role', pi, oldProxy);

  const pp = Object.fromEntries(ALL_ROLES.map(r => [r, resolveCapabilities(r, {}).view_program_planner]));
  eq('Program Planner defaults match who saw the link', pp, {
    sales_rep: true, manager: true, analyst: true, conference_coordinator: true,
    user: true, administrator: true, stakeholder: false,
  });

  // Turning one off must actually turn it off — that is the whole request.
  eq('revoking Program Planner from a manager sticks',
    resolveCapabilities('manager', { manager: { view_program_planner: false } }).view_program_planner, false);
  eq('  and granting Program Intelligence to a sales rep sticks',
    resolveCapabilities('sales_rep', { sales_rep: { view_program_intelligence: true } }).view_program_intelligence, true);
}

console.log('\n— the pages and their data both refuse —');
{
  const sidebar = strip('components/Sidebar.tsx');
  eq('the sidebar gates each item on its own capability',
    /view_program_intelligence/.test(sidebar) && /view_program_planner/.test(sidebar), true);
  eq('  with the proxy gone',
    /view_pre_post_conference \|\| user\?\.capabilities\?\.view_effectiveness/.test(sidebar), false);
  eq('  and the planner no longer shown on role alone',
    /\{!isStakeholder && \(\s*<Link href=\{programPlannerItem\.href\}/.test(sidebar), false);

  // The variables existing is not the same as the links using them. Each nav
  // link is sliced out and checked against the gate immediately above it,
  // because `{hasProgramPlanner && (` becoming `{true && (` leaves every
  // mention of the capability in the file untouched.
  for (const [item, gate] of [['programIntelligenceItem', 'hasProgramIntelligence'],
                              ['programPlannerItem', 'hasProgramPlanner'],
                              ['calendarIntelligenceItem', 'hasCalendarIntelligence']]) {
    const at = sidebar.indexOf(`<Link href={${item}.href}`);
    const before = sidebar.slice(Math.max(0, at - 160), at);
    eq(`the ${item} link is behind ${gate}`, new RegExp(`\\{${gate} && \\($`).test(before.trimEnd()), true);
  }

  // Hiding the link is not denying access, so each page checks too.
  const pages = [
    ['app/program-intelligence/page.tsx', 'view_program_intelligence', 'Program Intelligence'],
    ['app/program-planner/page.tsx', 'view_program_planner', 'Program Planner'],
    ['app/calendar-intelligence/page.tsx', 'view_calendar_intelligence', 'Calendar Intelligence'],
  ];
  for (const [file, cap, label] of pages) {
    const src = strip(file);
    eq(`${file} checks ${cap}`, new RegExp(`view_program|${cap}`).test(src) && src.includes(cap), true);
    eq(`  and says so rather than bouncing`,
      src.includes(`<NoAccessPanel feature="${label}" />`), true);
  }
  // The redirect is what made a refusal read as a broken link.
  eq('calendar intelligence no longer redirects to the dashboard',
    /router\.replace\('\/'\)/.test(strip('app/calendar-intelligence/page.tsx')), false);

  // And hiding the page while still serving its data is not denying access
  // either. Every route under each tree, so one added later without a guard
  // fails here rather than shipping open.
  const { execSync } = await import('node:child_process');
  const groups = [
    ['app/api/program-intelligence', 'view_program_intelligence'],
    ['app/api/calendar-intelligence', 'view_calendar_intelligence'],
    ['app/api/program-planner', 'view_program_planner'],
  ];
  for (const [dir, cap] of groups) {
    const files = execSync(`find ${dir} -name route.ts`, { encoding: 'utf8' }).trim().split('\n');
    const ungated = files.filter(f => !new RegExp(`requireCapability\\(\\w+, '${cap}'\\)`).test(strip(f)));
    eq(`every route under ${dir} requires ${cap}`, ungated, []);
    const stillOpen = files.filter(f => /await requireAuth\(/.test(strip(f)));
    eq('  and none settles for any session', stillOpen, []);
  }
  eq('  the three trees together are 36 routes',
    groups.reduce((n, [dir]) => n + execSync(`find ${dir} -name route.ts`, { encoding: 'utf8' }).trim().split('\n').length, 0), 36);

  // The invited-responder flow is its own route and must stay reachable by
  // somebody who has no calendar intelligence access at all.
  eq('responding to an invitation is not gated on the page capability',
    /view_calendar_intelligence/.test(strip('app/api/input/respond/route.ts')), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
