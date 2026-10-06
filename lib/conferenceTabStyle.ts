/**
 * A colour and a glyph per conference tab.
 *
 * One table, read by both of the places a tab is drawn as a shape rather than
 * a word: the tile strip under the conference card, and the chip row pinned at
 * the top of the drawer. They are the same tabs seen twice, so a tab that is
 * rose in one and amber in the other would undo the only thing the colour is
 * there to do.
 *
 * Written out in full rather than built from the key, because Tailwind reads
 * class names out of the source: a template string would generate nothing and
 * every tab would come out unstyled.
 *
 * `tint` is the shape's background, `icon` the glyph and any label on it,
 * `badge` the count's bubble, `ring` the outline the open tab wears.
 */

export interface ConferenceTabStyle {
  tint: string;
  icon: string;
  badge: string;
  ring: string;
  path: string;
}

export const CONFERENCE_TAB_STYLE: Record<string, ConferenceTabStyle> = {
  targets: {
    tint: 'bg-rose-100', icon: 'text-rose-600', badge: 'bg-rose-500', ring: 'ring-rose-400',
    path: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z',
  },
  attendees: {
    tint: 'bg-sky-100', icon: 'text-sky-600', badge: 'bg-sky-500', ring: 'ring-sky-400',
    path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  companies: {
    tint: 'bg-indigo-100', icon: 'text-indigo-600', badge: 'bg-indigo-500', ring: 'ring-indigo-400',
    path: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  meetings: {
    tint: 'bg-violet-100', icon: 'text-violet-600', badge: 'bg-violet-500', ring: 'ring-violet-400',
    path: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  'follow-ups': {
    tint: 'bg-amber-100', icon: 'text-amber-600', badge: 'bg-amber-500', ring: 'ring-amber-400',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  outreach: {
    tint: 'bg-teal-100', icon: 'text-teal-600', badge: 'bg-teal-500', ring: 'ring-teal-400',
    path: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
  },
  social: {
    tint: 'bg-pink-100', icon: 'text-pink-600', badge: 'bg-pink-500', ring: 'ring-pink-400',
    path: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  },
  analytics: {
    tint: 'bg-emerald-100', icon: 'text-emerald-600', badge: 'bg-emerald-500', ring: 'ring-emerald-400',
    path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  notes: {
    tint: 'bg-yellow-100', icon: 'text-yellow-600', badge: 'bg-yellow-500', ring: 'ring-yellow-400',
    path: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  },
  forms: {
    tint: 'bg-slate-200', icon: 'text-slate-600', badge: 'bg-slate-500', ring: 'ring-slate-400',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  agenda: {
    tint: 'bg-blue-100', icon: 'text-blue-600', badge: 'bg-blue-500', ring: 'ring-blue-400',
    path: 'M4 6h16M4 12h16M4 18h7',
  },
};

/** Anything an account has added that this does not know about. */
export const CONFERENCE_TAB_FALLBACK: ConferenceTabStyle = {
  tint: 'bg-gray-100', icon: 'text-gray-500', badge: 'bg-gray-400', ring: 'ring-gray-400',
  path: 'M4 6h16M4 12h16M4 18h16',
};

export function conferenceTabStyle(key: string): ConferenceTabStyle {
  return CONFERENCE_TAB_STYLE[key] ?? CONFERENCE_TAB_FALLBACK;
}
