# Tenant database scoping — audit

Every module-level import of the `db` singleton from `lib/db.ts`, classified by
whether the data it touches is master's or a tenant's.

Written after a defect in the notification helpers turned out to be the fourth
instance of one pattern. Line numbers are as of commit `f8be0a4`.

---

## The rule

> **A helper that touches tenant tables must take a REQUIRED client parameter.**
> Optional-with-master-default is the defect. It fails silently because the
> shared tables exist in both databases, so a wrong read returns empty rather
> than erroring.

That last sentence is the whole reason this class of bug survives review and
production alike. `lib/db-migrations.ts` is applied to master *and* to every
tenant database, so `users`, `notification_preferences`, `site_settings`,
`companies` and the rest exist in both. A query aimed at the wrong one finds a
real table that happens to be empty. It returns `[]`, or `null`, or falls
through to a default — and every caller in this codebase treats those as
"nothing to do" rather than as an error.

Nothing logs. Nothing 500s. The only way to find these is to read the imports.

---

## Why the singleton is the trap

```ts
// lib/db.ts:4 — bound once, at module load, to the master database
export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
```

It is never request-scoped, and a request's tenant is only known from the
session (`getDb(user.accountId)`). So any helper that reaches for `db` instead
of accepting a client is, for every tenant user, reading a database that user
does not exist in.

Tenant users exist **only** in their account's database. `findDbByToken`
(`lib/getDb.ts`) proves it: to log someone in it searches master first, then
walks every tenant database looking for them. That search would be pointless if
users were duplicated into master.

---

## Ranked findings

Silent failures rank above loud ones: a 500 gets reported, an empty array does
not.

| # | Module | Should be tenant-scoped? | User-visible symptom | Silent? | Call sites |
|---|---|---|---|---|---|
| **1** | `lib/oauthCredentials.ts` | **~~Yes — and it is not~~ RESOLVED BY DELETION** | ~~A tenant admin's own Google/Microsoft OAuth app is saved, shown as saved, and never used. Every connection runs on the platform's env credentials, so users see Parlay's consent screen instead of their own. Where no env fallback is set, the flow fails with an opaque provider error pointing nowhere near the cause.~~ The override feature is gone; credentials now come from the environment, which is what every connection had always used. | **Silent** | 4 → 0 |
| **2** | `lib/fuzzy.ts` | Yes — and it was not | Would have matched attendees and companies against master and run `INSERT INTO companies` there. Never triggered: nothing imported it. | Silent | 0 |
| 3 | `lib/icpRules.ts` | Optional, master default | Empty ICP config — nothing scores as ICP, every ICP filter and badge silently empties. | Silent | 11 (all pass a client) |
| 4 | `lib/trialState.ts` | Optional, master default | Wrong plan/trial state, so feature gating reads from the wrong account. | Silent | 14 (all pass a client) |
| 5 | `lib/titleNormalizationRules.ts` | Optional on 1 of 6 functions | `ensureTitleNormalizationSchema` would create its table in the wrong database; later calls take a required client and would then fail loudly against the tenant. | Loud-ish | 1 (passes a client) |

### Correctly master-scoped — no action

`lib/getDb.ts`, `lib/provision.ts`, `lib/opsAuth.ts`, `lib/trackEvent.ts`,
`lib/syncClerkUser.ts`, `lib/auth.ts`, `lib/simulate-conference-activity.ts`.

Each touches genuinely master-owned data — `accounts`, `impersonation_sessions`,
`account_events`, ops users — or takes an explicit client for its tenant work.
`provision.ts` seeds new tenant databases through a passed `client` and uses the
singleton only for master lookups; `syncClerkUser.ts` reads `accounts` from
master and then builds tenant clients to search. Both are the correct shape.

Of the 27 files under `app/` that import the singleton, all but two are under
`ops/`, `auth/`, `admin/`, `stripe/` or `webhooks/` and are master-scoped by
nature. The exceptions — `app/api/cron/debrief-notifications/route.ts` and
`app/api/onboarding/progress/route.ts` — hold both a master and a tenant client
and use each for the right tables.

---

## The pattern, four times

| Instance | Shape | How it was found | Status |
|---|---|---|---|
| `recordUserSession` | had the singleton; now takes a required `Client` | before this audit — see the comment at `lib/auth.ts:100`, which describes master data surfacing in Server Components | fixed previously |
| `resolveUserIds` + 8 `notify*` wrappers + `createOptInNotifications` | reached for the singleton | proved with a two-database harness after the notification system survey | fixed on `claude/fix-notification-tenant-db-EMwKD` |
| `getConfigIdByEmail` | `tenantDb?: Client` — optional, master default | **only** because threading the module stopped it compiling. 36 call sites, most passing nothing. Neither reviewer knew it existed. | fixed in the same branch |
| `lib/oauthCredentials.ts` | reached for the singleton | this audit | resolved by deleting the feature |

Every one failed the same way: a helper that looked complete, a default that
looked safe, and a wrong read that returned empty instead of raising.

`getConfigIdByEmail` is the instructive one. It was not on anybody's list. It
surfaced because the fix made the client **required**, which turned 76 silently
wrong call sites into 76 compiler errors. A required parameter is not only
better ergonomics — it is the only mechanism here that converts this class of
bug from invisible to impossible to miss.

---

## `lib/oauthCredentials.ts` — what it was

The read and the write disagreed about which database they were in.

**Write** — `app/api/admin/oauth-config/route.ts:18,46`, tenant:

```ts
const db = await getDb(auth?.accountId);
// INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)
```

**Read** — `lib/oauthCredentials.ts:17`, master:

```ts
import { db, dbReady } from './db';

const result = await db.execute({
  sql: `SELECT key, value FROM site_settings WHERE key IN (${placeholders})`,
  args: keys,
});
```

`site_settings` is in the migrations array, so it exists in both databases —
which is exactly why this never errored. The read finds master's copy, the
tenant's row is not in it, and the lookup falls through:

```ts
clientId: s['oauth_google_client_id'] || process.env.GOOGLE_CLIENT_ID || '',
```

Four call sites: `app/api/oauth/google/route.ts`,
`app/api/oauth/google/callback/route.ts`, and the Microsoft pair.

### Resolved by deletion, not by adding a client parameter

The rest of this audit argues for threading a required client. This finding was
resolved the other way — the feature was deleted — because it had never worked
and no account had an `oauth_%` row to preserve. Fixing the parameter would have
switched on a per-tenant override for the first time, which is a behaviour
change dressed as a bug fix; deleting it kept production identical.

`lib/oauthCredentials.ts` now reads the environment directly and imports
nothing. `app/api/admin/oauth-config/route.ts` and the Integrations tab that was
its only UI are gone. The `site_settings` table stays: it holds unrelated keys,
and any orphaned `oauth_` rows are inert now that nothing reads them.

---

## Latent — signatures that permit the same bug

`lib/icpRules.ts`, `lib/trialState.ts` and `lib/titleNormalizationRules.ts` all
take `client?: Client` and fall back to the singleton. **Every current caller
passes a client**, so all three are correct today:

```
getIcpConfig(db)                    →  11 of 11 pass
resolvePlanState(db)                →  14 of 14 pass
ensureTitleNormalizationSchema(db)  →   1 of 1  passes
```

They are recorded here because the signature is the defect, not the callers.
`getConfigIdByEmail` was also correct at every call site once, and accumulated
36 of them. Two of these three read `site_settings` — the same per-tenant table
as finding #1 — so a missed argument would fail in the same silent way.

Tightening them to a required parameter is a future cleanup pass, not this work.
The mechanical part is small; the cost is that each one turns into a compiler
error at every call site, which is the point of doing it deliberately rather
than alongside something else.
