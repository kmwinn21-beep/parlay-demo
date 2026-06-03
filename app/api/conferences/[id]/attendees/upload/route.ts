import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getConfigOptionValues } from '@/lib/db';
import { getDb } from '@/lib/getDb';
import type { Client } from '@libsql/client';
import { parseFile, parseFileWithMapping, classifyCompanyType, classifySeniority, classifyFunction, matchConfigOption, type ColumnMapping } from '@/lib/parsers';
import { getIcpConfig, evaluateIcpRules } from '@/lib/icpRules';
import { computeAttendeeProductSignals } from '@/lib/computeAttendeeProductSignals';
import {
  buildCompanyMatcher,
  buildAttendeeMatcher,
  matchCompany,
  matchAttendee,
  confirmAttendeeMatch,
} from '@/lib/matching';

function normalizeConsentValue(raw: string | undefined | null): string {
  if (!raw) return 'Consent Not Recorded';
  const val = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,'\-&()/]/g, '');
  const optedIn = new Set(['opt in', 'opted in', 'optin', 'optedin', 'yes', 'y', 'true', '1', 'allow', 'allowed', 'agree', 'agreed', 'subscribed', 'subscribe']);
  const optedOut = new Set(['opt out', 'opted out', 'optout', 'optedout', 'no', 'n', 'false', '0', 'do not contact', 'dnc', 'stop', 'unsubscribe', 'unsubscribed', 'remove', 'donotcontact', 'donotmail', 'do not mail', 'donotcall', 'do not call']);
  if (optedIn.has(val)) return 'Opted-In';
  if (optedOut.has(val)) return 'Opted-Out';
  return 'Consent Not Recorded';
}

async function batchInsert<T>(
  dbClient: Client,
  items: T[],
  toStatement: (item: T) => { sql: string; args: (string | number | null)[] },
  chunkSize = 100
): Promise<Array<{ rows: Record<string, unknown>[] }>> {
  const allResults: Array<{ rows: Record<string, unknown>[] }> = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const stmts = chunk.map(toStatement);
    const results = await dbClient.batch(stmts, 'write');
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
  const db = await getDb(authResult?.accountId);
  const currentUser = authResult;

  try {

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
    const [companyTypeOptions, servicesOptions, icpOptions, icpConfig, userRows, usersWithConfig, functionOptions, productOptions, settingsRows] = await Promise.all([
      getConfigOptionValues('company_type', db),
      getConfigOptionValues('services', db),
      getConfigOptionValues('icp', db),
      getIcpConfig(db),
      db.execute({ sql: 'SELECT id, value FROM config_options WHERE category = ? ORDER BY sort_order, value', args: ['user'] }),
      db.execute({ sql: 'SELECT config_id, display_name, email FROM users WHERE config_id IS NOT NULL', args: [] }),
      getConfigOptionValues('function', db),
      getConfigOptionValues('products', db),
      db.execute({ sql: "SELECT key, value FROM site_settings WHERE key IN ('icp_seniority_priority', 'icp_function_product_mapping')", args: [] }),
    ]);

    const settingsMap: Record<string, string> = {};
    for (const r of settingsRows.rows) settingsMap[String(r.key)] = String(r.value);
    const seniorityPriority: Record<string, string> = (() => { try { return JSON.parse(settingsMap['icp_seniority_priority'] ?? '{}'); } catch { return {}; } })();
    const functionProductMapping: Record<string, string[]> = (() => { try { return JSON.parse(settingsMap['icp_function_product_mapping'] ?? '{}'); } catch { return {}; } })();

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

    const normalizeOwnerName = (value: string): string =>
      value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[,.'’`-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const normalizeNameKey = (value: string): string => {
      const tokens = normalizeOwnerName(value).split(' ').filter(Boolean);
      if (tokens.length === 0) return '';
      if (tokens.length === 1) return tokens[0];
      return `${tokens[0]} ${tokens[tokens.length - 1]}`;
    };
    const normalizeReversedNameKey = (value: string): string => {
      const v = value.trim();
      if (!v.includes(',')) return '';
      const parts = v.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) return '';
      const rejoined = `${parts.slice(1).join(' ')} ${parts[0]}`;
      return normalizeNameKey(rejoined);
    };
    const splitOwnerTokens = (raw: string): string[] => (
      raw
        .split(/\s*(?:;|\||\/|&|\band\b)\s*/i)
        .map(s => s.trim())
        .filter(Boolean)
    );
    const userNameIndex = new Map<string, Set<number>>();
    for (const r of usersWithConfig.rows) {
      const id = Number(r.config_id);
      const display = String(r.display_name ?? '').trim();
      if (!id || !display) continue;
      const keys = [normalizeNameKey(display)];
      for (const key of keys.filter(Boolean)) {
        const set = userNameIndex.get(key) ?? new Set<number>();
        set.add(id);
        userNameIndex.set(key, set);
      }
    }
    const unmatchedAssignedUsers = new Set<string>();
    const ambiguousAssignedUsers = new Set<string>();
    // Resolve file values to stored user ID strings (comma-separated for multi-owner cells).
    const resolveUserId = (raw: string | undefined): string | null => {
      if (!raw?.trim()) return null;
      const ids = new Set<number>();
      const parts = splitOwnerTokens(raw);
      for (const part of parts) {
        // Already a numeric ID that exists in the user list → keep as-is
        const num = parseInt(part, 10);
        if (!isNaN(num) && userOptions.some(u => u.id === num)) {
          ids.add(num);
          continue;
        }
        const lower = part.toLowerCase();
        // Match config_options.value (usually email), then users.display_name/users.email
        const match = userOptions.find(u => u.value.toLowerCase() === lower);
        if (match) { ids.add(match.id); continue; }
        const displayId = userDisplayNameMap.get(lower);
        if (displayId != null) { ids.add(displayId); continue; }
        // Name-first matching for customer uploads (First Last / Last, First)
        const directKey = normalizeNameKey(part);
        const reversedKey = normalizeReversedNameKey(part);
        const directMatches = directKey ? userNameIndex.get(directKey) : null;
        const reversedMatches = reversedKey ? userNameIndex.get(reversedKey) : null;
        const merged = new Set<number>([
          ...(directMatches ? Array.from(directMatches) : []),
          ...(reversedMatches ? Array.from(reversedMatches) : []),
        ]);
        if (merged.size === 1) {
          ids.add(Array.from(merged)[0]);
        } else if (merged.size > 1) {
          ambiguousAssignedUsers.add(part);
        } else {
          unmatchedAssignedUsers.add(part);
        }
      }
      if (ids.size === 0) return null;
      return Array.from(ids).join(',');
    };
    const mappingJson = formData.get('mapping') as string | null;
    const mapping: ColumnMapping | null = mappingJson ? JSON.parse(mappingJson) as ColumnMapping : null;

    // Optional conflict resolutions from the ConflictResolutionModal
    const resolutionsJson = formData.get('conflict_resolutions') as string | null;
    const resolutions: Record<string, 'accept' | 'ignore'> = resolutionsJson ? JSON.parse(resolutionsJson) : {};
    const hasResolutions = resolutionsJson != null;

    const coRes = (coId: number, field: string) => resolutions[`company_${coId}_${field}`] ?? null;
    const atRes = (atId: number, field: string) => resolutions[`attendee_${atId}_${field}`] ?? null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = mapping
      ? await parseFileWithMapping(buffer, file.name, mapping)
      : await parseFile(buffer, file.name);
    const valid = parsed.filter((p) => p.first_name?.trim() || p.last_name?.trim());

    // Resolve all config-driven fields using fuzzy matching against their canonical option values.
    // matchConfigOption tries exact → abbreviation-expanded exact → word-prefix → Levenshtein.
    // Returns the canonical display name or null (field is left empty when no match is found).

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
          const matched = p.services.split(/[;,:\\/|]+|\s+-\s+/).map(s => s.trim()).filter(Boolean)
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
      db.execute({
        sql: `SELECT a.id, a.first_name, a.last_name, a.email,
                     c.name AS company_name, c.website AS company_website
              FROM attendees a
              LEFT JOIN companies c ON a.company_id = c.id`,
        args: [],
      }),
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
    type CompanyEntry = {
      name: string;
      email?: string;
      website?: string;
      company_type?: string;
      assigned_user?: string;
      assigned_user_supplied?: boolean;
      has_unresolved_assigned_user?: boolean;
      wse?: number;
      services?: string;
      icp?: string;
      industry?: string;
    };
    const companyEntries = new Map<string, CompanyEntry>();
    for (const p of valid) {
      if (p.company?.trim()) {
        const coName = p.company.trim();
        if (!companyEntries.has(coName)) {
          const rawAssigned = p.assigned_user?.trim();
          const resolvedAssigned = resolveUserId(rawAssigned);
          companyEntries.set(coName, {
            name: coName,
            email: p.email?.trim(),
            website: p.website?.trim(),
            company_type: p.company_type?.trim(),
            assigned_user: resolvedAssigned ?? undefined,
            assigned_user_supplied: Boolean(rawAssigned),
            has_unresolved_assigned_user: Boolean(rawAssigned) && !resolvedAssigned,
            wse: p.wse?.trim() ? parseInt(p.wse.trim(), 10) || undefined : undefined,
            services: p.services?.trim() || undefined,
            icp: p.icp?.trim() || undefined,
            industry: p.industry?.trim() || undefined,
          });
        } else {
          // If we don't have an email/website/company_type/assigned_user/services yet for this company, pick it up
          const existing = companyEntries.get(coName)!;
          if (!existing.email && p.email?.trim()) existing.email = p.email.trim();
          if (!existing.website && p.website?.trim()) existing.website = p.website.trim();
          if (!existing.company_type && p.company_type?.trim()) existing.company_type = p.company_type.trim();
          if (!existing.assigned_user) {
            const rawAssigned = p.assigned_user?.trim();
            const uid = resolveUserId(rawAssigned);
            if (uid) existing.assigned_user = uid;
            if (rawAssigned) {
              existing.assigned_user_supplied = true;
              if (!uid) existing.has_unresolved_assigned_user = true;
            }
          }
          if (!existing.icp && p.icp?.trim()) existing.icp = p.icp.trim();
          if (!existing.industry && p.industry?.trim()) existing.industry = p.industry.trim();
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
      await batchInsert(db, Array.from(parentWseUpdates.entries()), ([parentId, wseVal]) => ({
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
      const updateStmts: { sql: string; args: (string | number | null)[] }[] = [];
      for (const [n, entry] of existingToUpdate) {
        const coId = companyIdCache.get(n)!;
        const existingCompany = existingCompanies.find((c) => c.id === coId);
        const setClauses: string[] = [];
        const setArgs: (string | number | null)[] = [];

        // Helper: add a field to the update, honoring conflict resolutions
        const addCoField = (sqlField: string, logField: string, value: string | number | null) => {
          if (value == null || value === '') return;
          const r = coRes(coId, logField);
          if (r === 'ignore') return;
          if (r === 'accept') {
            setClauses.push(`${sqlField} = ?`);
          } else {
            setClauses.push(`${sqlField} = COALESCE(?, ${sqlField})`);
          }
          setArgs.push(value);
        };

        addCoField('company_type', 'company_type', entry.company_type || null);
        addCoField('website', 'website', entry.website || null);
        addCoField('wse', 'wse', entry.wse ?? null);
        addCoField('industry', 'industry', entry.industry || null);

        // assigned_user: preserve if already has valid user (no conflict resolution for this field)
        const existingValidUserIds = existingCompany?.assigned_user
          ? existingCompany.assigned_user.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0)
          : [];
        if (entry.assigned_user) {
          const assignedUserArg = existingValidUserIds.length >= 1 ? null : entry.assigned_user;
          if (assignedUserArg) {
            setClauses.push('assigned_user = COALESCE(?, assigned_user)');
            setArgs.push(assignedUserArg);
          }
        } else if (entry.assigned_user_supplied && entry.has_unresolved_assigned_user) {
          // Uploaded owner value could not be resolved: clear invalid/non-ID stored values
          // so tables behave as blank and users can manually reassign via inline edit.
          const existingIsInvalid = existingCompany?.assigned_user
            ? existingCompany.assigned_user.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0).length === 0
            : false;
          if (!existingCompany?.assigned_user || existingIsInvalid) {
            setClauses.push('assigned_user = NULL');
          }
        }

        // services: always merge (additive, no conflict)
        if (entry.services) {
          setClauses.push('services = COALESCE(?, services)');
          setArgs.push(entry.services);
        }

        if (setClauses.length === 0) continue;
        updateStmts.push({
          sql: `UPDATE companies SET ${setClauses.join(', ')} WHERE id = ?`,
          args: [...setArgs, coId],
        });
      }
      for (let i = 0; i < updateStmts.length; i += 100) {
        await db.batch(updateStmts.slice(i, i + 100), 'write');
      }
    }

    // Batch-insert new companies (with auto-detected company type, website, assigned_user, wse, and services)
    const newCoNames = Array.from(companyEntries.keys()).filter((n) => companyIdCache.get(n) === -1);
    if (newCoNames.length > 0) {
      const results = await batchInsert(db, newCoNames, (n) => {
        const entry = companyEntries.get(n)!;
        const detectedType = entry.company_type || classifyCompanyType(n, companyTypeOptions);
        const website = entry.website || null;
        const assignedUser = entry.assigned_user || null;
        const wse = entry.wse ?? null;
        const services = entry.services || null;
        const industry = entry.industry || null;
        return {
          sql: 'INSERT INTO companies (name, company_type, website, assigned_user, wse, services, industry) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
          args: [n, detectedType || null, website, assignedUser, wse, services, industry],
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
        sql: `SELECT id, company_type, wse, services, profit_type, entity_structure FROM companies WHERE id IN (${placeholders})`,
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
          icp = evaluateIcpRules(
            {
              company_type: row.company_type ? String(row.company_type) : null,
              services: row.services ? String(row.services) : null,
              wse: row.wse ? String(row.wse) : null,
              profit_type: row.profit_type ? String(row.profit_type) : null,
              entity_structure: row.entity_structure ? String(row.entity_structure) : null,
            },
            icpConfig,
            icpOptions,
          );
        }
        icpUpdates.push({ id: companyId, icp });
      }
      if (icpUpdates.length > 0) {
        await batchInsert(db, icpUpdates, (u) => ({
          sql: 'UPDATE companies SET icp = ? WHERE id = ?',
          args: [u.icp, u.id],
        }));
      }
    }

    // ── Competitor classification ──────────────────────────────────────────────
    // Runs after company creation/ICP, before attendee processing. Does not
    // alter any other classification step. Only classifies companies whose
    // type is currently null or unset — does not overwrite existing non-Competitor types.
    let competitorAutoCount = 0;
    let competitorFuzzyCount = 0;
    let competitorSkippedCount = 0;

    const normalizeCompanyNameCC = (name: string): string => {
      const SUFFIXES = /\b(llc|inc|corp|ltd|co|pllc|lp|llp|pa|pc|dba)\b\.?/gi;
      return name.toLowerCase().replace(/[.,&\-'()]/g, ' ').replace(SUFFIXES, '').replace(/\s+/g, ' ').trim();
    };

    const normalizeDomainCC = (raw: string): string => {
      let d = raw.trim().toLowerCase();
      d = d.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
      d = d.replace(/[/?#].*$/, '');
      const parts = d.split('.');
      if (parts.length > 2) d = parts.slice(-2).join('.');
      return d;
    };

    const levenshteinSimilarity = (a: string, b: string): number => {
      const la = a.length, lb = b.length;
      if (la === 0 && lb === 0) return 1;
      if (la === 0 || lb === 0) return 0;
      const dp: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
      for (let i = 1; i <= la; i++) {
        let prev = dp[0]; dp[0] = i;
        for (let j = 1; j <= lb; j++) {
          const tmp = dp[j];
          dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(dp[j], dp[j - 1], prev);
          prev = tmp;
        }
      }
      return 1 - dp[lb] / Math.max(la, lb);
    };

    try {
      type CompetitorRow = { id: number; company_name: string; website: string; competitor_type: string };
      const competitorRows = await db.execute({
        sql: 'SELECT id, company_name, website, competitor_type FROM competitor_settings ORDER BY id',
        args: [],
      }).then(r => r.rows as unknown as CompetitorRow[]).catch(() => [] as CompetitorRow[]);

      if (competitorRows.length > 0) {
        // Pre-normalize competitor list
        const normalizedCompetitors = competitorRows.map(c => ({
          ...c,
          normName: normalizeCompanyNameCC(c.company_name),
          normDomain: normalizeDomainCC(c.website),
        }));

        // Build set of all company IDs processed in this upload
        const processedCompanyIds = new Set<number>();
        for (const id of Array.from(companyIdCache.values())) {
          if (id > 0) processedCompanyIds.add(id);
        }

        if (processedCompanyIds.size > 0) {
          // Fetch current company data (name, website, company_type) for all affected companies
          const idList = Array.from(processedCompanyIds);
          const placeholders = idList.map(() => '?').join(',');
          type CompanyRow = { id: number; name: string; website: string | null; company_type: string | null };
          const compRows = await db.execute({
            sql: `SELECT id, name, website, company_type FROM companies WHERE id IN (${placeholders})`,
            args: idList,
          }).then(r => r.rows as unknown as CompanyRow[]);

          for (const comp of compRows) {
            const normName = normalizeCompanyNameCC(comp.name);
            const normDomain = comp.website ? normalizeDomainCC(comp.website) : null;

            let matchedCompetitor: typeof normalizedCompetitors[0] | undefined;
            let matchType: 'exact-name' | 'exact-domain' | 'fuzzy' | null = null;

            // Domain match (highest confidence — auto-classify)
            if (normDomain) {
              const domainMatch = normalizedCompetitors.find(c => c.normDomain === normDomain);
              if (domainMatch) { matchedCompetitor = domainMatch; matchType = 'exact-domain'; }
            }

            // Exact name match (auto-classify)
            if (!matchedCompetitor) {
              const nameMatch = normalizedCompetitors.find(c => c.normName === normName);
              if (nameMatch) { matchedCompetitor = nameMatch; matchType = 'exact-name'; }
            }

            // Fuzzy name match (flag for review, no auto-classify)
            if (!matchedCompetitor) {
              for (const c of normalizedCompetitors) {
                if (levenshteinSimilarity(normName, c.normName) >= 0.85) {
                  matchType = 'fuzzy';
                  competitorFuzzyCount++;
                  break;
                }
              }
            }

            if (matchedCompetitor && (matchType === 'exact-name' || matchType === 'exact-domain')) {
              if (comp.company_type && comp.company_type !== 'Competitor') {
                // Conflict — existing non-Competitor type, skip
                competitorSkippedCount++;
              } else {
                await db.execute({
                  sql: `UPDATE companies SET company_type = 'Competitor', competitor_type = ? WHERE id = ?`,
                  args: [matchedCompetitor.competitor_type, comp.id],
                });
                competitorAutoCount++;
              }
            }
          }
        }
      }
    } catch { /* competitor classification is best-effort */ }

    // Attendees stay with their own company — child contacts are NOT redirected to the parent
    const resolveCompanyId = (coName: string): number | null => {
      const coId = companyIdCache.get(coName);
      if (!coId || coId <= 0) return null;
      return coId;
    };

    // Build attendee lookup (exact name match + secondary confirmation)
    type AtRow = { id: number; full_name: string; email: string | null; website: string | null; company_name: string | null };
    const existingAttendees: AtRow[] = existingAtRes.rows.map((r) => ({
      id: Number(r.id),
      full_name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      email: r.email ? String(r.email) : null,
      website: r.company_website ? String(r.company_website) : null,
      company_name: r.company_name ? String(r.company_name) : null,
    }));
    const attendeeMatcher = buildAttendeeMatcher(existingAttendees);

    // Compute which products should be auto-assigned based on seniority priority + function→product mapping
    const computeAutoProducts = (seniority: string | undefined, title: string | undefined, functionVal: string | undefined): string | null => {
      const effectiveSen = seniority || (title ? classifySeniority(title) : null);
      if (!effectiveSen) return null;
      const priority = seniorityPriority[effectiveSen];
      if (priority !== 'High' && priority !== 'Medium') return null;
      if (!functionVal) return null;
      const functions = functionVal.split(',').map(s => s.trim()).filter(Boolean);
      const products = new Set<string>();
      for (const fn of functions) {
        const mapped = functionProductMapping[fn] ?? [];
        for (const p of mapped) products.add(p);
      }
      return products.size > 0 ? Array.from(products).join(',') : null;
    };

    const attendeeIdCache = new Map<string, number>();
    type NewAttendee = { first_name: string; last_name: string; title?: string; company_id: number | null; email?: string; function?: string; product?: string; consent?: string; seniority?: string };
    const newAttendees: NewAttendee[] = [];
    type ExistingAttendeeUpdate = { id: number; company_id: number | null; title: string | null; email: string | null; function?: string; product?: string; consent?: string };
    const existingAttendeeUpdates: ExistingAttendeeUpdate[] = [];
    const seen = new Set<string>();

    for (const p of newEntries) {
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
        // Update the existing attendee's company, title, and email from the CSV
        const companyId = p.company?.trim()
          ? resolveCompanyId(p.company.trim())
          : null;
        const functionVal = p.function?.trim() || classifyFunction(p.title?.trim(), functionOptions) || undefined;
        const rawProduct = p.product?.trim() || undefined;
        const autoProduct = !rawProduct ? computeAutoProducts(undefined, p.title?.trim(), functionVal) : null;
        const consentVal = p.consent?.trim() ? normalizeConsentValue(p.consent.trim()) : undefined;
        existingAttendeeUpdates.push({
          id: hit.match.id,
          company_id: companyId && companyId > 0 ? companyId : null,
          title: p.title?.trim() || null,
          email: p.email?.trim() || null,
          function: functionVal,
          product: rawProduct ?? autoProduct ?? undefined,
          consent: consentVal,
        });
      } else {
        attendeeIdCache.set(key, -1);
        const companyId = p.company?.trim()
          ? resolveCompanyId(p.company.trim())
          : null;
        const functionVal = p.function?.trim() || classifyFunction(p.title?.trim(), functionOptions) || undefined;
        const rawProduct = p.product?.trim() || undefined;
        const autoProduct = !rawProduct ? computeAutoProducts(undefined, p.title?.trim(), functionVal) : null;
        const consentVal = p.consent?.trim() ? normalizeConsentValue(p.consent.trim()) : undefined;
        newAttendees.push({
          first_name: fname,
          last_name: lname,
          title: p.title?.trim() || undefined,
          company_id: companyId && companyId > 0 ? companyId : null,
          email: p.email?.trim() || undefined,
          function: functionVal,
          product: rawProduct ?? autoProduct ?? undefined,
          consent: consentVal,
          seniority: classifySeniority(p.title?.trim()),
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
        const functionVal = p.function?.trim() || classifyFunction(p.title?.trim(), functionOptions) || undefined;
        const rawProduct = p.product?.trim() || undefined;
        const autoProduct = !rawProduct ? computeAutoProducts(undefined, p.title?.trim(), functionVal) : null;
        const consentVal = p.consent?.trim() ? normalizeConsentValue(p.consent.trim()) : undefined;
        existingAttendeeUpdates.push({
          id: existingId,
          company_id: companyId && companyId > 0 ? companyId : null,
          title: p.title?.trim() || null,
          email: p.email?.trim() || null,
          function: functionVal,
          product: rawProduct ?? autoProduct ?? undefined,
          consent: consentVal,
        });
      }
    }

    // Batch-update existing matched attendees with CSV company/title/email/function/product
    if (existingAttendeeUpdates.length > 0) {
      const atUpdateStmts: { sql: string; args: (string | number | null)[] }[] = [];
      for (const u of existingAttendeeUpdates) {
        const setClauses: string[] = [];
        const setArgs: (string | number | null)[] = [];

        // company_id: always COALESCE (no conflict resolution)
        if (u.company_id != null) {
          setClauses.push('company_id = COALESCE(?, company_id)');
          setArgs.push(u.company_id);
        }

        // title
        const titleR = atRes(u.id, 'title');
        if (titleR === 'ignore') { /* skip */ }
        else if (titleR === 'accept' && u.title) { setClauses.push('title = ?'); setArgs.push(u.title); }
        else if (u.title) { setClauses.push('title = COALESCE(?, title)'); setArgs.push(u.title); }

        // email
        const emailR = atRes(u.id, 'email');
        if (emailR === 'ignore') { /* skip */ }
        else if (emailR === 'accept' && u.email) { setClauses.push('email = ?'); setArgs.push(u.email); }
        else if (u.email) { setClauses.push('email = COALESCE(?, email)'); setArgs.push(u.email); }

        // function
        if (u.function !== undefined) {
          const fnR = atRes(u.id, 'function');
          if (fnR === 'ignore') { /* skip */ }
          else if (fnR === 'accept') { setClauses.push('"function" = ?'); setArgs.push(u.function); }
          else if (hasResolutions) {
            // Conservative when conflict detection ran: COALESCE preserves existing non-null values
            setClauses.push('"function" = COALESCE(?, "function")'); setArgs.push(u.function);
          } else {
            // Legacy behavior (no conflict step): direct assign
            setClauses.push('"function" = ?'); setArgs.push(u.function);
          }
        }

        // product: always CASE WHEN (no conflict resolution)
        if (u.product !== undefined) {
          setClauses.push('products = CASE WHEN (products IS NULL OR products = \'\') THEN ? ELSE products END');
          setArgs.push(u.product);
        }

        // consent: only update if file provided a mappable value
        if (u.consent !== undefined) {
          setClauses.push('consent = ?');
          setArgs.push(u.consent);
        }

        if (setClauses.length === 0) continue;
        setArgs.push(u.id);
        atUpdateStmts.push({
          sql: `UPDATE attendees SET ${setClauses.join(', ')} WHERE id = ?`,
          args: setArgs,
        });
      }
      for (let i = 0; i < atUpdateStmts.length; i += 100) {
        await db.batch(atUpdateStmts.slice(i, i + 100), 'write');
      }
    }

    // Batch-insert new attendees
    if (newAttendees.length > 0) {
      const results = await batchInsert(db, newAttendees, (a) => ({
        sql: 'INSERT INTO attendees (first_name, last_name, title, company_id, email, "function", products, consent, seniority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        args: [a.first_name, a.last_name, a.title ?? null, a.company_id, a.email ?? null, a.function ?? null, a.product ?? null, a.consent ?? 'Consent Not Recorded', a.seniority ?? null],
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
    await batchInsert(db, attendeeIdsToLink, (aid) => ({
      sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
      args: [conferenceId, aid],
    }));
    await db.execute({ sql: "UPDATE conferences SET calendar_score_invalidated_at = datetime('now') WHERE id = ?", args: [conferenceId] }).catch(() => {});

    // Propagate attendee products to their associated companies (merge, don't overwrite)
    const companyProductUpdates = new Map<number, Set<string>>();
    const allProcessed = [...newAttendees, ...existingAttendeeUpdates];
    for (const a of allProcessed) {
      if (!a.product) continue;
      const coId = a.company_id;
      if (!coId || coId <= 0) continue;
      const set = companyProductUpdates.get(coId) ?? new Set<string>();
      a.product.split(',').filter(Boolean).forEach(p => set.add(p.trim()));
      companyProductUpdates.set(coId, set);
    }
    if (companyProductUpdates.size > 0) {
      for (const [coId, newProds] of Array.from(companyProductUpdates.entries())) {
        const company = existingCompanies.find(c => c.id === coId);
        const existing = (company as { products?: string | null })?.products
          ? String((company as { products?: string | null }).products).split(',').map(s => s.trim()).filter(Boolean)
          : [];
        const merged = new Set([...existing, ...Array.from(newProds)]);
        await db.execute({ sql: 'UPDATE companies SET products = ? WHERE id = ?', args: [Array.from(merged).join(','), coId] });
      }
    }

    const skippedCount = valid.length - newEntries.length;
    const updatedCount = existingAttendeeUpdates.length;

    // Auto-compute product ICP signals after upload (best-effort, non-blocking)
    computeAttendeeProductSignals(db, conferenceId).catch((e) =>
      console.error('computeAttendeeProductSignals after upload error:', e),
    );

    return NextResponse.json({
      success: true,
      total_in_file: valid.length,
      new_count: attendeeIdsToLink.length,
      updated_count: updatedCount,
      skipped_count: skippedCount - updatedCount,
      assigned_user_match_report: {
        unmatched_count: unmatchedAssignedUsers.size,
        ambiguous_count: ambiguousAssignedUsers.size,
        unmatched_values: Array.from(unmatchedAssignedUsers).slice(0, 25),
        ambiguous_values: Array.from(ambiguousAssignedUsers).slice(0, 25),
      },
      competitor_classification: {
        auto_classified: competitorAutoCount,
        probable_matches: competitorFuzzyCount,
        skipped_type_conflict: competitorSkippedCount,
      },
    });
  } catch (error) {
    console.error('POST /api/conferences/[id]/attendees/upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload attendees' },
      { status: 500 }
    );
  }
}
