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
