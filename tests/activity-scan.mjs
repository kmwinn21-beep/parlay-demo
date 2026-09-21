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
  delete globalThis.window;
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
