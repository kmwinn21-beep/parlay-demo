/**
 * What the app does when object storage is having a bad day.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/image-fallback.mjs
 *
 * Reported from production: every conference logo and attendee photo drew the
 * browser's broken-image glyph, and new uploads failed with "Failed to save
 * logo." The cause was the R2 bucket being switched off at the provider —
 * public reads 403'd and PutObject threw — but neither symptom said so. The
 * glyph reads as a lost record rather than a picture that did not arrive, and
 * the toast collapsed storage, database and validation failures into one
 * sentence whose reason only existed in a server log.
 *
 * Both are fixed here: an image that will not load falls back to the initials
 * the avatar already draws when there is no image, and the upload routes say
 * which half of themselves failed.
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
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

const avatar = strip('components/ConferenceAvatar.tsx');
const photo = strip('components/AttendeePhoto.tsx');
const logoRoute = strip('app/api/conferences/[id]/logo/route.ts');
const photoRoute = strip('app/api/attendees/[id]/photo/route.ts');

console.log('\n— an image that will not load —');
{
  eq('the conference avatar notices', /onError=\{\(\) => setFailed\(true\)\}/.test(avatar), true);
  eq('  and draws the initials instead', /\{logoUrl && !failed/.test(avatar), true);
  // Replacing a broken logo must show the new one rather than staying failed.
  eq('  until the url changes', /useEffect\(\(\) => \{ setFailed\(false\); \}, \[logoUrl\]\);/.test(avatar), true);

  eq('the attendee avatar does the same',
    (photo.match(/onError=\{\(\) => setFailed\(true\)\}/g) ?? []).length, 2);
  eq('  resetting on a new photo',
    (photo.match(/useEffect\(\(\) => \{ setFailed\(false\); \}, \[photoUrl\]\);/g) ?? []).length, 2);
  /*
   * A photo that cannot be fetched is treated as no photo at all, which also
   * puts the "add a photo" prompt back within reach — the right offer for a
   * face nobody can see.
   */
  eq('  and a dead photo behaves as no photo',
    /const shown = photoUrl && !failed \? photoUrl : null;/.test(photo), true);
  eq('    so the viewer opens on something that exists', /\{showPhoto && shown && \(/.test(photo), true);
  eq('    and the title offers to add one', /title=\{shown \? `View \$\{name\}'s photo` : 'Add a photo'\}/.test(photo), true);
  eq('  the read-only avatar falls back too', /if \(!photoUrl \|\| failed\) return <span className=\{shell\}/.test(photo), true);
}

console.log('\n— an upload that fails says which half —');
{
  for (const [label, route, noun] of [['the logo route', logoRoute, 'logo'], ['the photo route', photoRoute, 'photo']]) {
    eq(`${label} reports a storage failure`,
      /return NextResponse\.json\(\{ error: storageFailure\(err\) \}, \{ status: 502 \}\);/.test(route), true);
    // The provider's error name is the diagnostic bit — NoSuchBucket and
    // AccessDenied name different things to go and fix — and is not sensitive.
    eq(`  naming the provider's own code`,
      /Image storage rejected the upload\$\{name \? ` \(\$\{name\}\)` : ''\}/.test(route), true);
    eq(`  and never the useless 'Error'`,
      /err\.name !== 'Error' \? err\.name : null/.test(route), true);
    eq(`${label} reports a database failure apart from it`,
      new RegExp(`The ${noun} was uploaded but could not be recorded`).test(route), true);
    eq(`  with the reason in the log`, /database write failed:', err\);/.test(route), true);
    // And the detail that is not shown is still written down.
    eq(`  as the storage one is`, /R2 upload failed:', err\);/.test(route), true);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
