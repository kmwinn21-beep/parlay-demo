import { db } from '@/lib/db';

export async function isHistoricalConference(conferenceId: number): Promise<boolean> {
  if (!Number.isFinite(conferenceId)) return false;
  const res = await db.execute({ sql: 'SELECT is_historical FROM conferences WHERE id = ? LIMIT 1', args: [conferenceId] });
  return Number(res.rows[0]?.is_historical ?? 0) === 1;
}

export const HISTORICAL_ACTIVITY_DISABLED_MESSAGE = 'Activity logging is disabled for Historical Conferences.';
