import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { parseFile, classifyCompanyType } from '@/lib/parsers';
import {
  buildCompanyMatcher,
  buildAttendeeMatcher,
  matchCompany,
  matchAttendee,
} from '@/lib/matching';

async function batchInsert<T>(
  items: T[],
  toStatement: (item: T) => { sql: string; args: (string | number | null)[] },
  chunkSize = 100
): Promise<Array<{ rows: Record<string, unknown>[] }>> {
  const allResults: Array<{ rows: Record<string, unknown>[] }> = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const stmts = chunk.map(toStatement);
    const results = await db.batch(stmts, 'write');
    allResults.push(
      ...results.map((r) => ({ rows: r.rows as Record<string, unknown>[] }))
    );
  }
  return allResults;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const conferenceId = Number(params.id);

    // Check conference exists
    const confResult = await db.execute({
      sql: 'SELECT id FROM conferences WHERE id = ?',
      args: [conferenceId],
    });
    if (confResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseFile(buffer, file.name);
    const valid = parsed.filter((p) => p.first_name?.trim() || p.last_name?.trim());

    if (valid.length === 0) {
      return NextResponse.json({ error: 'No valid attendees found in file' }, { status: 400 });
    }

    // Get existing attendees already linked to this conference
    const existingLinked = await db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name FROM attendees a
            INNER JOIN conference_attendees ca ON a.id = ca.attendee_id
            WHERE ca.conference_id = ?`,
      args: [conferenceId],
    });
    const linkedNames = new Set<string>(
      existingLinked.rows.map((r) =>
        `${(r.first_name as string || '').trim()} ${(r.last_name as string || '').trim()}`.toLowerCase()
      )
    );

    // Separate attendees already in conference (for updates) vs new entries
    const newEntries = valid.filter((p) => {
      const key = `${(p.first_name ?? '').trim()} ${(p.last_name ?? '').trim()}`.toLowerCase();
      return !linkedNames.has(key);
    });
    const existingEntries = valid.filter((p) => {
      const key = `${(p.first_name ?? '').trim()} ${(p.last_name ?? '').trim()}`.toLowerCase();
      return linkedNames.has(key);
    });

    if (newEntries.length === 0 && existingEntries.length === 0) {
      return NextResponse.json({
        success: true,
        total_in_file: valid.length,
        new_count: 0,
        updated_count: 0,
        skipped_count: valid.length,
        message: 'All attendees in the file are already in this conference.',
      });
    }

    // Load all existing companies and attendees for matching
    const [existingCoRes, existingAtRes] = await Promise.all([
      db.execute({ sql: 'SELECT id, name, website FROM companies', args: [] }),
      db.execute({ sql: 'SELECT id, first_name, last_name FROM attendees', args: [] }),
    ]);

    // Build company lookup (exact + normalised + domain + fuzzy)
    type CoRow = { id: number; name: string; website?: string | null };
    const existingCompanies: CoRow[] = existingCoRes.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      website: r.website ? String(r.website) : null,
    }));
    const companyMatcher = buildCompanyMatcher(existingCompanies);

    // Collect unique company names with associated email/website/company_type/assigned_user for domain matching
    const companyIdCache = new Map<string, number>();
    type CompanyEntry = { name: string; email?: string; website?: string; company_type?: string; assigned_user?: string };
    const companyEntries = new Map<string, CompanyEntry>();
    for (const p of valid) {
      if (p.company?.trim()) {
        const coName = p.company.trim();
        if (!companyEntries.has(coName)) {
          companyEntries.set(coName, { name: coName, email: p.email?.trim(), website: p.website?.trim(), company_type: p.company_type?.trim(), assigned_user: p.assigned_user?.trim() });
        } else {
          // If we don't have an email/website/company_type/assigned_user yet for this company, pick it up
          const existing = companyEntries.get(coName)!;
          if (!existing.email && p.email?.trim()) existing.email = p.email.trim();
          if (!existing.website && p.website?.trim()) existing.website = p.website.trim();
          if (!existing.company_type && p.company_type?.trim()) existing.company_type = p.company_type.trim();
          if (!existing.assigned_user && p.assigned_user?.trim()) existing.assigned_user = p.assigned_user.trim();
        }
      }
    }

    // Match companies using name + domain matching
    companyEntries.forEach((entry, coName) => {
      const hit = matchCompany(coName, existingCompanies, companyMatcher, entry.email, entry.website);
      if (hit) {
        companyIdCache.set(coName, hit.match.id);
      } else {
        companyIdCache.set(coName, -1);
      }
    });

    // Update existing matched companies with CSV-provided fields
    const existingToUpdate = Array.from(companyEntries.entries()).filter(([n, entry]) => {
      const id = companyIdCache.get(n);
      return id !== undefined && id > 0 && (entry.company_type || entry.assigned_user || entry.website);
    });
    if (existingToUpdate.length > 0) {
      await batchInsert(existingToUpdate, ([n, entry]) => ({
        sql: `UPDATE companies SET
          company_type = COALESCE(?, company_type),
          assigned_user = COALESCE(?, assigned_user),
          website = COALESCE(?, website)
          WHERE id = ?`,
        args: [entry.company_type || null, entry.assigned_user || null, entry.website || null, companyIdCache.get(n)!],
      }));
    }

    // Batch-insert new companies (with auto-detected company type, website, and assigned_user)
    const newCoNames = Array.from(companyEntries.keys()).filter((n) => companyIdCache.get(n) === -1);
    if (newCoNames.length > 0) {
      const results = await batchInsert(newCoNames, (n) => {
        const entry = companyEntries.get(n)!;
        const detectedType = entry.company_type || classifyCompanyType(n);
        const website = entry.website || null;
        const assignedUser = entry.assigned_user || null;
        return {
          sql: 'INSERT INTO companies (name, company_type, website, assigned_user) VALUES (?, ?, ?, ?) RETURNING id',
          args: [n, detectedType || null, website, assignedUser],
        };
      });
      for (let i = 0; i < newCoNames.length; i++) {
        const id = Number(results[i]?.rows[0]?.id ?? 0);
        if (id > 0) companyIdCache.set(newCoNames[i], id);
      }
    }

    // Attendees stay with their own company — child contacts are NOT redirected to the parent
    const resolveCompanyId = (coName: string): number | null => {
      const coId = companyIdCache.get(coName);
      if (!coId || coId <= 0) return null;
      return coId;
    };

    // Build attendee lookup (exact + normalised + fuzzy)
    type AtRow = { id: number; full_name: string };
    const existingAttendees: AtRow[] = existingAtRes.rows.map((r) => ({
      id: Number(r.id),
      full_name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    }));
    const attendeeMatcher = buildAttendeeMatcher(existingAttendees);

    const attendeeIdCache = new Map<string, number>();
    type NewAttendee = { first_name: string; last_name: string; title?: string; company_id: number | null; email?: string };
    const newAttendees: NewAttendee[] = [];
    type ExistingAttendeeUpdate = { id: number; company_id: number | null; title: string | null; email: string | null };
    const existingAttendeeUpdates: ExistingAttendeeUpdate[] = [];
    const seen = new Set<string>();

    for (const p of newEntries) {
      const fname = (p.first_name ?? '').trim();
      const lname = (p.last_name ?? '').trim();
      const key = `${fname} ${lname}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const hit = matchAttendee(fname, lname, existingAttendees, attendeeMatcher);
      if (hit) {
        attendeeIdCache.set(key, hit.match.id);
        // Update the existing attendee's company, title, and email from the CSV
        const companyId = p.company?.trim()
          ? resolveCompanyId(p.company.trim())
          : null;
        existingAttendeeUpdates.push({
          id: hit.match.id,
          company_id: companyId && companyId > 0 ? companyId : null,
          title: p.title?.trim() || null,
          email: p.email?.trim() || null,
        });
      } else {
        attendeeIdCache.set(key, -1);
        const companyId = p.company?.trim()
          ? resolveCompanyId(p.company.trim())
          : null;
        newAttendees.push({
          first_name: fname,
          last_name: lname,
          title: p.title?.trim() || undefined,
          company_id: companyId && companyId > 0 ? companyId : null,
          email: p.email?.trim() || undefined,
        });
      }
    }

    // Also process attendees already linked to this conference — update their fields from the new upload
    const linkedAttendeeMap = new Map<string, number>();
    for (const r of existingLinked.rows) {
      const key = `${(r.first_name as string || '').trim()} ${(r.last_name as string || '').trim()}`.toLowerCase();
      linkedAttendeeMap.set(key, Number(r.id));
    }

    for (const p of existingEntries) {
      const fname = (p.first_name ?? '').trim();
      const lname = (p.last_name ?? '').trim();
      const key = `${fname} ${lname}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const existingId = linkedAttendeeMap.get(key);
      if (existingId) {
        const companyId = p.company?.trim()
          ? resolveCompanyId(p.company.trim())
          : null;
        existingAttendeeUpdates.push({
          id: existingId,
          company_id: companyId && companyId > 0 ? companyId : null,
          title: p.title?.trim() || null,
          email: p.email?.trim() || null,
        });
      }
    }

    // Batch-update existing matched attendees with CSV company/title/email
    if (existingAttendeeUpdates.length > 0) {
      await batchInsert(existingAttendeeUpdates, (u) => ({
        sql: 'UPDATE attendees SET company_id = COALESCE(?, company_id), title = COALESCE(?, title), email = COALESCE(?, email) WHERE id = ?',
        args: [u.company_id, u.title, u.email, u.id],
      }));
    }

    // Batch-insert new attendees
    if (newAttendees.length > 0) {
      const results = await batchInsert(newAttendees, (a) => ({
        sql: 'INSERT INTO attendees (first_name, last_name, title, company_id, email) VALUES (?, ?, ?, ?, ?) RETURNING id',
        args: [a.first_name, a.last_name, a.title ?? null, a.company_id, a.email ?? null],
      }));
      for (let i = 0; i < newAttendees.length; i++) {
        const key = `${newAttendees[i].first_name} ${newAttendees[i].last_name}`.toLowerCase();
        const id = Number(results[i]?.rows[0]?.id ?? 0);
        if (id > 0) attendeeIdCache.set(key, id);
      }
    }

    // Collect all attendee IDs to link
    const linkedIdSet = new Set<number>();
    seen.forEach((key) => {
      const id = attendeeIdCache.get(key) ?? 0;
      if (id > 0) linkedIdSet.add(id);
    });
    const attendeeIdsToLink = Array.from(linkedIdSet);

    // Batch-insert conference_attendees
    await batchInsert(attendeeIdsToLink, (aid) => ({
      sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
      args: [conferenceId, aid],
    }));

    const skippedCount = valid.length - newEntries.length;
    const updatedCount = existingAttendeeUpdates.length;

    return NextResponse.json({
      success: true,
      total_in_file: valid.length,
      new_count: attendeeIdsToLink.length,
      updated_count: updatedCount,
      skipped_count: skippedCount - updatedCount,
    });
  } catch (error) {
    console.error('POST /api/conferences/[id]/attendees/upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload attendees' },
      { status: 500 }
    );
  }
}
