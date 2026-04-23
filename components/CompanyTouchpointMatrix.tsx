'use client';

import { useEffect, useRef, useState } from 'react';
import { getPreset } from '@/lib/colors';

interface Attendee { id: number; first_name: string; last_name: string; }
interface Pill { option_id: number; value: string; color: string | null; count: number; }
interface Conference {
  id: number;
  name: string;
  cells: Record<number, Pill[]>;
}
interface MatrixData {
  total: number;
  attendees: Attendee[];
  conferences: Conference[];
}

interface Props {
  companyId: number | string;
  open: boolean;
  onClose: () => void;
}

export function CompanyTouchpointMatrix({ companyId, open, onClose }: Props) {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/companies/${companyId}/touchpoints`)
      .then(r => r.json())
      .then((d: MatrixData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, companyId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        ref={ref}
        className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[75vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-brand-primary font-serif">Touchpoint Map</h3>
            {data && (
              <p className="text-xs text-gray-400 mt-0.5">
                {data.total} total touchpoint{data.total !== 1 ? 's' : ''} · {data.attendees.length} attendee{data.attendees.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <svg className="w-6 h-6 animate-spin text-brand-secondary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : !data || data.total === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No touchpoints logged for this company yet.</p>
          ) : (
            <table className="w-full text-xs border-collapse min-w-max">
              <thead>
                <tr>
                  {/* Conference column */}
                  <th className="text-left py-2 pr-4 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-36 sticky left-0 bg-white">
                    Conference
                  </th>
                  {data.attendees.map(a => (
                    <th key={a.id} className="text-left py-2 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider min-w-[140px]">
                      {a.first_name} {a.last_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.conferences.map((conf, ci) => (
                  <tr key={conf.id} className={ci % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}>
                    {/* Conference name cell */}
                    <td className={`py-3 pr-4 align-top sticky left-0 ${ci % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}`}>
                      <span className="font-semibold text-gray-700 leading-snug block">
                        {conf.name}
                      </span>
                    </td>
                    {/* One cell per attendee */}
                    {data.attendees.map(a => {
                      const pills = conf.cells[a.id] ?? [];
                      return (
                        <td key={a.id} className="py-3 px-3 align-top">
                          {pills.length === 0 ? (
                            <span className="text-gray-200">—</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {pills.map(pill => {
                                const preset = getPreset(pill.color);
                                return (
                                  <div
                                    key={pill.option_id}
                                    className="inline-flex items-center justify-between gap-2 rounded-lg border-2 pl-2.5 pr-2 py-1 text-xs font-medium w-full"
                                    style={{
                                      borderColor: preset.hex,
                                      backgroundColor: `${preset.hex}18`,
                                      color: preset.hex,
                                    }}
                                  >
                                    <span className="truncate">{pill.value}</span>
                                    <span className="font-bold flex-shrink-0">{pill.count}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
