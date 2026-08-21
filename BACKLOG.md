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
