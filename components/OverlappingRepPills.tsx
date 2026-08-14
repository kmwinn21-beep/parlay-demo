'use client';

import { getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { parseRepIds, getRepInitials, type UserOption } from '@/lib/useUserOptions';

/**
 * Internal people on a record as a stack of circular initial pills, each
 * overlapping the one before it. Used where several reps share a row and a
 * wrapping list of pills would cost too much width.
 */
export function OverlappingRepPills({
  repIds, userOptions, size = 'sm', max = 4, emptyLabel = '—',
}: {
  /** Comma-separated config_options ids, as stored on scheduled_by. */
  repIds: string | null | undefined;
  userOptions: UserOption[];
  size?: 'sm' | 'xs';
  /** Extra people collapse into a +N pill. */
  max?: number;
  emptyLabel?: string | null;
}) {
  const colorMaps = useConfigColors();
  const names = parseRepIds(repIds)
    .map(id => userOptions.find(u => u.id === id)?.value)
    .filter((v): v is string => !!v);

  if (names.length === 0) {
    return emptyLabel ? <span className="text-gray-300">{emptyLabel}</span> : null;
  }

  const dim = size === 'xs' ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]';
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;

  return (
    <span className="inline-flex items-center">
      {shown.map((name, i) => (
        <span
          key={`${name}-${i}`}
          title={name}
          style={{ zIndex: shown.length - i }}
          className={`${dim} ${i > 0 ? '-ml-1.5' : ''} relative inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white flex-shrink-0 ${getPreset(colorMaps.user?.[name]).badgeClass}`}
        >
          {getRepInitials(name)}
        </span>
      ))}
      {extra > 0 && (
        <span
          title={names.slice(max).join(', ')}
          className={`${dim} -ml-1.5 relative inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white bg-gray-100 text-gray-500 flex-shrink-0`}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
