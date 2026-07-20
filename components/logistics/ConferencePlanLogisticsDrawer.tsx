'use client';

import { useEffect, useRef, useState } from 'react';
import { useDrawerResize } from '@/lib/useDrawerResize';
import { type LogisticsResponse, type AssignedRepOption } from './types';
import { Spinner } from './shared';
import { LogisticsDeadlinesTab } from './LogisticsDeadlinesTab';
import { LogisticsRegistrationTab } from './LogisticsRegistrationTab';
import { LogisticsBoothTab } from './LogisticsBoothTab';
import { LogisticsSponsorshipTab } from './LogisticsSponsorshipTab';
import { LogisticsSpeakingTab } from './LogisticsSpeakingTab';
import { LogisticsTravelTab } from './LogisticsTravelTab';
import { LogisticsHostedEventsTab } from './LogisticsHostedEventsTab';
import { LogisticsShippingTab } from './LogisticsShippingTab';
import { LogisticsPostShowTab } from './LogisticsPostShowTab';
import { LogisticsFilesTab } from './LogisticsFilesTab';

export interface ConferencePlanLogisticsDrawerProps {
  conferenceId: number;
  conferenceName: string;
  seriesName: string | null;
  planYear: number;
  startDate: string | null;
  endDate: string | null;
  decision: string | null;
  plannedBudget: number | null;
  assignedReps: AssignedRepOption[];
  calScore: number | null;
  isOpen: boolean;
  onClose: () => void;
}

const TABS = [
  { id: 'deadlines', label: 'Deadlines' },
  { id: 'registration', label: 'Registration' },
  { id: 'booth', label: 'Booth' },
  { id: 'sponsorship', label: 'Sponsorship' },
  { id: 'speaking', label: 'Speaking' },
  { id: 'travel', label: 'Travel' },
  { id: 'hosted', label: 'Hosted events' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'postshow', label: 'Post-show' },
  { id: 'files', label: 'Files' },
] as const;
type TabId = typeof TABS[number]['id'];

function fmtCurrency(v: number | null): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString();
}

const DECISION_LABEL: Record<string, string> = {
  attend: 'Attending', reduce: 'Reduced', cut: 'Not attending', evaluating: 'Evaluating', new: 'New',
};

export function ConferencePlanLogisticsDrawer({
  conferenceId, conferenceName, seriesName, planYear, startDate, endDate,
  decision, plannedBudget, assignedReps, calScore, isOpen, onClose,
}: ConferencePlanLogisticsDrawerProps) {
  const { panelStyle, handleResizeStart } = useDrawerResize(460, 380, 720);
  const [data, setData] = useState<LogisticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('deadlines');
  const lastConferenceIdRef = useRef<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics?year=${planYear}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load logistics (${res.status})`);
      const json = await res.json() as LogisticsResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    // Reset to Deadlines when opening for a different conference; preserve tab
    // when reopening for the same one.
    if (lastConferenceIdRef.current !== conferenceId) {
      setActiveTab('deadlines');
      lastConferenceIdRef.current = conferenceId;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conferenceId, planYear]);

  if (!isOpen) return null;

  const dateRange = startDate
    ? `${startDate}${endDate && endDate !== startDate ? ` – ${endDate}` : ''}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <style>{`
        @keyframes logisticsFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes logisticsSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes logisticsSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .logistics-panel { animation: logisticsSlideUp 0.25s ease-out; }
        @media (min-width: 640px) { .logistics-panel { animation: logisticsSlideIn 0.25s ease-out; } }
        .logistics-tabbar {
          overflow-x: auto; scrollbar-width: none;
          mask-image: linear-gradient(to right, black 85%, transparent 100%);
          -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
        }
        .logistics-tabbar::-webkit-scrollbar { display: none; }
      `}</style>

      <div
        className="absolute inset-0"
        style={{ animation: 'logisticsFadeIn 0.2s ease-out', backgroundColor: 'rgba(0,0,0,0.45)' }}
        onClick={onClose}
      />

      <div
        className="logistics-panel relative w-full sm:w-[460px] h-[92vh] sm:h-full bg-white shadow-2xl flex flex-col border-t sm:border-t-0 sm:border-l border-gray-200 overflow-hidden rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none"
        style={panelStyle}
      >
        <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={handleResizeStart}>
          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3" style={{ backgroundColor: '#223A5E' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
                {seriesName ? `${seriesName} · ` : ''}FY{planYear}
              </p>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#fff' }} className="truncate">{conferenceName}</p>
              {dateRange && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }} className="mt-0.5">{dateRange}</p>}
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none flex-shrink-0" aria-label="Close">×</button>
          </div>
        </div>

        {/* Context strip */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50 overflow-x-auto">
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap">
            {decision ? (DECISION_LABEL[decision] ?? decision) : '—'}
          </span>
          <span className="text-[11px] text-gray-500 whitespace-nowrap">{fmtCurrency(plannedBudget)} budget</span>
          <span className="text-[11px] text-gray-500 whitespace-nowrap">{assignedReps.length} rep{assignedReps.length !== 1 ? 's' : ''}</span>
          {calScore != null && <span className="text-[11px] text-gray-500 whitespace-nowrap">Cal. Intel {Math.round(calScore)}</span>}
        </div>

        {/* Tab bar */}
        <div className="logistics-tabbar flex-shrink-0 flex gap-1 px-2 py-1.5 border-b border-gray-200 whitespace-nowrap">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTab === t.id ? 'bg-brand-primary text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
              <p className="text-sm text-gray-400">{error}</p>
              <button type="button" onClick={load} className="btn-secondary text-xs">Retry</button>
            </div>
          ) : data ? (
            <div className="px-4 py-4">
              {activeTab === 'deadlines' && (
                <LogisticsDeadlinesTab
                  conferenceId={conferenceId} planYear={planYear}
                  deadlines={data.deadlines} speakingSlots={data.speakingSlots} files={data.files}
                  assignedReps={assignedReps}
                  onDeadlinesChange={deadlines => setData(d => d && { ...d, deadlines })}
                  onSpeakingSlotsChange={speakingSlots => setData(d => d && { ...d, speakingSlots })}
                  onFilesChange={files => setData(d => d && { ...d, files })}
                />
              )}
              {activeTab === 'registration' && (
                <LogisticsRegistrationTab conferenceId={conferenceId} planYear={planYear} plan={data.plan} />
              )}
              {activeTab === 'booth' && (
                <LogisticsBoothTab
                  conferenceId={conferenceId} planYear={planYear} plan={data.plan}
                  deadlines={data.deadlines} startDate={startDate}
                  onDeadlinesChange={deadlines => setData(d => d && { ...d, deadlines })}
                />
              )}
              {activeTab === 'sponsorship' && (
                <LogisticsSponsorshipTab conferenceId={conferenceId} planYear={planYear} plan={data.plan} />
              )}
              {activeTab === 'speaking' && (
                <LogisticsSpeakingTab
                  conferenceId={conferenceId} planYear={planYear}
                  speakingSlots={data.speakingSlots} assignedReps={assignedReps}
                  onChange={speakingSlots => setData(d => d && { ...d, speakingSlots })}
                />
              )}
              {activeTab === 'travel' && (
                <LogisticsTravelTab
                  conferenceId={conferenceId} planYear={planYear}
                  repTravel={data.repTravel} plan={data.plan}
                  onChange={repTravel => setData(d => d && { ...d, repTravel })}
                />
              )}
              {activeTab === 'hosted' && (
                <LogisticsHostedEventsTab
                  conferenceId={conferenceId} planYear={planYear}
                  hostedEvents={data.hostedEvents}
                  onChange={hostedEvents => setData(d => d && { ...d, hostedEvents })}
                />
              )}
              {activeTab === 'shipping' && (
                <LogisticsShippingTab
                  conferenceId={conferenceId} planYear={planYear} plan={data.plan}
                  deadlines={data.deadlines}
                  onDeadlinesChange={deadlines => setData(d => d && { ...d, deadlines })}
                />
              )}
              {activeTab === 'postshow' && (
                <LogisticsPostShowTab
                  conferenceId={conferenceId} planYear={planYear}
                  deadlines={data.deadlines} startDate={startDate} endDate={endDate}
                  onDeadlinesChange={deadlines => setData(d => d && { ...d, deadlines })}
                />
              )}
              {activeTab === 'files' && (
                <LogisticsFilesTab
                  conferenceId={conferenceId} planYear={planYear}
                  files={data.files}
                  onChange={files => setData(d => d && { ...d, files })}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
