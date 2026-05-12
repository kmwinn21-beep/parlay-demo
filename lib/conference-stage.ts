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
  const endMs = new Date(conference.end_date).getTime();
  const windowDays = conference.post_conference_days ?? 10;
  const closeMs = endMs + windowDays * 86_400_000;

  if (now < startMs) return 'planning';
  if (now <= endMs) return 'in_progress';
  if (now <= closeMs) return 'post_conference';
  return 'closed';
}

export function daysUntilClose(conference: PostConferenceWindowInput, nowMs?: number): number {
  const now = nowMs ?? Date.now();
  const endMs = new Date(conference.end_date).getTime();
  const windowDays = conference.post_conference_days ?? 10;
  const closeMs = endMs + windowDays * 86_400_000;
  return Math.max(0, Math.ceil((closeMs - now) / 86_400_000));
}

export function postConferenceDaysRemaining(conference: PostConferenceWindowInput, nowMs?: number): number {
  const now = nowMs ?? Date.now();
  const endMs = new Date(conference.end_date).getTime();
  const windowDays = conference.post_conference_days ?? 10;
  const closeMs = endMs + windowDays * 86_400_000;
  return Math.max(0, Math.ceil((closeMs - now) / 86_400_000));
}
