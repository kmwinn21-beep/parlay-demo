import { DEFAULT_WEIGHTS, reweightComponents, assembleFinalScore } from '../lib/scoring/calendar-intelligence.ts';
const sum=(o)=>Object.values(o).reduce((a,b)=>a+b,0);
console.log('all six', sum(reweightComponents(DEFAULT_WEIGHTS, [])));
console.log('engagement null', reweightComponents(DEFAULT_WEIGHTS, ['engagementCapture']));
console.log('cost+engagement null', reweightComponents(DEFAULT_WEIGHTS, ['engagementCapture','costJustification']));
console.log('two only', assembleFinalScore({ audienceFit: 80,targetOpportunity: 70,engagementCapture: null,commercialPotential: null,costJustification: null,strategicValue: null }));
