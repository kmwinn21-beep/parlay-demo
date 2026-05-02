import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady, getConfigOptionValues } from '@/lib/db';
import { parseFile, parseFileWithMapping, classifyCompanyType, matchConfigOption, type ColumnMapping } from '@/lib/parsers';
import {
  buildCompanyMatcher,
  buildAttendeeMatcher,
  matchCompany,
  matchAttendee,
  confirmAttendeeMatch,
} from '@/lib/matching';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    // ?nav=1 — lightweight query for the header navigation dropdown (no JOIN/COUNT)
    if (request.nextUrl.searchParams.get('nav') === '1') {
      const result = await db.execute({
        sql: `SELECT id, name, start_date, end_date, internal_attendees FROM conferences ORDER BY start_date DESC`,
        args: [],
      });
      return NextResponse.json(result.rows.map((r) => ({ ...r })), {
        headers: { 'Cache-Control': 'private, no-cache' },
      });
    }
    const result = await db.execute({
      sql: `SELECT c.*, COUNT(ca.attendee_id) as attendee_count
            FROM conferences c
            LEFT JOIN conference_attendees ca ON c.id = ca.conference_id
            GROUP BY c.id
            ORDER BY c.start_date DESC`,
      args: [],
    });
    return NextResponse.json(result.rows.map((r) => ({ ...r })), {
      headers: { 'Cache-Control': 'private, no-cache' },
    });
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
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const start_date = formData.get('start_date') as string;
    const end_date = formData.get('end_date') as string;
    const location = formData.get('location') as string;
    const notes = formData.get('notes') as string | null;
    const internal_attendees = formData.get('internal_attendees') as string | null;
    const file = formData.get('file') as File | null;
    const mappingJson = formData.get('mapping') as string | null;
    const mapping: ColumnMapping | null = mappingJson ? JSON.parse(mappingJson) as ColumnMapping : null;

    if (!name || !start_date || !end_date || !location) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create the conference record
    const confResult = await db.execute({
      sql: 'INSERT INTO conferences (name, start_date, end_date, location, notes, internal_attendees) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
      args: [name, start_date, end_date, location, notes || null, internal_attendees || null],
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
      const [companyTypeOptions, servicesOptions, functionOptions, productOptions] = await Promise.all([
        getConfigOptionValues('company_type'),
        getConfigOptionValues('services'),
        getConfigOptionValues('function'),
        getConfigOptionValues('products'),
      ]);

      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = mapping
        ? await parseFileWithMapping(buffer, file.name, mapping)
        : await parseFile(buffer, file.name);
      const valid = parsed.filter((p) => p.first_name?.trim() || p.last_name?.trim());

      // Resolve config-driven fields via fuzzy matching against canonical config_options values
      if (companyTypeOptions.length > 0) {
        for (const p of valid) {
          if (p.company_type) {
            p.company_type = matchConfigOption(p.company_type, companyTypeOptions) ?? undefined;
          }
        }
      }
      if (servicesOptions.length > 0) {
        for (const p of valid) {
          if (p.services) {
            const matched = p.services.split(',').map(s => s.trim()).filter(Boolean)
              .map(s => matchConfigOption(s, servicesOptions)).filter((v): v is string => v !== null);
            p.services = matched.length > 0 ? matched.join(',') : undefined;
          }
        }
      }
      if (functionOptions.length > 0) {
        for (const p of valid) {
          if (p.function) {
            const matched = p.function.split(',').map(s => s.trim()).filter(Boolean)
              .map(s => matchConfigOption(s, functionOptions)).filter((v): v is string => v !== null);
            p.function = matched.length > 0 ? matched.join(',') : undefined;
          }
        }
      }
      if (productOptions.length > 0) {
        for (const p of valid) {
          if (p.product) {
            const matched = p.product.split(',').map(s => s.trim()).filter(Boolean)
              .map(s => matchConfigOption(s, productOptions)).filter((v): v is string => v !== null);
            p.product = matched.length > 0 ? matched.join(',') : undefined;
          }
        }
      }

      if (valid.length > 0) {
        // ── Step 1: Load ALL existing companies and attendees in two queries ──
        const [existingCoRes, existingAtRes] = await Promise.all([
          db.execute({ sql: 'SELECT id, name, website, parent_company_id, assigned_user FROM companies', args: [] }),
          db.execute({
            sql: `SELECT a.id, a.first_name, a.last_name, a.email,
                         c.name AS company_name, c.website AS company_website
                  FROM attendees a
                  LEFT JOIN companies c ON a.company_id = c.id`,
            args: [],
          }),
        ]);

        // ── Step 2: Build company lookup (exact + normalised + fuzzy) ──
        type CoRow = { id: number; name: string; website?: string | null; parent_company_id?: number | null; assigned_user?: string | null };
        const existingCompanies: CoRow[] = existingCoRes.rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? ''),
          website: r.website ? String(r.website) : null,
          parent_company_id: r.parent_company_id ? Number(r.parent_company_id) : null,
          assigned_user: r.assigned_user ? String(r.assigned_user) : null,
        }));
        const companyMatcher = buildCompanyMatcher(existingCompanies);

        // Resolve company name -> id (or mark -1 = needs insert)
        const companyIdCache = new Map<string, number>(); // original cased name -> id
        const companyTypeMap = new Map<string, string>(); // company name -> company_type from file
        const companyAssignedUserMap = new Map<string, string>(); // company name -> assigned_user from file
        const companyWebsiteMap = new Map<string, string>(); // company name -> website from file
        const companyWseMap = new Map<string, number>(); // company name -> wse from file
        const companyServicesMap = new Map<string, string>(); // company name -> services from file
        const companyNameSet = new Set<string>();
        valid.forEach((p) => {
          if (p.company?.trim()) {
            companyNameSet.add(p.company.trim());
            if (p.company_type?.trim() && !companyTypeMap.has(p.company.trim())) {
              companyTypeMap.set(p.company.trim(), p.company_type.trim());
            }
            if (p.assigned_user?.trim() && !companyAssignedUserMap.has(p.company.trim())) {
              companyAssignedUserMap.set(p.company.trim(), p.assigned_user.trim());
            }
            if (p.website?.trim() && !companyWebsiteMap.has(p.company.trim())) {
              companyWebsiteMap.set(p.company.trim(), p.website.trim());
            }
            if (p.wse?.trim() && !companyWseMap.has(p.company.trim())) {
              const wseVal = parseInt(p.wse.trim(), 10);
              if (!isNaN(wseVal) && wseVal > 0) companyWseMap.set(p.company.trim(), wseVal);
            }
            if (p.services?.trim() && !companyServicesMap.has(p.company.trim())) {
              companyServicesMap.set(p.company.trim(), p.services.trim());
            }
          }
        });
        const uniqueCompanyNames = Array.from(companyNameSet);

        for (const coName of uniqueCompanyNames) {
          const hit = matchCompany(coName, existingCompanies, companyMatcher);
          if (hit) {
            companyIdCache.set(coName, hit.match.id);
          } else {
            companyIdCache.set(coName, -1); // new company
          }
        }

        // ── Step 2b: Redirect WSE values from child companies to their parent companies ──
        const parentWseUpdates = new Map<number, number>();
        for (const coName of uniqueCompanyNames) {
          const wseVal = companyWseMap.get(coName);
          if (!wseVal) continue;
          const coId = companyIdCache.get(coName);
          if (!coId || coId <= 0) continue;
          const company = existingCompanies.find((c) => c.id === coId);
          if (company?.parent_company_id) {
            // Child company: redirect WSE to parent, remove from child's map
            if (!parentWseUpdates.has(company.parent_company_id)) {
              parentWseUpdates.set(company.parent_company_id, wseVal);
            }
            companyWseMap.delete(coName);
          }
        }

        if (parentWseUpdates.size > 0) {
          await batchInsert(Array.from(parentWseUpdates.entries()), ([parentId, wse]) => ({
            sql: 'UPDATE companies SET wse = COALESCE(?, wse) WHERE id = ?',
            args: [wse, parentId],
          }));
        }

        // ── Step 3a: Update existing companies with CSV-provided fields ──
        const existingToUpdate = uniqueCompanyNames.filter((n) => {
          const id = companyIdCache.get(n);
          return id !== undefined && id > 0 && (companyTypeMap.has(n) || companyAssignedUserMap.has(n) || companyWebsiteMap.has(n) || companyWseMap.has(n) || companyServicesMap.has(n));
        });
        if (existingToUpdate.length > 0) {
          await batchInsert(existingToUpdate, (n) => {
            const coId = companyIdCache.get(n)!;
            const existingCompany = existingCompanies.find((c) => c.id === coId);
            // If the company already has 2 or more assigned users in the DB, do not overwrite from the uploaded list
            const existingAssignedCount = existingCompany?.assigned_user
              ? existingCompany.assigned_user.split(',').filter((s) => s.trim()).length
              : 0;
            const assignedUserArg = existingAssignedCount >= 2 ? null : (companyAssignedUserMap.get(n) || null);
            return {
              sql: `UPDATE companies SET
                company_type = COALESCE(?, company_type),
                assigned_user = COALESCE(?, assigned_user),
                website = COALESCE(?, website),
                wse = COALESCE(?, wse),
                services = COALESCE(?, services)
                WHERE id = ?`,
              args: [companyTypeMap.get(n) || null, assignedUserArg, companyWebsiteMap.get(n) || null, companyWseMap.get(n) ?? null, companyServicesMap.get(n) || null, coId],
            };
          });
        }

        // ── Step 3b: Batch-insert new companies ──
        const newCoNames = uniqueCompanyNames.filter((n) => companyIdCache.get(n) === -1);
        if (newCoNames.length > 0) {
          const results = await batchInsert(newCoNames, (n) => {
            const detectedType = companyTypeMap.get(n) || classifyCompanyType(n, companyTypeOptions);
            const assignedUser = companyAssignedUserMap.get(n) || null;
            const website = companyWebsiteMap.get(n) || null;
            const wse = companyWseMap.get(n) ?? null;
            const services = companyServicesMap.get(n) || null;
            return {
              sql: 'INSERT INTO companies (name, company_type, assigned_user, website, wse, services) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
              args: [n, detectedType || null, assignedUser, website, wse, services],
            };
          });
          for (let i = 0; i < newCoNames.length; i++) {
            const id = Number(results[i]?.rows[0]?.id ?? 0);
            if (id > 0) companyIdCache.set(newCoNames[i], id);
          }
        }

        // ── Step 4: Build attendee lookup (exact name match + secondary confirmation) ──
        type AtRow = { id: number; full_name: string; email: string | null; website: string | null; company_name: string | null };
        const existingAttendees: AtRow[] = existingAtRes.rows.map((r) => ({
          id: Number(r.id),
          full_name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
          email: r.email ? String(r.email) : null,
          website: r.company_website ? String(r.company_website) : null,
          company_name: r.company_name ? String(r.company_name) : null,
        }));
        const attendeeMatcher = buildAttendeeMatcher(existingAttendees);

        // Resolve each attendee row (deduplicated by name)
        const attendeeIdCache = new Map<string, number>(); // "first last" lowercase -> id
        type NewAttendee = { first_name: string; last_name: string; title?: string; company_id: number | null; email?: string; function?: string; product?: string };
        const newAttendees: NewAttendee[] = [];
        type ExistingAttendeeUpdate = { id: number; company_id: number | null; title: string | null; email: string | null; function?: string; product?: string };
        const existingAttendeeUpdates: ExistingAttendeeUpdate[] = [];
        const seen = new Set<string>();

        for (const p of valid) {
          const fname = (p.first_name ?? '').trim();
          const lname = (p.last_name ?? '').trim();
          const key = `${fname} ${lname}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          const confirmFn = (candidate: AtRow) =>
            confirmAttendeeMatch(candidate, p.email?.trim(), p.website?.trim(), p.company?.trim());
          const hit = matchAttendee(fname, lname, existingAttendees, attendeeMatcher, confirmFn);
          if (hit) {
            attendeeIdCache.set(key, hit.match.id);
            // Update the existing attendee's company, title, email, function and product from the CSV
            const companyId = p.company?.trim()
              ? (companyIdCache.get(p.company.trim()) ?? null)
              : null;
            const functionVal = p.function?.trim() || undefined;
            const productVal = p.product?.trim() || undefined;
            existingAttendeeUpdates.push({
              id: hit.match.id,
              company_id: companyId && companyId > 0 ? companyId : null,
              title: p.title?.trim() || null,
              email: p.email?.trim() || null,
              function: functionVal,
              product: productVal,
            });
          } else {
            // Mark for insertion
            attendeeIdCache.set(key, -1);
            const companyId = p.company?.trim()
              ? (companyIdCache.get(p.company.trim()) ?? null)
              : null;
            const functionVal = p.function?.trim() || undefined;
            const productVal = p.product?.trim() || undefined;
            newAttendees.push({
              first_name: fname,
              last_name: lname,
              title: p.title?.trim() || undefined,
              company_id: companyId && companyId > 0 ? companyId : null,
              email: p.email?.trim() || undefined,
              function: functionVal,
              product: productVal,
            });
          }
        }

        // ── Step 4b: Batch-update existing matched attendees with CSV fields ──
        if (existingAttendeeUpdates.length > 0) {
          await batchInsert(existingAttendeeUpdates, (u) => ({
            sql: `UPDATE attendees SET
              company_id = COALESCE(?, company_id),
              title = COALESCE(?, title),
              email = COALESCE(?, email)
              ${u.function !== undefined ? ', "function" = ?' : ''}
              ${u.product !== undefined ? ', products = CASE WHEN (products IS NULL OR products = \'\') THEN ? ELSE products END' : ''}
              WHERE id = ?`,
            args: [
              u.company_id, u.title, u.email,
              ...(u.function !== undefined ? [u.function] : []),
              ...(u.product !== undefined ? [u.product] : []),
              u.id,
            ],
          }));
        }

        // ── Step 5: Batch-insert new attendees ──
        if (newAttendees.length > 0) {
          const results = await batchInsert(newAttendees, (a) => ({
            sql: 'INSERT INTO attendees (first_name, last_name, title, company_id, email, "function", products) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
            args: [a.first_name, a.last_name, a.title ?? null, a.company_id, a.email ?? null, a.function ?? null, a.product ?? null],
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
