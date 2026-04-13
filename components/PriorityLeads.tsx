'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { useUserOptions, parseRepIds, getRepInitials } from '@/lib/useUserOptions';

type TooltipPos = { top: number; left: number; width: number; above: boolean };

function calcTooltipPos(el: HTMLElement, maxW = 260): TooltipPos {
  const rect = el.getBoundingClientRect();
  const w = Math.min(maxW, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
  const above = rect.top > 180;
  return { top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above };
}

function conferenceBadgeClass(count: number) {
  if (count >= 4) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700';
  if (count === 3) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700';
  if (count === 2) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700';
  return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';
}

function ConferenceTooltip({ count, names }: { count: number; names?: string }) {
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const confList = (names || '').split(',').map(s => s.trim()).filter(Boolean);
  if (count === 0) return <span className={conferenceBadgeClass(0)}>{count}</span>;
  return (
    <div ref={ref} className="relative inline-block"
      onMouseEnter={() => ref.current && setPos(calcTooltipPos(ref.current))}
      onMouseLeave={() => setPos(null)}>
      <span className={`${conferenceBadgeClass(count)} cursor-default`}>{count}</span>
      {pos && confList.length > 0 && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5">
            <p className="font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Conferences Attended</p>
            <ul className="space-y-1">
              {confList.map((name, i) => (
                <li key={i} className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />{name}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export interface PriorityLead {
  id: number;
  name: string;
  assigned_user: string | null;
  wse: number | null;
  conference_count: number;
  conference_names?: string;
}

export function PriorityLeads({ leads }: { leads: PriorityLead[] }) {
  const userOptions = useUserOptions();
  const colorMaps = useConfigColors();

  if (leads.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">No priority leads found.</p>
    );
  }

  return (
    <div className="space-y-2">
      {leads.map((lead) => {
        const repUsers = parseRepIds(lead.assigned_user).map(id => userOptions.find(u => u.id === id)).filter(Boolean);
        return (
          <div
            key={lead.id}
            className="flex flex-col gap-1.5 p-4 rounded-lg border border-gray-200 hover:bg-blue-50 transition-all group"
          >
            {/* Row 1: company name */}
            <Link href={`/companies/${lead.id}`} className="min-w-0">
              <p className="font-medium text-procare-bright-blue hover:underline text-sm break-words whitespace-normal leading-snug">
                {lead.name}
              </p>
            </Link>
            {/* Row 2: reps + WSE + conference count */}
            <div className="flex items-center gap-2 flex-wrap">
              {repUsers.length > 0 && (
                <span className="inline-flex flex-wrap gap-1">
                  {repUsers.map((user, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
                      <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {getRepInitials(user!.value)}
                    </span>
                  ))}
                </span>
              )}
              {lead.wse != null && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" />
                  </svg>
                  <span className="badge-gray">{Number(lead.wse).toLocaleString()}</span>
                </div>
              )}
              <ConferenceTooltip count={lead.conference_count} names={lead.conference_names} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
