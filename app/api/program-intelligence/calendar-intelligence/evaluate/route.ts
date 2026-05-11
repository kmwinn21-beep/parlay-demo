import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

function interp(score: number | null) { if (score == null) return null; if (score >= 90) return 'Exceptional Calendar Fit'; if (score >= 75) return 'Strong Calendar Fit'; if (score >= 60) return 'Moderate Calendar Fit'; if (score >= 40) return 'Limited Calendar Fit'; return 'Weak Calendar Fit'; }

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth;
    await dbReady;
    const body = await request.json().catch(() => ({}));
    const scope = String(body.scope ?? 'all');
    const ids: number[] = Array.isArray(body.conference_ids) ? body.conference_ids.map(Number).filter(Boolean) : [];

  const confRows = await db.execute({ sql: `SELECT id,name,date,is_historical FROM conferences ORDER BY date DESC`, args: [] });
  let confs = (confRows.rows as any[]).map(r => ({ id:Number(r.id), name:String(r.name??''), date:r.date?String(r.date):null, is_historical:Number(r.is_historical??0)===1 }));
  if (scope === 'historical') confs = confs.filter(c => c.is_historical);
  if (scope === 'custom' && ids.length) confs = confs.filter(c => ids.includes(c.id));

  const results:any[] = [];
  for (const c of confs) {
    const safeCount = async (sql: string, args: Array<string | number | null> = []) => {
      try {
        const res = await db.execute({ sql, args });
        return Number((res.rows[0] as Record<string, unknown>)?.cnt ?? 0);
      } catch {
        return 0;
      }
    };
    const attendeeCount = await safeCount('SELECT COUNT(*) AS cnt FROM conference_attendees WHERE conference_id=?', [c.id]);
    const companyCount = await safeCount('SELECT COUNT(DISTINCT a.company_id) AS cnt FROM conference_attendees ca JOIN attendees a ON a.id=ca.attendee_id WHERE ca.conference_id=?', [c.id]);
    const meetings = await safeCount('SELECT COUNT(*) AS cnt FROM meetings WHERE conference_id=?', [c.id]);
    const followups = await safeCount('SELECT COUNT(*) AS cnt FROM follow_ups WHERE conference_id=?', [c.id]);
    let budget: { rows: Array<{ required_pipeline_amount?: unknown }> } = { rows: [] };
    try {
      budget = await db.execute({ sql:'SELECT required_pipeline_amount FROM conference_budget WHERE conference_id=? LIMIT 1', args:[c.id]}) as { rows: Array<{ required_pipeline_amount?: unknown }> };
    } catch {
      budget = { rows: [] };
    }
    const required = budget.rows[0]?.required_pipeline_amount != null ? Number(budget.rows[0].required_pipeline_amount) : null;

    const audienceFit = companyCount > 0 ? Math.min(100, 40 + companyCount) : null;
    const targetOpportunity = attendeeCount > 0 ? Math.min(100, 35 + attendeeCount / 2) : null;
    const commercial = required && required > 0 ? Math.min(100, (companyCount * 10000) / required * 100) : null;
    const cost = required ? Math.min(100, 70) : null;
    const strategic = c.is_historical ? 55 : 65;

    const parts = [
      { k:'audience_fit', l:'Audience Fit', w:0.3, s:audienceFit },
      { k:'target_opportunity', l:'Target Opportunity', w:0.3, s:targetOpportunity },
      { k:'commercial_potential', l:'Commercial Potential', w:0.2, s:commercial },
      { k:'cost_justification', l:'Cost Justification', w:0.1, s:cost },
      { k:'strategic_value', l:'Strategic Value', w:0.1, s:strategic },
    ];
    const avail = parts.filter(p => p.s != null); const tw = avail.reduce((a,b)=>a+b.w,0);
    const score = tw ? Math.round(avail.reduce((a,b)=>a+Number(b.s)*(b.w/tw),0)) : null;
    let recKey = 'evaluate_before_committing'; let recLabel = 'Evaluate Before Committing';
    if ((score ?? 0) >= 85) { recKey = 'attend_invest_more'; recLabel = 'Attend & Invest More'; }
    else if ((score ?? 0) >= 70) { recKey = 'attend_same_level'; recLabel = 'Attend at Same Level'; }
    else if ((score ?? 0) < 40) { recKey = 'remove_or_do_not_prioritize'; recLabel = 'Remove / Do Not Prioritize'; }

    results.push({
      conference_id: c.id, conference_name: c.name, status: c.is_historical ? 'historical' : (meetings+followups>0 ? 'completed' : 'active'), is_historical: c.is_historical,
      calendar_recommendation_score: score, calendar_recommendation_interpretation: interp(score),
      recommendation_key: recKey, recommendation_label: recLabel, recommendation_reasons: [`${companyCount} companies`, `${attendeeCount} attendees`, required ? `Required pipeline ${required.toLocaleString()}` : 'Required pipeline missing'],
      investment_guidance_key: recKey === 'attend_invest_more' ? 'increase_investment' : recKey === 'attend_same_level' ? 'maintain_investment' : 'evaluate_before_committing',
      investment_guidance_label: recKey === 'attend_invest_more' ? 'Increase investment' : recKey === 'attend_same_level' ? 'Maintain investment' : 'Evaluate before committing',
      investment_guidance_reasons: ['Derived from current V1 available inputs.'],
      confidence: c.is_historical ? 'Low' : (required ? 'Medium' : 'Low'),
      components: parts.map(p=>({ key:p.k, label:p.l, original_weight:p.w, effective_weight: p.s!=null&&tw? p.w/tw:0, score:p.s, interpretation: interp(p.s), unavailable_reason: p.s==null?'Unavailable':null })),
      metrics: { total_attendees: attendeeCount, total_companies: companyCount, icp_companies: null, must_target_count: null, high_priority_count: null, worth_engaging_count: null, avg_target_priority: null, avg_buyer_access: null, planning_spend: null, required_pipeline_amount: required, realistic_pipeline_goal: null, pipeline_coverage_percent: null, cost_per_high_priority_target: null, cost_per_icp_company: null, company_value_coverage_percent: null },
      pipeline_reality: { realistic_pipeline_goal: null, required_pipeline_amount: required, coverage_percent: null, unavailable_reason: 'V1 pending richer targeting/budget model' },
      cost_justification: { score: cost, planning_spend: null, cost_per_high_priority_target: null, cost_per_icp_company: null, unavailable_reason: required ? null : 'Budget data unavailable' },
      audience_opportunity: { icp_companies: null, must_target_count: null, high_priority_count: null, worth_engaging_count: null, avg_target_priority: null, avg_buyer_access: null },
      engagement_capture: { available: meetings+followups>0, score: null, icp_engagement_rate: null, target_engagement_rate: null, meeting_hold_rate: null, followup_completion_rate: null, interpretation: null, unavailable_reason: c.is_historical ? 'This conference was uploaded as a Historical Conference. Meetings, touchpoints, and follow-ups were not tracked in Parlay.' : 'Execution data is unavailable for this conference.' },
      data_coverage: { targeting_available: false, company_units_coverage_percent: null, budget_available: required != null, required_pipeline_available: required != null, execution_capture_available: meetings+followups>0, prior_overlap_available: false }
    });
  }

  results.sort((a,b)=>(b.calendar_recommendation_score??-1)-(a.calendar_recommendation_score??-1));
  const summary = {
    attend_invest_more_count: results.filter(r=>r.recommendation_key==='attend_invest_more').length,
    attend_same_level_count: results.filter(r=>r.recommendation_key==='attend_same_level' || r.recommendation_key==='attend_same_or_higher_priority').length,
    reconsider_format_count: results.filter(r=>r.recommendation_key==='reconsider_format').length,
    evaluate_count: results.filter(r=>r.recommendation_key==='evaluate_before_committing').length,
    remove_count: results.filter(r=>r.recommendation_key==='remove_or_do_not_prioritize').length,
  };
    return NextResponse.json({ summary, conferences: results });
  } catch (error) {
    console.error('POST /api/program-intelligence/calendar-intelligence/evaluate error:', error);
    return NextResponse.json({ error: 'Unable to evaluate calendar recommendations.' }, { status: 500 });
  }
}
