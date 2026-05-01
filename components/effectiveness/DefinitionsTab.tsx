'use client';

import { useState } from 'react';

interface Def {
  term: string;
  description: string;
  calculation?: string;
}

const SECTIONS: { title: string; items: Def[] }[] = [
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
        description: 'Measures how efficiently conference spend was converted into pipeline influence, relative to the expected return target set in Effectiveness Defaults.',
        calculation: 'MIN(total pipeline influence / (total spend × expected return target), 1) × 100',
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
        description: 'The percentage of pre-designated target attendees whose companies received engagement.',
        calculation: 'engaged targets / total targets × 100',
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
        description: 'A 0–100 score measuring how efficiently conference spend was converted into pipeline influence relative to the expected return on event cost target.',
        calculation: 'MIN(total pipeline influence / (total spend × expected return target), 1) × 100',
      },
      {
        term: 'Cost Efficiency Score Interpretation',
        description: 'Score ranges: 80–100 = Excellent (at or above expected ROI); 60–79 = Good (near target); 40–59 = Fair (below target, review cost allocation); 20–39 = Poor (significant underperformance); 0–19 = Critical (minimal return relative to investment).',
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
