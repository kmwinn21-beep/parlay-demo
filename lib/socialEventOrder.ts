/**
 * The order social events are listed in.
 *
 * Ours first, then everyone else's, each run in time order. A conference week
 * is read as a diary — what is on, and when — but the events the company is
 * hosting are the ones it has people and money committed to, and they were
 * previously scattered through the list wherever their date happened to put
 * them.
 *
 * Here rather than in the SQL because the list changes without being fetched
 * again: adding an event, or ticking Company Hosted on one, re-sorts the cards
 * on the click. A query's ORDER BY only holds until the first edit.
 */

export interface OrderableSocialEvent {
  /** 1/true for an event the company hosts or sponsors. */
  company_hosted?: boolean | number | null;
  /** 'YYYY-MM-DD'. */
  event_date?: string | null;
  /** 'HH:MM', 24-hour, as an <input type="time"> writes it. */
  event_time?: string | null;
}

/**
 * A date or time that sorts after every real one.
 *
 * An event with no date is not an event at the start of the week; it is an
 * event nobody has scheduled yet, and it belongs at the end of its own group.
 * The same for a date with no time: a 7pm dinner is more fixed than "that
 * Thursday", so the fixed one leads the day.
 */
const LAST = '~';

/** 'YYYY-MM-DDTHH:MM', comparable as a string, or '~' where unset. */
function when(event: OrderableSocialEvent): string {
  const date = event.event_date?.trim();
  if (!date) return LAST;
  const time = event.event_time?.trim();
  if (!time) return `${date}T${LAST}`;
  // Zero-pad the hour: rows written before <input type="time"> can carry
  // '8:00', which compares after '19:00' unless it is padded to '08:00'.
  const [h, ...rest] = time.split(':');
  return `${date}T${h.padStart(2, '0')}:${rest.join(':') || '00'}`;
}

/** Company-hosted events lead. Within each group, earliest first. */
export function sortSocialEvents<T extends OrderableSocialEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const hosted = Number(Boolean(b.company_hosted)) - Number(Boolean(a.company_hosted));
    if (hosted !== 0) return hosted;
    const at = when(a);
    const bt = when(b);
    // Equal times keep the order they arrived in — Array.sort is stable, so
    // two events at the same hour do not swap places on every render.
    return at < bt ? -1 : at > bt ? 1 : 0;
  });
}
