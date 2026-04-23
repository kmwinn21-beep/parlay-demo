import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { getCategoryFormKeys } from '@/lib/configOptionForms';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { value, sort_order, color, visible_forms, scope, auto_follow_up } = body as {
      value: string;
      sort_order?: number;
      color?: string | null;
      visible_forms?: string[];
      scope?: string;
      auto_follow_up?: boolean | number;
    };

    if (!value) {
      return NextResponse.json({ error: 'value is required' }, { status: 400 });
    }

    // Fetch old value and category before updating so we can cascade rename
    const existing = await db.execute({
      sql: 'SELECT category, value FROM config_options WHERE id = ?',
      args: [params.id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }

    const oldValue = String(existing.rows[0].value);
    const category = String(existing.rows[0].category);

    const scopeValue = scope === 'user' ? 'user' : 'global';
    const autoFollowUpVal = auto_follow_up === undefined ? 1 : (auto_follow_up ? 1 : 0);
    const result = await db.execute({
      sql: sort_order !== undefined
        ? 'UPDATE config_options SET value = ?, sort_order = ?, color = ?, scope = ?, auto_follow_up = ? WHERE id = ? RETURNING *'
        : 'UPDATE config_options SET value = ?, color = ?, scope = ?, auto_follow_up = ? WHERE id = ? RETURNING *',
      args: sort_order !== undefined
        ? [value, sort_order, color !== undefined ? color : null, scopeValue, autoFollowUpVal, params.id]
        : [value, color !== undefined ? color : null, scopeValue, autoFollowUpVal, params.id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }

    // Cascade rename to all records that reference the old value
    if (oldValue !== value) {
      try {
        if (category === 'status') {
          // Status is stored as comma-separated values — use padded REPLACE to match exact entries
          await db.execute({
            sql: `UPDATE attendees
                  SET status = TRIM(
                    REPLACE(',' || COALESCE(status, '') || ',', ',' || ? || ',', ',' || ? || ','),
                    ','
                  )
                  WHERE ',' || COALESCE(status, '') || ',' LIKE '%,' || ? || ',%'`,
            args: [oldValue, value, oldValue],
          });
          await db.execute({
            sql: `UPDATE companies
                  SET status = TRIM(
                    REPLACE(',' || COALESCE(status, '') || ',', ',' || ? || ',', ',' || ? || ','),
                    ','
                  )
                  WHERE ',' || COALESCE(status, '') || ',' LIKE '%,' || ? || ',%'`,
            args: [oldValue, value, oldValue],
          });
        } else if (category === 'company_type') {
          await db.execute({
            sql: 'UPDATE companies SET company_type = ? WHERE company_type = ?',
            args: [value, oldValue],
          });
        } else if (category === 'profit_type') {
          await db.execute({
            sql: 'UPDATE companies SET profit_type = ? WHERE profit_type = ?',
            args: [value, oldValue],
          });
        } else if (category === 'icp') {
          await db.execute({
            sql: 'UPDATE companies SET icp = ? WHERE icp = ?',
            args: [value, oldValue],
          });
        } else if (category === 'next_steps') {
          await db.execute({
            sql: 'UPDATE conference_attendee_details SET next_steps = ? WHERE next_steps = ?',
            args: [value, oldValue],
          });
          await db.execute({
            sql: 'UPDATE follow_ups SET next_steps = ? WHERE next_steps = ?',
            args: [value, oldValue],
          });
        } else if (category === 'action') {
          // Actions are comma-separated — use padded REPLACE to match exact entries
          await db.execute({
            sql: `UPDATE conference_attendee_details
                  SET action = TRIM(
                    REPLACE(',' || action || ',', ',' || ? || ',', ',' || ? || ','),
                    ','
                  )
                  WHERE ',' || COALESCE(action, '') || ',' LIKE '%,' || ? || ',%'`,
            args: [oldValue, value, oldValue],
          });
          // Also update meetings.outcome to stay in sync
          await db.execute({
            sql: 'UPDATE meetings SET outcome = ? WHERE outcome = ?',
            args: [value, oldValue],
          });
        } else if (category === 'services') {
          await db.execute({
            sql: `UPDATE companies
                  SET services = TRIM(
                    REPLACE(',' || COALESCE(services, '') || ',', ',' || ? || ',', ',' || ? || ','),
                    ','
                  )
                  WHERE ',' || COALESCE(services, '') || ',' LIKE '%,' || ? || ',%'`,
            args: [oldValue, value, oldValue],
          });
        }
      } catch (cascadeErr) {
        console.error('Cascade rename error:', cascadeErr);
        // Still return success for the config update itself
      }
    }

    if (Array.isArray(visible_forms)) {
      const allowedFormKeys = getCategoryFormKeys(category);
      const selected = new Set(visible_forms.filter(f => allowedFormKeys.includes(f)));
      await db.execute({ sql: 'DELETE FROM config_option_visibility WHERE option_id = ?', args: [params.id] });
      for (const formKey of allowedFormKeys) {
        await db.execute({
          sql: 'INSERT INTO config_option_visibility (option_id, form_key, visible) VALUES (?, ?, ?)',
          args: [params.id, formKey, selected.has(formKey) ? 1 : 0],
        });
      }
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('PUT /api/config/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update config option' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    await db.execute({
      sql: 'DELETE FROM config_options WHERE id = ?',
      args: [params.id],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/config/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete config option' }, { status: 500 });
  }
}

// Update color only (no cascade rename needed)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const body = await request.json();
    const { color } = body;

    const result = await db.execute({
      sql: 'UPDATE config_options SET color = ? WHERE id = ? RETURNING *',
      args: [color ?? null, params.id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('PATCH /api/config/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update color' }, { status: 500 });
  }
}
