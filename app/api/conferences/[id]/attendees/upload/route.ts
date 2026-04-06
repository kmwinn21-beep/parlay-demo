import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { parseFile, classifyCompanyType } from '@/lib/parsers';
import {
  buildCompanyMatcher,
  buildAttendeeMatcher,
  matchCompany,
  matchAttendee,
  extractDomain,
  extractDomainFromWebsite,
  detectParentCompany,
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

    // Collect unique company names with associated email/website/company_type for domain matching
    const companyIdCache = new Map<string, number>();
    type CompanyEntry = { name: string; email?: string; website?: string; company_type?: string };
    const companyEntries = new Map<string, CompanyEntry>();
    for (const p of newEntries) {
      if (p.company?.trim()) {
        const coName = p.company.trim();
        if (!companyEntries.has(coName)) {
          companyEntries.set(coName, { name: coName, email: p.email?.trim(), website: p.website?.trim(), company_type: p.company_type?.trim() });
        } else {
          // If we don't have an email/website/company_type yet for this company, pick it up
          const existing = companyEntries.get(coName)!;
          if (!existing.email && p.email?.trim()) existing.email = p.email.trim();
          if (!existing.website && p.website?.trim()) existing.website = p.website.trim();
          if (!existing.company_type && p.company_type?.trim()) existing.company_type = p.company_type.trim();
        }
      }
    }

    // Build a domain→company_name map from uploaded entries for cross-referencing
    const uploadDomainMap = new Map<string, string>();
    companyEntries.forEach((entry, coName) => {
      const domain = extractDomain(entry.email, entry.website);
      if (domain && !uploadDomainMap.has(domain)) {
        uploadDomainMap.set(domain, coName);
      }
    });

    // Phase 1: Match companies using name + domain matching
    companyEntries.forEach((entry, coName) => {
      const hit = matchCompany(coName, existingCompanies, companyMatcher, entry.email, entry.website);
      if (hit) {
        companyIdCache.set(coName, hit.match.id);
      } else {
        companyIdCache.set(coName, -1);
      }
    });

    // Update existing matched companies with CSV-provided company_type
    const existingToUpdate = Array.from(companyEntries.entries()).filter(([n, entry]) => {
      const id = companyIdCache.get(n);
      return id !== undefined && id > 0 && entry.company_type;
    });
    if (existingToUpdate.length > 0) {
      await batchInsert(existingToUpdate, ([n, entry]) => ({
        sql: 'UPDATE companies SET company_type = ? WHERE id = ? AND (company_type IS NULL OR company_type = ?)',
        args: [entry.company_type!, companyIdCache.get(n)!, entry.company_type!],
      }));
    }

    // Batch-insert new companies (with auto-detected company type and website)
    const newCoNames = Array.from(companyEntries.keys()).filter((n) => companyIdCache.get(n) === -1);
    if (newCoNames.length > 0) {
      const results = await batchInsert(newCoNames, (n) => {
        const entry = companyEntries.get(n)!;
        const detectedType = entry.company_type || classifyCompanyType(n);
        const website = entry.website || null;
        if (detectedType && website) {
          return {
            sql: 'INSERT INTO companies (name, company_type, website) VALUES (?, ?, ?) RETURNING id',
            args: [n, detectedType, website],
          };
        } else if (detectedType) {
          return {
            sql: 'INSERT INTO companies (name, company_type) VALUES (?, ?) RETURNING id',
            args: [n, detectedType],
          };
        } else if (website) {
          return {
            sql: 'INSERT INTO companies (name, website) VALUES (?, ?) RETURNING id',
            args: [n, website],
          };
        } else {
          return {
            sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id',
            args: [n],
          };
        }
      });
      for (let i = 0; i < newCoNames.length; i++) {
        const id = Number(results[i]?.rows[0]?.id ?? 0);
        if (id > 0) companyIdCache.set(newCoNames[i], id);
      }
    }

    // Phase 2: Parent/child detection
    // Build a list of all companies (existing + newly created) with domain info
    type ParentCandidate = { id: number; name: string; domain?: string | null };
    const allCompanies: ParentCandidate[] = [
      ...existingCompanies.map((c) => ({
        id: c.id,
        name: c.name,
        domain: extractDomainFromWebsite(c.website ?? undefined),
      })),
    ];
    // Add newly created companies with their domain info
    companyEntries.forEach((entry, coName) => {
      const coId = companyIdCache.get(coName);
      if (coId && coId > 0 && !allCompanies.find((c) => c.id === coId)) {
        allCompanies.push({
          id: coId,
          name: coName,
          domain: extractDomain(entry.email, entry.website),
        });
      }
    });

    // For each new company in the upload, check if it's a child of an existing parent
    const parentUpdates: Array<{ childId: number; parentId: number }> = [];

    companyEntries.forEach((entry, coName) => {
      const coId = companyIdCache.get(coName);
      if (!coId || coId <= 0) return;

      const childDomain = extractDomain(entry.email, entry.website);
      // Only check companies other than this one as parent candidates
      const candidates = allCompanies.filter((c) => c.id !== coId);
      const parent = detectParentCompany(coName, childDomain, candidates);

      if (parent) {
        parentUpdates.push({ childId: coId, parentId: parent.id });
      }
    });

    // Apply parent_company_id updates
    if (parentUpdates.length > 0) {
      await batchInsert(parentUpdates, (u) => ({
        sql: 'UPDATE companies SET parent_company_id = ? WHERE id = ? AND parent_company_id IS NULL',
        args: [u.parentId, u.childId],
      }));
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
