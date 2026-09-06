import { NextRequest, NextResponse } from 'next/server';
import { requireAccountUser } from '@/lib/slack/guards';
import { getUserLink, getWorkspace } from '@/lib/slack/store';
import { isEncryptionConfigured } from '@/lib/encryption';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export interface SlackStatus {
  workspace: {
    teamId: string;
    teamName: string | null;
    installedBy: string | null;
    installedAt: string | null;
  } | null;
  /** The caller's own link. Never anybody else's — see below. */
  link: { slackUserId: string } | null;
  /**
   * Whether ENCRYPTION_KEY is present and well formed.
   *
   * Reported rather than discovered: with no key, an install fails at the very
   * last step with a generic error, after the administrator has already been to
   * Slack and back. It is the one failure nobody can diagnose from the outside,
   * and the settings screen is the first place they will look.
   */
  encryptionConfigured: boolean;
}

/**
 * GET /api/slack/status — what the settings screens render.
 *
 * One endpoint for both, because both want the same workspace facts and the
 * difference between them is which controls they offer, not which data they see.
 * Any authenticated member may read it: knowing that your own account has Slack
 * installed is not privileged, and it is what decides whether /auth/account
 * offers a connect button or an explanation.
 *
 * `link` is always the CALLER's, resolved from the session. There is no user
 * parameter, so there is nothing to substitute in order to read somebody else's.
 *
 * No token, encrypted or otherwise, is in this response. `SlackWorkspace` does
 * not carry one — see lib/slack/store.ts.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAccountUser(request);
  if ('refusal' in auth) {
    return auth.refusal === 'unauthenticated'
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.json({ error: 'No account' }, { status: 403 });
  }

  const [workspace, link] = await Promise.all([
    getWorkspace(auth.user.accountId),
    getUserLink(auth.user.accountId, auth.user.id),
  ]);

  let installedBy: string | null = null;
  if (workspace?.installedByUserId != null) {
    try {
      // users lives in the TENANT database, and users.id is an AUTOINCREMENT
      // there — id 42 is a different person in every account. The account comes
      // from the session, so this can only ever name someone in the caller's own
      // account. See TENANT_DB_AUDIT.md.
      const tenant = await getDb(auth.user.accountId);
      const row = await tenant.execute({
        sql: 'SELECT COALESCE(display_name, email) AS name FROM users WHERE id = ?',
        args: [workspace.installedByUserId],
      });
      if (row.rows[0]) installedBy = String(row.rows[0].name);
    } catch (err) {
      // A name is decoration. Failing to resolve it must not make the screen
      // report Slack as disconnected.
      console.error('[slack] could not resolve installer name:', err);
    }
  }

  const status: SlackStatus = {
    workspace: workspace
      ? {
          teamId: workspace.teamId,
          teamName: workspace.teamName,
          installedBy,
          installedAt: workspace.installedAt,
        }
      : null,
    link: link ? { slackUserId: link.slackUserId } : null,
    encryptionConfigured: isEncryptionConfigured(),
  };

  return NextResponse.json(status);
}
