/**
 * Where the company drawer stops on a phone.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/company-drawer-height.mjs
 *
 * Opening a company from the conference page's company table put the drawer a
 * third of the way down the screen instead of under the site header.
 *
 * The drawer already wore the anchored shape — `fixed bottom-0 left-0 right-0`
 * — which globals.css gives `top: var(--mobile-header-h)`. The rule was
 * applying. The trouble was WHERE from: `position: fixed` resolves against the
 * viewport only while nothing above it is transformed, and on a phone this
 * opens inside the conference tab drawer, which carries a translateY to slide.
 * So the 144px was measured from the tab drawer's own top — itself already the
 * header — and the drawer landed at 288.
 *
 * Reproduced in Chromium at 390x844 with a 59px inset: drawer top 288 against
 * a header bottom of 144, exactly twice. After portalling to the body: 144,
 * running to 844. At 1280px it is still a 480px full-height drawer on the
 * right, 800 to 1280.
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

/*
 * TWO components draw this. CompanyDrawer is the one app/companies/[id] opens
 * for a parent or child record; CompanyTable has its own copy inline, and that
 * is the one the conference page's Companies tab shows. They carry the same
 * "Go to Company Record" link and the same class list, which is how the first
 * attempt at this fixed the wrong one — the screenshot showed the table's
 * version, with no title beside the link.
 */
console.log('\n— the conference page’s company table —');
{
  const table = strip('components/CompanyTable.tsx');

  /*
   * Measured on the real component, rendered inside a transformed
   * top-anchored ancestor as the conference tab drawer is: top 288 against a
   * header bottom of 144 without the portal, 144 with it.
   */
  eq('its quick view portals to the body',
    /\{quickViewId !== null && mounted && createPortal\(/.test(table), true);
  eq('  naming the body as its host', /\n        <\/>,\n        document\.body,\n      \)\}/.test(table), true);
  eq('  once there is a document', /useEffect\(\(\) => setMounted\(true\), \[\]\);/.test(table), true);
  // The backdrop goes with it, or it dims the page from inside the old tree.
  eq('  taking its backdrop along',
    /createPortal\([\s\S]{0,400}fixed inset-0 z-40 bg-black\/30/.test(table), true);
  eq('  and it wears the shape the header rule anchors',
    /drawer-mobile-responsive fixed bottom-0 left-0 right-0/.test(table), true);
}

console.log('\n— and the record page’s own drawer —');
{
  const drawer = strip('components/CompanyDrawer.tsx');

  eq('the drawer portals to the body', /createPortal\(/.test(drawer), true);
  eq('  naming the body as its host', /\n    document\.body,\n  \);/.test(drawer), true);
  // document does not exist until mounted, so the portal has to wait for it.
  eq('  once there is a document to portal into',
    /useEffect\(\(\) => setMounted\(true\), \[\]\);/.test(drawer), true);
  eq('  and nothing renders before then',
    /if \(companyId === null \|\| !mounted\) return null;/.test(drawer), true);
}

console.log('\n— and keeps the shape the header rule anchors —');
{
  const drawer = strip('components/CompanyDrawer.tsx');
  const css = readFileSync('app/globals.css', 'utf8');

  /*
   * This is the shape globals.css top-anchors, as opposed to the one it caps.
   * The two rules partition on `left-0`, so the drawer has to carry the full
   * `fixed bottom-0 left-0 right-0` or it falls into the capped branch.
   */
  eq('it wears the anchored shape', /fixed bottom-0 left-0 right-0/.test(drawer), true);
  eq('  which is the shape the rule anchors',
    /\.drawer-mobile-responsive\.fixed\.bottom-0\.left-0\.right-0/.test(css), true);

  // Desktop is untouched: a 480px drawer down the right-hand side. Measured
  // at 1280x844 after the change — 800 to 1280, top 0 to bottom 844.
  eq('and above sm it is still the right-hand drawer',
    /sm:inset-y-0 sm:left-auto sm:right-0/.test(drawer), true);
  eq('  at its own width', /sm:w-\[480px\]/.test(drawer), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
