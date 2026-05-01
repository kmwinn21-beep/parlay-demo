'use client';

import type { EffectivenessData } from '../ConferenceEffectivenessModal';

function ProgressBar({ value, max = 100, color = '#1B76BC' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(Math.round((value / Math.max(max, 1)) * 100), 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export function AudienceMessagingTab({ data }: { data: EffectivenessData }) {
  const { audience } = data;
  const icp = audience.icp_coverage;
  const penetration = audience.account_penetration;
  const seniority = (audience.seniority_mix ?? []) as Record<string, unknown>[];
  const persona = (audience.persona_distribution ?? []) as Record<string, unknown>[];
  const netNew = audience.net_new_logos;

  const totalEngaged = Number(penetration.engaged_attendees ?? 0);
  const seniorityTotal = seniority.reduce((s, r) => s + Number(r.engaged_count ?? 0), 0);

  const SENIORITY_COLORS: Record<string, string> = {
    'C-Suite': '#1e3a5f',
    'BOD': '#1e4976',
    'VP/SVP': '#1B76BC',
    'VP Level': '#2d8fd5',
    'ED': '#3da8ee',
    'Director': '#5bbcf8',
    'Manager': '#93d5fb',
  };

  return (
    <div className="p-6 space-y-6">
      {/* ICP Coverage */}
      <div className="card p-5">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">ICP Coverage</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: 'ICP Companies', value: String(icp.icp_companies_total ?? '—') },
            { label: 'ICP Engaged',   value: String(icp.icp_companies_engaged ?? '—') },
            { label: 'Engagement Rate', value: icp.icp_company_engagement_pct != null ? `${icp.icp_company_engagement_pct}%` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="text-center rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="text-xl font-bold text-brand-secondary">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500">ICP Attendee Coverage</span>
            <span className="font-semibold text-brand-secondary">{icp.icp_attendee_coverage_pct ?? 0}%</span>
          </div>
          <ProgressBar value={Number(icp.icp_attendee_coverage_pct ?? 0)} />
        </div>
      </div>

      {/* Seniority Mix + Net-New */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Seniority Mix (Engaged)</h3>
          <div className="space-y-2">
            {seniority.filter(r => r.seniority && Number(r.engaged_count ?? 0) > 0).map((r, i) => {
              const sen = String(r.seniority ?? '');
              const cnt = Number(r.engaged_count ?? 0);
              const pct = seniorityTotal > 0 ? Math.round(cnt / seniorityTotal * 100) : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-gray-600 font-medium">{sen}</span>
                    <span className="text-gray-500">{cnt} <span className="text-gray-300">({pct}%)</span></span>
                  </div>
                  <ProgressBar value={cnt} max={seniorityTotal} color={SENIORITY_COLORS[sen] ?? '#1B76BC'} />
                </div>
              );
            })}
            {seniority.every(r => Number(r.engaged_count ?? 0) === 0) && (
              <p className="text-xs text-gray-400 italic">No seniority data yet</p>
            )}
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-2">Net-New Logos</h3>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-brand-secondary">{netNew.net_new_logos ?? 0}</span>
              <span className="text-sm text-gray-400 pb-1">({netNew.net_new_rate_pct ?? 0}% of engaged)</span>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-2">Account Penetration</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div><span className="block text-lg font-bold text-brand-secondary">{penetration.avg_contacts_per_company ?? '—'}</span>Avg contacts/company</div>
              <div><span className="block text-lg font-bold text-brand-secondary">{penetration.avg_engaged_contacts_per_company ?? '—'}</span>Avg per engaged co.</div>
              <div><span className="block text-lg font-bold text-gray-700">{penetration.unique_companies ?? '—'}</span>Unique companies</div>
              <div><span className="block text-lg font-bold text-gray-700">{penetration.engaged_companies ?? '—'}</span>Engaged companies</div>
            </div>
          </div>
        </div>
      </div>

      {/* Persona Distribution */}
      <div className="card p-5">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Function Distribution</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {persona.filter(p => p.function).slice(0, 12).map((p, i) => {
            const total2 = Number(p.total ?? 0);
            const engaged = Number(p.engaged ?? 0);
            const pct = total2 > 0 ? Math.round(engaged / total2 * 100) : 0;
            return (
              <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs font-semibold text-gray-700 truncate mb-1">{String(p.function)}</div>
                <div className="text-xs text-gray-500">{engaged} engaged / {total2} total</div>
                <div className="mt-1.5">
                  <ProgressBar value={engaged} max={Math.max(total2, 1)} />
                </div>
                <div className="text-xs text-brand-secondary font-semibold mt-0.5">{pct}%</div>
              </div>
            );
          })}
          {persona.length === 0 && <p className="text-xs text-gray-400 italic col-span-full">No function data yet</p>}
        </div>
      </div>
    </div>
  );
}
