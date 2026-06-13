'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SummaryTab } from './effectiveness/SummaryTab';
import { SalesExecutionTab } from './effectiveness/SalesExecutionTab';
import { AudienceMessagingTab } from './effectiveness/AudienceMessagingTab';
import { OperationalROITab } from './effectiveness/OperationalROITab';
import { DefinitionsTab } from './effectiveness/DefinitionsTab';
import { useSectionConfig } from '@/lib/useSectionConfig';
import type { EffectivenessData } from './ConferenceEffectivenessModal';

const HEADER_BG = 'rgb(var(--brand-accent-rgb))';
const HEADER_TEXT = 'rgb(var(--brand-primary-rgb))';
const SECONDARY = '#1B76BC';

type TabKey = 'summary' | 'sales' | 'audience' | 'roi' | 'definitions';

function scoreColor(s: number | null | undefined) {
  if (s == null) return '#9ca3af';
  return s >= 70 ? '#059669' : s >= 40 ? '#d97706' : '#dc2626';
}

function fmt$(n: number | null | undefined) {
  if (n == null) return '—';
  return '$' + Math.round(n).toLocaleString();
}

function fmtDate(d: string) {
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

function ScoreStatPill({ label, score }: { label: string; score: number | null | undefined }) {
  const color = scoreColor(score);
  return (
    <div className="rounded-xl border-2 p-2 flex flex-col items-center gap-0.5 min-w-0 bg-white/60" style={{ borderColor: color }}>
      <div className="text-lg font-bold leading-tight" style={{ color }}>{score ?? '—'}</div>
      <div className="text-[10px] font-semibold text-center leading-tight" style={{ color: HEADER_TEXT }}>{label}</div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 p-2 bg-white/60 flex flex-col items-center gap-0.5 min-w-0" style={{ borderColor: 'rgb(var(--brand-primary-rgb) / 0.2)' }}>
      <div className="text-lg font-bold leading-tight" style={{ color: HEADER_TEXT }}>{value}</div>
      <div className="text-[10px] font-semibold text-center leading-tight" style={{ color: 'rgb(var(--brand-primary-rgb) / 0.6)' }}>{label}</div>
    </div>
  );
}

interface Props {
  conferenceId: number;
  conferenceName: string;
  onClose: () => void;
}

const LOADING_STEPS = [
  'Calculating Conference Effectiveness Score',
  'Calculating Sales Execution Score',
  'Calculating Marketing Coverage Score',
  'Calculating Cost Efficiency Score',
  'Finalizing',
];

export function EffectivenessDrawer({ conferenceId, conferenceName, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<EffectivenessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [statsOpen, setStatsOpen] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [atBottom, setAtBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { orderedKeys, isVisible, getLabel } = useSectionConfig('effectiveness_modal');

  const visibleTabs = (orderedKeys.length > 0 ? orderedKeys : ['summary', 'sales', 'audience', 'roi', 'definitions'])
    .filter(key => isVisible(key))
    .map(key => ({ key: key as TabKey, label: getLabel(key) }));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetch(`/api/conferences/${conferenceId}/effectiveness`)
      .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json(); })
      .then((d: EffectivenessData) => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [conferenceId]);

  useEffect(() => {
    if (!loading) return;
    const last = LOADING_STEPS.length - 1;
    if (loadingStep >= last) return;
    const t = setTimeout(() => setLoadingStep(s => Math.min(s + 1, last)), 7000);
    return () => clearTimeout(t);
  }, [loading, loadingStep]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  }, []);

  const handleChevronClick = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottom) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      el.scrollBy({ top: el.clientHeight * 0.75, behavior: 'smooth' });
    }
  }, [atBottom]);

  // Reset scroll position and atBottom when tab changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setAtBottom(false);
  }, [activeTab]);

  if (!mounted) return null;

  const conf = data?.conference;
  const ces = data?.ces;
  const pi = Number(data?.pipeline?.total_pipeline_influence ?? 0);
  const salesScore = data?.sales_execution?.sales_effectiveness_score != null ? Number(data.sales_execution.sales_effectiveness_score) : null;
  const audienceScore = data?.marketing_audience?.marketing_audience_signal_score != null ? Number(data.marketing_audience.marketing_audience_signal_score) : null;
  const costScore = data?.operational?.cost_efficiency?.cost_efficiency_score != null ? Number(data.operational.cost_efficiency.cost_efficiency_score) : null;
  const startDate = conf?.start_date ? fmtDate(String(conf.start_date)) : '';
  const endDate = conf?.end_date ? fmtDate(String(conf.end_date)) : '';
  const dateRange = startDate && endDate ? `${startDate} – ${endDate}` : startDate || '';
  const location = conf?.location ? String(conf.location) : '';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="drawer-mobile-responsive relative flex flex-col bg-white w-full sm:w-[500px] h-[90vh] sm:h-full shadow-2xl rounded-t-2xl sm:rounded-tl-2xl sm:rounded-bl-2xl sm:rounded-tr-none sm:rounded-br-none overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3" style={{ backgroundColor: HEADER_BG }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: `${HEADER_TEXT}99` }}>Conference Effectiveness</p>
              <h2 className="text-sm font-bold leading-tight truncate" style={{ color: HEADER_TEXT }}>{conferenceName}</h2>
              {(dateRange || location) && (
                <p className="text-[11px] mt-0.5 opacity-60 truncate" style={{ color: HEADER_TEXT }}>{[dateRange, location].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              <button
                type="button"
                onClick={() => setStatsOpen(v => !v)}
                className="transition-colors opacity-60 hover:opacity-100"
                style={{ color: HEADER_TEXT }}
                aria-label={statsOpen ? 'Collapse stats' : 'Expand stats'}
              >
                <svg className={`w-4 h-4 transition-transform duration-200 ${statsOpen ? '' : '-rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <a
                href={`/conferences/${conferenceId}?tab=effectiveness`}
                className="text-[11px] opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap"
                style={{ color: HEADER_TEXT }}
              >
                Open full →
              </a>
              <button
                type="button"
                onClick={onClose}
                className="transition-colors opacity-60 hover:opacity-100"
                style={{ color: HEADER_TEXT }}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Collapsible stat pills — collapsed by default */}
          {statsOpen && (
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <ScoreStatPill label="CES" score={ces?.score} />
              <ScoreStatPill label="Sales Execution" score={salesScore} />
              <ScoreStatPill label="Mktg Coverage" score={audienceScore} />
              <ScoreStatPill label="Cost Efficiency" score={costScore} />
              <div className="col-span-2">
                <StatPill label="Pipeline Influence" value={fmt$(pi)} />
              </div>
            </div>
          )}
        </div>

        {/* Loading / error */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
            <svg className="w-7 h-7 animate-spin text-brand-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p
              key={loadingStep}
              className="text-sm text-gray-500 text-center"
              style={{ animation: 'fadeUp 0.4s ease-out' }}
            >
              {LOADING_STEPS[loadingStep]}
            </p>
          </div>
        )}
        {error && (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-sm text-red-500 text-center">{error}</p>
          </div>
        )}

        {data && (
          <>
            {/* Tab nav */}
            <div className="border-b border-gray-200 bg-white overflow-x-auto flex-shrink-0">
              <nav className="flex px-2">
                {visibleTabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className="py-2.5 px-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap"
                    style={activeTab === t.key
                      ? { borderColor: SECONDARY, color: SECONDARY }
                      : { borderColor: 'transparent', color: '#6b7280' }}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab content */}
            <div className="relative flex-1 min-h-0">
              <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto scrollbar-hide effectiveness-drawer-narrow">
                {activeTab === 'summary'     && <SummaryTab data={data} conferenceId={conferenceId} />}
                {activeTab === 'sales'       && <SalesExecutionTab data={data} />}
                {activeTab === 'audience'    && <AudienceMessagingTab data={data} />}
                {activeTab === 'roi'         && <OperationalROITab data={data} />}
                {activeTab === 'definitions' && <DefinitionsTab />}
              </div>
              {/* Scroll chevron */}
              <button
                type="button"
                onClick={handleChevronClick}
                className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-2 pt-6 transition-opacity hover:opacity-80"
                style={{ background: 'linear-gradient(to bottom, transparent, white 60%)' }}
                aria-label={atBottom ? 'Scroll to top' : 'Scroll down'}
              >
                <svg
                  className="w-5 h-5 text-gray-400 transition-transform duration-300"
                  style={{ transform: atBottom ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
