/**
 * Contact details read off a business card or badge, and what to do with them.
 *
 * A scan is OCR over a photograph taken on a conference floor, which is to say
 * it is usually right and occasionally nonsense. Two rules follow from that,
 * and they are the whole of this module:
 *
 *   Never overwrite.  A field somebody recorded beats a field a camera read.
 *                     Filling a blank is adding information; replacing a value
 *                     is destroying it, and the scan is the less trustworthy of
 *                     the two sources.
 *   Never fill with junk. "WWW.ACME.COM" is not an email and "Booth 412" is
 *                     not a phone number, and both turn up on cards. A blank
 *                     field is better than a wrong one, because a wrong one
 *                     gets dialled.
 */

/** Trimmed, or null when there is nothing there. */
function clean(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * An email address, or null if what was read is not one.
 *
 * Deliberately loose — this is a sanity check, not validation. It rejects the
 * things OCR actually produces on a business card: the company's website, a
 * bare handle, a line that lost its @ to a fold in the card.
 */
export function cleanScannedEmail(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  // No spaces: a card that read "john smith acme.com" is a name and a domain,
  // not an address.
  if (/\s/.test(raw)) return null;
  const at = raw.indexOf('@');
  // Exactly one @, with something either side, and a dot in the domain.
  if (at <= 0 || at !== raw.lastIndexOf('@')) return null;
  const domain = raw.slice(at + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return null;
  return raw.toLowerCase();
}

/**
 * A phone number, or null if what was read is not one.
 *
 * Kept as written rather than reformatted. The card said "+44 20 7946 0958"
 * or "(555) 123-4567 x24" and that is what somebody will read back; imposing a
 * format here would mangle the extension and every number outside the US.
 * Only the digit count is checked.
 */
export function cleanScannedPhone(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  // Seven is the shortest real subscriber number; fifteen is E.164's ceiling,
  // and anything longer is two numbers run together or a booth number that
  // picked up a date. Both ends are guesses, but a wrong number is worse than
  // an empty field because a wrong number gets dialled.
  if (digits.length < 7 || digits.length > 15) return null;
  return raw;
}

export interface ContactFill {
  /** The value to write, or null to leave the column alone. */
  email: string | null;
  phone: string | null;
  /** Which fields this would fill, for telling the person what happened. */
  filled: Array<'email' | 'phone'>;
}

/**
 * What a scan should add to an attendee who already exists.
 *
 * Only blanks are filled. An attendee whose email is already recorded keeps
 * it, even when the card says something different — the difference is usually
 * a personal address against a work one, or a job change, and neither is
 * something a scan should decide silently.
 */
export function contactFillFor(
  existing: { email?: unknown; phone?: unknown },
  scanned: { email?: unknown; phone?: unknown },
): ContactFill {
  const filled: Array<'email' | 'phone'> = [];

  const hasEmail = clean(existing.email) !== null;
  const hasPhone = clean(existing.phone) !== null;

  const email = hasEmail ? null : cleanScannedEmail(scanned.email);
  const phone = hasPhone ? null : cleanScannedPhone(scanned.phone);

  if (email) filled.push('email');
  if (phone) filled.push('phone');

  return { email, phone, filled };
}
