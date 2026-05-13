import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const tenantDb = await getDb(authResult?.accountId);

  try {
    const [trackRow, progressRow, firstNameRow] = await Promise.all([
      tenantDb.execute({ sql: `SELECT value FROM site_settings WHERE key = 'onboarding_track'`, args: [] }),
      tenantDb.execute({ sql: `SELECT value FROM site_settings WHERE key = 'onboarding_progress'`, args: [] }),
      tenantDb.execute({ sql: `SELECT first_name FROM users WHERE id = ?`, args: [authResult.id] }),
    ]);

    const onboardingTrack = trackRow.rows[0] ? String(trackRow.rows[0].value) : null;
    const rawProgress = progressRow.rows[0] ? String(progressRow.rows[0].value) : null;
    let onboardingProgress = null;
    if (rawProgress && rawProgress !== 'null') {
      try { onboardingProgress = JSON.parse(rawProgress); } catch { /* ignore */ }
    }
    const firstName = firstNameRow.rows[0]?.first_name ? String(firstNameRow.rows[0].first_name) : '';

    return NextResponse.json({ onboarding_track: onboardingTrack, onboarding_progress: onboardingProgress, first_name: firstName });
  } catch (err) {
    console.error('GET /api/onboarding/progress error:', err);
    return NextResponse.json({ error: 'Failed to fetch onboarding progress' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const tenantDb = await getDb(authResult?.accountId);

  try {
    const body = await request.json() as {
      onboarding_track?: string;
      onboarding_progress?: Record<string, unknown> | null;
    };

    const ops: Promise<unknown>[] = [];

    if (body.onboarding_track !== undefined) {
      ops.push(tenantDb.execute({
        sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('onboarding_track', ?)`,
        args: [body.onboarding_track],
      }));
      // Also update the master accounts table if we have an accountId
      if (authResult.accountId) {
        await dbReady;
        ops.push(db.execute({
          sql: `UPDATE accounts SET onboarding_track = ? WHERE id = ?`,
          args: [body.onboarding_track, authResult.accountId],
        }).catch(() => {}));
      }
    }

    if (body.onboarding_progress !== undefined) {
      const progressStr = body.onboarding_progress === null ? 'null' : JSON.stringify(body.onboarding_progress);
      ops.push(tenantDb.execute({
        sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('onboarding_progress', ?)`,
        args: [progressStr],
      }));
      // Sync completed_at to accounts.onboarding_completed
      if (authResult.accountId && body.onboarding_progress?.completed_at) {
        await dbReady;
        ops.push(db.execute({
          sql: `UPDATE accounts SET onboarding_completed = 1 WHERE id = ?`,
          args: [authResult.accountId],
        }).catch(() => {}));
      }
    }

    await Promise.all(ops);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/onboarding/progress error:', err);
    return NextResponse.json({ error: 'Failed to update onboarding progress' }, { status: 500 });
  }
}
