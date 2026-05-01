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

function CESColor(score: number) {
  if (score >= 70) return '#059669';
  if (score >= 40) return '#d97706';
  return '#dc2626';
}

interface DimRow {
  label: string;
  value: number;
  weight: string;
}

export function SummaryTab({ data }: { data: EffectivenessData }) {
  const { ces, engagement, pipeline } = data;

  const dims: DimRow[] = [
    { label: 'ICP & Target Quality',     value: ces.dim1_icp_target,      weight: '25%' },
    { label: 'Meeting Execution',         value: ces.dim2_meeting_exec,     weight: '20%' },
    { label: 'Pipeline Influence Index',  value: ces.dim3_pipeline_index,   weight: '20%' },
    { label: 'Engagement Breadth',        value: ces.dim4_breadth,          weight: '15%' },
    { label: 'Follow-up Execution',       value: ces.dim5_followup,         weight: '10%' },
    { label: 'Net-New Engaged',            value: ces.dim6_net_new,          weight: '10%' },
  ];

  function fmt$(n: number | null | undefined) {
    if (n == null) return '—';
    return '$' + Math.round(n).toLocaleString();
  }

  const totalPI = Number(pipeline.total_pipeline_influence ?? 0);
  const icpPI = Number(pipeline.icp_pipeline_influence ?? 0);
  const netPI = Number(pipeline.net_new_pipeline_influence ?? 0);
  const hiPI = Number(pipeline.high_engagement_influence ?? 0);

  const engd = Number(engagement.companies_engaged ?? 0);
  const total = Number(engagement.total_companies ?? 0);
  const tgtEngd = Number(engagement.target_companies_engaged ?? 0);
  const tgtTotal = Number(engagement.targets_total ?? 0);
  const icpEngd = Number(data.audience.icp_coverage.icp_companies_engaged ?? 0);
  const icpTotal = Number(data.audience.icp_coverage.icp_companies_total ?? 0);
  const held = Number(engagement.total_held ?? 0);
  const scheduled = Number(engagement.total_scheduled ?? 0);

  return (
    <div className="p-6 space-y-6">
      {/* CES Breakdown */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Conference Effectiveness Score</h3>
          <span className="text-3xl font-bold" style={{ color: CESColor(ces.score) }}>{ces.score}<span className="text-base font-normal text-gray-400">/100</span></span>
        </div>
        <ProgressBar value={ces.score} color={CESColor(ces.score)} />
        <div className="space-y-3 pt-1">
          {dims.map(d => (
            <div key={d.label}>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{d.label} <span className="text-gray-300">({d.weight})</span></span>
                <span className="font-semibold text-gray-700">{Math.round(d.value)}</span>
              </div>
              <ProgressBar value={d.value} color="#1B76BC" />
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline Influence Summary */}
      <div className="card p-5">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-4">Pipeline Influence Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total',      value: fmt$(totalPI) },
            { label: 'ICP',        value: fmt$(icpPI),  sub: totalPI > 0 ? `${Math.round(icpPI/totalPI*100)}%` : null },
            { label: 'Net-New',    value: fmt$(netPI),  sub: totalPI > 0 ? `${Math.round(netPI/totalPI*100)}%` : null },
            { label: 'Multi-Touch',value: fmt$(hiPI),   sub: totalPI > 0 ? `${Math.round(hiPI/totalPI*100)}%` : null },
          ].map(({ label, value, sub }) => (
            <div key={label} className="text-center rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="text-lg font-bold text-brand-secondary leading-tight">{value}</div>
              {sub && <div className="text-xs text-gray-400">{sub} of total</div>}
              <div className="text-xs font-medium text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Engagement Snapshot */}
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-2">Engagement Snapshot</h3>
        {[
          { label: 'Companies Engaged', val: engd, of: total,   pct: total > 0 ? Math.round(engd/total*100) : 0 },
          { label: 'Targets Engaged',   val: tgtEngd, of: tgtTotal, pct: tgtTotal > 0 ? Math.round(tgtEngd/tgtTotal*100) : 0 },
          { label: 'ICP Coverage',      val: icpEngd, of: icpTotal, pct: icpTotal > 0 ? Math.round(icpEngd/icpTotal*100) : 0 },
          { label: 'Meetings Held',     val: held, of: scheduled, pct: scheduled > 0 ? Math.round(held/scheduled*100) : 0 },
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
  );
}
