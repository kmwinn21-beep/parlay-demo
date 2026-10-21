/**
 * The shell covers the screen, on a phone with the app on its Home Screen.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/app-shell-viewport.mjs
 *
 * Reported from an iPhone: the bottom 62px of the screen were the body's
 * background, with the page stopping short of it. 62px is exactly
 * env(safe-area-inset-top) on that phone, which names the cause — iOS lays a
 * standalone web app out from the PHYSICAL top of the screen when the status
 * bar is black-translucent, but still computes `100vh` and `100dvh` as the
 * screen MINUS the status bar. One viewport tall is therefore one status bar
 * short.
 *
 * So the shell has no viewport unit in it at all: it is pinned to the four
 * edges of the screen, and the insets are paid for where they are actually
 * needed — the header's top padding, <main>'s bottom gutter.
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

const shell = readFileSync('components/AppShell.tsx', 'utf8');
const layout = readFileSync('app/layout.tsx', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');
const hook = readFileSync('lib/useViewportOverhang.ts', 'utf8');

console.log('\n— the shell covers the screen, not the viewport —');
{
  eq('the shell wears the class that does it', /<div className="app-viewport flex overflow-hidden bg-gray-50">/.test(shell), true);
  eq('  and the embed shell too', /<main className="app-viewport overflow-y-auto/.test(shell), true);
  // The thing that was wrong. Nothing in here may size itself in vh again.
  eq('no viewport unit sizes either of them',
    /h-screen|h-dvh|100dvh|100vh/.test(shell.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')), false);
  eq('the class takes three edges and a measured height',
    /\.app-viewport \{\n  position: fixed;\n  top: 0;\n  left: 0;\n  right: 0;\n  height: calc\(100% \+ var\(--viewport-overhang, 0px\)\);\n\}/.test(css), true);
  eq('and the document itself still never scrolls',
    /html,\nbody \{\n  overflow: hidden;/.test(css), true);
}

console.log('\n— and it is NOT the shape that gets status-bar padding —');
{
  /*
   * Reported after the first attempt at this: the mobile header looked twice
   * its height with a strip of page above it. The shell had been written as
   * `fixed inset-0`, which is exactly what the overlay rule keys off — so the
   * shell took 62px of padding meant for drawers, and pushed the header, the
   * one element that pays for the inset itself, down by a whole status bar.
   */
  eq('the overlay rule still pads full-screen panels',
    /\.fixed\.inset-0:not\(:empty\):not\(\.items-center\):not\(\.justify-center\) \{\n  padding-top: env\(safe-area-inset-top\);/.test(css), true);
  eq('  and the shell does not carry that pair of classes',
    /className="(fixed inset-0|app-viewport)[^"]*"/.exec(shell)?.[1], 'app-viewport');
  eq('  which is why the class exists at all',
    /A class rather than `fixed inset-0` on the element/.test(css), true);
}

console.log('\n— what the overhang is measured from —');
{
  // env() would be right on this bug and wrong wherever the inset is real
  // and already counted, so the two readings are compared instead.
  eq('the visual viewport against the layout one',
    /const visual = Math\.max\(window\.innerHeight \|\| 0, window\.visualViewport\?\.height \?\? 0\);/.test(hook), true);
  eq('  the layout one being what CSS believes',
    /const layout = root\.clientHeight;/.test(hook), true);
  eq('  nothing where they agree, which is every other browser',
    /overhang > 0 && overhang <= MAX_OVERHANG_PX \? overhang : 0/.test(hook), true);
  eq('  and it is re-read when the screen changes shape',
    /window\.visualViewport\?\.addEventListener\('resize', measure\);/.test(hook), true);
  eq('measured once, above every branch of the shell',
    /useViewportOverhang\(\);/.test(shell), true);
}

console.log('\n— what the insets are still paid for —');
{
  // Pinning the shell to the physical screen is only safe because the two
  // edges that CAN hide something pad themselves.
  eq('the header clears the status bar',
    /--mobile-header-h: calc\(85px \+ env\(safe-area-inset-top\)\);/.test(css), true);
  eq('  and the last row clears the home indicator',
    /pb-\[calc\(1rem\+env\(safe-area-inset-bottom\)\)\]/.test(shell), true);
  // Both of those only mean anything while the page is allowed under them.
  eq('the page is laid out under both', /viewportFit: 'cover'/.test(layout), true);
  eq('  which is what makes the status bar transparent',
    /statusBarStyle: 'black-translucent'/.test(layout), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
