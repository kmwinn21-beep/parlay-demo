/**
 * A conference's logo, or its initials where it hasn't got one.
 *
 * The same square the conference timeline uses, so a conference looks like
 * itself wherever it is listed. Logos are contained rather than cropped: they
 * are wordmarks as often as they are marks, and a cropped wordmark is
 * unreadable.
 */
export function ConferenceAvatar({ name, logoUrl, size = 40, muted = false, className = '' }: {
  name: string;
  logoUrl?: string | null;
  /** Side of the square, in px. */
  size?: number;
  /** For a conference that has been and gone with nothing recorded. */
  muted?: boolean;
  className?: string;
}) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.length === 0 ? '?' : (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();

  return (
    <div
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.3)) }}
      className={`rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center font-bold font-serif ${
        muted ? 'bg-gray-100 text-gray-300' : 'bg-brand-primary text-white'
      } ${className}`}
      aria-hidden="true"
    >
      {logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logoUrl} alt="" className={`w-full h-full object-contain ${muted ? 'opacity-40' : ''}`} />
        : initials}
    </div>
  );
}
