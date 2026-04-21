import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady, getConfigOptionValues } from '@/lib/db';
import { parseFile, parseFileWithMapping, classifyCompanyType, parseServicesValue, classifyICP, type ColumnMapping } from '@/lib/parsers';
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
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const currentUser = authResult;

  try {
    await dbReady;

    // Check permission: non-admins can only upload if site_settings allows it
    if (currentUser.role !== 'administrator') {
      const settingRow = await db.execute({
        sql: "SELECT value FROM site_settings WHERE key = 'allow_attendee_upload'",
        args: [],
      });
      const allowed = settingRow.rows.length === 0 || String(settingRow.rows[0].value) !== 'false';
      if (!allowed) {
        return NextResponse.json(
          { error: 'Attendee list upload is restricted to administrators.' },
          { status: 403 }
        );
      }
    }

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

    // Fetch live admin config options for classifiers
    const [companyTypeOptions, icpOptions, userRows, usersWithConfig] = await Promise.all([
      getConfigOptionValues('company_type'),
      getConfigOptionValues('icp'),
      db.execute({ sql: 'SELECT id, value FROM config_options WHERE category = ? ORDER BY sort_order, value', args: ['user'] }),
      db.execute({ sql: 'SELECT config_id, display_name, email FROM users WHERE config_id IS NOT NULL', args: [] }),
    ]);
    const userOptions: Array<{ id: number; value: string }> = userRows.rows.map(r => ({
      id: Number(r.id),
      value: String(r.value),
    }));

    // Build a map from lowercase display name (or email) → config_options.id so that
    // CSV files with human-readable names resolve correctly even though config_options.value
    // stores the user's email address.
    const userDisplayNameMap = new Map<string, number>();
    for (const r of usersWithConfig.rows) {
      const configId = Number(r.config_id);
      if (r.display_name && String(r.display_name).trim()) {
        userDisplayNameMap.set(String(r.display_name).trim().toLowerCase(), configId);
      }
      if (r.email && String(r.email).trim()) {
        userDisplayNameMap.set(String(r.email).trim().toLowerCase(), configId);
      }
    }

    // Resolve a name/ID string from the file to the stored numeric ID string.
    // Returns null if the value is blank or doesn't match any known user.
    const resolveUserId = (raw: string | undefined): string | null => {
      if (!raw?.trim()) return null;
      const trimmed = raw.trim();
      // Already a numeric ID that exists in the user list → keep as-is
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && userOptions.some(u => u.id === num)) return String(num);
      const lower = trimmed.toLowerCase();
      // Case-insensitive match against config_options.value (stores email addresses)
      const match = userOptions.find(u => u.value.toLowerCase() === lower);
      if (match) return String(match.id);
      // Fall back to matching against users.display_name or users.email
      const displayId = userDisplayNameMap.get(lower);
      if (displayId != null) return String(displayId);
      return null;
    };
    // Identify which company_type values represent "Operator" for ICP classification
    const operatorTypeValues = new Set(
      companyTypeOptions.filter((v) => v.toLowerCase().includes('operator') || v.toLowerCase() === 'opco' || v.toLowerCase() === 'own/op')
    );
    if (operatorTypeValues.size === 0) operatorTypeValues.add('Operator'); // safe fallback

    const mappingJson = formData.get('mapping') as string | null;
    const mapping: ColumnMapping | null = mappingJson ? JSON.parse(mappingJson) as ColumnMapping : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = mapping
      ? await parseFileWithMapping(buffer, file.name, mapping)
      : await parseFile(buffer, file.name);
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
      db.execute({ sql: 'SELECT id, name, website, parent_company_id, company_type, wse, services, assigned_user FROM companies', args: [] }),
      db.execute({ sql: 'SELECT id, first_name, last_name FROM attendees', args: [] }),
    ]);

    // Build company lookup (exact + normalised + domain + fuzzy)
    type CoRow = { id: number; name: string; website?: string | null; parent_company_id?: number | null; company_type?: string | null; wse?: number | null; services?: string | null; assigned_user?: string | null };
    const existingCompanies: CoRow[] = existingCoRes.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      website: r.website ? String(r.website) : null,
      parent_company_id: r.parent_company_id ? Number(r.parent_company_id) : null,
      company_type: r.company_type ? String(r.company_type) : null,
      wse: r.wse ? Number(r.wse) : null,
      services: r.services ? String(r.services) : null,
      assigned_user: r.assigned_user ? String(r.assigned_user) : null,
    }));
    const companyMatcher = buildCompanyMatcher(existingCompanies);

    // Collect unique company names with associated email/website/company_type/assigned_user for domain matching
    const companyIdCache = new Map<string, number>();
    type CompanyEntry = { name: string; email?: string; website?: string; company_type?: string; assigned_user?: string; wse?: number; services?: string; icp?: string };
    const companyEntries = new Map<string, CompanyEntry>();
    for (const p of valid) {
      if (p.company?.trim()) {
        const coName = p.company.trim();
        if (!companyEntries.has(coName)) {
          companyEntries.set(coName, { name: coName, email: p.email?.trim(), website: p.website?.trim(), company_type: p.company_type?.trim(), assigned_user: resolveUserId(p.assigned_user) ?? undefined, wse: p.wse?.trim() ? parseInt(p.wse.trim(), 10) || undefined : undefined, services: p.services?.trim() || undefined, icp: p.icp?.trim() || undefined });
        } else {
          // If we don't have an email/website/company_type/assigned_user/services yet for this company, pick it up
          const existing = companyEntries.get(coName)!;
          if (!existing.email && p.email?.trim()) existing.email = p.email.trim();
          if (!existing.website && p.website?.trim()) existing.website = p.website.trim();
          if (!existing.company_type && p.company_type?.trim()) existing.company_type = p.company_type.trim();
          if (!existing.assigned_user) { const uid = resolveUserId(p.assigned_user); if (uid) existing.assigned_user = uid; }
          if (!existing.icp && p.icp?.trim()) existing.icp = p.icp.trim();
          if (!existing.wse && p.wse?.trim()) {
            const wseVal = parseInt(p.wse.trim(), 10);
            if (!isNaN(wseVal) && wseVal > 0) existing.wse = wseVal;
          }
          if (p.services?.trim()) {
            // Merge services from multiple rows for the same company
            const newServices = p.services.trim().split(',');
            const existingServices = existing.services ? existing.services.split(',') : [];
            const merged = new Set([...existingServices, ...newServices]);
            existing.services = Array.from(merged).filter(Boolean).join(',');
          }
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

    // Redirect WSE values from child companies to their parent companies
    const parentWseUpdates = new Map<number, number>(); // parent company id -> wse value
    const parentServicesUpdates = new Map<number, Set<string>>(); // parent company id -> services set
    for (const [coName, entry] of Array.from(companyEntries.entries())) {
      const coId = companyIdCache.get(coName);
      if (!coId || coId <= 0) continue;
      const company = existingCompanies.find((c) => c.id === coId);
      if (company?.parent_company_id) {
        // Child company: redirect WSE to parent, clear from child entry
        if (entry.wse) {
          if (!parentWseUpdates.has(company.parent_company_id)) {
            parentWseUpdates.set(company.parent_company_id, entry.wse);
          }
          entry.wse = undefined;
        }
        // Child company: redirect Services to parent, clear from child entry
        if (entry.services) {
          const serviceSet = parentServicesUpdates.get(company.parent_company_id) || new Set<string>();
          entry.services.split(',').filter(Boolean).forEach((s) => serviceSet.add(s));
          parentServicesUpdates.set(company.parent_company_id, serviceSet);
          entry.services = undefined;
        }
      }
    }

    // Apply redirected WSE values to parent companies
    if (parentWseUpdates.size > 0) {
      await batchInsert(Array.from(parentWseUpdates.entries()), ([parentId, wseVal]) => ({
        sql: 'UPDATE companies SET wse = COALESCE(?, wse) WHERE id = ?',
        args: [wseVal, parentId],
      }));
    }

    // Apply redirected Services values to parent companies (merge with existing)
    if (parentServicesUpdates.size > 0) {
      for (const [parentId, newServices] of Array.from(parentServicesUpdates.entries())) {
        const parent = existingCompanies.find((c) => c.id === parentId);
        const existingServices = parent?.services ? parent.services.split(',').map((s) => s.trim()).filter(Boolean) : [];
        const merged = new Set([...existingServices, ...Array.from(newServices)]);
        const mergedStr = Array.from(merged).join(',');
        await db.execute({ sql: 'UPDATE companies SET services = ? WHERE id = ?', args: [mergedStr, parentId] });
      }
    }

    // Update existing matched companies with CSV-provided fields
    const existingToUpdate = Array.from(companyEntries.entries()).filter(([n, entry]) => {
      const id = companyIdCache.get(n);
      return id !== undefined && id > 0 && (entry.company_type || entry.assigned_user || entry.website || entry.wse || entry.services);
    });
    if (existingToUpdate.length > 0) {
      await batchInsert(existingToUpdate, ([n, entry]) => {
        const coId = companyIdCache.get(n)!;
        const existingCompany = existingCompanies.find((c) => c.id === coId);
        // Count only valid numeric user IDs — raw name strings (legacy data) should not block the upload from fixing them
        const existingValidUserIds = existingCompany?.assigned_user
          ? existingCompany.assigned_user.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0)
          : [];
        // Preserve assigned_user if the company already has at least one valid assigned user; only set from upload if none exist
        const assignedUserArg = existingValidUserIds.length >= 1 ? null : (entry.assigned_user || null);
        return {
          sql: `UPDATE companies SET
            company_type = COALESCE(?, company_type),
            assigned_user = COALESCE(?, assigned_user),
            website = COALESCE(?, website),
            wse = COALESCE(?, wse),
            services = COALESCE(?, services)
            WHERE id = ?`,
          args: [entry.company_type || null, assignedUserArg, entry.website || null, entry.wse ?? null, entry.services || null, coId],
        };
      });
    }

    // Batch-insert new companies (with auto-detected company type, website, assigned_user, wse, and services)
    const newCoNames = Array.from(companyEntries.keys()).filter((n) => companyIdCache.get(n) === -1);
    if (newCoNames.length > 0) {
      const results = await batchInsert(newCoNames, (n) => {
        const entry = companyEntries.get(n)!;
        const detectedType = entry.company_type || classifyCompanyType(n, companyTypeOptions);
        const website = entry.website || null;
        const assignedUser = entry.assigned_user || null;
        const wse = entry.wse ?? null;
        const services = entry.services || null;
        return {
          sql: 'INSERT INTO companies (name, company_type, website, assigned_user, wse, services) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
          args: [n, detectedType || null, website, assignedUser, wse, services],
        };
      });
      for (let i = 0; i < newCoNames.length; i++) {
        const id = Number(results[i]?.rows[0]?.id ?? 0);
        if (id > 0) companyIdCache.set(newCoNames[i], id);
      }
    }

    // Compute ICP for all companies touched by this upload
    // If the uploaded file includes an ICP column, that value overrides the calculated ICP.
    // Otherwise, calculate ICP from company type + WSE + services rules. Default fallback is "No".
    // Build a map of company ID -> file-provided ICP value for override lookup
    const fileIcpByCompanyId = new Map<number, string>();
    for (const [coName, entry] of Array.from(companyEntries.entries())) {
      if (entry.icp) {
        const coId = companyIdCache.get(coName);
        if (coId && coId > 0) {
          fileIcpByCompanyId.set(coId, entry.icp);
        }
      }
    }

    // Re-fetch current state of all affected companies so ICP is calculated on final values
    const affectedCompanyIds = Array.from(new Set(
      Array.from(companyIdCache.values())
        .filter((id) => id > 0)
        .concat(Array.from(parentWseUpdates.keys()))
        .concat(Array.from(parentServicesUpdates.keys()))
    ));
    if (affectedCompanyIds.length > 0) {
      const placeholders = affectedCompanyIds.map(() => '?').join(',');
      const freshRows = await db.execute({
        sql: `SELECT id, company_type, wse, services FROM companies WHERE id IN (${placeholders})`,
        args: affectedCompanyIds,
      });
      const falseValue = icpOptions[1] ?? 'No';
      const icpUpdates: Array<{ id: number; icp: string }> = [];
      for (const row of freshRows.rows) {
        const companyId = Number(row.id);
        const fileIcp = fileIcpByCompanyId.get(companyId);
        let icp: string;
        if (fileIcp) {
          // File-provided ICP overrides the calculated value
          // Normalize common yes/no variants to the admin panel's configured values
          const normalized = fileIcp.toLowerCase();
          if (normalized === 'yes' || normalized === 'true' || normalized === 'y' || normalized === '1') {
            icp = icpOptions[0] ?? 'Yes';
          } else if (normalized === 'no' || normalized === 'false' || normalized === 'n' || normalized === '0') {
            icp = falseValue;
          } else {
            // Use the raw value if it doesn't match known patterns
            icp = fileIcp;
          }
        } else {
          // No file ICP — calculate from rules
          icp = classifyICP(
            row.wse ? Number(row.wse) : null,
            row.company_type ? String(row.company_type) : null,
            row.services ? String(row.services) : null,
            icpOptions,
            operatorTypeValues
          );
        }
        icpUpdates.push({ id: companyId, icp });
      }
      if (icpUpdates.length > 0) {
        await batchInsert(icpUpdates, (u) => ({
          sql: 'UPDATE companies SET icp = ? WHERE id = ?',
          args: [u.icp, u.id],
        }));
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
