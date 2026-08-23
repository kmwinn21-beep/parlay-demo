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
