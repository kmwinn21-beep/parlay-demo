import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { resolveOrCreateAttendee } from '@/lib/resolveOrCreateAttendee';
import { notifyConferenceInternalAttendees } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

// Public endpoint — no auth. Resolves the conference_form/conference entirely from the
// public token (never trusts a client-supplied conference_form_id/conference_id), and
// requires an empty honeypot field as basic bot protection.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      token,
      aid,
      honeypot,
      values,
      manual_first_name,
      manual_last_name,
    } = body;

    if (!token || !aid) return NextResponse.json({ error: 'token and aid required' }, { status: 400 });
    if (honeypot) {
      // Silently "succeed" for bots so they don't learn the field is a trap.
      return NextResponse.json({ id: 0 }, { status: 201 });
    }
    if (!manual_first_name?.trim() || !manual_last_name?.trim()) {
      return NextResponse.json({ error: 'First and last name are required' }, { status: 400 });
    }

    const db = await getDb(aid === 'master' ? undefined : aid).catch(() => null);
    if (!db) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const formRes = await db.execute({
      sql: `SELECT id, conference_id, name FROM conference_forms WHERE public_token = ? AND is_public = 1`,
      args: [token],
    });
    const form = formRes.rows[0];
    if (!form) return NextResponse.json({ error: 'This form is not available' }, { status: 404 });

    const conference_form_id = Number(form.id);
    const conference_id = Number(form.conference_id);
    const formName = String(form.name);

    const getVal = (label: string) =>
      (values as { field_label: string; field_value: string }[] | undefined)
        ?.find(v => v.field_label?.toLowerCase() === label.toLowerCase())?.field_value || '';

    const nameVal = `${manual_first_name} ${manual_last_name}`.trim();
    const companyVal = getVal('Company');
    const emailVal = getVal('Email Address') || getVal('Email');
    const titleVal = getVal('Title');

    // Find or create company
    let resolvedCompanyId: number | null = null;
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
      }
    }

    // Reuse an existing attendee with the same name (preferring the same company, if
    // known) instead of always creating a new record.
    const resolvedAttendeeId = await resolveOrCreateAttendee(db, {
      firstName: manual_first_name,
      lastName: manual_last_name,
      title: titleVal,
      email: emailVal,
      companyId: resolvedCompanyId,
    });
    await db.execute({
      sql: `INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)`,
      args: [conference_id, resolvedAttendeeId],
    }).catch(() => {});

    const confRow = await db.execute({ sql: `SELECT name FROM conferences WHERE id = ?`, args: [conference_id] });
    const conferenceName = confRow.rows.length > 0 ? String(confRow.rows[0].name) : '';

    const subResult = await db.execute({
      sql: `INSERT INTO form_submissions (conference_form_id, conference_id, attendee_id, submission_source) VALUES (?, ?, ?, 'public_link') RETURNING id`,
      args: [conference_form_id, conference_id, resolvedAttendeeId],
    });
    const submissionId = Number(subResult.rows[0].id);

    // "Name" isn't one of form.fields (it's collected via the dedicated first/last name
    // inputs, not a regular field), but the submissions table reads it from this list —
    // without it, the Name column shows a dash for every public submission.
    const valuesWithName = [
      { field_id: null, field_label: 'Name', field_value: nameVal },
      ...((values as { field_id?: number; field_label: string; field_value: string }[] | undefined) || []),
    ];
    for (const v of valuesWithName) {
      await db.execute({
        sql: `INSERT INTO form_submission_values (submission_id, field_id, field_label, field_value) VALUES (?, ?, ?, ?)`,
        args: [submissionId, v.field_id || null, v.field_label, v.field_value || ''],
      });
    }

    const noteLines = ((values as { field_label: string; field_value: string }[] | undefined) || [])
      .filter(v => v.field_value)
      .map(v => `${v.field_label}: ${v.field_value}`)
      .join('\n');
    const noteContent = `Public Form Submission - ${formName}\n\n${noteLines}`;

    await db.execute({
      sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, rep, attendee_name, company_name)
            VALUES ('conference', ?, ?, ?, 'Public Form', ?, ?)`,
      args: [conference_id, noteContent, conferenceName, nameVal || null, companyVal || null],
    }).catch(() => {});

    await db.execute({
      sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, rep, company_name)
            VALUES ('attendee', ?, ?, ?, 'Public Form', ?)`,
      args: [resolvedAttendeeId, noteContent, conferenceName, companyVal || null],
    }).catch(() => {});

    if (resolvedCompanyId) {
      await db.execute({
        sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, rep, attendee_name)
              VALUES ('company', ?, ?, ?, 'Public Form', ?)`,
        args: [resolvedCompanyId, noteContent, conferenceName, nameVal || null],
      }).catch(() => {});
    }

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
        sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, completed)
              VALUES (?, ?, ?, ?, 0)`,
        args: [resolvedAttendeeId, conference_id, nextStepValue, `Follow up from public form: ${formName}`],
      });
    } catch { /* non-fatal */ }

    // Notify internal attendees on this conference (in-app + email) — best-effort, never
    // throws, so a notification failure can't fail the submission itself.
    await notifyConferenceInternalAttendees({
      conferenceId: conference_id,
      conferenceName,
      message: `${nameVal || 'Someone'}${companyVal ? ` from ${companyVal}` : ''} submitted the "${formName}" form via the public link`,
      changedByEmail: 'Public Form Submission',
      changedByConfigId: null,
    });

    return NextResponse.json({ id: submissionId }, { status: 201 });
  } catch (error) {
    console.error('POST /api/public/form-submissions error:', error);
    return NextResponse.json({ error: 'Failed to submit form' }, { status: 500 });
  }
}

