'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { TeamInputPanel } from './calendar-intelligence/TeamInputPanel';

interface Props {
  conferenceId: number;
  conferenceName: string;
  onClose: () => void;
}

export function ConferenceInputPanel({ conferenceId, conferenceName, onClose }: Props) {
  const [requestFormOpen, setRequestFormOpen] = useState(false);

  const content = (
    <div className="fixed inset-0 z-50 flex justify-end">
      <style>{`
        @keyframes slideInFromRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div
        className="relative flex flex-col w-full max-w-[400px] h-full bg-white shadow-2xl overflow-hidden"
        style={{ animation: 'slideInFromRight 220ms ease-out' }}
      >
        {/* Header — matches Cal Intel drawer style */}
        <div
          className="flex-shrink-0 px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'rgb(var(--brand-primary-rgb))' }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-0.5">Team Input</p>
            <h2 className="text-base font-bold text-white leading-snug truncate" title={conferenceName}>
              {conferenceName}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setRequestFormOpen(v => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
              style={{
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.75)',
                background: requestFormOpen ? 'rgba(255,255,255,0.15)' : 'transparent',
              }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Request Input
            </button>
            <button
              onClick={onClose}
              className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body — same TeamInputPanel used inside the Cal Intel drawer */}
        <div className="flex-1 overflow-y-auto p-4">
          <TeamInputPanel
            conferenceId={conferenceId}
            conferenceName={conferenceName}
            requestFormOpen={requestFormOpen}
            onRequestFormChange={setRequestFormOpen}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
