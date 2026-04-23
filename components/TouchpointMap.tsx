'use client';

import { useEffect, useRef, useState } from 'react';
import { getPreset } from '@/lib/colors';

interface TouchpointEntry {
  option_id: number;
  value: string;
  color: string | null;
  count: number;
}

interface ConferenceEntry {
  conference_id: number;
  conference_name: string;
  options: TouchpointEntry[];
}

interface MapData {
  total: number;
  byConference: ConferenceEntry[];
}

interface Props {
  attendeeId: number;
  open: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement>;
}

export function TouchpointMap({ attendeeId, open, onClose, anchorRef }: Props) {
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/attendees/${attendeeId}/touchpoints`)
      .then(r => r.json())
      .then((d: MapData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, attendeeId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) &&
          !(anchorRef?.current?.contains(e.target as Node))) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Touchpoint Map</span>
        <button type="button" onClick={onClose} className="text-gray-300 hover:text-gray-500 text-sm leading-none">✕</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <svg className="w-5 h-5 animate-spin text-brand-secondary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      ) : !data || data.total === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No touchpoints logged yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <span className="text-xs text-gray-500">Total Touchpoints</span>
            <span className="text-sm font-bold text-brand-primary">{data.total}</span>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {data.byConference.map(conf => (
              <div key={conf.conference_id}>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 truncate">
                  {conf.conference_name}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {conf.options.map(opt => {
                    const preset = getPreset(opt.color);
                    return (
                      <div
                        key={opt.option_id}
                        className="inline-flex items-center gap-1.5 rounded-lg border-2 pl-2.5 pr-2 py-1 text-xs font-medium"
                        style={{
                          borderColor: preset.hex,
                          backgroundColor: `${preset.hex}18`,
                          color: preset.hex,
                        }}
                      >
                        <span>{opt.value}</span>
                        <span className="font-bold">{opt.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
