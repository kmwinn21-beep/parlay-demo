import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getConfigIdByEmail, notifyCompanyAssignees } from '@/lib/notifications';
import { confirmAttendeeMatch } from '@/lib/matching';
import { validateConferenceStage } from '@/lib/validate-conference-stage';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);
  try {
    const body = await request.json();
    const { attendee_id, first_name, last_name, title, company, email, phone, linkedin_url, website, company_type } = body as {
      /** Set when the caller picked a specific person off the search rather
       *  than typing a new one — then there is nothing to match or create. */
      attendee_id?: number;
      first_name: string;
      last_name: string;
      title?: string;
      company?: string;
      email?: string;
      phone?: string;
      linkedin_url?: string;
      website?: string;
      /** Applied only when this call is what creates the company. */
      company_type?: string;
    };

    if (!attendee_id && (!first_name || !last_name)) {
      return NextResponse.json({ error: 'first_name and last_name are required' }, { status: 400 });
    }

    const stageBlock = await validateConferenceStage(request, Number(params.id), 'canAddAttendee');
    if (stageBlock) return stageBlock;

    // Check conference exists
    const confResult = await db.execute({
      sql: 'SELECT id FROM conferences WHERE id = ?',
      args: [params.id],
    });
    if (confResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    // An explicit pick: link that person and nothing else. The name matching
    // below is for typed-in names, where the caller can't know whether the
    // person is already on file; it would be the wrong question to ask here.
    if (attendee_id) {
      const picked = await db.execute({
        sql: `SELECT a.*, c.name as company_name, c.company_type
              FROM attendees a
              LEFT JOIN companies c ON a.company_id = c.id
              WHERE a.id = ?`,
        args: [attendee_id],
      });
      if (picked.rows.length === 0) {
        return NextResponse.json({ error: 'Attendee not found' }, { status: 404 });
      }
      const row = { ...picked.rows[0] };
      await db.execute({
        sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
        args: [params.id, attendee_id],
      });
      const coId = row.company_id as number | null;
      const coName = row.company_name as string | null;
      if (coId && coName) {
        const confRow = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [params.id] });
        const confName = confRow.rows.length > 0 ? String(confRow.rows[0].name) : `Conference #${params.id}`;
        const changedByConfigId = await getConfigIdByEmail(user.email);
        notifyCompanyAssignees({
          companyId: coId,
          companyName: coName,
          message: `${`${row.first_name ?? ''} ${row.last_name ?? ''}`.trim()} added to ${confName}`,
          changedByEmail: user.email,
          changedByConfigId,
          type: 'attendee',
          entityType: 'attendee',
          entityId: attendee_id,
        });
      }
      return NextResponse.json(row, { status: 201 });
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
            sql: 'INSERT INTO companies (name, company_type) VALUES (?, ?) RETURNING id',
            args: [company, company_type || null],
          });
          companyId = Number(newCo.rows[0].id);
        }
      }

      const newAttendee = await db.execute({
        sql: `INSERT INTO attendees (first_name, last_name, title, company_id, email, phone, linkedin_url)
              VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        args: [
          first_name, last_name, title ?? null, companyId, email ?? null,
          phone?.trim() || null,
          linkedin_url?.trim() || null,
        ],
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
