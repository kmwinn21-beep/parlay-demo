import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { deepNormalizeCompanyName, extractDomainFromWebsite } from '@/lib/matching';

interface MasterRow {
  companyNameNormalized: string;
  domain: string | null;
  assignedRepId: number | null;
  assignedRepName: string | null;
  hqState: string | null;
  territoryId: number | null;
  territoryName: string | null;
  entityStructure: string | null;
  services: string | null;
  wse: number | null;
  website: string | null;
  crmLink: string | null;
}

interface CompanyRow {
  id: number;
  name: string;
  website: string | null;
  assignedUser: string | null;
  hqState: string | null;
  wse: number | null;
  services: string | null;
  entityStructure: string | null;
  territoryId: number | null;
  crmLink: string | null;
}

// Same match precedence used by the conference upload routes' master-account
// fallback: exact domain match first, then exact normalized-name match.
function matchMaster(
  company: CompanyRow,
  byDomain: Map<string, MasterRow>,
  byNormalizedName: Map<string, MasterRow | null>
): MasterRow | null {
  const domain = company.website ? extractDomainFromWebsite(company.website) : null;
  if (domain) {
    const hit = byDomain.get(domain.toLowerCase());
    if (hit) return hit;
  }
  return byNormalizedName.get(deepNormalizeCompanyName(company.name)) ?? null;
}

async function loadData(db: Awaited<ReturnType<typeof getDb>>) {
  const [companyRows, masterRows, userRows] = await Promise.all([
    db.execute({ sql: `SELECT id, name, website, assigned_user, hq_state, wse, services, entity_structure, territory_id, crm_link FROM companies`, args: [] }),
    db.execute({
      sql: `SELECT company_name_normalized, domain, assigned_rep_id, assigned_rep_name, hq_state,
                   territory_id, territory_name, entity_structure, services, wse, website, crm_link
            FROM master_account_list
            WHERE upload_id IN (SELECT id FROM master_account_list_uploads WHERE status = 'active')`,
      args: [],
    }),
    db.execute({ sql: `SELECT config_id, display_name FROM users WHERE config_id IS NOT NULL`, args: [] }),
  ]);

  const companies: CompanyRow[] = companyRows.rows.map(r => ({
    id: Number(r.id),
    name: String(r.name ?? ''),
    website: r.website ? String(r.website) : null,
    assignedUser: r.assigned_user ? String(r.assigned_user) : null,
    hqState: r.hq_state ? String(r.hq_state) : null,
    wse: r.wse != null ? Number(r.wse) : null,
    services: r.services ? String(r.services) : null,
    entityStructure: r.entity_structure ? String(r.entity_structure) : null,
    territoryId: r.territory_id != null ? Number(r.territory_id) : null,
    crmLink: r.crm_link ? String(r.crm_link) : null,
  }));

  const byDomain = new Map<string, MasterRow>();
  const byNormalizedName = new Map<string, MasterRow | null>();
  for (const row of masterRows.rows) {
    const entry: MasterRow = {
      companyNameNormalized: String(row.company_name_normalized),
      domain: row.domain != null ? String(row.domain) : null,
      assignedRepId: row.assigned_rep_id != null ? Number(row.assigned_rep_id) : null,
      assignedRepName: row.assigned_rep_name != null ? String(row.assigned_rep_name) : null,
      hqState: row.hq_state != null ? String(row.hq_state) : null,
      territoryId: row.territory_id != null ? Number(row.territory_id) : null,
      territoryName: row.territory_name != null ? String(row.territory_name) : null,
      entityStructure: row.entity_structure != null ? String(row.entity_structure) : null,
      services: row.services != null ? String(row.services) : null,
      wse: row.wse != null ? Number(row.wse) : null,
      website: row.website != null ? String(row.website) : null,
      crmLink: row.crm_link != null ? String(row.crm_link) : null,
    };
    if (entry.domain) byDomain.set(entry.domain.toLowerCase(), entry);
    if (byNormalizedName.has(entry.companyNameNormalized)) {
      byNormalizedName.set(entry.companyNameNormalized, null);
    } else {
      byNormalizedName.set(entry.companyNameNormalized, entry);
    }
  }

  const repNameById = new Map<number, string>();
  for (const r of userRows.rows) {
    const id = Number(r.config_id);
    const display = String(r.display_name ?? '').trim();
    if (id && display) repNameById.set(id, display);
  }

  return { companies, byDomain, byNormalizedName, repNameById };
}

// A company's assigned_user is a comma-separated list for multi-owner
// support elsewhere in the app; sync only compares/replaces the rep when
// the company has exactly zero or one — with two or more we can't tell
// which one the master list's single rep is meant to replace, so those
// companies keep their assigned_user untouched entirely.
function singleAssignedRepId(assignedUser: string | null): number | null {
  if (!assignedUser) return null;
  const ids = assignedUser.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  return ids.length === 1 ? ids[0] : null;
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  if (authResult.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const db = await getDb(authResult.accountId);

  try {
    const body = await request.json().catch(() => ({})) as { apply?: boolean; resolutions?: Record<string, 'accept' | 'ignore'> };
    const { companies, byDomain, byNormalizedName, repNameById } = await loadData(db);

    if (!body.apply) {
      // ── Preview: report match count + rep conflicts only. Non-rep field
      // updates need no confirmation, so they're not itemized here — just
      // counted — matching the upload flow's "silent unless it's a rep"
      // behavior described for this feature. ──
      let matchedCount = 0;
      let directUpdateCount = 0;
      const conflicts: Array<{ entityType: 'company'; entityId: number; entityName: string; field: string; fieldLabel: string; currentValue: string; proposedValue: string }> = [];

      for (const co of companies) {
        const master = matchMaster(co, byDomain, byNormalizedName);
        if (!master) continue;
        matchedCount++;

        const hasFieldChange =
          (master.website && master.website !== co.website) ||
          (master.hqState && master.hqState !== co.hqState) ||
          (master.territoryId != null && master.territoryId !== co.territoryId) ||
          (master.entityStructure && master.entityStructure !== co.entityStructure) ||
          (master.services && master.services !== co.services) ||
          (master.wse != null && master.wse !== co.wse) ||
          (master.crmLink && master.crmLink !== co.crmLink);
        if (hasFieldChange) directUpdateCount++;

        const currentRepId = singleAssignedRepId(co.assignedUser);
        if (master.assignedRepId != null && currentRepId != null && currentRepId !== master.assignedRepId) {
          conflicts.push({
            entityType: 'company',
            entityId: co.id,
            entityName: co.name,
            field: 'assigned_user',
            fieldLabel: 'Assigned Rep',
            currentValue: repNameById.get(currentRepId) ?? `User #${currentRepId}`,
            proposedValue: master.assignedRepName ?? (repNameById.get(master.assignedRepId) ?? `User #${master.assignedRepId}`),
          });
        }
      }

      return NextResponse.json({ totalCompanies: companies.length, matchedCount, directUpdateCount, conflicts });
    }

    // ── Apply ──
    const resolutions = body.resolutions ?? {};
    const stmts: { sql: string; args: (string | number | null)[] }[] = [];
    let updated = 0, repUpdated = 0, repSkipped = 0;

    for (const co of companies) {
      const master = matchMaster(co, byDomain, byNormalizedName);
      if (!master) continue;

      const setClauses: string[] = [];
      const args: (string | number | null)[] = [];

      if (master.website && master.website !== co.website) { setClauses.push('website = ?'); args.push(master.website); }
      if (master.hqState && master.hqState !== co.hqState) { setClauses.push('hq_state = ?'); args.push(master.hqState); }
      if (master.territoryId != null && master.territoryId !== co.territoryId) { setClauses.push('territory_id = ?'); args.push(master.territoryId); }
      // entity_structure deliberately not synced — it is derived from a
      // company's parent/child links, not something a master sheet can assert.
      if (master.services && master.services !== co.services) { setClauses.push('services = ?'); args.push(master.services); }
      if (master.wse != null && master.wse !== co.wse) { setClauses.push('wse = ?'); args.push(master.wse); }
      if (master.crmLink && master.crmLink !== co.crmLink) { setClauses.push('crm_link = ?'); args.push(master.crmLink); }

      const currentRepId = singleAssignedRepId(co.assignedUser);
      if (master.assignedRepId != null) {
        if (currentRepId == null) {
          // Blank (or ambiguous multi-owner) — only fill in when truly blank.
          if (!co.assignedUser) {
            setClauses.push('assigned_user = ?');
            args.push(String(master.assignedRepId));
            repUpdated++;
          }
        } else if (currentRepId !== master.assignedRepId) {
          const key = `company_${co.id}_assigned_user`;
          if (resolutions[key] === 'accept') {
            setClauses.push('assigned_user = ?');
            args.push(String(master.assignedRepId));
            repUpdated++;
          } else {
            repSkipped++;
          }
        }
      }

      if (setClauses.length === 0) continue;
      updated++;
      stmts.push({ sql: `UPDATE companies SET ${setClauses.join(', ')} WHERE id = ?`, args: [...args, co.id] });
    }

    for (let i = 0; i < stmts.length; i += 300) {
      await db.batch(stmts.slice(i, i + 300), 'write');
    }

    return NextResponse.json({ updated, repUpdated, repSkipped });
  } catch (error) {
    console.error('POST /api/admin/master-accounts/sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
