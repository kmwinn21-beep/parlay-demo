import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const body = await request.json();
    const { value, sort_order } = body;

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

    const result = await db.execute({
      sql: 'UPDATE config_options SET value = ?, sort_order = ? WHERE id = ? RETURNING *',
      args: [value, sort_order ?? 0, params.id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }

    // Cascade rename to all records that reference the old value
    if (oldValue !== value) {
      try {
        if (category === 'status') {
          await db.execute({
            sql: 'UPDATE attendees SET status = ? WHERE status = ?',
            args: [value, oldValue],
          });
          await db.execute({
            sql: 'UPDATE companies SET status = ? WHERE status = ?',
            args: [value, oldValue],
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
        } else if (category === 'next_steps') {
          await db.execute({
            sql: 'UPDATE conference_attendee_details SET next_steps = ? WHERE next_steps = ?',
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
        }
      } catch (cascadeErr) {
        console.error('Cascade rename error:', cascadeErr);
        // Still return success for the config update itself
      }
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('PUT /api/config/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update config option' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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
