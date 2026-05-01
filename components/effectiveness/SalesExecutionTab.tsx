'use client';

import type { EffectivenessData } from '../ConferenceEffectivenessModal';

function fmt$(n: unknown) {
  const v = n == null ? null : Number(n);
  if (v == null || isNaN(v) || v === 0) return '—';
  return '$' + Math.round(v).toLocaleString();
}

function MiniBar({ value, max, color = '#1B76BC' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(Math.round(value / max * 100), 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function EngagementBar({ value, max = 100, color = '#1B76BC' }: { value: number; max?: number; color?: string }) {
  const pct = max > 0 ? Math.min(Math.round(value / max * 100), 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export function SalesExecutionTab({ data }: { data: EffectivenessData }) {
  const { pipeline, engagement, ces } = data;
  const reps = (pipeline.rep_attribution ?? []) as {
    rep: string;
    meetings_held: number;
    meetings_scheduled: number;
    unique_companies_met: number;
    touchpoints: number;
    event_attendees: number;
    pipeline_influence_attributed: number;
    contribution_pct: number;
  }[];

  const companyPipeline = (pipeline.company_pipeline ?? []) as Record<string, unknown>[];
  const totalPI = Number(pipeline.total_pipeline_influence ?? 0);
  const targetPI = Number(ces.target_pipeline_influence ?? 0);
  const PLACEHOLDER_GOAL = targetPI > 0 ? targetPI : 5_000_000; // placeholder until goal modal built
  const totalPIBarPct = PLACEHOLDER_GOAL > 0 ? Math.min(Math.round(totalPI / PLACEHOLDER_GOAL * 100), 100) : 0;

  const fuCreated = Number(engagement.total_followups_created ?? 0);
  const fuCompleted = Number(engagement.total_followups_completed ?? 0);
  const fuPct = fuCreated > 0 ? Math.round(fuCompleted / fuCreated * 100) : 0;

  const totalEngaged = Number(engagement.companies_engaged ?? 0);
  const hiEngage = Number(pipeline.high_engagement_companies ?? 0);
  const twoTouch = Number(pipeline.two_touch_companies ?? 0);
  const singleTouch = Number(pipeline.single_touch_companies ?? 0);

  // Engagement snapshot data (moved from Summary tab)
  const tgtEngd  = Number(engagement.target_companies_engaged ?? 0);
  const tgtTotal = Number(engagement.targets_total ?? 0);
  const icpEngd  = Number(data.audience.icp_coverage.icp_companies_engaged ?? 0);
  const icpTotal = Number(data.audience.icp_coverage.icp_companies_total ?? 0);
  const held      = Number(engagement.total_held ?? 0);
  const scheduled = Number(engagement.total_scheduled ?? 0);
  const contactsEngaged = Number(engagement.contacts_engaged ?? 0);
  const operatorTotal   = Number(engagement.operator_contacts_total ?? 0);

  return (
    <div className="p-6 space-y-6">
      {/* Rep Performance */}
      <div className="card p-5">
        {/* Header row with total PI + bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Rep Performance</h3>
          <div className="flex flex-col sm:items-end gap-1 min-w-0 sm:max-w-[280px] w-full">
            <div className="flex items-center justify-between text-xs w-full">
              <span className="text-gray-500">Total Pipeline Influence</span>
              <span className="font-bold text-brand-secondary ml-2">{fmt$(totalPI)}</span>
            </div>
            <div className="w-full">
              <MiniBar value={totalPI} max={PLACEHOLDER_GOAL} color="#1B76BC" />
            </div>
            <span className="text-xs text-gray-400 self-end">
              {totalPIBarPct}% of {targetPI > 0 ? 'expected return target' : 'placeholder goal'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left pb-2 font-medium">Rep</th>
                <th className="text-center pb-2 font-medium">Held</th>
                <th className="text-center pb-2 font-medium">Sched.</th>
                <th className="text-center pb-2 font-medium">Touchpoints</th>
                <th className="text-center pb-2 font-medium">Event Att.</th>
                <th className="text-center pb-2 font-medium">Companies</th>
                <th className="text-right pb-2 font-medium pr-2">Contribution</th>
                <th className="text-right pb-2 font-medium">Pipeline Influence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reps.length === 0 && (
                <tr><td colSpan={8} className="py-4 text-center text-gray-400 text-xs">No rep data yet</td></tr>
              )}
              {reps.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="py-2 font-medium text-gray-800">{r.rep}</td>
                  <td className="py-2 text-center text-gray-700">{r.meetings_held}</td>
                  <td className="py-2 text-center text-gray-500">{r.meetings_scheduled}</td>
                  <td className="py-2 text-center text-gray-600">{r.touchpoints}</td>
                  <td className="py-2 text-center text-gray-600">{r.event_attendees}</td>
                  <td className="py-2 text-center text-gray-500">{r.unique_companies_met}</td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs font-semibold text-brand-secondary">{r.contribution_pct}%</span>
                      <div className="w-16">
                        <MiniBar value={r.contribution_pct} max={100} color="#1B76BC" />
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-right font-semibold text-brand-secondary">{fmt$(r.pipeline_influence_attributed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Engagement Snapshot + Engagement Quality side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <EngagementBar value={pct} color="#1B76BC" />
            </div>
          ))}
        </div>

        {/* Engagement Quality */}
        <div className="card p-5">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Engagement Quality</h3>
          <div className="space-y-3">
            {[
              { label: 'Multi-Touch (3+ interactions)', val: hiEngage,    total: totalEngaged },
              { label: 'Two-Touch',                     val: twoTouch,    total: totalEngaged },
              { label: 'Single-Touch',                  val: singleTouch, total: totalEngaged },
            ].map(({ label, val, total }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-semibold text-gray-700">{val} <span className="text-gray-400">/ {total}</span></span>
                </div>
                <MiniBar value={val} max={Math.max(total, 1)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Follow-up Completion */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Follow-up Completion</h3>
          <span className="text-sm font-bold text-brand-secondary">{fuCompleted}/{fuCreated} — {fuPct}%</span>
        </div>
        <MiniBar value={fuPct} max={100} />
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
