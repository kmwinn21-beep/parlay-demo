import { NextRequest, NextResponse } from 'next/server';
import Fuse from 'fuse.js';
import { db, dbReady } from '@/lib/db';
import { parseFile } from '@/lib/parsers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await dbReady;
    const result = await db.execute({
      sql: `SELECT c.*, COUNT(ca.attendee_id) as attendee_count
            FROM conferences c
            LEFT JOIN conference_attendees ca ON c.id = ca.conference_id
            GROUP BY c.id
            ORDER BY c.start_date DESC`,
      args: [],
    });
    return NextResponse.json(result.rows.map((r) => ({ ...r })));
  } catch (error) {
    console.error('GET /api/conferences error:', error);
    return NextResponse.json({ error: 'Failed to fetch conferences' }, { status: 500 });
  }
}

// Helper to insert in chunks and return results
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

export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const start_date = formData.get('start_date') as string;
    const end_date = formData.get('end_date') as string;
    const location = formData.get('location') as string;
    const notes = formData.get('notes') as string | null;
    const file = formData.get('file') as File | null;

    if (!name || !start_date || !end_date || !location) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create the conference record
    const confResult = await db.execute({
      sql: 'INSERT INTO conferences (name, start_date, end_date, location, notes) VALUES (?, ?, ?, ?, ?) RETURNING *',
      args: [name, start_date, end_date, location, notes || null],
    });
    const conference = confResult.rows[0] as unknown as {
      id: number | bigint;
      name: string;
      start_date: string;
      end_date: string;
      location: string;
      notes: string | null;
      created_at: string;
    };
    const conferenceId = Number(conference.id);

    let parsedCount = 0;

    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = await parseFile(buffer, file.name);
      const valid = parsed.filter((p) => p.first_name?.trim() || p.last_name?.trim());

      if (valid.length > 0) {
        // ── Step 1: Load ALL existing companies and attendees in two queries ──
        const [existingCoRes, existingAtRes] = await Promise.all([
          db.execute({ sql: 'SELECT id, name FROM companies', args: [] }),
          db.execute({ sql: 'SELECT id, first_name, last_name FROM attendees', args: [] }),
        ]);

        // ── Step 2: Build company lookup (exact + fuzzy) ──
        type CoRow = { id: number; name: string };
        const existingCompanies: CoRow[] = existingCoRes.rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? ''),
        }));
        const companyExactMap = new Map<string, number>(); // lowercase -> id
        for (const c of existingCompanies) companyExactMap.set(c.name.toLowerCase().trim(), c.id);

        const companyFuse = new Fuse(existingCompanies, {
          keys: ['name'],
          threshold: 0.3,
          includeScore: true,
        });

        // Resolve company name -> id (or mark -1 = needs insert)
        const companyIdCache = new Map<string, number>(); // original cased name -> id
        const companyNameSet = new Set<string>();
        valid.forEach((p) => { if (p.company?.trim()) companyNameSet.add(p.company.trim()); });
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
              companyIdCache.set(coName, -1); // new company
            }
          }
        }

        // ── Step 3: Batch-insert new companies ──
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

        // ── Step 4: Build attendee lookup (exact + fuzzy) ──
        type AtRow = { id: number; full_name: string };
        const existingAttendees: AtRow[] = existingAtRes.rows.map((r) => ({
          id: Number(r.id),
          full_name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim().toLowerCase(),
        }));
        const attendeeExactMap = new Map<string, number>(); // "first last" lowercase -> id
        for (const a of existingAttendees) attendeeExactMap.set(a.full_name, a.id);

        const attendeeFuse = new Fuse(existingAttendees, {
          keys: ['full_name'],
          threshold: 0.3,
          includeScore: true,
        });

        // Resolve each attendee row (deduplicated by name)
        const attendeeIdCache = new Map<string, number>(); // "first last" lowercase -> id
        type NewAttendee = { first_name: string; last_name: string; title?: string; company_id: number | null; email?: string };
        const newAttendees: NewAttendee[] = [];
        const seen = new Set<string>();

        for (const p of valid) {
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
              // Mark for insertion
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

        // ── Step 5: Batch-insert new attendees ──
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

        // ── Step 6: Collect all attendee IDs to link, deduplicated ──
        const linkedIdSet = new Set<number>();
        seen.forEach((key) => {
          const id = attendeeIdCache.get(key) ?? 0;
          if (id > 0) linkedIdSet.add(id);
        });
        const attendeeIdsToLink = Array.from(linkedIdSet);

        // ── Step 7: Batch-insert conference_attendees ──
        await batchInsert(attendeeIdsToLink, (aid) => ({
          sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
          args: [conferenceId, aid],
        }));

        parsedCount = attendeeIdsToLink.length;
      }
    }

    return NextResponse.json(
      { ...conference, id: conferenceId, parsed_count: parsedCount },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/conferences error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create conference' },
      { status: 500 }
    );
  }
}
