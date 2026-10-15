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
  /*
   * No drawer decides for itself. Whether a record is rendered inline or
   * framed depends on the viewport width and on the type, and a call site
   * that branched on either would be a second place to get it wrong.
   */
  for (const f of DRAWERS) {
    eq(`  ${f.split('/').pop()} does not decide for itself`,
      /canRenderInline\(/.test(strip(f)), false);
  }

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


console.log('\n— inline only where the drawer is the viewport —');
{
  const body = strip('components/RecordQuickViewBody.tsx');

  /*
   * The record views lay out with VIEWPORT breakpoints — sm:grid-cols-2,
   * md:grid-cols-4, lg:grid-cols-3. An iframe has its own viewport, and a
   * 480px drawer meant none of them applied, so the record stacked into the
   * one column that fits. Inline they resolve against the HOST: on a 1440px
   * screen a four-column grid was crushed into 480px, every word wrapped down
   * the page. Reported from a desktop screenshot.
   *
   * So inline is right exactly where the drawer IS the viewport — below sm.
   * Driven in Chromium: 1440, 1024 and 700 all render the iframe; 390 takes
   * the inline path.
   */
  eq('the width decides', /const isPhone = useIsPhone\(\);/.test(body), true);
  eq('  and anything wider is framed', /if \(!isPhone \|\| !canRenderInline\(type\)\) \{/.test(body), true);
  eq('  with the frame built here, once', /src=\{`\$\{BASE_PATH\[type\]\}\/\$\{id\}\$\{query\}`\}/.test(body), true);
  // A company opened as another row's parent keeps that context in the frame.
  eq('  carrying parent_of when there is one',
    /parent_of=\$\{encodeURIComponent\(parentOf\)\}/.test(body), true);

  /*
   * useIsPhone starts false, so the first render is the FRAME and a phone
   * swaps to inline after mount. That is the safe way round: the frame is
   * correct at every width, the inline view only at one.
   */
  const hook = strip('lib/useIsPhone.ts');
  eq('  starting from the answer that is always right',
    /useState\(false\)/.test(hook), true);
}

console.log('\n— and a drawer opened from a modal opens above it —');
{
  /*
   * Reported: the quick view opened from the global search palette arrived
   * BLURRED. It was opening correctly — a backdrop filter blurs everything
   * painted beneath it, and the drawer's default z-50 is beneath the palette's
   * z-[200]. So the drawer was rendered, in focus, underneath the frosting.
   *
   * Measured in Chromium after: blur layer at 200, drawer at 250, drawer
   * above. The palette stays open underneath on purpose — peeking at a result
   * without losing the search is what the eye icon is for.
   */
  const drawer = strip('components/QuickViewDrawer.tsx');
  eq('the drawer clears the page by default', /zClass = 'z-50'/.test(drawer), true);
  eq('  and says a modal has to raise it', /has to say so, or this opens behind/.test(readFileSync('components/QuickViewDrawer.tsx', 'utf8')), true);

  /*
   * Every caller that is ITSELF an overlay has to say so. These are the two
   * z-[200] modals that open one of these, and they are the two the rule
   * exists for.
   */
  for (const f of ['components/GlobalSearch.tsx', 'components/RelationshipMapModal.tsx']) {
    const src = strip(f);
    const name = f.split('/').pop();
    eq(`${name} is itself an overlay`, /z-\[200\]/.test(src), true);
    eq(`  so it raises the drawer above its own layer`, /zClass="z-\[250\]"/.test(src), true);
  }
  // The blur is the reason it matters rather than merely the order looking odd.
  eq('the palette frosts what is under it',
    /bg-black\/40 backdrop-blur-sm/.test(strip('components/GlobalSearch.tsx')), true);
}

console.log('\n— a company group can be peeked at from the attendee table —');
{
  const page = strip('app/conferences/[id]/page.tsx');

  eq('the group row offers a quick view', /<QuickViewIcon onClick=\{\(\) => \{ setQuickViewId\(node\.companyId\); setQuickViewType\('company'\); \}\} \/>/.test(page), true);
  // A group can be assembled from attendees carrying a company name and no
  // company record, and there is nothing to open for one of those.
  eq('  only where there is a record to open', /\{node\.companyId > 0 && \(/.test(page), true);

  /*
   * The hazard this shape exists for: the company name lives inside a button
   * that collapses the group. A button inside a button is invalid markup, and
   * the outer one swallows the inner click — so the group would have folded
   * shut every time the eye was pressed. They are siblings.
   *
   * Driven in Chromium: three group rows, one eye each, and clicking it leaves
   * the group exactly as expanded as it was while the company drawer opens.
   */
  eq('the expander and the eye are siblings',
    /<div className="relative flex items-start gap-1\.5 min-w-0">/.test(page), true);
  eq('  and the name button no longer fills the cell',
    /className="flex items-start min-w-0 text-left"/.test(page), true);

  // Non-text wants 3:1; gray-400 on white is 2.5:1, and this is the only mark
  // saying a row can be peeked at.
  const drawer = strip('components/QuickViewDrawer.tsx');
  eq('the icon is dark enough to see', /text-gray-500 hover:text-brand-secondary/.test(drawer), true);
  eq('  and nothing is left at gray-400', /text-gray-400 hover:text-brand-secondary/.test(drawer), false);
}

console.log('\n— and a drawer has no Back button in it —');
{
  const company = strip('components/records/CompanyDetailView.tsx');
  const attendee = strip('components/records/AttendeeDetailView.tsx');

  /*
   * A drawer already has a close button and a link to the record. Back was a
   * third way out and the only one that lied: BackButton calls router.back(),
   * which from a view rendered INLINE navigates the host page away behind the
   * drawer still sitting open on top of it.
   *
   * Driven in Chromium over seven cases — both records, drawer and page,
   * 1280, 480 and 390: Back is present on every page and on no drawer, and in
   * the company's drawer the jump menu falls to x=0, the row's first slot,
   * which is where Back was.
   */
  eq('the company drawer drops Back', /\{!isEmbed && <BackButton \/>\}/.test(company), true);
  eq('  and so does the attendee drawer', /\{!isEmbed && <BackButton \/>\}/.test(attendee), true);
  eq('  while a page keeps it', /<BackButton \/>/.test(company) && /<BackButton \/>/.test(attendee), true);

  /*
   * Both ways in count as a drawer. A quick view is rendered inline on a
   * phone, which passes embedId, and framed above it, which does not — that
   * one arrives as ?embed=true on the URL.
   */
  eq('the company knows it is embedded either way',
    /const isEmbed = embedId != null \|\| searchParams\.get\('embed'\) === 'true';/.test(company), true);
  eq('  as the attendee already did',
    /const isEmbed = embedded \?\? \(searchParams\.get\('embed'\) === 'true'\);/.test(attendee), true);

  // Nothing had to move: the row is justify-between, so losing its first child
  // puts the jump menu there.
  // `{}` is what stripping a JSX comment leaves behind between the two.
  eq('the jump menu takes the empty slot',
    /\{!isEmbed && <BackButton \/>\}\s*(\{\}\s*)?<SectionJumpMenu/.test(company), true);
  // The attendee record has no jump menu to move: SectionJumpMenu reads
  // [data-company-section] markers and the attendee's sections carry none.
  eq('and the attendee has no jump menu to move', /SectionJumpMenu/.test(attendee), false);

  /*
   * And the list it opens follows it there.
   *
   * It hung from the button's right edge, which was right while the button
   * sat at the end of the row. In the drawer the button is now the row's
   * first child, 16px in, so a 224px list hanging leftwards from it started
   * at -208 and most of it was off the side of the phone.
   *
   * So the side is measured when the menu opens. Driven in Chromium at 320,
   * 390 and 430px, drawer and page: in the drawer it hangs from the left and
   * opens rightwards (16..240), on the page the button is at the right and it
   * keeps the old edge (390px: 150..374). On screen in all six.
   */
  const jump = strip('components/SectionJumpMenu.tsx');
  eq('the list picks the side with room for it',
    /setAnchor\(r\.left \+ MENU_WIDTH <= window\.innerWidth - EDGE \? 'left' : 'right'\)/.test(jump), true);
  eq('  measured as it opens, not guessed', /const openMenu = \(\) => \{/.test(jump), true);
  eq('  and nothing opens it without measuring',
    /onClick=\{\(\) => \{ if \(open\) setOpen\(false\); else openMenu\(\); \}\}/.test(jump), true);
  eq('  hanging from whichever edge that is', /anchor === 'left' \? 'left-0' : 'right-0'/.test(jump), true);
  eq('  and no longer always the right one', /absolute right-0 z-40 w-56/.test(jump), false);
  // And a screen narrower than the list shrinks it rather than letting an
  // edge hang off: the measurement can only choose the better side, not
  // conjure room that is not there.
  eq('  with a list no wider than the screen', /max-w-\[calc\(100vw-1rem\)\]/.test(jump), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
