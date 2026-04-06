import { NextRequest, NextResponse } from 'next/server';
import Fuse from 'fuse.js';
import { db, dbReady } from '@/lib/db';
import { parseFile } from '@/lib/parsers';

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

    // Filter out attendees that already exist in this conference
    const newEntries = valid.filter((p) => {
      const key = `${(p.first_name ?? '').trim()} ${(p.last_name ?? '').trim()}`.toLowerCase();
      return !linkedNames.has(key);
    });

    if (newEntries.length === 0) {
      return NextResponse.json({
        success: true,
        total_in_file: valid.length,
        new_count: 0,
        skipped_count: valid.length,
        message: 'All attendees in the file are already in this conference.',
      });
    }

    // Load all existing companies and attendees for matching
    const [existingCoRes, existingAtRes] = await Promise.all([
      db.execute({ sql: 'SELECT id, name FROM companies', args: [] }),
      db.execute({ sql: 'SELECT id, first_name, last_name FROM attendees', args: [] }),
    ]);

    // Build company lookup
    type CoRow = { id: number; name: string };
    const existingCompanies: CoRow[] = existingCoRes.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
    }));
    const companyExactMap = new Map<string, number>();
    for (const c of existingCompanies) companyExactMap.set(c.name.toLowerCase().trim(), c.id);

    const companyFuse = new Fuse(existingCompanies, {
      keys: ['name'],
      threshold: 0.3,
      includeScore: true,
    });

    const companyIdCache = new Map<string, number>();
    const companyNameSet = new Set<string>();
    newEntries.forEach((p) => { if (p.company?.trim()) companyNameSet.add(p.company.trim()); });
    const uniqueCompanyNames = Array.from(companyNameSet);

    for (const coName of uniqueCompanyNames) {
      const key = coName.toLowerCase();
      if (companyExactMap.has(key)) {
        companyIdCache.set(coName, companyExactMap.get(key)!);
      } else {
        const hits = companyFuse.search(coName);
        if (hits.length > 0 && (hits[0].score ?? 1) <= 0.3) {
          companyIdCache.set(coName, hits[0].item.id);
        } else {
          companyIdCache.set(coName, -1);
        }
      }
    }

    // Batch-insert new companies
    const newCoNames = uniqueCompanyNames.filter((n) => companyIdCache.get(n) === -1);
    if (newCoNames.length > 0) {
      const results = await batchInsert(newCoNames, (n) => ({
        sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id',
        args: [n],
      }));
      for (let i = 0; i < newCoNames.length; i++) {
        const id = Number(results[i]?.rows[0]?.id ?? 0);
        if (id > 0) companyIdCache.set(newCoNames[i], id);
      }
    }

    // Build attendee lookup
    type AtRow = { id: number; full_name: string };
    const existingAttendees: AtRow[] = existingAtRes.rows.map((r) => ({
      id: Number(r.id),
      full_name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim().toLowerCase(),
    }));
    const attendeeExactMap = new Map<string, number>();
    for (const a of existingAttendees) attendeeExactMap.set(a.full_name, a.id);

    const attendeeFuse = new Fuse(existingAttendees, {
      keys: ['full_name'],
      threshold: 0.3,
      includeScore: true,
    });

    const attendeeIdCache = new Map<string, number>();
    type NewAttendee = { first_name: string; last_name: string; title?: string; company_id: number | null; email?: string };
    const newAttendees: NewAttendee[] = [];
    const seen = new Set<string>();

    for (const p of newEntries) {
      const fname = (p.first_name ?? '').trim();
      const lname = (p.last_name ?? '').trim();
      const key = `${fname} ${lname}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      if (attendeeExactMap.has(key)) {
        attendeeIdCache.set(key, attendeeExactMap.get(key)!);
      } else {
        const hits = attendeeFuse.search(`${fname} ${lname}`);
        if (hits.length > 0 && (hits[0].score ?? 1) <= 0.3) {
          attendeeIdCache.set(key, hits[0].item.id);
        } else {
          attendeeIdCache.set(key, -1);
          const companyId = p.company?.trim()
            ? (companyIdCache.get(p.company.trim()) ?? null)
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

    return NextResponse.json({
      success: true,
      total_in_file: valid.length,
      new_count: attendeeIdsToLink.length,
      skipped_count: skippedCount,
    });
  } catch (error) {
    console.error('POST /api/conferences/[id]/attendees/upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload attendees' },
      { status: 500 }
    );
  }
}
