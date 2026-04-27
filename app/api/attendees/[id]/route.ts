import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const attendeeResult = await db.execute({
      sql: `SELECT a.*, co.name as company_name, co.company_type, co.website as company_website, co.assigned_user as company_assigned_user
            FROM attendees a
            LEFT JOIN companies co ON a.company_id = co.id
            WHERE a.id = ?`,
      args: [params.id],
    });

    if (attendeeResult.rows.length === 0) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    const attendee = attendeeResult.rows[0];

    const conferencesResult = await db.execute({
      sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location
            FROM conferences c
            JOIN conference_attendees ca ON c.id = ca.conference_id
            WHERE ca.attendee_id = ?
            ORDER BY c.start_date DESC`,
      args: [params.id],
    });

    const conferences = conferencesResult.rows.map((r) => ({ ...r }));

    return NextResponse.json({ ...attendee, conferences });
  } catch (error) {
    console.error('GET /api/attendees/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendee' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { first_name, last_name, title, company_id, email, notes, action, next_steps, next_steps_notes, status, seniority, linkedin_url, phone } = body;

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    const existingResult = await db.execute({
      sql: 'SELECT id, status FROM attendees WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }
    const existingStatus = String(existingResult.rows[0].status ?? '');

    const updatedResult = await db.execute({
      sql: 'UPDATE attendees SET first_name = ?, last_name = ?, title = ?, company_id = ?, email = ?, notes = ?, action = ?, next_steps = ?, next_steps_notes = ?, status = ?, seniority = ?, linkedin_url = ?, phone = ?, updated_at = datetime(\'now\') WHERE id = ? RETURNING *',
      args: [
        first_name,
        last_name,
        title || null,
        company_id || null,
        email || null,
        notes || null,
        action || null,
        next_steps || null,
        next_steps_notes || null,
        'status' in body ? (status !== undefined ? status : '') : existingStatus,
        seniority || null,
        linkedin_url || null,
        phone || null,
        params.id,
      ],
    });

    if (status && company_id) {
      await db.execute({
        sql: 'UPDATE companies SET status = ? WHERE id = ?',
        args: [status, company_id],
      });
    }

    return NextResponse.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('PUT /api/attendees/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update attendee' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { action, next_steps, next_steps_notes, status, notes, company_id, seniority, first_name, last_name, title, company_type, company_wse } = body;

    const existingResult = await db.execute({
      sql: 'SELECT id, company_id FROM attendees WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    const setClauses: string[] = [];
    const args: (string | number | null)[] = [];

    if ('action' in body) {
      setClauses.push('action = ?');
      args.push(action !== undefined ? action : null);
    }
    if ('next_steps' in body) {
      setClauses.push('next_steps = ?');
      args.push(next_steps !== undefined ? next_steps : null);
    }
    if ('next_steps_notes' in body) {
      setClauses.push('next_steps_notes = ?');
      args.push(next_steps_notes !== undefined ? next_steps_notes : null);
    }
    if ('status' in body) {
      setClauses.push('status = ?');
      args.push(status !== undefined ? status : '');
    }
    if ('notes' in body) {
      setClauses.push('notes = ?');
      args.push(notes !== undefined ? notes : null);
    }
    if ('seniority' in body) {
      setClauses.push('seniority = ?');
      args.push(seniority || null);
    }
    if ('first_name' in body) {
      const value = typeof first_name === 'string' ? first_name.trim() : '';
      if (!value) return NextResponse.json({ error: 'first_name cannot be empty' }, { status: 400 });
      setClauses.push('first_name = ?');
      args.push(value);
    }
    if ('last_name' in body) {
      const value = typeof last_name === 'string' ? last_name.trim() : '';
      if (!value) return NextResponse.json({ error: 'last_name cannot be empty' }, { status: 400 });
      setClauses.push('last_name = ?');
      args.push(value);
    }
    if ('title' in body) {
      setClauses.push('title = ?');
      args.push(title || null);
    }
    if ('company_id' in body) {
      setClauses.push('company_id = ?');
      args.push(company_id || null);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    args.push(params.id);
    const updatedResult = await db.execute({
      sql: `UPDATE attendees SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = ? RETURNING *`,
      args,
    });

    // If status was provided and company_id is available, also update company status
    const effectiveCompanyId = company_id ?? existingResult.rows[0].company_id;
    if ('status' in body && status && effectiveCompanyId) {
      await db.execute({
        sql: 'UPDATE companies SET status = ? WHERE id = ?',
        args: [status, effectiveCompanyId],
      });
    }

    if ((('company_type' in body) || ('company_wse' in body)) && effectiveCompanyId) {
      const companySetClauses: string[] = [];
      const companyArgs: (string | number | null)[] = [];
      if ('company_type' in body) {
        companySetClauses.push('company_type = ?');
        companyArgs.push(company_type || null);
      }
      if ('company_wse' in body) {
        const wseRaw = company_wse;
        const parsedWse = wseRaw === '' || wseRaw == null ? null : Number(wseRaw);
        if (parsedWse != null && (!Number.isFinite(parsedWse) || parsedWse < 0)) {
          return NextResponse.json({ error: 'company_wse must be a non-negative number' }, { status: 400 });
        }
        companySetClauses.push('wse = ?');
        companyArgs.push(parsedWse != null ? Math.round(parsedWse) : null);
      }
      if (companySetClauses.length > 0) {
        companyArgs.push(effectiveCompanyId);
        await db.execute({
          sql: `UPDATE companies SET ${companySetClauses.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
          args: companyArgs,
        });
      }
    }

    return NextResponse.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('PATCH /api/attendees/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update attendee' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;

    const existingResult = await db.execute({
      sql: 'SELECT id FROM attendees WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
    }

    await db.batch(
      [
        { sql: 'DELETE FROM conference_attendees WHERE attendee_id = ?', args: [params.id] },
        { sql: 'DELETE FROM attendees WHERE id = ?', args: [params.id] },
      ],
      'write'
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/attendees/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete attendee' }, { status: 500 });
  }
}
