import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const maxDuration = 120;
import { getConfigOptionValues } from '@/lib/db';
import { getDb } from '@/lib/getDb';
import { parseFile, parseFileWithMapping, matchConfigOption, type ColumnMapping } from '@/lib/parsers';
import { SYSTEM_FIELD_LABELS } from '@/lib/columnMapping';
import {
  buildCompanyMatcher,
  buildAttendeeMatcher,
  matchCompany,
  matchAttendee,
  confirmAttendeeMatch,
  deepNormalizeCompanyName,
  identityConflictField,
} from '@/lib/matching';
import { loadCompanyNameDecisions } from '@/lib/companyNameDecisions';

export interface ConflictItem {
  entityType: 'attendee' | 'company' | 'company_identity';
  entityId: number;
  entityName: string;
  field: string;
  fieldLabel: string;
  currentValue: string;
  proposedValue: string;
  acceptLabel?: string;
  ignoreLabel?: string;
  acceptShows?: 'current' | 'proposed';
  acceptCaption?: string;
  ignoreCaption?: string;
  defaultResolution?: 'accept' | 'ignore';
  detail?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {

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
      getConfigOptionValues('company_type', db),
      getConfigOptionValues('function', db),
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
        sql: 'SELECT id, name, website, crm_link, parent_company_id, company_type, wse FROM companies',
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
      id: number; name: string; website?: string | null; crm_link?: string | null;
      parent_company_id?: number | null; company_type?: string | null; wse?: number | null;
    };
    const existingCompanies: CoRow[] = existingCoRes.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      website: r.website ? String(r.website) : null,
      crm_link: r.crm_link ? String(r.crm_link) : null,
      parent_company_id: r.parent_company_id ? Number(r.parent_company_id) : null,
      company_type: r.company_type ? String(r.company_type) : null,
      wse: r.wse != null ? Number(r.wse) : null,
    }));
    const companyMatcher = buildCompanyMatcher(existingCompanies);
    const nameDecisions = await loadCompanyNameDecisions(db);

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
    const askedIdentity = new Set<string>();

    /*
     * One hit per uploaded company name, resolved before any question is
     * asked.
     *
     * Still matched row by row — a row carrying an email or a website can
     * confirm a match that the bare name cannot, so the first row's absence of
     * one must not settle it. What is kept per name is the best hit seen: a
     * confident match replaces a guess, and once a name is confidently matched
     * the remaining rows for it are not matched again.
     */
    const hitByName = new Map<string, { existing: typeof existingCompanies[number]; isGuess: boolean }>();
    for (const p of valid) {
      const coName = p.company?.trim();
      if (!coName) continue;
      const prev = hitByName.get(coName);
      if (prev && !prev.isGuess) continue;
      const hit = matchCompany(coName, existingCompanies, companyMatcher, p.email?.trim(), p.website?.trim(), nameDecisions);
      if (!hit) continue;
      const isGuess = hit.stage === 'fuzzy';
      if (!prev || !isGuess) hitByName.set(coName, { existing: hit.match, isGuess });
    }

    /*
     * Confident matches first, so that a company both named exactly by one row
     * and guessed at by another spelling has its field questions asked against
     * the name that is certainly it — `seenCoIds` below asks about each
     * company once, and this decides which name wins that slot.
     */
    const orderedHits: Array<[string, { existing: typeof existingCompanies[number]; isGuess: boolean }]> = [];
    hitByName.forEach((hit, coName) => { orderedHits.push([coName, hit]); });
    orderedHits.sort((a, b) => Number(a[1].isGuess) - Number(b[1].isGuess));

    for (const [coName, { existing, isGuess }] of orderedHits) {
      // A fuzzy hit is a guess, so it becomes a question rather than a match.
      // Asked once per uploaded name, with the attendee count attached — one
      // answer decides where all of them land.
      if (isGuess) {
        const normalized = deepNormalizeCompanyName(coName);
        if (!askedIdentity.has(normalized)) {
          askedIdentity.add(normalized);
          const affected = valid.filter(q => q.company?.trim() === coName).length;
          const who = `${affected} attendee${affected !== 1 ? 's' : ''}`;
          conflicts.push({
            entityType: 'company_identity',
            entityId: existing.id,
            entityName: coName,
            field: identityConflictField(normalized),
            fieldLabel: 'Company',
            currentValue: existing.name,
            proposedValue: `Add "${coName}" as a new company`,
            // "Same company" is a judgement about the two names; the label on
            // the other side names its OUTCOME, because that is the part a
            // reader cannot infer. Both captions then say where the attendees
            // land, which is the only thing this answer actually decides.
            acceptLabel: 'Same company',
            ignoreLabel: 'New company',
            // Yes puts them on the EXISTING company, in the left column.
            acceptShows: 'current',
            acceptCaption: `← ${who} ${affected === 1 ? 'joins' : 'join'} this company`,
            ignoreCaption: `← ${who} ${affected === 1 ? 'gets' : 'get'} a new one`,
            defaultResolution: 'ignore',
            detail: `${who} in this file · closest existing match`,
          });
        }
        /*
         * And then fall through to the field comparison below rather than
         * stopping here.
         *
         * Stopping was the bug. Answering "Same company" binds the uploaded
         * rows to this existing record, and the write path then applies the
         * file's values with COALESCE(?, field) — which takes the uploaded
         * value whenever there is one. So a company reached through a fuzzy
         * name had its stored Company Type (and website, CRM link, WSE)
         * overwritten by the file without anybody being asked, which is the
         * one thing this step exists to prevent.
         *
         * The rows are marked as conditional, since they only take effect if
         * the identity answer above was "Same company" — answered "New
         * company", the existing record is not touched and the answer is
         * inert.
         */
      }

      if (seenCoIds.has(existing.id)) continue;
      seenCoIds.add(existing.id);

      // Aggregate all file rows for this company to get the best proposed values
      const coRows = valid.filter(q => q.company?.trim() === coName);
      const proposedType = coRows.find(q => q.company_type?.trim())?.company_type?.trim() ?? null;
      const proposedWebsite = coRows.find(q => q.website?.trim())?.website?.trim() ?? null;
      const proposedCrmLink = coRows.find(q => q.crm_link?.trim())?.crm_link?.trim() ?? null;
      const rawWse = coRows.find(q => q.wse?.trim())?.wse?.trim() ?? null;
      const proposedWse = rawWse ? (parseInt(rawWse, 10) || null) : null;

      /*
       * One question per differing field. Three ways to have nothing to ask,
       * and they are the reason this is not simply "the two values differ":
       *
       *   the stored value is blank  → the file fills it in, nothing to decide
       *   the file's value is blank  → nothing is being proposed
       *   they are the same value    → compared trimmed and case-insensitively,
       *                                so "Operator" and "operator " agree
       */
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
          // Named for what it is: a question that only matters if the identity
          // question above was answered "Same company".
          detail: isGuess ? `Only if "${coName}" is this company` : undefined,
        });
      };

      checkCo('company_type', existing.company_type, proposedType);
      checkCo('website', existing.website, proposedWebsite);
      checkCo('crm_link', existing.crm_link, proposedCrmLink);
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
