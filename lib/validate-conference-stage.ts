import { NextRequest, NextResponse } from 'next/server';
import type { Client } from '@libsql/client';
import { getDb } from '@/lib/getDb';
import { getSessionUser } from '@/lib/auth';
import { computeConferenceStage } from '@/lib/conference-stage';
import { getConferencePermissions } from '@/lib/conference-permissions';
import type { ConferencePermissions } from '@/lib/conference-permissions';

type PermissionKey = keyof ConferencePermissions;

interface ConferenceRow {
  start_date: string;
  end_date: string;
  post_conference_days: number | null;
  stage_override: string | null;
  is_historical: number;
}

async function fetchConferenceRow(db: Client, conferenceId: number): Promise<ConferenceRow | null> {
  const result = await db.execute({
    sql: `SELECT start_date, end_date, post_conference_days, stage_override, is_historical
          FROM conferences WHERE id = ?`,
    args: [conferenceId],
  });
  if (!result.rows[0]) return null;
  const r = result.rows[0];
  return {
    start_date: String(r.start_date),
    end_date: String(r.end_date),
    post_conference_days: r.post_conference_days != null ? Number(r.post_conference_days) : null,
    stage_override: r.stage_override != null ? String(r.stage_override) : null,
    is_historical: Number(r.is_historical ?? 0),
  };
}

export async function validateConferenceStage(
  request: NextRequest,
  conferenceId: number,
  permissionKey: PermissionKey,
): Promise<NextResponse | null> {
  // conferences.id is only unique within a tenant DB — this must resolve the
  // requesting user's own tenant DB rather than the master DB, otherwise a
  // colliding conference ID in another tenant (or the master DB) could be
  // read instead of the actual conference this request is about.
  const user = await getSessionUser(request);
  const db = await getDb(user?.accountId);
  const conf = await fetchConferenceRow(db, conferenceId);
  if (!conf) return null; // let the route handler return 404

  // Historical conferences have no stage restrictions
  if (conf.is_historical) return null;

  let stage: ReturnType<typeof computeConferenceStage>;
  try {
    stage = computeConferenceStage(conf);
  } catch {
    return null;
  }

  const isAdmin = user?.role === 'administrator';
  const permissions = getConferencePermissions(stage, isAdmin);

  if (!permissions[permissionKey]) {
    return NextResponse.json(
      { error: `This action is not allowed for conferences in the "${stage.replace(/_/g, ' ')}" stage.` },
      { status: 403 },
    );
  }

  return null;
}
