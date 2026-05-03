'use client';

import type { EffectivenessData } from '../ConferenceEffectivenessModal';

function fmtPct(v: number | null | undefined) { return v == null || isNaN(v) ? '—' : `${Math.round(v)}%`; }
function fmtNum(v: number | null | undefined) { return v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString(); }
function fmt$(v: number | null | undefined) { return v == null || isNaN(v) ? '—' : `$${Math.round(v).toLocaleString()}`; }
function color(score: number | null | undefined) { const s = Number(score ?? 0); if (s >= 90) return '#059669'; if (s >= 75) return '#1B76BC'; if (s >= 60) return '#d97706'; if (s >= 50) return '#f97316'; return '#dc2626'; }

export function SalesExecutionTab({ data }: { data: EffectivenessData }) {
  const sx = data.sales_execution;
  const reps = (data.pipeline.rep_attribution ?? []) as Record<string, unknown>[];
  if (!sx) return <div className="p-6 text-sm text-gray-500">Sales execution data unavailable.</div>;

  return <div className="p-6 space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="sm:col-span-2 rounded-xl p-4" style={{ backgroundColor: color(sx.sales_effectiveness_score) + '15', borderLeft: `4px solid ${color(sx.sales_effectiveness_score)}` }}>
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Sales Effectiveness Score</div>
        <div className="flex items-end gap-1"><div className="text-4xl font-bold" style={{ color: color(sx.sales_effectiveness_score) }}>{sx.sales_effectiveness_score ?? '—'}</div><div className="text-sm text-gray-400 mb-0.5">/100</div></div>
        <div className="text-xs font-semibold" style={{ color: color(sx.sales_effectiveness_score) }}>{sx.sales_effectiveness_interpretation ?? 'Not scored'}</div>
        <div className="mt-3 pt-3 border-t border-current border-opacity-20 space-y-1.5">
          {Object.entries(sx.components ?? {}).map(([key, comp]: any) => (
            <div key={key} className="flex justify-between text-xs">
              <span className="text-gray-500">{key.replace(/_/g,' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} <span className="text-gray-300">({Math.round((Number(comp.weight ?? 0))*100)}%)</span></span>
              <span className="font-semibold" style={{ color: color(comp.score) }}>{comp.score ?? '—'} <span className="text-gray-400">· {comp.tier ?? '—'}</span></span>
            </div>
          ))}
        </div>

      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center">
        <div className="text-xs text-gray-500 font-medium mb-1">Sales Execution Rank</div>
        {sx.sales_execution_rank ? <><div className="text-3xl font-bold text-brand-secondary">#{sx.sales_execution_rank}</div><div className="text-xs text-gray-400">of {sx.sales_execution_rank_total} conferences</div></> : <><div className="text-sm font-semibold text-gray-500">Not ranked</div><div className="text-xs text-gray-400">Ranking requires at least two scored conferences.</div></>}
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {[['Meeting Hold Rate', fmtPct(sx.kpis.meeting_hold_rate)], ['Follow-up Completion', fmtPct(sx.kpis.followup_completion_rate)], ['Follow-up Attachment', fmtPct(sx.kpis.followup_attachment_rate)], ['Pipeline / Meeting', fmt$(sx.kpis.pipeline_per_meeting)], ['Pipeline / Company', fmt$(sx.kpis.pipeline_per_company)], ['Avg Influenced Deal', fmt$(sx.kpis.average_influenced_deal_size)]].map(([l,v]) => <div key={String(l)} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><div className="text-xs text-gray-500">{l}</div><div className="text-lg font-bold text-brand-secondary">{v}</div></div>)}
    </div>

    <div className="card p-5 overflow-x-auto">
      <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Rep Performance</h3>
      <table className="w-full text-xs min-w-[980px]"><thead><tr className="text-gray-400 uppercase border-b border-gray-100"><th className="text-left pb-2">Rep</th><th className="text-right pb-2">Held</th><th className="text-right pb-2">Sched.</th><th className="text-right pb-2">Hold %</th><th className="text-right pb-2">Touchpoints</th><th className="text-right pb-2">Companies</th><th className="text-right pb-2">Pipeline</th><th className="text-right pb-2">Pipeline/Meeting</th><th className="text-right pb-2">Contribution</th><th className="text-right pb-2">Coaching Flag</th></tr></thead>
      <tbody className="divide-y divide-gray-50">{reps.map((r, i) => { const held=Number(r.meetings_held??0); const sched=Number(r.meetings_scheduled??0); const hold=sched>0?held/sched*100:null; const tp=Number(r.touchpoints??0); const pi=Number(r.pipeline_influence_attributed??0); const contrib=Number(r.contribution_pct??0); const flag=hold!=null&&hold<50?'Low meeting hold rate':contrib>25?'Top contributor':'Under-leveraged'; return <tr key={i}><td className="py-2 font-medium">{String(r.rep ?? '—')}</td><td className="text-right">{held}</td><td className="text-right">{sched}</td><td className="text-right">{fmtPct(hold)}</td><td className="text-right">{tp}</td><td className="text-right">{fmtNum(Number(r.unique_companies_met??0))}</td><td className="text-right font-semibold text-brand-secondary">{fmt$(pi)}</td><td className="text-right">{fmt$(held>0?pi/held:null)}</td><td className="text-right">{fmtPct(contrib)}</td><td className="text-right">{flag}</td></tr>; })}</tbody></table>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card p-5 space-y-2"><h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Pipeline Quality</h3>
        <div className="text-xs text-gray-500">Total Pipeline Influence <span className="float-right font-semibold text-brand-secondary">{fmt$(sx.pipeline_quality.total_pipeline_influence)}</span></div>
        <div className="text-xs text-gray-500">Influenced Opportunities <span className="float-right">{fmtNum(sx.pipeline_quality.influenced_opportunity_count)}</span></div>
        <div className="text-xs text-gray-500">Largest Deal Concentration <span className="float-right">{fmtPct(sx.pipeline_quality.largest_deal_concentration != null ? sx.pipeline_quality.largest_deal_concentration*100 : null)}</span></div>
      </div>
      <div className="card p-5 space-y-2"><h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Follow-up Risk / Action Items</h3>
      {sx.followup_risks.map((r: any, i: number) => <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><div className="text-sm font-semibold text-gray-700">{r.count} {r.label}</div><div className="text-xs text-gray-500">{r.description}</div></div>)}
      </div>
    </div>
  </div>;
}
