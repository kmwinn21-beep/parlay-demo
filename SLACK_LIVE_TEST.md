# Slack delivery — live test guide

For walking the deployed app after merge. Written to be followed while it is
failing, so the diagnosis sections are longer than the happy path.

Assumes you already have: a workspace connected in Admin Settings, your own link
written during install, and Slack columns at their default of 0.

---

## Read this first — you cannot notify yourself

**Every notification path in this codebase excludes the person who caused it.**
Assigning a follow-up to yourself sends you nothing. Mentioning yourself in a
note sends you nothing. This is not a Slack thing; it is true of the in-app
notification and the email too, and it has always been true.

The mechanism is `resolveUserIds(client, configIds, excludeConfigId)` in
`lib/notifications.ts`, which drops the actor's own rep profile from the
recipient list before anything is written. `notifyNoteComment` does the same by
user id.

So **you need a second person in the account**, or a second login of your own.
Everything below assumes two users:

| | who |
| --- | --- |
| **YOU** | the linked Slack user, receiving |
| **THEM** | anyone else in the same Parlay account, acting |

THEM does not need Slack connected. They only need to be able to act.

If you do not have a second user, invite one from Admin Settings → User
Management. That is the first step of this guide, not an aside — without it
nothing below will fire.

---

## Part 1 — one DM

### Preconditions, in the order they will bite you

1. **YOU have a Rep Profile set.**
   My Account → Profile & Identity → Rep Profile → pick yourself → Save Profile.

   This is the one people skip. Mentions and follow-up assignments both resolve
   recipients through `users.config_id`. With no Rep Profile you have no
   `config_id`, you cannot be @mentioned or assigned, and nothing will ever
   reach you through either path.

2. **YOU have Slack linked.**
   My Account → Slack card → should read **Connected**, with your Slack member
   id (`U…`) underneath. If it says anything else, stop and fix that first.

3. **YOU have the Slack toggle on for the event you are about to fire.**
   My Account → Notification Preferences → the **SLACK** column, third from the
   left after IN-APP and EMAIL → turn on **Note Mentions**.

   If the Slack column is greyed out, read the grey line just above the table —
   it says whether the workspace or your link is the missing piece.

   Nothing is on by default. This is deliberate; do not assume it inherited from
   the IN-APP column.

4. **THEM is a real second user** who can see the same company record.

### The trigger — fewest clicks

**@mentioning you in a note** is the shortest path. Six clicks, no records to
create:

1. THEM opens any company: **Companies → click a company row**.
2. In the notes area, **click into the note box**.
3. Type `@` and pick **YOU** from the list.
   If YOU do not appear in that list, precondition 1 is not satisfied — go back
   and set the Rep Profile.
4. Type anything after the mention.
5. **Save the note.**

The follow-up route works too — THEM goes to **Follow-ups**, opens one, sets
**Assigned Rep** to YOU, saves — but it needs a follow-up to already exist and
the toggle is **Follow-up Assigned** instead. Use it as the second event in
Part 2.

### What a working DM looks like

**Where:** in the **Apps** section of your Slack sidebar, not in your regular DM
list. This trips people up more than any other single thing — the message is
delivered, the sidebar is just not where they are looking. If the app is not in
the sidebar, search Slack for the app's name.

**From:** the Slack app you installed, showing an **APP** badge next to its name.

**Text:** exactly two lines.

```
<Their name> mentioned you in a note related to <Company name>
https://<your domain>/companies/<id>
```

The first line is the identical string that appears in your in-app bell and in
the email. The second is a bare URL on its own line, with no link preview card —
previews are switched off deliberately, because the message above already says
everything the card would.

**If the second line is `/companies/7` rather than a full URL**, the DM
delivered correctly but `NEXT_PUBLIC_BASE_URL` is not set on the deployment.
Slack renders a bare path as plain text, so it will not be clickable. Fix the
env var; nothing in the Slack code is wrong.

---

## If nothing arrives

### Step 0 — establish whether the notification fired at all

**Do this before looking at any logs.** Check your in-app bell icon.

| bell | meaning |
| --- | --- |
| **shows the notification** | the dispatcher ran and Slack is the only channel that failed. Continue to step 1. |
| **shows nothing** | the event never reached the notification system at all. Slack is not involved. Go to step 5. |

This one check splits the problem in half, and it is the only reliable way to
tell a silent Slack skip from an event that never happened — see "the failure
with no log" below.

### Step 1 — the three silent skips, in order of likelihood

These produce **no log line at all**. They are by far the most likely reason
nothing arrived, and there is nothing to search for, so check them by looking at
the app rather than at Vercel:

1. **Your Slack toggle for that event is off.**
   My Account → Notification Preferences → SLACK column. Confirm the specific
   row you triggered, not a neighbouring one. This is the single most common
   cause: it defaults to off and turning on **Note Mentions** does nothing for a
   **Follow-up Assigned** event.

2. **Your Slack link is missing.**
   My Account → Slack card. Must read **Connected**. If it reads
   **Disconnected in Slack**, see step 2.

3. **No workspace installed for the account.**
   Admin Settings → Slack tab.

All three are deliberately silent, because they describe almost every account
that has not set Slack up, and logging them would bury the real failures.

### Step 2 — the workspace was uninstalled from Slack's side

**Symptom on screen:** Admin Settings → Slack shows a red **Disconnected in
Slack** badge and a red banner. My Account shows "Slack notifications are
paused".

**Vercel log search:**

```
the installation is gone
```

or narrower:

```
Slack says 'token_revoked'
Slack says 'account_inactive'
Slack says 'invalid_auth'
```

**Full shape of the line:**

```
[slack] could not open a DM for account <acct> user <id> (slack <U…>): Slack says
'token_revoked' — the installation is gone, most likely uninstalled from the
Slack side. Marking the workspace revoked; no further Slack delivery for this
account until it is reconnected.
```

**Fix:** Admin Settings → Slack → **Reconnect**. Everyone's individual links
survive a revocation and a reconnect, so nobody has to link again.

This happens the first time a send is attempted after the uninstall, not at the
moment of the uninstall — Slack does not tell us, so a failed send is the first
we hear of it.

### Step 3 — the token will not decrypt

**Vercel log search:**

```
ENCRYPTION_KEY
```

**Full shape:**

```
[slack] bot token for account <acct> could not be decrypted — no Slack delivery
for this notification. Check ENCRYPTION_KEY: <error>
```

**What it means:** `ENCRYPTION_KEY` changed, or is missing on the environment
that ran this request. The stored token is fine; the key that would open it is
not.

**Fix:** restore the original key. If it is genuinely lost, disconnect and
reconnect the workspace in Admin Settings — that stores a fresh token under the
new key. Admin Settings → Slack also warns about a missing key *before* you
connect, so if that yellow banner is showing, this is your answer.

### Step 4 — Slack accepted the request and refused it

**Your Slack account left the workspace, or is unreachable:**

```
this person is no longer reachable
```

```
Slack says 'user_not_found'
Slack says 'user_disabled'
Slack says 'cannot_dm_bot'
```

The link is deliberately **not** deleted when this happens, because
`user_not_found` also appears during transient Slack problems and unlinking on
one bad response would cost you a reconnect you did not ask for. So the screen
will still say Connected. Disconnect and reconnect from My Account if you
genuinely changed Slack accounts.

**Rate limited:**

```
rate limited by Slack
```

Full shape includes how long Slack asked for and a reminder that the other two
channels already went:

```
[slack] could not open a DM for account <acct> user <id> (slack <U…>): rate
limited by Slack, retry after 30s. Not retried — the in-app and email
notifications were already delivered.
```

Not retried on purpose — this runs inside a request whose real work is already
done. The DM is lost; nothing else is. Unlikely with one test message.

**Anything else Slack said:**

```
Slack says '
```

That prefix catches every remaining Slack-reported error. `missing_scope` is the
one worth knowing: it means the installed token does not carry a permission the
code needs, which happens if the Slack app's scopes were edited after
installation. Reconnecting re-consents and fixes it.

**Slack unreachable, or slower than 5 seconds:**

```
[slack] delivery to
```

which reads `… failed: timed out after 5000ms` or `… failed: <error>`. The 5s
cap is deliberate: you are waiting on this request, and Slack being slow should
cost seconds, not the request.

**Catch-all**, if none of the above match but you are sure the dispatcher ran:

```
[slack]
```

```
[notifications] slack delivery error
```

The second is the outermost net. Seeing it means something reached a place
nothing is supposed to reach — worth reporting rather than working around.

### Step 5 — the bell showed nothing either

Slack is not your problem. Either the event genuinely did not fire, or the
notification system did not resolve you as a recipient. Most likely, in order:

1. **You acted as yourself.** See the top of this document — the actor is always
   excluded.
2. **Your Rep Profile is not set**, so you cannot be resolved as a recipient at
   all.
3. **The mention did not register.** Reopen the note and check the mention is
   still there and rendered as a mention rather than as literal `@text`.
4. Search Vercel for `[notifications]` — the dispatcher logs its own failures
   under that prefix.

### The failure with no log at all

**Yes, there is one — three, in fact**, and they are step 1 above: no Slack
toggle, no link, no workspace. All three return silently by design.

**How to tell them apart from "the message was never triggered":** the in-app
bell. If the notification is in your bell, the dispatcher ran and reached the
Slack step, so a silent skip means one of those three preconditions. If the bell
is empty, nothing was ever dispatched and Slack was never consulted.

There is no log line that distinguishes them, and that is intentional — nearly
every account in the system is permanently in state 3, and logging it would make
the real failures unfindable.

### One more thing that can eat a DM with no error anywhere

`notifyMentionedUsers` and the note-comment wrappers are called **without
`await`** by their routes. This predates the Slack work and is documented in
`TENANT_DB_AUDIT.md` under "Known defects". On a serverless runtime the response
can return, and the function be frozen, before the Slack call finishes.

**Symptom:** the bell notification is reliable, the DM arrives *sometimes*, and
there is no error anywhere because nothing failed — the work was abandoned
mid-flight.

**How to tell:** if a DM is intermittent for the same event with identical
preconditions, this is the likeliest cause, and it is not a Slack problem. Do
not spend time on the Slack app configuration for an intermittent failure.

---

## Things on the Slack side that block a DM even when our code is right

Worth ruling out before assuming the integration is broken.

1. **You are looking in the wrong part of the sidebar.** Bot DMs land under
   **Apps**, not in your normal DM list. Collapse-by-default sidebars hide it
   entirely. Search Slack for the app name.

2. **Workspace app restrictions.** A Slack workspace owner can restrict which
   apps may message members. If your workspace has app approval enabled, the
   install may have succeeded while messaging is still restricted. Slack
   Settings → Manage apps.

3. **Guest and Slack Connect accounts.** Single-channel guests and users who are
   in the workspace only via Slack Connect frequently cannot receive app DMs.
   `user_not_found` is the usual symptom.

4. **Enterprise Grid.** An org-level install and a workspace-level install are
   different things, and a token issued for one may not be able to DM in the
   other. If you are on Grid and the team id in the install does not match the
   workspace you are testing in, our team check will already have refused the
   link — you would have seen `slack_wrong_workspace` when connecting.

5. **The app was edited after installation.** Changing scopes in the Slack app
   configuration does not update an already-issued token. The symptom is
   `missing_scope` in the logs. Reconnect from Admin Settings to re-consent.

6. **You muted the app.** The message is still delivered and will be in the Apps
   section; only the alert is suppressed. Check for an unread badge rather than
   waiting for a notification sound.

The scopes this integration installs are `chat:write`, `chat:write.public`,
`channels:read` and `im:write`. Only `chat:write` and `im:write` are used for
DMs. There are no channel-creation scopes, deliberately.

---

## Part 2 — once one DM works

Do these in order; each builds on the last.

### 2a. A second event

Confirms the toggle is per-event and not a global on switch.

1. My Account → Notification Preferences → turn on **SLACK** for **Follow-up
   Assigned**. Leave Note Mentions on.
2. THEM: **Follow-ups** → open one → set **Assigned Rep** to YOU → save.
3. Expect a second DM: `You've been assigned to a follow-up for <Attendee>` plus
   a link to `/attendees/<id>`.

**Then the negative half, which is the half worth doing:** turn **Note
Mentions** SLACK back off, leaving Follow-up Assigned on. Have THEM mention you
again. You should get the in-app notification and the email and **no DM**. If a
DM arrives, the preference gate is not being consulted and that is a real bug —
capture it.

### 2b. The disabled column, with an unlinked user

Confirms a toggle that cannot deliver is never offered.

1. THEM logs in and goes to My Account.
2. The Slack card should offer **Connect** (the workspace is installed, they are
   not linked).
3. The Notification Preferences SLACK column should be **greyed out and
   unclickable**, with the line above the table reading *"Slack notifications
   need your Slack account linked. Connect it in the Slack section above."*
4. Try to click a greyed Slack toggle. Nothing should happen — no save, no
   toast, no row written.

Then, optionally, have THEM connect and watch for the **"Turn on Slack
notifications?"** panel immediately after they come back from Slack. It should
pre-check the events matching their in-app settings and write **nothing** until
they press *Turn these on*. Pressing *Not now* must leave every Slack toggle
off.

### 2c. A Slack failure does not stop the in-app notification

This is the assertion protecting the notification fixes, so it is worth
confirming against the real thing rather than trusting the test suite.

**Safest method — disconnect your own link:**

1. My Account → Slack card → **Disconnect** (this removes only your link; the
   workspace stays for everyone else).
2. THEM mentions you again.
3. Expect: in-app bell **yes**, email **yes**, DM **no**, and nothing in the
   logs. That is the silent skip working as designed.
4. Reconnect. Your Slack preference rows survive a disconnect, so delivery
   should resume with no further setup.

**Harsher method — a genuine Slack failure.** Uninstall Parlay from inside
Slack (Slack → Settings → Manage apps → the app → Remove), then have THEM
mention you.

1. Expect: in-app bell **yes**, email **yes**, DM **no**.
2. Vercel should show `the installation is gone`.
3. Admin Settings → Slack should now show the red **Disconnected in Slack**
   badge and the banner.
4. Click **Reconnect**, walk the install, and confirm the badge returns to
   green.
5. Have THEM mention you once more — the DM should arrive without you having to
   re-link, because links survive revocation.

Step 5 is the one worth being deliberate about. If it fails, a revocation is
costing every user in the account a reconnect, which is the thing the marked-not-
deleted design exists to prevent.

---

## Quick reference — log strings

| what happened | search Vercel for |
| --- | --- |
| toggle off / no link / no workspace | *nothing — check the bell and the screens* |
| workspace uninstalled in Slack | `the installation is gone` |
| token will not decrypt | `ENCRYPTION_KEY` |
| your Slack user unreachable | `this person is no longer reachable` |
| rate limited | `rate limited by Slack` |
| any other Slack refusal | `Slack says '` |
| Slack unreachable or slow | `[slack] delivery to` |
| anything Slack-related at all | `[slack]` |
| dispatcher problem, not Slack | `[notifications]` |
