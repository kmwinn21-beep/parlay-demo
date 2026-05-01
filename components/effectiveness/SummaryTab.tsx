'use client';

import type { EffectivenessData } from '../ConferenceEffectivenessModal';

function ProgressBar({ value, max = 100, color = '#1B76BC' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function cesScoreColor(score: number) {
  if (score >= 70) return '#059669';
  if (score >= 50) return '#1B76BC';
  if (score >= 40) return '#d97706';
  if (score >= 25) return '#f97316';
  return '#dc2626';
}

function cesScoreGrade(score: number) {
  if (score >= 70) return 'Strong performance';
  if (score >= 50) return 'Acceptable performance';
  if (score >= 40) return 'Below target';
  if (score >= 25) return 'Weak performance';
  return 'Needs improvement';
}

function repCESColor(score: number) {
  if (score >= 90) return '#059669';
  if (score >= 75) return '#1B76BC';
  if (score >= 60) return '#d97706';
  if (score >= 50) return '#f97316';
  return '#dc2626';
}

const DIM_COLORS = ['#1B76BC', '#10b981', '#8b5cf6', '#0891b2', '#f97316', '#d97706', '#14b8a6'];

interface DimRow {
  label: string;
  value: number;
  weight: string;
}

export function SummaryTab({ data }: { data: EffectivenessData }) {
  const { ces, engagement, pipeline } = data;
  const repCESRows = (data.operational.rep_ces ?? []) as Record<string, unknown>[];
  const cesRank = data.operational.conf_efficiency_rank ?? null;
  const cesTotal = data.operational.conf_efficiency_total ?? null;

  const dims: DimRow[] = [
    { label: 'ICP & Target Quality',     value: ces.dim1_icp_target,              weight: '20%' },
    { label: 'Meeting Execution',         value: ces.dim2_meeting_exec,             weight: '20%' },
    { label: 'Pipeline Influence Index',  value: ces.dim3_pipeline_index,           weight: '30%' },
    { label: 'Engagement Breadth',        value: ces.dim4_breadth,                  weight: '5%'  },
    { label: 'Cost Efficiency',           value: ces.dim7_cost_efficiency ?? 0,     weight: '10%' },
    { label: 'Follow-up Execution',       value: ces.dim5_followup,                 weight: '10%' },
    { label: 'Net-New Engaged',           value: ces.dim6_net_new,                  weight: '5%'  },
  ];

  function fmt$(n: number | null | undefined) {
    if (n == null) return '—';
    return '$' + Math.round(n).toLocaleString();
  }

  const totalPI = Number(pipeline.total_pipeline_influence ?? 0);
  const icpPI = Number(pipeline.icp_pipeline_influence ?? 0);
  const netPI = Number(pipeline.net_new_pipeline_influence ?? 0);
  const hiPI = Number(pipeline.high_engagement_influence ?? 0);

  const tgtEngd = Number(engagement.target_companies_engaged ?? 0);
  const tgtTotal = Number(engagement.targets_total ?? 0);
  const icpEngd = Number(data.audience.icp_coverage.icp_companies_engaged ?? 0);
  const icpTotal = Number(data.audience.icp_coverage.icp_companies_total ?? 0);
  const held = Number(engagement.total_held ?? 0);
  const scheduled = Number(engagement.total_scheduled ?? 0);
  const contactsEngaged = Number(engagement.contacts_engaged ?? 0);
  const operatorTotal = Number(engagement.operator_contacts_total ?? 0);

  const scoreColor = cesScoreColor(ces.score);

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left column: CES score card + rank + dimension bars */}
        <div className="space-y-4">
          {/* Top row: score card (2/3) + rank card (1/3) */}
          <div className="grid grid-cols-3 gap-3">
            {/* CES Score card — 2/3 width */}
            <div
              className="col-span-2 rounded-xl p-4"
              style={{ backgroundColor: scoreColor + '15', borderLeft: `4px solid ${scoreColor}` }}
            >
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Conference Effectiveness Score</div>
              <div className="flex items-end gap-1">
                <div className="text-4xl font-bold leading-tight" style={{ color: scoreColor }}>{ces.score}</div>
                <div className="text-sm font-normal text-gray-400 mb-0.5">/100</div>
              </div>
              <div className="text-xs font-semibold mt-0.5" style={{ color: scoreColor }}>{cesScoreGrade(ces.score)}</div>
            </div>

            {/* Rank card — 1/3 width */}
            {cesRank != null && (
              <div className="col-span-1 rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center">
                <div className="text-xs text-gray-500 font-medium mb-1">Efficiency Rank</div>
                <div className="text-3xl font-bold text-brand-secondary leading-tight">#{cesRank}</div>
                {cesTotal != null && <div className="text-xs text-gray-400 mt-0.5">of {cesTotal} conferences</div>}
              </div>
            )}
          </div>

          {/* Dimension breakdown bars */}
          <div className="card p-5 space-y-3">
            {dims.map((d, i) => (
              <div key={d.label}>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{d.label} <span className="text-gray-300">({d.weight})</span></span>
                  <span className="font-semibold text-gray-700">{Math.round(d.value)}</span>
                </div>
                <ProgressBar value={d.value} color={DIM_COLORS[i]} />
              </div>
            ))}
          </div>
        </div>

        {/* Right column: Pipeline Summary + Rep CES + Engagement Snapshot */}
        <div className="space-y-4">
          {/* Pipeline Influence Summary */}
          <div className="card p-5">
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-4">Pipeline Influence Summary</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total',       value: fmt$(totalPI) },
                { label: 'ICP',         value: fmt$(icpPI),  sub: totalPI > 0 ? `${Math.round(icpPI / totalPI * 100)}%` : null },
                { label: 'Net-New',     value: fmt$(netPI),  sub: totalPI > 0 ? `${Math.round(netPI / totalPI * 100)}%` : null },
                { label: 'Multi-Touch', value: fmt$(hiPI),   sub: totalPI > 0 ? `${Math.round(hiPI / totalPI * 100)}%` : null },
              ].map(({ label, value, sub }) => (
                <div key={label} className="text-center rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="text-lg font-bold text-brand-secondary leading-tight">{value}</div>
                  {sub && <div className="text-xs text-gray-400">{sub} of total</div>}
                  <div className="text-xs font-medium text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Effectiveness Score by Rep */}
          <div className="card p-5">
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-4">Effectiveness Score by Rep</h3>
            {repCESRows.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No rep engagement data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-2 py-2 font-semibold text-gray-500">Rep</th>
                      <th className="text-center px-2 py-2 font-semibold text-gray-500" title="ICP & Target Quality">ICP</th>
                      <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Meeting Execution">Mtg</th>
                      <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Pipeline Influence Index">PI</th>
                      <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Engagement Breadth">Brd</th>
                      <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Cost Efficiency">Cost</th>
                      <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Follow-up Execution">FU</th>
                      <th className="text-center px-2 py-2 font-semibold text-gray-500" title="Net-New Engaged">NN</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-500">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {repCESRows.map((r, i) => {
                      const score = Number(r.rep_ces_score ?? 0);
                      const dim = (key: string) => {
                        const v = r[key];
                        if (v == null) return <span className="text-gray-300">—</span>;
                        return <span className="font-medium text-gray-600">{Math.round(Number(v))}</span>;
                      };
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-2 py-2 font-medium text-gray-800 whitespace-nowrap">{String(r.rep ?? '—')}</td>
                          <td className="px-2 py-2 text-center">{dim('rep_dim1_icp_target')}</td>
                          <td className="px-2 py-2 text-center">{dim('rep_dim2_meeting_exec')}</td>
                          <td className="px-2 py-2 text-center">{dim('rep_dim3_pipeline_index')}</td>
                          <td className="px-2 py-2 text-center">{dim('rep_dim4_breadth')}</td>
                          <td className="px-2 py-2 text-center">{dim('rep_dim5_cost_efficiency')}</td>
                          <td className="px-2 py-2 text-center">{dim('rep_dim6_followup')}</td>
                          <td className="px-2 py-2 text-center">{dim('rep_dim7_net_new')}</td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            <span className="font-bold text-sm" style={{ color: repCESColor(score) }}>{score}</span>
                            <span className="text-xs text-gray-400 ml-1">· {String(r.rep_ces_tier ?? '')}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-gray-400 mt-3 leading-tight">
                  ICP = ICP &amp; Target Quality · Mtg = Meeting Execution · PI = Pipeline Influence · Brd = Breadth · Cost = Cost Efficiency · FU = Follow-up · NN = Net-New
                </p>
              </div>
            )}
          </div>

          {/* Engagement Snapshot */}
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-2">Engagement Snapshot</h3>
            {[
              { label: 'Contacts Engaged', val: contactsEngaged, of: operatorTotal, pct: operatorTotal > 0 ? Math.round(contactsEngaged / operatorTotal * 100) : 0 },
              { label: 'Targets Engaged',  val: tgtEngd,         of: tgtTotal,      pct: tgtTotal > 0      ? Math.round(tgtEngd / tgtTotal * 100)           : 0 },
              { label: 'ICP Coverage',     val: icpEngd,         of: icpTotal,      pct: icpTotal > 0      ? Math.round(icpEngd / icpTotal * 100)           : 0 },
              { label: 'Meetings Held',    val: held,            of: scheduled,     pct: scheduled > 0     ? Math.round(held / scheduled * 100)             : 0 },
            ].map(({ label, val, of: total2, pct }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600 font-medium">{label}</span>
                  <span className="text-gray-500">{val}/{total2} <span className="font-semibold text-brand-secondary">{pct}%</span></span>
                </div>
                <ProgressBar value={pct} color="#1B76BC" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
