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
import { existsSync, readFileSync } from 'node:fs';

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
// Prose in this stylesheet names the very selectors under test, and matching a
// comment has produced a false result here twice. Assertions read this copy.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

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

console.log('\n— the icons invert with it, and ONLY the bar icons —');
{
  eq('the header carries the hook class', tag.includes('header-mobile-dark'), true);
  eq('the bar icons opt in by class', /\.header-mobile-dark \.header-bar-icon \{ color: #fff; \}/.test(css), true);

  // The regression this replaced: `.header-mobile-dark svg` also matched every
  // icon inside the dropdown panels, which render inside the header — so the
  // Add New menu shipped with white icons on a white panel. A descendant rule
  // over svg must not come back.
  eq('no blanket rule over every svg in the header',
    /\.header-mobile-dark\s+svg\s*\{/.test(css), false);
  // Excluding the panels generically is not possible without flattening them:
  // NotificationBell's panel alone uses three different icon colours.
  const bell = readFileSync('components/NotificationBell.tsx', 'utf8');
  eq('  because panel icons are not all one colour',
    new Set((bell.match(/text-gray-\d00|text-brand-primary/g) ?? [])).size > 1, true);

  // Scoped to the same breakpoint as the fill, or the desktop header's icons
  // would turn white on white.
  const scoped = css.slice(0, css.indexOf('.header-mobile-dark .header-bar-icon'));
  eq('the rule sits inside a max-width query',
    scoped.trimEnd().endsWith('@media (max-width: 1023px) {'), true);

  // Every bar trigger names itself. Miss one and it stays navy on navy.
  const marks = (header.match(/header-bar-icon/g) ?? []).length;
  eq('every bar trigger in Header.tsx is marked', marks, 6);
  eq('  as is the bell', bell.includes('header-bar-icon'), true);
  eq('  and the follow-ups triangle',
    readFileSync('components/OutstandingFollowUps.tsx', 'utf8').includes('header-bar-icon'), true);
}

console.log('\n— a selected control stays legible —');
{
  // Tapping a header control leaves it on a light background, and a white icon
  // on that is invisible — the Add New menu shipped that way. While selected
  // the icon takes the header's own fill instead.
  eq('the selected background is defined',
    /\.header-mobile-dark \.header-bar-btn-active \{ background-color:/.test(css), true);
  eq('  and the selected icon takes the brand fill',
    /\.header-mobile-dark \.header-bar-btn-active \.header-bar-icon \{\s*color: rgb\(var\(--brand-primary-rgb\)\);/.test(css), true);
  // The variable, not a literal: the header it has to match is painted from the
  // same one, so an account that customised Primary #1 stays consistent.
  eq('  from the variable rather than a hardcoded hex',
    /\.header-bar-btn-active \.header-bar-icon \{\s*color: #/.test(css), false);

  // Driven by state, never by :hover. On iOS a tap leaves :hover stuck, which
  // is what produced the invisible icon; a selected style built on hover would
  // fail wherever the hover does NOT stick.
  eq('every toggle marks itself selected from its own state',
    (header.match(/header-bar-btn-active/g) ?? []).length, 4);
  eq('  including the bell',
    readFileSync('components/NotificationBell.tsx', 'utf8').includes("open ? 'header-bar-btn-active'"), true);
  eq('  and the follow-ups triangle',
    readFileSync('components/OutstandingFollowUps.tsx', 'utf8').includes("open ? 'header-bar-btn-active'"), true);
  // The CSS selector must not depend on :hover. (The buttons still carry an
  // ordinary hover:bg-gray-100 for pointers — that is not what selects them.)
  // Comments stripped first: the block above this rule explains why hover is
  // the wrong hook, and matching that prose failed the assertion for the wrong
  // reason.
  eq('  and the selected rule does not depend on :hover',
    /:hover[^{]*header-bar-btn-active|header-bar-btn-active[^{]*:hover/.test(cssNoComments), false);
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

console.log('\n— the mark opens the nav —');
{
  // White on the fill, and the colour favicon while selected — the selected
  // state fills the button with the page colour, and a white mark on that is
  // the same invisible-icon problem the other controls had.
  eq('the white letter mark is the resting state',
    header.includes("navOpen ? '/favicon.png' : '/WhiteLetterMarkParlay.png'"), true);
  eq('the app name is legible on the fill',
    header.includes('text-white/70 lg:text-gray-500'), true);

  // It toggles the floating nav rather than linking to the dashboard, which is
  // the menu's own first item.
  eq('the mark is a button, not a link', /<button\s+ref=\{markRef\}/.test(header), true);
  eq('  that toggles the shared nav state', header.includes('setNavOpen(v => !v)'), true);
  // FloatingNav lays its menu out around a point and has no other way to learn
  // where its trigger is.
  eq('  and publishes its own rectangle as the anchor',
    header.includes('setNavAnchor({ x: rect.left, y: rect.top'), true);

  // Search leads, the mark trails. Done with `order` because the two sit in
  // different wrappers that display:contents has already dissolved.
  eq('the mark sits last in the row', header.includes('order-last sm:order-none'), true);
  eq('  and search first', header.includes('order-first sm:order-none'), true);
}

console.log('\n— hide is gone —');
{
  const shell = readFileSync('components/AppShell.tsx', 'utf8');
  const nav = readFileSync('components/FloatingNav.tsx', 'utf8');
  eq('the hide context is deleted',
    existsSync('components/FloatingNavHiddenContext.tsx'), false);
  eq('  and nothing still imports it',
    /FloatingNavHidden|navHidden/.test(header + shell + nav), false);
  eq('the Hide pill is gone', />\s*Hide\s*</.test(nav), false);
  eq('the header hamburger that undid it is gone too',
    header.includes('header-unhide-nav-btn'), false);
  // Intelligence and Sign out were kept.
  eq('Intelligence survives', nav.includes('>\n            Intelligence\n          </button>') || nav.includes('Intelligence'), true);
  eq('  as does Sign out', nav.includes('Sign out'), true);
}

console.log('\n— the taller bar —');
{
  // 60px of content, measured in dev tools. min-height is border-box, so it
  // carries the 24px of padding and the 1px border with it.
  eq('the bar is 85px so its content row is 60', tag.includes('min-h-[85px]'), true);
  eq('  and unchanged from lg', tag.includes('lg:min-h-0'), true);
  // The chevrons are a second, smaller state signal next to a control that
  // already fills when selected.
  eq('the dropdown chevrons are desktop-only',
    (header.match(/header-bar-icon hidden lg:block w-3\.5/g) ?? []).length, 2);

  // Sized for a thumb. 44px is the floor Apple and WCAG both name, and the
  // target grows with the glyph — enlarging only the glyph would leave the
  // same undersized hit area.
  eq('icons are 28px on phones',
    /\.header-mobile-dark \.header-bar-icon \{ width: 28px; height: 28px; \}/.test(css), true);
  eq('  in 44px targets',
    /\.header-mobile-dark \.header-bar-btn \{ width: 44px; height: 44px; \}/.test(css), true);
  eq('  with a 40px mark',
    /\.header-mobile-dark \.header-bar-mark \{ width: 40px; height: 40px; \}/.test(css), true);
  // Opt-in by class, like the colours, because the dropdown panels render
  // inside the header and a descendant width rule would resize them too.
  eq('the fixed-size triggers name themselves',
    (header.match(/header-bar-btn[^-]/g) ?? []).length, 2);
  eq('  including the bell',
    readFileSync('components/NotificationBell.tsx', 'utf8').includes('header-bar-btn '), true);
  eq('  and the follow-ups triangle',
    readFileSync('components/OutstandingFollowUps.tsx', 'utf8').includes('header-bar-btn '), true);
  eq('no blanket width rule over the header',
    /\.header-mobile-dark\s+(svg|button)\s*\{[^}]*width/.test(cssNoComments), false);
}

console.log('\n— the header paints under the status bar —');
{
  const layout = readFileSync('app/layout.tsx', 'utf8');

  // Standalone on iOS, theme-color does NOT drive the status bar — that meta
  // only tints Safari's chrome in a tab. Unset, the bar defaults to an opaque
  // light strip above the fill, which is the white band this removes.
  eq('the status bar is translucent',
    /statusBarStyle:\s*'black-translucent'/.test(layout), true);
  eq('  and the app declares itself capable', /capable:\s*true/.test(layout), true);
  // Required for the viewport to extend into the inset at all.
  eq('the viewport covers the display', /viewportFit:\s*'cover'/.test(layout), true);

  // Translucent means the clock and battery sit OVER the page, so the header
  // has to pad itself clear of them or the icon row hides behind them.
  eq('the header pads by the safe-area inset',
    /padding-top:\s*calc\(0\.75rem \+ env\(safe-area-inset-top\)\)/.test(cssNoComments), true);
  // Via the shared variable, which is where that calc now lives — the drawers
  // sit against the same number.
  eq('  and grows its min-height to match',
    /min-height:\s*var\(--mobile-header-h\)/.test(cssNoComments), true);
  // Measured in Chromium: with no inset the header is 85px with a 60px content
  // row, unchanged; with a 59px inset it is 144px and the row is still 60px.
  // env() is 0 wherever there is no inset, so the two cases share one rule.
}

console.log('\n— overlays clear the status bar too —');
{
  // The header is not the only thing fixed at top:0. With a translucent status
  // bar every full-screen overlay runs under the clock, which is how a drawer
  // shipped with its close button behind it.
  eq('full-screen overlays pad by the inset',
    /\.fixed\.inset-0:not\(:empty\):not\(\.items-center\):not\(\.justify-center\)\s*\{\s*padding-top: env\(safe-area-inset-top\);/
      .test(cssNoComments), true);

  // A backdrop is an empty self-closing div, and it SHOULD reach the top edge
  // or the dimming stops short of the bar.
  eq('  but backdrops are excluded by :not(:empty)',
    /:not\(:empty\)/.test(cssNoComments), true);
  // A centred dialog is already clear of the bar and carries its own p-4 that
  // this rule would otherwise replace with 0 on every device without an inset.
  eq('  as are centred dialogs',
    /:not\(\.items-center\):not\(\.justify-center\)/.test(cssNoComments), true);

  // Verified in Chromium against the compiled CSS with the inset restated as a
  // literal: backdrops 0px, centred modals keep their 16px, panels and bottom
  // sheets and the opt-in side drawer take the inset.
  eq('an opt-in class exists for overlays that are not inset-0',
    /\.safe-area-top \{\s*padding-top: env\(safe-area-inset-top\);/.test(cssNoComments), true);
  eq('  and the one top-anchored side drawer uses it',
    readFileSync('components/MeetingNotetaker.tsx', 'utf8').includes('safe-area-top fixed top-0 right-0'), true);

  // Not scoped to a breakpoint: env() is 0 where there is no inset, and a
  // tablet in landscape has one well above 1023px.
  const rule = cssNoComments.slice(cssNoComments.indexOf('.fixed.inset-0:not(:empty)'));
  eq('the overlay rule is not trapped in the mobile media query',
    rule.slice(0, rule.indexOf('}')).includes('@media'), false);
}

console.log('\n— full-screen modals clear it too —');
{
  // The overlay rule above pads the `fixed inset-0` CONTAINER, and that does
  // nothing for these four: their panel is `absolute inset-0`, and an
  // absolutely positioned child resolves against its containing block's
  // PADDING BOX — which includes the padding, so top:0 still means the very
  // top. Proven in Chromium: with the container padded 59px, an in-flow child
  // started at y=59 and an absolute inset-0 child at y=0.
  //
  // So each of these pads its own header bar, whose children ARE in flow.
  const MODALS = [
    'components/PreConferenceReview.tsx',
    'components/PostConferenceReview.tsx',
    'components/ConferenceEffectivenessModal.tsx',
    'components/MyDebriefDrawer.tsx',
  ];
  for (const f of MODALS) {
    const src = readFileSync(f, 'utf8');
    const name = f.replace('components/', '').replace('.tsx', '');
    eq(`${name} pads its header by the inset`,
      /pt-\[calc\(1rem_\+_env\(safe-area-inset-top\)\)\]|pt-\[env\(safe-area-inset-top\)\]/.test(src), true);
    // Centred from sm up, where there is nothing to clear.
    eq(`  and resets it from sm`, /sm:pt-(4|0)/.test(src), true);
  }

  // Tailwind arbitrary values rather than a class of my own, so Tailwind's
  // utility order settles the tie with py-4 instead of my stylesheet's
  // position in the cascade. Verified in the compiled CSS: .py-4 at 3899,
  // .pt-[calc(1rem_+_env(...))] at 4076, and the sm: resets inside the
  // min-width query at 6839+.
  eq('the arbitrary value keeps the base padding rather than replacing it',
    readFileSync('components/PreConferenceReview.tsx', 'utf8').includes('px-6 py-4 pt-[calc(1rem_+_env('), true);
}

console.log('\n— bottom sheets stop at the header —');
{
  // They were sized h-[90vh] from the bottom edge, which was fine until
  // viewport-fit:cover made `vh` include the status bar: 90vh then reaches
  // past the header and over the clock.
  eq('the sheet anchors its top to the header height',
    /\.drawer-mobile-responsive\.fixed\.bottom-0\.left-0\.right-0 \{\s*top: var\(--mobile-header-h\);/
      .test(cssNoComments), true);
  // Anchoring top AND bottom is only a span if the height stops fighting it —
  // the markup still carries h-[90vh] for its sm+ layout.
  eq('  and lets top and bottom decide the height',
    /\.drawer-mobile-responsive\.fixed\.bottom-0\.left-0\.right-0 \{[^}]*height: auto;/
      .test(cssNoComments), true);

  // One definition of the header's height, used by the header AND by what sits
  // under it — the drift that put theme-color in a different navy from the
  // header is the reason this is a variable rather than a repeated calc.
  eq('the header height is declared once',
    /--mobile-header-h: calc\(85px \+ env\(safe-area-inset-top\)\);/.test(cssNoComments), true);
  eq('  and the header itself reads it',
    /\.header-mobile-dark \{[^}]*min-height: var\(--mobile-header-h\);/.test(cssNoComments), true);
  eq('  with no second hardcoded copy of that height',
    (cssNoComments.match(/calc\(85px \+ env\(safe-area-inset-top\)\)/g) ?? []).length, 1);

  // Below sm only: from 640px these are right-hand drawers with sm:inset-y-0,
  // and the mobile header is not what they sit under.
  const idx = cssNoComments.indexOf('.drawer-mobile-responsive.fixed.bottom-0');
  eq('the sheet rule is scoped below sm',
    cssNoComments.slice(0, idx).trimEnd().endsWith('@media (max-width: 639px) {'), true);

  // Measured in Chromium at 430px: header bottom 85, drawer top 85 — flush —
  // spanning 85 to 932. At 900px it is a full-height side drawer, top 0.
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
