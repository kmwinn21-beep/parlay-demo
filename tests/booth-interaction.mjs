/**
 * What a rep says happened when they scan a badge, and what assigning it makes.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/booth-interaction.mjs
 *
 * The four buttons — Stopped By, Demo, Meeting, Follow-up Req — were hard-coded
 * in three components and were not the touchpoint types the account had
 * configured. An account whose floor work is Coffee, Dinner and Session was
 * being asked about booth demos, and every interaction produced the same one
 * "Booth Stop" follow-up regardless of what the rep picked.
 *
 * The tag round trip is BEHAVIOUR and is run here. Which branch the submit
 * route takes is structure, read off the file, because the legacy branches have
 * to keep working for notes already sitting in the queue.
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

const { touchpointTag, touchpointIdFromTag, interactionLabel, LEGACY_BOOTH_LABELS } =
  await import('@/lib/boothInteraction');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const OPTIONS = [
  { id: 11, value: 'Booth Stop' },
  { id: 12, value: 'Coffee' },
  { id: 13, value: 'Dinner' },
];

console.log('\n— the tag that survives the round trip —');
{
  // Stored on quick_notes.secondary_tag as text, read back when the note is
  // assigned, possibly days later.
  eq('an option becomes a tag', touchpointTag(13), 'tp:13');
  eq('  and the tag becomes the option again', touchpointIdFromTag('tp:13'), 13);
  eq('  for any id', touchpointIdFromTag(touchpointTag(4291)), 4291);

  // Everything that is not one of ours has to read as "not a touchpoint"
  // rather than as id zero, or the submit route logs against a row that is
  // not there.
  eq('the four buttons this replaced are not touchpoint tags',
    Object.keys(LEGACY_BOOTH_LABELS).map(touchpointIdFromTag), [null, null, null, null]);
  eq('an untagged note is not one', touchpointIdFromTag(null), null);
  eq('  nor an empty string', touchpointIdFromTag(''), null);
  eq('  nor a prefix with nothing after it', touchpointIdFromTag('tp:'), null);
  eq('  nor a non-numeric id', touchpointIdFromTag('tp:abc'), null);
  eq('  nor a zero id, which no row has', touchpointIdFromTag('tp:0'), null);
  eq('  nor a negative one', touchpointIdFromTag('tp:-3'), null);
  eq('  nor a fractional one', touchpointIdFromTag('tp:1.5'), null);
  // The prefix has to anchor. Worth noting that startsWith and includes are
  // behaviourally identical here — the slice offset is fixed, so a tp: found
  // mid-string can never leave digits at index 3, and a brute force over every
  // string up to length six finds no input that tells them apart. startsWith
  // stays because it says what is meant, not because a test can catch it.
  eq('  and the prefix must start the tag', touchpointIdFromTag('xtp:13'), null);
}

console.log('\n— what the note badge says —');
{
  eq('a touchpoint tag names the touchpoint',
    interactionLabel('tp:12', OPTIONS), 'Coffee');
  eq('  whichever one', interactionLabel('tp:11', OPTIONS), 'Booth Stop');

  // Notes scanned before this change are still in the queue waiting to be
  // assigned. Their tags have to keep rendering.
  eq('a legacy tag still reads', interactionLabel('booth-stop', OPTIONS), 'Stopped By');
  eq('  all four of them',
    ['booth-stop', 'booth-demo', 'booth-meeting', 'booth-followup'].map(t => interactionLabel(t, OPTIONS)),
    ['Stopped By', 'Demo', 'Meeting', 'Follow-up Req']);

  // Null means render no badge. "tp:14" on screen would be worse than nothing.
  eq('a touchpoint since deleted shows nothing', interactionLabel('tp:99', OPTIONS), null);
  eq('  and so does no tag at all', interactionLabel(null, OPTIONS), null);
  eq('  or an unknown one', interactionLabel('something-else', OPTIONS), null);
  eq('  or an empty option list', interactionLabel('tp:12', []), null);
}

console.log('\n— the buttons are the account\'s own list —');
{
  const picker = strip('components/BoothInteractionPicker.tsx');

  // Verified in Chromium at 390 wide against a seven-option list: the heading
  // reads "Touchpoint Type", six show, "1 more" reveals Session, "Show fewer"
  // collapses it, and picking Dinner reports tp:13 with the label "Dinner".
  eq('the heading names touchpoints, not what happened',
    /Touchpoint Type/.test(picker) && !/What happened\?/.test(picker), true);
  eq('  and the options come from the account\'s config',
    /useTouchpointOptions\(\)/.test(picker), true);
  eq('  with no hard-coded list left in it', /booth-stop|Stopped By/.test(picker), false);

  // hidden counted off the collapsed slice, not the visible one — measuring
  // the visible list makes it zero once expanded and the toggle disappears
  // with it, leaving the picker expandable but not collapsible.
  eq('the toggle survives being expanded',
    /const hidden = Math\.max\(0, options\.length - VISIBLE_ROWS \* 2\);/.test(picker), true);
  eq('  and says so both ways', /showAll \? 'Show fewer' : `\$\{hidden\} more`/.test(picker), true);
  eq('Skip is still there', /onSelect\('skip', ''\)/.test(picker), true);
  // The label travels with the tag. Without it the confirmation cannot name
  // the touchpoint, because none of the three callers holds the list.
  eq('  and a pick reports its label alongside the tag',
    /onSelect\(touchpointTag\(opt\.id\), opt\.value\)/.test(picker), true);

  // One list, not three. It was written out in all three places a badge can
  // be scanned, which is how it came to be wrong in all three at once.
  const users = ['components/QuickNotesSection.tsx', 'components/DashboardActionCard.tsx'];
  for (const f of users) {
    const src = strip(f);
    eq(`${f} uses the shared picker`, /BoothInteractionPicker/.test(src), true);
    eq('  and declares no list of its own', /const BOOTH_INTERACTIONS = \[/.test(src), false);
  }
  // The floating add button reaches it through the dashboard's modal.
  eq('the floating add button goes through that modal',
    /BadgeScanResultsModal/.test(readFileSync('components/FloatingNav.tsx', 'utf8')), true);

  // The confirmation names the touchpoint, which is only possible because the
  // picker hands the label back with the tag.
  for (const f of [...users, 'components/FloatingNav.tsx']) {
    eq(`${f} names the touchpoint when it saves`,
      /const label = tagLabel \? `\$\{tagLabel\} logged` : /.test(strip(f)), true);
    eq('  and no longer guesses from four fixed values',
      /secondaryTag === 'booth-demo' \? 'Demo logged'/.test(strip(f)), false);
  }
}

console.log('\n— the follow-up is the touchpoint that was picked —');
{
  const api = strip('app/api/booth-scan/submit/route.ts');

  eq('the route reads the tag as a touchpoint',
    /const touchpointId = touchpointIdFromTag\(interaction_type\);/.test(api), true);
  eq('  and looks the option up by id',
    /WHERE category = 'touchpoints' AND id = \?/.test(api), true);
  eq('  logging the touchpoint the rep chose',
    /INSERT INTO attendee_touchpoints \(attendee_id, conference_id, option_id\) VALUES \(\?, \?, \?\)[\s\S]{0,120}args: \[attendee_id, conference_id, touchpointId\]/.test(api), true);

  // The point of the whole change: a Dinner produces a Dinner follow-up, not
  // the one fixed "Booth Stop" every interaction used to get.
  const branch = api.slice(api.indexOf('if (touchpointId !== null'), api.indexOf('if (isMeeting'));
  eq('the follow-up is named after that touchpoint',
    /const tpValue = String\(tpOption\.rows\[0\]\.value\);/.test(branch)
    && /next_steps, next_steps_notes[\s\S]{0,200}tpValue, subtextNotes \?\? tpValue/.test(branch), true);
  eq('  and nothing in it is hard-coded to Booth Stop',
    /'Booth Stop'/.test(branch), false);
  eq('  with auto_follow_up still forcing one when the rep filled nothing in',
    /Number\(tpOption\.rows\[0\]\.auto_follow_up\) === 1 \|\| subtextNotes/.test(branch), true);
  // A touchpoint deleted between the scan and the assignment must not insert
  // against a row that is not there.
  eq('a deleted touchpoint logs nothing rather than a bad row',
    /if \(tpOption\.rows\.length > 0\) \{/.test(branch), true);

  // Notes scanned before the change are still in the queue. Their branches
  // have to survive or assigning one does nothing at all.
  eq('the legacy meeting branch is still there',
    /const isMeeting = interaction_type === 'booth-demo' \|\| interaction_type === 'booth-meeting';/.test(api), true);
  eq('  and the legacy booth-stop branch', /const isConvo = interaction_type === 'booth-stop';/.test(api), true);
  eq('  and the legacy follow-up branch', /const isFollowup = interaction_type === 'booth-followup';/.test(api), true);

  // The assign flow itself is unchanged: the capture modal passes the tag
  // through and does not branch on it.
  const notes = strip('components/QuickNotesSection.tsx');
  eq('the capture modal still just passes the tag along',
    /interaction_type: interactionType,/.test(notes), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
