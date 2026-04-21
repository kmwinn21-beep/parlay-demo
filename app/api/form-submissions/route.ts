import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const conferenceFormId = searchParams.get('conference_form_id');
    if (!conferenceFormId) return NextResponse.json({ error: 'conference_form_id required' }, { status: 400 });

    const subsRes = await db.execute({
      sql: `SELECT fs.id, fs.conference_form_id, fs.conference_id, fs.attendee_id, fs.submitted_at,
                   fs.status_option_id, co.value as status_value,
                   c.name as conference_name,
                   a.company_id
            FROM form_submissions fs
            LEFT JOIN config_options co ON fs.status_option_id = co.id
            JOIN conferences c ON fs.conference_id = c.id
            LEFT JOIN attendees a ON fs.attendee_id = a.id
            WHERE fs.conference_form_id = ?
            ORDER BY fs.submitted_at DESC`,
      args: [conferenceFormId],
    });

    const submissions = await Promise.all(subsRes.rows.map(async (s) => {
      const valsRes = await db.execute({
        sql: `SELECT field_id, field_label, field_value FROM form_submission_values WHERE submission_id = ?`,
        args: [s.id as number],
      });
      return {
        id: Number(s.id),
        conference_form_id: Number(s.conference_form_id),
        conference_id: Number(s.conference_id),
        attendee_id: s.attendee_id ? Number(s.attendee_id) : null,
        company_id: s.company_id ? Number(s.company_id) : null,
        submitted_at: String(s.submitted_at),
        status_option_id: s.status_option_id ? Number(s.status_option_id) : null,
        status_value: s.status_value ? String(s.status_value) : null,
        conference_name: String(s.conference_name),
        values: valsRes.rows.map(v => ({
          field_id: v.field_id ? Number(v.field_id) : null,
          field_label: String(v.field_label),
          field_value: v.field_value ? String(v.field_value) : '',
        })),
      };
    }));

    return NextResponse.json(submissions);
  } catch (error) {
    console.error('GET /api/form-submissions error:', error);
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
    const body = await request.json();
    const {
      conference_form_id,
      conference_id,
      values, // [{ field_id, field_label, field_value }]
      // Attendee selection
      attendee_id,         // selected from dropdown (existing)
      manual_first_name,   // filled when "Other" selected
      manual_last_name,
    } = body;

    if (!conference_form_id || !conference_id) {
      return NextResponse.json({ error: 'conference_form_id and conference_id required' }, { status: 400 });
    }

    // Resolve or create attendee
    let resolvedAttendeeId: number | null = attendee_id ? Number(attendee_id) : null;
    let resolvedCompanyId: number | null = null;

    // Find attendee details from values for note building
    const getVal = (label: string) =>
      (values as { field_label: string; field_value: string }[])
        .find(v => v.field_label?.toLowerCase() === label.toLowerCase())?.field_value || '';

    const nameVal = getVal('Name') || `${manual_first_name || ''} ${manual_last_name || ''}`.trim();
    const titleVal = getVal('Title');
    const companyVal = getVal('Company');
    const emailVal = getVal('Email Address') || getVal('Email');

    // If manual entry ("Other"), create attendee/company records
    if (!resolvedAttendeeId && manual_first_name && manual_last_name) {
      // Find or create company
      if (companyVal) {
        const existingCo = await db.execute({
          sql: `SELECT id FROM companies WHERE LOWER(name) = LOWER(?) LIMIT 1`,
          args: [companyVal],
        });
        if (existingCo.rows.length > 0) {
          resolvedCompanyId = Number(existingCo.rows[0].id);
        } else {
          const newCo = await db.execute({
            sql: `INSERT INTO companies (name) VALUES (?) RETURNING id`,
            args: [companyVal],
          });
          resolvedCompanyId = Number(newCo.rows[0].id);
          // Add to conference
          await db.execute({
            sql: `INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)`,
            args: [conference_id, resolvedCompanyId],
          }).catch(() => {});
        }
      }

      // Create attendee
      const newAtt = await db.execute({
        sql: `INSERT INTO attendees (first_name, last_name, title, company_id, email) VALUES (?, ?, ?, ?, ?) RETURNING id`,
        args: [manual_first_name.trim(), manual_last_name.trim(), titleVal || null, resolvedCompanyId, emailVal || null],
      });
      resolvedAttendeeId = Number(newAtt.rows[0].id);

      // Relate attendee to conference
      await db.execute({
        sql: `INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)`,
        args: [conference_id, resolvedAttendeeId],
      }).catch(() => {});
    }

    // If existing attendee, get their company_id
    if (resolvedAttendeeId && !resolvedCompanyId) {
      const attRow = await db.execute({
        sql: `SELECT company_id FROM attendees WHERE id = ?`,
        args: [resolvedAttendeeId],
      });
      if (attRow.rows.length > 0 && attRow.rows[0].company_id) {
        resolvedCompanyId = Number(attRow.rows[0].company_id);
      }
    }

    // Get conference name for notes
    const confRow = await db.execute({ sql: `SELECT name FROM conferences WHERE id = ?`, args: [conference_id] });
    const conferenceName = confRow.rows.length > 0 ? String(confRow.rows[0].name) : '';

    // Create submission record
    const subResult = await db.execute({
      sql: `INSERT INTO form_submissions (conference_form_id, conference_id, attendee_id) VALUES (?, ?, ?) RETURNING id`,
      args: [conference_form_id, conference_id, resolvedAttendeeId],
    });
    const submissionId = Number(subResult.rows[0].id);

    // Save submission values
    for (const v of (values as { field_id?: number; field_label: string; field_value: string }[])) {
      await db.execute({
        sql: `INSERT INTO form_submission_values (submission_id, field_id, field_label, field_value) VALUES (?, ?, ?, ?)`,
        args: [submissionId, v.field_id || null, v.field_label, v.field_value || ''],
      });
    }

    // Build note content from submission values
    const noteLines = (values as { field_label: string; field_value: string }[])
      .filter(v => v.field_value)
      .map(v => `${v.field_label}: ${v.field_value}`)
      .join('\n');
    const formNameRow = await db.execute({ sql: `SELECT name FROM conference_forms WHERE id = ?`, args: [conference_form_id] });
    const formName = formNameRow.rows.length > 0 ? String(formNameRow.rows[0].name) : 'Form';
    const noteContent = `Form Submission - ${formName}\n\n${noteLines}`;

    // Get rep display name and config_id
    let repName = user.email;
    let repConfigId: string | null = null;
    try {
      const configId = await getConfigIdByEmail(user.email);
      if (configId) {
        repConfigId = String(configId);
        const nameRow = await db.execute({ sql: `SELECT value FROM config_options WHERE id = ?`, args: [configId] });
        if (nameRow.rows.length > 0) repName = String(nameRow.rows[0].value);
      }
    } catch { /* non-fatal */ }

    // Add note to conference
    await db.execute({
      sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, rep, attendee_name, company_name)
            VALUES ('conference', ?, ?, ?, ?, ?, ?)`,
      args: [conference_id, noteContent, conferenceName, repName, nameVal || null, companyVal || null],
    }).catch(() => {});

    // Add note to attendee
    if (resolvedAttendeeId) {
      await db.execute({
        sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, rep, company_name)
              VALUES ('attendee', ?, ?, ?, ?, ?)`,
        args: [resolvedAttendeeId, noteContent, conferenceName, repName, companyVal || null],
      }).catch(() => {});
    }

    // Add note to company
    if (resolvedCompanyId) {
      await db.execute({
        sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, rep, attendee_name)
              VALUES ('company', ?, ?, ?, ?, ?)`,
        args: [resolvedCompanyId, noteContent, conferenceName, repName, nameVal || null],
      }).catch(() => {});
    }

    // Auto-create follow-up for the attendee on every form submission
    if (resolvedAttendeeId) {
      try {
        const nextStepRow = await db.execute({
          sql: `SELECT value FROM config_options WHERE category = 'next_steps' AND LOWER(value) = 'form' LIMIT 1`,
          args: [],
        });
        const fallbackRow = await db.execute({
          sql: `SELECT value FROM config_options WHERE category = 'next_steps' ORDER BY sort_order LIMIT 1`,
          args: [],
        });
        const nextStepValue = nextStepRow.rows.length > 0
          ? String(nextStepRow.rows[0].value)
          : fallbackRow.rows.length > 0 ? String(fallbackRow.rows[0].value) : 'Form';

        await db.execute({
          sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep, completed)
                VALUES (?, ?, ?, ?, ?, 0)`,
          args: [resolvedAttendeeId, conference_id, nextStepValue, `Follow up from form: ${formName}`, repConfigId],
        });
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({
      id: submissionId,
      attendee_id: resolvedAttendeeId,
      company_id: resolvedCompanyId,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/form-submissions error:', error);
    return NextResponse.json({ error: 'Failed to submit form' }, { status: 500 });
  }
}

async function getConfigIdByEmail(email: string): Promise<number | null> {
  try {
    const row = await db.execute({
      sql: `SELECT u.config_id FROM users u WHERE u.email = ? AND u.config_id IS NOT NULL LIMIT 1`,
      args: [email],
    });
    return row.rows.length > 0 && row.rows[0].config_id ? Number(row.rows[0].config_id) : null;
  } catch { return null; }
}
