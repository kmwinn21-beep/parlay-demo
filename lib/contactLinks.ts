/**
 * Reaching an attendee from the meeting card.
 *
 * A rep standing in a conference hall wants to ring the person they are about
 * to meet, not read their number off a record two screens away. The card
 * carries a phone badge and an envelope, and these build what they point at.
 *
 * The schemes matter. `tel:` dials and `sms:` composes on both iOS and
 * Android; `callto:` is the old Skype one and does nothing on a phone.
 */

/** A phone number as a dialler will take it. Null when there is nothing to dial. */
export function telHref(phone: string | null | undefined): string | null {
  const dialable = normalizePhone(phone);
  return dialable ? `tel:${dialable}` : null;
}

/** The same number, composing a text instead. */
export function smsHref(phone: string | null | undefined): string | null {
  const dialable = normalizePhone(phone);
  return dialable ? `sms:${dialable}` : null;
}

/** A mail client, composing to this address. Null when there is none. */
export function mailtoHref(email: string | null | undefined): string | null {
  const trimmed = (email ?? '').trim();
  // Not validation — the address came from a CRM field somebody typed, and
  // refusing to link an odd-looking one helps nobody. Only the shape that
  // cannot possibly work is rejected.
  if (!trimmed || !trimmed.includes('@')) return null;
  return `mailto:${encodeURIComponent(trimmed).replace(/%40/g, '@')}`;
}

/**
 * The digits a dialler needs, or null.
 *
 * Numbers arrive as somebody typed them — "(512) 555-0143", "512.555.0143",
 * "+1 512 555 0143" — and a `tel:` with spaces and brackets in it is not
 * reliably handled. The leading + is kept because it is what makes an
 * international number dial from abroad; everything else that is not a digit
 * goes, except the extension separator, which diallers do understand.
 *
 * An entry with no digits at all — "n/a", "ask Kevin" — is not a number, and
 * returns null so no badge is drawn.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  const raw = (phone ?? '').trim();
  if (!raw) return null;
  const plus = raw.startsWith('+') ? '+' : '';
  // ';ext=' is the RFC 3966 separator and survives; 'x' and 'ext' become it.
  const [main, ...extParts] = raw.split(/\s*(?:;?\s*ext\.?|x)\s*/i);
  const digits = main.replace(/\D/g, '');
  if (!digits) return null;
  const ext = extParts.join('').replace(/\D/g, '');
  return `${plus}${digits}${ext ? `;ext=${ext}` : ''}`;
}

/** Is there anything at all to reach this person with? */
export function hasContactDetails(person: { phone?: string | null; email?: string | null }): boolean {
  return telHref(person.phone) !== null || mailtoHref(person.email) !== null;
}
