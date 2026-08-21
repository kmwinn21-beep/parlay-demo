import { NextRequest, NextResponse } from 'next/server';
import { sweepConflictedPlaceholders } from '@/lib/placeholderAttendees';
import { requireAuth } from '@/lib/auth';
import { waitUntil } from '@vercel/functions';
import { sendNotificationEmail } from '@/lib/email';

export const maxDuration = 300;
import { getConfigOptionValues } from '@/lib/db';
import { getDb } from '@/lib/getDb';
import { createNotifications, getConfigIdByEmail } from '@/lib/notifications';
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
  deepNormalizeCompanyName,
  extractDomainFromWebsite,
} from '@/lib/matching';
import { normalizeNameKey, normalizeReversedNameKey, splitOwnerTokens } from '@/lib/normalize';

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
  chunkSize = 300
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
      sql: 'SELECT id, name FROM conferences WHERE id = ?',
      args: [conferenceId],
    });
    if (confResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }
    const conferenceName = String((confResult.rows[0] as Record<string, unknown>).name ?? `Conference ${conferenceId}`);

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
    // id → display name, for attributing a territory-fallback resolution
    // (which only yields a rep id, not a name) in the same shape as the
    // other resolution paths.
    const configIdToDisplayName = new Map<number, string>();
    for (const r of usersWithConfig.rows) {
      const id = Number(r.config_id);
      const display = String(r.display_name ?? '').trim();
      if (id && display) configIdToDisplayName.set(id, display);
    }

    // ── Master account list fallback lookup ──────────────────────────
    // Load the active master account list into memory once, up front, for
    // rep-assignment fallback when a row's own assigned_user column is
    // missing or unresolved. Only queries master_account_list_uploads /
    // master_account_list — both already exist from the Master Accounts
    // admin feature (lib/db-migrations.ts #576-577).
    interface MasterAccountRow {
      companyNameNormalized: string;
      domain: string | null;
      assignedRepId: number | null;
      assignedRepName: string | null;
      hqState: string | null;
      territoryId: number | null;
      entityStructure: string | null;
      services: string | null;
      wse: number | null;
    }

    const masterByDomain = new Map<string, MasterAccountRow>();
    // undefined = not seen yet, null = ambiguous (two master rows normalize
    // to the same key — don't guess which one applies), otherwise the row.
    const masterByNormalizedName = new Map<string, MasterAccountRow | null>();

    const activeUploadIds = await db.execute({
      sql: `SELECT id FROM master_account_list_uploads WHERE status = 'active'`,
      args: [],
    });

    if (activeUploadIds.rows.length > 0) {
      const ids = activeUploadIds.rows.map(r => Number(r.id));
      const placeholders = ids.map(() => '?').join(',');

      const masterRows = await db.execute({
        sql: `SELECT company_name_normalized, domain, assigned_rep_id, assigned_rep_name, hq_state,
                     territory_id, entity_structure, services, wse
              FROM master_account_list
              WHERE upload_id IN (${placeholders})`,
        args: ids,
      });

      for (const row of masterRows.rows) {
        const entry: MasterAccountRow = {
          companyNameNormalized: String(row.company_name_normalized),
          domain: row.domain != null ? String(row.domain) : null,
          assignedRepId: row.assigned_rep_id != null ? Number(row.assigned_rep_id) : null,
          assignedRepName: row.assigned_rep_name != null ? String(row.assigned_rep_name) : null,
          hqState: row.hq_state != null ? String(row.hq_state) : null,
          territoryId: row.territory_id != null ? Number(row.territory_id) : null,
          entityStructure: row.entity_structure != null ? String(row.entity_structure) : null,
          services: row.services != null ? String(row.services) : null,
          wse: row.wse != null ? Number(row.wse) : null,
        };
        if (entry.domain) {
          masterByDomain.set(entry.domain.toLowerCase(), entry);
        }
        if (masterByNormalizedName.has(entry.companyNameNormalized)) {
          masterByNormalizedName.set(entry.companyNameNormalized, null);
        } else {
          masterByNormalizedName.set(entry.companyNameNormalized, entry);
        }
      }
    }

    // ── Territory fallback lookup ─────────────────────────────────────
    // Maps a 2-letter state code to a single rep id when that territory has
    // exactly one assigned rep. Multi-rep (or zero-rep) territories are
    // never used for fallback — ambiguous, don't guess.
    const territoryByState = new Map<string, number>();

    const territories = await db.execute({ sql: `SELECT state_codes, assigned_user_ids FROM sales_territories`, args: [] });
    for (const terr of territories.rows) {
      let stateCodes: string[] = [];
      let userIds: number[] = [];
      try {
        stateCodes = JSON.parse(String(terr.state_codes ?? '[]'));
        userIds = JSON.parse(String(terr.assigned_user_ids ?? '[]'));
      } catch { continue; }
      if (!Array.isArray(stateCodes) || !Array.isArray(userIds) || userIds.length !== 1) continue;
      for (const state of stateCodes) {
        territoryByState.set(String(state).toUpperCase(), Number(userIds[0]));
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

    interface MasterRepResolution {
      assignedRepId: number | null;
      assignedRepName: string | null;
      source: 'master_domain' | 'master_name' | 'territory' | 'unresolved';
    }

    // Three-tier fallback for a company whose assigned-rep column is missing
    // or unresolved: exact domain match against the active master account
    // list, then normalized-name match against it, then (if the company's
    // HQ state is known) the single-rep territory that covers that state.
    // Closes over the maps built just above, so it must be defined here —
    // after they're populated, inside the request handler (they're rebuilt
    // fresh per upload, not shared across requests).
    const resolveMasterAccountRep = (
      companyNameNormalized: string,
      domain: string | null,
      hqState: string | null,
    ): MasterRepResolution => {
      if (domain) {
        const domainMatch = masterByDomain.get(domain.toLowerCase());
        if (domainMatch && domainMatch.assignedRepId !== null) {
          return { assignedRepId: domainMatch.assignedRepId, assignedRepName: domainMatch.assignedRepName, source: 'master_domain' };
        }
      }

      const nameMatch = masterByNormalizedName.get(companyNameNormalized);
      if (nameMatch != null && nameMatch.assignedRepId !== null) {
        return { assignedRepId: nameMatch.assignedRepId, assignedRepName: nameMatch.assignedRepName, source: 'master_name' };
      }

      if (hqState) {
        const terrRepId = territoryByState.get(hqState.toUpperCase());
        if (terrRepId !== undefined) {
          return { assignedRepId: terrRepId, assignedRepName: configIdToDisplayName.get(terrRepId) ?? null, source: 'territory' };
        }
      }

      return { assignedRepId: null, assignedRepName: null, source: 'unresolved' };
    };

    // Domain match (preferred), falling back to normalized-name match — same
    // precedence as resolveMasterAccountRep, but for the non-rep company
    // fields (Territory / Entity Structure / Services / Units) that have no
    // CSV column of their own today, so the master account list is their
    // only upload-time source rather than one of several fallback tiers.
    const lookupMasterAccountFields = (companyNameNormalized: string, domain: string | null): MasterAccountRow | null => {
      if (domain) {
        const domainMatch = masterByDomain.get(domain.toLowerCase());
        if (domainMatch) return domainMatch;
      }
      return masterByNormalizedName.get(companyNameNormalized) ?? null;
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

    const BACKGROUND_THRESHOLD = 5_000;
    const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';

    // run() encapsulates all DB writes — called synchronously for small files,
    // via waitUntil for large files so we can return immediately.
    const run = async (bgJobId?: string) => {
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
      return {
        total_in_file: valid.length,
        new_count: 0,
        updated_count: 0,
        skipped_count: valid.length,
      };
    }

    // Load all existing companies and attendees for matching
    const [existingCoRes, existingAtRes] = await Promise.all([
      db.execute({ sql: 'SELECT id, name, website, parent_company_id, company_type, wse, services, assigned_user, hq_state, entity_structure, territory_id FROM companies', args: [] }),
      db.execute({
        sql: `SELECT a.id, a.first_name, a.last_name, a.email,
                     c.name AS company_name, c.website AS company_website
              FROM attendees a
              LEFT JOIN companies c ON a.company_id = c.id`,
        args: [],
      }),
    ]);

    // Build company lookup (exact + normalised + domain + fuzzy)
    type CoRow = { id: number; name: string; website?: string | null; parent_company_id?: number | null; company_type?: string | null; wse?: number | null; services?: string | null; assigned_user?: string | null; hq_state?: string | null; entity_structure?: string | null; territory_id?: number | null };
    const existingCompanies: CoRow[] = existingCoRes.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      website: r.website ? String(r.website) : null,
      parent_company_id: r.parent_company_id ? Number(r.parent_company_id) : null,
      company_type: r.company_type ? String(r.company_type) : null,
      wse: r.wse ? Number(r.wse) : null,
      services: r.services ? String(r.services) : null,
      assigned_user: r.assigned_user ? String(r.assigned_user) : null,
      hq_state: r.hq_state ? String(r.hq_state) : null,
      entity_structure: r.entity_structure ? String(r.entity_structure) : null,
      territory_id: r.territory_id ? Number(r.territory_id) : null,
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
      /** How assigned_user was resolved — set once, after company matching
       * (see the fallback-resolution pass below), and included in the
       * match report's per-tier counts. */
      assigned_user_source?: 'file' | 'master_domain' | 'master_name' | 'territory';
      hqState?: string;
      wse?: number;
      services?: string;
      icp?: string;
      industry?: string;
      /** Master-account-list fallback only — no CSV column maps to these
       * today (see lib/columnMapping.ts), so the master account list is
       * their only upload-time source rather than one of several tiers. */
      entityStructure?: string;
      territoryId?: number;
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
            assigned_user_source: resolvedAssigned ? 'file' : undefined,
            hqState: p.state?.trim() || undefined,
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
          if (!existing.hqState && p.state?.trim()) existing.hqState = p.state.trim();
          if (!existing.assigned_user) {
            const rawAssigned = p.assigned_user?.trim();
            const uid = resolveUserId(rawAssigned);
            if (uid) { existing.assigned_user = uid; existing.assigned_user_source = 'file'; }
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

    // Master account / territory fallback for rep assignment. Runs after
    // company matching (not inline during aggregation above) specifically so
    // it can fall back to a matched existing company's own stored hq_state
    // when the uploaded file didn't supply one — that data isn't known until
    // matching has resolved companyIdCache.
    const hasFallbackData = masterByDomain.size > 0 || masterByNormalizedName.size > 0 || territoryByState.size > 0;
    if (hasFallbackData) {
      companyEntries.forEach((entry, coName) => {
        const coId = companyIdCache.get(coName);
        const existingCompany = coId && coId > 0 ? existingCompanies.find(c => c.id === coId) : undefined;

        const companyDomain = entry.website ? extractDomainFromWebsite(entry.website) : null;
        const normalizedName = deepNormalizeCompanyName(entry.name);
        const hqState = entry.hqState || existingCompany?.hq_state || null;

        const shouldUseFallback = !entry.assigned_user_supplied || entry.has_unresolved_assigned_user;
        if (shouldUseFallback) {
          const resolution = resolveMasterAccountRep(normalizedName, companyDomain, hqState);
          if (resolution.assignedRepId !== null) {
            entry.assigned_user = String(resolution.assignedRepId);
            entry.assigned_user_source = resolution.source as CompanyEntry['assigned_user_source'];
            // A fallback-resolved rep is a real resolution — clear the
            // unresolved flag so the write path (and match report) don't also
            // treat this as a failure alongside the successful fallback.
            entry.has_unresolved_assigned_user = false;
          }
        }
        // Opportunistically pick up hqState from the matched existing
        // company too, so it flows into the write path below even when it
        // wasn't the thing that resolved a rep (e.g. Tier 1/2 matched, but
        // the file also happened to omit state and the company has one on
        // file already — keep it rather than clobbering with null on write).
        if (!entry.hqState && existingCompany?.hq_state) entry.hqState = existingCompany.hq_state;

        // Territory / Entity Structure / Services / Units: no CSV column
        // maps to these (Territory and Entity Structure have never had one;
        // Services/Units backfill only when the file itself supplied
        // nothing), so this runs regardless of whether a rep needed
        // resolving — the master account list is the only upload-time
        // source for them, not a last-resort fallback tier.
        const masterFields = lookupMasterAccountFields(normalizedName, companyDomain);
        if (masterFields) {
          if (entry.territoryId == null && existingCompany?.territory_id == null && masterFields.territoryId != null) {
            entry.territoryId = masterFields.territoryId;
          }
          if (!entry.entityStructure && !existingCompany?.entity_structure && masterFields.entityStructure) {
            entry.entityStructure = masterFields.entityStructure;
          }
          if (!entry.services && !existingCompany?.services && masterFields.services) {
            entry.services = masterFields.services;
          }
          if (!entry.wse && !existingCompany?.wse && masterFields.wse) {
            entry.wse = masterFields.wse;
          }
        }
      });
    }

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
      const servicesMergeStmts = Array.from(parentServicesUpdates.entries()).map(([parentId, newServices]) => {
        const parent = existingCompanies.find((c) => c.id === parentId);
        const existingServices = parent?.services ? parent.services.split(',').map((s) => s.trim()).filter(Boolean) : [];
        const merged = new Set([...existingServices, ...Array.from(newServices)]);
        return { sql: 'UPDATE companies SET services = ? WHERE id = ?', args: [Array.from(merged).join(',') as string | number | null, parentId as string | number | null] };
      });
      for (let i = 0; i < servicesMergeStmts.length; i += 100) {
        await db.batch(servicesMergeStmts.slice(i, i + 100), 'write');
      }
    }

    // Update existing matched companies with CSV-provided fields
    const existingToUpdate = Array.from(companyEntries.entries()).filter(([n, entry]) => {
      const id = companyIdCache.get(n);
      return id !== undefined && id > 0 && (entry.company_type || entry.assigned_user || entry.website || entry.wse || entry.services || entry.hqState || entry.entityStructure || entry.territoryId != null);
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
        addCoField('hq_state', 'hq_state', entry.hqState || null);
        addCoField('entity_structure', 'entity_structure', entry.entityStructure || null);
        addCoField('territory_id', 'territory_id', entry.territoryId ?? null);

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
        const hqState = entry.hqState || null;
        const entityStructure = entry.entityStructure || null;
        const territoryId = entry.territoryId ?? null;
        return {
          sql: 'INSERT INTO companies (name, company_type, website, assigned_user, wse, services, industry, hq_state, entity_structure, territory_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
          args: [n, detectedType || null, website, assignedUser, wse, services, industry, hqState, entityStructure, territoryId],
        };
      });
      for (let i = 0; i < newCoNames.length; i++) {
        const id = Number(results[i]?.rows[0]?.id ?? 0);
        if (id > 0) companyIdCache.set(newCoNames[i], id);
      }
    }

    if (bgJobId) await db.execute({ sql: 'UPDATE upload_jobs SET processed_rows=? WHERE id=?', args: [Math.round(valid.length * 0.2), bgJobId] }).catch(() => {});

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
              company_type: row.company_type != null ? String(row.company_type) : null,
              services: row.services != null ? String(row.services) : null,
              wse: row.wse != null ? String(row.wse) : null,
              profit_type: row.profit_type != null ? String(row.profit_type) : null,
              entity_structure: row.entity_structure != null ? String(row.entity_structure) : null,
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
    type NewAttendee = { first_name: string; last_name: string; title?: string; company_id: number | null; email?: string; function?: string; product?: string; consent?: string; seniority?: string; is_placeholder?: boolean };
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
        const hasUpdate = (companyId && companyId > 0) || p.title?.trim() || p.email?.trim() || functionVal || rawProduct || autoProduct || consentVal;
        if (hasUpdate) existingAttendeeUpdates.push({
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
          is_placeholder: p.is_placeholder === true,
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
        const hasUpdate = (companyId && companyId > 0) || p.title?.trim() || p.email?.trim() || functionVal || rawProduct || autoProduct || consentVal;
        if (hasUpdate) existingAttendeeUpdates.push({
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
        sql: 'INSERT INTO attendees (first_name, last_name, title, company_id, email, "function", products, consent, seniority, is_placeholder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        args: [a.first_name, a.last_name, a.title ?? null, a.company_id, a.email ?? null, a.function ?? null, a.product ?? null, a.consent ?? 'Consent Not Recorded', a.seniority ?? null, a.is_placeholder ? 1 : 0],
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

    if (bgJobId) await db.execute({ sql: 'UPDATE upload_jobs SET processed_rows=? WHERE id=?', args: [Math.round(valid.length * 0.7), bgJobId] }).catch(() => {});

    // Batch-insert conference_attendees
    await batchInsert(db, attendeeIdsToLink, (aid) => ({
      sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
      args: [conferenceId, aid],
    }));
    // Real attendees just landed — clear any company-only stand-ins they make
    // redundant. Runs once for the whole batch, after the links are written.
    await sweepConflictedPlaceholders(db, conferenceId);
    await db.execute({ sql: "UPDATE conferences SET calendar_score_invalidated_at = datetime('now') WHERE id = ?", args: [conferenceId] }).catch(() => {});
    if (bgJobId) await db.execute({ sql: 'UPDATE upload_jobs SET processed_rows=? WHERE id=?', args: [Math.round(valid.length * 0.95), bgJobId] }).catch(() => {});

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
      const productMergeStmts = Array.from(companyProductUpdates.entries()).map(([coId, newProds]) => {
        const company = existingCompanies.find(c => c.id === coId);
        const existing = (company as { products?: string | null })?.products
          ? String((company as { products?: string | null }).products).split(',').map(s => s.trim()).filter(Boolean)
          : [];
        const merged = new Set([...existing, ...Array.from(newProds)]);
        return { sql: 'UPDATE companies SET products = ? WHERE id = ?', args: [Array.from(merged).join(',') as string | number | null, coId as string | number | null] };
      });
      for (let i = 0; i < productMergeStmts.length; i += 100) {
        await db.batch(productMergeStmts.slice(i, i + 100), 'write');
      }
    }

    const skippedCount = valid.length - newEntries.length;
    const updatedCount = existingAttendeeUpdates.length;

    // Auto-compute product ICP signals (skip for background jobs — non-critical)
    if (valid.length <= BACKGROUND_THRESHOLD) {
      computeAttendeeProductSignals(db, conferenceId).catch((e) =>
        console.error('computeAttendeeProductSignals after upload error:', e),
      );
    }

    // Fallback-attribution counts across all processed companies, for the
    // match report below.
    let masterDomainMatched = 0;
    let masterNameMatched = 0;
    let territoryMatched = 0;
    let stillUnresolved = 0;
    for (const entry of Array.from(companyEntries.values())) {
      if (entry.assigned_user_source === 'master_domain') masterDomainMatched++;
      else if (entry.assigned_user_source === 'master_name') masterNameMatched++;
      else if (entry.assigned_user_source === 'territory') territoryMatched++;
      else if (!entry.assigned_user) stillUnresolved++;
    }

    return {
      total_in_file: valid.length,
      new_count: attendeeIdsToLink.length,
      updated_count: updatedCount,
      skipped_count: skippedCount - updatedCount,
      assigned_user_match_report: {
        unmatched_count: unmatchedAssignedUsers.size,
        ambiguous_count: ambiguousAssignedUsers.size,
        unmatched_values: Array.from(unmatchedAssignedUsers).slice(0, 25),
        ambiguous_values: Array.from(ambiguousAssignedUsers).slice(0, 25),
        master_domain_matched: masterDomainMatched,
        master_name_matched: masterNameMatched,
        territory_matched: territoryMatched,
        still_unresolved: stillUnresolved,
      },
    };
    } // end run()

    if (valid.length > BACKGROUND_THRESHOLD) {
      const jobId = crypto.randomUUID();
      await db.execute({
        sql: `INSERT INTO upload_jobs
              (id, conference_id, conference_name, account_id, status, total_rows,
               created_by_user_id, created_by_email)
              VALUES (?, ?, ?, ?, 'processing', ?, ?, ?)`,
        args: [
          jobId, conferenceId, conferenceName,
          currentUser.accountId ?? '', valid.length,
          currentUser.id, currentUser.email,
        ],
      });

      waitUntil(
        run(jobId).then(async (result) => {
          await db.execute({
            sql: `UPDATE upload_jobs
                  SET status = 'done', processed_rows = total_rows,
                      new_count = ?, updated_count = ?, skipped_count = ?,
                      completed_at = datetime('now')
                  WHERE id = ?`,
            args: [result.new_count, result.updated_count, result.skipped_count, jobId],
          }).catch(() => {});
          // In-app notification. The email below is the one the reader gets,
          // so the helper's generic one is skipped.
          await createNotifications({
            db,
            userIds: [currentUser.id],
            type: 'conference',
            recordId: conferenceId,
            recordName: conferenceName,
            message: `Upload complete for ${conferenceName}: ${result.new_count} new attendee(s) added, ${result.updated_count} record(s) updated.`,
            changedByEmail: currentUser.email,
            changedByConfigId: await getConfigIdByEmail(currentUser.email, db),
            entityType: 'conference',
            entityId: conferenceId,
            skipEmail: true,
          });
          // Email notification
          const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? '';
          await sendNotificationEmail(
            currentUser.email,
            `${APP_NAME} - Upload Complete`,
            `Your attendee list for "${conferenceName}" has finished uploading: ${result.new_count} new attendee(s) added, ${result.updated_count} record(s) updated.`,
            `${BASE}/conferences/${conferenceId}`,
          ).catch(() => {});
        }).catch(async (err) => {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          await db.execute({
            sql: `UPDATE upload_jobs SET status = 'error', error_message = ?, completed_at = datetime('now') WHERE id = ?`,
            args: [msg, jobId],
          }).catch(() => {});
          // In-app only, as before — someone watching the upload fail in the UI
          // doesn't need an email about it too.
          await createNotifications({
            db,
            userIds: [currentUser.id],
            type: 'conference',
            recordId: conferenceId,
            recordName: conferenceName,
            message: `Upload failed for ${conferenceName}. Please try again or contact support if the issue persists.`,
            changedByEmail: currentUser.email,
            changedByConfigId: await getConfigIdByEmail(currentUser.email, db),
            entityType: 'conference',
            entityId: conferenceId,
            skipEmail: true,
          });
        })
      );

      return NextResponse.json({
        status: 'processing',
        job_id: jobId,
        total_rows: valid.length,
        conference_name: conferenceName,
      });
    }

    // Synchronous path for ≤5,000 rows
    const result = await run();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('POST /api/conferences/[id]/attendees/upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload attendees' },
      { status: 500 }
    );
  }
}
