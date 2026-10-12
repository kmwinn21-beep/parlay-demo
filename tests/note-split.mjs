/**
 * A floor note that is really eleven floor notes.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/note-split.mjs
 *
 * A note relayed from the floor is often a dozen leads in one message. Filed
 * as one note it can only land on one record — and worse, the extraction that
 * runs on assignment (app/api/quick-notes/[id]/route.ts:200) reads every
 * vendor in it against that single company, so a note about eleven accounts
 * proposes ten companies' vendors as the eleventh's.
 *
 * Cut it up and each piece resolves to one company, which is the precondition
 * that code already requires. Nothing downstream changes: the same assign
 * modal, the same matching, the same extraction.
 *
 * Every expectation below is driven against the real note a rep sent from the
 * floor, kept verbatim — including its typos, which are half the test.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';
import {
  autoBreaks, detectMultiAccount, groupText, groupsFrom, leadHead, looksLikeLead,
  ownGroups, reassembles, segmentsFrom, validAssignment,
} from '@/lib/noteSplit';
import { scanForContactDetails, scanForReps } from '@/lib/suggestions/noteScan';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

/**
 * Comments out, code kept — including the code after `accept="image/*"`.
 *
 * The usual one-liner in these tests is `.replace(/\/\*[\s\S]*?\*\//g, '')`,
 * and QuickNotesSection.tsx contains `accept="image/*"` three times. That `/*`
 * is inside a string, but the regex cannot tell, so it opens a comment that
 * runs to the next real `*​/` — 4,558 characters later, swallowing the file's
 * whole modal section. Every assertion about that code passed by reading
 * nothing at all, which is the worst way for a test to be green.
 *
 * A block comment is preceded by the start of a line, whitespace, or an
 * opening brace; `image/*` is preceded by a letter. That is enough to tell
 * them apart here, and the captured character is put back.
 */
const strip = (f) => readFileSync(f, 'utf8')
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

/* The note as it arrived, typos and all. "Nebreska" twice, "Oak Terrance",
   "Insprien", a dash with no space after it — every one of them is a case
   something here has to survive. */
const NOTE = `From yesterday - we are going to be here until Weds - so if you can reach out to your respective folks and can setup a meeting/booth visit/ or secure a discussion for Gavin or I while here dont be shy

Mike V -Ashton Windham - Windhas@gmail.com Windcorp management series 6 communities al/SNF In macon GA - wants to setup time for a conversation.

Care Initiatives - need to look up woman's names

Nebraska - Cassie Scott - Hemlock - ED

Paul - Tina Sandri - Hallkeen AL - send email - very interested - MA

Jeff - Majestic Care of Toledo - Ladies heard Mikkel speak - very impressed

Nebreska - Kmparker@healthmngt.com - Kaelyn Parker - 478-957-9750 - Nebreska - wants to setup time for a discussion, Mikkel presentation

Paul - Meredith Mills - Asked Questions at mikkel presentation - need to hunt down tomorrow

Henri/Dan - Martin - Sabra - Priority Life Care, Traditions, - Cap partner, had lunch with him

Paul - Van eyke - Riza Corey, Kevin, wants a meeting - met Mikkel - used Insprien at past, really was interested in the conversation - I met with Kevin, and then walked over and Mikkel and I had a great convo with the whole team.

Minnesota - Kristy/Amy- The Goodman Group - wants to setup a meeting - very interested 33 communities - eldermark, possibly looking at August or ALIS. Also VP - took my card - coming to the booth tmw.

Minnesota - Drew Hood - Oak Terrance Assisted Living - PCC implementation just ending November - looking into fall prevention next - 4 communities, heard Mikkel speak really really interested.`;

const segs = segmentsFrom(NOTE, autoBreaks(NOTE));
const body = segs.filter(s => s.text.trim());

console.log('\n— twelve pieces, eleven of them a lead —');
{
  eq('the note cuts into twelve', segs.length, 12);
  eq('  eleven of which open like a lead', body.filter(s => looksLikeLead(s.text)).length, 11);
  /*
   * The covering note is the one that is not. It wears the shape exactly —
   * "From yesterday - we are going to be here until Weds - so if you can
   * reach out" — which is why the test is capitalisation rather than
   * punctuation: a region or a person's name has no lowercase word in it.
   */
  eq('the covering note is not one of them', looksLikeLead(body[0].text), false);
  eq('  and prose with dashes in it never is',
    looksLikeLead('spoke to her about the renewal - she was positive - will follow up'), false);
  eq('  nor is a line with nothing after the head', looksLikeLead('Care Initiatives'), false);

  eq('the heads read as written', body.slice(1).map(s => leadHead(s.text)), [
    'Mike V', 'Care Initiatives', 'Nebraska', 'Paul', 'Jeff',
    'Nebreska', 'Paul', 'Henri/Dan', 'Paul', 'Minnesota', 'Minnesota',
  ]);
}

console.log('\n— however the thread was pasted —');
{
  /*
   * Reported from a real split: eight leads came out as five pieces, three
   * leads to a piece. The note had arrived with only SOME of its blank lines
   * as CRLF, and `\n[ \t]*\n` does not see `\n\r\n` as a blank line — so four
   * of the eight were found, which was enough for the blank-line rule to win
   * outright and the lead-line rule never to run.
   *
   * Two changes, and the second is the one that generalises: `\r` counts as
   * blank between newlines, and neither rule is trusted over the other — the
   * one that reads more leads out of the note wins.
   */
  const leads = body.map(s => s.text.trim());
  const cuts = (text) => segmentsFrom(text, autoBreaks(text)).filter(s => s.text.trim()).length;

  eq('blank lines', cuts(leads.join('\n\n')), 12);
  eq('  the same, written CRLF', cuts(leads.join('\r\n\r\n')), 12);
  eq('  half of them CRLF, which is what arrived',
    cuts(leads.map((l, i) => l + (i % 2 ? '\r\n\r\n' : '\n\n')).join('')), 12);
  eq('  and no blank lines at all', cuts(leads.join('\n')), 12);
  eq('  CRLF, no blank lines', cuts(leads.join('\r\n')), 12);
}

console.log('\n— and the pieces rebuild the note —');
{
  /*
   * The property the whole design rests on. Cuts are POSITIONS and the pieces
   * are slices, so nothing can be reworded or dropped. This is the gate any
   * other source of cuts — a model, later — has to pass, and the server runs
   * it again before writing a row.
   */
  eq('character for character', reassembles(NOTE, segs), true);
  eq('  and a piece whose text was edited is refused',
    reassembles(NOTE, segs.map((s, i) => (i === 3 ? { ...s, text: s.text.toUpperCase() } : s))), false);
  eq('  as is a gap between two pieces',
    reassembles(NOTE, [segs[0], { ...segs[2] }]), false);
  eq('  and a piece running past the end',
    reassembles(NOTE, [{ start: 0, end: NOTE.length + 5, text: NOTE }]), false);
  // Out of order is not wrong — it is sorted before it is checked.
  eq('order does not matter', reassembles(NOTE, [...segs].reverse()), true);
}

console.log('\n— the pill, read off the note and nothing else —');
{
  eq('this note is several', detectMultiAccount(NOTE).isMulti, true);
  eq('  eleven of them', detectMultiAccount(NOTE).leads, 11);

  // An ordinary floor note is one thought however it is punctuated.
  eq('a single note is not',
    detectMultiAccount('Spoke to Tina Sandri at the booth - she wants pricing for three communities - send it Monday').isMulti, false);
  /*
   * Three, not two. Two lead-shaped lines happen by accident often enough,
   * and a pill that cries wolf on ordinary notes is ignored on the one that
   * matters.
   */
  const two = `Paul - Tina Sandri - Hallkeen - send email - very interested - MA\n\nJeff - Majestic Care of Toledo - heard the keynote - very impressed and wants to talk`;
  eq('  and nor are two leads', detectMultiAccount(two).isMulti, false);
  eq('  a short note is never checked at all', detectMultiAccount('Paul - Tina - call her').segments, 0);
}

console.log('\n— who the lead is addressed to —');
{
  const REPS = [
    { id: 1, value: 'Mike Vance' }, { id: 2, value: 'Paul Ierardi' },
    { id: 3, value: 'Jeff Dolan' }, { id: 4, value: 'Henri Boucher' }, { id: 5, value: 'Dan Ortiz' },
  ];
  const TERR = [
    { id: 10, name: 'Nebraska', assignedUserIds: [6] },
    { id: 11, name: 'Minnesota', assignedUserIds: [7] },
    { id: 12, name: 'Southeast', assignedUserIds: [1, 2] },
  ];
  const reps = (s) => scanForReps(s, REPS, TERR);

  eq('a first name and an initial', reps(body[1].text), [1]);
  eq('  a bare first name', reps(body[4].text), [2]);
  eq('  two names either side of a slash', reps(body[8].text), [4, 5]);
  eq('a region, through the territory map', reps(body[3].text), [6]);
  eq('  misspelt, which it is twice here', reps(body[6].text), [6]);

  /*
   * The ones that must come back empty. A follow-up handed to the wrong rep
   * is worse than one handed to nobody: nobody is visible, and wrong is not.
   */
  eq('a company at the head is not a rep', reps(body[2].text), []);
  eq('  a territory with two reps on it resolves to neither',
    scanForReps('Southeast - Cassie Scott - Hemlock - ED', REPS, TERR), []);
  eq('  and so does a first name two people share',
    scanForReps('Paul - Tina Sandri - Hallkeen - send email', [
      { id: 2, value: 'Paul Ierardi' }, { id: 9, value: 'Paul Hennessy' },
    ], []), []);
  // Only ever the head: a name further down the line is who was spoken to.
  eq('a name later in the line is not the assignee',
    scanForReps('Care Initiatives - ask Paul to look up the names', REPS, TERR), []);
}

console.log('\n— and what it says about the person —');
{
  const name = (s) => {
    const c = scanForContactDetails(s, []);
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  };

  eq('two capitalised words are a person', name(body[1].text), 'Ashton Windham');
  eq('  even after an address field', name(body[6].text), 'Kaelyn Parker');
  eq('  and after a region at the head', name(body[11].text), 'Drew Hood');
  eq('  taking the first one, not the last', name(body[4].text), 'Tina Sandri');

  /*
   * Every one of these declines was a line this got wrong first. A blank box
   * costs a few seconds of typing; a confidently wrong name creates a person
   * who does not exist and attaches a follow-up to them.
   */
  eq('three words are a company', name(body[10].text), '');
  eq('  four words are too', name(body[5].text), '');
  eq('  a lower-case second word is not a surname', name(body[9].text), '');
  eq('  one name could be either half of one', name(body[8].text), '');
  eq('  two people in one field are not one person', name('Minnesota - Kristy/Amy - wants a meeting'), '');
  eq('  and a state code is not a surname', name('Paul - Hallkeen AL - send email'), '');

  const windcorp = scanForContactDetails(body[1].text, []);
  eq('an address is read off its own shape', windcorp.email, 'Windhas@gmail.com');
  const kaelyn = scanForContactDetails(body[6].text, []);
  eq('  as is a number', kaelyn.phone, '478-957-9750');
  // Digits inside an address are not a phone number.
  eq('  and the address is taken out before the number is looked for',
    scanForContactDetails('Paul - a1234567890b@x.com - call her', []).phone, '');
}

console.log('\n— the split is positions, never text —');
{
  const route = strip('app/api/quick-notes/[id]/split/route.ts');
  /*
   * The caller says WHERE to cut. The server reads the note out of the
   * database and slices it, so no client — and no model placing cuts later —
   * can reword a sentence, drop one, or add one that was never written.
   */
  eq('the route takes breaks and a grouping', /breaks\?: unknown; assign\?: unknown/.test(route), true);
  eq('  and slices the stored note', /segmentsFrom\(content, breaks\)/.test(route), true);
  eq('  never text from the request', /body\.(text|content|segments)/.test(route), false);
  eq('the guard runs again on the server', /if \(!reassembles\(content, segments\)\)/.test(route), true);
  eq('  and refuses rather than writing', /Those cuts do not rebuild the note/.test(route), true);
  // The second half of the guarantee, once a note can be several pieces.
  eq('the grouping is checked too', /if \(!validAssignment\(segments, assign\)\)/.test(route), true);
  eq('  with every piece accounted for exactly once',
    /does not account for every piece exactly once/.test(route), true);
  eq('  and a missing grouping means one note per piece',
    /const assign = sentAssign \?\? ownGroups\(segments\.length\);/.test(route), true);
  // A floor note is private until it is assigned, so the id alone is never enough.
  eq('scoped to the caller’s own notes', /WHERE id = \? AND created_by = \?/.test(route), true);
  /*
   * One batch: either the pieces exist and the original is gone, or neither.
   * Half a split reads as the note having been duplicated.
   */
  eq('written in one batch', /await db\.batch\(\[/.test(route), true);
  eq('  with the original deleted in it', /DELETE FROM quick_notes WHERE id = \? AND created_by = \?/.test(route), true);
  eq('  and the new ids taken from the inserts themselves', /RETURNING id/.test(route), true);
}

console.log('\n— two pieces that are not neighbours, one note —');
{
  /*
   * The same account can turn up twice in one thread with other leads in
   * between. The rails handle neighbours; this handles the rest.
   *
   * A note stops being one piece and becomes a SET of them, stored as one
   * number per piece: which note it goes to, or -1 for the bin. That shape is
   * what keeps the guarantee — a piece cannot be in two notes, because it has
   * one number, and it cannot be in none, for the same reason.
   */
  eq('every piece starts in a note of its own', ownGroups(4), [0, 1, 2, 3]);

  const three = segmentsFrom('aaa\n\nbbb\n\nccc', [0, 5, 10]);
  eq('  which is three pieces here', three.length, 3);

  eq('a legal grouping passes', validAssignment(three, [0, 1, 0]), true);
  eq('  and discarding is legal too', validAssignment(three, [0, -1, 0]), true);
  /*
   * The rule that does the work: a piece named as a leader has to lead itself.
   * It forbids chains, which would need following and could loop, and it
   * forbids a group whose leader has been thrown away.
   */
  eq('a chain is refused', validAssignment(three, [0, 0, 1]), false);
  eq('  as is following a leader that was discarded', validAssignment(three, [-1, 0, 2]), false);
  eq('  a number no piece has', validAssignment(three, [0, 9, 2]), false);
  eq('  and a grouping of the wrong length', validAssignment(three, [0, 1]), false);

  const grouped = groupsFrom(three, [0, 1, 0]);
  eq('the far pieces come back as one note', grouped.length, 2);
  eq('  carrying both halves', grouped[0].members.map(m => m.text.trim()), ['aaa', 'ccc']);
  eq('  in the order the note wrote them', grouped[0].leader, 0);
  eq('  and the piece in between is its own', grouped[1].members.map(m => m.text.trim()), ['bbb']);
  eq('a discarded piece makes no note', groupsFrom(three, [0, -1, 0]).length, 1);
  // Whitespace kept by the slicing so the note could be rebuilt is no note.
  eq('  and nor does one with nothing in it',
    groupsFrom(segmentsFrom('aaa\n\n   \n\nbbb', [0, 5, 10]), [0, 1, 2]).length, 2);

  /*
   * The one place a new note is not byte-for-byte a span of the old one: two
   * pieces that were not neighbours cannot be one continuous slice, so they
   * are separated by a blank line. Every word is still the note's own.
   */
  eq('joined pieces keep their own words', groupText(grouped[0]), 'aaa\n\nccc');
  eq('  and a single piece is unchanged', groupText(grouped[1]), 'bbb');

  // The tiling check is untouched by grouping — it is about the PIECES.
  eq('grouping cannot affect whether the pieces still tile the note',
    reassembles('aaa\n\nbbb\n\nccc', three), true);
}

console.log('\n— nothing else about assigning changed —');
{
  const notes = strip('components/QuickNotesSection.tsx');
  const split = strip('components/SplitNoteModal.tsx');

  // The pill is computed, so a note edited down to one lead loses it on save.
  eq('the pill is computed, not stored',
    /const multi = useMemo\(\(\) => detectMultiAccount\(note\.content\), \[note\.content\]\);/.test(notes), true);
  eq('  and nothing writes it to a column', /multi_hint|is_multi|multi_account/.test(notes), false);

  // Offered, never forced: the other button hands the note to the old flow.
  eq('a tagged note is offered the cuts', /if \(detectMultiAccount\(note\.content\)\.isMulti\) \{ setSplittingNote\(note\); return; \}/.test(notes), true);
  eq('  and can still be filed whole', /onKeepWhole=\{\(\) => \{ setAssigningNote\(splittingNote\); setSplittingNote\(null\); \}\}/.test(notes), true);

  // A run reads the live list, not the one it started with. (Who the lead is
  // for, and the state between cards, are the section below.)
  eq('the queue walks ids against the live list', /const live = notesRef\.current;/.test(notes), true);
  eq('  so a split carries straight on into its pieces',
    /openNextInQueue\(\[\.\.\.pieces\.map\(p => p\.id\), \.\.\.queueIds\]\)/.test(notes), true);

  // One screen, not a split-or-keep gate followed by an auto-or-manual one.
  eq('the preview is the choice', /onKeepWhole/.test(split) && /Create \$\{groups\.length\} notes/.test(split), true);
  eq('  and it says whether the pieces still rebuild the note', /nothing is reworded or lost/.test(split), true);

  /*
   * Joining, driven in Chromium against the real note. Dragging piece 6 onto
   * piece 3, three rows apart, takes it from seven notes to six and numbers
   * both halves 3; the menu does the same without a drag; skip takes the whole
   * joined note and keep gives all of it back; separate on either half returns
   * one piece. The payload is breaks plus [-1,1,2,3,4,5,3,7] and no text.
   */
  eq('the grouping travels as one number per piece', /body: JSON\.stringify\(\{ breaks, assign \}\)/.test(split), true);
  // The menu is the mechanism; the drag is the shortcut. It is the only one
  // that works one-handed or with a keyboard.
  eq('a piece can be joined from a list', /Join this into…/.test(split), true);
  eq('  and by dragging it onto another', /onDrop=\{e => \{/.test(split) && /draggable=\{!isDropped\}/.test(split), true);

  /*
   * And both can be SEEN, which the first build of this could not claim.
   *
   * It shipped with no grip at all — a row that could be dragged looked
   * exactly like one that could not — and the join was two words of 10px grey
   * in the right margin, 36 by 15 pixels. "I don't see any way to join" was
   * the entirely correct reading of it. Measured after: a grip on every row
   * and a 135 by 26 button in gray-600.
   */
  eq('every row shows a grip', /<circle cx="3" cy="3" r="1\.4" \/>/.test(split), true);
  eq('  and says it can be grabbed', /cursor-grab/.test(split), true);
  eq('the join is a button, not a hint', /Join to another note/.test(split), true);
  eq('  sized to be hit', /min-h-\[30px\] px-2\.5 py-1 rounded-md border/.test(split), true);
  eq('  and legible against white', /text-\[11px\] font-medium text-gray-600/.test(split), true);
  eq('nothing is left at 10px grey in the margin',
    /text-\[10px\] font-medium text-gray-400/.test(split), false);
  eq('  but never onto a piece that is being thrown away',
    /if \(dragging !== null && !isDropped\) joinInto\(dragging, seg\);/.test(split), true);

  /*
   * Membership and discarding are two pieces of state. As one, skipping a
   * joined note overwrote which pieces belonged to it — so skip took both
   * halves and keep gave back one.
   */
  eq('membership and the bin are held apart',
    /const \[groupOf, setGroupOf\]/.test(split) && /const \[skipped, setSkipped\]/.test(split), true);
  eq('  so skip and keep are each other’s opposite', /const key = segments\[leaderIndex\[i\]\]\.start;/.test(split), true);
  /*
   * The first piece of a note holds no entry — the others point at it — so
   * removing its entry did nothing, and separate on the top half was dead.
   */
  eq('separating the first piece hands the note on', /const heir = segments\[others\[0\]\]\.start;/.test(split), true);
  // And a whole group moves when it is joined, rather than leaving members behind.
  eq('joining moves every piece of a note', /const moving = membersOf\(from\)\.map\(s => s\.start\);/.test(split), true);
}

console.log('\n— and a new note is a new form —');
{
  const notes = strip('components/QuickNotesSection.tsx');
  const cache = strip('lib/assignListCache.ts');

  /*
   * Reported from a test account holding none of the companies in the note:
   * the company and attendee from one lead were still sitting in the fields
   * on the next. The modal was never unmounted between notes — truthy to
   * truthy, same type, same place in the tree — so React kept the instance and
   * every field with it. Worse, the ref guarding the reading of the note is
   * set once per instance, so from the second note on the text was never read.
   *
   * Driven in Chromium over a three-note run: card 2 carries three suggestion
   * pills (company, attendee, assignee); card 3 carries none, and none of
   * card 2's values.
   */
  eq('the modal is keyed by the note', /key=\{assigningNote\.id\}/.test(notes), true);

  /*
   * Which is only affordable because the lists are not fetched again. Opening
   * this form costs five requests — conferences, companies, attendees, the
   * conference's own attendees, and the company types — and a twelve-note run
   * would have been sixty. That burst is what gets a client challenged by the
   * host's bot protection.
   */
  eq('the lists come from the cache', /getAssignLists\(\)/.test(notes), true);
  eq('  including the conference’s attendees', /await getConferenceAttendees\(conf\.id\)/.test(notes), true);
  eq('  and the company types', /getCompanyTypeOptions\(\)\.then\(setCompanyTypeOptions\)/.test(notes), true);
  // The two heavy ones specifically. A one-row warm-up elsewhere in the file
  // is not a list load and is left alone.
  eq('  with neither heavy list fetched directly any more',
    /limit=2000|limit=5000/.test(notes), false);
  // Built on the deduplicating cache that already exists rather than a new one.
  eq('the cache is the shared one', /import \{ getCached, getConfigCategory \} from '@\/lib\/configCache';/.test(cache), true);

  /*
   * A thread with two leads at one account is ordinary, and the lists were
   * fetched before either existed. Throwing the cache away on every create
   * would be no cache at all in a run where every lead is a new account, so
   * what was created is kept beside what was fetched.
   */
  eq('a company created mid-run is remembered', /rememberCreatedCompany\(\{ id: companyId/.test(notes), true);
  eq('  and so is an attendee', /rememberCreatedAttendee\(\{/.test(notes), true);
  eq('  merged by id, so the server’s copy wins once it refreshes',
    /function mergeById/.test(cache) && /const known = new Set\(fetched\.map\(r => r\.id\)\);/.test(cache), true);

  /*
   * The rep read runs on its own and re-runs, because the roster and the
   * territory map arrive on their own schedule. The note scan fires as soon as
   * the companies land and never again; when either list was still in flight
   * then — most of the time on a cold load — the head resolved against nothing
   * and the field stayed empty for good.
   */
  eq('the rep read is its own effect',
    /const ids = scanForReps\(note\.content \?\? '', userOptions, territories\);/.test(notes), true);
  eq('  re-running when either list lands', /\}, \[note\.tag, note\.content, userOptions, territories\]\);/.test(notes), true);
  eq('  and never over a rep chosen by hand', /if \(ids\.length > 0 && !touched\.reps\) setFollowUpRepIds\(ids\);/.test(notes), true);
  eq('  with the self-default waiting for it to have tried', /if \(scannedRepIds === null\) return;/.test(notes), true);

  // Skipping is still dealing with a note.
  eq('skipping advances the counter',
    /onSkip=\{queueIds \? \(\) => \{ setQueueDone\(d => d \+ 1\); openNextInQueue\(queueIds\); \} : undefined\}/.test(notes), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
