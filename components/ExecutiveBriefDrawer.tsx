'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SeriesYoYData, ConferenceYoYRow } from '@/lib/get-series-yoy-data';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConferenceSnapshot {
  id: number;
  conference_id: number;
  snapshot_taken_at: string;
  ces_score: number | null;
  cost_efficiency_score: number | null;
  total_cost: number | null;
  pipeline_influenced: number | null;
  pipeline_net_new: number | null;
  pipeline_continued_engagement: number | null;
  pipeline_per_1k: number | null;
  cost_per_company_engaged: number | null;
  cost_per_meeting_held: number | null;
  icp_companies_total: number | null;
  icp_companies_engaged: number | null;
  icp_engagement_rate: number | null;
  buying_committee_coverage_rate: number | null;
  decision_makers_engaged: number | null;
  meeting_hold_rate: number | null;
  followup_scheduling_rate: number | null;
  followup_completion_rate: number | null;
  avg_health_score_engaged: number | null;
  returning_attendee_rate: number | null;
  companies_3plus_instances: number | null;
  strategy_name: string | null;
  sponsorship_level: string | null;
  booth_present: number | null;
  booth_width: number | null;
  booth_length: number | null;
  booth_number: string | null;
  booth_hall: string | null;
  budget_total: number | null;
  actual_total: number | null;
  budget_variance: number | null;
  budget_line_items: string | null;
  required_pipeline_multiple: number | null;
  required_pipeline_amount: number | null;
  expected_return_amount: number | null;
  cost_per_internal_attendee: number | null;
  pipeline_per_meeting?: number | null;
  pipeline_per_company?: number | null;
  pipeline_influence_execution_score?: number | null;
  meeting_execution_score?: number | null;
  followup_execution_score?: number | null;
  target_account_execution_score?: number | null;
  rep_productivity_score?: number | null;
  sales_effectiveness_score?: number | null;
}

interface ConferenceSummary {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  internal_attendees?: string | null;
  sponsorship_level?: string | null;
  booth_present?: number | boolean | null;
  booth_width?: number | null;
  booth_length?: number | null;
  booth_number?: string | null;
  booth_hall?: string | null;
  conference_strategy_type_display_name?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conference: ConferenceSummary;
  seriesYoY: SeriesYoYData | null;
  snapshot: ConferenceSnapshot | null;
}

// ─── Formatting utilities ─────────────────────────────────────────────────────

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '—';
  return `$${Math.round(val).toLocaleString()}`;
}

// Full precision with commas — used in line items table
function formatCurrencyFull(val: number | null | undefined): string {
  if (val == null) return '—';
  return `$${Math.round(val).toLocaleString()}`;
}

function formatMillions(val: number | null | undefined): string {
  if (val == null || val === 0) return '—';
  return `$${Math.round(val).toLocaleString()}`;
}

function formatPct(val: number | null | undefined, decimals = 0): string {
  if (val == null) return '—';
  return `${(val * 100).toFixed(decimals)}%`;
}

function formatPctDirect(val: number | null | undefined, decimals = 1): string {
  if (val == null) return '—';
  return `${val.toFixed(decimals)}%`;
}

function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (!end || start === end) return s.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

// ─── Tier / benchmark logic ───────────────────────────────────────────────────

type TierResult = { label: string; textClass: string; bgClass: string };

function getCesTier(score: number | null): TierResult {
  if (score == null) return { label: '—', textClass: 'text-gray-400', bgClass: 'bg-gray-100' };
  if (score >= 90) return { label: 'Elite', textClass: 'text-blue-700', bgClass: 'bg-blue-100' };
  if (score >= 75) return { label: 'Strong', textClass: 'text-blue-700', bgClass: 'bg-blue-100' };
  if (score >= 60) return { label: 'Moderate', textClass: 'text-amber-700', bgClass: 'bg-amber-100' };
  if (score >= 50) return { label: 'Weak', textClass: 'text-red-600', bgClass: 'bg-red-100' };
  return { label: 'Inefficient', textClass: 'text-red-600', bgClass: 'bg-red-100' };
}

type BenchResult = { label: string; bg: string; text: string; border: string } | null;

function getPipelinePerKBench(val: number | null): BenchResult {
  if (val == null) return null;
  if (val >= 10000) return { label: 'Elite',    bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300' };
  if (val >= 6000)  return { label: 'Strong',   bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300' };
  if (val >= 3500)  return { label: 'Healthy',  bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300' };
  if (val >= 1500)  return { label: 'Weak',     bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300'   };
  return              { label: 'Poor',     bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300'   };
}

function getCostPerCompanyBench(val: number | null): BenchResult {
  if (val == null) return null;
  if (val <= 350)  return { label: 'Elite',    bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300' };
  if (val <= 650)  return { label: 'Strong',   bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300' };
  if (val <= 1000) return { label: 'Healthy',  bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300' };
  if (val <= 1600) return { label: 'Weak',     bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300'   };
  return             { label: 'Poor',     bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300'   };
}

function getCostPerMeetingBench(val: number | null): BenchResult {
  if (val == null) return null;
  if (val <= 400)  return { label: 'Elite',    bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300' };
  if (val <= 700)  return { label: 'Strong',   bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300' };
  if (val <= 1100) return { label: 'Healthy',  bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300' };
  if (val <= 1800) return { label: 'Weak',  bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' };
  return                   { label: 'Poor', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' };
}

// ─── Recommendation logic ─────────────────────────────────────────────────────

type RecommendationResult = {
  action: 'attend' | 'attend_conditional' | 'reduce' | 'review';
  label: string;
  icon: string;
  boxClass: string;
  textClass: string;
  borderClass: string;
};

function getNextYear(dateStr: string | null | undefined): string {
  if (!dateStr) return 'next year'
  return String(new Date(dateStr).getFullYear() + 1)
}

function getPrevInstance(snapshot: ConferenceSnapshot, seriesYoY: SeriesYoYData | null) {
  const instances = seriesYoY?.instances ?? [];
  const idx = instances.findIndex(i => i.conferenceId === snapshot.conference_id);
  return idx > 0 ? instances[idx - 1] : null;
}

function getRecommendation(snapshot: ConferenceSnapshot, seriesYoY: SeriesYoYData | null): RecommendationResult {
  const ces = snapshot.ces_score;
  if (!ces) return {
    action: 'review', label: 'Review before committing to',
    icon: 'ti-alert-circle', boxClass: 'bg-red-50 border-red-200',
    textClass: 'text-red-800', borderClass: 'border',
  };

  const instances = seriesYoY?.instances ?? [];
  const prev = instances.length >= 2 ? instances[instances.length - 2] : null;
  const trend = prev?.cesScore != null ? ces - prev.cesScore : null;

  if (ces >= 75) return {
    action: 'attend', label: 'Attend',
    icon: 'ti-circle-check', boxClass: 'bg-green-50 border-green-200',
    textClass: 'text-green-800', borderClass: 'border',
  };

  if (ces >= 60 && (trend === null || trend >= 0)) return {
    action: 'attend', label: 'Attend',
    icon: 'ti-circle-check', boxClass: 'bg-green-50 border-green-200',
    textClass: 'text-green-800', borderClass: 'border',
  };

  // CES 60–74 AND declining year-over-year — conditional path
  if (ces >= 60 && trend !== null && trend < 0) return {
    action: 'attend_conditional', label: 'Reduce footprint or improve execution at',
    icon: 'ti-alert-triangle', boxClass: 'bg-amber-50 border-amber-200',
    textClass: 'text-amber-800', borderClass: 'border',
  };

  return {
    action: 'review', label: 'Review before committing to',
    icon: 'ti-alert-circle', boxClass: 'bg-red-50 border-red-200',
    textClass: 'text-red-800', borderClass: 'border',
  };
}

function generateRationale(
  snapshot: ConferenceSnapshot,
  conference: ConferenceSummary,
  seriesYoY: SeriesYoYData | null,
  rec: RecommendationResult,
): string {
  const ces = snapshot.ces_score ?? 0;
  const tier = getCesTier(ces).label;
  const engRate = Math.round((snapshot.icp_engagement_rate ?? 0) * 100);
  const missed = (snapshot.icp_companies_total ?? 0) - (snapshot.icp_companies_engaged ?? 0);
  const instances = seriesYoY?.instances ?? [];
  const prev = instances.length >= 2 ? instances[instances.length - 2] : null;
  const trend = prev?.cesScore != null ? ces - prev.cesScore : null;

  const baseText = `${conference.name} delivered a CES of ${ces} (${tier}) against a ${snapshot.strategy_name ?? 'defined'} strategy. ` +
    `${snapshot.icp_companies_engaged} of ${snapshot.icp_companies_total} ICP companies were engaged (${engRate}% engagement rate). ` +
    (missed > 0 ? `${missed} ICP companies were present but not engaged, representing an estimated ${formatCurrency(
      ((snapshot.pipeline_influenced ?? 0) / Math.max(snapshot.icp_companies_engaged ?? 1, 1)) * missed
    )} in addressable pipeline. ` : '') +
    (trend !== null ? `CES has ${trend > 0 ? 'improved' : 'declined'} ${Math.abs(trend)} points year-over-year. ` : '');

  if (rec.action === 'attend_conditional' && prev) {
    const commitments: string[] = [];

    const engDelta = (snapshot.icp_engagement_rate ?? 0) - (prev.icpEngagementRate ?? 0);
    if (engDelta < -0.03) {
      const targetRate = Math.round(((prev.icpEngagementRate ?? 0) + 0.05) * 100);
      commitments.push(`ICP engagement rate above ${targetRate}% (vs. ${engRate}% in this cycle)`);
    }

    const holdCurrent = Math.round((snapshot.meeting_hold_rate ?? 0) * 100);
    const holdPrev = Math.round((prev.meetingHoldRate ?? 0) * 100);
    if (holdCurrent < holdPrev - 5) {
      commitments.push(`Meeting hold rate above ${holdPrev}% through pre-conference confirmation outreach`);
    }

    const fuCurrent = Math.round((snapshot.followup_completion_rate ?? 0) * 100);
    const fuPrev = Math.round((prev.followupCompletionRate ?? 0) * 100);
    if (fuCurrent < fuPrev - 5) {
      commitments.push(`Follow-up completion rate above ${fuPrev}% within 14 days post-conference`);
    }

    if (engRate < 25) {
      const targetEngaged = Math.round((snapshot.icp_companies_total ?? 0) * 0.30);
      commitments.push(`Minimum ${targetEngaged} ICP companies engaged (top targets pre-identified before arrival)`);
    }

    if (commitments.length > 0) {
      return baseText.trim() + `\n\nTo justify continued investment, the team should commit to: ${commitments.join('; ')}. ` +
        `These targets give leadership a basis for conditional approval and the team a clear execution benchmark for the next cycle.`;
    }
  }

  return baseText.trim();
}

// ─── Budget line items parser ─────────────────────────────────────────────────

function parseBudgetLineItems(raw: string | null | undefined): Array<{ name: string; budget: number; actual: number }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const parseDollar = (v: unknown) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;
    return parsed
      .filter((item: unknown) => item && typeof item === 'object')
      .map((item: Record<string, unknown>) => ({
        name: String(item.label ?? item.name ?? item.category ?? 'Item'),
        budget: parseDollar(item.budget),
        actual: parseDollar(item.actual) || parseDollar(item.budget),
      }))
      .filter(item => item.budget > 0 || item.actual > 0);
  } catch {
    return [];
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionEyebrow({ num, label }: { num: string; label: string }) {
  return (
    <p className="text-[12px] font-semibold uppercase tracking-widest text-gray-400 mb-3 pb-2 border-b border-gray-100">
      {num} — {label}
    </p>
  );
}

function StatCard({ label, value, sub, valueClass, className }: { label: string; value: string; sub?: string; valueClass?: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-0.5${className ? ` ${className}` : ''}`}>
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className={`text-xl font-semibold ${valueClass ?? 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
    </div>
  );
}

function BenchBadge({ bench }: { bench: BenchResult }) {
  if (!bench) return null;
  return (
    <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded-full border ${bench.bg} ${bench.text} ${bench.border}`}>
      {bench.label}
    </span>
  );
}

function DimBarRow({
  label, value, barColor, tier, displayVal,
}: {
  label: string;
  value: number | null;
  barColor: string;
  tier: TierResult;
  displayVal: string;
}) {
  const pct = value ?? 0;
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="text-[11px] text-gray-600 w-44 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: barColor }} />
      </div>
      <span className="text-[11px] font-medium text-gray-700 w-10 text-right">{displayVal}</span>
      <span className={`text-xs font-medium w-14 text-left ${tier.textClass}`}>{tier.label}</span>
    </div>
  );
}

function CountCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center justify-center p-2.5 bg-gray-50 rounded-lg border border-gray-100">
      <span className="text-base font-semibold text-gray-800">{value}</span>
      <span className="text-[10px] text-gray-500 text-center mt-0.5 leading-tight">{label}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExecutiveBriefDrawer({ isOpen, onClose, conference, seriesYoY, snapshot }: Props) {
  const [mounted, setMounted] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const handleSavePdf = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/conferences/${conference.id}/executive-brief-pdf`);
      if (!res.ok) throw new Error('PDF generation failed');
      const contentType = res.headers.get('content-type');
      if (contentType?.includes('application/pdf')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Executive-Brief-${conference.name.replace(/\s+/g, '-')}-${new Date(conference.start_date).getFullYear()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const { html } = await res.json();
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.onload = () => { win.focus(); win.print(); };
        }
      }
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setPdfLoading(false);
    }
  };

  if (!isOpen) return null;
  if (!mounted) return null;

  const yoyInstances = seriesYoY?.instances ?? [];
  const hasYoY = yoyInstances.length >= 2;
  const lineItems = parseBudgetLineItems(snapshot?.budget_line_items);

  // Missed opportunity calcs
  const missedCount = (snapshot?.icp_companies_total ?? 0) - (snapshot?.icp_companies_engaged ?? 0);
  const avgPipelinePerCompany = (snapshot?.icp_companies_engaged ?? 0) > 0
    ? (snapshot?.pipeline_influenced ?? 0) / (snapshot!.icp_companies_engaged!)
    : 0;
  const estimatedMissedPipeline = avgPipelinePerCompany * missedCount;
  const engagementPct = snapshot && snapshot.icp_companies_total && snapshot.icp_companies_total > 0
    ? (snapshot.icp_companies_engaged ?? 0) / snapshot.icp_companies_total * 100
    : 0;

  // Recommendation
  const rec = snapshot ? getRecommendation(snapshot, seriesYoY) : null;
  const rationale = snapshot && rec ? generateRationale(snapshot, conference, seriesYoY, rec) : '';

  // Internal attendee headcount from comma-separated string
  const internalHeadcount = conference.internal_attendees
    ? conference.internal_attendees.split(',').map(s => s.trim()).filter(Boolean).length
    : null;

  // Proposed next budget
  const budgetMultiplier =
    rec?.action === 'attend' ? 1.05 :
    rec?.action === 'attend_conditional' ? 0.9 :
    rec?.action === 'reduce' ? 0.85 :
    0.9;
  const proposedNextBudget = snapshot?.actual_total ? snapshot.actual_total * budgetMultiplier : null;
  const budgetSubLabel =
    rec?.action === 'attend' ? '+5% vs. actual' :
    rec?.action === 'attend_conditional' ? '−10% vs. actual — subject to execution targets' :
    rec?.action === 'reduce' ? '−15% vs. actual' :
    '−10% vs. actual';

  const content = (
    <div className="fixed inset-0 z-50">
      <style>{`
        @keyframes execBriefFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes execBriefSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @media print {
          .executive-brief-drawer-root { display: none !important; }
        }
      `}</style>

      {/* Overlay */}
      <div
        className="hidden sm:block absolute inset-0 no-print"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', animation: 'execBriefFadeIn 0.15s ease-out' }}
        onClick={onClose}
      />
      <div className="sm:hidden absolute inset-0 bg-black/30 no-print" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute inset-0 sm:left-64 sm:flex sm:items-center sm:justify-center sm:p-5 pointer-events-none">
        <div
          className="executive-brief-drawer-root pointer-events-auto relative w-full h-full sm:h-[90vh] sm:max-w-[1100px] flex flex-col bg-white sm:rounded-xl sm:shadow-2xl overflow-hidden"
          style={{ animation: 'execBriefSlideIn 0.25s ease-out' }}
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white no-print">
            <div className="flex items-center gap-3 min-w-0">
              {/* ti-presentation-analytics */}
              <svg className="w-5 h-5 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20h6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12V8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 12V6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12v-2" />
              </svg>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 m-0">Executive brief</p>
                <p className="text-xs text-gray-400 m-0 truncate">{conference.name} · {formatDateRange(conference.start_date, conference.end_date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleSavePdf}
                disabled={pdfLoading || !snapshot}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pdfLoading
                  ? <><i className="ti ti-loader-2 text-xs animate-spin" aria-hidden="true" />Generating...</>
                  : <><i className="ti ti-download text-xs" aria-hidden="true" />Save to PDF</>
                }
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Body ────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

            {/* Empty state */}
            {!snapshot && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
                </svg>
                <p className="text-sm font-medium text-gray-400">No snapshot available</p>
                <p className="text-xs text-gray-400 text-center max-w-xs">
                  Take a snapshot from the Analytics tab to generate the executive brief.
                </p>
              </div>
            )}

            {snapshot && (
              <>
                {/* ── 01 Investment ────────────────────────────────── */}
                <section>
                  <SectionEyebrow num="01" label="Investment" />

                  {/* Meta pills */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {snapshot.sponsorship_level && snapshot.sponsorship_level !== 'none' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200">
                        {/* ti-trophy */}
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4M5 7H3a2 2 0 0 0-2 2v1a4 4 0 0 0 4 4h.5M19 7h2a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4h-.5M7 3h10a2 2 0 0 1 2 2v5a7 7 0 0 1-14 0V5a2 2 0 0 1 2-2z" />
                        </svg>
                        {snapshot.sponsorship_level}
                      </span>
                    )}
                    {snapshot.strategy_name && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200">
                        {/* ti-target */}
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                        </svg>
                        {snapshot.strategy_name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 bg-purple-50 text-purple-800 border border-purple-200">
                      {/* ti-layout-grid */}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" />
                        <rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" />
                      </svg>
                      {snapshot.booth_present
                        ? `Booth #${snapshot.booth_number ?? '—'} · ${snapshot.booth_width ?? '?'}×${snapshot.booth_length ?? '?'} ft`
                        : 'No booth'}
                    </span>
                  </div>

                  {/* Stat cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-3">
                    <StatCard
                      label="Total spend"
                      value={formatCurrency(snapshot.actual_total ?? snapshot.budget_total ?? snapshot.total_cost)}
                      sub={snapshot.budget_total ? `Budget: ${formatCurrency(snapshot.budget_total)}` : undefined}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5"
                    />
                    <StatCard
                      label="Budget variance"
                      value={
                        snapshot.budget_variance == null ? '—'
                          : snapshot.budget_variance < 0
                          ? `-${formatCurrency(Math.abs(snapshot.budget_variance))}`
                          : snapshot.budget_variance > 0
                          ? `+${formatCurrency(snapshot.budget_variance)}`
                          : '$0'
                      }
                      sub={
                        snapshot.budget_variance == null ? undefined
                          : snapshot.budget_variance < 0 ? 'Under budget'
                          : snapshot.budget_variance > 0 ? 'Over budget'
                          : 'On budget'
                      }
                      valueClass={
                        snapshot.budget_variance == null ? 'text-gray-800'
                          : snapshot.budget_variance < 0 ? 'text-emerald-600'
                          : snapshot.budget_variance > 0 ? 'text-red-500'
                          : 'text-gray-800'
                      }
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5"
                    />
                    <StatCard
                      label="Cost per company engaged"
                      value={formatCurrency(snapshot.cost_per_company_engaged)}
                      sub={snapshot.icp_companies_engaged != null ? `${snapshot.icp_companies_engaged} engaged` : undefined}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5"
                    />
                    <StatCard
                      label="Cost per meeting"
                      value={formatCurrency(snapshot.cost_per_meeting_held)}
                      sub={(() => {
                        const totalCost = snapshot.actual_total ?? snapshot.total_cost;
                        if (totalCost && snapshot.cost_per_meeting_held && snapshot.cost_per_meeting_held > 0) {
                          return `${Math.round(totalCost / snapshot.cost_per_meeting_held)} meetings held`;
                        }
                        return undefined;
                      })()}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5"
                    />
                    <StatCard
                      label="Cost per internal attendee"
                      value={formatCurrency(
                        snapshot.cost_per_internal_attendee
                          ?? (internalHeadcount && internalHeadcount > 0
                              ? (snapshot.actual_total ?? snapshot.total_cost ?? null) != null
                                ? (snapshot.actual_total ?? snapshot.total_cost)! / internalHeadcount
                                : null
                              : null)
                      )}
                      sub={internalHeadcount != null ? `${internalHeadcount} attendees` : undefined}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5"
                    />
                  </div>

                  {/* Budget line items table */}
                  {lineItems.length > 0 && (
                    <div className="overflow-x-auto">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Budget vs. Actual</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left font-medium text-gray-500 pb-1.5 pr-4">Line item</th>
                            <th className="text-right font-medium text-gray-500 pb-1.5 px-3">Budget</th>
                            <th className="text-right font-medium text-gray-500 pb-1.5 px-3">Actual</th>
                            <th className="text-right font-medium text-gray-500 pb-1.5 px-3">Variance ($)</th>
                            <th className="text-right font-medium text-gray-500 pb-1.5 pl-3 pr-4">Variance (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.map((item, i) => {
                            const varianceDollar = item.actual - item.budget;
                            const variancePct = item.budget > 0
                              ? (varianceDollar / item.budget) * 100 : 0;
                            const over = varianceDollar > 0;
                            const rowBg = i % 2 === 1 ? 'bg-gray-100' : '';
                            return (
                              <tr key={i} className={rowBg}>
                                <td className="py-1.5 pr-4 text-gray-700">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {item.name}
                                    {/sponsorship/i.test(item.name) && snapshot.sponsorship_level && snapshot.sponsorship_level !== 'none' && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200">
                                        <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4M5 7H3a2 2 0 0 0-2 2v1a4 4 0 0 0 4 4h.5M19 7h2a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4h-.5M7 3h10a2 2 0 0 1 2 2v5a7 7 0 0 1-14 0V5a2 2 0 0 1 2-2z" />
                                        </svg>
                                        {snapshot.sponsorship_level}
                                      </span>
                                    )}
                                    {/booth/i.test(item.name) && snapshot.booth_present && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-purple-50 text-purple-800 border border-purple-200">
                                        <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                                          <rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" />
                                          <rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" />
                                        </svg>
                                        {`${snapshot.booth_width ?? '?'}×${snapshot.booth_length ?? '?'} ft`}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-1.5 px-3 text-right text-gray-600">{formatCurrencyFull(item.budget)}</td>
                                <td className="py-1.5 px-3 text-right text-gray-600">{formatCurrencyFull(item.actual)}</td>
                                <td className="py-1.5 px-3 text-right">
                                  <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                                    over ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                  }`}>
                                    {over ? '+' : ''}{formatCurrencyFull(varianceDollar)}
                                  </span>
                                </td>
                                <td className="py-1.5 pl-3 pr-4 text-right">
                                  <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                                    over ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                  }`}>
                                    {over ? '+' : ''}{variancePct.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          {/* Total row */}
                          {(() => {
                            const totalBudget = lineItems.reduce((s, item) => s + item.budget, 0);
                            const totalActual = lineItems.reduce((s, item) => s + item.actual, 0);
                            const totalDollar = totalActual - totalBudget;
                            const totalPct = totalBudget > 0 ? (totalDollar / totalBudget) * 100 : 0;
                            const over = totalDollar > 0;
                            return (
                              <tr className="border-t border-gray-200 font-medium">
                                <td className="py-1.5 pr-4 text-gray-800">Total</td>
                                <td className="py-1.5 px-3 text-right text-gray-700">{formatCurrencyFull(totalBudget)}</td>
                                <td className="py-1.5 px-3 text-right text-gray-700">{formatCurrencyFull(totalActual)}</td>
                                <td className="py-1.5 px-3 text-right">
                                  <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                                    over ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                  }`}>
                                    {over ? '+' : ''}{formatCurrencyFull(totalDollar)}
                                  </span>
                                </td>
                                <td className="py-1.5 pl-3 pr-4 text-right">
                                  <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                                    over ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                  }`}>
                                    {over ? '+' : ''}{totalPct.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* ── 02 Return ────────────────────────────────────── */}
                <section>
                  <SectionEyebrow num="02" label="Return" />

                  {/* CES + Cost efficiency score cards */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {/* CES card */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-800 mb-2">
                        Conference effectiveness
                      </p>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-4xl font-medium text-blue-900">{snapshot.ces_score ?? '—'}</span>
                        <span className="text-sm text-blue-300">/100</span>
                      </div>
                      <p className={`text-xs font-medium mb-1.5 ${getCesTier(snapshot.ces_score).textClass}`}>
                        {getCesTier(snapshot.ces_score).label}
                      </p>
                      <p className="text-[11px] text-blue-600 leading-relaxed">
                        {snapshot.ces_score == null
                          ? 'No score available.'
                          : snapshot.ces_score >= 75
                          ? `Strong execution across ICP engagement, meeting hold rate, and pipeline influence.`
                          : snapshot.ces_score >= 60
                          ? `Moderate performance — review ICP engagement and follow-up completion for improvement.`
                          : `Below-average conference execution. Focus on meeting hold rate and ICP targeting quality.`}
                      </p>
                    </div>

                    {/* Cost efficiency card */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-green-800 mb-2">
                        Cost efficiency
                      </p>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-4xl font-medium text-green-900">{snapshot.cost_efficiency_score ?? '—'}</span>
                        <span className="text-sm text-green-300">/100</span>
                      </div>
                      <p className={`text-xs font-medium mb-1.5 ${getCesTier(snapshot.cost_efficiency_score).textClass}`}>
                        {getCesTier(snapshot.cost_efficiency_score).label}
                      </p>
                      <p className="text-[11px] text-green-600 leading-relaxed">
                        {snapshot.cost_efficiency_score == null
                          ? 'No score available.'
                          : snapshot.cost_efficiency_score >= 75
                          ? `Cost per company and pipeline per $1K are tracking at benchmark or better.`
                          : snapshot.cost_efficiency_score >= 60
                          ? `Cost efficiency is acceptable but has room to improve on pipeline per $1K.`
                          : `Cost per outcome is above benchmark. Consider renegotiating sponsorship or reducing booth size.`}
                      </p>
                    </div>
                  </div>

                  {/* Cost sub-metric cards — green to match Cost Efficiency score */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { label: 'Pipeline per $1K', value: formatCurrency(snapshot.pipeline_per_1k), bench: getPipelinePerKBench(snapshot.pipeline_per_1k) },
                      { label: 'Cost Per Company Engaged', value: formatCurrency(snapshot.cost_per_company_engaged), bench: getCostPerCompanyBench(snapshot.cost_per_company_engaged) },
                      { label: 'Cost per meeting', value: formatCurrency(snapshot.cost_per_meeting_held), bench: getCostPerMeetingBench(snapshot.cost_per_meeting_held) },
                    ].map(({ label, value, bench }) => (
                      <div key={label} className="flex flex-col gap-1.5 p-2.5 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[12px] font-semibold text-gray-700 leading-tight">{label}</span>
                          <BenchBadge bench={bench} />
                        </div>
                        <span className="text-base font-semibold text-gray-800">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Pipeline stat cards — blue to match Conference Effectiveness score */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
                    {(() => {
                      const influenced = snapshot.pipeline_influenced;
                      const netNew = snapshot.pipeline_net_new;
                      const continued = snapshot.pipeline_continued_engagement;
                      const required = snapshot.required_pipeline_amount;

                      const pct = (num: number | null, denom: number | null) =>
                        num != null && denom != null && denom > 0
                          ? `${Math.round((num / denom) * 100)}%`
                          : null;

                      const cards: { label: string; value: string; sub?: string; pill?: string }[] = [
                        {
                          label: 'Total Pipeline Influenced',
                          value: formatMillions(influenced),
                          pill: pct(influenced, required) ? `${pct(influenced, required)} of required` : undefined,
                        },
                        {
                          label: 'Net-New Pipeline Influenced',
                          value: formatMillions(netNew),
                          pill: pct(netNew, influenced) ? `${pct(netNew, influenced)} of total` : undefined,
                        },
                        {
                          label: 'Reengaged Pipeline',
                          value: formatMillions(continued),
                          pill: pct(continued, influenced) ? `${pct(continued, influenced)} of total` : undefined,
                        },
                        {
                          label: 'Required Influenced Pipeline',
                          value: formatMillions(required),
                          sub: snapshot.required_pipeline_multiple != null ? `${snapshot.required_pipeline_multiple}× spend target` : undefined,
                        },
                      ];

                      return cards.map(({ label, value, sub, pill }) => (
                        <div key={label} className="flex flex-col gap-1.5 p-2.5 bg-blue-50 rounded-lg border border-blue-200">
                          <span className="text-[12px] font-semibold text-gray-700 leading-tight">{label}</span>
                          <span className="text-base font-semibold text-gray-800">{value}</span>
                          {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
                          {pill && (
                            <span className="inline-flex self-start items-center text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-blue-100 text-blue-700 border border-blue-200">
                              {pill}
                            </span>
                          )}
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Pipeline target indicator */}
                  {snapshot.required_pipeline_amount != null && snapshot.pipeline_influenced != null && (
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
                      snapshot.pipeline_influenced >= snapshot.required_pipeline_amount
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'bg-red-50 border-red-200 text-red-600'
                    }`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d={snapshot.pipeline_influenced >= snapshot.required_pipeline_amount
                            ? 'M5 13l4 4L19 7'
                            : 'M6 18L18 6M6 6l12 12'} />
                      </svg>
                      {snapshot.pipeline_influenced >= snapshot.required_pipeline_amount
                        ? 'Pipeline target met'
                        : 'Pipeline target missed'}
                    </div>
                  )}
                </section>

                {/* ── 03 Execution quality ─────────────────────────── */}
                <section>
                  <SectionEyebrow num="03" label="Execution quality" />

                  <div className="mb-3">
                    <DimBarRow
                      label="ICP engagement rate"
                      value={(snapshot.icp_engagement_rate ?? 0) * 100}
                      barColor="#185FA5"
                      tier={getCesTier(snapshot.icp_engagement_rate != null ? snapshot.icp_engagement_rate * 100 : null)}
                      displayVal={snapshot.icp_engagement_rate != null ? `${Math.round(snapshot.icp_engagement_rate * 100)}%` : '—'}
                    />
                    <DimBarRow
                      label="Meeting hold rate"
                      value={(snapshot.meeting_hold_rate ?? 0) * 100}
                      barColor="#185FA5"
                      tier={getCesTier(snapshot.meeting_hold_rate != null ? snapshot.meeting_hold_rate * 100 : null)}
                      displayVal={snapshot.meeting_hold_rate != null ? `${Math.round(snapshot.meeting_hold_rate * 100)}%` : '—'}
                    />
                    <DimBarRow
                      label="Follow-up scheduling"
                      value={(snapshot.followup_scheduling_rate ?? 0) * 100}
                      barColor="#1D9E75"
                      tier={getCesTier(snapshot.followup_scheduling_rate != null ? snapshot.followup_scheduling_rate * 100 : null)}
                      displayVal={snapshot.followup_scheduling_rate != null ? `${Math.round(snapshot.followup_scheduling_rate * 100)}%` : '—'}
                    />
                    <DimBarRow
                      label="Follow-up completion"
                      value={(snapshot.followup_completion_rate ?? 0) * 100}
                      barColor="#1D9E75"
                      tier={getCesTier(snapshot.followup_completion_rate != null ? snapshot.followup_completion_rate * 100 : null)}
                      displayVal={snapshot.followup_completion_rate != null ? `${Math.round(snapshot.followup_completion_rate * 100)}%` : '—'}
                    />
                    <DimBarRow
                      label="Pipeline per Meeting"
                      value={snapshot.pipeline_influence_execution_score ?? 0}
                      barColor="#185FA5"
                      tier={getCesTier(snapshot.pipeline_influence_execution_score ?? null)}
                      displayVal={snapshot.pipeline_per_meeting != null ? formatCurrencyFull(snapshot.pipeline_per_meeting) : '—'}
                    />
                    <DimBarRow
                      label="Pipeline Influence"
                      value={snapshot.pipeline_influence_execution_score ?? 0}
                      barColor="#1D9E75"
                      tier={getCesTier(snapshot.pipeline_influence_execution_score ?? null)}
                      displayVal={snapshot.pipeline_influence_execution_score != null ? `${Math.round(snapshot.pipeline_influence_execution_score)}` : '—'}
                    />
                    <DimBarRow
                      label="Rep Productivity"
                      value={snapshot.rep_productivity_score ?? 0}
                      barColor="#7F77DD"
                      tier={getCesTier(snapshot.rep_productivity_score ?? null)}
                      displayVal={snapshot.rep_productivity_score != null ? `${Math.round(snapshot.rep_productivity_score)}` : '—'}
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <CountCard label="Decision makers engaged" value={snapshot.decision_makers_engaged ?? '—'} />
                    <CountCard label="ICP companies engaged" value={snapshot.icp_companies_engaged ?? '—'} />
                    <CountCard label="ICP companies total" value={snapshot.icp_companies_total ?? '—'} />
                    <CountCard label="Net-new logos engaged" value={
                      snapshot.pipeline_net_new != null && snapshot.pipeline_influenced != null && snapshot.pipeline_influenced > 0
                        ? Math.round((snapshot.pipeline_net_new / snapshot.pipeline_influenced) * (snapshot.icp_companies_engaged ?? 0))
                        : '—'
                    } />
                  </div>
                </section>

                {/* ── 04 Missed opportunity ────────────────────────── */}
                <section>
                  <SectionEyebrow num="04" label="Missed opportunity" />

                  {snapshot.icp_companies_total != null && snapshot.icp_companies_engaged != null ? (
                    <>
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200 mb-3">
                        <svg className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
                        </svg>
                        <div>
                          <p className="text-[12px] font-medium text-orange-800 mb-1">
                            {missedCount} ICP-matched companies attended but were not engaged
                          </p>
                          <p className="text-[12px] text-orange-700 leading-relaxed">
                            Estimated <strong>{formatCurrency(estimatedMissedPipeline)}</strong> in addressable pipeline influenced present but not touched.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="min-w-[80px]">
                          <p className="text-2xl font-medium text-gray-800">{missedCount}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">Not engaged</p>
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                            <span>Engaged: {snapshot.icp_companies_engaged} ({Math.round(engagementPct)}%)</span>
                            <span>Total ICP: {snapshot.icp_companies_total}</span>
                          </div>
                          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-brand-secondary"
                              style={{ width: `${Math.min(engagementPct, 100).toFixed(2)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">ICP data unavailable.</p>
                  )}
                </section>

                {/* ── 05 Year-over-year ────────────────────────────── */}
                {hasYoY && (
                  <section>
                    <SectionEyebrow num="05" label="Year-over-year" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left font-medium text-gray-500 pb-2 pr-4">Year</th>
                            <th className="text-right font-medium text-gray-500 pb-2 px-3">Cost</th>
                            <th className="text-right font-medium text-gray-500 pb-2 px-3">CES</th>
                            <th className="text-right font-medium text-gray-500 pb-2 px-3">Pipeline</th>
                            <th className="text-right font-medium text-gray-500 pb-2 px-3">ICP Engaged</th>
                            <th className="text-right font-medium text-gray-500 pb-2 px-3">Hold Rate</th>
                            <th className="text-right font-medium text-gray-500 pb-2 px-3">Pipeline/$1K</th>
                            <th className="text-right font-medium text-gray-500 pb-2 pl-3">vs. prior</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yoyInstances.map((row, i) => {
                            const prevRow = i > 0 ? yoyInstances[i - 1] : null;
                            const cesDiff = prevRow?.cesScore != null && row.cesScore != null
                              ? row.cesScore - prevRow.cesScore : null;
                            const isCurrent = row.conferenceId === snapshot.conference_id;
                            return (
                              <tr key={row.conferenceId} className={isCurrent ? 'bg-blue-50/50' : i % 2 === 0 ? 'bg-gray-50/30' : ''}>
                                <td className="py-1.5 pr-4 font-medium text-gray-800">{row.year || '—'}</td>
                                <td className="py-1.5 px-3 text-right text-gray-600">{formatCurrency(row.totalCost)}</td>
                                <td className={`py-1.5 px-3 text-right font-medium ${getCesTier(row.cesScore).textClass}`}>
                                  {row.cesScore ?? '—'}
                                </td>
                                <td className="py-1.5 px-3 text-right text-gray-600">{formatMillions(row.pipelineInfluenced)}</td>
                                <td className="py-1.5 px-3 text-right text-gray-600">{row.icpCompaniesEngaged ?? '—'}</td>
                                <td className="py-1.5 px-3 text-right text-gray-600">
                                  {row.meetingHoldRate != null ? `${(row.meetingHoldRate * 100).toFixed(1)}%` : '—'}
                                </td>
                                <td className="py-1.5 px-3 text-right text-gray-600">{formatCurrency(row.pipelinePerK)}</td>
                                <td className="py-1.5 pl-3 text-right">
                                  {cesDiff == null ? (
                                    <span className="text-gray-400">—</span>
                                  ) : cesDiff > 0 ? (
                                    <span className="text-green-600 font-medium">↑ +{cesDiff} pts</span>
                                  ) : cesDiff < 0 ? (
                                    <span className="text-red-500 font-medium">↓ {cesDiff} pts</span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* ── 06 Recommendation ───────────────────────────── */}
                <section>
                  <SectionEyebrow num="06" label="Recommendation" />

                  {rec && (
                    <div className={`rounded-xl p-4 mb-3 ${rec.borderClass} ${rec.boxClass}`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${rec.textClass} opacity-70`}>
                        Recommendation
                      </p>
                      <p className={`text-sm font-medium mb-2 ${rec.textClass} flex items-center gap-1.5`}>
                        <i className={`ti ${rec.icon} text-base leading-none`} />
                        {rec.label} {conference.name} in {getNextYear(conference.start_date)}
                      </p>
                      {rationale.split('\n\n').map((para, i) => (
                        <p key={i} className={`text-xs leading-relaxed ${rec.textClass} ${i > 0 ? 'mt-2 pt-2 border-t border-amber-200' : ''}`}>
                          {para}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Summary stat cards */}
                  <div className="grid grid-cols-3 gap-2.5 mb-2">
                    <StatCard
                      label="Proposed next budget"
                      value={formatCurrency(proposedNextBudget)}
                      sub={budgetSubLabel}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5"
                    />
                    <StatCard
                      label="Current headcount"
                      value={internalHeadcount != null ? String(internalHeadcount) : '—'}
                      sub="Internal attendees"
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5"
                    />
                    <StatCard
                      label="CES target"
                      value={snapshot.ces_score != null ? `${snapshot.ces_score + 5}+` : '—'}
                      sub="Next instance goal"
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2.5"
                    />
                  </div>

                  {snapshot.snapshot_taken_at && (
                    <p className="text-[11px] text-gray-400 mt-2">
                      Snapshot taken {formatRelativeDate(snapshot.snapshot_taken_at)} · Generated by Parlay
                    </p>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
