'use client';
import { useEffect, useState } from 'react';
import type { EffectivenessData } from '../ConferenceEffectivenessModal';
import { StrategyWeightNotice } from './StrategyWeightNotice';
import { ConferenceRankingsModal } from './ConferenceRankingsModal';

const fmtNum = (n: number | null | undefined) => n == null ? '—' : Math.round(n).toLocaleString();
const fmtPct = (n: number | null | undefined) => n == null ? '—' : `${Math.round(n)}%`;

function compScoreColor(s: number | null | undefined) {
  const v = Number(s ?? 0);
  if (v >= 80) return '#1D9E75';
  if (v >= 60) return '#d97706';
  if (v >= 40) return '#f97316';
  return '#dc2626';
}

function ProgressBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 mb-2">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(score, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div className="flex justify-between text-xs py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
    </div>
  );
}

export function AudienceMessagingTab({ data }: { data: EffectivenessData }) {
  const m = (data as any).marketing_audience;
  const strategyLabel = (data as any).conference_strategy?.display_name || 'Not set';
  const [showRankings, setShowRankings] = useState(false);
  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const [tableFilter, setTableFilter] = useState<'net_new' | 'all'>('net_new');
  const [cardRank, setCardRank] = useState<number | null>(m?.audience_quality_rank ?? null);
  const [cardTotal, setCardTotal] = useState<number | null>(m?.audience_quality_rank_total ?? null);
  const [rankLoading, setRankLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const currentId = Number((data as any)?.conference?.id ?? 0);
    setRankLoading(true);
    fetch('/api/conferences?nav=1')
      .then(r => r.ok ? r.json() : [])
      .then(async (confs: Array<{ id: number }>) => {
        const scored = await Promise.all((confs ?? []).map(async (c: { id: number }) => {
          const res = await fetch(`/api/conferences/${c.id}/effectiveness`);
          if (!res.ok) return null;
          const eff = await res.json() as any;
          const score = Number(eff?.marketing_audience?.marketing_audience_signal_score ?? 0);
          return score > 0 ? { id: c.id, score } : null;
        }));
        const ranked = scored.filter(Boolean).sort((a: any, b: any) => b.score - a.score);
        const idx = ranked.findIndex((r: any) => r.id === currentId);
        if (!cancelled) {
          setCardTotal((idx >= 0 ? ranked.length : cardTotal) || null);
          setCardRank(idx >= 0 ? idx + 1 : cardRank);
          setRankLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setRankLoading(false); });
    return () => { cancelled = true; };
  }, [data]);

  if (!m) return <div className="p-6 text-sm text-gray-500">Audience signal data unavailable.</div>;

  const overallScore = Number(m.marketing_audience_signal_score ?? 0);
  const insightsAvailable = Boolean(m.insights_available);
  const painPointsAvailable = Boolean(m.pain_points_available);
  const comps = m.components ?? {};

  const infoColor = insightsAvailable ? '#1D9E75' : '#d97706';
  const infoMessage = insightsAvailable
    ? `Conversation Quality and Market Intelligence components are active — based on ${m.kpis?.buying_signals_count ?? 0} buying signals and ${m.conversation_quality_detail?.meetings_with_pain_points ?? 0} pain points captured across ${m.conversation_quality_detail?.meetings_held ?? 0} meetings.`
    : 'No meeting insights captured for this conference. Use the meeting notetaker to log pain points and buying signals — these two components will score automatically and your overall score could increase significantly.';

  const accountRows: any[] = (m.account_level_table ?? []).filter((r: any) => r.access_depth !== 'scan_only');
  const filteredRows = tableFilter === 'net_new' ? accountRows.filter(r => r.is_net_new) : accountRows;

  const COMP_LABELS: Record<string, string> = {
    icp_coverage_rate: 'ICP Coverage Rate',
    buyer_access_quality: 'Buyer Access Quality',
    conversation_quality_signal: 'Conv. Quality Signal',
    market_intelligence_yield: 'Mkt Intel Yield',
    engagement_momentum: 'Engagement Momentum',
  };
  const COMP_KEYS = ['icp_coverage_rate','buyer_access_quality','conversation_quality_signal','market_intelligence_yield','engagement_momentum'];

  function accessDepthPill(depth: string) {
    if (depth === 'meeting') return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#E1F5EE', color: '#1D9E75' }}>Meeting</span>;
    if (depth === 'touchpoint') return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#FEF3C7', color: '#d97706' }}>Touchpoint</span>;
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#F3F4F6', color: '#6B7280' }}>Scan only</span>;
  }

  function followupPill(status: string) {
    if (status === 'done') return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#E1F5EE', color: '#1D9E75' }}>✓ Done</span>;
    if (status === 'pending') return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#FEF3C7', color: '#d97706' }}>Pending</span>;
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#FEE2E2', color: '#dc2626' }}>None</span>;
  }

  const mom = m.engagement_momentum_detail ?? {};

  return (
    <div className="p-6 space-y-6">
      {/* ── Top row: 4 columns ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:1fr_0.5fr_0.5fr_0.5fr] gap-3">
        {/* Score card */}
        {(() => {
          const cardColor = overallScore >= 70 ? '#059669' : overallScore >= 40 ? '#d97706' : '#dc2626';
          return (
        <div className="rounded-xl p-4 relative" style={{ backgroundColor: cardColor + '15', borderLeft: '4px solid ' + cardColor }}>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Marketing Coverage Score</div>
          <div className="flex items-end gap-1 mb-0.5">
            <div className="text-4xl font-bold" style={{ color: cardColor }}>{overallScore}</div>
            <div className="text-sm text-gray-400 mb-0.5">/100</div>
          </div>
          <div className="text-xs font-semibold mb-2" style={{ color: cardColor }}>{m.marketing_audience_signal_interpretation ?? 'Not scored'}</div>

          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] text-gray-500">Conference Strategy: {strategyLabel}</div>
            <button
              onClick={() => setShowInfoPopover(!showInfoPopover)}
              className="flex items-center gap-1 text-[11px] font-medium rounded px-1.5 py-0.5 transition-colors"
              style={{ color: infoColor, background: insightsAvailable ? '#C6F0E3' : '#FEF3C7' }}
              title={insightsAvailable ? 'Insights active' : 'No insights yet'}
            >
              <i className="ti ti-info-circle" style={{ fontSize: 14 }} />
            </button>
          </div>
          {showInfoPopover && (
            <div className="rounded-lg p-3 text-xs mb-2" style={{ background: insightsAvailable ? '#D1FAE5' : '#FEF3C7', border: `1px solid ${insightsAvailable ? '#6EE7B7' : '#FCD34D'}`, color: insightsAvailable ? '#065F46' : '#92400E' }}>
              {infoMessage}
            </div>
          )}
          <StrategyWeightNotice applied={(data as any).sales_execution?.strategy_modifier_applied} strategyLabel={strategyLabel} />

          <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid ' + cardColor + '40' }}>
            {COMP_KEYS.map(key => {
              const comp = comps[key] as any;
              const sc = comp?.score != null ? Math.round(comp.score) : '—';
              return (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-gray-600">{COMP_LABELS[key]} <span className="text-gray-400">({Math.round(Number(comp?.weight ?? 0) * 100)}%)</span></span>
                  <span className="font-semibold" style={{ color: compScoreColor(comp?.score) }}>
                    {sc} <span className="text-gray-400">· {comp?.tier ?? '—'}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
          );
        })()}

        {/* Rank card */}
        <button type="button" onClick={() => setShowRankings(true)} title="View full rankings"
          className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center hover:border-brand-secondary hover:bg-blue-50 transition-colors group relative">
          {rankLoading && (
            <svg className="absolute top-2 right-2 w-3.5 h-3.5 animate-spin text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          <div className="text-xs text-gray-500 mb-1">Audience Quality Rank</div>
          {cardRank
            ? <><div className="text-3xl font-bold text-brand-secondary">#{cardRank}</div><div className="text-xs text-gray-400">of {cardTotal} conferences</div></>
            : <><div className="text-sm font-semibold text-gray-500">Not ranked</div><div className="text-xs text-gray-400">Needs 2+ conferences.</div></>
          }
          <div className="text-[10px] text-gray-400 mt-1.5 group-hover:text-brand-secondary">View all →</div>
        </button>

        {/* Net-new contacts card */}
        <div className="rounded-xl p-3" style={{ border: '1.5px solid #534AB7', background: '#EEEDFE' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold" style={{ color: '#534AB7' }}>Net-new contacts</span>
            <i className="ti ti-user-plus" style={{ color: '#534AB7', fontSize: 15 }} />
          </div>
          <div className="text-xs text-gray-500 mb-1">First time in Parlay</div>
          <div className="text-3xl font-bold" style={{ color: '#534AB7' }}>{fmtNum(m.net_new_contacts?.total)}</div>
          <div className="mt-2 pt-2 border-t space-y-0.5" style={{ borderColor: '#C4C0F0' }}>
            <div className="flex justify-between text-xs"><span style={{ color: '#534AB7' }}>From ICP companies</span><span className="font-semibold" style={{ color: '#534AB7' }}>{fmtNum(m.net_new_contacts?.icp_count)}</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: '#534AB7' }}>Decision makers</span><span className="font-semibold" style={{ color: '#534AB7' }}>{fmtNum(m.net_new_contacts?.decision_maker_count)}</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: '#534AB7' }}>Influencers</span><span className="font-semibold" style={{ color: '#534AB7' }}>{fmtNum(m.net_new_contacts?.influencer_count)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Non-ICP</span><span className="font-medium text-gray-600">{fmtNum(m.net_new_contacts?.non_icp_count)}</span></div>
          </div>
        </div>

        {/* Net-new companies card */}
        <div className="rounded-xl p-3" style={{ border: '1.5px solid #534AB7', background: '#EEEDFE' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold" style={{ color: '#534AB7' }}>Net-new companies</span>
            <i className="ti ti-building-plus" style={{ color: '#534AB7', fontSize: 15 }} />
          </div>
          <div className="text-xs text-gray-500 mb-1">No prior relationship history</div>
          <div className="text-3xl font-bold" style={{ color: '#534AB7' }}>{fmtNum(m.net_new_companies?.total)}</div>
          <div className="mt-2 pt-2 border-t space-y-0.5" style={{ borderColor: '#C4C0F0' }}>
            <div className="flex justify-between text-xs"><span style={{ color: '#534AB7' }}>ICP-matching</span><span className="font-semibold" style={{ color: '#534AB7' }}>{fmtNum(m.net_new_companies?.icp_count)} ({m.net_new_companies?.icp_pct ?? 0}%)</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: '#534AB7' }}>With follow-up</span><span className="font-semibold" style={{ color: '#534AB7' }}>{fmtNum(m.net_new_companies?.with_followup)}</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: '#534AB7' }}>With meeting held</span><span className="font-semibold" style={{ color: '#534AB7' }}>{fmtNum(m.net_new_companies?.with_meeting)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Non-ICP</span><span className="font-medium text-gray-600">{fmtNum(m.net_new_companies?.non_icp_count)}</span></div>
          </div>
        </div>
      </div>

      {/* ── KPI tiles ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-xs text-gray-500">ICP companies engaged</div>
          <div className="text-lg font-bold text-brand-secondary">{fmtNum(m.kpis?.icp_companies_engaged)} / {fmtNum(m.kpis?.icp_companies_attending)}</div>
          <div className="text-xs text-gray-400">{fmtPct(m.kpis?.icp_coverage_rate)} coverage</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-xs text-gray-500">Decision makers reached</div>
          <div className="text-lg font-bold text-brand-secondary">{fmtNum(m.kpis?.decision_makers_reached)}</div>
          <div className="text-xs text-gray-400">{fmtNum(m.kpis?.decision_makers_via_meeting)} meeting · {fmtNum(m.kpis?.decision_makers_via_touchpoint)} touchpoint</div>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-xs text-gray-500">Buying signals captured</div>
          <div className="text-lg font-bold" style={{ color: insightsAvailable ? '#1D9E75' : '#9CA3AF' }}>
            {insightsAvailable ? fmtNum(m.kpis?.buying_signals_count) : '—'}
          </div>
          {insightsAvailable
            ? <div className="text-xs text-gray-400">{fmtNum(m.kpis?.buying_signals_across_meetings)} meetings</div>
            : <div className="text-xs" style={{ color: '#d97706' }}>Add via notetaker</div>
          }
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-xs text-gray-500">Follow-up completion</div>
          <div className="text-lg font-bold text-brand-secondary">{fmtPct(m.kpis?.followup_completion_rate)}</div>
          <div className="text-xs text-gray-400">{fmtNum(m.kpis?.followup_completed)} of {fmtNum(m.kpis?.followup_total)} tasks done</div>
        </div>
      </div>

      {/* ── Component cards: 3-col row 1, then Market Intel + Engagement Momentum ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ICP Coverage Rate */}
        {(() => {
          const comp = comps.icp_coverage_rate as any ?? {};
          const sc = Number(comp.score ?? 0);
          const det = m.icp_coverage_detail ?? {};
          return (
            <div className="card p-4">
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-sm font-semibold text-brand-primary">ICP Coverage Rate</h3>
                <span className="text-xs font-semibold" style={{ color: compScoreColor(sc) }}>{sc} · {comp.tier ?? '—'}</span>
              </div>
              <ProgressBar score={sc} color={compScoreColor(sc)} />
              <DetailRow label="ICP companies attending" value={fmtNum(det.icp_attending)} />
              <DetailRow label="ICP companies engaged" value={fmtNum(det.icp_engaged)} />
              <DetailRow label="Coverage rate" value={fmtPct(det.coverage_rate)} valueColor={compScoreColor(sc)} />
              <div className="flex justify-between text-xs py-1 border-b border-gray-50">
                <span className="text-gray-500 flex items-center gap-1">
                  Rep-adjusted benchmark
                  {det.benchmark_is_rep_adjusted && (
                    <span
                      className="text-gray-400 cursor-help"
                      title={`Benchmark adjusted for ${det.reps_count} rep${det.reps_count !== 1 ? 's' : ''} over ${det.days_count} day${det.days_count !== 1 ? 's' : ''} covering ${det.icp_attending} ICP companies. Industry average is 30% but rep bandwidth limits realistic coverage to ${Math.round(det.rep_adjusted_benchmark ?? 30)}%.`}
                    >
                      <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                  )}
                </span>
                <span className="font-medium">
                  {det.benchmark_is_rep_adjusted
                    ? `~${Math.round(det.rep_adjusted_benchmark ?? 30)}% (rep-adjusted)`
                    : '~30% avg (industry)'}
                </span>
              </div>
              <DetailRow
                label="Coverage vs benchmark"
                value={det.coverage_ratio != null ? `${Math.round(det.coverage_ratio)}% of benchmark` : '—'}
                valueColor={(det.coverage_ratio ?? 0) >= 100 ? '#059669' : '#d97706'}
              />
              <DetailRow label="ICP companies missed" value={fmtNum(det.icp_missed)} valueColor="#dc2626" />
            </div>
          );
        })()}

        {/* Buyer Access Quality */}
        {(() => {
          const comp = comps.buyer_access_quality as any ?? {};
          const sc = Number(comp.score ?? 0);
          const det = m.buyer_access_detail ?? {};
          return (
            <div className="card p-4">
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-sm font-semibold text-brand-primary">Buyer Access Quality</h3>
                <span className="text-xs font-semibold" style={{ color: compScoreColor(sc) }}>{sc} · {comp.tier ?? '—'}</span>
              </div>
              <ProgressBar score={sc} color={compScoreColor(sc)} />
              <DetailRow label="Decision makers via meeting" value={fmtNum(det.dm_via_meeting)} />
              <DetailRow label="Decision makers via touchpoint" value={fmtNum(det.dm_via_touchpoint)} />
              <DetailRow label="Influencers reached" value={fmtNum(det.influencers_reached)} />
              <DetailRow label="ICP companies with no DM access" value={fmtNum(det.icp_companies_no_dm)} valueColor="#dc2626" />
            </div>
          );
        })()}

        {/* Conversation Quality Signal */}
        {(() => {
          const comp = comps.conversation_quality_signal as any ?? {};
          const sc = Number(comp.score ?? 0);
          const det = m.conversation_quality_detail ?? {};
          const noData = !insightsAvailable;
          return (
            <div className={`card p-4`} style={noData ? { background: '#FAEEDA', border: '1px solid #FCD34D' } : undefined}>
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-sm font-semibold" style={{ color: noData ? '#92400E' : undefined }}>Conversation Quality Signal</h3>
                <span className="text-xs font-semibold" style={{ color: noData ? '#d97706' : compScoreColor(sc) }}>
                  {sc} · {noData ? 'Neutral — no insight data yet' : (comp.tier ?? '—')}
                </span>
              </div>
              <ProgressBar score={sc} color={noData ? '#FCD34D' : compScoreColor(sc)} />
              <DetailRow label="Buying signals per meeting" value={noData ? '— no data' : String(det.buying_signals_per_meeting ?? '—')} />
              <DetailRow label="Meetings with pain points logged" value={noData ? '— no data' : `${fmtNum(det.meetings_with_pain_points)} / ${fmtNum(det.meetings_held)}`} />
              <DetailRow label="Booth sentiment (positive %)" value={noData ? '— no data' : (det.booth_sentiment_pct != null ? fmtPct(det.booth_sentiment_pct) : '—')} />
              {noData && <div className="mt-2 text-[10px]" style={{ color: '#92400E' }}>Use the meeting notetaker to log pain points and buying signals to activate this component.</div>}
            </div>
          );
        })()}

        {/* Market Intelligence Yield */}
        {(() => {
          const comp = comps.market_intelligence_yield as any ?? {};
          const sc = Number(comp.score ?? 0);
          const det = m.market_intelligence_detail ?? {};
          const noData = !painPointsAvailable;
          return (
            <div className="card p-4" style={noData ? { background: '#FAEEDA', border: '1px solid #FCD34D' } : undefined}>
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-sm font-semibold" style={{ color: noData ? '#92400E' : undefined }}>Market Intelligence Yield</h3>
                <span className="text-xs font-semibold" style={{ color: noData ? '#d97706' : compScoreColor(sc) }}>
                  {sc} · {noData ? 'Neutral — no insight data yet' : (comp.tier ?? '—')}
                </span>
              </div>
              <ProgressBar score={sc} color={noData ? '#FCD34D' : compScoreColor(sc)} />
              <DetailRow label="Distinct pain point themes" value={noData ? '— no data' : fmtNum(det.distinct_pain_point_themes)} />
              <DetailRow label="Meetings with pain points" value={noData ? '— no data' : `${fmtNum(det.meetings_with_pain_points)} / ${fmtNum(det.meetings_held)}`} />
              <DetailRow label="Top theme concentration" value={noData ? '— no data' : fmtPct(det.top_theme_concentration_pct)} />
              {noData && <div className="mt-2 text-[10px]" style={{ color: '#92400E' }}>Log pain points in the meeting notetaker to activate market intelligence scoring.</div>}
            </div>
          );
        })()}

        {/* Engagement Momentum — spans 2 columns in the 3-col grid */}
        {(() => {
          const comp = comps.engagement_momentum as any ?? {};
          const sc = Number(comp.score ?? 0);
          return (
            <div className="card p-4 lg:col-span-2">
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-sm font-semibold text-brand-primary">Engagement Momentum</h3>
                <span className="text-xs font-semibold" style={{ color: compScoreColor(sc) }}>{sc} · {comp.tier ?? '—'}</span>
              </div>
              <ProgressBar score={sc} color={compScoreColor(sc)} />
              {comp.completion_window_open && (
                <div className="text-[11px] rounded px-2 py-1 mb-2" style={{ background: '#FEF3C7', color: '#92400E' }}>
                  Follow-up completion window still open — conference ended less than 7 days ago.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Follow-up Creation</div>
                  <DetailRow label="ICP companies engaged" value={fmtNum(mom.icp_companies_engaged)} />
                  <DetailRow label="ICP companies with follow-up" value={fmtNum(mom.icp_companies_with_followup)} />
                  <DetailRow label="Creation rate" value={fmtPct(mom.followup_creation_rate)} valueColor={compScoreColor(sc)} />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Follow-up Completion</div>
                  <DetailRow label="Total follow-ups" value={fmtNum(mom.followups_total)} />
                  <DetailRow label="Completed" value={fmtNum(mom.followups_completed)} />
                  <DetailRow label="Completion rate" value={fmtPct(mom.followup_completion_rate)} valueColor={compScoreColor(sc)} />
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Account-level table ────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-brand-primary">Account-level Audience Quality</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setTableFilter('net_new')}
              className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
              style={tableFilter === 'net_new' ? { background: '#534AB7', color: '#fff' } : { background: '#F3F4F6', color: '#6B7280' }}
            >Net-new only</button>
            <button
              onClick={() => setTableFilter('all')}
              className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
              style={tableFilter === 'all' ? { background: '#534AB7', color: '#fff' } : { background: '#F3F4F6', color: '#6B7280' }}
            >All accounts</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Company</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">DM reached</th>
                <th className="py-2 pr-3">Access depth</th>
                <th className="py-2 pr-3">Follow-up</th>
                <th className="py-2">Signals</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 50).map((r: any, idx: number) => (
                <tr key={idx} className="border-b border-gray-50">
                  <td className="py-2 pr-3 font-medium">{r.company ?? '—'}</td>
                  <td className="py-2 pr-3">
                    {r.is_net_new
                      ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#EEEDFE', color: '#534AB7' }}>Net-new</span>
                      : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: '#F3F4F6', color: '#6B7280' }}>Known</span>
                    }
                  </td>
                  <td className="py-2 pr-3">{r.dm_reached ? <span style={{ color: '#1D9E75' }}>Yes</span> : <span className="text-gray-400">No</span>}</td>
                  <td className="py-2 pr-3">{accessDepthPill(r.access_depth)}</td>
                  <td className="py-2 pr-3">{followupPill(r.followup_status)}</td>
                  <td className="py-2">{r.signals_count > 0 ? r.signals_count : <span className="text-gray-400">—</span>}</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-gray-400">No accounts to display.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showRankings && (
        <ConferenceRankingsModal
          title="Audience Quality Rankings"
          currentConferenceId={Number((data as any)?.conference?.id ?? 0)}
          metric="audience"
          onClose={() => setShowRankings(false)}
        />
      )}
    </div>
  );
}
