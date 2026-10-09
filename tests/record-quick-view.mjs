/**
 * A record opened in a drawer, without booting a second copy of the app.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/record-quick-view.mjs
 *
 * Every quick view was `<iframe src="/companies/9156?embed=true">`. An iframe
 * is its own document, its own JavaScript context and its own provider tree,
 * so one drawer open cost roughly thirty requests — /api/auth/me,
 * /api/onboarding/progress, /api/suggestions twice, /api/config eight times,
 * and the record's own data — and all of them again on the next open, because
 * a fresh iframe is a cold cache. It is also why the deduplication in
 * lib/configCache did nothing for it: those caches live in a context, and an
 * iframe is a different one.
 *
 * Counted from a phone's production log: 34 requests in 13 seconds for one
 * company drawer, /api/config eight of them.
 *
 * The same view renders inline now, inside the host's provider tree and its
 * caches. It is the SAME component the route renders, so the drawer looks as
 * it did rather than resembling it.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync, existsSync } from 'node:fs';

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

console.log('\n— the record is a component, not a page in a frame —');
{
  /*
   * The view had to leave app/ to be rendered anywhere else: a Next page
   * component may not take extra props, and the inline render needs to pass
   * the id. The route is now a wrapper around the component.
   */
  eq('the company view is a component', existsSync('components/records/CompanyDetailView.tsx'), true);
  eq('  and the attendee view too', existsSync('components/records/AttendeeDetailView.tsx'), true);

  const route = strip('app/companies/[id]/page.tsx');
  eq('the route just renders it', /<CompanyDetailView \/>/.test(route), true);
  eq('  and carries no logic of its own', route.split('\n').filter(l => l.trim()).length < 12, true);

  const body = strip('components/RecordQuickViewBody.tsx');
  // Loaded on demand: two thousand lines each, and a page that never opens a
  // drawer should not carry them.
  eq('the views load on demand', (body.match(/dynamic\(/g) ?? []).length, 2);
  eq('  client-side, since they are the host’s already', /ssr: false/.test(body), true);
}

const DRAWERS = [
  'components/QuickViewDrawer.tsx', 'components/CompanyTable.tsx',
  'components/CompanyDrawer.tsx', 'components/AttendeeTable.tsx',
  'components/AttendeeQuickViewDrawer.tsx', 'components/PreConferenceReview.tsx',
  'components/MyDebriefDrawer.tsx', 'components/ConferenceActivityMapDrawer.tsx',
  'components/AttendeesDrawer.tsx', 'components/DashboardTargetsSection.tsx',
  'components/MeetingNotetaker.tsx',
  /* Two of these are pages rather than components. The global guard below is
     what found them: the first inventory grepped components/ only, and these
     were framing records the whole time. */
  'app/conferences/[id]/page.tsx', 'app/program-intelligence/page.tsx',
];

console.log('\n— every drawer that can, renders it inline —');
{
  for (const f of DRAWERS) {
    const src = strip(f);
    const name = f.split('/').pop();
    eq(`${name} renders the record inline`, /<RecordQuickViewBody/.test(src), true);
    /* QuickViewDrawer and MeetingNotetaker can open a CONFERENCE, which has
       no inline view yet, so those two keep an iframe for that one case. No
       other drawer should frame anything. */
    if (!/QuickViewDrawer|MeetingNotetaker/.test(f)) {
      eq(`  and ${name} loads no page into a frame`, /embed=true/.test(src), false);
    }
  }
  const qv = strip('components/QuickViewDrawer.tsx');
  eq('the shared drawer still frames a conference',
    /canRenderInline\(target\.type\)/.test(qv), true);
  eq('  as does the notetaker',
    /canRenderInline\(recordDrawer\.type\)/.test(strip('components/MeetingNotetaker.tsx')), true);

  /*
   * The guard that matters more than any single file: nothing may frame an
   * ATTENDEE or a COMPANY page again. A half-migrated pattern is its own
   * hazard — the next drawer copied from a neighbour has even odds of copying
   * the iframe.
   */
  const { execSync } = await import('node:child_process');
  const framing = execSync(
    "grep -rln \"embed=true\" --include='*.tsx' components/ app/ || true",
    { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const offenders = framing.filter(f => {
    if (f.endsWith('RecordQuickViewBody.tsx')) return false;
    const src = strip(f);
    // A conference frame is allowed; an attendee or company one is not.
    return /attendees\/\$\{[^}]*\}\?embed=true|companies\/\$\{[^}]*\}\?embed=true|\? 'attendees' : 'companies'/.test(src);
  });
  eq('no drawer frames an attendee or a company any more', offenders, []);
  const body = strip('components/RecordQuickViewBody.tsx');
  eq('  which is the type that has no inline view',
    /return type === 'attendee' \|\| type === 'company';/.test(body), true);
}

console.log('\n— and leaving a record does not take the page with it —');
{
  const company = strip('components/records/CompanyDetailView.tsx');
  const attendee = strip('components/records/AttendeeDetailView.tsx');

  /*
   * In an iframe, router.push('/companies') navigated the FRAME and the host
   * page never moved. Inline it would navigate the host — so deleting a
   * company from a quick view opened on a conference page would throw the
   * reader out of the conference. Embedded, the drawer closes instead.
   */
  eq('a deleted company closes the drawer when embedded',
    /if \(embedId\) onEmbeddedLeave\?\.\(\); else router\.push\('\/companies'\);/.test(company), true);
  eq('  as does one that cannot be loaded',
    (company.match(/if \(embedId\) onEmbeddedLeave\?\.\(\); else router\.push/g) ?? []).length, 2);
  eq('  and a deleted attendee the same',
    /if \(embedId\) onEmbeddedLeave\?\.\(\); else router\.push\('\/attendees'\);/.test(attendee), true);
  // Nothing may push unconditionally any more, or the host page still moves.
  eq('nothing navigates the host unconditionally',
    /^\s*router\.push\('\/(companies|attendees)'\);/m.test(company)
      || /^\s*router\.push\('\/attendees'\);/m.test(attendee), false);

  // And every drawer hands the view something to call.
  for (const f of DRAWERS) {
    eq(`  ${f.split('/').pop()} passes a way to close`,
      /<RecordQuickViewBody[\s\S]{0,240}onClose=\{/.test(strip(f)), true);
  }
}

console.log('\n— the drawer looks as it did —');
{
  const body = strip('components/RecordQuickViewBody.tsx');
  const shell = strip('components/AppShell.tsx');
  /*
   * The padding and background the embedded page carried, so the inline
   * version is the same box with the same component in it.
   */
  eq('it keeps the embed wrapper’s padding and fill',
    /overflow-y-auto overscroll-y-contain p-4 lg:p-6 bg-gray-50/.test(body), true);
  eq('  which is what the embedded page used',
    /overflow-y-auto overscroll-y-contain p-4 lg:p-6 bg-gray-50/.test(shell), true);
  /*
   * But not its h-screen. An iframe's viewport WAS the drawer; inline the box
   * is the drawer's own, so the wrapper fills the flex parent instead of the
   * screen.
   */
  eq('  without the page’s full-screen height', /h-screen/.test(body), false);
  eq('  filling the drawer instead', /flex-1 min-h-0/.test(body), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
