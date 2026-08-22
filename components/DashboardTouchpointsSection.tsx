'use client';

import { useEffect, useState } from 'react';
import { getPreset } from '@/lib/colors';
import { useActiveConference } from '@/components/ActiveConferenceContext';
import { TouchpointQuickModal } from '@/components/DashboardActionCard';
import { useMobileCollapse } from '@/lib/useMobileCollapse';

interface TouchpointOption {
  id: number;
  value: string;
  color: string | null;
  sort_order: number;
}

/**
 * One button per touchpoint type, beside Floor Notes. Picking a type opens the
 * usual Log Touchpoint modal with that type and the conference in the header
 * already chosen, so all that is left is who it was with.
 */
export function DashboardTouchpointsSection() {
  const { activeConference } = useActiveConference();
  const [options, setOptions] = useState<TouchpointOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalTouchpointId, setModalTouchpointId] = useState<number | null>(null);
  const { isMobile, expanded, toggle, showBody } = useMobileCollapse();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/config?category=touchpoints')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: TouchpointOption[]) => {
        if (cancelled) return;
        setOptions((Array.isArray(rows) ? rows : []).sort((a, b) => a.sort_order - b.sort_order));
      })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="card h-full flex flex-col">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!isMobile || expanded}
          className={`flex items-center gap-2 flex-shrink-0 text-left group ${showBody ? 'mb-3' : ''} ${isMobile ? '' : 'cursor-default'}`}
        >
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
          <h2 className="text-base font-semibold text-brand-primary font-serif group-hover:text-brand-secondary transition-colors">Touchpoints</h2>
          {options.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold leading-none">{options.length}</span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 lg:hidden ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showBody && (loading ? (
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-11 rounded-lg bg-gray-100 animate-pulse" />)}
          </div>
        ) : options.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No touchpoint types configured.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {options.map(opt => {
              const preset = getPreset(opt.color);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setModalTouchpointId(opt.id)}
                  title={`Log a ${opt.value} touchpoint`}
                  className="rounded-lg border-2 text-xs font-medium py-2.5 px-2 text-center transition-all hover:shadow-sm"
                  style={{ borderColor: `${preset.hex}55`, backgroundColor: `${preset.hex}12`, color: preset.hex }}
                >
                  {opt.value}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {modalTouchpointId != null && (
        <TouchpointQuickModal
          onClose={() => setModalTouchpointId(null)}
          defaultConferenceId={activeConference?.id ?? null}
          defaultTouchpointId={modalTouchpointId}
        />
      )}
    </>
  );
}
