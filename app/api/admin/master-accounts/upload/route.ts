import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getConfigOptionValues } from '@/lib/db';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import type { Client } from '@libsql/client';
import { extractRawRows, matchConfigOption } from '@/lib/parsers';
import { deepNormalizeCompanyName, extractDomainFromWebsite } from '@/lib/matching';
import { normalizeNameKey, normalizeReversedNameKey } from '@/lib/normalize';

const ALLOWED_EXTENSIONS = new Set(['csv', 'xlsx', 'xls']);
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

interface MasterAccountColumnMapping {
  companyName: string;
  website?: string;
  assignedRep?: string;
  hqState?: string;
  territory?: string;
  entityStructure?: string;
  services?: string;
  units?: string;
}

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

// Same chunked db.batch() wrapper used by the attendee-list upload route —
// Turso/libSQL has no multi-row VALUES-in-one-execute() shortcut, so bulk
// writes go through db.batch() in chunks instead of one execute() per row.
async function batchExec(
  dbClient: Client,
  stmts: { sql: string; args: (string | number | null)[] }[],
  chunkSize = 300
): Promise<void> {
  for (let i = 0; i < stmts.length; i += chunkSize) {
    await dbClient.batch(stmts.slice(i, i + chunkSize), 'write');
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  if (authResult.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const db = await getDb(authResult.accountId);

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: 'Unsupported file type. Please upload a CSV or Excel (.xlsx, .xls) file.' }, { status: 400 });
    }

    const mappingJson = formData.get('columnMapping') as string | null;
    let mapping: MasterAccountColumnMapping;
    try {
      mapping = mappingJson ? JSON.parse(mappingJson) as MasterAccountColumnMapping : { companyName: '' };
    } catch {
      return NextResponse.json({ error: 'Invalid columnMapping JSON' }, { status: 400 });
    }
    if (!mapping.companyName) {
      return NextResponse.json({ error: 'columnMapping.companyName is required' }, { status: 400 });
    }

    const uploadModeRaw = formData.get('uploadMode') as string | null;
    const uploadMode: 'replace' | 'merge' = uploadModeRaw === 'merge' ? 'merge' : 'replace';
    const notes = (formData.get('notes') as string | null)?.trim() || null;

    const buffer = Buffer.from(await file.arrayBuffer());
    let rawRows: Record<string, unknown>[];
    try {
      rawRows = extractRawRows(buffer, file.name);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to parse file' }, { status: 400 });
    }
    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'No rows found in file' }, { status: 400 });
    }

    // ─── Build the rep lookup tables — identical construction to
    // resolveUserId in attendees/upload/route.ts, adapted for a single-value
    // (not multi-owner) cell since master account list reps are one-per-row. ───
    const [userRows, usersWithConfig, servicesOptions, territoryRows] = await Promise.all([
      db.execute({ sql: `SELECT id, value FROM config_options WHERE category = ?`, args: ['user'] }),
      db.execute({ sql: `SELECT config_id, display_name, email FROM users WHERE config_id IS NOT NULL`, args: [] }),
      getConfigOptionValues('services', db),
      db.execute({ sql: `SELECT id, name FROM sales_territories`, args: [] }),
    ]);

    // Territory name → id, exact case-insensitive match (small, fixed list —
    // no fuzzy matching needed, unlike services/company_type which come from
    // free-text CSV values against a larger canonical config_options list).
    const territoryByName = new Map<string, number>();
    for (const r of territoryRows.rows) {
      const name = String(r.name ?? '').trim();
      if (name) territoryByName.set(name.toLowerCase(), Number(r.id));
    }

    const userOptions: Array<{ id: number; value: string }> = userRows.rows.map(r => ({
      id: Number(r.id),
      value: String(r.value),
    }));

    const userDisplayNameMap = new Map<string, number>();
    const configIdToDisplayName = new Map<number, string>();
    for (const r of usersWithConfig.rows) {
      const configId = Number(r.config_id);
      const display = r.display_name ? String(r.display_name).trim() : '';
      if (display) {
        userDisplayNameMap.set(display.toLowerCase(), configId);
        configIdToDisplayName.set(configId, display);
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
      const key = normalizeNameKey(display);
      if (!key) continue;
      const set = userNameIndex.get(key) ?? new Set<number>();
      set.add(id);
      userNameIndex.set(key, set);
    }

    const displayNameForId = (id: number): string =>
      configIdToDisplayName.get(id) ?? userOptions.find(u => u.id === id)?.value ?? '';

    const unresolvedRepNames: string[] = [];

    // Single-value mirror of resolveUserId — no multi-owner token splitting,
    // since a master account list's rep column is expected to hold one rep.
    const resolveSingleRep = (raw: string | undefined): { id: number | null; displayName: string | null } => {
      const trimmed = raw?.trim();
      if (!trimmed) return { id: null, displayName: null };

      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && userOptions.some(u => u.id === num)) {
        return { id: num, displayName: displayNameForId(num) || trimmed };
      }

      const lower = trimmed.toLowerCase();
      const match = userOptions.find(u => u.value.toLowerCase() === lower);
      if (match) return { id: match.id, displayName: displayNameForId(match.id) || match.value };

      const displayId = userDisplayNameMap.get(lower);
      if (displayId != null) return { id: displayId, displayName: displayNameForId(displayId) || trimmed };

      const directKey = normalizeNameKey(trimmed);
      const reversedKey = normalizeReversedNameKey(trimmed);
      const directMatches = directKey ? userNameIndex.get(directKey) : null;
      const reversedMatches = reversedKey ? userNameIndex.get(reversedKey) : null;
      const merged = new Set<number>([
        ...(directMatches ? Array.from(directMatches) : []),
        ...(reversedMatches ? Array.from(reversedMatches) : []),
      ]);
      if (merged.size === 1) {
        const id = Array.from(merged)[0];
        return { id, displayName: displayNameForId(id) || trimmed };
      }

      // 0 matches (unknown name) or >1 matches (ambiguous, two reps share this
      // name) both fall through here — same "don't guess" behavior as
      // resolveUserId's unmatched/ambiguous handling.
      unresolvedRepNames.push(trimmed);
      return { id: null, displayName: null };
    };

    // ─── Normalize each row per the column mapping ───
    interface ProcessedRow {
      companyName: string;
      companyNameNormalized: string;
      website: string | null;
      domain: string | null;
      assignedRepId: number | null;
      assignedRepName: string | null;
      hqState: string | null;
      territoryId: number | null;
      territoryName: string | null;
      entityStructure: string | null;
      services: string | null;
      wse: number | null;
      rawRow: Record<string, unknown>;
    }

    const processedRows: ProcessedRow[] = [];
    let resolvedReps = 0;
    let unresolvedReps = 0;

    for (const row of rawRows) {
      const companyName = String(row[mapping.companyName] ?? '').trim();
      if (!companyName) continue; // skip rows with no company name — companyName is required

      const website = mapping.website ? String(row[mapping.website] ?? '').trim() || null : null;
      const repRaw = mapping.assignedRep ? String(row[mapping.assignedRep] ?? '').trim() : '';
      const hqState = mapping.hqState ? String(row[mapping.hqState] ?? '').trim() || null : null;
      const territoryRaw = mapping.territory ? String(row[mapping.territory] ?? '').trim() || null : null;
      const entityStructureRaw = mapping.entityStructure ? String(row[mapping.entityStructure] ?? '').trim() || null : null;
      const servicesRaw = mapping.services ? String(row[mapping.services] ?? '').trim() || null : null;
      const unitsRaw = mapping.units ? String(row[mapping.units] ?? '').trim() : '';

      let assignedRepId: number | null = null;
      let assignedRepName: string | null = null;
      if (repRaw) {
        const resolved = resolveSingleRep(repRaw);
        if (resolved.id != null) {
          assignedRepId = resolved.id;
          assignedRepName = resolved.displayName;
          resolvedReps++;
        } else {
          assignedRepName = repRaw;
          unresolvedReps++;
        }
      }

      const territoryId = territoryRaw ? territoryByName.get(territoryRaw.toLowerCase()) ?? null : null;

      // Same splitter as the conference attendee-list upload route
      // (app/api/conferences/[id]/attendees/upload/route.ts) — matched
      // fuzzily against the canonical services config option values.
      let services: string | null = null;
      if (servicesRaw && servicesOptions.length > 0) {
        const matched = servicesRaw.split(/[;,:\\/|]+|\s+-\s+/).map(s => s.trim()).filter(Boolean)
          .map(s => matchConfigOption(s, servicesOptions)).filter((v): v is string => v !== null);
        services = matched.length > 0 ? matched.join(',') : null;
      }

      let wse: number | null = null;
      if (unitsRaw) {
        const parsed = parseInt(unitsRaw, 10);
        if (!isNaN(parsed) && parsed >= 0) wse = parsed;
      }

      processedRows.push({
        companyName,
        companyNameNormalized: deepNormalizeCompanyName(companyName),
        website,
        domain: website ? extractDomainFromWebsite(website) : null,
        assignedRepId,
        assignedRepName,
        hqState,
        territoryId,
        territoryName: territoryRaw,
        entityStructure: entityStructureRaw,
        services,
        wse,
        rawRow: row,
      });
    }

    if (processedRows.length === 0) {
      return NextResponse.json({ error: 'No rows with a mapped company name were found' }, { status: 400 });
    }

    // ─── Upload the original file to R2 (audit trail — not served publicly,
    // so only the storage key is persisted, no public URL). ───
    const contentType = file.type || CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';
    const storageKey = `master-accounts/${randomBytes(8).toString('hex')}.${ext}`;
    await r2Client().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
    }));

    // ─── Replace mode archives every prior upload before this one is inserted. ───
    if (uploadMode === 'replace') {
      await db.execute({ sql: `UPDATE master_account_list_uploads SET status = 'archived' WHERE status = 'active'`, args: [] });
    }

    const uploadInsert = await db.execute({
      sql: `INSERT INTO master_account_list_uploads
              (uploaded_by_user_id, file_name, file_size, storage_key, row_count, status, upload_mode, column_mapping, notes)
            VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
            RETURNING id`,
      args: [authResult.id, file.name, file.size, storageKey, processedRows.length, uploadMode, JSON.stringify(mapping), notes],
    });
    const uploadId = Number(uploadInsert.rows[0].id);

    let mergeStats: { added: number; updated: number; unchanged: number } | undefined;

    if (uploadMode === 'replace') {
      const insertStmts = processedRows.map(r => ({
        sql: `INSERT INTO master_account_list
                (upload_id, company_name, company_name_normalized, website, domain, assigned_rep_id, assigned_rep_name, hq_state,
                 territory_id, territory_name, entity_structure, services, wse, raw_row)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          uploadId, r.companyName, r.companyNameNormalized, r.website, r.domain,
          r.assignedRepId, r.assignedRepName, r.hqState,
          r.territoryId, r.territoryName, r.entityStructure, r.services, r.wse, JSON.stringify(r.rawRow),
        ] as (string | number | null)[],
      }));
      await batchExec(db, insertStmts);
    } else {
      // merge: match against every currently-active row (across all active
      // uploads, not just the most recent one) by normalized company name.
      const activeRows = await db.execute({
        sql: `SELECT id, company_name_normalized, website, domain, assigned_rep_id, assigned_rep_name, hq_state,
                     territory_id, territory_name, entity_structure, services, wse
              FROM master_account_list
              WHERE upload_id IN (SELECT id FROM master_account_list_uploads WHERE status = 'active' AND id != ?)`,
        args: [uploadId],
      });
      const existingByNormalized = new Map<string, {
        id: number; website: string | null; domain: string | null; assignedRepId: number | null; assignedRepName: string | null; hqState: string | null;
        territoryId: number | null; territoryName: string | null; entityStructure: string | null; services: string | null; wse: number | null;
      }>();
      for (const r of activeRows.rows) {
        existingByNormalized.set(String(r.company_name_normalized), {
          id: Number(r.id),
          website: r.website != null ? String(r.website) : null,
          domain: r.domain != null ? String(r.domain) : null,
          assignedRepId: r.assigned_rep_id != null ? Number(r.assigned_rep_id) : null,
          assignedRepName: r.assigned_rep_name != null ? String(r.assigned_rep_name) : null,
          hqState: r.hq_state != null ? String(r.hq_state) : null,
          territoryId: r.territory_id != null ? Number(r.territory_id) : null,
          territoryName: r.territory_name != null ? String(r.territory_name) : null,
          entityStructure: r.entity_structure != null ? String(r.entity_structure) : null,
          services: r.services != null ? String(r.services) : null,
          wse: r.wse != null ? Number(r.wse) : null,
        });
      }

      let added = 0, updated = 0, unchanged = 0;
      const insertStmts: { sql: string; args: (string | number | null)[] }[] = [];
      const updateStmts: { sql: string; args: (string | number | null)[] }[] = [];

      for (const r of processedRows) {
        const existing = existingByNormalized.get(r.companyNameNormalized);
        if (!existing) {
          added++;
          insertStmts.push({
            sql: `INSERT INTO master_account_list
                    (upload_id, company_name, company_name_normalized, website, domain, assigned_rep_id, assigned_rep_name, hq_state,
                     territory_id, territory_name, entity_structure, services, wse, raw_row)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              uploadId, r.companyName, r.companyNameNormalized, r.website, r.domain, r.assignedRepId, r.assignedRepName, r.hqState,
              r.territoryId, r.territoryName, r.entityStructure, r.services, r.wse, JSON.stringify(r.rawRow),
            ],
          });
          continue;
        }

        const changed = existing.website !== r.website
          || existing.domain !== r.domain
          || existing.assignedRepId !== r.assignedRepId
          || existing.assignedRepName !== r.assignedRepName
          || existing.hqState !== r.hqState
          || existing.territoryId !== r.territoryId
          || existing.territoryName !== r.territoryName
          || existing.entityStructure !== r.entityStructure
          || existing.services !== r.services
          || existing.wse !== r.wse;

        if (!changed) { unchanged++; continue; }

        updated++;
        updateStmts.push({
          sql: `UPDATE master_account_list
                SET company_name = ?, website = ?, domain = ?, assigned_rep_id = ?, assigned_rep_name = ?, hq_state = ?,
                    territory_id = ?, territory_name = ?, entity_structure = ?, services = ?, wse = ?, raw_row = ?, updated_at = datetime('now')
                WHERE id = ?`,
          args: [
            r.companyName, r.website, r.domain, r.assignedRepId, r.assignedRepName, r.hqState,
            r.territoryId, r.territoryName, r.entityStructure, r.services, r.wse, JSON.stringify(r.rawRow), existing.id,
          ],
        });
      }

      await batchExec(db, [...insertStmts, ...updateStmts]);
      mergeStats = { added, updated, unchanged };
    }

    return NextResponse.json({
      uploadId,
      rowCount: processedRows.length,
      resolvedReps,
      unresolvedReps,
      unresolvedRepNames: unresolvedRepNames.slice(0, 25),
      uploadMode,
      ...(mergeStats ? { mergeStats } : {}),
    });
  } catch (error) {
    console.error('POST /api/admin/master-accounts/upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
