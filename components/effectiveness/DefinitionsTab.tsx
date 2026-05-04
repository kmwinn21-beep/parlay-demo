'use client';

import { useState } from 'react';

interface Def {
  term: string;
  description: string;
  calculation?: string;
}

const SECTIONS: { title: string; items: Def[] }[] = [
  {
    title: 'Conference Effectiveness Score by Rep',
    items: [
      {
        term: 'Rep CES — Conference Effectiveness Score by Rep',
        description: 'A 0–100 composite score measuring how effectively an individual sales rep contributed to a conference\'s performance across the same seven dimensions as the conference-level CES. Uses equal-share conference cost allocation per rep.',
        calculation: '(ICP & Target Quality × 20%) + (Meeting Execution × 20%) + (Pipeline Influence Index × 30%) + (Engagement Breadth × 5%) + (Cost Efficiency × 10%) + (Follow-up Execution × 10%) + (Net-New Engaged × 5%)',
      },
      {
        term: 'ICP & Target Quality — Rep (20%)',
        description: 'How many ICP companies and target accounts the rep engaged relative to the total ICP companies and targets present at the conference.',
        calculation: '(rep ICP companies engaged / total ICP companies at conf × 50%) + (rep target accounts engaged / total targets at conf × 50%)',
      },
      {
        term: 'Meeting Execution — Rep (20%)',
        description: 'How effectively the rep converted scheduled meetings into held meetings and created follow-ups for those companies.',
        calculation: '(rep meetings held / rep meetings scheduled × 50%) + (rep companies with meeting & follow-up / rep companies with meeting × 50%)',
      },
      {
        term: 'Pipeline Influence Index — Rep (30%)',
        description: 'Pipeline influenced by the rep relative to their equal-share of the conference cost and the expected return target. Capped at 100.',
        calculation: 'MIN(rep pipeline influenced / (rep allocated cost × expected return target), 1) × 100',
      },
      {
        term: 'Engagement Breadth — Rep (5%)',
        description: 'The percentage of all companies at the conference that the rep engaged via meetings.',
        calculation: 'rep companies engaged / total companies at conference × 100',
      },
      {
        term: 'Cost Efficiency — Rep (10%)',
        description: 'Reuses the Rep Cost Efficiency Score computed from the rep\'s equal-share allocated cost against benchmark tiers for Cost per Company, Cost per Meeting, and Pipeline per $1k.',
        calculation: 'Same as conference-level Cost Efficiency Score, applied to rep allocated cost',
      },
      {
        term: 'Follow-up Execution — Rep (10%)',
        description: 'The percentage of follow-ups attributed to the rep\'s engaged companies that were marked completed.',
        calculation: 'rep follow-ups completed / rep follow-ups created × 100',
      },
      {
        term: 'Net-New Engaged — Rep (5%)',
        description: 'The percentage of companies this rep engaged that have not appeared at any prior conference in the system.',
        calculation: 'rep net-new logos engaged / rep companies engaged × 100',
      },
      {
        term: 'Rep Allocated Cost',
        description: 'The rep\'s equal share of total conference spend. Used as the cost denominator for all rep-level cost efficiency calculations.',
        calculation: 'total conference effective spend / number of reps in attribution',
      },
    ],
  },
  {
    title: 'Conference Effectiveness Score (CES)',
    items: [
      {
        term: 'CES — Conference Effectiveness Score',
        description: 'A 0–100 composite score across 7 dimensions shared across Events, Sales, and Marketing as a common language for conference investment decisions.',
        calculation: '(ICP & Target Quality × 20%) + (Meeting Execution × 20%) + (Pipeline Influence Index × 30%) + (Engagement Breadth × 5%) + (Cost Efficiency × 10%) + (Follow-up Execution × 10%) + (Net-New Engaged × 5%)',
      },
      {
        term: 'ICP & Target Quality (20%)',
        description: 'Measures the quality of the audience reached — how many ICP companies were engaged relative to how many ICP companies were present, and how many targets were engaged.',
        calculation: '(ICP company engagement rate × 50%) + (target engagement rate × 50%)',
      },
      {
        term: 'Meeting Execution (20%)',
        description: 'Measures how effectively scheduled meetings were converted to held meetings, and whether follow-ups were created after meetings.',
        calculation: '(meetings held / meetings scheduled × 50%) + (companies with meeting + follow-up / companies with meeting × 50%)',
      },
      {
        term: 'Pipeline Influence Index (30%)',
        description: 'Measures how much pipeline influence was generated relative to the expected return on event cost. Capped at 100.',
        calculation: 'MIN(total pipeline influence / (total spend × expected return target), 1) × 100',
      },
      {
        term: 'Engagement Breadth (5%)',
        description: 'The percentage of all companies at the conference that received at least one meaningful interaction.',
        calculation: 'engaged companies / total companies × 100',
      },
      {
        term: 'Cost Efficiency (10%)',
        description: 'A tier-based 0–100 score measuring how efficiently conference spend was converted into meaningful account engagement, meetings, and pipeline influence. Computed from three benchmark-scored components: Cost per Company Engaged (30%), Cost per Meeting Held (20%), and Pipeline Influence per $1,000 Spent (50%). May be adjusted by an event-type modifier.',
        calculation: 'weighted score = (Pipeline per $1k Score × 50%) + (Company Engaged Score × 30%) + (Meeting Held Score × 20%); adjusted = raw + event_type_modifier (capped 0–100)',
      },
      {
        term: 'Follow-up Execution (10%)',
        description: 'The percentage of created follow-ups that were marked completed post-conference.',
        calculation: 'follow-ups completed / follow-ups created × 100',
      },
      {
        term: 'Net-New Engaged (5%)',
        description: 'The percentage of engaged companies that have not appeared at any prior conference in the system.',
        calculation: 'net-new logos / total engaged companies × 100',
      },
    ],
  },
  {
    title: 'Pipeline Influence',
    items: [
      {
        term: 'Pipeline Influence',
        description: 'An estimated revenue influence value based on the probability that conference engagement converts to a closed deal. Calculated at the company level to prevent inflation from multiple attendees.',
        calculation: 'MIN(base conversion rate × multi-touch multiplier, 0.95) × company deal value',
      },
      {
        term: 'Base Conversion Rate',
        description: 'The conversion rate applied based on the highest-quality engagement channel at the company.',
        calculation: 'Meeting held → Follow-Up Meeting Conversion Rate; Touchpoint only → Touchpoint Conversion Rate; Hosted event only → Hosted Event Conversion Rate',
      },
      {
        term: 'Multi-Touch Multiplier',
        description: 'A boost applied when a company has multiple interaction types, reflecting the compounding effect of deeper engagement.',
        calculation: '1 interaction = 1.00×  |  2 interactions = 1.25×  |  3+ interactions = 1.50×',
      },
      {
        term: 'Company Deal Value',
        description: 'The estimated deal size for a company, scaled by its WSE (Weighted Size Equivalent) if available.',
        calculation: 'WSE × Avg Cost Per Unit (if WSE > 0) or Avg Annual Deal Size (fallback)',
      },
      {
        term: 'ICP Pipeline Influence',
        description: 'The share of total pipeline influence attributable to companies marked as Ideal Customer Profile.',
      },
      {
        term: 'Net-New Pipeline Influence',
        description: 'The share of pipeline influence from companies with no prior conference engagement in the system.',
      },
      {
        term: 'Multi-Touch Pipeline Influence',
        description: 'The share of pipeline influence from companies with 3 or more interaction types (meetings held + touchpoints + hosted events attended).',
      },
    ],
  },
  {
    title: 'Rep Attribution',
    items: [
      {
        term: 'Pipeline Influence Attribution',
        description: 'Each company\'s pipeline influence is attributed to reps based on who engaged with the account and their assigned status.',
        calculation: 'If no assigned rep is at the conference → split equally among all engaging reps. If assigned reps are at the conference → distribute by seniority tier (High 50%, Medium 35%, Low 15%) based on each rep\'s highest-seniority engagement. Weights are renormalized when not all tiers are present.',
      },
      {
        term: 'Contribution %',
        description: 'A rep\'s attributed pipeline influence as a percentage of the total conference pipeline influence.',
        calculation: 'rep pipeline influence / total conference pipeline influence × 100',
      },
      {
        term: 'Touchpoints',
        description: 'Conference touchpoints (e.g., booth stops, coffees, dinners) logged against attendees at companies this rep engaged via meetings. Prorated equally when multiple reps engaged the same company.',
      },
      {
        term: 'Event Attendees',
        description: 'Count of attendees from this rep\'s engaged companies who attended a Company Hosted social event. Prorated when multiple reps engaged the same company.',
      },
    ],
  },
  {
    title: 'Engagement Metrics',
    items: [
      {
        term: 'Companies Engaged',
        description: 'Distinct companies at the conference that received at least one meeting (scheduled), touchpoint, or hosted event attendance.',
      },
      {
        term: 'Engagement Rate',
        description: 'The percentage of all companies at the conference that were engaged.',
        calculation: 'engaged companies / total companies × 100',
      },
      {
        term: 'Target Engagement Rate',
        description: 'The percentage of conference-specific targets (for this conference only) that received meaningful engagement via held meetings, touchpoints, follow-ups, or social attendance signals.',
        calculation: 'engaged conference targets / total conference targets × 100',
      },
      {
        term: 'Hold Rate',
        description: 'The percentage of scheduled meetings that were held (had a "Meeting Held" outcome).',
        calculation: 'meetings held / meetings scheduled × 100',
      },
      {
        term: 'Multi-Touch Rate',
        description: 'The percentage of engaged companies that received two or more touchpoints.',
        calculation: 'companies with 2+ touchpoints / total engaged companies × 100',
      },
      {
        term: 'Follow-up Scheduling Rate',
        description: 'The percentage of companies where a meeting was held AND a follow-up was created.',
        calculation: 'companies with meeting held + follow-up created / companies with meeting held × 100',
      },
      {
        term: 'Follow-up Completion Rate',
        description: 'The percentage of all created follow-ups that were marked completed post-conference.',
        calculation: 'follow-ups completed / follow-ups created × 100',
      },
    ],
  },
  {
    title: 'Audience & ICP',
    items: [
      {
        term: 'ICP Coverage Rate',
        description: 'The percentage of attendees at the conference who belong to companies marked as Ideal Customer Profile.',
        calculation: 'ICP attendees / total attendees × 100',
      },
      {
        term: 'ICP Company Engagement Rate',
        description: 'The percentage of ICP companies at the conference that were engaged.',
        calculation: 'engaged ICP companies / total ICP companies × 100',
      },
      {
        term: 'ICP Quality Index',
        description: 'A weighted engagement score for ICP companies that factors in the seniority of engaged contacts. Higher seniority (C-Suite, BOD) contributes more to the score.',
        calculation: 'Sum of (seniority weight × engagement flag) for all ICP company contacts',
      },
      {
        term: 'Net-New Logos',
        description: 'Companies that have no record of attendance or engagement at any prior conference in the system.',
      },
      {
        term: 'Account Penetration',
        description: 'Average number of contacts engaged per company. Higher penetration indicates multi-threaded relationships.',
        calculation: 'engaged attendees / engaged companies',
      },
      {
        term: 'Audience Quality Score (AQS)',
        description: 'A composite score measuring the overall quality of the conference audience across ICP fit, seniority, and multi-contact coverage.',
        calculation: '(ICP rate × 40%) + (senior contact rate × 40%) + (multi-contact company rate × 20%)',
      },
    ],
  },
  {
    title: 'Audience & Messaging Signals',
    items: [
      { term: 'Marketing Audience Signal Score', description: 'A 0–100 composite score measuring audience fit and directional market signal quality from conference participation.', calculation: '(ICP & Target Quality × 30%) + (Buyer Role Access × 25%) + (Net-New Market Reach × 20%) + (Engagement Depth × 15%) + (Message Resonance Proxy × 10%)' },
      { term: 'Buyer Role Access', description: 'Uses ICP Admin Settings (Decision Maker titles, Influencer titles, Seniority priorities, Function priorities) to score whether the right buyer roles were reached.' },
      { term: 'Decision Maker Access', description: 'Percent of engaged companies with at least one engaged contact matching configured Decision Maker titles.' },
      { term: 'Influencer Access', description: 'Percent of engaged companies with at least one engaged contact matching configured Influencer titles.' },
      { term: 'Message Resonance Proxy', description: 'Directional proxy based on meetings, follow-up attachment, and multi-touch depth. Not full marketing attribution.' },
    ],
  },
  {
    title: 'Sales Execution',
    items: [
      {
        term: 'Sales Effectiveness Score',
        description: 'Sales Effectiveness Score is a 0–100 composite score that measures how effectively the sales team converted conference participation into commercial execution.',
        calculation: '(Meeting Execution × 25%) + (Follow-up Execution × 20%) + (Pipeline Influence Execution × 25%) + (Target Account Execution × 15%) + (Rep Productivity × 15%)',
      },
      {
        term: 'Rep Productivity',
        description: 'Rep Productivity includes both meetings held and touchpoints logged. Touchpoint types are customer-defined in Parlay and counted equally.',
      },
      {
        term: 'Sales Activity',
        description: 'Sales Activity equals meetings held plus touchpoints logged.',
      },
      {
        term: 'Pipeline per Sales Activity',
        description: 'Directional pipeline influence divided by total sales activities (meetings held + touchpoints logged). Pipeline influence may be proxy-based unless CRM opportunity attribution is connected.',
      },
    ],
  },
  {
    title: 'Operational & Cost',
    items: [
      {
        term: 'Cost per Company Engaged',
        description: 'Total conference spend divided by the number of unique companies that received meaningful engagement.',
        calculation: 'total spend / engaged companies',
      },
      {
        term: 'Cost per Meeting Held',
        description: 'Total conference spend divided by the number of meetings that were held.',
        calculation: 'total spend / meetings held',
      },
      {
        term: 'Pipeline Influence per $1k Spent',
        description: 'Total pipeline influence generated for every $1,000 of conference spend.',
        calculation: 'total pipeline influence / (total spend / 1,000)',
      },
      {
        term: 'Return on Event Cost (ROC)',
        description: 'The ratio of pipeline influence generated to total conference spend. Compared against the expected return target set in Effectiveness Defaults.',
        calculation: 'total pipeline influence / total spend',
      },
      {
        term: 'Cost Efficiency Score',
        description: 'A 0–100 score that measures how efficiently a conference converts event spend into meaningful account engagement, meetings, and pipeline influence. The score is calculated using three benchmark-scored components: Cost per Company Engaged (30%), Cost per Meeting Held (20%), and Pipeline Influence per $1,000 Spent (50%). Each component is scored against fixed benchmark ranges with linear interpolation. The raw score may be adjusted by an event-type modifier.',
        calculation: 'weighted score = (Pipeline per $1k Score × 50%) + (Company Engaged Score × 30%) + (Meeting Held Score × 20%); adjusted = raw + event_type_modifier (capped 0–100)',
      },
      { term: 'Cost Efficiency Waterfall', description: 'A visual showing how each cost efficiency component contributed to the final Cost Efficiency Score.' },
      { term: 'Spend Allocation Breakdown', description: 'A breakdown of total conference spend by cost category.' },
      { term: 'Cost per Outcome Ladder', description: 'A ladder of per-outcome cost metrics showing what the conference cost per meaningful engagement or execution outcome.' },
      { term: 'Break-even / Pipeline Coverage', description: 'Compares total spend, required pipeline, and actual pipeline influence to show whether the event cleared its economic hurdle.' },
      { term: 'Cost Efficiency Quadrant', description: 'Portfolio comparison plotting conferences by cost per company engaged and pipeline influence per $1k spent.' },
      {
        term: 'Cost Efficiency Score Interpretation',
        description: 'Score ranges: 90–100 = Exceptional (exceptional cost efficiency — strong pipeline return and low cost per engagement); 75–89 = Strong (near-optimal cost-to-outcome ratio); 60–74 = Acceptable (some room for improvement); 50–59 = Weak (review cost allocation and engagement strategy); < 50 = Inefficient (significant underperformance relative to benchmarks).',
      },
      {
        term: 'Cost per ICP Interaction',
        description: 'Total effective conference spend divided by the number of ICP companies that received meaningful engagement.',
        calculation: 'total spend / ICP companies engaged',
      },
      {
        term: 'Efficiency Rank',
        description: 'This conference\'s Cost Efficiency Score ranked against all other conferences in the system. Rank 1 is the most efficient.',
      },
    ],
  },
  {
    title: 'Conversion Rate Defaults',
    items: [
      {
        term: 'Follow-Up Meeting Conversion Rate',
        description: 'The estimated percentage of held conference meetings that lead to a post-conference follow-up meeting. Set in Admin → Effectiveness Defaults.',
      },
      {
        term: 'Touchpoint Conversion Rate',
        description: 'The estimated percentage of conference touchpoints (where no meeting was held) that lead to a post-conference meeting. Set in Admin → Effectiveness Defaults.',
      },
      {
        term: 'Hosted Event Attendee Conversion Rate',
        description: 'The estimated percentage of Company Hosted event attendees (where no meeting or touchpoint occurred) that lead to a post-conference meeting. Set in Admin → Effectiveness Defaults.',
      },
      {
        term: 'Meetings Held Conversion Rate',
        description: 'The expected percentage of scheduled meetings that will be held. Used for planning benchmarks. Set in Admin → Effectiveness Defaults.',
      },
    ],
  },
];

export function DefinitionsTab() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (title: string) => setExpanded((prev: Record<string, boolean>) => ({ ...prev, [title]: !prev[title] }));

  return (
    <div className="p-6 space-y-2">
      {SECTIONS.map(section => (
        <div key={section.title} className="rounded-xl border border-gray-100 overflow-hidden">
          <button
            onClick={() => toggle(section.title)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <h3 className="text-sm font-bold uppercase tracking-wide text-brand-primary">{section.title}</h3>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded[section.title] ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expanded[section.title] && (
            <div className="p-4 space-y-3 border-t border-gray-100">
              {section.items.map(item => (
                <div key={item.term} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-brand-secondary mb-1">{item.term}</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{item.description}</p>
                  {item.calculation && (
                    <p className="text-xs text-gray-400 mt-1.5 font-mono leading-relaxed">
                      <span className="font-sans text-gray-500 not-italic">Formula: </span>{item.calculation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
