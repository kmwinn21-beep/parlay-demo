import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, notifyCompanyAssignees } from '@/lib/notifications';
import { confirmAttendeeMatch } from '@/lib/matching';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { first_name, last_name, title, company, email, website } = body as {
      first_name: string;
      last_name: string;
      title?: string;
      company?: string;
      email?: string;
      website?: string;
    };

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'first_name and last_name are required' }, { status: 400 });
    }

    // Check conference exists
    const confResult = await db.execute({
      sql: 'SELECT id FROM conferences WHERE id = ?',
      args: [params.id],
    });
    if (confResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    // Name match — requires secondary confirmation (email, domain, or company) per matching rules.
    // Load all name matches (could be >1 person named "John Smith") then apply secondary check.
    const nameMatchResult = await db.execute({
      sql: `SELECT a.*, c.name as company_name, c.website as company_website, c.company_type
            FROM attendees a
            LEFT JOIN companies c ON a.company_id = c.id
            WHERE LOWER(a.first_name) = LOWER(?) AND LOWER(a.last_name) = LOWER(?)`,
      args: [first_name, last_name],
    });

    // Find first candidate that also passes secondary confirmation
    const confirmedRow = nameMatchResult.rows.find(row =>
      confirmAttendeeMatch(
        { email: row.email as string | null, website: row.company_website as string | null, company_name: row.company_name as string | null },
        email,
        website,
        company,
      )
    );

    let attendeeId: number;
    let attendeeRow: Record<string, unknown>;

    if (confirmedRow) {
      // Confirmed match — tag with conference using existing attendee
      attendeeId = Number(confirmedRow.id);
      attendeeRow = { ...confirmedRow };
    } else {
      // Create new attendee
      let companyId: number | null = null;

      if (company) {
        // Find or create company
        const coResult = await db.execute({
          sql: 'SELECT id FROM companies WHERE LOWER(name) = LOWER(?)',
          args: [company],
        });
        if (coResult.rows.length > 0) {
          companyId = Number(coResult.rows[0].id);
        } else {
          const newCo = await db.execute({
            sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id',
            args: [company],
          });
          companyId = Number(newCo.rows[0].id);
        }
      }

      const newAttendee = await db.execute({
        sql: `INSERT INTO attendees (first_name, last_name, title, company_id, email)
              VALUES (?, ?, ?, ?, ?) RETURNING *`,
        args: [first_name, last_name, title ?? null, companyId, email ?? null],
      });

      attendeeId = Number(newAttendee.rows[0].id);

      // Fetch with company info
      const fullResult = await db.execute({
        sql: `SELECT a.*, c.name as company_name, c.company_type
              FROM attendees a
              LEFT JOIN companies c ON a.company_id = c.id
              WHERE a.id = ?`,
        args: [attendeeId],
      });
      attendeeRow = { ...fullResult.rows[0] };
    }

    // Tag attendee with this conference (ignore if already tagged)
    await db.execute({
      sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
      args: [params.id, attendeeId],
    });

    // Notify company assignees (best-effort)
    const companyId = attendeeRow.company_id as number | null;
    const companyName = attendeeRow.company_name as string | null;
    if (companyId && companyName) {
      const confRow = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [params.id] });
      const confName = confRow.rows.length > 0 ? String(confRow.rows[0].name) : `Conference #${params.id}`;
      const attendeeName = `${first_name} ${last_name}`.trim();
      const changedByConfigId = await getConfigIdByEmail(user.email);
      notifyCompanyAssignees({
        companyId,
        companyName,
        message: `${attendeeName} added to ${confName}`,
        changedByEmail: user.email,
        changedByConfigId,
        type: 'attendee',
        entityType: 'attendee',
        entityId: attendeeId,
      });
    }

    return NextResponse.json(attendeeRow, { status: 201 });
  } catch (error) {
    console.error('POST /api/conferences/[id]/attendees/add error:', error);
    return NextResponse.json({ error: 'Failed to add attendee' }, { status: 500 });
  }
}
