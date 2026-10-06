/**
 * How many companies a conference's Companies tab will show.
 *
 * The tab's list is fetched only when somebody opens it — or opens Social,
 * Notes, the add form, or groups the attendees. A count that waited for that
 * would be missing at exactly the moment it is useful, which is while deciding
 * whether to go there at all.
 *
 * So the count is derived from the attendees, who are already loaded: the tab
 * lists the companies that have somebody at this conference, which is the
 * distinct company_id among them. Once the real list has been fetched that is
 * used instead, because it is the thing on screen — the two differ only when a
 * company_id points at a company the list does not return, and in that case
 * the honest number is the shorter one.
 */

export interface CountableAttendee {
  company_id?: number | string | null;
}

export function conferenceCompanyCount(
  attendees: readonly CountableAttendee[] | null | undefined,
  loaded: readonly unknown[] | null | undefined,
): number {
  if (loaded) return loaded.length;
  if (!attendees) return 0;
  const ids = new Set<string>();
  for (const a of attendees) {
    // Falsy ids are "no company": the attendee is at the conference on their
    // own, and counting them would invent a company per unattached person.
    if (a?.company_id) ids.add(String(a.company_id));
  }
  return ids.size;
}
