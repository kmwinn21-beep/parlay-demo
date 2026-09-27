# Backlog

## Ops / Infrastructure

### All-tenant snapshot recompute route
**`POST /api/ops/compute-all-snapshots`**

A new ops route that recomputes conference snapshots across every tenant in one request. The existing `POST /api/ops/compute-conference-snapshot` requires an explicit `accountId` and must be called once per tenant manually. This route would:

1. Query the master DB for all accounts with a provisioned tenant DB (`WHERE turso_db_url IS NOT NULL`)
2. For each account, connect to the tenant DB and loop over `conferences WHERE series_id IS NOT NULL ORDER BY start_date ASC`
3. Call `computeConferenceSnapshot(confId, client)` sequentially for each conference
4. Skip failed tenants (catch + continue) and accumulate per-account results
5. Return a summary: `{ accounts_processed, accounts_failed, per_account: [{ accountId, processed, failed, errors }] }`

Follow the same pattern as `app/api/cron/debrief-notifications/route.ts` (the only existing all-tenant looper) and `app/api/ops/compute-conference-snapshot/route.ts` (the per-account version). Auth via `requireOpsAdmin`. ~40 lines.

**Trigger:** needed after any change to `lib/compute-conference-snapshot.ts` that should be retroactively applied to existing snapshot data across all tenants (e.g. the net-new vs. continued engagement classification fix on branch `claude/add-company-level-targets-EMwKD`).

## Bugs

### Relationship health: floor is read stale in one of the three copies

**`app/api/attendees/[id]/timeline/route.ts` vs `post-conference/route.ts` / `pre-conference/route.ts`**

The three copies of the health-score calculation disagree about where the
relationship floor comes from:

| copy | floor source | capped at 100? |
|---|---|---|
| post-conference | recomputed live via `computeRelationshipFloorBatch()` | no |
| attendee timeline | reads the stored `attendees.relationship_floor` column | no |
| pre-conference | **no floor at all** | yes |

`attendees.relationship_floor` is only written when `computeRelationshipFloor*`
runs, which happens on the post-conference path. So the attendee timeline shows
a floor that can be arbitrarily out of date — add a Strong/Trusted internal
relationship and the timeline's health score won't move until someone opens an
Activity Debrief. Pre-conference ignores the floor entirely, so the same person
scores lower there than anywhere else.

Found while rebalancing the depth components (branch
`claude/add-company-level-targets-EMwKD`) and deliberately left alone — it is a
separate behavioural question, not part of the reweighting.

**Decide:** one source of truth for the floor across all three, and whether
pre-conference should include it at all.

### Relationship health: the attendee timeline counts unassigned notes at every conference

**`app/api/attendees/[id]/timeline/route.ts`**

The per-conference notes query still carries this clause:

```sql
OR conference_name IS NULL OR conference_name = ''
```

A single note with no conference set is therefore returned for **every**
conference that attendee has ever attended. The other two copies match on the
conference only.

`hasNotes` no longer contributes to the depth score after the reweighting, but
it still decides whether a conference counts as a "ghost" — so one unassigned
note currently suppresses the ghost penalty across an attendee's entire history
on this endpoint and nowhere else.

**Not** a matching-by-name problem any more: both this query and the
pre-conference equivalent now resolve notes by `entity_notes.conference_id`,
falling back to the stored name only for rows written before that column
existed. What remains is purely the deliberate-looking NULL/empty clause, which
needs a product decision — should an unassigned note count as engagement at
every conference, at none, or only at the conference that was active when it
was written?

### Note counting by conference name outside the health score

**`app/api/conferences/[id]/crm-prompt/route.ts:226`**

`WHERE ... AND conference_name = ?` against `entity_notes`. Same defect the
health-score paths had: rename a conference and its notes stop being included in
the CRM prompt. `entity_notes.conference_id` is available and backfilled; this
query was left alone because it belongs to a different feature and changing what
lands in a CRM export is a user-visible behaviour change, not a scoring fix.

### 🔴 LIVE BUG — notification helpers write to the master DB for tenant users

**`lib/notifications.ts` — every wrapper except direct `createNotifications({ db })` callers**

This is not a theoretical risk. **Tenant users are silently receiving no notifications today**, on production, for most notification types.

`lib/notifications.ts` imports the master client (`import { db } from './db'`) and every query in the module uses it. But `getDb(accountId)` returns a *separate Turso client per account* and only falls back to master when `accountId` is undefined:

```ts
export async function getDb(accountId: string | undefined): Promise<Client> {
  if (!accountId) return db; // ops admin — no tenant, uses master DB directly
  ...
  const client = createClient({ url: String(r.turso_db_url), authToken: String(r.turso_auth_token) });
```

So for any tenant account, the helper:

1. resolves recipients with `resolveUserIds` against the **master** `users` table, where the tenant's users do not exist — it returns `[]`
2. `createNotifications` then early-returns on the empty list, so **nothing is written and no email is sent**

It fails silently. The module swallows all errors by design, and an empty recipient list is indistinguishable from "nobody to notify", so there is nothing in the logs.

**Scope:** all nine wrappers (`notifyCompanyAssignees`, `notifyForAttendee`, `notifyConferenceInternalAttendees`, `notifyMentionedUsers`, `notifyNoteComment`, `notifyNoteReaction`, `notifyNoteLetsTalk`, `notifyCommentReaction`) plus `createOptInNotifications`, and every route that calls them — roughly 19 call sites. Affected triggers include company assignment, follow-up assignment, @mentions, note comments and reactions.

**Not affected:** the five sites converted in the notification cleanup pass, which now pass `db` explicitly, and any single-tenant/ops usage where `accountId` is undefined and master *is* the right database.

**Partial awareness already exists:** `getConfigIdByEmail(email, tenantDb?)` takes an optional client and 15 of its 21 call sites already pass one. `createNotifications` gained the same optional `db` parameter during the cleanup pass. The wrappers never did.

**Fix:** thread a `db: Client` argument through the nine wrappers and `createOptInNotifications`, and pass the caller's client at all ~19 sites. The wrappers also run their own lookups (`companies.assigned_user`, `conferences.internal_attendees`, `attendees` → company) which are equally master-bound and need the same treatment.

**Why it is its own project, not a cleanup item:** the fix *starts* delivering notifications to tenant users who currently get none. That is a live behaviour change across every notification type at once, with real email volume attached, so it needs its own testing plan and a deliberate rollout — ideally verified against a provisioned tenant DB, which a single-tenant local environment cannot exercise.

**Verification caveat:** identified by code inspection. It could not be reproduced locally because the local `accounts` table is empty, so every call resolves to master and the bug is invisible. Confirm against a real tenant before and after the fix.

## Relationship statuses and the competitive view

- **Admin screen for mapping custom statuses to a class.** A status an account
  adds has no `action_key` and so takes part in no signal. The competitive view
  says how many relationships it is not counting, which turns the gap from
  silent into visible, but the account still cannot fix it themselves. The
  screen would let them map their own statuses to current / evaluating / former.

- **The edit form should write a `relationship_updates` entry when the status
  changes.** Today only the update form writes to the thread, so a status
  changed through the edit form records *when* (`status_changed_at`) but not
  *why*. Writing a thread entry from both paths would make the thread complete
  and answer the better question. It also means the `status_changed_at`
  backfill could have been complete, which it is not — see the note at that
  migration.

- **A "Recent Activity" signal, if it earns one.** The competitive view's third
  signal is Int. Relationship: somebody here knows somebody there, read from
  `internal_relationships`. `deriveSignals` briefly also accepted a
  `lastActivityByCompany` feed so a recent meeting or touchpoint could light the
  same pill, and that was removed rather than left unwired. The pill says "Int.
  Relationship", and a booth conversation is not one — lighting it for activity
  would make the label lie about what it found, and a parameter nothing passes is
  a promise the module is not keeping.

  If recent activity is worth surfacing it comes back as its own signal with its
  own name, its own count in the rail and its own pill, not as a second way to
  light an existing one. It would need: a MAX(created_at) per company over
  meetings and touchpoints, the existing `RECENT_DAYS` window applied in the
  module rather than the query, and a decision about whether it means anything
  on a card whose account has no internal relationship at all.

- **A single-competitor mobile Competitive view.** The competitive view is
  desktop-only: the `[Map | Competitive]` toggle is hidden in the modal's
  `sm:hidden` branch, which never reads `view` at all. The reason is the grid
  itself — competitors run across as columns, and the thing you read is a row,
  tracing one account under two different competitors. Four columns at 390px is
  about ninety pixels each, which does not hold a company name, let alone the
  signal pills. Horizontal scrolling renders it and destroys it at the same
  time: the comparison only exists while two columns are on screen together.

  The right narrow layout is a different layout, not a squeezed grid. The
  competitor picker in the rail becomes a one-of-N selector and the canvas shows
  that single competitor's three rows stacked — Active Evaluation, Use
  Competitor, Recent Change — with the existing cards beneath each.

  **What it drops, and why that is the trade:** the cross-column comparison,
  which is the whole reason the desktop view is a grid. An account appearing
  under two competitors is the signal; one column at a time can only tell you
  *that* it carries the Evaluating Alternatives pill, never *against whom*
  without switching columns and holding the first in your head. So the mobile
  view would answer "who is in play under this competitor" and not "who is
  caught between these two". That is a real loss, and it is still better than a
  four-column grid nobody can read — which is why this is the answer if the view
  ever needs to be reachable on a phone, and why it was not built as the default.

  Also unresolved for that layout: the header already carries the scope toggle
  and the Companies/Relationships tab bar, and `mobileTab` has no meaning in
  Competitive (there is no company to pick), so the tab bar would have to
  disappear and reappear as the view flips. Worth solving properly rather than
  squeezing a third toggle onto the same row.

## Methodology notes

- A prescribed fix for a layout problem gets measured against the actual
  constrained axis before it gets built.

## The vendor switch workflow

- **Bulk edits record no switches.** BulkVendorRelationshipModal can set many
  relationships to a current status at once, and the switch prompt is not wired
  into it. Deliberate: thirty saves would mean thirty modals, and a rep clicking
  through a wizard that long is collecting confident wrong answers, which is
  worse than collecting none. The cost is that a bulk cleanup pass records no
  switches at all. A summary step — one screen listing every conflict the batch
  created — would recover them, and is its own piece of work.

- **A switch is never aged out.** The Switched Vendors signal has no window: the
  record is a durable fact and Recent Change already answers the recency
  question. An account that switched three years ago still shows the connector
  as long as both statuses stand. If the grid gets noisy on a mature book, the
  fix is a window on the record's created_at rather than on the statuses —
  worth measuring against real data before choosing a number.

- **The competitive grid scrolls sideways below about 1650px.** The
  relationship map now centres between the sidebar and the right edge, so on a
  narrower screen the panel is narrower than its 1360px cap and the four
  competitor columns no longer fit: measured, 1880px is clear, 1600px and
  1440px both scroll with the rail open. Folding the rail clears it at every
  width tested, which is what the fold is for — but nothing tells a reader
  that, and somebody meeting a sideways scroll will not guess. A hint when the
  grid overflows, or folding the rail automatically the first time it does,
  would close it.

- **Another session's edits are not seen until the modal is reopened.** Every
  path inside the modal now refetches: a card's Update on either view, and
  answering the switch prompt, which writes to relationships the card is not
  showing. What remains is concurrency — another rep, or another tab of your
  own, changing a relationship while the modal sits open. Unavoidable without
  polling or sockets, and genuinely low stakes: nothing on screen disagrees
  with itself, it is only a few minutes old.

  An earlier version of this note said "the company record behind it", which is
  impossible — the modal is a blocking overlay and closing it unmounts and
  refetches. Filing two live in-modal bugs under that wrong example is how they
  stayed unfixed for a commit.

- **Nobody is asked twice, but nothing uses that yet.** vendor_switches is
  indexed on (account, incumbent, incoming) so "have we already asked about
  these two?" is a cheap lookup, and detectSwitchPrompt does not yet make it.
  A rep who answered "keeping" last month is asked again the next time the
  status is touched. Suppressing a recently answered question is small, and the
  right rule for how recent needs a look at how often it actually happens.
