/**
 * The `state` parameter carried through Slack's OAuth redirect.
 *
 * ── What this is defending against ───────────────────────────────────────────
 *
 * The Google and Microsoft flows deleted from this repo put the caller's
 * identity in the state as plain text — `${user.id}:${user.accountId}` — and
 * their callbacks were unauthenticated. Anyone could complete an OAuth flow with
 * their own account, post the callback with somebody else's ids, and have the
 * result written into that person's row in that tenant's database.
 * See TENANT_DB_AUDIT.md, "A second rule, from a second class of bug".
 *
 * So the state here is signed, short-lived, and — this is the part that matters
 * most — is never the source of the account the install lands in. The callback
 * derives that from the session. The state's job is only to prove that the
 * person finishing the flow is the person who started it.
 *
 * ── How it is signed ─────────────────────────────────────────────────────────
 *
 * A JWT via `jose`, HS256, using JWT_SECRET — the same library and secret the
 * session cookie uses, because a second hand-rolled HMAC is a second thing to
 * get wrong, and this one already has constant-time verification and expiry
 * handling that has been in production.
 *
 * Reusing the secret across two token types would let one be replayed as the
 * other, so these carry `aud: 'slack-oauth-state'`, which verification
 * requires. A session cookie presented as a state fails, and a state presented
 * as a session cookie fails, because neither audience matches the other's check.
 *
 * Ten minutes. Long enough to read Slack's consent screen and pick a workspace,
 * short enough that a state captured from a browser history or a referrer log is
 * almost always already dead.
 */

import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

const AUDIENCE = 'slack-oauth-state';
const EXPIRY = '10m';

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? 'dev-secret-CHANGE-IN-PRODUCTION-minimum-32-chars!!',
  );
}

export interface SlackOAuthState {
  /** The account the flow was started from. Checked against the session, never trusted as the target. */
  accountId: string;
  /** The user who started it. The session user at the callback must be this person. */
  userId: number;
}

/** Sign a state for the authorize redirect. */
export async function signSlackState(state: SlackOAuthState): Promise<string> {
  return new SignJWT({ accountId: state.accountId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(state.userId))
    .setAudience(AUDIENCE)
    // A nonce, so two installs started in the same second are distinct values
    // and a state is identifiable in a log without being guessable.
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret());
}

/**
 * Verify a state from the callback.
 *
 * Returns null for anything that is not a state this server signed and is still
 * within its window: a forged or unsigned value, one signed with another secret,
 * one whose audience is not ours, and one that has expired. Callers treat null
 * as "reject the callback" rather than as a reason to look the user up another
 * way.
 */
export async function verifySlackState(value: string | null): Promise<SlackOAuthState | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, secret(), { audience: AUDIENCE });
    const userId = Number(payload.sub);
    const accountId = payload.accountId;
    if (!Number.isInteger(userId) || userId <= 0) return null;
    if (typeof accountId !== 'string' || accountId === '') return null;
    return { accountId, userId };
  } catch {
    // Bad signature, wrong audience, expired, malformed — all the same answer.
    return null;
  }
}
