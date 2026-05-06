import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getIcpConfig } from '@/lib/icpRules';
import { resolveAttendeeTitleMetadata } from '@/lib/titleNormalizationRules';
import {
  DEFAULT_RECOMMENDED_ACTIONS,
  buildTargetingScoringConfig,
  scoreCompanyTarget,
  type PriorityValue,
  type RecommendedTargetAction,
  type TargetPriorityWeights,
  type TargetingAttendeeInput,
  type TargetingCompanyInput,
  type TargetingCompanySignals,
} from '@/lib/targeting/targetPriority';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function parseJson<T>(raw: unknown, fallback: T): T {
  try { return raw ? JSON.parse(String(raw)) as T : fallback; } catch { return fallback; }
}

function parseCsvIds(raw: unknown): number[] {
  return String(raw ?? '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
}

function normalizePriorityMap(raw: Record<string, PriorityValue>, labels: Map<number, string>): Record<string, PriorityValue> {
  const out: Record<string, PriorityValue> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    out[key] = value;
    const matchingId = Array.from(labels.entries()).find(([, label]) => label === key)?.[0];
    if (matchingId != null) out[String(matchingId)] = value;
  }
  return out;
}

function normalizeFunctionProductMap(raw: Record<string, string[]>, labels: Map<number, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    out[key] = value;
    const matchingId = Array.from(labels.entries()).find(([, label]) => label === key)?.[0];
    if (matchingId != null) out[String(matchingId)] = value;
  }
  return out;
}

function rowDateIsRecent(raw: unknown): boolean {
  if (!raw) return false;
  const t = new Date(String(raw)).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= 1000 * 60 * 60 * 24 * 180;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const conferenceId = Number(id);
  if (!Number.isFinite(conferenceId)) return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });

  try {
    await dbReady;
    const conferenceRes = await db.execute({ sql: 'SELECT id FROM conferences WHERE id = ?', args: [conferenceId] });
    if (conferenceRes.rows.length === 0) return NextResponse.json({ error: 'Conference not found' }, { status: 404 });

    const [settingsRes, seniorityRes, functionRes, actionsRes, prospectTypeRes] = await Promise.all([
      db.execute({ sql: 'SELECT key, value FROM site_settings', args: [] }),
      db.execute({ sql: "SELECT id, value FROM config_options WHERE category = 'seniority'", args: [] }),
      db.execute({ sql: "SELECT id, value FROM config_options WHERE category = 'function'", args: [] }),
      db.execute({ sql: "SELECT id, value, action_key FROM config_options WHERE category = 'target_recommended_action' ORDER BY sort_order, id", args: [] }).catch(() => ({ rows: [] as Row[] })),
      db.execute({
        sql: "SELECT id, value FROM config_options WHERE category = 'company_type' AND action_key = 'prospect' ORDER BY id LIMIT 1",
        args: [],
      }).catch(() => ({ rows: [] as Row[] })),
    ]);

    const settings: Record<string, string> = {};
    for (const r of settingsRes.rows) settings[String(r.key)] = String(r.value);

    const seniorityLabels = new Map<number, string>(seniorityRes.rows.map(r => [Number(r.id), String(r.value)]));
    const functionLabels = new Map<number, string>(functionRes.rows.map(r => [Number(r.id), String(r.value)]));
    const actionLabels = new Map<string, string>();
    for (const r of actionsRes.rows as Row[]) {
      const key = r.action_key ? String(r.action_key) : '';
      if (key) actionLabels.set(key, String(r.value));
    }
    const recommendedActions: RecommendedTargetAction[] = DEFAULT_RECOMMENDED_ACTIONS.map(a => ({ ...a, label: actionLabels.get(a.key) ?? a.label }));
    const prospectTypeId = prospectTypeRes.rows.length > 0 ? Number(prospectTypeRes.rows[0].id) : null;
    const prospectTypeIdValue = prospectTypeId == null || !Number.isFinite(prospectTypeId) ? null : String(prospectTypeId);
    const prospectTypeValue = prospectTypeRes.rows.length > 0 ? String(prospectTypeRes.rows[0].value ?? '') : '';

    const icpConfig = await getIcpConfig();
    const weights = parseJson<TargetPriorityWeights>(settings.icp_target_priority_weights, { icp_fit: 40, buyer_access: 30, relationship_leverage: 20, conference_opportunity: 10 });
    const config = buildTargetingScoringConfig({
      target_priority_weights: weights,
      recommended_actions: recommendedActions,
      seniority_priority: normalizePriorityMap(parseJson(settings.icp_seniority_priority, {}), seniorityLabels),
      function_priority: normalizePriorityMap(parseJson(settings.icp_function_priority, {}), functionLabels),
      function_product_mapping: normalizeFunctionProductMap(parseJson(settings.icp_function_product_mapping, {}), functionLabels),
      target_titles: parseJson(settings.icp_target_titles, []),
      decision_maker_titles: parseJson(settings.icp_decision_maker_titles, []),
      influencer_titles: parseJson(settings.icp_influencer_titles, []),
      exclusion_description: settings.icp_exclusion_description ?? '',
      include_new_companies: settings.icp_include_new_companies !== 'false',
      icp_config: icpConfig,
    });

    const requestedOffset = Math.max(0, Number(request.nextUrl.searchParams.get('offset') ?? 0) || 0);
    const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? 0) || 0;
    const batchMode = request.nextUrl.searchParams.get('batch') === '1' || requestedLimit > 0;
    const batchLimit = batchMode ? Math.max(1, Math.min(50, requestedLimit || 25)) : Number.MAX_SAFE_INTEGER;

    if (!prospectTypeIdValue) {
      return NextResponse.json({
        conference_id: conferenceId,
        generated_at: new Date().toISOString(),
        scoring_config: {
          target_priority_weights: config.target_priority_weights,
          tier_thresholds: config.tier_thresholds,
          recommended_actions: config.recommended_actions,
          target_company_type_id: null,
        },
        companies: [],
        pagination: {
          offset: batchMode ? requestedOffset : 0,
          limit: batchMode ? batchLimit : 0,
          total_companies: 0,
          returned: 0,
          has_more: false,
          next_offset: null,
        },
        unavailable_reason: 'Prospect company type is not configured.',
      });
    }

    const attendeesRes = await db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.seniority, a.company_id,
                   c.name as company_name, c.company_type, c.services, c.status, c.icp, c.wse, c.assigned_user
            FROM conference_attendees ca
            JOIN attendees a ON a.id = ca.attendee_id
            JOIN companies c ON c.id = a.company_id
            WHERE ca.conference_id = ?
              AND (c.company_type = ? OR LOWER(c.company_type) = LOWER(?))
            ORDER BY c.name, a.last_name, a.first_name`,
      args: [conferenceId, prospectTypeIdValue, prospectTypeValue],
    });

    const rawCompanyMap = new Map<number, { company: TargetingCompanyInput; attendeeRows: Row[] }>();
    for (const r of attendeesRes.rows as Row[]) {
      const companyId = r.company_id == null ? 0 : Number(r.company_id);
      if (!companyId) continue;
      if (!rawCompanyMap.has(companyId)) {
        rawCompanyMap.set(companyId, {
          company: {
            id: companyId,
            name: String(r.company_name ?? 'Unknown Company'),
            company_type: r.company_type ? String(r.company_type) : null,
            services: r.services ? String(r.services) : null,
            status: r.status ? String(r.status) : null,
            icp: r.icp ? String(r.icp) : null,
            wse: r.wse == null ? null : Number(r.wse),
            assigned_user: r.assigned_user ? String(r.assigned_user) : null,
          },
          attendeeRows: [],
        });
      }
      rawCompanyMap.get(companyId)!.attendeeRows.push(r);
    }

    const allCompanyEntries = Array.from(rawCompanyMap.values()).sort((a, b) => a.company.name.localeCompare(b.company.name));
    const totalCompanies = allCompanyEntries.length;
    const selectedCompanyEntries = batchMode
      ? allCompanyEntries.slice(requestedOffset, requestedOffset + batchLimit)
      : allCompanyEntries;

    const companyMap = new Map<number, { company: TargetingCompanyInput; attendees: TargetingAttendeeInput[] }>();
    await Promise.all(selectedCompanyEntries.map(async ({ company, attendeeRows }) => {
      const attendees = await Promise.all(attendeeRows.map(async (r): Promise<TargetingAttendeeInput> => {
        const titleMeta = await resolveAttendeeTitleMetadata(r.title ? String(r.title) : null, null);
        return {
          id: Number(r.id),
          first_name: r.first_name ? String(r.first_name) : '',
          last_name: r.last_name ? String(r.last_name) : '',
          title: r.title ? String(r.title) : null,
          seniority: r.seniority == null ? null : String(r.seniority),
          company_id: company.id,
          normalized_title_metadata: titleMeta,
        };
      }));
      companyMap.set(company.id, { company, attendees });
    }));

    const companyIds = Array.from(companyMap.keys());
    const attendeeIds = Array.from(companyMap.values()).flatMap(v => v.attendees.map((a: TargetingAttendeeInput) => a.id));
    const signalsByCompany = new Map<number, TargetingCompanySignals>();
    for (const cid of companyIds) signalsByCompany.set(cid, {});

    if (companyIds.length > 0) {
      const placeholders = companyIds.map(() => '?').join(',');
      const [relsRes, notesRes] = await Promise.all([
        db.execute({ sql: `SELECT company_id, rep_ids, description FROM internal_relationships WHERE company_id IN (${placeholders})`, args: companyIds }).catch(() => ({ rows: [] as Row[] })),
        db.execute({ sql: `SELECT entity_id as company_id, content, created_at FROM entity_notes WHERE entity_type = 'company' AND entity_id IN (${placeholders})`, args: companyIds }).catch(() => ({ rows: [] as Row[] })),
      ]);
      for (const r of relsRes.rows as Row[]) {
        const cid = Number(r.company_id);
        const s = signalsByCompany.get(cid) ?? {};
        s.internal_relationship_count = (s.internal_relationship_count ?? 0) + 1;
        s.relationship_notes = [...(s.relationship_notes ?? []), String(r.description ?? '').trim()].filter(Boolean).slice(0, 3);
        s.associated_reps = Array.from(new Set([...(s.associated_reps ?? []), ...parseCsvIds(r.rep_ids).map(String)]));
        s.is_known_prospect = true;
        signalsByCompany.set(cid, s);
      }
      for (const r of notesRes.rows as Row[]) {
        const cid = Number(r.company_id);
        const s = signalsByCompany.get(cid) ?? {};
        s.recent_note_count = (s.recent_note_count ?? 0) + (rowDateIsRecent(r.created_at) ? 1 : 0);
        s.prior_touchpoint_count = (s.prior_touchpoint_count ?? 0) + 1;
        s.is_known_prospect = true;
        signalsByCompany.set(cid, s);
      }
    }

    if (attendeeIds.length > 0) {
      const placeholders = attendeeIds.map(() => '?').join(',');
      const [meetingsRes, priorConfsRes, socialRes] = await Promise.all([
        db.execute({ sql: `SELECT a.company_id, m.conference_id, COUNT(m.id) as cnt FROM meetings m JOIN attendees a ON a.id = m.attendee_id WHERE m.attendee_id IN (${placeholders}) GROUP BY a.company_id, m.conference_id`, args: attendeeIds }).catch(() => ({ rows: [] as Row[] })),
        db.execute({ sql: `SELECT a.company_id, ca.conference_id, COUNT(*) as cnt FROM conference_attendees ca JOIN attendees a ON a.id = ca.attendee_id WHERE ca.attendee_id IN (${placeholders}) AND ca.conference_id != ? GROUP BY a.company_id, ca.conference_id`, args: [...attendeeIds, conferenceId] }).catch(() => ({ rows: [] as Row[] })),
        db.execute({ sql: `SELECT a.company_id, COUNT(*) as cnt FROM social_event_rsvps ser JOIN social_events se ON se.id = ser.social_event_id JOIN attendees a ON a.id = ser.attendee_id WHERE ser.attendee_id IN (${placeholders}) AND se.conference_id = ? GROUP BY a.company_id`, args: [...attendeeIds, conferenceId] }).catch(() => ({ rows: [] as Row[] })),
      ]);
      for (const r of meetingsRes.rows as Row[]) {
        const cid = Number(r.company_id);
        const s = signalsByCompany.get(cid) ?? {};
        const cnt = Number(r.cnt ?? 0);
        if (Number(r.conference_id) === conferenceId) s.scheduled_meeting_count = (s.scheduled_meeting_count ?? 0) + cnt;
        else s.prior_meeting_count = (s.prior_meeting_count ?? 0) + cnt;
        s.is_known_prospect = true;
        signalsByCompany.set(cid, s);
      }
      for (const r of priorConfsRes.rows as Row[]) {
        const cid = Number(r.company_id);
        const s = signalsByCompany.get(cid) ?? {};
        s.prior_conference_overlap_count = (s.prior_conference_overlap_count ?? 0) + Number(r.cnt ?? 0);
        s.is_known_prospect = true;
        signalsByCompany.set(cid, s);
      }
      for (const r of socialRes.rows as Row[]) {
        const cid = Number(r.company_id);
        const s = signalsByCompany.get(cid) ?? {};
        s.hosted_event_count = (s.hosted_event_count ?? 0) + Number(r.cnt ?? 0);
        signalsByCompany.set(cid, s);
      }
    }

    const companies = Array.from(companyMap.values()).map(({ company, attendees }) => {
      const signals = signalsByCompany.get(company.id) ?? {};
      signals.has_existing_status = Boolean(company.status && normalizeString(company.status) !== 'unknown');
      return scoreCompanyTarget({ company, attendees, signals, config, functionLabels, seniorityLabels });
    }).sort((a, b) => b.target_priority_score - a.target_priority_score);

    return NextResponse.json({
      conference_id: conferenceId,
      generated_at: new Date().toISOString(),
      scoring_config: {
        target_priority_weights: config.target_priority_weights,
        tier_thresholds: config.tier_thresholds,
        recommended_actions: config.recommended_actions,
        target_company_type_id: prospectTypeId,
      },
      companies,
      pagination: {
        offset: batchMode ? requestedOffset : 0,
        limit: batchMode ? batchLimit : totalCompanies,
        total_companies: totalCompanies,
        returned: companies.length,
        has_more: batchMode ? requestedOffset + batchLimit < totalCompanies : false,
        next_offset: batchMode && requestedOffset + batchLimit < totalCompanies ? requestedOffset + batchLimit : null,
      },
      unavailable_reason: totalCompanies === 0 ? 'No conference attendees with companies were found.' : undefined,
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/targeting error:', error);
    return NextResponse.json({ error: 'Failed to calculate targeting scores' }, { status: 500 });
  }
}

function normalizeString(raw: string): string {
  return raw.trim().toLowerCase();
}
