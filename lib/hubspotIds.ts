/**
 * HubSpot record ids, and the links that carry them.
 *
 * The bridge to HubSpot pairs records on id rather than on email, so the id is
 * what Parlay stores. But it arrives two ways: as a bare number in the file
 * Kristian sends, and as a pasted URL when a rep adds somebody by hand off a
 * HubSpot tab. One rule reads both.
 *
 * The id is the truth and the link is for humans — which is why nothing here
 * stores a URL. A link is built from the id when it is needed, so the account
 * changing region or HubSpot changing its URL shape costs one setting rather
 * than a rewrite of every stored value.
 */

/**
 * HubSpot's own object type codes, which appear in the record URL.
 *
 * `0-1` and `0-2` are fixed across every portal — they are HubSpot's internal
 * ids for the contact and company object types, not something an account
 * configures.
 */
export const HUBSPOT_OBJECT = { contact: '0-1', company: '0-2' } as const;
export type HubSpotObject = keyof typeof HUBSPOT_OBJECT;

/**
 * The id out of whatever was given: a bare id, or a record URL.
 *
 * Returns null rather than throwing. A rep pasting the wrong thing is an
 * ordinary mistake, and the caller decides whether that is a validation
 * error or a field left empty.
 *
 * Ids are kept as STRINGS. HubSpot's are 12 digits today, which fits a
 * double, but they are opaque identifiers rather than quantities — nothing
 * here adds them up, and parsing one through a float is how a 16th digit
 * would one day round to a different record.
 */
export function parseHubSpotId(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // A bare id, which is what the file in carries.
  if (/^\d+$/.test(s)) return s;

  /*
   * A record URL. The id is the last path segment:
   *   https://app-eu1.hubspot.com/contacts/27243282/record/0-1/868180624625
   *
   * Matched loosely on purpose — `/record/<type>/<id>` is the part that is
   * stable. The host carries the region, the first number is the portal, and
   * both differ per account; pinning them would reject a valid link from a
   * second portal for no benefit, since the id is what we are after.
   */
  const m = s.match(/\/record\/\d+-\d+\/(\d+)/);
  if (m) return m[1];

  // A trailing id on some other HubSpot URL shape, but only when the string
  // actually looks like a HubSpot link — otherwise any URL ending in digits
  // would be read as a record id.
  if (/hubspot\.com/i.test(s)) {
    const tail = s.match(/\/(\d+)(?:[/?#]|$)/g);
    if (tail && tail.length > 0) {
      const last = tail[tail.length - 1].match(/\d+/);
      if (last) return last[0];
    }
  }
  return null;
}

/** Portal settings, held per account rather than compiled in. */
export interface HubSpotPortal {
  /** The numeric portal id, e.g. `27243282`. */
  portalId: string;
  /**
   * The app subdomain the account is served from, e.g. `app-eu1`.
   *
   * Data residency: an EU portal is on `app-eu1` and a link built with plain
   * `app` will not resolve. Stored rather than assumed for that reason.
   */
  appHost: string;
}

/**
 * A link to the record, or null when the portal is not configured.
 *
 * Null rather than a guessed URL: a link to the wrong portal looks right and
 * lands on somebody else's CRM. Where this returns null the caller shows the
 * id as text, which is still the pairing key and still useful.
 */
export function hubspotRecordUrl(
  portal: HubSpotPortal | null | undefined,
  object: HubSpotObject,
  id: string | null | undefined,
): string | null {
  const clean = parseHubSpotId(id);
  if (!clean || !portal?.portalId || !portal?.appHost) return null;
  return `https://${portal.appHost}.hubspot.com/contacts/${portal.portalId}/record/${HUBSPOT_OBJECT[object]}/${clean}`;
}
