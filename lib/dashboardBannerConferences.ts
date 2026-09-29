import type { ConferenceStage } from '@/lib/conference-stage';

/**
 * What the dashboard banner shows, and in what order.
 *
 * The banner used to name the ONE conference a rep was going to next. It now
 * leads with whatever is actually happening, and falls back down a chain when
 * nothing is: a conference under way, then one still inside its
 * post-conference window, then the next one planned. Each rung is a weaker
 * claim on the reader's attention than the one above it, and the banner never
 * shows two rungs at once — a row mixing "happening now" with "in 40 days"
 * reads as a list rather than as a headline.
 */

export type BannerHeadlineKind = ConferenceStage | 'none';

export interface BannerConference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  stage: ConferenceStage | null;
}

export interface BannerHeadline<T extends BannerConference> {
  kind: BannerHeadlineKind;
  items: T[];
}

/** Soonest first. Two conferences on one day are ordered by name, not by id. */
function byStart<T extends BannerConference>(a: T, b: T): number {
  return a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name);
}

/**
 * The conferences the banner leads with, and which rung they came from.
 *
 * `none` when the chain runs out, which is a real state rather than an error:
 * an account between shows has nothing under way and nothing booked.
 */
export function bannerHeadline<T extends BannerConference>(conferences: T[]): BannerHeadline<T> {
  for (const stage of ['in_progress', 'post_conference', 'planning'] as const) {
    const items = conferences.filter(c => c.stage === stage).sort(byStart);
    if (items.length > 0) return { kind: stage, items };
  }
  return { kind: 'none', items: [] };
}

/**
 * The three bands of the expanded half, in the order they are read.
 *
 * The same split AND the same order as the Program tab, because these are that
 * tab's own cards: a conference is Active from the moment it starts until its
 * post-conference window closes, Upcoming while it is still being planned, and
 * Past once it is closed.
 *
 * Active and Past run most recent first, which is the order the conferences
 * endpoint returns and the order that page leaves them in. Upcoming is turned
 * around to soonest first — the next thing to prepare for leads, rather than
 * the one furthest away.
 */
export function bannerBands<T extends BannerConference>(conferences: T[]): { label: string; items: T[] }[] {
  const band = (label: string, stages: ConferenceStage[], newestFirst: boolean) => ({
    label,
    items: conferences
      .filter(c => c.stage != null && stages.includes(c.stage))
      .sort(newestFirst ? (a, b) => byStart(b, a) : byStart),
  });
  return [
    band('Active', ['in_progress', 'post_conference'], true),
    band('Upcoming', ['planning'], false),
    band('Past', ['closed'], true),
  ].filter(b => b.items.length > 0);
}
