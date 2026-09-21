/**
 * Reading a note for an interaction that already happened.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/activity-scan.mjs
 *
 * The scanner has one job — did something happen — because whether it was a
 * meeting or a touchpoint is a judgement about how a team uses those words, and
 * the person who wrote the note is asked instead.
 *
 * What is actually hard is past versus intended. Nearly every conference note
 * ends "…want to schedule a follow up meeting", so a scanner that reads the
 * word "meeting" fires on almost all of them, and a dialog that appears when
 * nothing happened costs a dismissal every time. Most of the assertions below
 * are about NOT firing.
 *
 * The other half is the loop: logging a touchpoint writes a note describing a
 * touchpoint. Scanning that note would offer to log what was just logged.
 *
 * CALIBRATION: the phrase lists are drawn from two real examples and variants
 * written to probe the edges, not from a corpus of real notes. These tests pin
 * the behaviour that exists; they do not prove it matches how this account's
 * users write. That needs real notes.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const { scanForActivity, shouldScanNote } = await import('@/lib/suggestions/activityScan');

/** Did it fire, and on what? */
const hit = (text) => scanForActivity(text)?.phrase ?? null;

console.log('\n— the two notes this was built from —');
{
  // Both describe something that happened; both end with an intention. The
  // scanner fires on both and says nothing about which kind it was — that is
  // the chooser's question.
  const coffee = 'Had coffee with Kevin from Mission Health. They\'re interested and want to schedule a follow up meeting';
  const met = 'Met with Kevin from Mission Health. They\'re interested and want to schedule a follow up meeting';

  eq('the coffee note is an interaction', hit(coffee), 'Had coffee');
  eq('the met-with note is an interaction', hit(met), 'Met with');
  // The trailing clause is identical in both and must not be what matched.
  eq('  and neither matched on the follow-up they are planning',
    [scanForActivity(coffee).index, scanForActivity(met).index], [0, 0]);
  eq('the scanner offers no opinion on which kind it was',
    Object.keys(scanForActivity(coffee)).sort(), ['index', 'phrase']);
}

console.log('\n— an intention is not an interaction —');
{
  eq('wanting a meeting is not having had one',
    hit('They\'re interested and want to schedule a follow up meeting'), null);
  eq('nor is planning one', hit('Planning to meet with Kevin on Thursday'), null);
  eq('nor hoping', hit('Hoping to grab coffee with her before the keynote'), null);
  eq('nor needing', hit('Need to set up a call with their CFO'), null);
  eq('nor a future tense', hit('Will meet with the Mission Health team tomorrow'), null);
  eq('nor an obligation', hit('Should probably stop by their booth at some point'), null);
  eq('nor an ask', hit('She asked to meet with us at the next show'), null);
  eq('nor an agreement to', hit('They agreed to meet with our VP next quarter'), null);
  eq('a bare mention of the word meeting does nothing',
    hit('Their team meeting cadence is monthly'), null);
}

console.log('\n— the past-tense rule, which does most of the work —');
{
  // The primary defence is not a veto, it is the list: only past forms are in
  // it. These assert that directly, because every "intention" case above would
  // also pass with both vetoes deleted — the phrase simply never matches.
  eq('the base form of a verb is a plan, not an event', hit('meet with Kevin'), null);
  eq('  and so is the infinitive after anything', hit('grab coffee with Dana'), null);
  eq('  and the imperative', hit('stop by their booth'), null);
  eq('  and the gerund', hit('meeting with Kevin at 3'), null);
  eq('but the past form of the same verb is an event', hit('met with Kevin'), 'met with');
  eq('  and so is the rest of them',
    [hit('grabbed coffee with Dana'), hit('stopped by their booth')],
    ['grabbed coffee', 'stopped by']);
}

console.log('\n— intent still vetoes where English lets it —');
{
  // A past participle CAN follow an intent marker, through a passive "get".
  // These are the cases the veto actually exists for, and every one is an
  // ordinary sentence somebody would write.
  eq('wanting to be introduced is not having been',
    hit('Want to get introduced to their CFO'), null);
  eq('  nor is hoping to be connected',
    hit('Looking to get connected with their VP of Ops'), null);
  eq('  nor hoping to be walked through it',
    hit('Hoping to get walked through their process next week'), null);
  // The same words with the intent removed are an interaction.
  eq('but being introduced is', hit('Introduced to their CFO at the reception'), 'Introduced to');
  eq('  and so is being connected', hit('Connected with their VP of Ops'), 'Connected with');
  // A full stop ends the clause: what happened before it does not govern this.
  eq('an intent in the previous sentence does not reach across the stop',
    hit('Wanted to see them. Met with Kevin an hour later'), 'Met with');
}

console.log('\n— an interaction that did not happen —');
{
  // These use past forms that DO match, so the negation veto is what stops
  // them — unlike the intent cases, which the phrase list alone would catch.
  eq('never having met is not having met', hit('Never met with Kevin — he was in sessions all day'), null);
  eq('  nor never having spoken', hit('Never spoke to their CFO in the end'), null);
  eq('  nor never having gone', hit('We never stopped by their booth'), null);
  eq('  nor having failed to', hit('Didn\'t meet with them in the end'), null);
  eq('  nor being unable to', hit('Was unable to meet with the Mission team'), null);
  // And the same sentences without the negation are interactions.
  eq('but having met is', hit('Met with Kevin — he was between sessions'), 'Met with');
  eq('  and having spoken is', hit('Spoke to their CFO in the end'), 'Spoke to');
}

console.log('\n— what an interaction sounds like —');
{
  const fires = [
    ['Spoke to Dana at their booth about the pilot', 'Spoke to'],
    ['Stopped by the booth and talked to their CIO', 'Stopped by the booth'],
    ['Grabbed lunch with the Ridgeline folks', 'Grabbed lunch'],
    ['Ran into Kevin in the hallway, good conversation', 'Ran into'],
    ['Sat down with their whole exec team for an hour', 'Sat down with'],
    ['Walked through the roadmap with Dana', 'Walked through'],
    ['Caught up with Sam from last year', 'Caught up with'],
    ['Bumped into their COO at the reception', 'Bumped into'],
    ['Had a good conversation about their EHR migration', 'Had a good conversation'],
    ['Demoed the reporting module for their team', 'Demoed'],
  ];
  for (const [text, want] of fires) eq(`"${text.slice(0, 44)}…"`, hit(text), want);
}

console.log('\n— the event, not the plan that follows it —');
{
  // A note opens with what happened and closes with what happens next. The
  // earliest surviving match is the event.
  const n = 'Stopped by their booth with Dana. Want to set up a demo next week.';
  eq('the opener is what is quoted', hit(n), 'Stopped by');
  eq('  and it is quoted as written, not lowercased',
    hit('MET WITH Kevin at the booth'), 'MET WITH');
  // A surname ending in the verb is not the verb. Without the boundary check
  // "Emmet with" reads as "met with".
  eq('a phrase inside a longer word is not a match',
    hit('Their CTO is called Emmet with a double m'), null);
  eq('  though the same words standing alone are',
    hit('Their CTO, Emmet. Met with him at the booth'), 'Met with');
}

console.log('\n— vendor language is left entirely alone —');
{
  // The vendor extractor reads these. This must not also fire on them, or a
  // note listing systems becomes a dialog about a meeting.
  eq('a vendor list is not an interaction',
    hit('They use Yardi for billing and are evaluating PointClickCare'), null);
  eq('  nor is switching away from one',
    hit('Ripping out their current EHR, transitioning off it in Q3'), null);
  eq('  nor is a pilot', hit('Piloting Lesley across four communities'), null);
  // But a note that does both still fires — the vendor extractor reads the
  // same sentence separately and neither suppresses the other.
  eq('a note that does both is still an interaction',
    hit('Met with Kevin. They use Yardi and are evaluating PointClickCare'), 'Met with');
}

console.log('\n— nothing to read —');
{
  eq('an empty note', hit(''), null);
  eq('whitespace only', hit('   \n  '), null);
  eq('a note with no interaction in it', hit('Booth 412. Badge scanned.'), null);
}

console.log('\n— the loop: a note the activity itself wrote —');
{
  const base = { content: 'Had coffee with Kevin from Mission Health' };
  eq('an ordinary note is read', shouldScanNote(base), true);
  // Logging a touchpoint posts a note carrying touchpoint_type; logging a
  // meeting posts one with note_type meeting_note. Both describe exactly what
  // this scanner looks for, so reading them would offer to log what was just
  // logged — and accepting would write another note.
  eq('a note written by the touchpoint form is not',
    shouldScanNote({ ...base, touchpoint_type: 'Coffee' }), false);
  eq('  nor one written by the meeting log',
    shouldScanNote({ ...base, note_type: 'meeting_note' }), false);
  eq('  nor one attached to a meeting',
    shouldScanNote({ ...base, meeting_id: 42 }), false);
  eq('a badge scan carries a name, not prose',
    shouldScanNote({ ...base, tag: 'card-badge' }), false);
  eq('an empty note is not read', shouldScanNote({ content: '   ' }), false);
  // An empty string in those columns is not a claim about where it came from.
  eq('a blank touchpoint_type does not suppress',
    shouldScanNote({ ...base, touchpoint_type: '' }), true);
  eq('  and note_type is matched case-insensitively',
    shouldScanNote({ ...base, note_type: 'Meeting_Note' }), false);
}

console.log('\n— nothing here touches the vendor extractor —');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('lib/suggestions/activityScan.ts', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Structural, and the point of the whole design: the vendor path is a model
  // call behind a flag, this is a local function on submit. Sharing anything
  // would make one able to break the other.
  eq('it imports nothing at all', /^\s*import /m.test(code), false);
  eq('  in particular not the extractor', /from '\.\/extract'/.test(code), false);
  eq('  nor the target registry', /from '\.\/registry'/.test(code), false);
  eq('  and makes no model call', /Anthropic|messages\.create/.test(code), false);
  eq('  and reads no database', /db\.execute|getDb/.test(code), false);
}

console.log('\n— the one file both features share —');
{
  // The chooser needs the note's text and context, which means widening the
  // event. It is the only thing the vendor prompt and this have in common, so
  // its current contract is pinned before anything is added to it.
  const { readFileSync } = await import('node:fs');
  const announce = readFileSync('lib/suggestions/announce.ts', 'utf8');
  eq('the event name is what the listener waits for',
    /export const NOTE_SAVED_EVENT = 'parlay:note-saved'/.test(announce), true);
  eq('  and the detail still carries the two fields it always did',
    /entityType: 'attendee' \| 'company' \| 'conference' \| string;[\s\S]{0,40}entityId: number;/.test(announce), true);

  // Dispatch, for real. A fake window is enough — the function only needs
  // somewhere to send it.
  const events = [];
  globalThis.window = { dispatchEvent: (e) => { events.push(e); return true; } };
  const { announceNoteSaved, NOTE_SAVED_EVENT } = await import('@/lib/suggestions/announce');

  announceNoteSaved('attendee', 7);
  eq('saving a note announces it', events.length, 1);
  eq('  under the name the listener knows', events[0].type, NOTE_SAVED_EVENT);
  eq('  carrying who it was about', events[0].detail, { entityType: 'attendee', entityId: 7 });

  announceNoteSaved('company', null);
  announceNoteSaved('company', undefined);
  announceNoteSaved('company', 0);
  eq('nothing is announced without an id', events.length, 1);

  announceNoteSaved('company', '12');
  eq('an id arriving as a string is still a number',
    events[1].detail, { entityType: 'company', entityId: 12 });

  // The added context has to arrive, or the chooser has nothing to read. This
  // is the whole reason the event was widened.
  announceNoteSaved('attendee', 31, {
    text: 'Met with Kevin', conferenceId: 8, companyId: 12, attendeeId: 31,
    conferenceName: 'NextGen Summit', companyName: 'Mission Health',
    attendeeName: 'Kevin Winn', touchpointType: null, noteType: null,
    meetingId: null, tag: null,
  });
  eq('the note\'s text reaches the listener', events[2].detail.text, 'Met with Kevin');
  eq('  along with the records it was filed against',
    [events[2].detail.companyId, events[2].detail.attendeeId, events[2].detail.conferenceId],
    [12, 31, 8]);
  eq('  and their names, for the chooser to show',
    [events[2].detail.companyName, events[2].detail.attendeeName, events[2].detail.conferenceName],
    ['Mission Health', 'Kevin Winn', 'NextGen Summit']);
  eq('  and what wrote the note, for the loop guard',
    Object.keys(events[2].detail).includes('touchpointType'), true);
  // Context must never be able to overwrite who the note was about.
  announceNoteSaved('attendee', 31, { entityType: 'company', entityId: 999 });
  eq('context cannot overwrite the entity it was filed against',
    [events[3].detail.entityType, events[3].detail.entityId], ['attendee', 31]);
  delete globalThis.window;
}

console.log('\n— real notes, as they are actually written —');
{
  // Ten real floor notes, with names and companies replaced but every
  // grammatical construction kept exactly: the openers are what the scanner
  // reads and the rest is customer intelligence that does not belong in a
  // fixture. Measured against the originals before anonymising; the result is
  // the same because nothing here keys on a name.
  //
  // Six of these fired before they were used for tuning. The four that did not
  // are marked, and each one bought a specific addition.
  const REAL = [
    ['Spoke with Alex Warren @ Brightwell. Heard us mentioned in executive meetings but is detached from the conversation. Sat at his breakout session.', 'Spoke with'],
    ['Spoke with Leland Rice at QSLM\n\n- very interested to see us in their community. Limited bandwidth, switching from yardi to August.\n\n- considering AL if adoption is 80%+\n\n- get with their REIT to discuss a plan of action moving forward', 'Spoke with'],
    // MISSED before tuning: a chat as a noun, with a qualifier in front.
    ['Quick chat to remind him of our existence.\n\nTwo of them tag teaming to get something going with one of his operators', 'Quick chat'],
    // MISSED before tuning: "met" with a duration rather than a person.
    ['Met for 20 minutes: EHR: Yardi (hates it) transitioning to August in phases\nExpanding into AL if they see 80% adoption rates.\nDiscussed care plan alignment and not having a great way to look at it.', 'Met for'],
    // MISSED before tuning: no interaction verb at all, just the slot of time.
    ['1v1 time. Was disconnected from sales process, but heard our name brought up in executive meetings', '1v1'],
    ['Met with Henri. They want to pilot on the two communities managed for them', 'Met with'],
    ['Had dinner, really bonded. Introduced us to their COO. Good to proceed, asked to circle back if we have any roadblocks', 'Had dinner'],
    ['Two of his IT colleagues came by and did a five-minute speed demo. Very quiet guy, but he was really keen on the fall clips. I asked him if he would like me to follow up to schedule a demo. He said yes.', 'came by'],
    ['Kory came by, part of a larger group to do a speed demo. He remembered us. He did come back again with his new CEO.\n\nWe need to follow up with him to see what the next steps are.', 'came by'],
    // MISSED before tuning: "met <name> for coffee" fits neither pattern.
    ['Met Priya for coffee at her hotel and talked for about a half hour. She remembers the demo.\n\nShe wants to set a meeting and do another demo with her CTO.\n\nwe need to follow up and get another demo scheduled.', 'Met Priya'],
  ];
  let fired = 0;
  for (const [text, want] of REAL) {
    const got = hit(text);
    if (got) fired++;
    eq(`"${text.replace(/\s+/g, ' ').slice(0, 40)}…"`, got, want);
  }
  eq('every real note is read as an interaction', fired, REAL.length);

  // The other half, and the half that decides whether this is tolerable to
  // use: the forward-looking sentences out of those same notes. A dialog that
  // appears when nothing happened costs a dismissal every single time.
  const QUIET = [
    'get with their REIT to discuss a plan of action moving forward',
    'Limited bandwidth, switching from yardi to August. Considering AL if adoption is 80%+',
    'EHR: Yardi (hates it) transitioning to August in phases.',
    'Pre-go live is important, wants a vendor thats going to be around for the long haul.',
    'I asked him if he would like me to follow up to schedule a demo. He said yes.',
    'We need to follow up with him to see what the next steps are.',
    'they are going to try to pilot us in a couple of buildings',
    'She wants to set a meeting and do another demo with her and her CTO',
    'we need to follow up and get another demo scheduled',
    'Want to grab coffee with her tomorrow',
    'Scheduled for coffee on Thursday',
    'Asked her for lunch next week',
    'Need to set up a 1v1 with their CIO',
    'Hoping to get connected with their VP',
    'Planning a quick chat with him at the next show',
    'Never met with Kevin, he was in sessions all day',
    "Didn't get a 1v1 with him",
    'They use Yardi for billing and are evaluating PointClickCare',
    'Piloting SafelyYou across all memory care',
  ];
  eq('and none of their forward-looking halves is one',
    QUIET.filter(t => hit(t) !== null), []);

  // "met" is a common word outside an interaction, and the pattern tier asks
  // for a preposition or a capitalised name rather than accepting it bare.
  eq('a target that was met is not a meeting',
    [hit('Revenue met expectations this quarter'), hit('They met the criteria for the pilot')],
    [null, null]);
  eq('  nor is a cadence', hit('Their team meeting cadence is monthly'), null);

  // A global RegExp carries lastIndex between calls, and these live at module
  // scope. One note per save means the scanner is called over and over in a
  // session, so the second reading of the same words must equal the first.
  const twice = 'Met Priya for coffee at her hotel';
  eq('reading the same note twice gives the same answer',
    [hit(twice), hit(twice), hit(twice)], ['Met Priya', 'Met Priya', 'Met Priya']);
  // And a note read after a longer one must not start where that one stopped.
  const long = 'Spoke with Alex. ' + 'filler words here. '.repeat(20) + 'Met Priya for coffee';
  eq('  and a short note after a long one is read from its start',
    [hit(long), hit('Met Priya for coffee')], ['Spoke with', 'Met Priya']);
}

console.log('\n— the chooser asks rather than guesses —');
{
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync('components/ActivityDetectedPrompt.tsx', 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  eq('there are three answers, not two and a guess',
    [/>\s*Meeting\s*</.test(src), />\s*Touchpoint\s*</.test(src), />\s*Disregard\s*</.test(src)],
    [true, true, true]);
  eq('  and Disregard just closes it, writing nothing',
    /onClick=\{\(\) => setPending\(null\)\}/.test(src), true);
  eq('the disclaimer is amber', /border-amber-200 bg-amber-50/.test(src), true);
  eq('  and quotes the words it keyed on, so the reading can be judged',
    /Detected .\{pending\.hit\.phrase\}/.test(src), true);
  eq('  and says nothing has been logged yet', /Nothing has been\s*\n?\s*logged/.test(src), true);

  eq('a note with no text is left alone', /if \(!text\) return;/.test(src), true);
  eq('  and so is one the activity itself wrote',
    /if \(!shouldScanNote\(\{/.test(src), true);
  eq('  and a note already answered is not asked twice',
    /if \(answered\.current\.has\(key\)\) return;/.test(src), true);

  eq('the meeting form opens on Log, because the note is past tense',
    /defaultMode="log"/.test(src), true);
  eq('  prefilled from the note',
    /prefillCompanyId=\{target\.companyId[\s\S]{0,120}prefillAttendeeId=\{target\.attendeeId[\s\S]{0,120}defaultConferenceId=\{target\.conferenceId/.test(src), true);
  eq('the touchpoint form is prefilled the same way',
    /defaultCompanyId=\{target\.companyId\}[\s\S]{0,120}defaultAttendeeId=\{target\.attendeeId\}[\s\S]{0,120}defaultConferenceId=\{target\.conferenceId\}/.test(src), true);
  // The record the note was filed against is the fallback when the note did
  // not name one — a note on a company page is about that company.
  eq('the record the note sits on fills in what the note did not name',
    /note\?\.entityType === 'company' \? note\.entityId : null/.test(src)
      && /note\?\.entityType === 'attendee' \? note\.entityId : null/.test(src), true);
}

console.log('\n— the two prompts do not stack —');
{
  const { readFileSync } = await import('node:fs');
  const prompt = readFileSync('components/SuggestionPrompt.tsx', 'utf8');
  // Comments stripped: the block below asserts the ABSENCE of things whose
  // names appear in the prose explaining why they are absent.
  const chooser = readFileSync('components/ActivityDetectedPrompt.tsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const shell = readFileSync('components/AppShell.tsx', 'utf8');

  eq('the vendor prompt holds while the chooser is up',
    /groups\.length === 0 \|\| activityFlowOpen\) return null;/.test(prompt), true);
  eq('  and it holds rather than discarding what it found',
    /setSuggestions\(\[\]\)/.test(prompt.slice(prompt.indexOf('activityFlowOpen'))) === false
      || /const activityFlowOpen = useActivityFlowOpen\(\)/.test(prompt), true);
  eq('the chooser raises the flag while anything of its own is open',
    /const showing = pending !== null \|\| opened !== null;/.test(chooser), true);
  eq('  and lowers it on unmount, so a crash cannot wedge it',
    /return \(\) => setActivityFlowOpen\(false\);/.test(chooser), true);
  eq('both are mounted once, for the whole app',
    /<SuggestionPrompt \/>[\s\S]{0,60}<ActivityDetectedPrompt \/>/.test(shell), true);
  // The chooser sits above the vendor prompt's z-[95]/[96] so that if both
  // ever do render, the one being answered is the one on top.
  eq('the chooser sits above the vendor prompt', /z-\[150\]/.test(chooser), true);
  // Measured in Chromium at 390x780: the sheet spans 491..780 — flush with the
  // bottom, nothing clipped — with the last button's base 20px above it. The
  // home indicator sits in that 20px on a notched phone, so the inset is added
  // to the padding rather than replacing it the way .pb-safe would.
  eq('the last button clears the home indicator',
    /pb-\[calc\(1\.25rem\+env\(safe-area-inset-bottom\)\)\]/.test(chooser), true);
  eq('  without shrinking the padding where there is no indicator',
    /\bpb-safe\b/.test(chooser), false);
}

console.log('\n— the meeting form can be opened on Log —');
{
  const { readFileSync } = await import('node:fs');
  const modal = readFileSync('components/NewMeetingModal.tsx', 'utf8');
  eq('the mode is a prop', /defaultMode\?: 'schedule' \| 'log';/.test(modal), true);
  eq('  that seeds the toggle', /useState<'schedule' \| 'log'>\(defaultMode\)/.test(modal), true);
  eq('  and still defaults to scheduling for every existing caller',
    /defaultMode = 'schedule',/.test(modal), true);
}

console.log('\n— the note-writing flows pass what they know —');
{
  const { readFileSync } = await import('node:fs');
  for (const f of ['components/NotesSection.tsx', 'components/NewNoteModal.tsx', 'components/QuickNotesSection.tsx']) {
    const src = readFileSync(f, 'utf8');
    const name = f.replace('components/', '').replace('.tsx', '');
    // Some flows build the context into a named object just above the call,
    // so the window opens before it rather than only after.
    const at = src.indexOf('announceNoteSaved(', src.indexOf('} from'));
    const call = src.slice(Math.max(0, at - 500), at + 700);
    eq(`${name} sends the note's text`, /text:/.test(call), true);
    // Shorthand counts: `companyId,` is the same field as `companyId: x`.
    const sends = (k) => new RegExp(`\\b${k}\\s*[:,]`).test(call);
    eq(`  and the records it was filed against`,
      [sends('companyId'), sends('attendeeId'), sends('conferenceId')], [true, true, true]);
  }
  // Untouched callers must keep working — the context is optional.
  const untouched = readFileSync('components/AssignFollowUpModal.tsx', 'utf8');
  eq('a flow that was never taught about this still compiles and stays quiet',
    /announceNoteSaved\('attendee', Number\(attendeeId\)\);/.test(untouched), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
