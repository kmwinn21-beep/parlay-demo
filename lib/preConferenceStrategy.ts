export type Confidence = 'High' | 'Medium' | 'Low';

type CompanyScore = {
  isIcp: boolean;
  icpFit: number;
  targetPriorityScore: number;
  targetPriorityTier: string;
  buyerAccessScore: number;
  relationshipLeverageScore: number;
  conferenceOpportunityScore: number;
  titleNeedsReview: boolean;
  hasMeeting: boolean;
  isCustomer: boolean;
  pipelineValue: number | null;
};

type Input = {
  totalAttendees: number;
  totalCompanies: number;
  internalAttendeeCount: number;
  requiredPipelineAmount: number | null;
  totalBudget: number | null;
  companyScores: CompanyScore[];
  scheduledMeetings: number;
};

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const round = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v));
const interp = (v: number | null) => v == null ? 'Unavailable' : v >= 75 ? 'Strong' : v >= 60 ? 'Acceptable' : v >= 40 ? 'Watch' : 'Low';
const fitInterp = (v: number | null) => v == null ? null : v >= 90 ? 'Exceptional Strategy Fit' : v >= 75 ? 'Strong Strategy Fit' : v >= 60 ? 'Moderate Strategy Fit' : v >= 40 ? 'Limited Strategy Fit' : 'Weak Strategy Fit';

export function computePreConferenceStrategyAssessment(input: Input) {
  const { totalCompanies, totalAttendees, companyScores, requiredPipelineAmount, totalBudget } = input;
  if (!totalCompanies || companyScores.length === 0) return { unavailable_reason: 'No companies available for assessment.' };

  const must = companyScores.filter(c => c.targetPriorityTier === 'must_target').length;
  const high = companyScores.filter(c => c.targetPriorityTier === 'high_priority').length;
  const worth = companyScores.filter(c => c.targetPriorityTier === 'worth_engaging').length;
  const monitor = companyScores.filter(c => c.targetPriorityTier === 'monitor').length;
  const icp = companyScores.filter(c => c.isIcp);
  const customers = companyScores.filter(c => c.isCustomer);
  const avg = (arr: number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;

  const icpRate = (icp.length / totalCompanies) * 100;
  const avgIcpFit = avg(companyScores.map(c => c.icpFit));
  const highIcpDensity = (companyScores.filter(c => c.icpFit >= 75).length / totalCompanies) * 100;
  const icpOpportunity = clamp(icpRate * 0.4 + avgIcpFit * 0.4 + highIcpDensity * 0.2);

  const mustScore = Math.min(must / 10, 1) * 100;
  const highScore = Math.min(high / 25, 1) * 100;
  const avgTarget = avg(companyScores.map(c => c.targetPriorityScore));
  const bookRate = (companyScores.filter(c => c.hasMeeting).length / totalCompanies) * 100;
  const targetOpportunity = clamp(mustScore * 0.3 + highScore * 0.3 + avgTarget * 0.25 + bookRate * 0.15);

  const avgBuyer = avg(companyScores.map(c => c.buyerAccessScore));
  const buyerDmRate = (companyScores.filter(c => c.buyerAccessScore >= 60).length / totalCompanies) * 100;
  const highBuyerDensity = (companyScores.filter(c => c.buyerAccessScore >= 75).length / totalCompanies) * 100;
  const titleReviewRate = (companyScores.filter(c => c.titleNeedsReview).length / totalCompanies) * 100;
  const buyerPenalty = titleReviewRate > 25 ? (titleReviewRate > 40 ? 10 : 5) : 0;
  const buyerAccess = clamp(avgBuyer * 0.5 + buyerDmRate * 0.3 + highBuyerDensity * 0.2 - buyerPenalty);

  const avgRel = avg(companyScores.map(c => c.relationshipLeverageScore));
  const warmRate = (companyScores.filter(c => c.relationshipLeverageScore >= 60).length / totalCompanies) * 100;
  const overlapRate = (companyScores.filter(c => c.relationshipLeverageScore >= 40).length / totalCompanies) * 100;
  const ownerCoverage = warmRate;
  const relLeverage = clamp(avgRel * 0.5 + warmRate * 0.25 + overlapRate * 0.15 + ownerCoverage * 0.1);

  const custRate = (customers.length / totalCompanies) * 100;
  const custAttendeeDensity = totalAttendees ? (customers.length / totalAttendees) * 100 : 0;
  const custBuyer = avg(customers.map(c => c.buyerAccessScore));
  const custRel = avg(customers.map(c => c.relationshipLeverageScore));
  const customerPresence = clamp(custRate * 0.4 + custAttendeeDensity * 0.2 + custBuyer * 0.2 + custRel * 0.2);

  const tierBase: Record<string, number> = { must_target: 0.25, high_priority: 0.15, worth_engaging: 0.075, monitor: 0.025, low_priority: 0 };
  let realistic = 0;
  let pipelineDataPoints = 0;
  for (const c of companyScores) {
    if (c.pipelineValue == null) continue;
    pipelineDataPoints++;
    let p = tierBase[c.targetPriorityTier] ?? 0;
    if (c.buyerAccessScore >= 80) p += 0.05;
    if (c.relationshipLeverageScore >= 80) p += 0.05;
    if (c.hasMeeting) p += 0.05;
    if (c.buyerAccessScore < 40) p -= 0.05;
    if (c.titleNeedsReview) p -= 0.05;
    p = Math.max(0, Math.min(0.35, p));
    realistic += c.pipelineValue * p;
  }
  const pipelineConfidence: Confidence = pipelineDataPoints > Math.max(5, totalCompanies * 0.5) ? 'High' : pipelineDataPoints > 0 ? 'Medium' : 'Low';
  const coverageRatio = requiredPipelineAmount && requiredPipelineAmount > 0 ? realistic / requiredPipelineAmount : null;
  const coveragePercent = coverageRatio == null ? null : coverageRatio * 100;
  const pipelinePotential = coverageRatio == null ? null : clamp(Math.min(coverageRatio, 1) * 100);

  const budgetJustification = coveragePercent == null ? 40 : clamp(coveragePercent);
  const costPerHigh = totalBudget && high > 0 ? totalBudget / high : null;
  const costPerIcp = totalBudget && icp.length > 0 ? totalBudget / icp.length : null;
  const costHighScore = costPerHigh == null ? 50 : clamp(100 - (costPerHigh / 100000) * 100);
  const costIcpScore = costPerIcp == null ? 50 : clamp(100 - (costPerIcp / 100000) * 100);
  const eventEco = clamp((coveragePercent ?? 0) * 0.5 + costHighScore * 0.3 + costIcpScore * 0.2);

  const components = [
    ['icp_opportunity','ICP Opportunity',20,icpOpportunity],['target_account_opportunity','Target Account Opportunity',20,targetOpportunity],['buyer_access','Buyer Access',15,buyerAccess],['relationship_leverage','Relationship Leverage',15,relLeverage],['customer_presence','Customer Presence',10,customerPresence],['pipeline_potential','Pipeline Potential',15,pipelinePotential],['event_economics_fit','Event Economics Fit',5,eventEco],
  ].map(([key,label,weight,score])=>({key,label,weight,score: round(score as number|null),interpretation: interp(round(score as number|null))}));

  const strategyFitScore = round((icpOpportunity*0.2)+(targetOpportunity*0.2)+(buyerAccess*0.15)+(relLeverage*0.15)+(customerPresence*0.1)+((pipelinePotential ?? 0)*0.15)+(eventEco*0.05));

  const strategies = [
    { key:'pipeline_generation', label:'Pipeline Generation', score: icpOpportunity*0.25 + targetOpportunity*0.25 + buyerAccess*0.2 + ((coveragePercent ?? 0)*0.2) + (100-customerPresence)*0.1 },
    { key:'strategic_account_relationship_building', label:'Strategic Account Relationship Building', score: avgTarget*0.3 + buyerAccess*0.3 + relLeverage*0.25 + mustScore*0.15 },
    { key:'customer_retention_customer_nurture', label:'Customer Retention / Customer Nurture', score: customerPresence*0.45 + custBuyer*0.25 + custRel*0.2 + (100-(pipelinePotential ?? 30))*0.1 },
    { key:'market_presence_brand_visibility', label:'Market Presence / Brand Visibility', score: clamp((totalAttendees/500)*100)*0.3 + icpOpportunity*0.2 + (100-buyerAccess)*0.2 + (100-(pipelinePotential ?? 0))*0.15 + (100-relLeverage)*0.15 },
  ].sort((a,b)=>b.score-a.score);

  return {
    strategy_fit_score: strategyFitScore,
    strategy_fit_interpretation: fitInterp(strategyFitScore),
    components,
    recommended_strategy: { id: null, key: strategies[0]?.key ?? null, label: strategies[0]?.label ?? 'Unavailable', score: round(strategies[0]?.score ?? null), reasons: ['Based on attendee/company mix and component scores.'], confidence: 'Medium' as Confidence },
    secondary_strategy: { id: null, key: strategies[1]?.key ?? null, label: strategies[1]?.label ?? 'Unavailable', score: round(strategies[1]?.score ?? null), reasons: ['Secondary option from strategy scoring model.'], confidence: 'Medium' as Confidence },
    pipeline_reality: { realistic_pipeline_goal: round(realistic), required_pipeline_amount: round(requiredPipelineAmount), coverage_percent: round(coveragePercent), coverage_ratio: coverageRatio, interpretation: coveragePercent == null ? 'Pipeline requirement unavailable.' : coveragePercent < 20 ? 'Direct pipeline generation is unlikely to meet required pipeline. Focus on relationship and account progression.' : 'Pipeline generation potential is meaningful for this event.', confidence: pipelineConfidence },
    hosted_event_recommendation: { recommendation: buyerAccess >= 75 && must >= 8 && relLeverage >= 50 ? 'Host Executive Dinner' : customerPresence >= 70 ? 'Host Customer Dinner' : targetOpportunity >= 70 && buyerAccess >= 60 ? 'Host Prospect Reception' : strategyFitScore >= 60 ? 'Meeting Suite Only' : 'Attend Only', score: round(clamp((companyScores.filter(c=>c.targetPriorityScore>=75).length/Math.max(totalCompanies,1))*100*0.25 + customerPresence*0.2 + buyerAccess*0.2 + relLeverage*0.15 + mustScore*0.1 + budgetJustification*0.1)), reasons: ['Evaluates buyer access, customer presence, leverage, and target density.'], confidence: 'Medium' as Confidence },
    sponsorship_recommendation: { recommendation: 'Limited Sponsorship; Prioritize Meetings', score: round(clamp((clamp((totalAttendees/500)*100)*0.3)+(icpRate*0.2)+(targetOpportunity*0.2)+(customerPresence*0.15)+((pipelinePotential ?? 0)*0.1)+((customerPresence>60?70:40)*0.05))), reasons: ['Balances audience scale with ICP density and pipeline potential.'], confidence: 'Medium' as Confidence },
    staffing_recommendation: (()=>{const raw=((must*0.5)+(high*0.25)+(input.scheduledMeetings*0.5))/10; const reps=Math.max(1,Math.ceil(raw)); const min=Math.max(1,reps-1); const max=reps+1; const gapMin=min-input.internalAttendeeCount; const gapMax=max-input.internalAttendeeCount; return {recommended_rep_count_min:min,recommended_rep_count_max:max,current_internal_attendee_count:input.internalAttendeeCount,coverage_gap_min:gapMin>0?gapMin:0,coverage_gap_max:gapMax>0?gapMax:0,interpretation:gapMax>0?'Additional internal attendees recommended for target coverage.':'Coverage appears sufficient based on current internal attendees.',confidence:'Medium' as Confidence};})(),
    unavailable_reason: null,
  };
}
