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
    const { attendee_id, first_name, last_name, title, company, email, phone, linkedin_url, website, company_type, company_only } = body as {
      /** Set when the caller picked a specific person off the search rather
       *  than typing a new one — then there is nothing to match or create. */
      attendee_id?: number;
      /**
       * The company is known to be attending but nobody at it is yet. A
       * stand-in attendee carries the company onto the conference, the same
       * way a Companies Only upload does — see the company_only branch below.
       */
      company_only?: boolean;
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

    if (company_only && !company?.trim()) {
      return NextResponse.json({ error: 'company is required' }, { status: 400 });
    }
    if (!attendee_id && !company_only && (!first_name || !last_name)) {
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
        sql: `INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id, created_at, source) VALUES (?, ?, datetime('now'), 'manual')`,
        args: [params.id, attendee_id],
      });
      const coId = row.company_id as number | null;
      const coName = row.company_name as string | null;
      if (coId && coName) {
        const confRow = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [params.id] });
        const confName = confRow.rows.length > 0 ? String(confRow.rows[0].name) : `Conference #${params.id}`;
        const changedByConfigId = await getConfigIdByEmail(db, user.email);
        notifyCompanyAssignees(db, {
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

    // ── Company only: the company is coming, the person is not yet known ─────
    //
    // A conference's company list is derived from its attendees, so a company
    // with nobody named against it cannot appear. A stand-in attendee holds
    // the place — exactly what a Companies Only upload creates in bulk, and
    // deliberately the same shape so the rest of the system needs no new
    // concept: the placeholder banner, the stale calculation on the conference
    // page and sweepConflictedPlaceholders all already know what this is.
    if (company_only) {
      const coName = company!.trim();

      const coResult = await db.execute({
        sql: 'SELECT id, name FROM companies WHERE LOWER(name) = LOWER(?)',
        args: [coName],
      });
      let companyId: number;
      let companyName: string;
      if (coResult.rows.length > 0) {
        companyId = Number(coResult.rows[0].id);
        companyName = String(coResult.rows[0].name);
      } else {
        const newCo = await db.execute({
          sql: 'INSERT INTO companies (name, company_type, website) VALUES (?, ?, ?) RETURNING id, name',
          args: [coName, company_type || null, website?.trim() || null],
        });
        companyId = Number(newCo.rows[0].id);
        companyName = String(newCo.rows[0].name);
      }

      // Already represented by a real person here? Then a stand-in would be
      // stale the moment it was written, and the sweep would take it back out.
      // Say so rather than churn the row.
      const realHere = await db.execute({
        sql: `SELECT a.id FROM attendees a
                JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
               WHERE a.company_id = ? AND COALESCE(a.is_placeholder, 0) = 0
               LIMIT 1`,
        args: [params.id, companyId],
      });
      if (realHere.rows.length > 0) {
        return NextResponse.json(
          { error: `${companyName} is already on this conference through a named attendee.` },
          { status: 409 },
        );
      }

      // One stand-in row per company, shared across conferences — the same row
      // a Companies Only upload would have reused, since it dedupes on name.
      const existing = await db.execute({
        sql: `SELECT id FROM attendees
               WHERE company_id = ? AND COALESCE(is_placeholder, 0) = 1 LIMIT 1`,
        args: [companyId],
      });
      const standInId = existing.rows.length > 0
        ? Number(existing.rows[0].id)
        : Number((await db.execute({
            // "-" and the company name: the convention lib/parsers.ts uses, so
            // one company's stand-in stays distinct from another's.
            sql: `INSERT INTO attendees (first_name, last_name, company_id, is_placeholder)
                  VALUES ('-', ?, ?, 1) RETURNING id`,
            args: [companyName, companyId],
          })).rows[0].id);

      await db.execute({
        sql: `INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id, created_at, source) VALUES (?, ?, datetime('now'), 'manual')`,
        args: [params.id, standInId],
      });

      const confRow = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [params.id] });
      const confName = confRow.rows.length > 0 ? String(confRow.rows[0].name) : `Conference #${params.id}`;
      const changedByConfigId = await getConfigIdByEmail(db, user.email);
      notifyCompanyAssignees(db, {
        companyId,
        companyName,
        message: `${companyName} added to ${confName} — attendee not yet known`,
        changedByEmail: user.email,
        changedByConfigId,
        type: 'attendee',
        entityType: 'attendee',
        entityId: standInId,
      });

      const full = await db.execute({
        sql: `SELECT a.*, c.name as company_name, c.company_type
              FROM attendees a LEFT JOIN companies c ON a.company_id = c.id
              WHERE a.id = ?`,
        args: [standInId],
      });
      return NextResponse.json({ ...full.rows[0] }, { status: 201 });
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
      sql: `INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id, created_at, source) VALUES (?, ?, datetime('now'), 'manual')`,
      args: [params.id, attendeeId],
    });

    // Notify company assignees (best-effort)
    const companyId = attendeeRow.company_id as number | null;
    const companyName = attendeeRow.company_name as string | null;
    if (companyId && companyName) {
      const confRow = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [params.id] });
      const confName = confRow.rows.length > 0 ? String(confRow.rows[0].name) : `Conference #${params.id}`;
      const attendeeName = `${first_name} ${last_name}`.trim();
      const changedByConfigId = await getConfigIdByEmail(db, user.email);
      notifyCompanyAssignees(db, {
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
