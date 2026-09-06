# Parlay notification system — current state

Written ahead of adding Slack as a third delivery channel. Describes what
exists; proposes nothing.

Everything below is quoted source or a query run against the schema. Line
numbers are as of commit `4c38a21`. Where I could not establish something, the
section says so rather than filling the gap.

---

## 0. The short version

There **is** a central dispatcher: `lib/notifications.ts`. Every one of the 61
notification call sites in the app goes through it, and it is the only file in
the repo containing `INSERT INTO notifications`.

But it is not channel-abstracted. In-app and email are two hard-coded blocks
inside one function, and the preference schema is boolean-columns-per-channel
rather than rows-per-channel. Section 2 gives the real answer to the "one
adapter or a third parallel path" question, with the caveats.

---

## 1. The preferences model

### The screen

**`app/auth/account/page.tsx`** — component `NotificationPrefsSection()`, at
line 317. Note the location: it is on the **account page** (`/auth/account`),
not in admin settings. `app/admin/page.tsx` has fourteen tabs and none of them
is notification preferences. If you have been looking for it under admin, that
is why.

It is per-user and self-service. There is no admin-side view of, or override
for, another user's notification preferences anywhere in the repo.

### The table

`notification_preferences`, defined in `lib/db-migrations.ts:239`:

```sql
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id INTEGER PRIMARY KEY,
    company_status_change INTEGER NOT NULL DEFAULT 1,
    follow_up_assigned INTEGER NOT NULL DEFAULT 1,
    note_tagged INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

then extended by fourteen `ALTER TABLE` migrations (lines 450–453, 489–498):

```sql
ALTER TABLE notification_preferences ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1
ALTER TABLE notification_preferences ADD COLUMN company_status_change_email INTEGER NOT NULL DEFAULT 1
ALTER TABLE notification_preferences ADD COLUMN follow_up_assigned_email INTEGER NOT NULL DEFAULT 1
ALTER TABLE notification_preferences ADD COLUMN note_tagged_email INTEGER NOT NULL DEFAULT 1
ALTER TABLE notification_preferences ADD COLUMN note_comment_received INTEGER NOT NULL DEFAULT 0
ALTER TABLE notification_preferences ADD COLUMN note_comment_received_email INTEGER NOT NULL DEFAULT 0
ALTER TABLE notification_preferences ADD COLUMN note_comment_thread INTEGER NOT NULL DEFAULT 0
ALTER TABLE notification_preferences ADD COLUMN note_comment_thread_email INTEGER NOT NULL DEFAULT 0
ALTER TABLE notification_preferences ADD COLUMN note_reaction_received INTEGER NOT NULL DEFAULT 0
ALTER TABLE notification_preferences ADD COLUMN note_reaction_received_email INTEGER NOT NULL DEFAULT 0
ALTER TABLE notification_preferences ADD COLUMN note_lets_talk INTEGER NOT NULL DEFAULT 0
ALTER TABLE notification_preferences ADD COLUMN note_lets_talk_email INTEGER NOT NULL DEFAULT 0
ALTER TABLE notification_preferences ADD COLUMN comment_reaction_received INTEGER NOT NULL DEFAULT 0
ALTER TABLE notification_preferences ADD COLUMN comment_reaction_received_email INTEGER NOT NULL DEFAULT 0
```

**Shape: boolean-columns-per-channel.** One row per user, `user_id` as the
primary key, and a column per (event × channel) pair. The email column is the
in-app column's name with `_email` appended — a convention the code relies on,
see §2.

**Where it lives: the per-tenant Turso DB.** `notification_preferences` is in
the `migrations` array in `lib/db-migrations.ts`, which is applied to tenant
databases by `migrateTenantDb()`. Both the API and the dispatcher reach it
through the tenant client:

```ts
// app/api/notification-preferences/route.ts:26
const db = await getDb(user?.accountId);
```

`getDb(accountId)` returns the tenant client, or the master `db` when
`accountId` is undefined (ops admins — `lib/getDb.ts:17`).

### The event types

| # | Column pair | UI label | Section | In-app default | Email default |
|---|---|---|---|---|---|
| 1 | `company_status_change` / `_email` | Company Status Changes | *(ungrouped, top)* | **on** | **on** |
| 2 | `follow_up_assigned` / `_email` | Follow-up Assigned | *(ungrouped, top)* | **on** | **on** |
| 3 | `note_tagged` / `_email` | Note Mentions | *(ungrouped, top)* | **on** | **on** |
| 4 | `note_comment_received` / `_email` | Comment on My Note | Note Engagement | off | off |
| 5 | `note_comment_thread` / `_email` | Thread Update | Note Engagement | off | off |
| 6 | `note_reaction_received` / `_email` | Note Reaction | Note Engagement | off | off |
| 7 | `note_lets_talk` / `_email` | Let's Talk | Note Engagement | off | off |
| 8 | `comment_reaction_received` / `_email` | Comment Reaction | Note Engagement | off | off |

The first three are opt-**out**; the five under "Note Engagement" are
opt-**in**. That distinction is not cosmetic — it changes which SQL comparison
the dispatcher runs, and it is the thing most likely to bite when you add a
third channel. See §1 "defaults" below.

The upper section has no heading in the UI; only "Note Engagement" is
labelled (`app/auth/account/page.tsx:401`).

**`email_notifications` is a ninth column with no UI.** It is a master email
switch, defaults to 1, and appears in neither `prefItemsOptOut` nor
`prefItemsOptIn`, nor in the API's `ALL_KEYS`. It is readable and writable by
nothing in the app. The dispatcher does read it — as the email opt-out check
for events that carry no `prefKey` (§2). So it is load-bearing but
unreachable: a user cannot turn it off, and an admin cannot turn it off for
them.

### How defaults are applied — **absence means default, at read time**

No `notification_preferences` row is written when a user is created. I checked
`app/api/admin/users/route.ts` (the invite path, lines 55–103) — it inserts a
`config_options` row and a `users` row, and nothing else. Confirmed by absence:
`INSERT INTO notification_preferences` appears exactly once in the repo, in the
PATCH handler below.

Reads resolve defaults in application code:

```ts
// app/api/notification-preferences/route.ts:34
if (result.rows.length === 0) {
  // No row yet — return defaults
  const defaults: Record<string, boolean> = {};
  for (const k of OPT_OUT_KEYS) defaults[k] = true;
  for (const k of OPT_IN_KEYS) defaults[k] = false;
  return NextResponse.json(defaults);
}

const row = result.rows[0];
const out: Record<string, boolean> = {};
for (const k of OPT_OUT_KEYS) out[k] = row[k] == null ? true : Boolean(row[k]);
for (const k of OPT_IN_KEYS) out[k] = row[k] == null ? false : Boolean(row[k]);
```

A row is created lazily on the first toggle, seeded with the three opt-out
pairs on:

```ts
// app/api/notification-preferences/route.ts:73
await db.execute({
  sql: `INSERT INTO notification_preferences (user_id, company_status_change, follow_up_assigned, note_tagged,
           company_status_change_email, follow_up_assigned_email, note_tagged_email)
        VALUES (?, 1, 1, 1, 1, 1, 1)
        ON CONFLICT(user_id) DO NOTHING`,
  args: [user.id],
});
```

**What this means for a third channel.** The default for a new column is
decided in three places that must agree: the `DEFAULT` in the `ALTER TABLE`,
the `OPT_OUT_KEYS`/`OPT_IN_KEYS` split in the API, and — separately — the SQL
comparison in the dispatcher. The dispatcher's asymmetry is the trap:

- Opt-out events query `WHERE ... AND <col> = 0` and treat the result as an
  exclusion list. A user with **no row** is not in that list, so they
  **receive**.
- Opt-in events query `WHERE ... AND <col> = 1` and treat the result as the
  eligible list. A user with **no row** is not in that list, so they
  **receive nothing**.

So for a Slack column, "no row" means *on* if you follow the opt-out pattern
and *off* if you follow the opt-in one, regardless of what you write in the
`ALTER TABLE`. The column `DEFAULT` only applies to rows created *after* the
migration — and for the five Note Engagement columns, rows created before
those migrations read `NULL`, which the API coerces but the dispatcher's
`= 0` / `= 1` comparisons silently treat as neither.

---

## 2. Delivery architecture

**This is the section to read.**

### There is a dispatcher

**`lib/notifications.ts`**, 544 lines. Its header states the contract:

```ts
/**
 * Notification helpers — best-effort, never throws.
 * Errors are swallowed so a notification failure never breaks a primary mutation.
 */
```

Two entry points.

**Public, for opt-out events:**

```ts
export async function createNotifications(p: CreateNotificationsInput): Promise<void>
```

```ts
interface CreateNotificationsInput {
  userIds: number[];
  type: NotifType;               // 'company' | 'attendee' | 'conference' | 'meeting'
  recordId: number;
  recordName: string;
  message: string;               // fully rendered, human-readable
  changedByEmail: string;
  changedByConfigId?: number | null;
  entityType: string;            // 'company' | 'attendee' | 'conference'
  entityId: number;
  prefKey?: NotifPrefKey;        // 'company_status_change' | 'follow_up_assigned' | 'note_tagged'
  db?: Client;                   // tenant client; defaults to master
  skipEmail?: boolean;           // caller sends its own, better email
}
```

**Private, for opt-in events:**

```ts
async function createOptInNotifications(p: CreateOptInNotificationsInput): Promise<void>
```

— not exported; reached only through the five `notifyNote*` / `notifyComment*`
wrappers in the same file.

Plus five convenience wrappers that resolve a recipient set and delegate:
`notifyCompanyAssignees`, `notifyConferenceInternalAttendees`,
`notifyMentionedUsers`, `notifyForAttendee`, and the note-engagement group
(`notifyNoteComment`, `notifyNoteReaction`, `notifyNoteLetsTalk`,
`notifyCommentReaction`).

### Call sites

`INSERT INTO notifications` appears **twice in the whole repo**, both inside
`lib/notifications.ts` (lines 148 and 340 — the opt-out and opt-in paths). No
route writes notification rows directly. That is a genuinely clean choke point.

61 call sites across 27 route files:

| File | Entry point(s) |
|---|---|
| `app/api/follow-ups/route.ts` | `createNotifications` ×2 (`prefKey: 'follow_up_assigned'`) |
| `app/api/companies/[id]/route.ts` | `createNotifications` |
| `app/api/conferences/route.ts` | `createNotifications` |
| `app/api/conferences/[id]/route.ts` | `createNotifications` |
| `app/api/conferences/[id]/attendees/upload/route.ts` | `createNotifications` ×2 |
| `app/api/conferences/[id]/attendees/add/route.ts` | `notifyCompanyAssignees` ×2 |
| `app/api/conferences/[id]/agenda/route.ts` | `notifyConferenceInternalAttendees` |
| `app/api/conferences/[id]/outreach/assign/route.ts` | `createNotifications` |
| `app/api/conferences/[id]/outreach/[companyId]/notes/route.ts` | `notifyMentionedUsers` |
| `app/api/conferences/[id]/outreach/[companyId]/notes/[noteId]/comments/route.ts` | `notifyMentionedUsers` |
| `app/api/conferences/[id]/pre-conference/notes/route.ts` | `notifyMentionedUsers` |
| `app/api/notes/route.ts` | `notifyMentionedUsers`, `notifyForAttendee`, `notifyCompanyAssignees`, `notifyConferenceInternalAttendees` |
| `app/api/notes/[id]/comments/route.ts` | `notifyMentionedUsers`, `notifyNoteComment` |
| `app/api/notes/[id]/reactions/route.ts` | `notifyNoteReaction` |
| `app/api/notes/[id]/lets-talk/route.ts` | `notifyNoteLetsTalk` |
| `app/api/notes/[id]/comments/[commentId]/reactions/route.ts` | `notifyCommentReaction` |
| `app/api/pinned-notes/route.ts` | `notifyForAttendee`, `notifyCompanyAssignees` |
| `app/api/meetings/route.ts` | `notifyForAttendee` |
| `app/api/meetings/[id]/analyze/route.ts` | `createNotifications` |
| `app/api/internal-relationships/route.ts` | `createNotifications` |
| `app/api/social-events/[id]/guest/route.ts` | `notifyForAttendee` |
| `app/api/conference-details/route.ts` | `notifyForAttendee` |
| `app/api/public/form-submissions/route.ts` | `notifyConferenceInternalAttendees` |
| `app/api/program-planner/conferences/[id]/logistics/notes/route.ts` | `notifyMentionedUsers` |
| `app/api/calendar-intelligence/request-input/route.ts` | `createNotifications` |
| `app/api/cron/debrief-notifications/route.ts` | `createNotifications` |

(`app/api/suggestions/route.ts` imports from `lib/notifications` but only
`getConfigIdByEmail`, a lookup helper — it creates no notifications and is not
a call site.)

### But the channels are not abstracted

Inside `createNotifications`, in-app and email are two sequential hard-coded
blocks. There is no channel list, no adapter interface, no registry:

```ts
// lib/notifications.ts:146 — channel 1, in-app
for (const uid of eligibleIds) {
  await client.execute({
    sql: `INSERT INTO notifications
          (user_id, type, record_id, record_name, message,
           changed_by_config_id, changed_by_email, entity_type, entity_id, is_read)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    args: [ /* … */ ],
  });
}

if (p.skipEmail) return;

// channel 2, email — its own preference query, its own recipient resolution
try {
  const ph2 = eligibleIds.map(() => '?').join(',');
  const emailColCheck = p.prefKey ? `${p.prefKey}_email = 0` : `email_notifications = 0`;
  const emailOptOutRows = await client.execute({
    sql: `SELECT user_id FROM notification_preferences
          WHERE user_id IN (${ph2}) AND ${emailColCheck}`,
    args: eligibleIds,
  });
  const emailOptedOut = new Set(emailOptOutRows.rows.map(r => Number(r.user_id)));
  const emailIds = eligibleIds.filter(id => !emailOptedOut.has(id));

  if (emailIds.length > 0) {
    const ph3 = emailIds.map(() => '?').join(',');
    const userRows = await client.execute({
      sql: `SELECT id, email FROM users WHERE id IN (${ph3})`,
      args: emailIds,
    });
    const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? '';
    const link = entityLink(BASE, p.entityType, p.entityId);
    const subject = `${APP_NAME} - ${p.recordName} Notification`;
    for (const row of userRows.rows) {
      await sendNotificationEmail(String(row.email), subject, p.message, link);
    }
  }
} catch (err) {
  console.error('[notifications] email send error:', err);
}
```

Note `${p.prefKey}_email` — the email column name is **derived by string
concatenation** from the in-app one. The file says so deliberately:

```ts
// The email column is derived from the in-app one, which is the naming
// convention the table already follows and stops the pair from drifting apart.
type OptInEmailPrefKey = `${OptInPrefKey}_email`;
```

That convention is the closest thing to a channel abstraction that exists. A
`_slack` suffix would fit it.

`createOptInNotifications` (line 327) repeats the same two blocks with `= 1`
comparisons instead of `= 0`. **The two functions do not share the fan-out
code** — they each have their own copy of the insert loop and their own copy of
the email block. Any channel work has to be done twice, or the two have to be
merged first.

### Direct answer

**Mostly one place, but not one adapter — and there are five leaks.**

The optimistic reading is correct as far as it goes: 61 call sites, one file,
two functions. You are not editing 27 routes.

The work is:

1. **Two fan-out functions, not one.** `createNotifications` and
   `createOptInNotifications` each need the third block, or need merging first.
2. **No channel abstraction to implement.** There is no `Channel` interface, no
   array of transports, no per-channel recipient resolver. You are adding a
   third hard-coded block alongside two hard-coded blocks — or introducing the
   abstraction as part of the work.
3. **A third recipient resolution.** Both existing channels resolve recipients
   from `users` by `id`; email additionally selects `email`. Slack needs a
   workspace/user-id mapping that does not exist in any table today (§7, §10).
4. **Five email sites bypass the dispatcher entirely.** These send mail without
   consulting `notification_preferences` at all:

   | File | Function | What it sends |
   |---|---|---|
   | `app/api/cron/debrief-notifications/route.ts:173` | `sendDebriefEmail` | post-conference field report (in-app via dispatcher with `skipEmail: true`, email direct) |
   | `app/api/conferences/route.ts:1033` | `sendNotificationEmail` | upload-complete (same `skipEmail: true` pattern) |
   | `app/api/conferences/[id]/attendees/upload/route.ts` | `sendNotificationEmail` | upload complete / failed |
   | `app/api/calendar-intelligence/request-input/route.ts` | `sendInputRequestEmail` | input request with decision links |
   | `app/api/calendar-intelligence/request-input/remind/route.ts` | `sendInputRequestEmail` | reminder for the above |

   The `skipEmail` flag exists precisely to let a caller send a better email
   than the generic one. Its docstring:

   ```ts
   /**
    * Skip the generic notification email. For callers that send their own,
    * better one — an input request with decision links, a debrief with stats —
    * so the reader doesn't get both.
    */
   skipEmail?: boolean;
   ```

   **Consequence for you:** these five are exactly the events most worth
   sending to Slack (a field report, an input request), and they are the five
   that would not pick up a channel added inside the dispatcher. Whatever
   `skipEmail` becomes for three channels is a design question this codebase
   has not had to answer yet.

5. **Templating is per-channel, not per-event.** The dispatcher passes a
   pre-rendered `message: string` and a single `link`. There is no structured
   payload (§3) — so Slack Block Kit would either re-render from the message
   string, or the payload contract has to change at all 61 call sites.

There is **no plan or capability gate on delivery**. `lib/capabilities.ts`
declares a `notifications_all_types: boolean` flag and sets it per plan
(lines 109, 116, 287), but grepping the rest of `app/`, `lib/` and
`components/` for that identifier returns nothing — it is declared and never
read. Nothing in the delivery path consults it.

---

## 3. Event triggers

| Event (pref) | Fires from | Trigger | Payload | Recipients |
|---|---|---|---|---|
| `follow_up_assigned` | `app/api/follow-ups/route.ts:201` (POST) and `:323` (PATCH batch reassign) | request | rendered message + `entityType`/`entityId`; batch collapses to one "assigned to N follow-ups" | `resolveUserIds(assigned_rep)` — config IDs → user IDs, actor excluded |
| `note_tagged` | `app/api/notes/route.ts:298`; also `notes/[id]/comments`, `pre-conference/notes`, `outreach/.../notes`, `outreach/.../comments`, `program-planner/.../logistics/notes` | request | message names mentioner + entity | `tagged_users` — a **comma-separated string of `config_options.id`** posted by the client, parsed at `:299`. Not a server-side text parser. |
| `company_status_change` | **see below — misnamed** | request | — | — |
| `note_comment_received` | `app/api/notes/[id]/comments/route.ts` → `notifyNoteComment` | request | message + note/entity IDs | note author (`noteAuthorUserId`), excluding self |
| `note_comment_thread` | same call | request | same | `previousCommenterUserIds`, minus author and actor |
| `note_reaction_received` | `app/api/notes/[id]/reactions/route.ts` | request | message with 👍/👎 | note author, excluding self |
| `note_lets_talk` | `app/api/notes/[id]/lets-talk/route.ts` | request | message + "commenting has been closed" | `recipientUserIds` passed by the route, minus trigger |
| `comment_reaction_received` | `app/api/notes/[id]/comments/[commentId]/reactions/route.ts` | request | message with 👍/👎 | comment author, excluding self |

### Flag: "Company Status Changes" has no status-change trigger

`company_status_change` is the `prefKey` hard-coded inside
`notifyCompanyAssignees` (`lib/notifications.ts:230`). That helper is called
from three places, and **none of them is a status change**:

| Caller | Message |
|---|---|
| `app/api/notes/route.ts:277` | `New note added: "${snippet}"` |
| `app/api/pinned-notes/route.ts:110` | `Note pinned: "${snippet}"` |
| `app/api/conferences/[id]/attendees/add/route.ts:78,177` | `${attendeeName} added to ${confName}` |

Meanwhile the one place a company's assignment actually changes —
`app/api/companies/[id]/route.ts:293` — calls `createNotifications` with **no
`prefKey` at all**:

```ts
// Notify newly added assignees (best-effort)
if ('assigned_user' in body && assigned_user) {
  const prevIds = new Set(parseNotifIds(prevAssignedUser));
  const newIds = parseNotifIds(assigned_user);
  const addedIds = newIds.filter(id => !prevIds.has(id));
  if (addedIds.length > 0) {
    // …
    createNotifications({
      userIds,
      // …
      message: `You've been assigned as SF Owner for ${name}`,
      entityType: 'company',
      entityId: Number(params.id),
    });          // ← no prefKey
  }
}
```

So: the toggle labelled "When a company you're assigned to changes status"
actually governs notes, pinned notes and attendee additions; and the genuine
assignment-change notification cannot be turned off by any toggle on the
screen. I searched `app/api/companies/bulk/route.ts` for a status-change
notification and found none.

### Events with no preference at all

These reach the dispatcher without a `prefKey`, so the in-app row is always
written and email is gated only by the invisible `email_notifications` column:

| Event | Site | Message |
|---|---|---|
| Meeting analysis ready | `app/api/meetings/[id]/analyze/route.ts:448` | `Meeting analysis ready: ${attendeeName} · ${mtg.conference_name}` |
| Internal relationship added | `app/api/internal-relationships/route.ts:127` | `You've been added as a rep in an internal relationship for ${companyName}` |
| Outreach assigned | `app/api/conferences/[id]/outreach/assign/route.ts:172` | `${assignerName} assigned you to outreach for ${companyName} at ${conferenceName}` |
| Calendar input requested | `app/api/calendar-intelligence/request-input/route.ts:145` | `${requesterName} has requested your input on ${conferenceName}` |
| Attendee upload complete/failed | `app/api/conferences/[id]/attendees/upload/route.ts:1212,1241` | `Upload complete for …` / `Upload failed for …` |
| Conference agenda changes | `app/api/conferences/[id]/agenda/route.ts` | via `notifyConferenceInternalAttendees` (no prefKey) |
| Public form submission | `app/api/public/form-submissions/route.ts` | via `notifyConferenceInternalAttendees` |
| Field report ready | `app/api/cron/debrief-notifications/route.ts:157` | `Your Field Report for … is ready.` |

**That is eight event families in the product with no row on the preferences
screen** — roughly as many as the eight that do have rows.

### Payload: rendered strings, not structured data

Every call site passes `message` as a fully-rendered sentence. The dispatcher
adds one link, derived from `entityType` + `entityId` via a two-entry map:

```ts
const RECORD_PATHS: Record<string, string> = {
  attendee: '/attendees', company: '/companies', conference: '/conferences',
};
const LIST_PATHS: Record<string, string> = {
  follow_up: '/follow-ups',
};
```

For Slack this is enough to post a text line with a link, and not enough for
Block Kit with fields, buttons or an entity avatar, without either re-parsing
the message string or changing the payload contract at the call sites.

---

## 4. Scheduled work

### Infrastructure exists — Vercel Cron, one job

`vercel.json`, complete file:

```json
{
  "crons": [
    {
      "path": "/api/cron/debrief-notifications",
      "schedule": "0 23 * * *"
    }
  ]
}
```

`app/api/cron/` contains exactly one route. No queue (no BullMQ, no Inngest, no
QStash), no worker process, no `node-cron`. The only `setInterval` calls are
client-side polling (`lib/pollingManager.ts`, `lib/usePendingInputRequestCount.ts`).

The app is deployed to Netlify as well (`netlify.toml` exists), and Netlify
does not read `vercel.json` crons. **I could not determine from the repo which
platform is live**, so I cannot tell you whether this cron currently fires in
production. Worth confirming before you rely on it.

### Authentication — bearer secret, with a soft failure mode

```ts
// app/api/cron/debrief-notifications/route.ts:192
export async function GET(request: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
```

Note the `process.env.CRON_SECRET &&` guard: if the variable is unset, the
endpoint is **publicly callable**. Anyone hitting the URL triggers a fan-out
across every tenant. The idempotency table (below) limits the blast radius to
one send per user per conference, but it is open by default.

### Idempotency — yes, and it is a good pattern

Insert-first, treat the constraint violation as "already done":

```ts
// table, created on demand at :39
CREATE TABLE IF NOT EXISTS debrief_notifications_sent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  sent_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, conference_id)
)
```

```ts
// :81
// Idempotency check
try {
  await tenantDb.execute({
    sql: `INSERT INTO debrief_notifications_sent (user_id, conference_id) VALUES (?, ?)`,
    args: [userId, conferenceId],
  });
} catch {
  // UNIQUE violation — already sent
  continue;
}
```

This is the only idempotency mechanism in the notification system. It is
per-job (the table is specific to debriefs) and per-(user, conference) — not
per-channel. If Slack delivery fails after the row is written, a retry skips
the user entirely rather than retrying just Slack.

### Time-based notifications — one exists

The debrief job is genuinely time-triggered, not action-triggered:

```ts
// :26 — conferences whose end_date is today
const r = await tenantDb.execute({
  sql: `SELECT id, name, internal_attendees FROM conferences WHERE DATE(end_date) = ?`,
  args: [todayUtc],
});
```

Multi-tenant fan-out is handled by iterating accounts from the master DB:

```ts
// :214
const accounts = await db.execute({
  sql: 'SELECT id, turso_db_url, turso_auth_token FROM accounts WHERE turso_db_url IS NOT NULL',
  args: [],
});

for (const account of accounts.rows) {
  try {
    const tenantClient = createClient({
      url: String(account.turso_db_url),
      authToken: String(account.turso_auth_token),
    });
    totalSent += await processAccount(tenantClient, String(account.id), todayUtc);
  } catch { /* skip unreachable tenants */ }
}
```

**For "post-conference window closing":** the pattern you need already exists
and is proven — date query, per-tenant loop, insert-first idempotency, tenant
client passed to `createNotifications({ db: tenantDb, … })`. You would be
adding a second cron entry and a second sent-table, not building
infrastructure. Two caveats: everything is UTC (`now.toISOString().slice(0,10)`)
with no per-account timezone anywhere in the job, and `maxDuration = 300` caps
the whole multi-tenant run at five minutes.

---

## 5. In-app notifications

### Schema

`lib/db-migrations.ts:204`:

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    record_name TEXT NOT NULL,
    message TEXT NOT NULL,
    changed_by_config_id INTEGER,
    changed_by_email TEXT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read)
```

No `channel` column, no delivery-status column, no per-channel timestamps. A
row *is* the in-app notification; there is no record anywhere of whether the
email for it sent.

### Read/unread

A single `is_read` integer. `PATCH /api/notifications` accepts `{ id }`,
`{ ids }` or `{ all: true }`, all scoped by `user_id`:

```ts
// app/api/notifications/route.ts:70
if (body.all) {
  await db.execute({
    sql: 'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    args: [user.id],
  });
}
```

There is no "unread again", and no per-channel read state.

### The badge

Two different badges sit next to each other in the header
(`components/Header.tsx:247–249`):

```tsx
{/* Notification Bell */}
<NotificationBell />
{/* Outstanding Follow Ups */}
<OutstandingFollowUps />
```

**The red 69 on the alert-triangle icon is `OutstandingFollowUps`, not
notifications.** It reads `/api/follow-ups/outstanding`
(`components/OutstandingFollowUps.tsx:66`) and has nothing to do with this
system.

The **bell** is the notification badge. It has no count endpoint — it fetches
rows and takes `.length`:

```ts
// components/NotificationBell.tsx:82
const fetchUnreadCount = useCallback(async () => {
  try {
    const res = await fetch('/api/notifications?unread_only=1&limit=200');
    if (!res.ok) return;
    const data = await res.json();
    setUnreadCount(Array.isArray(data) ? data.length : 0);
  } catch { /* non-fatal */ }
}, []);
```

```ts
// :106 — 30s poll, no websocket/SSE anywhere in the app
startPolling('notification-bell', fetchUnreadCount, 30_000, 30_000);
```

The API clamps `limit` to 200 (`Math.min(parseInt(…), 200)`), so **the badge
saturates at 200** and a user with more unread sees 200. The sidebar caps
display at `99+` (`components/Sidebar.tsx:196`).

### Retention — none

`DELETE FROM notifications` does not appear anywhere in the repo. There is no
archival table, no TTL, no cleanup job, no cascade other than
`ON DELETE CASCADE` when the user row is deleted. Rows accumulate indefinitely,
and the bell re-fetches up to 200 of them every 30 seconds per session.

---

## 6. Email

### The sending path

`lib/email.ts`, 435 lines. Transport is created **per send**:

```ts
// lib/email.ts:11
function createTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}
```

No connection pooling or reuse. With no `SMTP_HOST` the module degrades to
console logging and returns the link so dev flows still work:

```ts
// :24
async function sendEmail(to: string, subject: string, html: string): Promise<{ devLink?: string }> {
  const transport = createTransport();
  if (!transport) {
    // Dev mode: log the email content and return the link so callers can surface it
    const linkMatch = html.match(/href="(http[^"]+)"/);
    const devLink = linkMatch?.[1];
    console.log(
      `\n📧 [DEV EMAIL — configure SMTP_HOST to send real emails]\n` +
      `  To: ${to}\n  Subject: ${subject}\n  Link: ${devLink ?? '(none)'}\n`
    );
    return { devLink };
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `"${APP_NAME}" <noreply@example.com>`,
    to,
    subject,
    html,
  });
  return {};
}
```

### Templates — inline HTML, one function each

There is no template directory, no MJML, no React Email. Templates are template
literals inside `lib/email.ts`, sharing three style constants:

```ts
// :47
const baseStyle = `font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a`;
const btnStyle = `display:inline-block;padding:12px 28px;background:#0B3C62;color:#ffffff;` +
  `text-decoration:none;border-radius:6px;font-weight:600;font-size:15px`;
const footerStyle = `color:#888;font-size:12px;margin-top:24px`;
```

Note `#0B3C62` hard-coded — the email templates do **not** use the per-tenant
brand colour the app UI uses.

Eleven exported senders: `sendVerificationEmail`, `sendPasswordResetEmail`,
`sendEmailChangeVerification`, `sendNotificationEmail`, `sendDebriefEmail`,
`sendInviteEmail`, `sendEmailChangeNotification`, `sendWelcomeEmail`,
`sendInputRequestEmail`, `sendTrialReminderEmail`, plus the builder
`buildInputRequestEmailHtml`.

### Template selection per event — there isn't any

Every dispatcher-routed notification uses **one** template with a generic
subject, regardless of event type:

```ts
// lib/notifications.ts:182
const subject = `${APP_NAME} - ${p.recordName} Notification`;
```

```ts
// lib/email.ts:107
export async function sendNotificationEmail(
  email: string, subject: string, message: string, link: string | null,
): Promise<void> {
  await sendEmail(
    email,
    subject,
    `<div style="${baseStyle}">
      <h2 style="color:#0B3C62">New Notification</h2>
      <p style="margin:0 0 16px">${message}</p>
      ${link ? `<p style="margin:24px 0"><a href="${link}" style="${btnStyle}">View Details</a></p>` : ''}
      <p style="${footerStyle}">You are receiving this because you have email notifications enabled. Manage your preferences in account settings.</p>
    </div>`
  ).catch(() => {}); // best-effort — never throws
}
```

Per-event templates exist only for the five sites that bypass the dispatcher
(§2) — that is *why* they bypass it.

`${message}` is interpolated into HTML without escaping. Messages are built
from user-controlled strings (note snippets, company names, attendee names). I
did not audit whether anything upstream escapes them; flagging it as observed,
not diagnosed.

### Synchronous, in-request

Sends are awaited inside the request handler. There is no queue and no
`waitUntil` around the notification path (`waitUntil` is imported in
`app/api/conferences/route.ts` for analytics, not for mail). A slow SMTP server
directly slows the mutation that triggered it — mitigated only by every layer
swallowing errors.

### Bounces, failures, retries — none

- No retry logic anywhere.
- No bounce webhook, no inbound route, no suppression list.
- No delivery log — nothing records that an email was attempted, let alone
  delivered.
- Failures are caught and discarded at three levels: `.catch(() => {})` in
  `sendNotificationEmail`, `catch (err) { console.error(…) }` around the email
  block in the dispatcher, and `catch { /* non-blocking */ }` at several call
  sites.

If email delivery breaks, nothing in the product will show it.

---

## 7. Users

### Schema

Base table (`lib/db.ts:147`):

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'administrator')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT,
  reset_token TEXT,
  reset_token_expires INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
)
```

Extended by migration:

```sql
ALTER TABLE users ADD COLUMN config_id INTEGER REFERENCES config_options(id)   -- :203
ALTER TABLE users ADD COLUMN display_name TEXT                                  -- :235
ALTER TABLE users ADD COLUMN email_pending TEXT
ALTER TABLE users ADD COLUMN email_change_token TEXT
ALTER TABLE users ADD COLUMN email_change_expires INTEGER
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1                  -- :513
ALTER TABLE users ADD COLUMN invite_token TEXT
ALTER TABLE users ADD COLUMN invite_expires INTEGER
ALTER TABLE users ADD COLUMN first_name TEXT
ALTER TABLE users ADD COLUMN last_name TEXT
ALTER TABLE users ADD COLUMN signature_html TEXT                                -- :542
ALTER TABLE users ADD COLUMN last_seen_at TEXT                                  -- :617
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0                -- :657
ALTER TABLE users ADD COLUMN clerk_id TEXT                                      -- :1287
```

**Email: present, `NOT NULL`, and `UNIQUE`.** A later migration rebuilds the
table as `users_new` with a widened role CHECK
(`'user','administrator','sales_rep','manager','analyst','conference_coordinator','stakeholder'`)
— the `email TEXT UNIQUE NOT NULL` constraint carries over.

### External identity linkage — yes, two kinds

**1. `users.clerk_id TEXT`** — nullable, no unique index that I found.
`CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SECRET` are in the env inventory, and
middleware matches `/__clerk/:path*`. I did not trace how much of the auth flow
actually runs through Clerk versus the local `password_hash` path; both appear
present.

**2. `oauth_connections`** (`lib/db-migrations.ts:519`) — this is the closest
existing analogue to what Slack needs:

```sql
CREATE TABLE IF NOT EXISTS oauth_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
    provider_email TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

Per-user, per-provider, with refresh tokens and expiry. The `provider` CHECK
constraint would need widening for `'slack'`. The connect/disconnect UI already
exists in `app/auth/account/page.tsx` (the "Connected Accounts" section,
`PROVIDERS` at line 480).

### Where users live

**Per-tenant.** `users` is in the `migrations` array applied to tenant DBs, and
every notification query resolves through `getDb(user.accountId)`. The master
DB has its own `users` table for ops admins (`getDb(undefined)` returns
master).

The dispatcher's default is master, which the code calls out as a hazard:

```ts
/**
 * The database to write against. Accounts each have their own, and a
 * notification written to the master DB for a tenant user reaches nobody —
 * their users row isn't there. Callers holding a tenant client should pass
 * it. Defaults to master, which is what every caller got before this existed.
 */
db?: Client;
```

`createOptInNotifications` has **no such parameter** — it uses the imported
master `db` unconditionally (lines 331, 339, 354, 361). By the docstring's own
logic, the five Note Engagement events would not reach tenant users. I did not
run this against a real tenant to confirm the failure, so I am reporting the
inconsistency rather than asserting the bug.

### `users` vs the `user` config_options category — **both, and this matters**

They are different tables joined by `users.config_id`.

- **`config_options` where `category = 'user'`** is the rep list. It is what
  `assigned_user`, `internal_attendees`, `assigned_rep`, `scheduled_by` and
  `tagged_users` store — as **comma-separated `config_options.id` strings**.
  `getRepInitials` and `RepMultiSelect` operate on these. A rep can exist here
  with no login at all.
- **`users`** is the login. It may or may not have a `config_id`.

Every recipient set is computed by translating the first into the second:

```ts
// lib/notifications.ts:93
export async function resolveUserIds(
  configIdStr: string | null | undefined,
  excludeConfigId?: number | null,
): Promise<number[]> {
  const ids = parseNotifIds(configIdStr);
  if (ids.length === 0) return [];
  try {
    const ph = ids.map(() => '?').join(',');
    const rows = await db.execute({
      sql: `SELECT id, config_id FROM users WHERE config_id IN (${ph})`,
      args: ids,
    });
    return rows.rows
      .filter(r => excludeConfigId == null || Number(r.config_id) !== excludeConfigId)
      .map(r => Number(r.id));
  } catch {
    return [];
  }
}
```

**A notification recipient is always a `users` row.** A rep who is a config
option without a linked user silently receives nothing — `resolveUserIds`
returns fewer IDs than it was given, with no error. Slack identity should
therefore hang off `users`, like `oauth_connections` does.

Note also that `resolveUserIds` uses the imported master `db`, not a tenant
client, and takes no `db` parameter — same inconsistency as above.

The invite flow links the two by *display-name string match*
(`app/api/admin/users/route.ts:67`), reusing an existing config option when the
name matches and nobody has claimed it, otherwise creating
`"${displayName} (${email})"`. The debrief cron joins them the other way, by
name:

```sql
SELECT u.id, u.email, u.config_id, co.value as rep_name
FROM users u
JOIN config_options co ON co.id = u.config_id
WHERE co.value IN (…)      -- matched against conferences.internal_attendees
```

---

## 8. Admin usage tab

**`app/admin/page.tsx`**, component `AdminUsageTab()` at line 6207, rendered at
line 4180 (`{tab === 'usage' && <AdminUsageTab />}`). Data comes from
**`app/api/admin/usage/route.ts`**, admin-gated via `requireAdmin`.

### What it measures

Three summary tiles (`total_users`, `active_last_30d`, `logins_last_30d`), a
30-day login sparkline, and a sortable per-user table:

```ts
const cols: { key: UsageSortKey; label: string }[] = [
  { key: 'display_name', label: 'Name' },
  { key: 'email',        label: 'Email' },
  { key: 'role',         label: 'Role' },
  { key: 'active',       label: 'Status' },
  { key: 'created_at',   label: 'Member Since' },
  { key: 'last_seen_at', label: 'Last Login' },
  { key: 'total_logins', label: 'Total Logins' },
  { key: 'logins_30d',   label: '30d Logins' },
  { key: 'notes_written',    label: 'Notes' },
  { key: 'comments_written', label: 'Comments' },
  { key: 'messages_sent',    label: 'Messages' },
];
```

One query, all counts as `LEFT JOIN` + `COUNT(DISTINCT …)` grouped by user:

```sql
SELECT
  u.id, u.email, u.display_name, u.first_name, u.last_name,
  u.role, u.active, u.created_at, u.last_seen_at,
  COUNT(DISTINCT s.id)                                                            AS total_logins,
  COUNT(DISTINCT CASE WHEN s.created_at >= date('now', '-30 days') THEN s.id END) AS logins_30d,
  COUNT(DISTINCT en.id)                                                           AS notes_written,
  COUNT(DISTINCT nc.id)                                                           AS comments_written,
  COUNT(DISTINCT dm.id) + COUNT(DISTINCT gm.id)                                   AS messages_sent
FROM users u
LEFT JOIN user_sessions   s  ON s.user_id = u.id
LEFT JOIN entity_notes    en ON en.author_user_id = u.id
LEFT JOIN note_comments   nc ON nc.user_id = u.id
LEFT JOIN direct_messages dm ON dm.sender_id = u.id
LEFT JOIN group_messages  gm ON gm.sender_id = u.id
GROUP BY u.id
ORDER BY logins_30d DESC, u.created_at ASC
```

### Extensible?

**Yes, without restructuring.** The table is driven by the `cols` array and a
`UsageUser` interface keyed off one row shape, sorted generically by
`UsageSortKey = keyof UsageUser`. Adding per-user Slack connection status is:
one `LEFT JOIN` in the existing query, one field on `UsageUser`, one entry in
`cols`. The rows are already per-`users.id`, which is the grain Slack identity
would live at.

Two constraints: the cell renderer switches on key for the special cases
(`active`, dates), so a boolean would need a case or would render as `0`/`1`;
and everything is a `COUNT` today, so a status string is a slightly new shape
for this table.

---

## 9. Secrets

### Env vars

Everything global is an env var. Full inventory found in `app/` and `lib/`:

```
ALLOWED_EMAIL_DOMAIN     ANTHROPIC_API_KEY        CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET     CRON_SECRET              DEMO_BYPASS_SECRET
GOOGLE_CLIENT_ID         GOOGLE_CLIENT_SECRET     GOOGLE_PLACES_API_KEY
JWT_SECRET               MICROSOFT_CLIENT_ID      MICROSOFT_CLIENT_SECRET
MICROSOFT_TENANT_ID      NEXT_PUBLIC_APP_NAME     NEXT_PUBLIC_BASE_URL
NEXT_PUBLIC_COOKIE_DOMAIN NEXT_PUBLIC_DEMO_MODE   NODE_ENV
NOTE_EXTRACTION_ENABLED  OPENAI_API_KEY           OPS_ADMIN_EMAILS
R2_ACCESS_KEY_ID         R2_ACCOUNT_ID            R2_BUCKET_NAME
R2_PUBLIC_URL            R2_SECRET_ACCESS_KEY     SMTP_FROM
SMTP_HOST                SMTP_PASS                SMTP_PORT
SMTP_SECURE              SMTP_USER                STRIPE_PRICE_* (10)
```

SMTP credentials are global — **there is no per-tenant SMTP configuration**.
All tenants send from one mailbox.

### Per-tenant credentials in the database — yes, in plaintext

Two places store credentials in DB columns:

**1. Tenant database credentials, in the master DB** (`lib/db-migrations.ts:658`):

```sql
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    admin_email TEXT NOT NULL,
    …
    turso_db_url TEXT,
    turso_auth_token TEXT,
    …
)
```

Read and used directly, no decryption step:

```ts
// lib/getDb.ts:29
const row = await db.execute({
  sql: `SELECT turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
  args: [accountId],
});
```

**2. Per-user OAuth tokens, in the tenant DB** — `oauth_connections.access_token`
(`NOT NULL`) and `refresh_token`, both plain `TEXT` (§7).

### Encryption at rest — **none. You would be introducing it.**

I grepped `app/` and `lib/` for `createCipheriv`, `createDecipheriv` and crypto
imports. Every `crypto` import in the codebase is `randomBytes`, `randomUUID`
or a hash — token generation and IDs, never symmetric encryption:

```
app/api/admin/master-accounts/upload/route.ts:  randomBytes
app/api/admin/upload-logo/route.ts:             randomBytes
app/api/ops/accounts/[id]/impersonate/route.ts: randomUUID
app/api/auth/trial-signup/route.ts:             randomUUID
app/api/public/score-audience/route.ts:         crypto (hashing)
app/api/attendees/[id]/photo/route.ts:          randomBytes
… (all remaining are randomBytes for filenames)
```

There is no `lib/crypto.ts`, no KMS client, no envelope-encryption helper, and
no encryption key in the env inventory. `bcrypt` is used for password hashing
only (one-way).

**So: Slack bot/user tokens would follow the existing precedent by being stored
as plaintext TEXT next to the OAuth tokens, or you introduce the first
encryption-at-rest mechanism in the codebase.** That is a real decision, and
nothing existing will make it for you.

---

## 10. Existing Slack code

**Confirmed: none.**

I searched the full repo (excluding `node_modules`, `.next`, `.git`) for
`slack`, `Slack` and `SLACK` across `.ts`, `.tsx`, `.json` and `.md`. Zero
matches. Specifically:

- No dependency in `package.json` (`@slack/web-api`, `@slack/bolt`, or
  anything else Slack-related).
- No `SLACK_*` env var in the inventory above.
- No table, column, or migration referencing Slack.
- No route under `app/api/` referencing Slack.
- No UI component or setting.

The nearest existing thing is the `oauth_connections` table and its
"Connected Accounts" UI (§7), which is per-user OAuth for Google and Microsoft.
That is the pattern a per-user Slack link would resemble; a per-conference
channel mapping has no analogue in the schema today.

---

## Uncertainties

Stated plainly rather than papered over:

1. **Which host is live.** `vercel.json` defines the cron; `netlify.toml`
   exists and Netlify ignores that file. I cannot tell from the repo whether
   the debrief cron currently runs in production.
2. **Clerk's actual role.** `users.clerk_id`, two Clerk env vars and a
   middleware matcher exist alongside a complete local password/JWT auth path.
   I did not determine which is authoritative, or whether `clerk_id` is
   populated.
3. **The tenant-DB inconsistency in `createOptInNotifications` and
   `resolveUserIds`** (§7). Both use the master `db` while their opt-out
   counterpart accepts a tenant client. By the dispatcher's own docstring this
   would mean Note Engagement notifications do not reach tenant users. I did
   not execute against a tenant to confirm, so it is reported as an observed
   inconsistency, not a proven defect.
4. **HTML escaping of `message`** (§6). Interpolated unescaped into email HTML;
   I did not audit the upstream construction sites.
