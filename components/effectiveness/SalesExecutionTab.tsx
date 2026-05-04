'use client';

import { useState } from 'react';
import type { EffectivenessData } from '../ConferenceEffectivenessModal';
import { StrategyWeightNotice } from './StrategyWeightNotice';

type RepRow = Record<string, unknown>;
type RiskStatus = 'healthy' | 'watch' | 'risk' | 'unavailable';
type SalesRepScoreRow = {
  rep_name: string;
  meeting_execution_score: number | null;
  followup_execution_score: number | null;
  pipeline_influence_execution_score: number | null;
  target_account_execution_score: number | null;
  rep_productivity_score: number | null;
  sales_effectiveness_score: number | null;
  sales_effectiveness_tier: string | null;
};

function fmtPct(v: number | null | undefined) { return v == null || isNaN(v) ? '—' : `${Math.round(v)}%`; }
function fmtNum(v: number | null | undefined) { return v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString(); }
function fmt$(v: number | null | undefined) { return v == null || isNaN(v) ? '—' : `$${Math.round(v).toLocaleString()}`; }
function color(score: number | null | undefined) { const s = Number(score ?? 0); if (s >= 90) return '#059669'; if (s >= 75) return '#1B76BC'; if (s >= 60) return '#d97706'; if (s >= 50) return '#f97316'; return '#dc2626'; }
function tier(score: number | null | undefined) { if (score == null || !Number.isFinite(score)) return null; if (score >= 90) return 'Exceptional'; if (score >= 75) return 'Strong'; if (score >= 60) return 'Acceptable'; if (score >= 50) return 'Weak'; return 'Inefficient'; }

const RISK_META: Record<RiskStatus, { label: string; short: string; bg: string; text: string }> = {
  healthy: { label: 'Healthy', short: 'H', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  watch: { label: 'Watch', short: 'W', bg: 'bg-amber-100', text: 'text-amber-800' },
  risk: { label: 'Risk', short: 'R', bg: 'bg-red-100', text: 'text-red-800' },
  unavailable: { label: 'Unavailable', short: '—', bg: 'bg-slate-100', text: 'text-slate-500' },
};

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('') || '—';
}

function toTitleCaseLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}



function InfoButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-[10px] text-gray-500 hover:bg-gray-100"
      aria-label={title}
      title={title}
    >
      i
    </button>
  );
}
function fmtRepCurrency(v: number) {
  return `$${Math.round(v).toLocaleString()}`;
}

export function SalesExecutionTab({ data }: { data: EffectivenessData }) {
  const sx = data.sales_execution;
  const strategyLabel = (data as any).conference_strategy?.display_name || 'Not set';
  const reps = (data.pipeline.rep_attribution ?? []) as RepRow[];
  const [showHeatmapInfo, setShowHeatmapInfo] = useState(false);
  const [showQuadrantInfo, setShowQuadrantInfo] = useState(false);
  const [showScoreByRepInfo, setShowScoreByRepInfo] = useState(false);
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
    const followupHealthReason = r.followup_health_reason != null ? String(r.followup_health_reason) : null;
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
      followupHealthReason,
      targetAccountsEngaged: Number.isFinite(targetAccountsEngaged) ? targetAccountsEngaged : null,
      targetEngagementRate: Number.isFinite(targetEngagementRate) ? targetEngagementRate : null,
      targetHealthStatus: (r.target_health_status as RiskStatus | undefined) ?? null,
      targetHealthReason: r.target_health_reason != null ? String(r.target_health_reason) : null,
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
    const lowFollowup: RiskStatus = rep.followupRate == null ? 'unavailable' : rep.followupRate < 50 ? 'risk' : rep.followupRate < 75 ? 'watch' : 'healthy';
    const lowTarget: RiskStatus = rep.targetHealthStatus ?? (rep.targetEngagementRate == null ? 'unavailable' : (rep.targetAccountsEngaged ?? 0) === 0 && rep.salesActivities > 0 ? 'risk' : rep.targetEngagementRate < avgTargetEngagement ? 'watch' : 'healthy');
    const lowPipelinePerActivity: RiskStatus = rep.pipelinePerActivity == null || avgPipelinePerActivity <= 0
      ? 'unavailable'
      : rep.pipelinePerActivity < avgPipelinePerActivity * 0.5 ? 'risk' : rep.pipelinePerActivity < avgPipelinePerActivity * 0.85 ? 'watch' : 'healthy';
    const lowActivity: RiskStatus = avgActivity <= 0
      ? 'unavailable'
      : rep.salesActivities < avgActivity * 0.5 ? 'risk' : rep.salesActivities < avgActivity * 0.85 ? 'watch' : 'healthy';
    const statuses = [lowHoldRate, lowFollowup, lowTarget, lowPipelinePerActivity, lowActivity] as RiskStatus[];
    const statusReasons = [
      lowHoldRate === 'unavailable' ? 'No scheduled meetings for hold-rate analysis' : `${fmtNum(rep.meetingsHeld)} held of ${fmtNum(rep.meetingsScheduled)} scheduled`,
      rep.followupHealthReason ?? (lowFollowup === 'unavailable' ? 'No follow-ups assigned to this rep' : `${fmtPct(rep.followupRate)} follow-up completion`),
      rep.targetHealthReason ?? (lowTarget === 'unavailable' ? 'No conference-specific target assignment available' : `${fmtPct(rep.targetEngagementRate)} conference-target engagement`),
      lowPipelinePerActivity === 'unavailable' ? 'No pipeline/activity benchmark available' : `${fmt$(rep.pipelinePerActivity)} pipeline per activity`,
      lowActivity === 'unavailable' ? 'No rep activity benchmark available' : `${fmtNum(rep.salesActivities)} activities vs team average ${fmtNum(avgActivity)}`
    ];
    return { rep, statuses, statusReasons, score: riskStatus(statuses) };
  }).sort((a, b) => b.score - a.score || a.rep.repName.localeCompare(b.rep.repName));

  const riskEmpty = riskRows.length < 2;

  const totalPipelineInfluence = sx.pipeline_influence_by_rep?.total_pipeline_influence != null
    ? Number(sx.pipeline_influence_by_rep.total_pipeline_influence)
    : (sx.pipeline_quality?.total_pipeline_influence != null ? Number(sx.pipeline_quality.total_pipeline_influence) : null);
  const requiredPipelineAmount = sx.pipeline_influence_by_rep?.required_pipeline_amount != null
    ? Number(sx.pipeline_influence_by_rep.required_pipeline_amount)
    : null;
  const influencedPipelineGoalPercent = totalPipelineInfluence != null && requiredPipelineAmount != null && requiredPipelineAmount > 0
    ? (totalPipelineInfluence / requiredPipelineAmount) * 100
    : null;
  const influencedPipelineGoalWidthPercent = influencedPipelineGoalPercent == null
    ? null
    : Math.max(0, Math.min(influencedPipelineGoalPercent, 100));

  const pipelineInfluenceByRepRows = Array.isArray(sx.pipeline_influence_by_rep?.reps)
    ? (sx.pipeline_influence_by_rep.reps as Array<Record<string, unknown>>).map((rep) => ({
      rep_id: String(rep.rep_id ?? rep.rep_name ?? 'Unknown Rep'),
      rep_name: String(rep.rep_name ?? 'Unknown Rep'),
      pipeline_influence: Math.max(0, Number(rep.pipeline_influence ?? 0)),
      contribution_percent: Number(rep.contribution_percent ?? 0),
      bar_width_percent: Number(rep.bar_width_percent ?? 0),
    }))
    : repPlot
    .map((rep) => ({
      rep_id: rep.repName,
      rep_name: rep.repName,
      pipeline_influence: Number.isFinite(rep.pipelineInfluence) ? Math.max(rep.pipelineInfluence, 0) : 0,
    }))
    .sort((a, b) => b.pipeline_influence - a.pipeline_influence || a.rep_name.localeCompare(b.rep_name));

  const totalRepPipelineInfluence = pipelineInfluenceByRepRows.reduce((sum, rep) => sum + rep.pipeline_influence, 0);
  const maxRepPipelineInfluence = pipelineInfluenceByRepRows.length > 0 ? Math.max(...pipelineInfluenceByRepRows.map((rep) => rep.pipeline_influence)) : 0;

  const pipelineInfluenceByRep = pipelineInfluenceByRepRows.map((rep: any) => ({
    ...rep,
    contribution_percent: Number.isFinite(rep.contribution_percent) && rep.contribution_percent > 0 ? rep.contribution_percent : (totalRepPipelineInfluence > 0 ? (rep.pipeline_influence / totalRepPipelineInfluence) * 100 : 0),
    bar_width_percent: Number.isFinite(rep.bar_width_percent) && rep.bar_width_percent > 0 ? rep.bar_width_percent : (maxRepPipelineInfluence > 0 ? (rep.pipeline_influence / maxRepPipelineInfluence) * 100 : 0),
  }));

  const topPipelineInfluenceByRep = pipelineInfluenceByRep.slice(0, 6);
  const hiddenRepCount = Math.max(pipelineInfluenceByRep.length - topPipelineInfluenceByRep.length, 0);
  const showNoRepData = pipelineInfluenceByRep.length === 0;
  const showNoAttributedPipeline = pipelineInfluenceByRep.length > 0 && totalRepPipelineInfluence <= 0;

  const salesExecutionByRepRows: SalesRepScoreRow[] = repPlot.map((rep) => {
    const activity = rep.salesActivities;
    const meetingExecution = rep.meetingsScheduled > 0 && rep.holdRate != null ? Math.max(0, Math.min(rep.holdRate, 100)) : null;
    const followupExecution = rep.followupRate != null ? Math.max(0, Math.min(rep.followupRate, 100)) : null;
    const pipelineInfluenceExecution = rep.pipelinePerActivity != null && avgPipelinePerActivity > 0
      ? Math.max(0, Math.min((rep.pipelinePerActivity / avgPipelinePerActivity) * 100, 100))
      : null;
    const targetAccountExecution = rep.targetEngagementRate != null ? Math.max(0, Math.min(rep.targetEngagementRate, 100)) : null;
    const repProductivity = avgActivity > 0 ? Math.max(0, Math.min((activity / avgActivity) * 100, 100)) : null;

    const effectiveWeights = (sx.effective_weights ?? {}) as Record<string, number>;
    const components = [
      { key: 'meeting_execution', score: meetingExecution },
      { key: 'followup_execution', score: followupExecution },
      { key: 'pipeline_influence_execution', score: pipelineInfluenceExecution },
      { key: 'target_account_execution', score: targetAccountExecution },
      { key: 'rep_productivity', score: repProductivity },
    ];
    const available = components.filter((c) => c.score != null);
    const totalWeight = available.reduce((sum, c) => sum + Number(effectiveWeights[c.key] ?? 0), 0);
    const score = totalWeight > 0
      ? Math.round(available.reduce((sum, c) => sum + Number(c.score) * (Number(effectiveWeights[c.key] ?? 0) / totalWeight), 0))
      : null;

    return {
      rep_name: rep.repName,
      meeting_execution_score: meetingExecution,
      followup_execution_score: followupExecution,
      pipeline_influence_execution_score: pipelineInfluenceExecution,
      target_account_execution_score: targetAccountExecution,
      rep_productivity_score: repProductivity,
      sales_effectiveness_score: score,
      sales_effectiveness_tier: tier(score),
    };
  }).sort((a, b) => {
    if (a.sales_effectiveness_score == null && b.sales_effectiveness_score == null) return a.rep_name.localeCompare(b.rep_name);
    if (a.sales_effectiveness_score == null) return 1;
    if (b.sales_effectiveness_score == null) return -1;
    return b.sales_effectiveness_score - a.sales_effectiveness_score || a.rep_name.localeCompare(b.rep_name);
  });

  return <div className="p-6 space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-stretch">
      <div className="lg:col-span-2 rounded-xl p-4" style={{ backgroundColor: color(sx.sales_effectiveness_score) + '15', borderLeft: `4px solid ${color(sx.sales_effectiveness_score)}` }}>
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Sales Effectiveness Score</div>
        <div className="flex items-end gap-1"><div className="text-4xl font-bold" style={{ color: color(sx.sales_effectiveness_score) }}>{sx.sales_effectiveness_score ?? '—'}</div><div className="text-sm text-gray-400 mb-0.5">/100</div></div>
        <div className="text-xs font-semibold" style={{ color: color(sx.sales_effectiveness_score) }}>{sx.sales_effectiveness_interpretation ?? 'Not scored'}</div>
        <div className="mt-2 text-[11px] text-gray-500 text-right">Conference Strategy: {strategyLabel}</div><StrategyWeightNotice applied={(data as any).sales_execution?.strategy_modifier_applied || (data as any).marketing_audience?.strategy_modifier_applied || (data as any).operational?.cost_efficiency?.strategy_modifier_applied || (data as any).ces?.strategy_modifier_applied} strategyLabel={strategyLabel} />
        <div className="mt-3 pt-3 border-t border-current border-opacity-20 space-y-1.5">
          {Object.entries(sx.components ?? {}).map(([key, comp]: any) => (
            <div key={key} className="flex justify-between text-xs">
              <span className="text-gray-500">{toTitleCaseLabel(key)} <span className="text-gray-300">({Math.round((Number(comp.weight ?? 0)) * 100)}%)</span></span>
              <span className="font-semibold" style={{ color: color(comp.score) }}>{comp.score != null ? Math.round(Number(comp.score)) : '—'} <span className="text-gray-400">· {comp.tier ?? '—'}</span></span>
            </div>
          ))}
        </div>
      </div>
      <div className="lg:col-span-1 rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center">
        <div className="text-xs text-gray-500 font-medium mb-1">Sales Execution Rank</div>
        {sx.sales_execution_rank ? <><div className="text-3xl font-bold text-brand-secondary">#{sx.sales_execution_rank}</div><div className="text-xs text-gray-400">of {sx.sales_execution_rank_total} conferences</div></> : <><div className="text-sm font-semibold text-gray-500">Not ranked</div><div className="text-xs text-gray-400">Ranking requires at least two scored conferences.</div></>}
      </div>
      <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-4 overflow-x-auto flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Sales Execution Score by Rep</h3>
          <InfoButton onClick={() => setShowScoreByRepInfo((v) => !v)} title="Sales Execution Score Abbreviations" />
        </div>
        {showScoreByRepInfo && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-700 shadow-sm space-y-1">
            <div className="font-semibold text-slate-900">Sales Execution Score Abbreviations</div>
            <div>Mtg = Meeting Execution</div>
            <div>FU = Follow-up Execution</div>
            <div>PI = Pipeline Influence Execution</div>
            <div>Tgt = Target Account Execution</div>
            <div>Prod = Rep Productivity</div>
            <div>Score = Final Sales Effectiveness Score for the rep</div>
            <p className="pt-1">These component scores roll up into each rep’s Sales Effectiveness Score using the active Sales Effectiveness Score weights. If strategy-adjusted weights are applied for the conference, those adjusted weights are used.</p>
          </div>
        )}
        <p className="text-xs text-gray-500 mb-3">Rep-level sales execution component scores</p>
        {salesExecutionByRepRows.length === 0 ? (
          <div className="text-xs text-gray-500">Not enough rep-level sales execution data to calculate scores.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-2 py-2 font-semibold text-gray-500">Rep</th><th className="text-center px-2 py-2 font-semibold text-gray-500">Mtg</th><th className="text-center px-2 py-2 font-semibold text-gray-500">FU</th><th className="text-center px-2 py-2 font-semibold text-gray-500">PI</th><th className="text-center px-2 py-2 font-semibold text-gray-500">Tgt</th><th className="text-center px-2 py-2 font-semibold text-gray-500">Prod</th><th className="text-right px-2 py-2 font-semibold text-gray-500">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {salesExecutionByRepRows.map((row) => {
                const dim = (v: number | null) => v == null ? <span className="text-gray-300">—</span> : <span className="font-medium text-gray-600">{Math.round(v)}</span>;
                return <tr key={row.rep_name} className="hover:bg-gray-50">
                  <td className="px-2 py-1 font-medium text-gray-800 whitespace-nowrap">{row.rep_name}</td>
                  <td className="px-2 py-1 text-center">{dim(row.meeting_execution_score)}</td>
                  <td className="px-2 py-1 text-center">{dim(row.followup_execution_score)}</td>
                  <td className="px-2 py-1 text-center">{dim(row.pipeline_influence_execution_score)}</td>
                  <td className="px-2 py-1 text-center">{dim(row.target_account_execution_score)}</td>
                  <td className="px-2 py-1 text-center">{dim(row.rep_productivity_score)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {row.sales_effectiveness_score == null ? <span className="text-gray-300">—</span> : <>
                      <span className="font-bold text-sm" style={{ color: color(row.sales_effectiveness_score) }}>{row.sales_effectiveness_score}</span>
                      <span className="text-xs text-gray-400 ml-1">· {row.sales_effectiveness_tier ?? '—'}</span>
                    </>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-4 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Pipeline Influence by Rep</div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Directional</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">Directional pipeline influence attributed to each rep</p>
        {showNoRepData ? (
          <div className="text-xs text-gray-500 mt-3">No rep-level pipeline influence available for this conference.</div>
        ) : showNoAttributedPipeline ? (
          <div className="text-xs text-gray-500 mt-3">No pipeline influence attributed yet.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {topPipelineInfluenceByRep.map((rep) => (
              <div key={rep.rep_id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="text-gray-700 truncate" title={rep.rep_name}>{rep.rep_name}</div>
                  <div className="text-gray-500 font-medium">{fmtRepCurrency(rep.pipeline_influence)} · {Math.round(rep.contribution_percent)}%</div>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-primary" style={{ width: `${Math.max(0, Math.min(rep.bar_width_percent, 100))}%` }} />
                </div>
              </div>
            ))}
            {hiddenRepCount > 0 && <div className="text-[11px] text-gray-400">+{hiddenRepCount} more reps</div>}
          </div>
        )}
        <div className="py-5 mt-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-brand-primary">Influenced Pipeline vs Goal</div>
          </div>
          {totalPipelineInfluence == null ? (
            <div className="text-[11px] text-gray-500 mt-1">Influenced pipeline unavailable</div>
          ) : (requiredPipelineAmount == null || requiredPipelineAmount <= 0) ? (
            <div className="text-[11px] text-gray-500 mt-1">Required pipeline goal not configured</div>
          ) : (
            <>
              <div className="text-[11px] text-gray-500 mt-1">{fmt$(totalPipelineInfluence)} actual</div>
              <div className="text-[11px] text-gray-500">{fmt$(requiredPipelineAmount)} goal</div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden mt-1">
                <div className="h-full rounded-full bg-red-500" style={{ width: `${influencedPipelineGoalWidthPercent ?? 0}%` }} />
              </div>
              <div className="text-[11px] text-gray-500 mt-1">{influencedPipelineGoalPercent == null ? '—' : `${influencedPipelineGoalPercent.toFixed(1)}%`} of goal</div>
            </>
          )}
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {[['Meeting Hold Rate', fmtPct(sx.kpis.meeting_hold_rate)], ['Follow-up Completion', fmtPct(sx.kpis.followup_completion_rate)], ['Follow-up Attachment', fmtPct(sx.kpis.followup_attachment_rate)], ['Pipeline / Meeting', fmt$(sx.kpis.pipeline_per_meeting)], ['Pipeline / Company', fmt$(sx.kpis.pipeline_per_company)], ['Avg Influenced Deal', fmt$(sx.kpis.average_influenced_deal_size)]].map(([l,v]) => <div key={String(l)} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><div className="text-xs text-gray-500">{l}</div><div className="text-lg font-bold text-brand-secondary">{v}</div></div>)}
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-stretch">
      <div className="card p-5 w-full lg:col-span-1 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Rep Execution Quadrant</h3>
          <button
            type="button"
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
            onClick={() => setShowQuadrantInfo((v) => !v)}
            title="About Rep Execution Quadrant"
            aria-label="About Rep Execution Quadrant"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Sales activity vs. pipeline influence</p>
        {showQuadrantInfo && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-700 shadow-sm space-y-2">
            <div className="font-semibold text-slate-900">Rep Execution Quadrant</div>
            <p>The Rep Execution Quadrant compares each rep’s sales activity against their directional pipeline influence. It helps sales leadership quickly identify which reps created strong commercial value, which reps were active but lower-yield, and which reps may have been under-leveraged at the conference.</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li><span className="font-semibold">Top Performers:</span> Reps with stronger activity and stronger pipeline influence relative to the team.<br /><span className="font-semibold">Why it matters:</span> These reps converted conference participation into meaningful commercial signal and may represent the behaviors to replicate at future events.</li>
              <li><span className="font-semibold">Strategic, Under-Leveraged:</span> Reps with stronger pipeline influence but lower activity volume.<br /><span className="font-semibold">Why it matters:</span> These reps may have touched high-value accounts or strategic opportunities, but there may have been missed capacity to engage more accounts or create more meetings/touchpoints.</li>
              <li><span className="font-semibold">Busy, Low Yield:</span> Reps with higher activity volume but lower pipeline influence.<br /><span className="font-semibold">Why it matters:</span> This can indicate that the rep was active but may have spent time with lower-fit accounts, lower-value conversations, or interactions that did not convert into meaningful pipeline signal.</li>
              <li><span className="font-semibold">Low Impact:</span> Reps with lower activity volume and lower pipeline influence.<br /><span className="font-semibold">Why it matters:</span> These reps may need better pre-conference planning, clearer target ownership, stronger onsite execution, or better follow-up discipline.</li>
            </ol>
          </div>
        )}
        {chartEmpty ? <div className="text-xs text-gray-500">Not enough rep-level activity and pipeline data to plot this view.</div> : <>
          <div className="relative w-full aspect-square rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
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
        </>}
      </div>

      <div className="card p-5 w-full lg:col-span-2 overflow-x-auto flex flex-col relative">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Sales Execution Risk Heatmap</h3>
          <button
            type="button"
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
            onClick={() => setShowHeatmapInfo((v) => !v)}
            title="About Sales Execution Risk Heatmap"
            aria-label="About Sales Execution Risk Heatmap"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Rep-level coaching risks</p>
        {showHeatmapInfo && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-700 shadow-sm space-y-2">
            <div className="font-semibold text-slate-900">Sales Execution Risk Heatmap</div>
            <p>The Sales Execution Risk Heatmap shows rep-level execution health across key sales behaviors. It is designed to help sales leadership identify where coaching or follow-up action may be needed after a conference.</p>
            <p><span className="font-semibold">Healthy:</span> performance is within an acceptable range · <span className="font-semibold">Watch:</span> performance may need attention · <span className="font-semibold">Risk:</span> performance is meaningfully below expectations · <span className="font-semibold">Unavailable:</span> not enough data exists to evaluate this metric.</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li><span className="font-semibold">Hold Rate:</span> Measures how effectively a rep converted scheduled meetings into held meetings. A low hold rate may indicate weak pre-conference qualification, poor onsite scheduling discipline, attendee no-shows, or a need for better meeting confirmation processes.</li>
              <li><span className="font-semibold">Follow-up:</span> Measures whether a rep completed the follow-ups created from conference interactions. Conference ROI often leaks after the event, and low follow-up completion means meaningful conversations may not be turning into next steps.</li>
              <li><span className="font-semibold">Target:</span> Measures whether the rep engaged assigned target accounts or strategically important accounts. This helps leadership confirm time was spent with the accounts that mattered most.</li>
              <li><span className="font-semibold">Pipe/Act:</span> Pipeline per Activity. Measures directional pipeline influence relative to total sales activity. Sales Activity = meetings held + touchpoints logged. This helps distinguish productive activity from low-yield activity.</li>
              <li><span className="font-semibold">Activity:</span> Measures whether the rep logged enough sales activity at the conference. Sales Activity = meetings held + touchpoints logged. This indicates whether the rep was sufficiently active to create commercial momentum.</li>
            </ol>
          </div>
        )}
        {riskEmpty ? <div className="text-xs text-gray-500">Not enough rep-level data to identify execution risks.</div> : <>
          <div className="min-w-[340px]">
            <div className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] gap-1 text-[11px] text-gray-500 mb-1">
              <div className="font-semibold">Rep</div><div>Hold Rate</div><div>Follow-up</div><div>Target</div><div>Pipe/Act</div><div>Activity</div>
            </div>
            {riskRows.map((row) => (
              <div key={row.rep.repName} className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] gap-1 mb-1 items-center">
                <div className="text-xs font-medium text-gray-700 truncate pr-1" title={row.rep.repName}>{row.rep.repName}</div>
                {row.statuses.map((status, i) => <div key={i} className={`h-7 rounded ${RISK_META[status].bg} ${RISK_META[status].text} flex items-center justify-center text-[11px] font-semibold`} title={row.statusReasons?.[i] ?? RISK_META[status].label}>{RISK_META[status].short}</div>)}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">{(['healthy', 'watch', 'risk', 'unavailable'] as RiskStatus[]).map((s) => <div key={s} className="flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded-sm ${RISK_META[s].bg}`} />{RISK_META[s].label}</div>)}</div>
          <div className="mt-2 text-[11px] text-gray-500">{riskRows.filter((r) => r.statuses[1] === 'risk' || r.statuses[4] === 'risk').length} reps show follow-up or activity risk.</div>
        </>}
      </div>
    </div>
  </div>
  </div>;
}
