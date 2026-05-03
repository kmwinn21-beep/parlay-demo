'use client';
import type { EffectivenessData } from '../ConferenceEffectivenessModal';

const scoreColor = (score: number | null | undefined) => { const s=Number(score??0); if(s>=90)return '#059669'; if(s>=75)return '#1B76BC'; if(s>=60)return '#d97706'; if(s>=50)return '#f97316'; return '#dc2626'; };
const fmtPct=(n:number|null|undefined)=>n==null?'—':`${Math.round(n)}%`;
const fmtNum=(n:number|null|undefined)=>n==null?'—':Math.round(n).toLocaleString();

export function AudienceMessagingTab({ data }: { data: EffectivenessData }) {
  const m = data.marketing_audience as any;
  const strategyLabel = (data as any).conference_strategy?.display_name || 'Not set';
  if (!m) return <div className="p-6 text-sm text-gray-500">Audience signal data unavailable.</div>;
  return <div className="p-6 space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="sm:col-span-2 rounded-xl p-4" style={{ backgroundColor: scoreColor(m.marketing_audience_signal_score)+'15', borderLeft:`4px solid ${scoreColor(m.marketing_audience_signal_score)}` }}>
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Marketing Audience Signal Score</div>
        <div className="flex items-end gap-1"><div className="text-4xl font-bold" style={{ color: scoreColor(m.marketing_audience_signal_score)}}>{m.marketing_audience_signal_score ?? '—'}</div><div className="text-sm text-gray-400 mb-0.5">/100</div></div>
        <div className="text-xs font-semibold" style={{ color: scoreColor(m.marketing_audience_signal_score)}}>{m.marketing_audience_signal_interpretation ?? 'Not scored'}</div>
        <div className="mt-2 text-[11px] text-gray-500 text-right">Conference Strategy: {strategyLabel}</div>
        <div className="mt-3 pt-3 border-t border-current border-opacity-20 space-y-1.5">{[
          ['icp_target_quality','ICP & Target Quality'],
          ['buyer_role_access','Buyer Role Access'],
          ['net_new_market_reach','Net-New Market Reach'],
          ['engagement_depth','Engagement Depth'],
          ['message_resonance_proxy','Message Resonance Proxy'],
        ].map(([key,label])=>{ const comp=(m.components??{})[String(key)] as any; return <div key={String(key)} className="flex justify-between text-xs"><span className="text-gray-600">{label} <span className="text-gray-400">({Math.round(Number(comp?.weight ?? 0)*100)}%)</span></span><span className="font-semibold" style={{color:scoreColor(comp?.score)}}>{comp?.score!=null?Math.round(comp.score):'—'} <span className="text-gray-400">· {comp?.tier ?? '—'}</span></span></div>;})}
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center"><div className="text-xs text-gray-500">Audience Quality Rank</div>{m.audience_quality_rank ? <><div className="text-3xl font-bold text-brand-secondary">#{m.audience_quality_rank}</div><div className="text-xs text-gray-400">of {m.audience_quality_rank_total} conferences</div></> : <><div className="text-sm font-semibold text-gray-500">Not ranked</div><div className="text-xs text-gray-400">Ranking requires at least two scored conferences.</div></>}</div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{[
      ['ICP Engagement Rate', fmtPct(m.kpis.icp_engagement_rate)],
      ['Target Engagement Rate', fmtPct(m.kpis.target_engagement_rate)],
      ['Decision Maker Access', fmtPct(m.kpis.decision_maker_access_rate)],
      ['Influencer Access', fmtPct(m.kpis.influencer_access_rate)],
      ['Net-New Market Reach', fmtPct(m.kpis.net_new_market_reach_rate)],
      ['Message Resonance Proxy', fmtPct(m.kpis.message_resonance_proxy)],
    ].map(([l,v])=><div key={String(l)} className="rounded-lg border border-gray-100 bg-gray-50 p-3"><div className="text-xs text-gray-500">{l}</div><div className="text-lg font-bold text-brand-secondary">{v}</div></div>)}</div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card p-5 space-y-2"><h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Audience Fit</h3>
        <div className="text-xs text-gray-500">ICP Engagement Rate <span className="float-right">{fmtPct(m.audience_fit.icp_engagement_rate)}</span></div>
        <div className="text-xs text-gray-500">Target Engagement Rate <span className="float-right">{fmtPct(m.audience_fit.target_engagement_rate)}</span></div>
        <div className="text-xs text-gray-500">Decision Maker Access <span className="float-right">{fmtPct(m.audience_fit.decision_maker_access_rate)}</span></div>
        <div className="text-xs text-gray-500">Influencer Access <span className="float-right">{fmtPct(m.audience_fit.influencer_access_rate)}</span></div>
        <div className="text-xs text-gray-500">Seniority Priority Fit <span className="float-right">{fmtPct(m.audience_fit.seniority_priority_fit)}</span></div>
        <div className="text-xs text-gray-500">Function Priority Fit <span className="float-right">{fmtPct(m.audience_fit.function_priority_fit)}</span></div>
      </div>
      <div className="card p-5 space-y-2"><h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Market Reach & Audience Mix</h3>
        <div className="text-xs text-gray-500">Total Companies Engaged <span className="float-right">{fmtNum(m.reach_and_mix.total_companies_engaged)}</span></div>
        <div className="text-xs text-gray-500">Net-New Companies Engaged <span className="float-right">{fmtNum(m.reach_and_mix.net_new_companies_engaged)}</span></div>
        <div className="text-xs text-gray-500">Known Companies Engaged <span className="float-right">{fmtNum(m.reach_and_mix.known_companies_engaged)}</span></div>
        <div className="text-xs text-gray-500">Companies with Decision Makers <span className="float-right">{fmtNum(m.reach_and_mix.companies_with_decision_maker_engaged)}</span></div>
        <div className="text-xs text-gray-500">Companies with Influencers <span className="float-right">{fmtNum(m.reach_and_mix.companies_with_influencer_engaged)}</span></div>
      </div>
    </div>

    <div className="card p-5"><h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-3">Account-level Audience Quality</h3>
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-gray-500 border-b"><th className="py-2 pr-3">Company</th><th className="py-2 pr-3">Decision Maker</th><th className="py-2 pr-3">Influencer</th><th className="py-2 pr-3">Top Seniority</th><th className="py-2 pr-3">Top Function</th></tr></thead><tbody>
        {(m.account_level_table ?? []).slice(0, 25).map((r: any, idx: number) => <tr key={idx} className="border-b border-gray-100"><td className="py-2 pr-3">{r.company ?? '—'}</td><td className="py-2 pr-3">{r.decision_maker_engaged ? 'Yes' : 'No'}</td><td className="py-2 pr-3">{r.influencer_engaged ? 'Yes' : 'No'}</td><td className="py-2 pr-3">{fmtNum(r.highest_seniority_match)}</td><td className="py-2 pr-3">{fmtNum(r.highest_function_match)}</td></tr>)}
      </tbody></table></div>
    </div>
  </div>;
}
