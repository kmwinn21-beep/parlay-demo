'use client';

import { useState, useRef } from 'react';
import { useConfigColors } from '@/lib/useConfigColors';
import { useUserOptions, parseRepIds } from '@/lib/useUserOptions';
import { getBadgeClass } from '@/lib/colors';
import type { CustomColumnDef } from '@/lib/useTableColumnConfig';

function IconTooltipCell({ value, iconColor }: { value: string; iconColor: string }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  const show = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const w = Math.min(220, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
    const above = rect.top > 180;
    setPos({ top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above });
    setVisible(true);
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(v => !v)}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-gray-100 transition-colors"
        title={value}
      >
        <svg className="w-4 h-4" style={{ color: iconColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {visible && pos && (
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}
        >
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2 break-words">
            {value}
          </div>
        </div>
      )}
    </>
  );
}

function UserIconPillCell({ value, nameFormat }: { value: string; nameFormat: 'full' | 'initials' | 'first_last_initial' }) {
  const userOptions = useUserOptions();
  const ids = parseRepIds(value);
  const names = ids.length > 0
    ? ids.map(id => userOptions.find(u => u.id === id)?.value ?? '').filter(Boolean)
    : value ? [value] : [];

  if (names.length === 0) return <span className="text-gray-400 text-xs">—</span>;

  const formatName = (name: string): string => {
    if (nameFormat === 'full') return name;
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return name;
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (nameFormat === 'initials') return `${first[0].toUpperCase()}${last[0].toUpperCase()}`;
    return `${first[0].toUpperCase()}. ${last}`;
  };

  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {formatName(name)}
        </span>
      ))}
    </div>
  );
}

export function CustomColumnCell({ column, value }: { column: CustomColumnDef; value: unknown }) {
  const colorMaps = useConfigColors();

  const strVal = value == null ? '' : String(value);
  if (!strVal) return <span className="text-gray-400 text-xs">—</span>;

  const cfg = column.display_config ?? {};

  if (column.display_type === 'pill_value') {
    const parts = strVal.split(',').map(v => v.trim()).filter(Boolean);
    if (parts.length === 0) return <span className="text-gray-400 text-xs">—</span>;
    const catMap = column.config_category ? (colorMaps[column.config_category] ?? {}) : {};
    return (
      <div className="flex flex-wrap gap-1">
        {parts.map((part, i) => (
          <span key={i} className={`${getBadgeClass(part, catMap)} text-xs`}>
            {part}
          </span>
        ))}
      </div>
    );
  }

  if (column.display_type === 'text_value') {
    const prefix = cfg.prefix ?? '';
    return <span className="text-sm text-gray-700 break-words">{prefix}{strVal}</span>;
  }

  if (column.display_type === 'icon_tooltip') {
    return <IconTooltipCell value={strVal} iconColor={cfg.icon_color ?? '#6b7280'} />;
  }

  if (column.display_type === 'user_icon_pill') {
    return <UserIconPillCell value={strVal} nameFormat={cfg.name_format ?? 'full'} />;
  }

  return <span className="text-sm text-gray-700">{strVal}</span>;
}
