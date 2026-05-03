'use client';

import type { EffectivenessData } from '../ConferenceEffectivenessModal';

type RepRow = Record<string, unknown>;
type RiskStatus = 'healthy' | 'watch' | 'risk' | 'unavailable';

function fmtPct(v: number | null | undefined) { return v == null || isNaN(v) ? '—' : `${Math.round(v)}%`; }
function fmtNum(v: number | null | undefined) { return v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString(); }
function fmt$(v: number | null | undefined) { return v == null || isNaN(v) ? '—' : `$${Math.round(v).toLocaleString()}`; }
function color(score: number | null | undefined) { const s = Number(score ?? 0); if (s >= 90) return '#059669'; if (s >= 75) return '#1B76BC'; if (s >= 60) return '#d97706'; if (s >= 50) return '#f97316'; return '#dc2626'; }

const RISK_META: Record<RiskStatus, { label: string; short: string; bg: string; text: string }> = {
  healthy: { label: 'Healthy', short: 'H', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  watch: { label: 'Watch', short: 'W', bg: 'bg-amber-100', text: 'text-amber-800' },
  risk: { label: 'Risk', short: 'R', bg: 'bg-red-100', text: 'text-red-800' },
  unavailable: { label: 'Unavailable', short: '—', bg: 'bg-slate-100', text: 'text-slate-500' },
};

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('') || '—';
}

export function SalesExecutionTab({ data }: { data: EffectivenessData }) {
  const sx = data.sales_execution;
  const reps = (data.pipeline.rep_attribution ?? []) as RepRow[];
  if (!sx) return <div className="p-6 text-sm text-gray-500">Sales execution data unavailable.</div>;

  const repPlot = reps.map((r) => {
    const repName = String(r.rep ?? 'Unknown Rep');
    const meetingsHeld = Number(r.meetings_held ?? 0);
    const touchpoints = Number(r.touchpoints ?? 0);
    const salesActivities = meetingsHeld + touchpoints;
    const pipelineInfluence = Number(r.pipeline_influence_attributed ?? 0);
    const companiesEngaged = Number(r.unique_companies_met ?? 0);
    const meetingsScheduled = Number(r.meetings_scheduled ?? 0);
    const holdRate = meetingsScheduled > 0 ? (meetingsHeld / meetingsScheduled) * 100 : null;
    const followupRate = Number(r.followup_completion_rate ?? NaN);
    const targetAccountsEngaged = Number(r.target_accounts_engaged ?? NaN);
    const targetAccountsAssigned = Number(r.target_accounts_assigned ?? NaN);
    const targetEngagementRate = Number.isFinite(targetAccountsEngaged) && Number.isFinite(targetAccountsAssigned) && targetAccountsAssigned > 0
      ? (targetAccountsEngaged / targetAccountsAssigned) * 100
      : Number(r.target_engagement_rate ?? NaN);
    const pipelinePerActivity = salesActivities > 0 ? pipelineInfluence / salesActivities : null;
    return {
      repName,
      initials: getInitials(repName),
      meetingsHeld,
      touchpoints,
      salesActivities,
      pipelineInfluence,
      companiesEngaged,
      meetingsScheduled,
      holdRate,
      followupRate: Number.isFinite(followupRate) ? followupRate : null,
      targetAccountsEngaged: Number.isFinite(targetAccountsEngaged) ? targetAccountsEngaged : null,
      targetEngagementRate: Number.isFinite(targetEngagementRate) ? targetEngagementRate : null,
      pipelinePerActivity,
    };
  }).filter((r) => Number.isFinite(r.salesActivities) && Number.isFinite(r.pipelineInfluence));

  const avgActivity = repPlot.length > 0 ? repPlot.reduce((a, r) => a + r.salesActivities, 0) / repPlot.length : 0;
  const avgPipeline = repPlot.length > 0 ? repPlot.reduce((a, r) => a + r.pipelineInfluence, 0) / repPlot.length : 0;
  const avgTargetEngagement = repPlot.filter((r) => r.targetEngagementRate != null).reduce((a, r, _, arr) => a + (r.targetEngagementRate ?? 0) / Math.max(arr.length, 1), 0);
  const avgPipelinePerActivity = repPlot.filter((r) => r.pipelinePerActivity != null).reduce((a, r, _, arr) => a + (r.pipelinePerActivity ?? 0) / Math.max(arr.length, 1), 0);

  const repWithQuadrant = repPlot.map((rep) => {
    let quadrant = 'Low Impact';
    if (rep.salesActivities >= avgActivity && rep.pipelineInfluence >= avgPipeline) quadrant = 'Top Performers';
    else if (rep.salesActivities >= avgActivity && rep.pipelineInfluence < avgPipeline) quadrant = 'Busy, Low Yield';
    else if (rep.salesActivities < avgActivity && rep.pipelineInfluence >= avgPipeline) quadrant = 'Strategic, Under-Leveraged';
    return { ...rep, quadrant };
  });

  const chartEmpty = repWithQuadrant.length < 2 || (avgActivity === 0 && avgPipeline === 0);

  const riskStatus = (value: RiskStatus[]) => value.reduce((a, s) => a + (s === 'risk' ? 2 : s === 'watch' ? 1 : 0), 0);
  const riskRows = repWithQuadrant.map((rep) => {
    const lowHoldRate: RiskStatus = rep.meetingsScheduled <= 0
      ? 'unavailable'
      : rep.meetingsScheduled >= 3 && (rep.holdRate ?? 0) < 50 ? 'risk' : (rep.holdRate ?? 0) < 65 ? 'watch' : 'healthy';
    const lowFollowup: RiskStatus = rep.followupRate == null ? 'unavailable' : rep.followupRate < 50 ? 'risk' : rep.followupRate < 70 ? 'watch' : 'healthy';
    const lowTarget: RiskStatus = rep.targetEngagementRate == null ? 'unavailable' : (rep.targetAccountsEngaged ?? 0) === 0 && rep.salesActivities > 0 ? 'risk' : rep.targetEngagementRate < avgTargetEngagement ? 'watch' : 'healthy';
    const lowPipelinePerActivity: RiskStatus = rep.pipelinePerActivity == null || avgPipelinePerActivity <= 0
      ? 'unavailable'
      : rep.pipelinePerActivity < avgPipelinePerActivity * 0.5 ? 'risk' : rep.pipelinePerActivity < avgPipelinePerActivity * 0.85 ? 'watch' : 'healthy';
    const lowActivity: RiskStatus = avgActivity <= 0
      ? 'unavailable'
      : rep.salesActivities < avgActivity * 0.5 ? 'risk' : rep.salesActivities < avgActivity * 0.85 ? 'watch' : 'healthy';
    const statuses = [lowHoldRate, lowFollowup, lowTarget, lowPipelinePerActivity, lowActivity] as RiskStatus[];
    return { rep, statuses, score: riskStatus(statuses) };
  }).sort((a, b) => b.score - a.score || a.rep.repName.localeCompare(b.rep.repName));

  const riskEmpty = riskRows.length < 2;

  return <div className="p-6 space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="sm:col-span-2 rounded-xl p-4" style={{ backgroundColor: color(sx.sales_effectiveness_score) + '15', borderLeft: `4px solid ${color(sx.sales_effectiveness_score)}` }}>
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Sales Effectiveness Score</div>
        <div className="flex items-end gap-1"><div className="text-4xl font-bold" style={{ color: color(sx.sales_effectiveness_score) }}>{sx.sales_effectiveness_score ?? '—'}</div><div className="text-sm text-gray-400 mb-0.5">/100</div></div>
        <div className="text-xs font-semibold" style={{ color: color(sx.sales_effectiveness_score) }}>{sx.sales_effectiveness_interpretation ?? 'Not scored'}</div>
        <div className="hidden lg:block" aria-hidden="true" />
    </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center">
        <div className="text-xs text-gray-500 font-medium mb-1">Sales Execution Rank</div>
        {sx.sales_execution_rank ? <><div className="text-3xl font-bold text-brand-secondary">#{sx.sales_execution_rank}</div><div className="text-xs text-gray-400">of {sx.sales_execution_rank_total} conferences</div></> : <><div className="text-sm font-semibold text-gray-500">Not ranked</div><div className="text-xs text-gray-400">Ranking requires at least two scored conferences.</div></>}
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {[['Meeting Hold Rate', fmtPct(sx.kpis.meeting_hold_rate)], ['Follow-up Completion', fmtPct(sx.kpis.followup_completion_rate)], ['Follow-up Attachment', fmtPct(sx.kpis.followup_attachment_rate)], ['Pipeline / Meeting', fmt$(sx.kpis.pipeline_per_meeting)], ['Pipeline / Company', fmt$(sx.kpis.pipeline_per_company)], ['Avg Influenced Deal', fmt$(sx.kpis.average_influenced_deal_size)]].map(([l,v]) => <div key={String(l)} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><div className="text-xs text-gray-500">{l}</div><div className="text-lg font-bold text-brand-secondary">{v}</div></div>)}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-[320px_480px_minmax(0,1fr)] gap-6 items-start">
      <div className="card p-5 w-full lg:w-[320px] flex flex-col">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Rep Execution Quadrant</h3>
        <p className="text-xs text-gray-500 mb-3">Sales activity vs. pipeline influence</p>
        {chartEmpty ? <div className="text-xs text-gray-500">Not enough rep-level activity and pipeline data to plot this view.</div> : <>
          <div className="relative w-full h-[320px] rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <rect x="0" y="0" width="50" height="50" fill="#f8fafc" />
              <rect x="50" y="0" width="50" height="50" fill="#f0f9ff" />
              <rect x="0" y="50" width="50" height="50" fill="#f8fafc" />
              <rect x="50" y="50" width="50" height="50" fill="#fff7ed" />
              <line x1="0" y1="50" x2="100" y2="50" stroke="#94a3b8" strokeDasharray="2 2" />
              <line x1="50" y1="0" x2="50" y2="100" stroke="#94a3b8" strokeDasharray="2 2" />
              {repWithQuadrant.map((rep, idx) => {
                const maxX = Math.max(...repWithQuadrant.map((r) => r.salesActivities), avgActivity) || 1;
                const maxY = Math.max(...repWithQuadrant.map((r) => r.pipelineInfluence), avgPipeline) || 1;
                const x = 8 + (rep.salesActivities / maxX) * 84 + ((idx % 3) - 1) * 0.7;
                const y = 92 - (rep.pipelineInfluence / maxY) * 84 + ((idx % 2) - 0.5) * 0.7;
                return <g key={rep.repName}>
                  <circle cx={x} cy={y} r="3.2" fill="#1B76BC" fillOpacity="0.85">
                    <title>{`${rep.repName} · Activity ${fmtNum(rep.salesActivities)} · Pipeline ${fmt$(rep.pipelineInfluence)} · ${rep.quadrant}`}</title>
                  </circle>
                  <text x={x} y={y + 0.9} textAnchor="middle" fontSize="2.5" fill="white" fontWeight="700">{rep.initials}</text>
                </g>;
              })}
              <text x="74" y="10" fontSize="3" fill="#64748b">Top Performers</text>
              <text x="58" y="92" fontSize="3" fill="#64748b">Busy, Low Yield</text>
              <text x="2" y="10" fontSize="2.8" fill="#64748b">Strategic, Under-Leveraged</text>
              <text x="2" y="92" fontSize="3" fill="#64748b">Low Impact</text>
            </svg>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">Avg activity threshold: {fmtNum(avgActivity)} · Avg pipeline threshold: {fmt$(avgPipeline)}</div>
          <div className="mt-2 text-[11px] text-gray-500">{repWithQuadrant.filter((r) => r.quadrant === 'Top Performers').length} reps are above average on both activity and pipeline influence.</div>
        </>}
      </div>

      <div className="card p-5 w-full lg:w-[480px] overflow-x-auto flex flex-col">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Sales Execution Risk Heatmap</h3>
        <p className="text-xs text-gray-500 mb-3">Rep-level coaching risks</p>
        {riskEmpty ? <div className="text-xs text-gray-500">Not enough rep-level data to identify execution risks.</div> : <>
          <div className="min-w-[340px]">
            <div className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] gap-1 text-[11px] text-gray-500 mb-1">
              <div className="font-semibold">Rep</div><div>Hold Rate</div><div>Follow-up</div><div>Target</div><div>Pipe/Act</div><div>Activity</div>
            </div>
            {riskRows.map((row) => (
              <div key={row.rep.repName} className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] gap-1 mb-1 items-center">
                <div className="text-xs font-medium text-gray-700 truncate pr-1" title={row.rep.repName}>{row.rep.repName}</div>
                {row.statuses.map((status, i) => <div key={i} className={`h-7 rounded ${RISK_META[status].bg} ${RISK_META[status].text} flex items-center justify-center text-[11px] font-semibold`} title={RISK_META[status].label}>{RISK_META[status].short}</div>)}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">{(['healthy', 'watch', 'risk', 'unavailable'] as RiskStatus[]).map((s) => <div key={s} className="flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded-sm ${RISK_META[s].bg}`} />{RISK_META[s].label}</div>)}</div>
          <div className="mt-2 text-[11px] text-gray-500">{riskRows.filter((r) => r.statuses[1] === 'risk' || r.statuses[4] === 'risk').length} reps show follow-up or activity risk.</div>
        </>}
      </div>
    </div>
  </div>;
}
