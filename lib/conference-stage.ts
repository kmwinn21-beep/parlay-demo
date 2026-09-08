export type ConferenceStage = 'planning' | 'in_progress' | 'post_conference' | 'closed';

export interface ConferenceStageInput {
  start_date: string;
  end_date: string;
  post_conference_days?: number | null;
  stage_override?: string | null;
  is_historical?: number | null;
}

export interface PostConferenceWindowInput {
  end_date: string;
  post_conference_days?: number | null;
}

export function computeConferenceStage(conference: ConferenceStageInput, nowMs?: number): ConferenceStage {
  if (conference.is_historical) {
    throw new Error('Historical conferences do not have a lifecycle stage.');
  }

  if (
    conference.stage_override &&
    ['planning', 'in_progress', 'post_conference', 'closed'].includes(conference.stage_override)
  ) {
    return conference.stage_override as ConferenceStage;
  }

  const now = nowMs ?? Date.now();
  const startMs = new Date(conference.start_date).getTime();
  const endMs = endOfDayMs(conference.end_date);
  const windowDays = conference.post_conference_days ?? 10;
  const closeMs = endMs + windowDays * 86_400_000;

  if (now < startMs) return 'planning';
  if (now <= endMs) return 'in_progress';
  if (now <= closeMs) return 'post_conference';
  return 'closed';
}

/**
 * The last instant of a date, not its first.
 *
 * `new Date('2026-09-11')` is midnight UTC at the START of the 11th, so
 * comparing `now <= endMs` against it ended a conference at 00:00 on its final
 * day: a three-day show was in progress for two. The activity feed made this
 * visible — the last day of a conference showed nothing under In Progress —
 * but it was never feed-specific. `validate-conference-stage` gates writes on
 * the same function, so an action allowed only during a conference was refused
 * on its closing day.
 *
 * Dates here are stored as plain `YYYY-MM-DD` with no zone and compared in UTC,
 * which is unchanged; this only moves the boundary from the start of the end
 * date to the end of it.
 */
function endOfDayMs(date: string): number {
  const startOfDay = new Date(date).getTime();
  if (Number.isNaN(startOfDay)) return startOfDay;
  return startOfDay + 86_400_000 - 1;
}

export function daysUntilClose(conference: PostConferenceWindowInput, nowMs?: number): number {
  const now = nowMs ?? Date.now();
  const endMs = endOfDayMs(conference.end_date);
  const windowDays = conference.post_conference_days ?? 10;
  const closeMs = endMs + windowDays * 86_400_000;
  return Math.max(0, Math.ceil((closeMs - now) / 86_400_000));
}

export function postConferenceDaysRemaining(conference: PostConferenceWindowInput, nowMs?: number): number {
  const now = nowMs ?? Date.now();
  const endMs = endOfDayMs(conference.end_date);
  const windowDays = conference.post_conference_days ?? 10;
  const closeMs = endMs + windowDays * 86_400_000;
  return Math.max(0, Math.ceil((closeMs - now) / 86_400_000));
}
