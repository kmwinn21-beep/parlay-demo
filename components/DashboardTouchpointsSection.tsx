'use client';

import { useEffect, useState } from 'react';
import { getPreset } from '@/lib/colors';
import { useActiveConference } from '@/components/ActiveConferenceContext';
import { TouchpointForm, TouchpointQuickModal } from '@/components/DashboardActionCard';
import { useMobileCollapse } from '@/lib/useMobileCollapse';
import { useIsDesktop } from '@/lib/useIsDesktop';

interface TouchpointOption {
  id: number;
  value: string;
  color: string | null;
  sort_order: number;
}

/**
 * Beside Floor Notes. Desktop gets the whole Log Touchpoint form inline —
 * there's room for it, and it saves a modal. A phone gets one button per
 * touchpoint type instead, which opens that same form in the modal with the
 * type and conference already chosen.
 */
export function DashboardTouchpointsSection() {
  const { activeConference } = useActiveConference();
  const [options, setOptions] = useState<TouchpointOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalTouchpointId, setModalTouchpointId] = useState<number | null>(null);
  const { isMobile, expanded, toggle, showBody } = useMobileCollapse();
  // Gated rather than CSS-hidden: the form loads every company in the account,
  // which a phone should never pay for.
  const isDesktop = useIsDesktop();

  // Remounts the inline form after a save so it comes back empty rather than
  // holding the attendees that were just logged.
  const [formKey, setFormKey] = useState(0);

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
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
          </svg>
          <h2 className="text-lg font-semibold text-brand-primary font-serif group-hover:text-brand-secondary transition-colors">Touchpoints</h2>
          {options.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold leading-none">{options.length}</span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 lg:hidden ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Desktop: the full form, conference already set */}
        {isDesktop && (
        <div className="flex flex-col flex-1 min-h-0">
          <TouchpointForm
            key={formKey}
            defaultConferenceId={activeConference?.id ?? null}
            onDone={() => setFormKey(k => k + 1)}
            bodyClassName="space-y-4 flex-1 min-h-0 overflow-y-auto"
            footerClassName="flex justify-end gap-2 pt-4 flex-shrink-0"
            cancelLabel={null}
          />
        </div>
        )}

        {/* Phone: one button per type, opening the form in the modal */}
        <div className="lg:hidden">
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
