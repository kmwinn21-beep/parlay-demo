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

---

## The worked example — Slack OAuth, built to the second rule

The rule in "A second rule, from a second class of bug" says what not to do.
The Slack integration is the first flow built after it, and it is written to be
the thing the rule points at. Copy this shape; do not re-derive one.

`lib/slack/state.ts`, `lib/slack/oauth.ts`, `lib/slack/guards.ts`,
`app/api/slack/{install,oauth/callback,connect,connect/callback}/route.ts`.
Tests: `tests/slack-install.mjs`, `tests/slack-connect.mjs`.

### The four checks, in this order

Both callbacks run the same four. The order is part of it — the cheapest and
most decisive check first, so a forged request is refused before it can reach a
database or an outbound call.

```ts
// 1. The state is one we signed, for THIS purpose, and is not stale.
const state = await verifySlackState(searchParams.get('state'));
if (!state) return settingsError('slack_invalid_state');

// 2. The caller has a session, and is who the route requires them to be.
const auth = await requireRealAdmin(request);
if ('refusal' in auth) return settingsError(/* … */);

// 3. The session user IS the user named in the state. The state says who
//    started the flow; the session says who is finishing it.
if (auth.user.id !== state.userId) return settingsError('slack_state_mismatch');

// 4. The account matches too — and the account WRITTEN TO comes from the
//    session, never from the state.
if (auth.user.accountId !== state.accountId) return settingsError('slack_state_mismatch');

await saveWorkspace({ accountId: auth.user.accountId, /* … */ });
```

The deleted Google callback got 1, 2 and 4 wrong simultaneously: an unsigned
state, no authentication at all, and `getDb(accountIdFromState)`.

Note what check 4 is *not*. The state's `accountId` is never passed to `getDb`
or to a store function. It exists only to be compared. A genuinely signed state
naming another account is refused, and installs nothing there and nothing
anywhere else. If the comparison were deleted the flow would still write to the
session's account — the compare is a second layer, not the mechanism.

### The state is signed, and scoped to one flow

A `jose` HS256 JWT on `JWT_SECRET` — the same library and secret the session
cookie uses, because a second hand-rolled HMAC is a second thing to get wrong.
`sub` is the user id, `accountId` a claim, `jti` a `randomUUID()` nonce, and the
expiry is **10 minutes**: long enough to read a consent screen and pick a
workspace, short enough that a state captured from browser history or a referrer
log is usually already dead.

Sharing one secret across several token types is what makes the **audience**
mandatory rather than decorative. There are three tokens signed with
`JWT_SECRET`, and each carries an `aud` that its own verification requires:

| token | `aud` |
| --- | --- |
| session cookie | (the app's own) |
| workspace install state | `slack-oauth-state` |
| user connect state | `slack-user-connect` |

The two Slack states are non-interchangeable in both directions *by audience*.
Without the split, an ordinary member — who holds a connect state legitimately —
could present it where a workspace gets installed. Both directions have tests,
and both are mutation-checked: merging the two Slack audiences fails 5
assertions; dropping `{ audience }` from `jwtVerify` fails 9.

**A correction worth reading, because the obvious summary of the table above is
wrong.** The audience does *not* symmetrically protect the session cookie. It
stops a session cookie being used as a state — the state verification requires
an audience the cookie does not carry. It does **not** stop a state being used
as a session cookie: `verifyToken` in `lib/auth.ts` calls `jwtVerify` with no
audience option, so it accepts any `aud`. That direction is refused for a
different reason — a state carries no `email` and no `role`, and `verifyToken`
requires both:

```ts
if (!payload.sub || !payload.email || !payload.role) return null;
```

Which is a genuine protection, and `tests/slack-connect.mjs` pins it. But it is a
property of the *claims*, not of the audience, so adding `email` or `role` to a
Slack state would silently turn it into a valid seven-day session cookie. The
durable fix is to give the session cookie its own audience and require it in
`verifyToken`; that is a change to the authentication path for every existing
signed-in user, so it is recorded here rather than done in passing.

**The states are deliberately not single-use.** Nothing records issued `jti`s,
so one can be replayed inside its ten-minute window — by the same person, in the
same account, for the same flow. The payload of that replay is relinking someone
to themselves. A `jti` table with a TTL sweep is real infrastructure; this was
judged not to earn it. Recorded so the absence reads as a decision.

### One more check this shape needs, and a general point

The user-connect callback adds a fifth: the Slack user Slack just identified
must belong to the **same `team_id`** as the workspace the account installed.
Slack will issue a perfectly valid Sign in with Slack token for a user in an
unrelated workspace, and a link naming them would read as connected and be
permanently undeliverable, because the bot that sends lives elsewhere.

The general point: **the four checks establish who the caller is; they say
nothing about whether the third party's answer is about the same thing you
asked about.** Whatever the provider hands back still has to be reconciled with
what this account already knows. Two places in this flow do that, and both are
easy to leave out:

- the `team_id` comparison above;
- the `aud` on Slack's `id_token`, checked against `SLACK_CLIENT_ID`. Its
  signature deliberately is *not* verified — it arrives in the body of our own
  TLS POST to `slack.com` authenticated with the client secret, which OIDC Core
  §3.1.3.7 accepts — but TLS says nothing about which Slack *app* the token was
  minted for, and that is exactly what `aud` catches.

### Roles, and why `requireAdmin` was not used

`requireAuth` and `requireAdmin` both promote every authenticated caller to
administrator when `NEXT_PUBLIC_DEMO_MODE` is on. That is safe for the screens
they were written for, because middleware fakes the writes. It is not safe here:
installing a workspace consumes a real authorization code and stores a real
credential against a real account, and middleware cannot fake any of that.

So `lib/slack/guards.ts` has `requireRealAdmin`, which reads the session's actual
role with no demo branch, and `requireAccountUser`, which requires only a session
and an `accountId` — linking your own Slack account is not an administrative act.
Both require `accountId`: without one there is no workspace to act on, and the
call would otherwise fall through to master.

**If a route has an effect outside this deployment, check the real role.**

### A second place account scoping lives: the client→account WeakMap

`lib/getDb.ts` now records which account each tenant client was opened for, and
`accountIdForClient(client)` reads it back. It belongs in this document because
it is the only other place in the codebase where an account id is derived rather
than passed, and this document exists because derivations like that go wrong
silently.

**What it does.** `getDb(accountId)` calls `registerTenantClient` on every client
it creates, into a `WeakMap<Client, string>`. Nothing else writes to it outside
tests. A `Client` carries no identity of its own, and almost nothing needs it to:
for reading and writing tenant tables, the client *is* the account.

**Why it exists.** Slack delivery is the exception. A Slack link lives in MASTER,
keyed on `(account_id, parlay_user_id)`, so a caller holding only a tenant client
cannot name the account its recipients are in. `lib/notifications.ts` is where
delivery happens and its input type carries no account id — adding one would mean
editing 61 call sites to pass a value every one of them already implies, and 61
edits is 61 chances to pass the wrong one. Reading it back from the client is one
edit and cannot disagree with the database the notification was just written to.

**Master correctly returns `undefined`.** It is not an account, `getDb` returns it
without registering it, and `undefined` is the honest answer rather than a
fallback. Every consumer treats it as "no Slack recipients" and returns silently —
`deliverToSlack` in `lib/notifications.ts` does exactly that. This is the one
place in this document where an absent account id is *not* a bug: it means the
caller is operating on master, which has no per-user Slack links to deliver to.

A client built by hand — a test, a future script — is also unregistered and gets
the same silence. `tests/slack-delivery.mjs` asserts both: that an unregistered
client sends no Slack message, and that it logs nothing while doing so, because
this is an ordinary state and not a failure.

### Where these rows live, and why that is not a contradiction

`slack_workspaces` and `slack_user_links` are in **master**, deliberately, and
`lib/slack/store.ts` is their only access point. One row per account; accounts
live in master; and a bot token is a credential whose revocation should not be a
fan-out across every tenant database that can half-finish. The module header says
so and every query repeats "Master by intent" at its site, precisely because the
default assumption in this codebase is now the opposite.

`slack_user_links` is keyed on `(account_id, parlay_user_id)`, never on
`parlay_user_id` alone — `users.id` is an `AUTOINCREMENT` in each database, so
user 42 exists in many accounts and is a different person in each.

The one tenant read in this flow is the installer's display name, in
`app/api/slack/status/route.ts`. It uses `getDb(auth.user.accountId)` — account
from the session, per the rule — and degrades to a blank name rather than to a
screen reporting Slack as disconnected.

---

## Known defects, logged and not fixed

### The opt-in wrappers do not await their own work

`notifyNoteComment`, `notifyNoteReaction`, `notifyNoteLetsTalk` and
`notifyCommentReaction` call `createOptInNotifications(...)` **without
`await`**. The promise is created and dropped:

```ts
if (opts.noteAuthorUserId && opts.noteAuthorUserId !== opts.commenterUserId) {
  createOptInNotifications(client, {   // ← no await
    ...base,
    userIds: [opts.noteAuthorUserId],
    prefKey: 'note_comment_received',
    …
  });
}
```

This predates the Slack work and is true of the email path too, but Slack makes
its consequences easier to hit. The notification INSERT usually wins the race
because it is the first thing that happens; the email and the Slack DM are two
and three network calls further down. On a serverless runtime the response can
return — and the function be frozen or reclaimed — before either finishes.

**Why it is worth writing down rather than shrugging at.** The symptom is a
notification that appears in the bell icon reliably and arrives in Slack
*sometimes*, with no error anywhere, because nothing failed: the work was simply
abandoned mid-flight. That reads exactly like "Slack is flaky", which is the
wrong diagnosis and one nobody will question a year from now.

`tests/slack-delivery.mjs` has to wait for the work to settle before asserting on
it, and says so at the site. That wait is the test acknowledging the defect, not
working around a slow database.

**The fix** is to `await` the four calls, which means auditing every route that
calls them for whether it is prepared to wait on an email and a Slack round trip
before responding. That is a real piece of work with a real latency cost, not a
one-line change, which is why it is recorded here instead of done in passing.
