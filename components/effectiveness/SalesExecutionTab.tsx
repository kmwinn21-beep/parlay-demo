'use client';

import type { EffectivenessData } from '../ConferenceEffectivenessModal';

function fmt$(n: number | null | undefined) {
  if (n == null || n === 0) return '—';
  return '$' + Math.round(n).toLocaleString();
}

function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(Math.round((value / Math.max(max, 1)) * 100), 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="h-1.5 rounded-full bg-brand-secondary" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SalesExecutionTab({ data }: { data: EffectivenessData }) {
  const { pipeline, engagement } = data;
  const repPipeline = (pipeline.rep_pipeline ?? []) as Record<string, unknown>[];
  const companyPipeline = (pipeline.company_pipeline ?? []) as Record<string, unknown>[];
  const repActivity = (data.operational.rep_activity ?? []) as Record<string, unknown>[];

  // Merge rep activity and pipeline attribution
  const repMap: Record<string, Record<string, unknown>> = {};
  for (const r of repActivity) {
    const rep = String(r.rep ?? '—');
    repMap[rep] = { ...r };
  }
  for (const r of repPipeline) {
    const rep = String(r.rep ?? '—');
    repMap[rep] = { ...repMap[rep], ...r };
  }
  const reps = Object.values(repMap).sort((a, b) => Number(b.meetings_held ?? 0) - Number(a.meetings_held ?? 0));

  const totalEngaged = Number(engagement.companies_engaged ?? 0);
  const hiEngage = Number(pipeline.high_engagement_companies ?? 0);
  const twoTouch = Number(pipeline.two_touch_companies ?? 0);
  const singleTouch = Number(pipeline.single_touch_companies ?? 0);

  const fuCreated = Number(engagement.total_followups_created ?? 0);
  const fuCompleted = Number(engagement.total_followups_completed ?? 0);
  const fuPct = fuCreated > 0 ? Math.round(fuCompleted / fuCreated * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Rep Performance */}
      <div className="card p-5">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Rep Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left pb-2 font-medium">Rep</th>
                <th className="text-center pb-2 font-medium">Held</th>
                <th className="text-center pb-2 font-medium">Sched.</th>
                <th className="text-center pb-2 font-medium">Companies</th>
                <th className="text-right pb-2 font-medium">Pipeline Influence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reps.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-gray-400 text-xs">No rep data yet</td></tr>
              )}
              {reps.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="py-2 font-medium text-gray-800">{String(r.rep ?? '—')}</td>
                  <td className="py-2 text-center text-gray-700">{String(r.meetings_held ?? 0)}</td>
                  <td className="py-2 text-center text-gray-500">{String(r.meetings_scheduled ?? 0)}</td>
                  <td className="py-2 text-center text-gray-500">{String(r.unique_companies_met ?? r.companies_met ?? 0)}</td>
                  <td className="py-2 text-right font-semibold text-brand-secondary">{fmt$(Number(r.pipeline_influence_attributed ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Engagement Quality */}
      <div className="card p-5">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Engagement Quality</h3>
        <div className="space-y-3">
          {[
            { label: 'Multi-Touch (3+ interactions)', val: hiEngage, total: totalEngaged },
            { label: 'Two-Touch',                     val: twoTouch, total: totalEngaged },
            { label: 'Single-Touch',                  val: singleTouch, total: totalEngaged },
          ].map(({ label, val, total }) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600">{label}</span>
                <span className="font-semibold text-gray-700">{val} <span className="text-gray-400">/ {total}</span></span>
              </div>
              <ProgressBar value={val} max={Math.max(total, 1)} />
            </div>
          ))}
        </div>
      </div>

      {/* Follow-up Completion */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Follow-up Completion</h3>
          <span className="text-sm font-bold text-brand-secondary">{fuCompleted}/{fuCreated} — {fuPct}%</span>
        </div>
        <ProgressBar value={fuPct} />
      </div>

      {/* Company Pipeline Table */}
      <div className="card p-5">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Pipeline Influence by Company</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left pb-2 font-medium">Company</th>
                <th className="text-center pb-2 font-medium">ICP</th>
                <th className="text-center pb-2 font-medium">Touches</th>
                <th className="text-center pb-2 font-medium">Mtg?</th>
                <th className="text-right pb-2 font-medium">Adj. Rate</th>
                <th className="text-right pb-2 font-medium">PI Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {companyPipeline.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-gray-400">No engaged companies yet</td></tr>
              )}
              {companyPipeline.map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="py-1.5 font-medium text-gray-800 max-w-[140px] truncate">{String(c.name ?? '—')}</td>
                  <td className="py-1.5 text-center">{c.icp === 'Yes' ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="py-1.5 text-center text-gray-600">{String(c.total_interactions ?? 0)}</td>
                  <td className="py-1.5 text-center">{Number(c.meetings_held ?? 0) > 0 ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="py-1.5 text-right text-gray-600">{c.adj_conv_rate_pct != null ? `${String(c.adj_conv_rate_pct)}%` : '—'}</td>
                  <td className="py-1.5 text-right font-semibold text-brand-secondary">{fmt$(Number(c.pipeline_influence_value ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
