import { computeConferenceStage, type ConferenceStage } from '@/lib/conference-stage';

/**
 * Which conference the app opens on, when nobody has said.
 *
 * The rule used to be "the soonest one you are an internal attendee of, and
 * failing that the last one you attended". Two things were wrong with it. A
 * rep whose name is not on any conference record got nothing at all — an app
 * with no active conference, on every page, until they picked one by hand.
 * And the fallback reached backwards: somebody who had finished a show and
 * had nothing booked next opened on the one that had just ended rather than
 * on the one everybody is about to fly to.
 *
 * So the attendee list is the first filter rather than the only one. If it
 * finds a conference that is on now or coming up, that is the answer. If it
 * finds neither, the filter comes off and the same question is asked of the
 * whole program, which is the point at which a past conference becomes an
 * answer at all.
 */

export interface ActiveConferenceCandidate {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location?: string | null;
  /** The conference's own internal attendees, as it stores them: names. */
  internal_attendees?: string | null;
  /** Market Coverage: 'national', 'regional', or unset. */
  territory_scope?: string | null;
  post_conference_days?: number | null;
  stage_override?: string | null;
  is_historical?: number | null;
}

/** A historical conference has no lifecycle; everything else is computed. */
export function candidateStage(conf: ActiveConferenceCandidate, nowMs?: number): ConferenceStage {
  if (conf.is_historical) return 'closed';
  return computeConferenceStage(conf, nowMs);
}

/**
 * The names to match a conference's internal attendees against.
 *
 * Both of the user's names, because a tenant may fill either: the display
 * name is what the account carries, the rep name is what the conference
 * records were typed with.
 */
export function attendeeNames(user: { displayName?: string | null; repName?: string | null } | null): string[] {
  if (!user) return [];
  return [user.displayName, user.repName]
    .filter((s): s is string => !!s)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether one of those names is on the conference's internal attendee list. */
export function isInternalAttendee(conf: ActiveConferenceCandidate, names: string[]): boolean {
  if (names.length === 0 || !conf.internal_attendees) return false;
  const attendees = conf.internal_attendees.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return names.some(n => attendees.includes(n));
}

/** Market Coverage is National — the one conference the whole team is at. */
export function isNational(conf: ActiveConferenceCandidate): boolean {
  return (conf.territory_scope ?? '').trim().toLowerCase() === 'national';
}

/**
 * Which of two conferences happening at the same time to open on.
 *
 * National first, because a national show is where the whole team is and a
 * regional one is where some of it is. Then alphabetically, which decides
 * nothing of substance but decides it the same way every time — the same
 * reader opening the app twice should not get two different answers.
 */
export function compareByCoverageThenName(a: ActiveConferenceCandidate, b: ActiveConferenceCandidate): number {
  const national = Number(isNational(b)) - Number(isNational(a));
  if (national !== 0) return national;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
}

/** The same, for the past: what ended last, then the tie-break above. */
export function compareByRecencyThenCoverage(a: ActiveConferenceCandidate, b: ActiveConferenceCandidate): number {
  const ended = b.end_date.localeCompare(a.end_date);
  if (ended !== 0) return ended;
  const started = b.start_date.localeCompare(a.start_date);
  if (started !== 0) return started;
  return compareByCoverageThenName(a, b);
}

const isPast = (stage: ConferenceStage) => stage === 'post_conference' || stage === 'closed';

/**
 * The conference to open on, or null when the program is empty.
 *
 * Two passes of the same question. The first is asked of the conferences the
 * reader is an internal attendee of, and only about now and next — a past
 * conference of theirs is not a reason to ignore the show that starts on
 * Monday. The second is asked of everything, and is where the past is
 * allowed to answer, because by then there is nothing else to open on.
 */
export function pickActiveConference(
  conferences: ActiveConferenceCandidate[],
  names: string[],
  nowMs?: number,
): ActiveConferenceCandidate | null {
  const staged = conferences.map(conf => ({ conf, stage: candidateStage(conf, nowMs) }));
  const best = (
    pool: Array<{ conf: ActiveConferenceCandidate; stage: ConferenceStage }>,
    wanted: (stage: ConferenceStage) => boolean,
    compare: (a: ActiveConferenceCandidate, b: ActiveConferenceCandidate) => number,
  ) => {
    const matching = pool.filter(c => wanted(c.stage)).map(c => c.conf);
    return matching.length > 0 ? matching.sort(compare)[0] : null;
  };

  const mine = staged.filter(c => isInternalAttendee(c.conf, names));
  return (
    best(mine, s => s === 'in_progress', compareByCoverageThenName)
    ?? best(mine, s => s === 'planning', compareByCoverageThenName)
    ?? best(staged, s => s === 'in_progress', compareByCoverageThenName)
    ?? best(staged, s => s === 'planning', compareByCoverageThenName)
    ?? best(staged, isPast, compareByRecencyThenCoverage)
  );
}
