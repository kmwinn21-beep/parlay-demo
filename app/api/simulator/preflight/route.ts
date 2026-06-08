import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// GET /api/simulator/preflight?conferenceId=...
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const conferenceIdStr = searchParams.get('conferenceId');

  if (!conferenceIdStr || isNaN(Number(conferenceIdStr))) {
    return NextResponse.json({ error: 'conferenceId must be a number' }, { status: 400 });
  }
  const conferenceId = Number(conferenceIdStr);

  const client = await getDb(auth.accountId);

  try {
    // Check 1 — effectiveness_defaults seeded
    const requiredKeys = [
      'follow_up_meeting_conversion_rate',
      'touchpoint_conversion_rate',
      'avg_cost_per_unit',
      'avg_annual_deal_size',
      'expected_return_on_event_cost',
    ];
    const edRes = await client.execute({
      sql: `SELECT key, value FROM effectiveness_defaults WHERE key IN (?, ?, ?, ?, ?)`,
      args: requiredKeys,
    });
    const edValues: Record<string, number> = {};
    for (const row of edRes.rows) {
      const val = Number(row.value);
      if (row.key && val !== 0 && !isNaN(val)) {
        edValues[String(row.key)] = val;
      }
    }
    const missing = requiredKeys.filter(k => !(k in edValues));
    const effectivenessDefaults = {
      ok: missing.length === 0,
      missing,
      values: edValues,
    };

    // Check 2 — conference_budget has spend
    const budgetRes = await client.execute({
      sql: `SELECT line_items, required_pipeline_amount FROM conference_budget WHERE conference_id = ?`,
      args: [conferenceId],
    });
    let totalSpend = 0;
    let requiredPipelineAmount: number | null = null;
    if (budgetRes.rows.length > 0) {
      const row = budgetRes.rows[0];
      requiredPipelineAmount = row.required_pipeline_amount != null ? Number(row.required_pipeline_amount) : null;
      try {
        const lineItems = JSON.parse(String(row.line_items ?? '[]')) as Array<{
          budget?: number;
          actual?: number;
        }>;
        for (const item of lineItems) {
          const actual = item.actual && item.actual !== 0 ? item.actual : undefined;
          const budget = item.budget;
          totalSpend += actual ?? budget ?? 0;
        }
      } catch {
        // malformed JSON — treat as 0
      }
    }
    const budget = {
      ok: totalSpend > 0,
      totalSpend,
      requiredPipelineAmount,
    };

    // Check 3 — ICP companies have wse values
    const wseRes = await client.execute({
      sql: `SELECT
              COUNT(DISTINCT co.id) as total_icp,
              COUNT(DISTINCT CASE WHEN co.wse > 0 THEN co.id END) as with_wse
            FROM companies co
            JOIN attendees a ON a.company_id = co.id
            JOIN conference_attendees ca ON ca.attendee_id = a.id
            WHERE ca.conference_id = ? AND co.icp = 'Yes'`,
      args: [conferenceId],
    });
    const totalIcp = Number(wseRes.rows[0]?.total_icp ?? 0);
    const withWse = Number(wseRes.rows[0]?.with_wse ?? 0);
    const wse = {
      ok: totalIcp === 0 || withWse >= totalIcp * 0.8,
      totalIcp,
      withWse,
    };

    // Check 4 — ICP attendees exist
    const icpRes = await client.execute({
      sql: `SELECT COUNT(DISTINCT a.id) as cnt
            FROM conference_attendees ca
            JOIN attendees a ON a.id = ca.attendee_id
            JOIN companies co ON co.id = a.company_id
            WHERE ca.conference_id = ? AND co.icp = 'Yes'`,
      args: [conferenceId],
    });
    const icpCount = Number(icpRes.rows[0]?.cnt ?? 0);
    const icpAttendees = {
      ok: icpCount > 0,
      count: icpCount,
    };

    const checks = { effectivenessDefaults, budget, wse, icpAttendees };
    const allOk = effectivenessDefaults.ok && budget.ok && wse.ok && icpAttendees.ok;

    return NextResponse.json({ checks, allOk });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface FixBody {
  conferenceId: number;
  fixes: {
    seedEffectivenessDefaults?: boolean;
    seedBudget?: { totalSpend: number };
    seedWse?: boolean;
  };
}

// POST /api/simulator/preflight
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: FixBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { conferenceId, fixes } = body;

  if (!conferenceId || typeof conferenceId !== 'number') {
    return NextResponse.json({ error: 'conferenceId must be a number' }, { status: 400 });
  }
  if (!fixes || typeof fixes !== 'object') {
    return NextResponse.json({ error: 'fixes is required' }, { status: 400 });
  }

  const client = await getDb(auth.accountId);

  const fixed: string[] = [];
  const errors: string[] = [];

  // Fix: seedEffectivenessDefaults
  if (fixes.seedEffectivenessDefaults) {
    try {
      // Inspect table columns first
      const pragmaRes = await client.execute({ sql: `PRAGMA table_info(effectiveness_defaults)`, args: [] });
      const columns = new Set(pragmaRes.rows.map(r => String(r.name)));

      const defaults: Array<{ key: string; value: string; label: string }> = [
        { key: 'follow_up_meeting_conversion_rate', value: '0.70', label: 'Follow-up Meeting Conversion Rate' },
        { key: 'touchpoint_conversion_rate', value: '0.45', label: 'Touchpoint Conversion Rate' },
        { key: 'avg_cost_per_unit', value: '25000', label: 'Avg Cost Per Unit' },
        { key: 'avg_annual_deal_size', value: '50000', label: 'Avg Annual Deal Size' },
        { key: 'expected_return_on_event_cost', value: '2.5', label: 'Expected Return on Event Cost' },
      ];

      const hasLabel = columns.has('label');
      let seededCount = 0;

      for (const d of defaults) {
        try {
          if (hasLabel) {
            await client.execute({
              sql: `INSERT INTO effectiveness_defaults (key, value, label) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING`,
              args: [d.key, d.value, d.label],
            });
          } else {
            await client.execute({
              sql: `INSERT INTO effectiveness_defaults (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`,
              args: [d.key, d.value],
            });
          }
          seededCount++;
        } catch (e) {
          errors.push(`effectiveness_defaults[${d.key}]: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (seededCount > 0) fixed.push(`Seeded ${seededCount} effectiveness_defaults entries`);
    } catch (e) {
      errors.push(`seedEffectivenessDefaults: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Fix: seedBudget
  if (fixes.seedBudget) {
    try {
      const { totalSpend } = fixes.seedBudget;
      const lineItems = JSON.stringify([
        { id: 'sim-budget', label: 'Event Cost', budget: totalSpend, actual: 0 },
      ]);
      const requiredPipelineAmount = totalSpend * 3.5;

      await client.execute({
        sql: `INSERT INTO conference_budget (conference_id, line_items, required_pipeline_amount)
              VALUES (?, ?, ?)
              ON CONFLICT(conference_id) DO UPDATE SET
                line_items = CASE WHEN line_items = '[]' OR line_items IS NULL THEN excluded.line_items ELSE line_items END,
                required_pipeline_amount = CASE WHEN required_pipeline_amount IS NULL THEN excluded.required_pipeline_amount ELSE required_pipeline_amount END`,
        args: [conferenceId, lineItems, requiredPipelineAmount],
      });
      fixed.push(`Seeded conference_budget with $${totalSpend.toLocaleString()} spend`);
    } catch (e) {
      errors.push(`seedBudget: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Fix: seedWse
  if (fixes.seedWse) {
    try {
      const missingWseRes = await client.execute({
        sql: `SELECT DISTINCT co.id FROM companies co
              JOIN attendees a ON a.company_id = co.id
              JOIN conference_attendees ca ON ca.attendee_id = a.id
              WHERE ca.conference_id = ? AND co.icp = 'Yes' AND (co.wse IS NULL OR co.wse = 0)`,
        args: [conferenceId],
      });

      let updatedCount = 0;
      for (const row of missingWseRes.rows) {
        const wseValue = Math.floor(25000 + Math.random() * 175000);
        try {
          await client.execute({
            sql: `UPDATE companies SET wse = ? WHERE id = ?`,
            args: [wseValue, row.id],
          });
          updatedCount++;
        } catch (e) {
          errors.push(`seedWse company ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (updatedCount > 0) fixed.push(`Assigned WSE values to ${updatedCount} ICP companies`);
    } catch (e) {
      errors.push(`seedWse: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ fixed, errors });
}
