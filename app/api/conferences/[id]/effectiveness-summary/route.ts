import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are an executive/founder at a company with a large conference budget. Conferences are strategically important to the business because the company relies heavily on pipeline generation, sales acceleration, relationship development, and revenue influenced by conferences.

You are also an expert in conference event coordination, sales leadership, field marketing strategy, chief marketing officer-level audience and messaging evaluation, and post-conference performance analysis.

Your task is to write a thoughtful, executive-level narrative reviewing the performance of a conference that just ended. Base it only on the data provided. Write in plain English. Avoid jargon. Be candid and practical.

Use this structure, using markdown ## for section headers:

## Executive Summary
1–2 paragraphs summarizing overall effectiveness. State whether this was a strong, mixed, or weak performer.

## What Went Well
Strongest signals. Reference specific metrics. Explain commercial relevance.

## What Needs Work
Weakest or most concerning signals. Reference specific metrics. Explain the business risk.

## Sales Leadership Perspective
Did the sales team execute well? Meetings, follow-ups, pipeline distribution, rep-level performance.

## Marketing / CMO Perspective
Right audience? ICP engagement? Awareness vs. pipeline creation vs. net-new demand?

## Events Team Perspective
Operational efficiency? Cost per engagement? Staffing? Should the conference be expanded, maintained, optimized, reduced, or reconsidered?

## Recommendations for Next Conference
Specific, tactical recommendations — pre-booking, target account prioritization, follow-up discipline, sponsorship level, staffing mix, messaging.

## Final Decision
One of: Expand investment / Maintain investment / Maintain but optimize / Reduce investment / Reconsider attending. Support with data.

Important: Do not invent metrics. If a metric is missing, say analysis is limited by missing data. Distinguish confirmed performance from directional signals.`;

function formatData(data: Record<string, unknown>): string {
  const conf = (data.conference ?? {}) as Record<string, unknown>;
  const ces = (data.ces ?? {}) as Record<string, unknown>;
  const eng = (data.engagement ?? {}) as Record<string, unknown>;
  const pipe = (data.pipeline ?? {}) as Record<string, unknown>;
  const op = (data.operational ?? {}) as Record<string, unknown>;
  const aud = (data.audience ?? {}) as Record<string, unknown>;
  const costEff = (op.cost_efficiency ?? {}) as Record<string, unknown>;
  const repAttr = (pipe.rep_attribution ?? []) as Record<string, unknown>[];
  const repCES = (op.rep_ces ?? []) as Record<string, unknown>[];
  const icpCov = ((aud.icp_coverage ?? {}) as Record<string, unknown>);
  const senMix = (aud.seniority_mix ?? []) as Record<string, unknown>[];
  const netNew = (aud.net_new_logos ?? {}) as Record<string, unknown>;

  const n = (v: unknown, dec = 0) => v == null || Number.isNaN(Number(v)) ? 'N/A' : Number(v).toFixed(dec);
  const pct = (v: unknown) => v == null ? 'N/A' : `${n(v, 1)}%`;
  const $$ = (v: unknown) => v == null || Number(v) === 0 ? 'N/A' : `$${Math.round(Number(v)).toLocaleString()}`;

  const lines: string[] = [];

  lines.push(`CONFERENCE: ${conf.name ?? 'Unknown'}`);
  if (conf.start_date) lines.push(`DATES: ${conf.start_date}${conf.end_date ? ` – ${conf.end_date}` : ''}`);
  if (conf.location) lines.push(`LOCATION: ${conf.location}`);
  if (conf.conf_event_type) lines.push(`EVENT TYPE: ${String(conf.conf_event_type).replace(/_/g, ' ')}`);

  lines.push('');
  lines.push('## CONFERENCE EFFECTIVENESS SCORE (CES)');
  lines.push(`Overall CES: ${n(ces.score)}/100`);
  lines.push(`  ICP & Target Quality (20%): ${n(ces.dim1_icp_target, 1)}`);
  lines.push(`  Meeting Execution (20%): ${n(ces.dim2_meeting_exec, 1)}`);
  lines.push(`  Pipeline Influence Index (30%): ${n(ces.dim3_pipeline_index, 1)}`);
  lines.push(`  Engagement Breadth (5%): ${n(ces.dim4_breadth, 1)}`);
  lines.push(`  Cost Efficiency (10%): ${n(ces.dim7_cost_efficiency, 1)}`);
  lines.push(`  Follow-up Execution (10%): ${n(ces.dim5_followup, 1)}`);
  lines.push(`  Net-New Engaged (5%): ${n(ces.dim6_net_new, 1)}`);
  if (ces.target_pipeline_influence) lines.push(`  Target Pipeline Influence: ${$$(ces.target_pipeline_influence)}`);

  lines.push('');
  lines.push('## COST EFFICIENCY');
  lines.push(`Cost Efficiency Score: ${n(costEff.cost_efficiency_score)}/100 (${costEff.cost_efficiency_tier ?? 'N/A'})`);
  if (costEff.total_spend) lines.push(`Total Spend: ${$$(costEff.total_spend)}`);
  if (costEff.cost_per_company_engaged) lines.push(`Cost per Company Engaged: ${$$(costEff.cost_per_company_engaged)} (Score: ${n(costEff.company_engaged_score)} · ${costEff.company_engaged_tier ?? ''})`);
  if (costEff.cost_per_meeting_held) lines.push(`Cost per Meeting Held: ${$$(costEff.cost_per_meeting_held)} (Score: ${n(costEff.meeting_held_score)} · ${costEff.meeting_held_tier ?? ''})`);
  if (costEff.pipeline_influence_per_1k_spent) lines.push(`Pipeline per $1k Spent: ${$$(costEff.pipeline_influence_per_1k_spent)} (Score: ${n(costEff.pipeline_influence_score)} · ${costEff.pipeline_influence_tier ?? ''})`);
  if (costEff.cost_per_icp_interaction) lines.push(`Cost per ICP Interaction: ${$$(costEff.cost_per_icp_interaction)}`);
  if (op.conf_efficiency_rank) lines.push(`Efficiency Rank: #${op.conf_efficiency_rank} of ${op.conf_efficiency_total} conferences`);

  lines.push('');
  lines.push('## PIPELINE INFLUENCE');
  lines.push(`Total Pipeline Influence: ${$$(pipe.total_pipeline_influence)}`);
  if (pipe.icp_pipeline_influence) lines.push(`ICP Pipeline Influence: ${$$(pipe.icp_pipeline_influence)} (${pct(pipe.icp_pct_of_total)} of total)`);
  if (pipe.net_new_pipeline_influence) lines.push(`Net-New Pipeline Influence: ${$$(pipe.net_new_pipeline_influence)}`);
  if (pipe.high_engagement_influence) lines.push(`Multi-Touch (3+) Influence: ${$$(pipe.high_engagement_influence)} (${pct(pipe.high_engagement_pct)} of total)`);
  lines.push(`Companies Influencing Pipeline: ${n(pipe.companies_influencing)}`);
  lines.push(`High-Engagement Companies (3+): ${n(pipe.high_engagement_companies)}`);
  lines.push(`Two-Touch Companies: ${n(pipe.two_touch_companies)}`);
  lines.push(`Single-Touch Companies: ${n(pipe.single_touch_companies)}`);

  lines.push('');
  lines.push('## ENGAGEMENT');
  lines.push(`Total Companies at Conference: ${n(eng.total_companies)}`);
  lines.push(`Companies Engaged: ${n(eng.companies_engaged)} (${pct(eng.engagement_rate_pct)})`);
  lines.push(`Contacts Engaged: ${n(eng.contacts_engaged)} of ${n(eng.operator_contacts_total)}`);
  lines.push(`Meetings Scheduled: ${n(eng.total_scheduled)}`);
  lines.push(`Meetings Held: ${n(eng.total_held)} (Hold Rate: ${pct(eng.hold_rate_pct)})`);
  lines.push(`Follow-ups Created: ${n(eng.total_followups_created)}`);
  lines.push(`Follow-ups Completed: ${n(eng.total_followups_completed)} (${pct(eng.followup_completion_rate_pct)})`);
  lines.push(`Follow-up Scheduling Rate (% of met companies with FU): ${pct(eng.fu_scheduling_rate_pct)}`);
  lines.push(`Multi-Touch Companies: ${n(eng.multi_touch_companies)} (${pct(eng.multi_touch_rate_pct)})`);
  if (eng.targets_total) lines.push(`Target Accounts: ${n(eng.target_companies_engaged)} of ${n(eng.targets_total)} engaged (${pct(eng.target_engagement_pct)})`);

  lines.push('');
  lines.push('## AUDIENCE QUALITY');
  lines.push(`ICP Companies at Conference: ${n(icpCov.icp_companies_total)}`);
  lines.push(`ICP Companies Engaged: ${n(icpCov.icp_companies_engaged)} (${pct(icpCov.icp_company_engagement_pct)})`);
  lines.push(`ICP Attendees: ${n(icpCov.icp_attendees)} of ${n(icpCov.total_attendees)} (${pct(icpCov.icp_attendee_coverage_pct)})`);
  lines.push(`Net-New Logos: ${n(netNew.net_new_logos)} (${pct(netNew.net_new_rate_pct)} of engaged companies)`);
  if (senMix.length > 0) {
    lines.push('Seniority Mix (engaged):');
    senMix.slice(0, 6).forEach(s => {
      lines.push(`  ${s.seniority ?? 'Unknown'}: ${n(s.engaged_count)} engaged of ${n(s.total_count)} total (${pct(s.engagement_pct)})`);
    });
  }

  if (repAttr.length > 0) {
    lines.push('');
    lines.push('## REP PERFORMANCE');
    repAttr.forEach(r => {
      lines.push(`${r.rep}: ${n(r.meetings_held)} meetings held / ${n(r.meetings_scheduled)} scheduled, ${n(r.unique_companies_met)} companies, $${Math.round(Number(r.pipeline_influence_attributed)).toLocaleString()} pipeline (${n(r.contribution_pct, 1)}% contribution)`);
    });
  }

  if (repCES.length > 0) {
    lines.push('');
    lines.push('## CES BY REP');
    repCES.forEach(r => {
      lines.push(`${r.rep}: Score ${n(r.rep_ces_score)} (${r.rep_ces_tier ?? ''}) | ICP: ${n(r.rep_dim1_icp_target, 0)} | Mtg: ${n(r.rep_dim2_meeting_exec, 0)} | Pipeline: ${n(r.rep_dim3_pipeline_index, 0)} | Breadth: ${n(r.rep_dim4_breadth, 0)} | Cost: ${n(r.rep_dim5_cost_efficiency, 0)} | FU: ${n(r.rep_dim6_followup, 0)} | Net-New: ${n(r.rep_dim7_net_new, 0)}`);
    });
  }

  return lines.join('\n');
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as { data: Record<string, unknown> };
    const formattedData = formatData(body.data ?? {});

    const client = new Anthropic();
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please write the Conference Effectiveness Summary narrative using the structure from your instructions.\n\nData from Conference Effectiveness Modal:\n\n${formattedData}`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        stream.on('text', (text: string) => {
          controller.enqueue(encoder.encode(text));
        });
        stream.on('finalMessage', () => {
          controller.close();
        });
        stream.on('error', (err: Error) => {
          controller.error(err);
        });
      },
      cancel() {
        stream.abort();
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
