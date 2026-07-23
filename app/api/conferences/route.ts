import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getConfigOptionValues } from '@/lib/db';
import { getDb } from '@/lib/getDb';
import type { Client } from '@libsql/client';
import { trackEvent } from '@/lib/trackEvent';
import { waitUntil } from '@vercel/functions';
import { sendNotificationEmail } from '@/lib/email';
import { parseFile, parseFileWithMapping, classifyCompanyType, matchConfigOption, type ColumnMapping } from '@/lib/parsers';
import { getIcpConfig, evaluateIcpRules } from '@/lib/icpRules';
import {
  buildCompanyMatcher,
  buildAttendeeMatcher,
  matchCompany,
  matchAttendee,
  confirmAttendeeMatch,
} from '@/lib/matching';
import { computeConferenceStage, type ConferenceStage } from '@/lib/conference-stage';
import { getInitials } from '@/lib/initials';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Row = Record<string, unknown>;

interface EnrichedRep { userId: number; displayName: string; initials: string }
interface EnrichedConference {
  id: number;
  stage: ConferenceStage | null;
  assignedReps: EnrichedRep[];
  outreachProgress: { assigned: number; total: number } | null;
  attendeeCount: number;
  hasAttendeeList: boolean;
  planDecision: string | null;
  [key: string]: unknown;
}
interface NeedsAttentionItem {
  type: 'missing_list' | 'unassigned_reps' | 'outreach_gap';
  conferenceId: number;
  conferenceName: string;
  message: string;
  urgency: 'high' | 'medium' | 'low';
  daysUntil: number | null;
}

// ?enriched=1 — powers the redesigned /conferences list page (stage grouping,
// rep avatars, outreach progress, needs-attention strip). Additive/opt-in:
// the default GET response stays a flat array exactly as before, since 5+
// other call sites (SetConferenceButton, ExpandedFormModal, NewMeetingModal,
// AssignFollowUpModal, NewNoteModal) and the ?nav=1 branch depend on that
// shape and shouldn't need to change for this feature.
async function getEnrichedConferences(db: Client) {
  const baseRes = await db.execute({
    sql: `SELECT c.*, cs.display_name as series_name, COUNT(ca.attendee_id) as attendee_count
          FROM conferences c
          LEFT JOIN conference_attendees ca ON c.id = ca.conference_id
          LEFT JOIN conference_series cs ON cs.id = c.series_id
          WHERE c.committed_to_program = 1
          GROUP BY c.id
          ORDER BY c.start_date DESC`,
    args: [],
  });
  const baseRows = baseRes.rows as Row[];
  const confIds = baseRows.map(r => Number(r.id));
  if (confIds.length === 0) {
    return NextResponse.json({ conferences: [], needsAttention: [] });
  }
  const ph = confIds.map(() => '?').join(',');
  const currentYear = new Date().getFullYear();

  const [plansRes, outreachRes, icpTotalRes] = await Promise.all([
    db.execute({
      sql: `SELECT conference_id, decision, assigned_rep_ids FROM conference_plans WHERE conference_id IN (${ph}) AND plan_year = ?`,
      args: [...confIds, currentYear],
    }),
    db.execute({
      sql: `SELECT conference_id, COUNT(DISTINCT company_id) as assigned_count FROM outreach_assignments WHERE conference_id IN (${ph}) GROUP BY conference_id`,
      args: confIds,
    }),
    db.execute({
      sql: `SELECT ca.conference_id, COUNT(DISTINCT c.id) as icp_total
            FROM conference_attendees ca
            JOIN attendees a ON ca.attendee_id = a.id
            JOIN companies c ON a.company_id = c.id
            WHERE ca.conference_id IN (${ph}) AND c.icp = 'Yes'
            GROUP BY ca.conference_id`,
      args: confIds,
    }),
  ]);

  // conference_plans.assigned_rep_ids stores config_options ids (category='user')
  // — the same rep roster every other assigned-rep feature in this app resolves
  // against (see app/api/program-planner/conferences/route.ts:170) — NOT the
  // `users` login-accounts table. sales_territories.assigned_user_ids uses this
  // same config_options id space, which the territory filter on the conferences
  // page depends on.
  type PlanRow = { decision: string | null; assignedRepIds: number[] };
  const planMap = new Map<number, PlanRow>();
  const allRepIds = new Set<number>();
  for (const r of plansRes.rows as Row[]) {
    let assignedRepIds: number[] = [];
    try {
      const parsed = JSON.parse(String(r.assigned_rep_ids ?? '[]'));
      if (Array.isArray(parsed)) assignedRepIds = parsed.map(Number).filter(n => !isNaN(n));
    } catch { /* ignore */ }
    assignedRepIds.forEach(id => allRepIds.add(id));
    planMap.set(Number(r.conference_id), { decision: r.decision ? String(r.decision) : null, assignedRepIds });
  }

  const repMap = new Map<number, EnrichedRep>();
  if (allRepIds.size > 0) {
    const repIdsArr = Array.from(allRepIds);
    const repPh = repIdsArr.map(() => '?').join(',');
    const repsRes = await db.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'user' AND id IN (${repPh})`,
      args: repIdsArr,
    });
    for (const r of repsRes.rows as Row[]) {
      const displayName = String(r.value);
      repMap.set(Number(r.id), { userId: Number(r.id), displayName, initials: getInitials(displayName) });
    }
  }

  const outreachAssignedMap = new Map<number, number>();
  for (const r of outreachRes.rows as Row[]) outreachAssignedMap.set(Number(r.conference_id), Number(r.assigned_count));
  const icpTotalMap = new Map<number, number>();
  for (const r of icpTotalRes.rows as Row[]) icpTotalMap.set(Number(r.conference_id), Number(r.icp_total));

  const nowMs = Date.now();
  const conferences: EnrichedConference[] = baseRows.map(r => {
    const confId = Number(r.id);
    const attendeeCount = Number(r.attendee_count ?? 0);
    const hasAttendeeList = attendeeCount > 0;
    const plan = planMap.get(confId);
    const assignedReps = (plan?.assignedRepIds ?? []).map(id => repMap.get(id)).filter((x): x is EnrichedRep => x != null);

    let stage: ConferenceStage | null = null;
    try {
      stage = computeConferenceStage({
        start_date: String(r.start_date),
        end_date: String(r.end_date),
        post_conference_days: r.post_conference_days != null ? Number(r.post_conference_days) : null,
        stage_override: r.stage_override ? String(r.stage_override) : null,
        is_historical: r.is_historical != null ? Number(r.is_historical) : null,
      }, nowMs);
    } catch {
      // Historical conferences have no lifecycle stage — still included in the
      // response (matches how the existing calendar page treats them), just
      // with stage: null. Excluded from needsAttention below.
      stage = null;
    }

    const outreachProgress = hasAttendeeList
      ? { assigned: outreachAssignedMap.get(confId) ?? 0, total: icpTotalMap.get(confId) ?? 0 }
      : null;

    return {
      ...r,
      id: confId,
      stage,
      assignedReps,
      outreachProgress,
      attendeeCount,
      hasAttendeeList,
      planDecision: plan?.decision ?? null,
    };
  });

  const needsAttention: NeedsAttentionItem[] = [];
  for (const c of conferences) {
    if (c.stage == null) continue;
    const daysUntil = Math.ceil((new Date(String(c.start_date) + 'T00:00:00').getTime() - nowMs) / 86_400_000);
    const daysUntilOrNull = daysUntil >= 0 ? daysUntil : null;
    const name = String(c.name);

    if (!c.hasAttendeeList && c.stage === 'planning') {
      const urgency: NeedsAttentionItem['urgency'] =
        daysUntilOrNull != null && daysUntilOrNull <= 30 ? 'high' : daysUntilOrNull != null && daysUntilOrNull <= 60 ? 'medium' : 'low';
      needsAttention.push({
        type: 'missing_list', conferenceId: c.id, conferenceName: name,
        message: 'Attendee list not uploaded', urgency, daysUntil: daysUntilOrNull,
      });
    }
    if (c.assignedReps.length === 0 && (c.stage === 'planning' || c.stage === 'in_progress')) {
      const urgency: NeedsAttentionItem['urgency'] = daysUntilOrNull != null && daysUntilOrNull <= 30 ? 'high' : 'medium';
      needsAttention.push({
        type: 'unassigned_reps', conferenceId: c.id, conferenceName: name,
        message: 'No reps assigned', urgency, daysUntil: daysUntilOrNull,
      });
    }
    if (c.outreachProgress && c.outreachProgress.assigned < c.outreachProgress.total && (c.stage === 'planning' || c.stage === 'in_progress')) {
      needsAttention.push({
        type: 'outreach_gap', conferenceId: c.id, conferenceName: name,
        message: `Outreach gap: ${c.outreachProgress.assigned}/${c.outreachProgress.total} companies assigned`,
        urgency: 'medium', daysUntil: daysUntilOrNull,
      });
    }
  }

  const URGENCY_ORDER: Record<NeedsAttentionItem['urgency'], number> = { high: 0, medium: 1, low: 2 };
  needsAttention.sort((a, b) => {
    const u = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (u !== 0) return u;
    const da = a.daysUntil ?? Infinity, db_ = b.daysUntil ?? Infinity;
    return da - db_;
  });

  return NextResponse.json({ conferences, needsAttention }, { headers: { 'Cache-Control': 'private, no-cache' } });
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    // ?nav=1 — lightweight query for the header navigation dropdown (no JOIN/COUNT).
    // Excludes conferences still only being evaluated in a future year's Plan tab
    // (committed_to_program = 0) — they don't have a real Conference Details
    // profile yet, so there's nowhere for this menu to send the user.
    if (request.nextUrl.searchParams.get('nav') === '1') {
      const result = await db.execute({
        sql: `SELECT id, name, start_date, end_date, internal_attendees FROM conferences WHERE committed_to_program = 1 ORDER BY start_date DESC`,
        args: [],
      });
      return NextResponse.json(result.rows.map((r) => ({ ...r })), {
        headers: { 'Cache-Control': 'private, no-cache' },
      });
    }
    if (request.nextUrl.searchParams.get('enriched') === '1') {
      return await getEnrichedConferences(db);
    }
    const result = await db.execute({
      sql: `SELECT c.*, cs.display_name as series_name, COUNT(ca.attendee_id) as attendee_count
            FROM conferences c
            LEFT JOIN conference_attendees ca ON c.id = ca.conference_id
            LEFT JOIN conference_series cs ON cs.id = c.series_id
            WHERE c.committed_to_program = 1
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

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const start_date = formData.get('start_date') as string;
    const end_date = formData.get('end_date') as string;
    const location = formData.get('location') as string;
    const location_place_id = (formData.get('location_place_id') as string | null) || null;
    const location_lat = formData.has('location_lat') ? Number(formData.get('location_lat')) : null;
    const location_lng = formData.has('location_lng') ? Number(formData.get('location_lng')) : null;
    const location_city = (formData.get('location_city') as string | null) || null;
    const location_state = (formData.get('location_state') as string | null) || null;
    const location_country = (formData.get('location_country') as string | null) || null;
    const location_timezone = (formData.get('location_timezone') as string | null) || null;
    const notes = formData.get('notes') as string | null;
    const internal_attendees = formData.get('internal_attendees') as string | null;
    const conference_strategy_type_id = formData.get('conference_strategy_type_id') as string | null;
    const is_historical = formData.get('is_historical') === '1';
    const series_id = (formData.get('series_id') as string | null) || null;
    const season_id = (formData.get('season_id') as string | null) || null;
    const industry_focus = (formData.get('industry_focus') as string | null) || null;
    const conference_type = (formData.get('conference_type') as string | null) || null;
    const website = (formData.get('website') as string | null) || null;
    const sponsorship_level = (formData.get('sponsorship_level') as string | null) || null;
    const booth_present = formData.get('booth_present') === '1' ? 1 : 0;
    const booth_width = booth_present ? (parseInt(formData.get('booth_width') as string) || null) : null;
    const booth_length = booth_present ? (parseInt(formData.get('booth_length') as string) || null) : null;
    const booth_number = booth_present ? ((formData.get('booth_number') as string | null) || null) : null;
    const booth_hall = booth_present ? ((formData.get('booth_hall') as string | null) || null) : null;
    const territory_scope = (formData.get('territory_scope') as string | null) || null;
    const territory_ids = territory_scope === 'regional' ? ((formData.get('territory_ids') as string | null) || '[]') : '[]';
    // Only the Plan tab's minimal Add-to-Plan flow sends '0' — every other
    // creation path (the main Add Conference form, historical imports) is a
    // real, committed conference from the moment it's created.
    const committed_to_program = formData.get('committed_to_program') === '0' ? 0 : 1;
    // Distinct from committed_to_program — stays true for this conference's
    // whole lifetime once set, since it flags "no prior-year history exists
    // at all," which committing doesn't change (see the commit route).
    const is_new_addition = formData.get('is_new_addition') === '1' ? 1 : 0;
    const file = formData.get('file') as File | null;
    const mappingJson = formData.get('mapping') as string | null;
    const mapping: ColumnMapping | null = mappingJson ? JSON.parse(mappingJson) as ColumnMapping : null;

    if (!name || !start_date || !end_date || !location || (!is_historical && !conference_strategy_type_id)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Look up default post-conference window from effectiveness_defaults
    let defaultPostConferenceDays = 10;
    try {
      const pcRow = await db.execute({
        sql: `SELECT value FROM effectiveness_defaults WHERE key = 'default_post_conference_days'`,
        args: [],
      });
      if (pcRow.rows[0]) {
        const parsed = parseInt(String(pcRow.rows[0].value), 10);
        if (Number.isFinite(parsed) && parsed > 0) defaultPostConferenceDays = parsed;
      }
    } catch { /* use default */ }

    // Create the conference record
    const confResult = await db.execute({
      sql: `INSERT INTO conferences
              (name, start_date, end_date, location,
               location_place_id, location_lat, location_lng, location_city, location_state, location_country, location_timezone,
               notes, internal_attendees, conference_strategy_type_id,
               is_historical, post_conference_days, series_id, season_id,
               industry_focus, conference_type, website, sponsorship_level,
               booth_present, booth_width, booth_length, booth_number, booth_hall,
               territory_scope, territory_ids, committed_to_program, is_new_addition)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [name, start_date, end_date, location,
             location_place_id, location_lat, location_lng, location_city, location_state, location_country, location_timezone,
             notes || null, internal_attendees || null,
             conference_strategy_type_id ? Number(conference_strategy_type_id) : null,
             is_historical ? 1 : 0, defaultPostConferenceDays, series_id, season_id,
             industry_focus, conference_type, website, sponsorship_level,
             booth_present, booth_width, booth_length, booth_number, booth_hall,
             territory_scope, territory_ids, committed_to_program, is_new_addition],
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

    // Sync industry_focus / conference_type up to the series (best-effort)
    if (series_id && (industry_focus || conference_type)) {
      const sets: string[] = [];
      const args: (string | null)[] = [];
      if (industry_focus) { sets.push('industry_focus = ?'); args.push(industry_focus); }
      if (conference_type) { sets.push('conference_type = ?'); args.push(conference_type); }
      args.push(series_id);
      await db.execute({ sql: `UPDATE conference_series SET ${sets.join(', ')} WHERE id = ?`, args }).catch(() => {});
    }

    const BACKGROUND_THRESHOLD = 5_000;
    const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';
    let parsedCount = 0;

    if (file && file.size > 0) {
      const [companyTypeOptions, servicesOptions, functionOptions, productOptions, icpOptions, icpConfig] = await Promise.all([
        getConfigOptionValues('company_type', db),
        getConfigOptionValues('services', db),
        getConfigOptionValues('function', db),
        getConfigOptionValues('products', db),
        getConfigOptionValues('icp', db),
        getIcpConfig(db),
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
        const run = async (bgJobId?: string): Promise<number> => {
        // ── Step 1: Load ALL existing companies and attendees in two queries ──
        const [existingCoRes, existingAtRes, userRows, usersWithConfig] = await Promise.all([
          db.execute({ sql: 'SELECT id, name, website, parent_company_id, assigned_user FROM companies', args: [] }),
          db.execute({
            sql: `SELECT a.id, a.first_name, a.last_name, a.email,
                         c.name AS company_name, c.website AS company_website
                  FROM attendees a
                  LEFT JOIN companies c ON a.company_id = c.id`,
            args: [],
          }),
          db.execute({ sql: 'SELECT id, value FROM config_options WHERE category = ? ORDER BY sort_order, value', args: ['user'] }),
          db.execute({ sql: 'SELECT config_id, display_name, email FROM users WHERE config_id IS NOT NULL', args: [] }),
        ]);

        // ── Step 1b: Build user resolution infrastructure (same as conference details upload) ──
        const userOptions: Array<{ id: number; value: string }> = userRows.rows.map(r => ({
          id: Number(r.id),
          value: String(r.value),
        }));
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
          value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[,.‘’`\-]/g, ' ').replace(/\s+/g, ' ').trim();
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
          return normalizeNameKey(`${parts.slice(1).join(' ')} ${parts[0]}`);
        };
        const splitOwnerTokens = (raw: string): string[] =>
          raw.split(/\s*(?:;|\||\/|&|\band\b)\s*/i).map(s => s.trim()).filter(Boolean);
        const userNameIndex = new Map<string, Set<number>>();
        for (const r of usersWithConfig.rows) {
          const id = Number(r.config_id);
          const display = String(r.display_name ?? '').trim();
          if (!id || !display) continue;
          const key = normalizeNameKey(display);
          if (key) {
            const set = userNameIndex.get(key) ?? new Set<number>();
            set.add(id);
            userNameIndex.set(key, set);
          }
        }
        const resolveUserId = (raw: string | undefined): string | null => {
          if (!raw?.trim()) return null;
          const ids = new Set<number>();
          for (const part of splitOwnerTokens(raw)) {
            const num = parseInt(part, 10);
            if (!isNaN(num) && userOptions.some(u => u.id === num)) { ids.add(num); continue; }
            const lower = part.toLowerCase();
            const exactMatch = userOptions.find(u => u.value.toLowerCase() === lower);
            if (exactMatch) { ids.add(exactMatch.id); continue; }
            const displayId = userDisplayNameMap.get(lower);
            if (displayId != null) { ids.add(displayId); continue; }
            const directKey = normalizeNameKey(part);
            const reversedKey = normalizeReversedNameKey(part);
            const directMatches = directKey ? userNameIndex.get(directKey) : null;
            const reversedMatches = reversedKey ? userNameIndex.get(reversedKey) : null;
            const merged = new Set<number>([
              ...(directMatches ? Array.from(directMatches) : []),
              ...(reversedMatches ? Array.from(reversedMatches) : []),
            ]);
            if (merged.size === 1) ids.add(Array.from(merged)[0]);
          }
          if (ids.size === 0) return null;
          return Array.from(ids).join(',');
        };

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
        const companyIcpMap = new Map<string, string>(); // company name -> icp from file
        const companyNameSet = new Set<string>();
        valid.forEach((p) => {
          if (p.company?.trim()) {
            companyNameSet.add(p.company.trim());
            if (p.company_type?.trim() && !companyTypeMap.has(p.company.trim())) {
              companyTypeMap.set(p.company.trim(), p.company_type.trim());
            }
            if (p.assigned_user?.trim() && !companyAssignedUserMap.has(p.company.trim())) {
              const resolved = resolveUserId(p.assigned_user.trim());
              if (resolved) companyAssignedUserMap.set(p.company.trim(), resolved);
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
            if (p.icp?.trim() && !companyIcpMap.has(p.company.trim())) {
              companyIcpMap.set(p.company.trim(), p.icp.trim());
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
          await batchInsert(db, Array.from(parentWseUpdates.entries()), ([parentId, wse]) => ({
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
          await batchInsert(db, existingToUpdate, (n) => {
            const coId = companyIdCache.get(n)!;
            const existingCompany = existingCompanies.find((c) => c.id === coId);
            // If the company already has 2 or more valid resolved user IDs, do not overwrite from the uploaded list
            const existingAssignedCount = existingCompany?.assigned_user
              ? existingCompany.assigned_user.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0).length
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
          const results = await batchInsert(db, newCoNames, (n) => {
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
        if (bgJobId) await db.execute({ sql: 'UPDATE upload_jobs SET processed_rows=? WHERE id=?', args: [Math.round(valid.length * 0.2), bgJobId] }).catch(() => {});

        // ── Step 3c: Compute ICP for all companies touched by this upload ──
        const affectedCompanyIds = Array.from(new Set(
          Array.from(companyIdCache.values())
            .filter((id) => id > 0)
            .concat(Array.from(parentWseUpdates.keys()))
        ));
        if (affectedCompanyIds.length > 0) {
          const placeholders = affectedCompanyIds.map(() => '?').join(',');
          const freshRows = await db.execute({
            sql: `SELECT id, company_type, wse, services, profit_type, entity_structure FROM companies WHERE id IN (${placeholders})`,
            args: affectedCompanyIds,
          });
          // Build reverse map: company id -> name for file ICP lookup
          const idToName = new Map<number, string>();
          for (const [coName, coId] of Array.from(companyIdCache.entries())) {
            if (coId > 0) idToName.set(coId, coName);
          }
          const falseValue = icpOptions[1] ?? 'No';
          const icpUpdates: Array<{ id: number; icp: string }> = [];
          for (const row of freshRows.rows) {
            const companyId = Number(row.id);
            const coName = idToName.get(companyId);
            const fileIcp = coName ? companyIcpMap.get(coName) : undefined;
            let icp: string;
            if (fileIcp) {
              const normalized = fileIcp.toLowerCase();
              if (normalized === 'yes' || normalized === 'true' || normalized === 'y' || normalized === '1') {
                icp = icpOptions[0] ?? 'Yes';
              } else if (normalized === 'no' || normalized === 'false' || normalized === 'n' || normalized === '0') {
                icp = falseValue;
              } else {
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
            const hasUpdate = (companyId && companyId > 0) || p.title?.trim() || p.email?.trim() || functionVal || productVal;
            if (hasUpdate) existingAttendeeUpdates.push({
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
          await batchInsert(db, existingAttendeeUpdates, (u) => ({
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
          const results = await batchInsert(db, newAttendees, (a) => ({
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
        if (bgJobId) await db.execute({ sql: 'UPDATE upload_jobs SET processed_rows=? WHERE id=?', args: [Math.round(valid.length * 0.7), bgJobId] }).catch(() => {});

        // ── Step 7: Batch-insert conference_attendees ──
        await batchInsert(db, attendeeIdsToLink, (aid) => ({
          sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
          args: [conferenceId, aid],
        }));
        if (bgJobId) await db.execute({ sql: 'UPDATE upload_jobs SET processed_rows=? WHERE id=?', args: [Math.round(valid.length * 0.95), bgJobId] }).catch(() => {});

        return attendeeIdsToLink.length;
        }; // end run()

        if (valid.length > BACKGROUND_THRESHOLD) {
          const jobId = crypto.randomUUID();
          await db.execute({
            sql: `INSERT INTO upload_jobs
                  (id, conference_id, conference_name, account_id, status, total_rows,
                   created_by_user_id, created_by_email)
                  VALUES (?, ?, ?, ?, 'processing', ?, ?, ?)`,
            args: [jobId, conferenceId, name, authResult.accountId ?? '', valid.length,
                   authResult.id, authResult.email],
          });
          waitUntil(
            run(jobId).then(async (count) => {
              await db.execute({
                sql: `UPDATE upload_jobs SET status='done', new_count=?, updated_count=0,
                      skipped_count=0, completed_at=datetime('now') WHERE id=?`,
                args: [count, jobId],
              });
              await db.execute({
                sql: `INSERT INTO notifications
                      (user_id, type, record_id, record_name, message, changed_by_email, entity_type, entity_id, is_read)
                      VALUES (?, 'conference', ?, ?, ?, ?, 'conference', ?, 0)`,
                args: [authResult.id, conferenceId, name,
                       `Upload complete: ${count} attendees imported`,
                       authResult.email, conferenceId],
              });
              await sendNotificationEmail(
                authResult.email,
                `${APP_NAME} - Upload Complete`,
                `Your attendee list for "${name}" has finished uploading: ${count} attendees imported.`,
                `${process.env.NEXT_PUBLIC_BASE_URL}/conferences/${conferenceId}`
              ).catch(() => {});
            }).catch(async (err) => {
              await db.execute({
                sql: `UPDATE upload_jobs SET status='error', error_message=?,
                      completed_at=datetime('now') WHERE id=?`,
                args: [String(err?.message ?? err), jobId],
              });
            })
          );
          trackEvent(authResult?.accountId, 'conference_created', authResult?.id).catch(() => {});
          return NextResponse.json(
            { ...conference, id: conferenceId, status: 'processing', job_id: jobId,
              conference_name: name, total_rows: valid.length },
            { status: 201 }
          );
        }

        parsedCount = await run();
      }
    }

    trackEvent(authResult?.accountId, 'conference_created', authResult?.id).catch(() => {});
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
