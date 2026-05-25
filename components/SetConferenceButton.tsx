'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser } from '@/components/UserContext';
import { useActiveConference, type ActiveConference } from '@/components/ActiveConferenceContext';
import { computeConferenceStage, type ConferenceStage } from '@/lib/conference-stage';

function safeConferenceStage(c: ConferenceRow): ConferenceStage {
  if (c.is_historical) return 'closed';
  return computeConferenceStage(c);
}

interface ConferenceRow {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string | null;
  internal_attendees: string | null;
  post_conference_days?: number | null;
  stage_override?: string | null;
  is_historical?: number | null;
}

function formatDateRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function SetConferenceButton() {
  const { user } = useUser();
  const { activeConference, setActiveConference, clearActiveConference, isManuallySet } = useActiveConference();
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelConferences, setPanelConferences] = useState<ConferenceRow[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const autoSetAttempted = useRef(false);

  // Auto-set: runs once when user becomes available, only if not already manually set
  useEffect(() => {
    if (!user || isManuallySet || autoSetAttempted.current) return;
    autoSetAttempted.current = true;
    void (async () => {
      try {
        const data: ConferenceRow[] = await fetch('/api/conferences?nav=1').then(r => r.json());
        const userNames = [user.displayName, user.repName]
          .filter(Boolean)
          .map(s => s!.trim().toLowerCase());
        if (userNames.length === 0) return;

        const isUserInternal = (conf: ConferenceRow) => {
          if (!conf.internal_attendees) return false;
          const attendees = conf.internal_attendees.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          return userNames.some(n => attendees.includes(n));
        };

        // Priority 1: in-progress conference where user is internal attendee
        const inProgress = data
          .filter(c => !c.is_historical && safeConferenceStage(c) === 'in_progress' && isUserInternal(c));
        if (inProgress.length > 0) {
          const conf = inProgress.sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
          setActiveConference(
            { id: conf.id, name: conf.name, start_date: conf.start_date, end_date: conf.end_date, location: conf.location ?? null },
            false,
          );
          return;
        }

        // Priority 2: earliest upcoming conference where user is internal attendee
        const upcoming = data
          .filter(c => !c.is_historical && safeConferenceStage(c) === 'planning' && isUserInternal(c));
        if (upcoming.length > 0) {
          const conf = upcoming.sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
          setActiveConference(
            { id: conf.id, name: conf.name, start_date: conf.start_date, end_date: conf.end_date, location: conf.location ?? null },
            false,
          );
          return;
        }

        // Priority 3: most recent past conference where user is internal attendee
        const past = data
          .filter(c => isUserInternal(c) && (c.is_historical || ['post_conference', 'closed'].includes(safeConferenceStage(c))));
        if (past.length > 0) {
          const conf = past.sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
          setActiveConference(
            { id: conf.id, name: conf.name, start_date: conf.start_date, end_date: conf.end_date, location: conf.location ?? null },
            false,
          );
        }
      } catch {}
    })();
  }, [user, isManuallySet, setActiveConference]);

  const openPanel = async () => {
    setPanelOpen(true);
    if (panelConferences.length > 0) return;
    setPanelLoading(true);
    try {
      const data: ConferenceRow[] = await fetch('/api/conferences').then(r => r.json());
      const sorted = [...data].sort((a, b) => a.start_date.localeCompare(b.start_date));
      setPanelConferences(sorted);
    } catch {}
    setPanelLoading(false);
  };

  const handleSelect = (conf: ConferenceRow) => {
    setActiveConference(
      { id: conf.id, name: conf.name, start_date: conf.start_date, end_date: conf.end_date, location: conf.location },
      true,
    );
    setPanelOpen(false);
  };

  return (
    <>
      {activeConference ? (
        <button
          type="button"
          onClick={openPanel}
          className="w-full lg:w-auto flex items-center gap-2 px-3 py-2.5 lg:py-1.5 rounded-xl lg:rounded-lg bg-green-50 border border-green-200 hover:bg-green-100 transition-colors text-left"
        >
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          <span className="flex-1 min-w-0 text-sm font-medium text-green-800 truncate">{activeConference.name}</span>
          <svg className="w-3.5 h-3.5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={openPanel}
          className="w-full lg:w-auto flex items-center gap-2 px-3 py-2.5 lg:py-1.5 rounded-xl lg:rounded-lg bg-amber-50 border border-amber-200 border-dashed hover:bg-amber-100 transition-colors"
        >
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="flex-1 text-sm font-medium text-amber-700">Set Active Conference</span>
          <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" onClick={() => setPanelOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full lg:max-w-md lg:mx-4 bg-white rounded-t-2xl lg:rounded-xl shadow-2xl flex flex-col mt-auto lg:mt-0 max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-brand-primary font-serif">Select Active Conference</h2>
              <button type="button" onClick={() => setPanelOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-3">
              {panelLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : panelConferences.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No conferences found.</p>
              ) : (
                <>
                  {(['in_progress', 'planning', 'post_conference', 'closed'] as const).map(groupStage => {
                    const group = panelConferences.filter(c => safeConferenceStage(c) === groupStage);
                    if (group.length === 0) return null;
                    const groupLabel = groupStage === 'in_progress' ? 'In Progress'
                      : groupStage === 'planning' ? 'Upcoming'
                      : 'Past';
                    return (
                      <div key={groupStage} className="mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1 mb-1">{groupLabel}</p>
                        <ul className="space-y-0.5">
                          {group.map(conf => {
                    const isActive = activeConference?.id === conf.id;
                    return (
                      <li key={conf.id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(conf)}
                          className={[
                            'w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-2.5',
                            isActive ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50',
                          ].join(' ')}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-800 truncate block">{conf.name}</span>
                            <p className="text-xs text-gray-500 mt-0.5">{formatDateRange(conf.start_date, conf.end_date)}</p>
                            {conf.location && <p className="text-xs text-gray-400">{conf.location}</p>}
                          </div>
                          {isActive && (
                            <svg className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </li>
                    );
                  })}
                        </ul>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { clearActiveConference(); setPanelOpen(false); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors text-center"
              >
                {activeConference ? 'Clear Active Conference' : 'No Active Conference'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
