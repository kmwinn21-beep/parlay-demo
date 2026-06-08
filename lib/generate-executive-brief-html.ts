import type { SeriesYoYData } from './get-series-yoy-data';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConferenceRecord = Record<string, unknown>;
type ConferenceSnapshot = Record<string, unknown>;

// ─── Formatting utilities (no imports) ───────────────────────────────────────

function fmt$(val: number | null | undefined): string {
  if (val == null) return '—';
  return '$' + Math.round(val).toLocaleString();
}

function fmtFull$(val: number | null | undefined): string {
  if (val == null) return '—';
  return '$' + Math.round(val).toLocaleString();
}

function fmtPct(val: number | null | undefined): string {
  if (val == null) return '—';
  return Math.round(val * 100) + '%';
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtRange(s: string, e: string): string {
  const sd = new Date(s + 'T00:00:00'), ed = new Date(e + 'T00:00:00');
  return sd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' +
    ed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function tierInfo(score: number | null): { l: string; c: string } {
  if (!score) return { l: '—', c: '#94A3B8' };
  if (score >= 90) return { l: 'Elite', c: '#0C447C' };
  if (score >= 75) return { l: 'Strong', c: '#0C447C' };
  if (score >= 60) return { l: 'Moderate', c: '#854F0B' };
  if (score >= 50) return { l: 'Weak', c: '#A32D2D' };
  return { l: 'Inefficient', c: '#A32D2D' };
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Benchmark helpers ────────────────────────────────────────────────────────

function pipelinePerKBench(val: number | null): { label: string; bg: string; text: string } | null {
  if (val == null) return null;
  if (val >= 10000) return { label: 'Elite',   bg: '#EAF3DE', text: '#3B6D11' };
  if (val >= 6000)  return { label: 'Strong',  bg: '#EAF3DE', text: '#3B6D11' };
  if (val >= 3500)  return { label: 'Healthy', bg: '#FAEEDA', text: '#633806' };
  if (val >= 1500)  return { label: 'Weak',    bg: '#FCEBEB', text: '#A32D2D' };
  return                   { label: 'Poor',    bg: '#FCEBEB', text: '#A32D2D' };
}

function costPerCompanyBench(val: number | null): { label: string; bg: string; text: string } | null {
  if (val == null) return null;
  if (val <= 350)  return { label: 'Elite',   bg: '#EAF3DE', text: '#3B6D11' };
  if (val <= 650)  return { label: 'Strong',  bg: '#EAF3DE', text: '#3B6D11' };
  if (val <= 1000) return { label: 'Healthy', bg: '#FAEEDA', text: '#633806' };
  if (val <= 1600) return { label: 'Weak',    bg: '#FCEBEB', text: '#A32D2D' };
  return                  { label: 'Poor',    bg: '#FCEBEB', text: '#A32D2D' };
}

function costPerMeetingBench(val: number | null): { label: string; bg: string; text: string } | null {
  if (val == null) return null;
  if (val <= 400)  return { label: 'Elite',   bg: '#EAF3DE', text: '#3B6D11' };
  if (val <= 700)  return { label: 'Strong',  bg: '#EAF3DE', text: '#3B6D11' };
  if (val <= 1100) return { label: 'Healthy', bg: '#FAEEDA', text: '#633806' };
  if (val <= 1800) return { label: 'Weak',    bg: '#FCEBEB', text: '#A32D2D' };
  return                  { label: 'Poor',    bg: '#FCEBEB', text: '#A32D2D' };
}

// ─── Recommendation logic (mirrors ExecutiveBriefDrawer.tsx) ─────────────────

type RecAction = 'attend' | 'attend_conditional' | 'review';
type RecResult = {
  action: RecAction;
  label: string;
  boxBg: string;
  boxBorder: string;
  textColor: string;
};

function getRecommendation(
  cesScore: number | null,
  seriesYoY: SeriesYoYData | null,
  conferenceId: number,
): RecResult {
  if (!cesScore) return {
    action: 'review',
    label: 'Review before committing to',
    boxBg: '#FCEBEB', boxBorder: '#F5C6C6', textColor: '#791F1F',
  };

  const instances = seriesYoY?.instances ?? [];
  const prev = instances.length >= 2 ? instances[instances.length - 2] : null;
  const trend = prev?.cesScore != null ? cesScore - prev.cesScore : null;

  if (cesScore >= 75) return {
    action: 'attend',
    label: 'Attend',
    boxBg: '#EAF3DE', boxBorder: '#C0DD97', textColor: '#27500A',
  };

  if (cesScore >= 60 && (trend === null || trend >= 0)) return {
    action: 'attend',
    label: 'Attend',
    boxBg: '#EAF3DE', boxBorder: '#C0DD97', textColor: '#27500A',
  };

  if (cesScore >= 60 && trend !== null && trend < 0) return {
    action: 'attend_conditional',
    label: 'Reduce footprint or improve execution at',
    boxBg: '#FAEEDA', boxBorder: '#FAC775', textColor: '#854F0B',
  };

  return {
    action: 'review',
    label: 'Review before committing to',
    boxBg: '#FCEBEB', boxBorder: '#F5C6C6', textColor: '#791F1F',
  };
}

function generateRationale(
  snap: ConferenceSnapshot,
  confName: string,
  seriesYoY: SeriesYoYData | null,
  rec: RecResult,
  cesScore: number | null,
): string {
  const ces = cesScore ?? 0;
  const tier = tierInfo(ces).l;
  const strategyName = snap['strategy_name'] != null && snap['strategy_name'] !== '' ? String(snap['strategy_name']) : 'defined';
  const icpEngaged = snap['icp_companies_engaged'] != null ? Number(snap['icp_companies_engaged']) : null;
  const icpTotal = snap['icp_companies_total'] != null ? Number(snap['icp_companies_total']) : null;
  const pipelineInfluenced = snap['pipeline_influenced'] != null ? Number(snap['pipeline_influenced']) : null;
  const engRate = icpEngaged != null ? Math.round((Number(snap['icp_engagement_rate'] ?? 0)) * 100) : 0;
  const missed = icpTotal != null && icpEngaged != null ? icpTotal - icpEngaged : 0;

  const instances = seriesYoY?.instances ?? [];
  const prev = instances.length >= 2 ? instances[instances.length - 2] : null;
  const trend = prev?.cesScore != null ? ces - prev.cesScore : null;

  const baseText =
    `${confName} delivered a CES of ${ces} (${tier}) against a ${strategyName} strategy. ` +
    `${icpEngaged ?? '—'} of ${icpTotal ?? '—'} ICP companies were engaged (${engRate}% engagement rate). ` +
    (missed > 0 ? `${missed} ICP companies were present but not engaged, representing an estimated ${fmt$(
      pipelineInfluenced != null && icpEngaged != null && icpEngaged > 0
        ? (pipelineInfluenced / icpEngaged) * missed
        : null
    )} in addressable pipeline. ` : '') +
    (trend !== null ? `CES has ${trend > 0 ? 'improved' : 'declined'} ${Math.abs(trend)} points year-over-year. ` : '');

  if (rec.action === 'attend_conditional' && prev) {
    const commitments: string[] = [];

    const icpEngRate = snap['icp_engagement_rate'] != null ? Number(snap['icp_engagement_rate']) : 0;
    const engDelta = icpEngRate - (prev.icpEngagementRate ?? 0);
    if (engDelta < -0.03) {
      const targetRate = Math.round(((prev.icpEngagementRate ?? 0) + 0.05) * 100);
      commitments.push(`ICP engagement rate above ${targetRate}% (vs. ${engRate}% in this cycle)`);
    }

    const holdCurrent = Math.round((Number(snap['meeting_hold_rate'] ?? 0)) * 100);
    const holdPrev = Math.round((prev.meetingHoldRate ?? 0) * 100);
    if (holdCurrent < holdPrev - 5) {
      commitments.push(`Meeting hold rate above ${holdPrev}% through pre-conference confirmation outreach`);
    }

    const fuCurrent = Math.round((Number(snap['followup_completion_rate'] ?? 0)) * 100);
    const fuPrev = Math.round((prev.followupCompletionRate ?? 0) * 100);
    if (fuCurrent < fuPrev - 5) {
      commitments.push(`Follow-up completion rate above ${fuPrev}% within 14 days post-conference`);
    }

    if (engRate < 25) {
      const targetEngaged = Math.round((icpTotal ?? 0) * 0.30);
      commitments.push(`Minimum ${targetEngaged} ICP companies engaged (top targets pre-identified before arrival)`);
    }

    if (commitments.length > 0) {
      return baseText.trim() + '\n\n' +
        `To justify continued investment, the team should commit to: ${commitments.join('; ')}. ` +
        `These targets give leadership a basis for conditional approval and the team a clear execution benchmark for the next cycle.`;
    }
  }

  return baseText.trim();
}

// ─── Budget line items parser ─────────────────────────────────────────────────

function parseBudgetLineItems(raw: string | null): Array<{ name: string; budget: number; actual: number }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const parseDollar = (v: unknown) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;
    return (parsed as unknown[])
      .filter((item: unknown) => item && typeof item === 'object')
      .map((item: unknown) => {
        const obj = item as Record<string, unknown>;
        return {
          name: String(obj['label'] ?? obj['name'] ?? obj['category'] ?? 'Item'),
          budget: parseDollar(obj['budget']),
          actual: parseDollar(obj['actual']) || parseDollar(obj['budget']),
        };
      })
      .filter(item => item.budget > 0 || item.actual > 0);
  } catch {
    return [];
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateExecutiveBriefHTML(data: {
  conference: ConferenceRecord;
  snapshot: ConferenceSnapshot;
  seriesYoY: SeriesYoYData | null;
  baseUrl?: string;
}): string {

  const baseUrl = data.baseUrl ?? '';

  // ── Snapshot field accessors ──────────────────────────────────────────────
  const n = (key: string): number | null => {
    const v = Number(data.snapshot[key]);
    return isNaN(v) ? null : v;
  };
  const s = (key: string): string | null => {
    const v = data.snapshot[key];
    return v != null && v !== '' ? String(v) : null;
  };

  const conf = {
    name: String(data.conference.name ?? ''),
    start_date: String(data.conference.start_date ?? ''),
    end_date: String(data.conference.end_date ?? ''),
    internal_attendees: data.conference.internal_attendees != null ? String(data.conference.internal_attendees) : null,
  };

  // Internal headcount
  const internalHeadcount = conf.internal_attendees
    ? conf.internal_attendees.split(',').filter(Boolean).length
    : null;

  // Derived values
  const actualTotal = n('actual_total') ?? n('budget_total') ?? n('total_cost');
  const cesScore = n('ces_score');
  const costEffScore = n('cost_efficiency_score');

  // Conference id for YoY current row detection
  const conferenceId = Number(data.conference.id ?? 0);

  // Recommendation
  const rec = getRecommendation(cesScore, data.seriesYoY, conferenceId);
  const rationale = generateRationale(data.snapshot, conf.name, data.seriesYoY, rec, cesScore);

  // Budget multiplier
  const budgetMultiplier =
    rec.action === 'attend' ? 1.05 :
    rec.action === 'attend_conditional' ? 0.9 :
    0.9;
  const proposedNextBudget = actualTotal != null ? actualTotal * budgetMultiplier : null;
  const budgetSubLabel =
    rec.action === 'attend' ? '+5% vs. actual' :
    rec.action === 'attend_conditional' ? '−10% vs. actual — subject to execution targets' :
    '−10% vs. actual';

  // YoY
  const yoyInstances = data.seriesYoY?.instances ?? [];
  const hasYoY = yoyInstances.length >= 2;

  // Missed opportunity
  const icpTotal = n('icp_companies_total');
  const icpEngaged = n('icp_companies_engaged');
  const pipelineInfluenced = n('pipeline_influenced');
  const missedCount = (icpTotal ?? 0) - (icpEngaged ?? 0);
  const avgPipelinePerCompany = icpEngaged != null && icpEngaged > 0 && pipelineInfluenced != null
    ? pipelineInfluenced / icpEngaged : 0;
  const estimatedMissedPipeline = avgPipelinePerCompany * Math.max(missedCount, 0);
  const engagementPct = icpTotal != null && icpTotal > 0 && icpEngaged != null
    ? (icpEngaged / icpTotal) * 100 : 0;

  // Snapshot taken at
  const snapshotAt = s('snapshot_taken_at');
  const snapshotDisplay = snapshotAt
    ? new Date(snapshotAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // ── HTML helpers ────────────────────────────────────────────────────────────

  function pageHeader(): string {
    const dateRange = conf.end_date ? fmtRange(conf.start_date, conf.end_date) : fmtDate(conf.start_date);
    const generated = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const meta = [s('strategy_name'), s('sponsorship_level')].filter(Boolean).join(' · ');
    return `<div style="-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#223A5E;padding:16px 24px 14px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <p style="font-size:9px;font-weight:600;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.1em;margin:0 0 3px">Executive brief</p>
      <p style="font-size:18px;font-weight:600;color:#FFFFFF;margin:0;line-height:1.2">${escHtml(conf.name)}</p>
      <p style="font-size:10px;color:rgba(255,255,255,.5);margin:4px 0 0">${escHtml(dateRange)}${meta ? ' · ' + escHtml(meta) : ''}</p>
    </div>
    <div style="text-align:right">
      <img src="${baseUrl}/ParlayLogoWhite_New.png" alt="Parlay" style="height:22px;display:block;margin-left:auto" />
      <p style="font-size:9px;color:rgba(255,255,255,.35);margin:5px 0 0">Generated ${generated}</p>
    </div>
  </div>`;
  }

  function pageFooter(page: number): string {
    return `<div style="margin-top:24px;padding-top:10px;border-top:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between">
    <img src="${baseUrl}/ParlayLogoColor_New.png" alt="Parlay" style="height:13px;display:block" />
    <p style="font-size:9px;color:#94A3B8;margin:0">${escHtml(conf.name)} · Executive brief · Page ${page} of 3</p>
  </div>`;
  }

  function eyebrow(num: string, label: string): string {
    return `<p style="font-size:9px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:.1em;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid #F1F5F9">${num} — ${label}</p>`;
  }

  function statCard(label: string, value: string, sub?: string): string {
    // Always render the sub line (transparent when absent) so all cards are the same height
    const subLine = sub
      ? `<p style="font-size:9px;color:#94A3B8;margin:2px 0 0">${escHtml(sub)}</p>`
      : `<p style="font-size:9px;color:transparent;margin:2px 0 0" aria-hidden="true">·</p>`;
    return `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:8px 10px;border-left:3px solid #185FA5">
    <p style="font-size:9px;color:#64748B;margin:0 0 3px">${escHtml(label)}</p>
    <p style="font-size:15px;font-weight:600;color:#1E293B;margin:0">${escHtml(value)}</p>
    ${subLine}
  </div>`;
  }

  function benchBadge(bench: { label: string; bg: string; text: string } | null): string {
    if (!bench) return '';
    return `<span style="display:inline-block;font-size:8px;font-weight:600;padding:2px 6px;border-radius:9999px;background:${bench.bg};color:${bench.text}">${escHtml(bench.label)}</span>`;
  }

  function dimBar(label: string, pctValue: number | null, barColor: string, displayVal: string, tierLabel: string, tierColor: string): string {
    const pct = pctValue != null ? Math.min(Math.max(pctValue, 0), 100) : 0;
    const rem = 100 - pct;
    return `<tr>
      <td style="font-size:9px;color:#475569;width:140px;padding:3px 8px 3px 0;white-space:nowrap">${escHtml(label)}</td>
      <td style="padding:3px 6px 3px 0">
        <table style="width:100%;border-collapse:collapse"><tr>
          <td style="background:${barColor};width:${pct}%;height:6px;border-radius:3px 0 0 3px"></td>
          <td style="background:#F1F5F9;width:${rem}%;height:6px;border-radius:0 3px 3px 0"></td>
        </tr></table>
      </td>
      <td style="font-size:9px;font-weight:600;color:#1E293B;width:36px;text-align:right;padding:3px 6px 3px 0">${escHtml(displayVal)}</td>
      <td style="font-size:8px;font-weight:600;color:${tierColor};width:56px;text-align:right;padding:3px 0">${escHtml(tierLabel)}</td>
    </tr>`;
  }

  // ── Page 1 — Investment ─────────────────────────────────────────────────────

  const sponsorshipLevel = s('sponsorship_level');
  const strategyName = s('strategy_name');
  const boothPresent = n('booth_present');
  const boothNumber = s('booth_number');
  const boothWidth = n('booth_width');
  const boothLength = n('booth_length');

  const metaPills = [
    sponsorshipLevel && sponsorshipLevel !== 'none'
      ? `<span style="display:inline-flex;align-items:center;font-size:9px;font-weight:600;border-radius:9999px;padding:3px 8px;background:#FAEEDA;color:#633806;border:1px solid #FAC775">${escHtml(sponsorshipLevel)}</span>`
      : '',
    strategyName
      ? `<span style="display:inline-flex;align-items:center;font-size:9px;font-weight:600;border-radius:9999px;padding:3px 8px;background:#E6F1FB;color:#0C447C;border:1px solid #B5D4F4">${escHtml(strategyName)}</span>`
      : '',
    `<span style="display:inline-flex;align-items:center;font-size:9px;font-weight:600;border-radius:9999px;padding:3px 8px;background:#F3F0FF;color:#5B3CC4;border:1px solid #C4B5FD">${
      boothPresent
        ? escHtml(`Booth #${boothNumber ?? '—'} · ${boothWidth ?? '?'}×${boothLength ?? '?'} ft`)
        : 'No booth'
    }</span>`,
  ].filter(Boolean).join(' ');

  const budgetVariance = n('budget_variance');
  const budgetVarianceStr = budgetVariance == null ? '—'
    : budgetVariance < 0 ? `-${fmt$(Math.abs(budgetVariance))}`
    : budgetVariance > 0 ? `+${fmt$(budgetVariance)}`
    : '$0';
  const budgetVarianceSub = budgetVariance == null ? undefined
    : budgetVariance < 0 ? 'Under budget'
    : budgetVariance > 0 ? 'Over budget'
    : 'On budget';

  const cpInternalAttendee = n('cost_per_internal_attendee') ??
    (internalHeadcount && internalHeadcount > 0 && actualTotal != null ? actualTotal / internalHeadcount : null);

  const lineItems = parseBudgetLineItems(s('budget_line_items'));

  let budgetTableHtml = '';
  if (lineItems.length > 0) {
    const rows = lineItems.map((item, i) => {
      const varianceDollar = item.actual - item.budget;
      const variancePct = item.budget > 0 ? (varianceDollar / item.budget) * 100 : 0;
      const over = varianceDollar > 0;
      const rowBg = i % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
      const pillBg = over ? '#FCEBEB' : '#EAF3DE';
      const pillColor = over ? '#A32D2D' : '#3B6D11';
      return `<tr style="background:${rowBg}">
        <td style="padding:5px 8px 5px 0;font-size:9px;color:#475569">${escHtml(item.name)}</td>
        <td style="padding:5px 6px;text-align:right;font-size:9px;color:#475569">${fmtFull$(item.budget)}</td>
        <td style="padding:5px 6px;text-align:right;font-size:9px;color:#475569">${fmtFull$(item.actual)}</td>
        <td style="padding:5px 6px;text-align:right">
          <span style="display:inline-block;padding:1px 5px;border-radius:9999px;font-size:8px;font-weight:600;background:${pillBg};color:${pillColor}">${over ? '+' : ''}${fmtFull$(varianceDollar)}</span>
        </td>
        <td style="padding:5px 0 5px 6px;text-align:right">
          <span style="display:inline-block;padding:1px 5px;border-radius:9999px;font-size:8px;font-weight:600;background:${pillBg};color:${pillColor}">${over ? '+' : ''}${variancePct.toFixed(1)}%</span>
        </td>
      </tr>`;
    }).join('');

    const totalBudget = lineItems.reduce((acc, item) => acc + item.budget, 0);
    const totalActual = lineItems.reduce((acc, item) => acc + item.actual, 0);
    const totalDollar = totalActual - totalBudget;
    const totalPct = totalBudget > 0 ? (totalDollar / totalBudget) * 100 : 0;
    const totalOver = totalDollar > 0;
    const totalPillBg = totalOver ? '#FCEBEB' : '#EAF3DE';
    const totalPillColor = totalOver ? '#A32D2D' : '#3B6D11';

    budgetTableHtml = `
    <div style="margin-top:14px">
      <p style="font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#94A3B8;margin:0 0 6px">Budget vs. Actual</p>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid #E2E8F0">
            <th style="text-align:left;font-size:8px;font-weight:600;color:#64748B;padding-bottom:5px;padding-right:8px">Line item</th>
            <th style="text-align:right;font-size:8px;font-weight:600;color:#64748B;padding-bottom:5px;padding:0 6px 5px">Budget</th>
            <th style="text-align:right;font-size:8px;font-weight:600;color:#64748B;padding-bottom:5px;padding:0 6px 5px">Actual</th>
            <th style="text-align:right;font-size:8px;font-weight:600;color:#64748B;padding-bottom:5px;padding:0 6px 5px">Variance ($)</th>
            <th style="text-align:right;font-size:8px;font-weight:600;color:#64748B;padding-bottom:5px;padding:0 0 5px 6px">Variance (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="border-top:2px solid #E2E8F0">
            <td style="padding:5px 8px 5px 0;font-size:9px;font-weight:600;color:#1E293B">Total</td>
            <td style="padding:5px 6px;text-align:right;font-size:9px;font-weight:600;color:#1E293B">${fmtFull$(totalBudget)}</td>
            <td style="padding:5px 6px;text-align:right;font-size:9px;font-weight:600;color:#1E293B">${fmtFull$(totalActual)}</td>
            <td style="padding:5px 6px;text-align:right">
              <span style="display:inline-block;padding:1px 5px;border-radius:9999px;font-size:8px;font-weight:600;background:${totalPillBg};color:${totalPillColor}">${totalOver ? '+' : ''}${fmtFull$(totalDollar)}</span>
            </td>
            <td style="padding:5px 0 5px 6px;text-align:right">
              <span style="display:inline-block;padding:1px 5px;border-radius:9999px;font-size:8px;font-weight:600;background:${totalPillBg};color:${totalPillColor}">${totalOver ? '+' : ''}${totalPct.toFixed(1)}%</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  const page1Content = `
  <div style="margin-bottom:16px">${metaPills}</div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
    <tr>
      <td style="width:20%;padding-right:6px;vertical-align:top">${statCard('Total spend', fmt$(actualTotal), n('budget_total') != null ? `Budget: ${fmt$(n('budget_total'))}` : undefined)}</td>
      <td style="width:20%;padding:0 6px;vertical-align:top">${statCard('Budget variance', budgetVarianceStr, budgetVarianceSub)}</td>
      <td style="width:20%;padding:0 6px;vertical-align:top">${statCard('Cost per company', fmt$(n('cost_per_company_engaged')), icpEngaged != null ? `${icpEngaged} engaged` : undefined)}</td>
      <td style="width:20%;padding:0 6px;vertical-align:top">${statCard('Cost per meeting', fmt$(n('cost_per_meeting_held')))}</td>
      <td style="width:20%;padding-left:6px;vertical-align:top">${statCard('Cost per internal attendee', fmt$(cpInternalAttendee), internalHeadcount != null ? `${internalHeadcount} attendees` : undefined)}</td>
    </tr>
  </table>
  ${budgetTableHtml}`;

  // ── Page 2 — Return + Execution quality + Missed opportunity ───────────────

  const cesDesc = cesScore == null
    ? 'No score available.'
    : cesScore >= 75
    ? 'Strong execution across ICP engagement, meeting hold rate, and pipeline influence.'
    : cesScore >= 60
    ? 'Moderate performance — review ICP engagement and follow-up completion for improvement.'
    : 'Below-average conference execution. Focus on meeting hold rate and ICP targeting quality.';

  const costEffDesc = costEffScore == null
    ? 'No score available.'
    : costEffScore >= 75
    ? 'Cost per company and pipeline per $1K are tracking at benchmark or better.'
    : costEffScore >= 60
    ? 'Cost efficiency is acceptable but has room to improve on pipeline per $1K.'
    : 'Cost per outcome is above benchmark. Consider renegotiating sponsorship or reducing booth size.';

  const cesTier = tierInfo(cesScore);
  const costEffTier = tierInfo(costEffScore);

  const pipelineNetNew = n('pipeline_net_new');
  const pipelineContinued = n('pipeline_continued_engagement');
  const requiredPipelineAmount = n('required_pipeline_amount');
  const pipelinePerK = n('pipeline_per_1k');
  const costPerCompany = n('cost_per_company_engaged');
  const costPerMeeting = n('cost_per_meeting_held');

  const netNewLogos = pipelineNetNew != null && pipelineInfluenced != null && pipelineInfluenced > 0 && icpEngaged != null
    ? Math.round((pipelineNetNew / pipelineInfluenced) * icpEngaged)
    : null;

  const decisionMakersEngaged = n('decision_makers_engaged');

  // Pipeline target pill
  let pipelineTargetPill = '';
  if (requiredPipelineAmount != null && pipelineInfluenced != null) {
    const met = pipelineInfluenced >= requiredPipelineAmount;
    pipelineTargetPill = `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;border:1px solid ${met ? '#C0DD97' : '#F5C6C6'};background:${met ? '#EAF3DE' : '#FCEBEB'};font-size:9px;font-weight:600;color:${met ? '#27500A' : '#A32D2D'};margin-top:8px">
      ${met ? '✓' : '✗'} ${met ? 'Pipeline target met' : 'Pipeline target missed'}
    </div>`;
  }

  // Dim bars
  const icpEngRate = n('icp_engagement_rate');
  const meetingHoldRate = n('meeting_hold_rate');
  const followupSchedulingRate = n('followup_scheduling_rate');
  const followupCompletionRate = n('followup_completion_rate');
  const buyingCommitteeRate = n('buying_committee_coverage_rate');
  const avgHealthScore = n('avg_health_score_engaged');
  const returningAttendeeRate = n('returning_attendee_rate');

  function dimTier(pctVal: number | null): { l: string; c: string } {
    return tierInfo(pctVal);
  }

  const dimBarsHtml = `<table style="width:100%;border-collapse:collapse;margin-bottom:12px">
    ${dimBar('ICP engagement rate', icpEngRate != null ? icpEngRate * 100 : null, '#185FA5',
      icpEngRate != null ? `${Math.round(icpEngRate * 100)}%` : '—',
      dimTier(icpEngRate != null ? icpEngRate * 100 : null).l, dimTier(icpEngRate != null ? icpEngRate * 100 : null).c)}
    ${dimBar('Meeting hold rate', meetingHoldRate != null ? meetingHoldRate * 100 : null, '#185FA5',
      meetingHoldRate != null ? `${Math.round(meetingHoldRate * 100)}%` : '—',
      dimTier(meetingHoldRate != null ? meetingHoldRate * 100 : null).l, dimTier(meetingHoldRate != null ? meetingHoldRate * 100 : null).c)}
    ${dimBar('Follow-up scheduling', followupSchedulingRate != null ? followupSchedulingRate * 100 : null, '#1D9E75',
      followupSchedulingRate != null ? `${Math.round(followupSchedulingRate * 100)}%` : '—',
      dimTier(followupSchedulingRate != null ? followupSchedulingRate * 100 : null).l, dimTier(followupSchedulingRate != null ? followupSchedulingRate * 100 : null).c)}
    ${dimBar('Follow-up completion', followupCompletionRate != null ? followupCompletionRate * 100 : null, '#1D9E75',
      followupCompletionRate != null ? `${Math.round(followupCompletionRate * 100)}%` : '—',
      dimTier(followupCompletionRate != null ? followupCompletionRate * 100 : null).l, dimTier(followupCompletionRate != null ? followupCompletionRate * 100 : null).c)}
    ${dimBar('Buying committee coverage', buyingCommitteeRate != null ? buyingCommitteeRate * 100 : null, '#185FA5',
      buyingCommitteeRate != null ? `${Math.round(buyingCommitteeRate * 100)}%` : '—',
      dimTier(buyingCommitteeRate != null ? buyingCommitteeRate * 100 : null).l, dimTier(buyingCommitteeRate != null ? buyingCommitteeRate * 100 : null).c)}
    ${dimBar('Avg health score', avgHealthScore, '#7F77DD',
      avgHealthScore != null ? `${Math.round(avgHealthScore)}` : '—',
      dimTier(avgHealthScore).l, dimTier(avgHealthScore).c)}
    ${dimBar('Returning attendee rate', returningAttendeeRate != null ? returningAttendeeRate * 100 : null, '#7F77DD',
      returningAttendeeRate != null ? `${Math.round(returningAttendeeRate * 100)}%` : '—',
      returningAttendeeRate != null
        ? dimTier(returningAttendeeRate * 100).l
        : 'First year',
      returningAttendeeRate != null ? dimTier(returningAttendeeRate * 100).c : '#94A3B8')}
  </table>`;

  function countCard(label: string, value: string): string {
    return `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:8px;text-align:center">
      <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0">${escHtml(value)}</p>
      <p style="font-size:8px;color:#64748B;margin:3px 0 0;line-height:1.3">${escHtml(label)}</p>
    </div>`;
  }

  // Missed opportunity bar
  const missedBarEngPct = Math.min(Math.max(engagementPct, 0), 100);
  const missedBarRemPct = 100 - missedBarEngPct;

  const missedOppHtml = icpTotal != null && icpEngaged != null ? `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:6px;background:#FFF7ED;border:1px solid #FAC775;margin-bottom:10px">
      <div>
        <p style="font-size:10px;font-weight:600;color:#854F0B;margin:0 0 4px">${missedCount} ICP-matched companies attended but were not engaged</p>
        <p style="font-size:10px;color:#854F0B;margin:0">Estimated <strong>${fmt$(estimatedMissedPipeline)}</strong> in addressable pipeline influenced present but not touched.</p>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <div style="min-width:60px">
        <p style="font-size:18px;font-weight:600;color:#1E293B;margin:0">${missedCount}</p>
        <p style="font-size:9px;color:#64748B;margin:2px 0 0">Not engaged</p>
      </div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;font-size:8px;color:#94A3B8;margin-bottom:4px">
          <span>Engaged: ${icpEngaged} (${Math.round(engagementPct)}%)</span>
          <span>Total ICP: ${icpTotal}</span>
        </div>
        <table style="width:100%;border-collapse:collapse"><tr>
          <td style="background:#34D399;width:${missedBarEngPct}%;height:8px;border-radius:4px 0 0 4px"></td>
          <td style="background:#F1F5F9;width:${missedBarRemPct}%;height:8px;border-radius:0 4px 4px 0"></td>
        </tr></table>
      </div>
    </div>` : '<p style="font-size:10px;color:#94A3B8">ICP data unavailable.</p>';

  const page2Content = `
  ${eyebrow('02', 'Return')}

  <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
    <tr>
      <td style="width:50%;padding-right:8px;vertical-align:top">
        <div style="background:#E6F1FB;border:1px solid #B5D4F4;border-radius:8px;padding:12px;height:100%;box-sizing:border-box">
          <p style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#0C447C;margin:0 0 6px">Conference effectiveness</p>
          <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:4px">
            <span style="font-size:28px;font-weight:500;color:#223A5E">${cesScore ?? '—'}</span>
            <span style="font-size:11px;color:#B5D4F4">/100</span>
          </div>
          <p style="font-size:10px;font-weight:600;color:${cesTier.c};margin:0 0 6px">${cesTier.l}</p>
          <p style="font-size:9px;color:#185FA5;line-height:1.5;margin:0">${escHtml(cesDesc)}</p>
        </div>
      </td>
      <td style="width:50%;padding-left:8px;vertical-align:top">
        <div style="background:#EAF3DE;border:1px solid #C0DD97;border-radius:8px;padding:12px;height:100%;box-sizing:border-box">
          <p style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#27500A;margin:0 0 6px">Cost efficiency</p>
          <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:4px">
            <span style="font-size:28px;font-weight:500;color:#3B6D11">${costEffScore ?? '—'}</span>
            <span style="font-size:11px;color:#C0DD97">/100</span>
          </div>
          <p style="font-size:10px;font-weight:600;color:${costEffTier.c};margin:0 0 6px">${costEffTier.l}</p>
          <p style="font-size:9px;color:#3B6D11;line-height:1.5;margin:0">${escHtml(costEffDesc)}</p>
        </div>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
    <tr>
      <td style="width:33.33%;padding-right:6px;vertical-align:top">
        <div style="background:#EAF3DE;border:1px solid #C0DD97;border-radius:6px;padding:8px 10px;height:100%;box-sizing:border-box">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <p style="font-size:9px;font-weight:600;color:#475569;margin:0">Pipeline per $1K</p>
            ${benchBadge(pipelinePerKBench(pipelinePerK))}
          </div>
          <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0">${fmt$(pipelinePerK)}</p>
        </div>
      </td>
      <td style="width:33.33%;padding:0 6px;vertical-align:top">
        <div style="background:#EAF3DE;border:1px solid #C0DD97;border-radius:6px;padding:8px 10px;height:100%;box-sizing:border-box">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <p style="font-size:9px;font-weight:600;color:#475569;margin:0">Cost per company engaged</p>
            ${benchBadge(costPerCompanyBench(costPerCompany))}
          </div>
          <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0">${fmt$(costPerCompany)}</p>
        </div>
      </td>
      <td style="width:33.33%;padding-left:6px;vertical-align:top">
        <div style="background:#EAF3DE;border:1px solid #C0DD97;border-radius:6px;padding:8px 10px;height:100%;box-sizing:border-box">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <p style="font-size:9px;font-weight:600;color:#475569;margin:0">Cost per meeting</p>
            ${benchBadge(costPerMeetingBench(costPerMeeting))}
          </div>
          <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0">${fmt$(costPerMeeting)}</p>
        </div>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <tr>
      <td style="width:25%;padding-right:6px;vertical-align:top">
        <div style="background:#E6F1FB;border:1px solid #B5D4F4;border-radius:6px;padding:8px 10px;height:100%;box-sizing:border-box">
          <p style="font-size:9px;font-weight:600;color:#475569;margin:0 0 4px">Pipeline influenced</p>
          <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0">${fmt$(pipelineInfluenced)}</p>
          <p style="font-size:8px;color:transparent;margin:2px 0 0" aria-hidden="true">·</p>
        </div>
      </td>
      <td style="width:25%;padding:0 6px;vertical-align:top">
        <div style="background:#E6F1FB;border:1px solid #B5D4F4;border-radius:6px;padding:8px 10px;height:100%;box-sizing:border-box">
          <p style="font-size:9px;font-weight:600;color:#475569;margin:0 0 4px">Net-new pipeline</p>
          <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0">${fmt$(pipelineNetNew)}</p>
          <p style="font-size:8px;color:transparent;margin:2px 0 0" aria-hidden="true">·</p>
        </div>
      </td>
      <td style="width:25%;padding:0 6px;vertical-align:top">
        <div style="background:#E6F1FB;border:1px solid #B5D4F4;border-radius:6px;padding:8px 10px;height:100%;box-sizing:border-box">
          <p style="font-size:9px;font-weight:600;color:#475569;margin:0 0 4px">Continued engagement</p>
          <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0">${fmt$(pipelineContinued)}</p>
          <p style="font-size:8px;color:transparent;margin:2px 0 0" aria-hidden="true">·</p>
        </div>
      </td>
      <td style="width:25%;padding-left:6px;vertical-align:top">
        <div style="background:#E6F1FB;border:1px solid #B5D4F4;border-radius:6px;padding:8px 10px;height:100%;box-sizing:border-box">
          <p style="font-size:9px;font-weight:600;color:#475569;margin:0 0 4px">Required pipeline</p>
          <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0">${fmt$(requiredPipelineAmount)}</p>
          ${n('required_pipeline_multiple') != null ? `<p style="font-size:8px;color:#94A3B8;margin:2px 0 0">${n('required_pipeline_multiple')}× spend target</p>` : '<p style="font-size:8px;color:transparent;margin:2px 0 0" aria-hidden="true">·</p>'}
        </div>
      </td>
    </tr>
  </table>

  ${pipelineTargetPill}

  <hr style="border:none;border-top:1px solid #F1F5F9;margin:14px 0">

  ${eyebrow('03', 'Execution quality')}

  ${dimBarsHtml}

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
    <tr>
      <td style="width:25%;padding-right:6px">${countCard('Decision makers engaged', decisionMakersEngaged != null ? String(decisionMakersEngaged) : '—')}</td>
      <td style="width:25%;padding:0 6px">${countCard('ICP companies engaged', icpEngaged != null ? String(icpEngaged) : '—')}</td>
      <td style="width:25%;padding:0 6px">${countCard('ICP companies total', icpTotal != null ? String(icpTotal) : '—')}</td>
      <td style="width:25%;padding-left:6px">${countCard('Net-new logos engaged', netNewLogos != null ? String(netNewLogos) : '—')}</td>
    </tr>
  </table>

  <hr style="border:none;border-top:1px solid #F1F5F9;margin:14px 0">

  ${eyebrow('04', 'Missed opportunity')}

  ${missedOppHtml}`;

  // ── Page 3 — Year-over-year + Recommendation ────────────────────────────────

  let yoyHtml = '';
  if (hasYoY) {
    const rows = yoyInstances.map((row, i) => {
      const prevRow = i > 0 ? yoyInstances[i - 1] : null;
      const cesDiff = prevRow?.cesScore != null && row.cesScore != null
        ? row.cesScore - prevRow.cesScore : null;
      const isCurrent = row.conferenceId === conferenceId;
      const rowBg = isCurrent ? '#EFF6FF' : i % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      const cesTierRow = tierInfo(row.cesScore);
      let vsPrior = '<span style="color:#94A3B8">—</span>';
      if (cesDiff != null && cesDiff !== 0) {
        vsPrior = cesDiff > 0
          ? `<span style="color:#3B6D11;font-weight:600">↑ +${cesDiff} pts</span>`
          : `<span style="color:#A32D2D;font-weight:600">↓ ${cesDiff} pts</span>`;
      }
      return `<tr style="background:${rowBg}">
        <td style="padding:5px 6px 5px 8px;font-size:9px;font-weight:600;color:#1E293B">${escHtml(row.year || '—')}</td>
        <td style="padding:5px 6px;text-align:right;font-size:9px;color:#475569">${fmt$(row.totalCost)}</td>
        <td style="padding:5px 6px;text-align:right;font-size:9px;font-weight:600;color:${cesTierRow.c}">${row.cesScore ?? '—'}</td>
        <td style="padding:5px 6px;text-align:right;font-size:9px;color:#475569">${fmt$(row.pipelineInfluenced)}</td>
        <td style="padding:5px 6px;text-align:center;font-size:9px;color:#475569">${row.icpCompaniesEngaged ?? '—'}</td>
        <td style="padding:5px 6px;text-align:center;font-size:9px;color:#475569">${row.meetingHoldRate != null ? Math.round(row.meetingHoldRate * 100) + '%' : '—'}</td>
        <td style="padding:5px 6px;text-align:center;font-size:9px;color:#475569">${fmt$(row.pipelinePerK)}</td>
        <td style="padding:5px 8px 5px 6px;text-align:right;font-size:9px">${vsPrior}</td>
      </tr>`;
    }).join('');

    yoyHtml = `
  ${eyebrow('05', 'Year-over-year')}
  <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
    <thead>
      <tr style="border-bottom:1px solid #E2E8F0">
        <th style="text-align:left;font-size:8px;font-weight:600;color:#64748B;padding:0 6px 5px 8px">Year</th>
        <th style="text-align:right;font-size:8px;font-weight:600;color:#64748B;padding:0 6px 5px">Cost</th>
        <th style="text-align:right;font-size:8px;font-weight:600;color:#64748B;padding:0 6px 5px">CES</th>
        <th style="text-align:right;font-size:8px;font-weight:600;color:#64748B;padding:0 6px 5px">Pipeline</th>
        <th style="text-align:center;font-size:8px;font-weight:600;color:#64748B;padding:0 6px 5px">ICP Engaged</th>
        <th style="text-align:center;font-size:8px;font-weight:600;color:#64748B;padding:0 6px 5px">Hold Rate</th>
        <th style="text-align:center;font-size:8px;font-weight:600;color:#64748B;padding:0 6px 5px">Pipeline/$1K</th>
        <th style="text-align:right;font-size:8px;font-weight:600;color:#64748B;padding:0 8px 5px 6px">vs. prior</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
  }

  // Recommendation section
  const rationaleParas = rationale.split('\n\n');
  const rationaleHtml = rationaleParas.map((para, i) => {
    const isSecond = i > 0;
    return `<p style="font-size:9px;line-height:1.6;color:${escHtml(rec.textColor)};margin:0${isSecond ? ';border-top:1px solid rgba(0,0,0,.08);margin-top:8px;padding-top:8px' : ''}">${escHtml(para)}</p>`;
  }).join('');

  const page3Content = `
  ${yoyHtml}

  ${eyebrow('06', 'Recommendation')}

  <div style="background:${rec.boxBg};border:1px solid ${rec.boxBorder};border-radius:8px;padding:14px;margin-bottom:14px">
    <p style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${escHtml(rec.textColor)};opacity:.7;margin:0 0 6px">Recommendation</p>
    <p style="font-size:12px;font-weight:600;color:${escHtml(rec.textColor)};margin:0 0 8px">${escHtml(rec.label)} ${escHtml(conf.name)}</p>
    ${rationaleHtml}
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
    <tr>
      <td style="width:33.33%;padding-right:6px">${statCard('Proposed next budget', fmt$(proposedNextBudget), budgetSubLabel)}</td>
      <td style="width:33.33%;padding:0 6px">${statCard('Current headcount', internalHeadcount != null ? String(internalHeadcount) : '—', 'Internal attendees')}</td>
      <td style="width:33.33%;padding-left:6px">${statCard('CES target', cesScore != null ? `${cesScore + 5}+` : '—', 'Next instance goal')}</td>
    </tr>
  </table>

  ${snapshotDisplay ? `<p style="font-size:9px;color:#94A3B8;margin-top:8px">Snapshot taken ${snapshotDisplay} · Generated by Parlay</p>` : ''}`;

  // ── Final HTML ──────────────────────────────────────────────────────────────

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Executive Brief — ${escHtml(conf.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1E293B; }
  @page { size: letter portrait; margin: 0.65in 0.7in; }
  .page-break { page-break-before: always; }
  table { border-collapse: collapse; }
</style>
</head>
<body>
  <!-- Page 1 -->
  ${pageHeader()}
  ${eyebrow('01', 'Investment')}
  ${page1Content}
  ${pageFooter(1)}

  <!-- Page 2 -->
  <div class="page-break"></div>
  ${pageHeader()}
  ${page2Content}
  ${pageFooter(2)}

  <!-- Page 3 -->
  <div class="page-break"></div>
  ${pageHeader()}
  ${page3Content}
  ${pageFooter(3)}
</body></html>`;
}
