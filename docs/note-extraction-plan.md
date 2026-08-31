# Note extraction — suggesting record updates from note text

Status: **Stages 1–3.5 built** — store, registry, API, extractor, the review
section on the record, and the on-the-spot prompt after a note is saved.
Measurement (stage 4) still to do. Written down so the reasoning survives.

**One company, one card.** The extractor proposes per target, so a note that
names a vendor *and* says what kind of vendor it is produces two suggestions —
which reads as duplication even though the two write to different places. The
review UI groups suggestions by the company they name and shows one card with
every field, and one button that performs both writes. Where the relationship's
`vendor_type` is blank and the sub type says the same thing, it is filled from
it: both draw on the same option list and answer the same question, so leaving
one empty was an artefact of how the proposal was split, not something the note
failed to say.

**One unmapped word must not lose a whole suggestion.** A note saying
"considering new lesley" comes back with a status of "Considering", which is
not in the list — and because `relationship_status` is required, the entire
proposal used to be discarded, company and quote included, silently. Fields
marked `reviewerCanFill` are now left blank instead: the reviewer has the
dropdown open in front of them, and a card with a gap beats no card. Fields
that are what the suggestion is *about* — the company it names, a sub type
suggestion's sub types — stay fatal, because there is nothing to review
without them. The prompt also carries the phrasing notes are actually written
in (considering, looking at, up for renewal, ripping out), mapped onto the
account's own option values and filtered to the ones it has.

**Correctable, and filed on arrival.** The company on a suggestion is a
searchable dropdown over what the account already holds, because the extracted
name can be the wrong company or the right one under a name already on file.
When the name matches nothing, accepting will create it — so the card asks for
a Company Type there and then, rather than leaving a record with nothing but a
name for someone to find later. Where the name is close to a company already
on file — "Advent Health" against "AdventHealth Castle Rock" — the near
matches are offered as one click, since a duplicate company is harder to undo
than a missed suggestion. Offered, never applied: only a person knows whether
those two are the same company.

**Floor notes.** Assigning a floor note wrote `entity_notes` directly rather
than through `/api/notes`, so none of this ever ran on them; the same hook now
runs there too, after the assignment lands. The Assign Note modal also reads
the note locally — no model call, because floor notes are triaged in bulk on a
phone and a modal that stalls on an API is worse than one that fills in
nothing — matching the text against the account's own companies, attendees and
follow-up actions, each marked with a **Suggested** pill until touched.
Ambiguity yields nothing: two Tinas, or two companies scoring alike, and it
stays quiet rather than presenting a coin toss as a suggestion. The conference
comes from the note's own tag, falling back to the one being viewed. A
follow-up is offered rather than assumed — assigning a floor note has never
created one — with Yes preselected only when the note actually described an
action.

**On the spot.** When a note is saved, whatever was read out of it is offered
immediately, with the fields pre-filled and editable, and three answers:
**Confirm** writes it, **Review later** leaves it pending so it waits in
Suggested Updates on the record, **Ignore** dismisses it for good. The prompt
is mounted once app-wide and driven by a `parlay:note-saved` event, so every
note-writing flow gets it — and a flow added later gets it by dispatching one
line. Suggested Updates is collapsed by default with a count pill, because it
is now the queue for what was deferred rather than the first place anyone sees
a suggestion.

Extraction is **off unless `NOTE_EXTRACTION_ENABLED=1`**, so it cannot quietly
start costing anything. `POST /api/suggestions/extract` runs it on demand and
defaults to a dry run — it reports what it would store and what it threw away
and why, without writing. That is the way to read real output over real notes
before switching it on.

## Decisions

- **Which notes** — any note that resolves to a company. Floor notes only once
  assigned; before that there is nothing to attach to.
- **No length gate.** "Met at booth, currently using SafelyYou but is
  interested" is 57 characters and carries a real vendor relationship. Short
  notes are the norm here, not the exception.
- **v1 targets** — vendor relationships, and the company's Sub Type(s).
  Nothing else until the accept rate on those is known.
- **Review lives on the record**, company and attendee, not in a global inbox.
- **Automatic** on every qualifying note, not a button.
- **Anyone who can edit the record** can accept.
- **Dismissals are per note, not permanent.** Sentiment changes quickly, so a
  later note is free to raise the same fact again. Only re-extraction of the
  same note is suppressed, which is what `dedupe_key` is for.
- **No backfill.** New notes only.

## The idea

When a note is saved, read it for facts worth recording elsewhere and offer
them as suggestions. The rep confirms or edits; nothing is written on the
model's say-so.

Example note:

> Met for 20 minutes: EHR: Yardi (hates it) transitioning to August in phases
> SafelyYou across portfolio in MC. Expanding into AL if they see 80% adoption
> rates. Bandwidth is limited due to several software implementations
> happening...

That names three vendors, not two: Yardi (current, being replaced), **August**
— almost certainly August Health, not the month — and SafelyYou. A reader
skimming it misses one; a model resolves "August" either way depending on
whether it knows the name. That single word is the argument for a confirm
step, and for storing the verbatim quote beside every suggestion.

## Shape

- **Non-blocking.** The note saves immediately; extraction runs after
  (`waitUntil`, as the intel and upload routes already do). Suggestions are
  offered when ready and queue on the record if ignored.
- **One Haiku call per note**, not one per target. The prompt is assembled
  from a registry, so it stays a specific checklist rather than "find anything
  useful" — and the model sees the whole note once, so two extractors can't
  claim the same sentence.
- **Constrain to the enums.** Pass the live `config_options` lists into the
  prompt and require a value from them or null. Then "that value doesn't
  exist" becomes rare and genuinely worth a human decision.
- **A verbatim quote per suggestion**, shown in the UI. It makes the judgment
  checkable at a glance and is the cheapest hallucination detector available:
  if the quote isn't in the note, drop the row before anyone sees it.
- **Extract only what's stated.** Null the rest. `strength` is not derivable
  from the example note; defaulting it to "Weak" invents data someone will
  later act on.
- **Remember dismissals** and don't re-propose what already exists.
- **Per-row accept only.** No bulk accept — the value here is that a human
  looked.

## Storage

One suggestion table behind every target: source note, target key, entity
type/id, payload JSON, quote, confidence, status (pending / accepted /
dismissed), reviewer, reviewed_at. Three write shapes cover everything below:
create a child row, set a field on the parent, link an entity.

`meeting_insights` already has this shape (`insight_type`, `content`, `quote`,
`confidence`, `confirmed`, `source`) and the analyze route already prompts for
it — that is the pattern to copy.

## Targets

Worth including:

| Target | Table / field | Notes |
| --- | --- | --- |
| Vendor / Other Relationships | `vendor_relationships` | The best of the set: stated as fact, enum-constrained, high value |
| Attendee → Function | `attendees.function` | Notes reveal remit; low harm if wrong |
| Attendee → Seniority / Title | `attendees` | Only when stated outright; low yield, useful when it fires |
| Touchpoints | `attendee_touchpoints` | Small enum; dedupe against the meeting record |
| Company → Products / Services | `companies` | Yield depends on how well those lists are seeded |
| Internal Relationships | `internal_relationships` | Strict rep-name matching; no guessing which "Ron" |

Deliberately excluded:

- **Closed Won Deals** — amounts, dates, signors. A hallucinated figure in a
  financial record is a different category of wrong.
- **Company status** (Customer / Open Opp / Nurture) — pipeline stage is the
  rep's judgment and drives forecasting.
- **Firmographics** (website, hq_state, industry, entity_structure, wse) —
  these come from data sources, not conversations.
- **health_score, relationship_floor, product signals, targeting tiers** —
  computed elsewhere; two writers on one field is a bug waiting to happen.
- **Company Intel** — already AI-generated from another source; mixing
  provenance makes both harder to trust.

## Measurement

Log accept / edit / dismiss per suggestion, per field, from the first version.
That is the precision metric, it is free, and it is per-field — so a prompt
that is good at company names and bad at vendor types can be fixed where it is
actually wrong.

## Sequencing

Build the registry and review UI once; start it with two or three targets
even though it supports more. The architecture is the one-time cost; the
targets are what gets tuned. Before committing, run the extractor over a few
hundred existing notes writing nothing, and read the output — that gives real
precision in an afternoon rather than an estimate.
