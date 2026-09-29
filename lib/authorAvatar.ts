/**
 * The disc a note's author wears: their initials, in a colour derived from
 * their name.
 *
 * Derived rather than stored, because a note carries the rep's NAME and
 * nothing else — there is no avatar to look up. The same name therefore gets
 * the same colour everywhere it appears, which is the only thing making these
 * discs recognisable at a glance.
 *
 * Shared once the feed and the meeting row's notes started drawing the same
 * author: two palettes would have given one person two colours depending on
 * which surface you reached the note from.
 */

const AVATAR_PALETTE = ['#0B3C62', '#2E7D8F', '#B8562F', '#5B4B8A', '#2F7A4F', '#8A6D1F', '#7A2F4F', '#3E5C76'];

export function avatarColour(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/** First and last initial. A single name gives one letter, nothing gives "?". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
