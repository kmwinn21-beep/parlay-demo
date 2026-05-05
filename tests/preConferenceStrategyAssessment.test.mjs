import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCompanyPipelineProbabilityFactor, calculateRealisticPipelineGoal, dedupeCompaniesByIdOrName, scoreCostPerHighPriorityTarget, scoreCostPerIcpCompany, weightedAverageAvailable } from '../lib/preConferenceStrategyAssessment.ts';

test('dedupe keeps best tier', () => {
  const out = dedupeCompaniesByIdOrName([{company_id:1,target_priority_tier:'High Priority'},{company_id:1,target_priority_tier:'Must Target'}]);
  assert.equal(out.length,1); assert.equal(out[0].target_priority_tier,'Must Target');
});

test('probability factor clamp and adjustments', ()=>{
  const f = calculateCompanyPipelineProbabilityFactor({target_priority_tier:'Must Target',buyer_access_score:90,relationship_leverage_score:90,scheduled_meeting_count:1});
  assert.equal(f,0.35);
});

test('realistic pipeline uses wse*cpu', ()=>{
  const v = calculateRealisticPipelineGoal({companies:[{company_id:1,companyWse:10,target_priority_tier:'Must Target'}],avgCostPerUnit:100});
  assert.equal(v,250);
});

test('scores and reweight', ()=>{
  assert.equal(scoreCostPerHighPriorityTarget(1500),100);
  assert.equal(scoreCostPerIcpCompany(500),100);
  assert.equal(weightedAverageAvailable([{score:100,weight:0.4},{score:null,weight:0.6}]),100);
});
