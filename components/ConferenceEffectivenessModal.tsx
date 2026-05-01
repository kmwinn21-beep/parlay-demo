'use client';

import { useState } from 'react';
import { SummaryTab } from './effectiveness/SummaryTab';
import { SalesExecutionTab } from './effectiveness/SalesExecutionTab';
import { AudienceMessagingTab } from './effectiveness/AudienceMessagingTab';
import { OperationalROITab } from './effectiveness/OperationalROITab';
import { DefinitionsTab } from './effectiveness/DefinitionsTab';

// ── Shared data types ─────────────────────────────────────────────────────────

export interface CESData {
  score: number;
  dim1_icp_target: number;
  dim2_meeting_exec: number;
  dim3_pipeline_index: number;
  dim4_breadth: number;
  dim5_followup: number;
  dim6_net_new: number;
  dim7_cost_efficiency: number;
  target_pipeline_influence: number | null;
}

export interface EffectivenessData {
  conference: Record<string, unknown>;
  ces: CESData;
  engagement: Record<string, unknown> & {
    contacts_engaged?: number;
    operator_contacts_total?: number;
  };
  pipeline: Record<string, unknown>;
  audience: {
    icp_coverage: Record<string, unknown>;
    icp_quality: Record<string, unknown>;
    seniority_mix: Record<string, unknown>[];
    account_penetration: Record<string, unknown>;
    persona_distribution: Record<string, unknown>[];
    net_new_logos: Record<string, unknown>;
  };
  operational: {
    line_items: Record<string, unknown>[];
    cost_efficiency: Record<string, unknown>;
    annual_budget: number | null;
    annual_budget_year: number | null;
    rep_activity: Record<string, unknown>[];
    conf_efficiency_rank?: number;
    conf_efficiency_total?: number;
    rep_cost_efficiency?: Record<string, unknown>[];
    rep_allocated_cost?: number;
  };
  effectiveness_defaults: Record<string, string>;
}

// ── Color constants ───────────────────────────────────────────────────────────

// Header uses brand-accent (set in Admin → Brand Colors → Accent #1)
const HEADER_BG = 'rgb(var(--brand-accent-rgb))';
const HEADER_TEXT = 'rgb(var(--brand-primary-rgb))';
const SECONDARY = '#1B76BC';

function fmtDate(d: string) {
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

function fmt$(n: number | null | undefined) {
  if (n == null) return '—';
  return '$' + Math.round(n).toLocaleString();
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border-2 p-3 bg-white/60 flex flex-col items-center gap-0.5 min-w-0" style={{ borderColor: 'rgb(var(--brand-primary-rgb) / 0.2)' }}>
      <div className="text-xl font-bold leading-tight" style={{ color: HEADER_TEXT }}>{value}</div>
      <div className="text-xs font-semibold text-center truncate w-full" style={{ color: 'rgb(var(--brand-primary-rgb) / 0.6)' }}>{label}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  conferenceId: number;
  conferenceName: string;
}

const TABS = [
  { key: 'summary',     label: 'Summary' },
  { key: 'sales',       label: 'Sales Execution' },
  { key: 'audience',    label: 'Audience & Messaging' },
  { key: 'roi',         label: 'Operational ROI' },
  { key: 'definitions', label: 'Definitions' },
] as const;
type TabKey = typeof TABS[number]['key'];

export function ConferenceEffectivenessModal({ conferenceId, conferenceName }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<EffectivenessData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [statsOpen, setStatsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/effectiveness`);
      if (!res.ok) throw new Error('Failed to load effectiveness data');
      const d = await res.json() as EffectivenessData;
      setData(d);
      setOpen(true);
      setActiveTab('summary');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const triggerBtn = (
    <button
      type="button"
      onClick={handleOpen}
      disabled={loading}
      className="flex items-center gap-1.5 py-1 px-1 text-sm font-medium transition-colors whitespace-nowrap text-gray-500 hover:text-brand-secondary cursor-pointer disabled:opacity-50"
    >
      {loading ? (
        <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )}
      <span>Effectiveness</span>
    </button>
  );

  if (!open || !data) return (
    <>
      {triggerBtn}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </>
  );

  const conf = data.conference;
  const ces = data.ces;
  const pi = Number(data.pipeline.total_pipeline_influence ?? 0);
  const icpCov = data.audience.icp_coverage;
  const eng = data.engagement;

  const cesColor = ces.score >= 70 ? '#059669' : ces.score >= 40 ? '#d97706' : '#dc2626';

  const startDate = conf.start_date ? fmtDate(String(conf.start_date)) : '';
  const endDate   = conf.end_date   ? fmtDate(String(conf.end_date)) : '';
  const dateRange = startDate && endDate ? `${startDate} – ${endDate}` : startDate || '';
  const location = conf.location ? String(conf.location) : '';

  return (
    <>
      {triggerBtn}

      <div className="fixed inset-0 z-50" style={{ animation: 'fadeUp 0.2s ease-out' }}>
        <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
        <div className="absolute inset-0 sm:inset-4 md:inset-6 flex flex-col bg-white overflow-hidden shadow-2xl sm:rounded-2xl">

          {/* Header */}
          <div className="flex-shrink-0 px-6 py-4" style={{ backgroundColor: HEADER_BG }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold mb-0.5 uppercase tracking-widest" style={{ color: `${HEADER_TEXT}99` }}>Conference Effectiveness</p>
                <h2 className="text-lg font-bold leading-tight" style={{ color: HEADER_TEXT }}>{conferenceName}</h2>
                {(dateRange || location) && (
                  <p className="text-xs mt-0.5 opacity-60" style={{ color: HEADER_TEXT }}>{[dateRange, location].filter(Boolean).join(' · ')}</p>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => setStatsOpen((v: boolean) => !v)}
                  className="sm:hidden transition-colors opacity-60 hover:opacity-100"
                  style={{ color: HEADER_TEXT }}
                  aria-label={statsOpen ? 'Collapse stats' : 'Expand stats'}
                >
                  <svg className={`w-5 h-5 transition-transform duration-200 ${statsOpen ? '' : '-rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button onClick={() => setOpen(false)} className="transition-colors opacity-60 hover:opacity-100" style={{ color: HEADER_TEXT }}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className={`grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 ${statsOpen ? 'grid' : 'hidden sm:grid'}`}>
              <div className="rounded-xl border-2 p-3 flex flex-col items-center gap-0.5 min-w-0 bg-white/60" style={{ borderColor: cesColor }}>
                <div className="text-xl font-bold leading-tight" style={{ color: cesColor }}>{ces.score}</div>
                <div className="text-xs font-semibold text-center" style={{ color: HEADER_TEXT }}>CES /100</div>
              </div>
              <StatPill label="Pipeline Influence" value={fmt$(pi)} />
              <StatPill label="ICP Coverage" value={icpCov.icp_company_engagement_pct != null ? `${String(icpCov.icp_company_engagement_pct)}%` : '—'} />
              <StatPill label="Meetings Held" value={String(eng.total_held ?? '—')} />
              <StatPill label="FU Rate" value={eng.followup_completion_rate_pct != null ? `${String(eng.followup_completion_rate_pct)}%` : '—'} />
              <StatPill label="Net-New Logos" value={String(data.audience.net_new_logos.net_new_logos ?? '—')} />
            </div>
          </div>

          {/* Tab nav */}
          <div className="border-b border-gray-200 bg-white overflow-x-auto flex-shrink-0">
            <nav className="flex gap-0 px-4">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className="py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
                  style={activeTab === t.key
                    ? { borderColor: SECONDARY, color: SECONDARY }
                    : { borderColor: 'transparent', color: '#6b7280' }}>
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'summary'     && <SummaryTab data={data} />}
            {activeTab === 'sales'       && <SalesExecutionTab data={data} />}
            {activeTab === 'audience'    && <AudienceMessagingTab data={data} />}
            {activeTab === 'roi'         && <OperationalROITab data={data} />}
            {activeTab === 'definitions' && <DefinitionsTab />}
          </div>
        </div>
      </div>
    </>
  );
}
