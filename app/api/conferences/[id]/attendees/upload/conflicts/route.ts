import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady, getConfigOptionValues } from '@/lib/db';
import { parseFile, parseFileWithMapping, matchConfigOption, type ColumnMapping } from '@/lib/parsers';
import { SYSTEM_FIELD_LABELS } from '@/lib/columnMapping';
import {
  buildCompanyMatcher,
  buildAttendeeMatcher,
  matchCompany,
  matchAttendee,
  confirmAttendeeMatch,
} from '@/lib/matching';

export interface ConflictItem {
  entityType: 'attendee' | 'company';
  entityId: number;
  entityName: string;
  field: string;
  fieldLabel: string;
  currentValue: string;
  proposedValue: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await dbReady;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) return NextResponse.json({ conflicts: [] });

    const mappingJson = formData.get('mapping') as string | null;
    const mapping: ColumnMapping | null = mappingJson ? JSON.parse(mappingJson) : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = mapping
      ? await parseFileWithMapping(buffer, file.name, mapping)
      : await parseFile(buffer, file.name);
    const valid = parsed.filter((p) => p.first_name?.trim() || p.last_name?.trim());

    if (valid.length === 0) return NextResponse.json({ conflicts: [] });

    // Normalize config-driven fields
    const [companyTypeOptions, functionOptions] = await Promise.all([
      getConfigOptionValues('company_type'),
      getConfigOptionValues('function'),
    ]);
    if (companyTypeOptions.length > 0) {
      for (const p of valid) {
        if (p.company_type) {
          p.company_type = matchConfigOption(p.company_type, companyTypeOptions) ?? undefined;
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

    // Load existing records (read-only — no DB writes in this route)
    const [existingCoRes, existingAtRes] = await Promise.all([
      db.execute({
        sql: 'SELECT id, name, website, parent_company_id, company_type, wse FROM companies',
        args: [],
      }),
      db.execute({
        sql: `SELECT a.id, a.first_name, a.last_name, a.email, a.title, a."function",
                     c.name AS company_name, c.website AS company_website
              FROM attendees a LEFT JOIN companies c ON a.company_id = c.id`,
        args: [],
      }),
    ]);

    type CoRow = {
      id: number; name: string; website?: string | null;
      parent_company_id?: number | null; company_type?: string | null; wse?: number | null;
    };
    const existingCompanies: CoRow[] = existingCoRes.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      website: r.website ? String(r.website) : null,
      parent_company_id: r.parent_company_id ? Number(r.parent_company_id) : null,
      company_type: r.company_type ? String(r.company_type) : null,
      wse: r.wse != null ? Number(r.wse) : null,
    }));
    const companyMatcher = buildCompanyMatcher(existingCompanies);

    type AtRow = {
      id: number; full_name: string; email: string | null; title: string | null;
      function: string | null; website: string | null; company_name: string | null;
    };
    const existingAttendees: AtRow[] = existingAtRes.rows.map((r) => ({
      id: Number(r.id),
      full_name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      email: r.email ? String(r.email) : null,
      title: r.title ? String(r.title) : null,
      function: r.function ? String(r.function) : null,
      website: r.company_website ? String(r.company_website) : null,
      company_name: r.company_name ? String(r.company_name) : null,
    }));
    const attendeeMatcher = buildAttendeeMatcher(existingAttendees);

    const conflicts: ConflictItem[] = [];
    const fieldLabel = (field: string) =>
      (SYSTEM_FIELD_LABELS as Record<string, { label: string }>)[field]?.label ?? field;

    // ── Company conflicts ──────────────────────────────────────────────────────
    const seenCoIds = new Set<number>();
    for (const p of valid) {
      if (!p.company?.trim()) continue;
      const coName = p.company.trim();
      const hit = matchCompany(coName, existingCompanies, companyMatcher, p.email?.trim(), p.website?.trim());
      if (!hit) continue;
      const existing = hit.match;
      if (seenCoIds.has(existing.id)) continue;
      seenCoIds.add(existing.id);

      // Aggregate all file rows for this company to get the best proposed values
      const coRows = valid.filter(q => q.company?.trim() === coName);
      const proposedType = coRows.find(q => q.company_type?.trim())?.company_type?.trim() ?? null;
      const proposedWebsite = coRows.find(q => q.website?.trim())?.website?.trim() ?? null;
      const rawWse = coRows.find(q => q.wse?.trim())?.wse?.trim() ?? null;
      const proposedWse = rawWse ? (parseInt(rawWse, 10) || null) : null;

      const checkCo = (field: string, existVal: string | number | null | undefined, propVal: string | number | null | undefined) => {
        if (existVal == null || existVal === '') return; // existing blank → auto-apply, no conflict
        if (propVal == null || propVal === '') return;   // nothing proposed
        if (String(existVal).trim().toLowerCase() === String(propVal).trim().toLowerCase()) return;
        conflicts.push({
          entityType: 'company',
          entityId: existing.id,
          entityName: existing.name,
          field,
          fieldLabel: fieldLabel(field),
          currentValue: String(existVal).trim(),
          proposedValue: String(propVal).trim(),
        });
      };

      checkCo('company_type', existing.company_type, proposedType);
      checkCo('website', existing.website, proposedWebsite);
      checkCo('wse', existing.wse, proposedWse);
    }

    // ── Attendee conflicts ─────────────────────────────────────────────────────
    const seenNames = new Set<string>();
    for (const p of valid) {
      const fname = (p.first_name ?? '').trim();
      const lname = (p.last_name ?? '').trim();
      const nameKey = `${fname} ${lname}`.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);

      const confirmFn = (candidate: AtRow) =>
        confirmAttendeeMatch(candidate, p.email?.trim(), p.website?.trim(), p.company?.trim());
      const hit = matchAttendee(fname, lname, existingAttendees, attendeeMatcher, confirmFn);
      if (!hit) continue;
      const existing = existingAttendees.find(a => a.id === hit.match.id)!;

      const checkAt = (field: string, existVal: string | null | undefined, propVal: string | null | undefined) => {
        if (!existVal) return; // existing blank → auto-apply
        if (!propVal) return; // nothing proposed
        if (existVal.trim().toLowerCase() === propVal.trim().toLowerCase()) return;
        conflicts.push({
          entityType: 'attendee',
          entityId: existing.id,
          entityName: `${fname} ${lname}`,
          field,
          fieldLabel: fieldLabel(field),
          currentValue: existVal.trim(),
          proposedValue: propVal.trim(),
        });
      };

      checkAt('title', existing.title, p.title?.trim());
      checkAt('email', existing.email, p.email?.trim());
      checkAt('function', existing.function, p.function?.trim());
    }

    return NextResponse.json({ conflicts });
  } catch (error) {
    console.error('POST upload/conflicts error:', error);
    return NextResponse.json({ error: 'Failed to detect conflicts' }, { status: 500 });
  }
}
