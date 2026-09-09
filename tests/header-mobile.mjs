/**
 * The mobile header: brand fill, rounded bottom, evenly spaced controls.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/header-mobile.mjs
 *
 * Below lg the header paints on brand-primary instead of white, so its icons
 * invert. Above lg nothing changes — the desktop header carries text labels in
 * brand-primary that would vanish on a navy fill, so the treatment is scoped
 * rather than global. These assertions exist to stop the scoping being dropped,
 * which would silently repaint the desktop header.
 *
 * The even spacing is done with `display: contents` on the two wrappers, so the
 * letter mark and every icon become direct flex children of one row and
 * space-between gives them one equal gap — including when the hamburger comes
 * and goes. Measured in a real browser during development (16px with the
 * hamburger, 27px without, 1px spread either way); what is checked here is that
 * the mechanism is still in place, since a source file cannot measure a gap.
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

const header = readFileSync('components/Header.tsx', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');

// The <header> tag itself, not the whole file — several nested elements carry
// similar utilities and a file-wide search would match one of those instead.
const tag = header.slice(header.indexOf('<header className='), header.indexOf('>', header.indexOf('<header className=')) + 1);

console.log('\n— the fill is mobile-only —');
{
  eq('the header block was found', tag.length > 40 && tag.length < 500, true);
  eq('brand fill on phones', tag.includes('bg-brand-primary'), true);
  eq('  and white again from lg', tag.includes('lg:bg-white'), true);
  eq('rounded bottom corners', tag.includes('rounded-b-3xl'), true);
  eq('  squared off again from lg', tag.includes('lg:rounded-none'), true);
  // A grey rule under a navy header reads as a seam.
  eq('no visible bottom border on phones', tag.includes('border-transparent'), true);
  eq('  restored from lg', tag.includes('lg:border-gray-200'), true);
  eq('the row still distributes with space-between', tag.includes('justify-between'), true);
}

console.log('\n— the icons invert with it —');
{
  const block = css.slice(css.indexOf('.header-mobile-dark'));
  eq('the header carries the hook class', tag.includes('header-mobile-dark'), true);
  eq('  and the stylesheet defines it', block.length > 0, true);
  // Scoped to the same breakpoint as the fill. Without the query the desktop
  // header's icons would turn white on white.
  const scoped = css.slice(0, css.indexOf('.header-mobile-dark'));
  eq('the rule sits inside a max-width query',
    /@media\s*\(max-width:\s*1023px\)\s*\{\s*$/.test(scoped.trimEnd() + '\n') || scoped.trimEnd().endsWith('@media (max-width: 1023px) {'), true);
  eq('icons are painted white', /\.header-mobile-dark svg \{ color: #fff; \}/.test(css), true);
  // Every icon in the header draws with currentColor, so `color` is enough —
  // and a class-plus-element selector already outranks the text-* utility.
  eq('  without reaching for !important', /\.header-mobile-dark svg \{[^}]*!important/.test(css), false);
}

console.log('\n— one equal gap across the row —');
{
  // `contents` dissolves the wrapper so its children join the header's flex row.
  // Both wrappers have to do it, or half the row stays clustered.
  eq('the left wrapper dissolves on phones', header.includes('className="contents sm:block"'), true);
  eq('the right wrapper dissolves too',
    header.includes('className="contents sm:flex sm:items-center sm:gap-2"'), true);
  // From sm up the app name sits beneath the mark; dissolving there would
  // scatter it into the icon row.
  eq('  and both come back from sm', (header.match(/contents sm:/g) ?? []).length, 2);
}

console.log('\n— the mark —');
{
  eq('the white letter mark is used', header.includes('src="/WhiteLetterMarkParlay.png"'), true);
  eq('  and the old dark favicon is gone from the header', header.includes('src="/favicon.png"'), false);
  eq('the app name is legible on the fill',
    header.includes('text-white/70 lg:text-gray-500'), true);
}

console.log('\n— the status bar matches the header —');
{
  // The strip above the header is not styled by the header. On iOS it comes
  // from theme-color and the manifest, which are two hardcoded values in two
  // files — so they drift from the header silently, which is exactly what
  // happened: they stayed #0B3C62 when the header became brand-primary.
  const FILL = '#223A5E';   // brand-primary's default, in lib/brand.ts
  const { BRAND_COLOR_DEFAULTS } = await import('@/lib/brand');
  eq('the fill under test is still the brand default',
    BRAND_COLOR_DEFAULTS.brand_dark_blue, FILL);

  const layout = readFileSync('app/layout.tsx', 'utf8');
  const meta = /<meta name="theme-color" content="(#[0-9A-Fa-f]{6})"/.exec(layout);
  eq('the theme-color meta was found', meta != null, true);
  eq('  and matches the header fill', meta?.[1], FILL);

  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
  eq('the manifest theme matches too', manifest.theme_color, FILL);
  // The splash background, distinct from the status bar but the same colour
  // here so the app does not flash a different navy while it loads.
  eq('  as does the splash background', manifest.background_color, FILL);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
