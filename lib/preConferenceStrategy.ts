export type Confidence = 'High' | 'Medium' | 'Low';

type CompanyScore = {
  isIcp: boolean;
  icpFit: number | null;
  targetPriorityScore: number | null;
  targetPriorityTier: string;
  buyerAccessScore: number | null;
  relationshipLeverageScore: number | null;
  conferenceOpportunityScore: number | null;
  titleNeedsReview: boolean;
  hasMeeting: boolean;
  isCustomer: boolean;
  pipelineValue: number | null;
  recommendedActionKey?: string | null;
  highBuyerFitAttendeeCount?: number;
  confidenceLevel?: string | null;
};

type Input = { totalAttendees:number; totalCompanies:number; internalAttendeeCount:number; requiredPipelineAmount:number|null; totalBudget:number|null; companyScores:CompanyScore[]; scheduledMeetings:number; clientAttendeeCount:number; };
const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));
const r=(v:number|null)=>v==null||!Number.isFinite(v)?null:Math.round(v);
const i=(v:number|null)=>v==null?'Unavailable':v>=75?'Strong':v>=60?'Acceptable':v>=40?'Watch':'Low';
const fit=(v:number|null)=>v==null?null:v>=90?'Exceptional Strategy Fit':v>=75?'Strong Strategy Fit':v>=60?'Moderate Strategy Fit':v>=40?'Limited Strategy Fit':'Weak Strategy Fit';

function weightedAvailable(parts:{score:number|null;weight:number}[]){const avail=parts.filter(p=>p.score!=null); const tw=avail.reduce((s,p)=>s+p.weight,0); if(!tw) return {score:null,weights:new Map<number,number>()}; let sum=0; const m=new Map<number,number>(); for(const p of parts){if(p.score==null) continue; const ew=(p.weight/tw)*100; m.set(p.weight,ew); sum += (p.score as number)*(ew/100);} return {score:r(sum),weights:m};}

export function computePreConferenceStrategyAssessment(input: Input) {
  const c=input.companyScores; const total=Math.max(input.totalCompanies,1);
  if(!c.length) return {unavailable_reason:'No scored target companies available for strategy assessment.'};
  const byTier=(k:string)=>c.filter(x=>x.targetPriorityTier===k).length;
  const must=byTier('must_target'), high=byTier('high_priority'), worth=byTier('worth_engaging');
  const avg=(arr:(number|null)[])=>{const v=arr.filter((n):n is number=>n!=null); return v.length? v.reduce((a,b)=>a+b,0)/v.length : null;};
  const highPlus=c.filter(x=>x.targetPriorityTier==='must_target'||x.targetPriorityTier==='high_priority');
  const avgIcp=avg(c.map(x=>x.icpFit)); const avgTarget=avg(c.map(x=>x.targetPriorityScore)); const avgBuyer=avg(highPlus.map(x=>x.buyerAccessScore)); const avgRel=avg(highPlus.map(x=>x.relationshipLeverageScore));
  const needsTitle=c.filter(x=>x.titleNeedsReview).length;

  const icpRateScore=clamp(Math.min((c.filter(x=>x.isIcp).length/total)/0.15,1)*100);
  const highIcpDensity=clamp(Math.min(c.filter(x=>(x.icpFit??0)>=75).length/50,1)*100);
  const icpScore=r((icpRateScore*0.3)+((avgIcp??0)*0.5)+(highIcpDensity*0.2));

  const mustScore=Math.min(must/10,1)*100, highScore=Math.min(high/50,1)*100, worthScore=Math.min(worth/75,1)*100;
  const actionRate=(c.filter(x=>['book_meeting','route_to_account_owner'].includes((x.recommendedActionKey??'').toLowerCase())).length/total)*100;
  const targetOpp=r(mustScore*0.2+highScore*0.3+worthScore*0.15+((avgTarget??0)*0.25)+(actionRate*0.1));

  const buyerStrongRate=highPlus.length? (highPlus.filter(x=>(x.buyerAccessScore??0)>=70).length/highPlus.length)*100 : null;
  const highBuyerAttendees=c.reduce((s,x)=>s+(x.highBuyerFitAttendeeCount??0),0);
  let buyerScore = r(((avgBuyer??0)*0.5)+((buyerStrongRate??0)*0.3)+(Math.min(highBuyerAttendees/25,1)*100*0.2));
  const titleRate=(needsTitle/total)*100; if(buyerScore!=null && titleRate>25) buyerScore=Math.max(0,buyerScore-(titleRate>50?10:5));

  const relStrongRate=highPlus.length?(highPlus.filter(x=>(x.relationshipLeverageScore??0)>=70).length/highPlus.length)*100:null;
  const warmCoverage=(c.filter(x=>(x.relationshipLeverageScore??0)>=60||x.hasMeeting).length/total)*100;
  const relScore=r(((avgRel??0)*0.6)+((relStrongRate??0)*0.25)+(warmCoverage*0.15));

  const customers=c.filter(x=>x.isCustomer); const custBuyer=avg(customers.map(x=>x.buyerAccessScore)); const custRel=avg(customers.map(x=>x.relationshipLeverageScore));
  const customerScore = r((Math.min(customers.length/20,1)*100*0.4)+(Math.min(input.clientAttendeeCount/50,1)*100*0.3)+((custBuyer??0)*0.15)+((custRel??0)*0.15));

  const tierProb: Record<string, number> = { must_target: 0.25, high_priority: 0.15, worth_engaging: 0.075, monitor: 0.025, low_priority: 0 };
  let realisticValue = 0;
  let pipelineCompanies = 0;
  for (const row of c) {
    if (row.pipelineValue == null) continue;
    pipelineCompanies += 1;
    let prob = tierProb[row.targetPriorityTier] ?? 0;
    if ((row.buyerAccessScore ?? 0) >= 80) prob += 0.05;
    if ((row.relationshipLeverageScore ?? 0) >= 80) prob += 0.05;
    if (row.hasMeeting) prob += 0.05;
    if ((row.buyerAccessScore ?? 100) < 40) prob -= 0.05;
    if ((row.confidenceLevel ?? '').toLowerCase() === 'low') prob -= 0.05;
    prob = Math.max(0, Math.min(0.35, prob));
    realisticValue += row.pipelineValue * prob;
  }
  const realistic: null | number = pipelineCompanies > 0 ? realisticValue : null;
  const req=input.requiredPipelineAmount; const coverage=req&&realistic? realistic/req : null; const coveragePct=coverage==null?null:coverage*100;
  const pipelineScore=coverage==null?null:r(Math.min(coverage,1)*100);
  const economicsScore=input.totalBudget==null||coveragePct==null?null:r((coveragePct*0.4)+50*0.35+50*0.25);

  const components=[
    {key:'icp_opportunity',label:'ICP Opportunity',original_weight:20,score:icpScore,unavailable_reason:null},
    {key:'target_account_opportunity',label:'Target Account Opportunity',original_weight:20,score:targetOpp,unavailable_reason:null},
    {key:'buyer_access',label:'Buyer Access',original_weight:15,score:buyerScore,unavailable_reason:null},
    {key:'relationship_leverage',label:'Relationship Leverage',original_weight:15,score:relScore,unavailable_reason:null},
    {key:'customer_presence',label:'Customer Presence',original_weight:10,score:customerScore,unavailable_reason:null},
    {key:'pipeline_potential',label:'Pipeline Potential',original_weight:15,score:pipelineScore,unavailable_reason:'Required pipeline amount or pipeline influence values are unavailable.'},
    {key:'event_economics_fit',label:'Event Economics Fit',original_weight:5,score:economicsScore,unavailable_reason:'Budget and/or pipeline inputs are unavailable.'},
  ];
  const fitScoreObj=weightedAvailable(components.map(c=>({score:c.score,weight:c.original_weight})));
  const componentsOut=components.map(c=>({key:c.key,label:c.label,original_weight:c.original_weight,effective_weight:c.score==null?0:Number(((fitScoreObj.weights.get(c.original_weight)??0).toFixed(2))),score:c.score,interpretation:i(c.score),unavailable_reason:c.score==null?c.unavailable_reason:null}));

  const strategyScores=[
    ['pipeline_generation','Pipeline Generation', {t:targetOpp,b:buyerScore,p:pipelineScore,icp:icpScore}, {t:30,b:25,p:25,icp:20}],
    ['pipeline_acceleration','Pipeline Acceleration',{r:relScore,b:buyerScore,t:targetOpp,p:pipelineScore},{r:30,b:25,t:25,p:20}],
    ['customer_retention_customer_nurture','Customer Retention / Customer Nurture',{c:customerScore,r:relScore,b:buyerScore,icp:icpScore},{c:40,r:25,b:20,icp:15}],
    ['market_presence_brand_visibility','Market Presence / Brand Visibility',{icp:icpScore,t:targetOpp,b:buyerScore,c:customerScore,a:r(Math.min(input.totalAttendees/500,1)*100)},{icp:25,t:20,b:15,c:15,a:25}],
    ['strategic_account_relationship_building','Strategic Account Relationship Building',{t:targetOpp,b:buyerScore,r:relScore,icp:icpScore},{t:30,b:30,r:25,icp:15}],
  ].map(([key,label,scores,w])=>{const parts=Object.keys(w).map(k=>({score:(scores as any)[k]??null,weight:(w as any)[k]})); const sw=weightedAvailable(parts).score??0; return {key,label,score:sw};}).sort((a,b)=>b.score-a.score);
  const top=strategyScores[0], second=strategyScores[1];

  const reasons=[`${must} Must Target, ${high} High Priority, and ${worth} Worth Engaging companies were identified.`,`Average Target Priority is ${r(avgTarget) ?? '—'} across scored companies.`,`Buyer Access score is ${buyerScore ?? '—'} and Relationship Leverage is ${relScore ?? '—'} among top targets.`, titleRate>25?`${needsTitle} companies need title review, reducing confidence in buyer-fit precision.`:'Title confidence is healthy across scored companies.'];

  return {
    strategy_fit_score: fitScoreObj.score,
    strategy_fit_interpretation: fit(fitScoreObj.score),
    components: componentsOut,
    recommended_strategy:{id:null,key:top?.key??null,label:top?.label??'Unavailable',score:r(top?.score??null),reasons:reasons.slice(0,4),confidence:'Medium' as Confidence},
    secondary_strategy:{id:null,key:second?.key??null,label:second?.label??'Unavailable',score:r(second?.score??null),reasons:[`Secondary strategy scored ${r(second?.score??null) ?? '—'} based on current component mix.`,reasons[0],pipelineScore==null?'Pipeline reality is unavailable because pipeline influence values or required pipeline data are missing.':'Pipeline potential was included in secondary scoring.'],confidence:'Medium' as Confidence},
    pipeline_reality:{realistic_pipeline_goal:realistic,required_pipeline_amount:req,coverage_percent:r(coveragePct),coverage_ratio:coverage,interpretation:coverage==null?'Pipeline reality unavailable until company deal values and required pipeline are configured.':coverage<0.2?'Direct pipeline generation is unlikely to meet required pipeline.':'Pipeline coverage appears achievable.',confidence:coverage==null?'Low':'Medium',unavailable_reason:coverage==null?'Missing required pipeline and/or company deal values.':null},
    hosted_event_recommendation:{recommendation: buyerScore!=null&&buyerScore>=75&&must>=1?'Host Executive Dinner':targetOpp!=null&&targetOpp>=70?'Host Prospect Reception':'Meeting Suite Only',score:r(weightedAvailable([{score:r(Math.min((must+high)/Math.max(total,1)*100*2,100)),weight:25},{score:customerScore,weight:20},{score:buyerScore,weight:20},{score:relScore,weight:15},{score:r(mustScore),weight:10},{score:input.totalBudget==null?null:50,weight:10}]).score),reasons:[`${high} High Priority companies identified.`,`Buyer Access among high-priority targets is ${buyerScore ?? '—'}.`,customerScore!=null&&customerScore<50?'Customer presence is limited, favoring prospect-oriented formats.':'Customer presence supports relationship-oriented programming.'],confidence:input.totalBudget==null?'Low':'Medium'},
    sponsorship_recommendation:(()=>{const m=r(weightedAvailable([{score:r(Math.min(input.totalAttendees/500,1)*100),weight:30},{score:icpRateScore,weight:20},{score:r(Math.min((total-customers.length)/Math.max(total,1)*100,100)),weight:20},{score:customerScore,weight:15},{score:pipelineScore,weight:10},{score:r(customerScore!=null&&customerScore>=60?70:40),weight:5}]).score); const rec=m==null?'Limited Sponsorship; Prioritize Meetings':m>=80?'Strong Sponsorship Fit':m>=60?'Selective Sponsorship / Speaking Slot':m>=40?'Limited Sponsorship; Prioritize Meetings':'Do Not Sponsor'; return {recommendation:rec,score:m,reasons:[`Audience scale score: ${r(Math.min(input.totalAttendees/500,1)*100) ?? '—'}.`,`ICP opportunity score: ${icpScore ?? '—'}.`,`Pipeline potential ${pipelineScore==null?'is unavailable and excluded from weighted score.':`is ${pipelineScore}.`}`],confidence:pipelineScore==null?'Low':'Medium'};})(),
    staffing_recommendation:(()=>{const reps=Math.max(1,Math.ceil(((must*0.5)+(high*0.25)+(input.scheduledMeetings*0.5))/10)); const min=Math.max(1,reps-1),max=reps+1; const gapMin=Math.max(0,min-input.internalAttendeeCount),gapMax=Math.max(0,max-input.internalAttendeeCount); return {recommended_rep_count_min:min,recommended_rep_count_max:max,current_internal_attendee_count:input.internalAttendeeCount,coverage_gap_min:gapMin,coverage_gap_max:gapMax,interpretation:`Based on ${must} Must Target, ${high} High Priority, and ${input.scheduledMeetings} scheduled meetings, recommended coverage is ${min}-${max} internal attendees.`,confidence:'Medium' as Confidence};})(),
    debug_summary:{total_scored_companies:c.length,must_target_count:must,high_priority_count:high,worth_engaging_count:worth,avg_target_priority:r(avgTarget),avg_icp_fit:r(avgIcp),avg_buyer_access:r(avgBuyer),avg_relationship_leverage:r(avgRel),avg_conference_opportunity:r(avg(c.map(x=>x.conferenceOpportunityScore))),needs_title_review_count:needsTitle},
    unavailable_reason:null,
  };
}
