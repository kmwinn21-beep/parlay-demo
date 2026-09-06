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

## A second rule, from a second class of bug

The audit above is about a helper reaching for the wrong database *by default*.
This one is about a route being *told* which database to use, by whoever called
it.

> **Never derive an account id or user id from user-supplied input — a query
> parameter, an OAuth state string, or anything else — and use it to select a
> database or scope a write. Derive it from the authenticated session.**

### Where it was

`app/api/oauth/google/callback/route.ts` and its Microsoft twin. The authorize
step put the caller's identity into the OAuth `state` in plain text:

```ts
state: `${user.id}:${user.accountId ?? ''}`,
```

and the callback — which had **no `requireAuth` at all** — took both ids back
out of it and used them to pick a database and scope a write:

```ts
const [stateId, stateAccountId] = state.split(':');
const userId = parseInt(stateId, 10);
const accountId = stateAccountId || undefined;
// …
const db = await getDb(accountId);
await db.execute({
  sql: `INSERT INTO oauth_connections (user_id, provider, …) VALUES (?, 'google', …)`,
  args: [userId, providerEmail, tokens.access_token, …],
});
```

**What it allowed.** Anyone could complete a Google or Microsoft OAuth flow
with their own account, then request the callback with someone else's ids in
the state — `?code=<their own code>&state=<victim_user_id>:<victim_account_id>`
— and their access and refresh tokens would be written into the victim's row in
the victim's tenant database. The victim's outbound mail would then send
through the attacker's mailbox. No authentication, no signature, no check that
the state had ever been issued.

### Resolved by deleting the feature

Signing the state would have fixed it. The feature was deleted instead, because
it earned little: sending outreach from a rep's own mailbox, through a compose
modal on the company and attendee pages, plus a `From:` header on calendar
input requests. The calendar routes already fell back to the platform's SMTP
path whenever the OAuth send failed, so that path was already the one running
for everyone who had never connected.

Gone: the whole `app/api/oauth/` tree, `app/api/emails/send`,
`lib/oauthEmail.ts`, `lib/oauthCredentials.ts`, the compose modal and the
Connected Accounts section. The `oauth_connections` table stays — shared
migrations array, and unread rows are inert.

### Why this one is different from the rest of this document

Every other finding here fails *closed*: a wrong read returns empty and a
feature quietly does nothing. This one failed *open*. It did not need a bug to
trigger it, only someone who read the query string — and nothing about it would
have shown up in logs or error rates, because from the server's point of view
it was a successful request doing exactly what it was told.

**That sweep has since been done.** Its results are below.

---

## The sweep for request-scoped data access

Every route that takes an identifier from user-controlled input — query param,
path segment, request body, OAuth state, header, cookie — and uses it to select
a database or scope a read or write, rather than merely to select within data
already scoped by the session.

**One finding, one lesser finding, and a clean result everywhere else.** The
excluded cases are listed with reasons rather than omitted, so a later reader
knows they were examined.

### Finding 1 — `x-ops-impersonation-id` was trusted from the request — RESOLVED

`lib/auth.ts:185`, inside `requireAuth`, which nearly every authenticated route
calls:

```ts
const impersonationId = request.headers.get('x-ops-impersonation-id');
if (impersonationId) {
  const row = await db.execute({
    sql: `SELECT account_id FROM impersonation_sessions
          WHERE id = ? AND ended_at IS NULL
            AND last_active_at > datetime('now', '-60 minutes')`,
    args: [impersonationId],
  });
  if (row.rows[0]) {
    return { ...user, accountId: String(row.rows[0].account_id) };
  }
}
```

That `accountId` is what every route hands to `getDb(...)`, so this header
selects the tenant database for the rest of the request.

Three things combine:

1. **Nothing strips an inbound copy.** `middleware.ts` only ever *sets* the
   header, from the `ops_impersonation` cookie (`middleware.ts:80,139`), and
   `headers.delete` appears **zero** times in that file. With no cookie present
   that branch never runs, so a client-supplied header reaches the handler
   untouched.
2. **The session's owner is never checked.** `impersonation_sessions` has an
   `admin_user_id` column (`lib/db-migrations.ts:685`) which is written at
   creation and **read nowhere** — every other occurrence of that column name
   belongs to `admin_audit_log`. The query asks whether the session is live,
   never whether it is *yours*, and never whether you are an ops admin at all.
3. **The read-only guard keys off the cookie, not the header.** The write-block
   at `middleware.ts:125` reads `request.cookies.get('ops_impersonation')`. A
   forged header with no cookie passes it.

| | |
|---|---|
| Fails | **open** — acts on real data in the wrong tenant |
| Tenant boundary | **crossed** |
| Authentication | present; the *scope* is what comes from the request |
| Privilege | escalates beyond what the feature legitimately grants |

**Stated accurately, because the headline version overstates it.** The session
id is a `randomUUID()`, so it cannot be guessed or enumerated. Holding a live
one means being an ops admin — and an ops admin already has legitimate
cross-tenant access. So the escalation is **read-only to read-write, within an
already-privileged group**, not "any authenticated user reads any tenant". An
ops admin who moves their own id from the cookie to a header defeats the
read-only guard the product applies to impersonation. That needs no leak and is
available today.

The genuinely dangerous version is the leak path: any authenticated user of any
account who obtains a live UUID gets an hour of cross-tenant **write**. The
cookie carrying it is `httpOnly`, `secure` in production, `sameSite=lax` and
expires in an hour, so it is not readable by client-side script and an XSS does
not hand it over. It can still surface in server and proxy logs that capture
cookies, in error-tracking payloads, and in support screenshots — devtools
displays `httpOnly` cookies even though script cannot read them.

**Half the fix was already in the schema.** Somebody created `admin_user_id`
knowing a session belongs to a specific administrator. The check that would use
it was never written.

#### Resolved

Two locks, because either alone leaves the other half of the problem standing.

**The lookup now asks whose session it is.** `requireAuth` joins on
`admin_user_id` and on the caller still being an active ops admin — not merely
having been one when the session was opened:

```sql
SELECT s.account_id
FROM impersonation_sessions s
JOIN users u ON u.id = s.admin_user_id
WHERE s.id = ?
  AND s.admin_user_id = ?
  AND s.ended_at IS NULL
  AND s.last_active_at > datetime('now', '-60 minutes')
  AND u.active = 1
  AND (u.is_admin = 1 OR ? = 1)      -- the OPS_ADMIN_EMAILS allow-list
```

The allow-list is mirrored in `lib/auth.ts` rather than imported from
`lib/opsAuth.ts`, which imports this module.

**Middleware strips what a client must not supply.** Every forwarding path now
goes through one function that removes the headers middleware owns before
setting its own. A bare `NextResponse.next()` forwards the original request
headers, so the four call sites that used one were the same hole in different
places. The list lives in `lib/requestHeaders.ts` rather than `middleware.ts`
so it can be tested — that module imports `@clerk/nextjs/server` at load, which
does not resolve outside the bundler.

**The read-only guard covers the ground again.** It keys off the
`ops_impersonation` cookie, and before the strip a forged header with no cookie
reached a handler without ever passing it — which is how a forged header bought
a write where the legitimate feature grants only reads. With the strip in
place, a header can reach a handler only if middleware set it from the cookie,
so cookie and header now imply each other and the guard covers every path that
can produce an impersonated `accountId`.

**Tested** in `tests/impersonation-scope.mjs`, red before green: a tenant user
of another account, a second ops admin, and an admin whose access had since
been revoked were each scoped to the victim account against the previous
commit. Alongside them are the assertions that must not break — the owning
admin is still scoped to their session, and ended, idle and unknown sessions
still scope nothing.

### Finding 2 — spoofable client IP behind a rate limit

`app/api/public/score-audience/route.ts:81`:

```ts
req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
  req.headers.get('x-real-ip') ?? '0.0.0.0';
if (!checkRateLimit(ip)) { /* 429 */ }
```

Public and unauthenticated, and both headers are attacker-supplied, so the rate
limit is bypassed by varying them. It scopes no data, crosses no tenant
boundary and reads no database — the route touches no database at all. An
abuse-control weakness, not an authorization one, and ranked accordingly.

### Considered and excluded, with reasons

| What | Why it is not a finding |
|---|---|
| `aid` query param / body field in `app/api/input/respond`, `app/api/public/conference-forms`, `app/api/public/form-submissions` | Public and unauthenticated, and `aid` does select the tenant database — but every access is then gated on an independent unguessable secret **in that same database** (`WHERE cf.public_token = ? AND cf.is_public = 1`; `WHERE t.token = ?`, one-time and expiring). A wrong `aid` finds no matching token and returns 404. They **fail closed**: `aid` is a routing hint, not an authorization decision. |
| `getDb(accountId)` in `conference-series`, `conference-series/[seriesId]/seasons`, `program-intelligence/saturation`, `program-intelligence/saturation/[conferenceId]` | `accountId` is a local variable assigned from `authResult.accountId ?? ''`. Session-derived. |
| `createClient` / `createTenantDb` across 12 `app/api/ops/` routes | Ops admins are legitimately cross-tenant. All are gated by `requireOpsAdmin`. |
| `app/api/ops/recompute-relationship-floors`, `app/api/ops/recompute-saturation` | Have no ops guard, but use `requireAuth` and scope to the caller's own `accountId`. Filed under `/ops` without being cross-tenant. Misfiled, not vulnerable. |
| `app/api/ops/impersonate/end` | No ops guard, but acts only on the id in the caller's **own** cookie. Ending a session revokes access rather than granting it. |
| `demo_bypass` cookie | Compared against the `DEMO_BYPASS_SECRET` env var, and inert when that is unset. Lifts demo-mode write-blocking; scopes no data. |
| `x-forwarded-proto` in `conferences/[id]/executive-brief-pdf` | Builds a base URL for asset links inside returned HTML. No fetch, no data scoping. |
| `x-forwarded-for` in `lib/auth.ts` and `app/api/auth/login` | Recorded for session logging only. |
| Path params and body ids on non-ops routes | Every non-ops route resolves its client as `getDb(session.accountId)`, so a request-supplied id selects *within* the caller's tenant. That is "what is touched", not "which" — outside this class. |
| Request-supplied user ids | None outside `/ops`: `body.userId`, `body.user_id`, `params.userId` and the `userId`/`user_id` query params return no matches. |
| Account ids from the request on non-ops routes | None. |
| Remaining OAuth `state` consumers | None. The surviving `.state` matches are a company's US state field. |

### Scope of the sweep

- **368** `getDb()` call sites: 353 pass a session field directly; 7 pass a
  session-derived local; 5 are deliberate master in ops routes; 3 are the `aid`
  routes above.
- **22** routes under `app/api/ops/`, each checked for a guard.
- **4** public unauthenticated routes, each traced to what gates it.
- Every header `middleware.ts` sets — **exactly one**, `x-ops-impersonation-id`
  — and every custom header any handler reads (`x-forwarded-for`, `x-real-ip`,
  `x-forwarded-proto`).
- Every cookie read anywhere: `ops_impersonation`, `demo_bypass`.

### One fix, informed by the whole sweep

Middleware strips no inbound headers at all, but it also *sets* only one. So a
strip-list has exactly one entry today, and the value of writing it now is that
the next header added to middleware inherits the habit rather than the bug.

Paired with the ownership check that `admin_user_id` was created for, that is
the whole of Finding 1. **Both are now implemented** — see "Resolved" above.

Finding 2, the spoofable client IP behind the rate limit, is left as logged.
It is abuse control rather than authorization and is being handled separately.

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
