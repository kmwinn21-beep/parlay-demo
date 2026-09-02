import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getMeetingHeld, isMeetingHeld } from '@/lib/meetingHeld';

export const dynamic = 'force-dynamic';

/**
 * Every conference one attendee or one company has been to, with what happened
 * at each — the data behind the Conference Timeline on both record pages.
 *
 * One endpoint rather than two because the two views differ only in scope: an
 * attendee counts their own activity, a company counts the same things across
 * all of its attendees. Splitting them would have meant maintaining the same
 * four aggregations twice and letting them drift.
 *
 * Everything is fetched in a handful of queries over the whole set of
 * conferences and grouped in memory, rather than a query per conference —
 * a record with twenty conferences would otherwise cost eighty round trips.
 */

export interface TimelineBreakdown {
  label: string;
  count: number;
}

export interface TimelineItem {
  key: 'internal_attendees' | 'meetings' | 'touchpoints' | 'event_attendees';
  title: string;
  count: number;
  /** Rendered as "Label: n", bullet-separated, under the title. */
  breakdown: TimelineBreakdown[];
  /** Used where the subtext is a list of names rather than counts. */
  names?: string[];
}

export interface TimelineConference {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  logo_url: string | null;
  upcoming: boolean;
  items: TimelineItem[];
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * City and state only.
 *
 * The structured columns are used where the location came from the autocomplete
 * and are authoritative. Where it was typed by hand, the free-text field can be
 * anything from "Atlanta, GA" to a full street address, so the last two
 * comma-separated parts are taken and a trailing postcode dropped — that lands
 * on city and state for the address shapes this field actually holds, and a
 * value already in the short form passes through unchanged.
 */
function cityState(location: string | null, city: string | null, state: string | null): string | null {
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  const raw = String(location ?? '').trim();
  if (!raw) return state || null;

  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];

  let last = parts[parts.length - 1];
  // "GA 30301" or "GA 30301-1234", and a trailing country the picker appends.
  if (/^(usa|united states|us)$/i.test(last) && parts.length >= 3) {
    parts.pop();
    last = parts[parts.length - 1];
  }
  last = last.replace(/\s+\d{5}(-\d{4})?$/, '').trim();
  const secondLast = parts[parts.length - 2];
  return last ? `${secondLast}, ${last}` : secondLast;
}

/** Ordered by count, then alphabetically, so the subtext reads the same twice. */
function toBreakdown(counts: Map<string, number>): TimelineBreakdown[] {
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const entityType = request.nextUrl.searchParams.get('entity_type');
  const entityId = Number(request.nextUrl.searchParams.get('entity_id'));
  if ((entityType !== 'attendee' && entityType !== 'company') || !entityId || isNaN(entityId)) {
    return NextResponse.json({ error: 'entity_type and entity_id are required' }, { status: 400 });
  }
  const isCompany = entityType === 'company';

  try {
    // The attendees whose activity counts: one person, or everyone at the company.
    const scopeRes = await db.execute(
      isCompany
        ? { sql: 'SELECT id FROM attendees WHERE company_id = ?', args: [entityId] }
        : { sql: 'SELECT id FROM attendees WHERE id = ?', args: [entityId] },
    );
    const attendeeIds = scopeRes.rows.map(r => Number(r.id));
    if (attendeeIds.length === 0) {
      return NextResponse.json({ conferences: [], attendeeCount: 0 });
    }
    const inAttendees = attendeeIds.map(() => '?').join(',');

    const confRes = await db.execute({
      sql: `SELECT DISTINCT c.id, c.name, c.start_date, c.end_date, c.location, c.logo_url,
                   c.location_city, c.location_state, c.internal_attendees
            FROM conferences c
            JOIN conference_attendees ca ON ca.conference_id = c.id
            WHERE ca.attendee_id IN (${inAttendees})
            ORDER BY c.start_date DESC`,
      args: attendeeIds,
    });
    if (confRes.rows.length === 0) {
      return NextResponse.json({ conferences: [], attendeeCount: 0 });
    }
    const confIds = confRes.rows.map(r => Number(r.id));
    const inConfs = confIds.map(() => '?').join(',');

    // How many of the scoped attendees actually appear at these conferences —
    // the company header's second number. The company may hold records that
    // have never been to one.
    const presentRes = await db.execute({
      sql: `SELECT COUNT(DISTINCT attendee_id) AS n FROM conference_attendees
            WHERE attendee_id IN (${inAttendees}) AND conference_id IN (${inConfs})`,
      args: [...attendeeIds, ...confIds],
    });
    const attendeeCount = Number(presentRes.rows[0]?.n ?? 0);

    const held = await getMeetingHeld(db);

    // internal_attendees stores comma-separated config_options ids, not names,
    // so the subtext needs the lookup. Anything that doesn't resolve is passed
    // through as written — older rows hold raw names.
    const userRes = await db.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'user'`,
      args: [],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const userNames = new Map<string, string>();
    for (const u of userRes.rows) userNames.set(String(u.id), String(u.value ?? ''));

    const [meetingsRes, touchRes, eventsRes] = await Promise.all([
      // Company type travels with the meeting so the company view can group by
      // it; meeting_type is what the attendee view groups by.
      db.execute({
        sql: `SELECT m.conference_id, m.outcome, m.meeting_type, co.company_type
              FROM meetings m
              JOIN attendees a ON a.id = m.attendee_id
              LEFT JOIN companies co ON co.id = a.company_id
              WHERE m.attendee_id IN (${inAttendees}) AND m.conference_id IN (${inConfs})`,
        args: [...attendeeIds, ...confIds],
      }),
      db.execute({
        sql: `SELECT t.conference_id, o.value AS label
              FROM attendee_touchpoints t
              LEFT JOIN config_options o ON o.id = t.option_id
              WHERE t.attendee_id IN (${inAttendees}) AND t.conference_id IN (${inConfs})`,
        args: [...attendeeIds, ...confIds],
      }),
      // Only company-hosted events, and only people actually marked attended.
      // rsvp_status is a comma-separated set, so "yes,attended" counts.
      db.execute({
        sql: `SELECT e.conference_id, e.event_name, r.attendee_id, r.rsvp_status
              FROM social_event_rsvps r
              JOIN social_events e ON e.id = r.social_event_id
              WHERE e.company_hosted = 1
                AND r.attendee_id IN (${inAttendees})
                AND e.conference_id IN (${inConfs})`,
        args: [...attendeeIds, ...confIds],
      }),
    ]);

    const meetingsByConf = new Map<number, Map<string, number>>();
    const meetingTotals = new Map<number, number>();
    for (const row of meetingsRes.rows) {
      if (!isMeetingHeld(row.outcome as string | null, held)) continue;
      const cid = Number(row.conference_id);
      // A company can carry several types; each is its own bucket, which is
      // how every other company-type reading in the app treats them.
      const labels = isCompany
        ? String(row.company_type ?? '').split(',').map(s => s.trim()).filter(Boolean)
        : [String(row.meeting_type ?? '').trim()].filter(Boolean);
      const bucket = meetingsByConf.get(cid) ?? new Map<string, number>();
      for (const label of (labels.length > 0 ? labels : ['Unspecified'])) {
        bucket.set(label, (bucket.get(label) ?? 0) + 1);
      }
      meetingsByConf.set(cid, bucket);
      meetingTotals.set(cid, (meetingTotals.get(cid) ?? 0) + 1);
    }

    const touchByConf = new Map<number, Map<string, number>>();
    const touchTotals = new Map<number, number>();
    for (const row of touchRes.rows) {
      const cid = Number(row.conference_id);
      const label = String(row.label ?? '').trim() || 'Other';
      const bucket = touchByConf.get(cid) ?? new Map<string, number>();
      bucket.set(label, (bucket.get(label) ?? 0) + 1);
      touchByConf.set(cid, bucket);
      touchTotals.set(cid, (touchTotals.get(cid) ?? 0) + 1);
    }

    const eventsByConf = new Map<number, Map<string, Set<number>>>();
    for (const row of eventsRes.rows) {
      const statuses = String(row.rsvp_status ?? '').split(',').map(s => s.trim());
      if (!statuses.includes('attended')) continue;
      const cid = Number(row.conference_id);
      const name = String(row.event_name ?? '').trim() || 'Hosted event';
      const bucket = eventsByConf.get(cid) ?? new Map<string, Set<number>>();
      const set = bucket.get(name) ?? new Set<number>();
      set.add(Number(row.attendee_id));
      bucket.set(name, set);
      eventsByConf.set(cid, bucket);
    }

    const today = ymd(new Date());

    const conferences: TimelineConference[] = confRes.rows.map(row => {
      const cid = Number(row.id);
      const items: TimelineItem[] = [];

      // Internal attendees are a property of the conference, not of anyone's
      // activity at it, so they only belong on the company view.
      if (isCompany) {
        const names = String(row.internal_attendees ?? '')
          .split(',').map(s => s.trim()).filter(Boolean)
          .map(token => userNames.get(token) ?? token)
          .filter(Boolean);
        if (names.length > 0) {
          items.push({ key: 'internal_attendees', title: 'Internal Attendees', count: names.length, breakdown: [], names });
        }
      }

      const meetings = meetingTotals.get(cid) ?? 0;
      if (meetings > 0) {
        items.push({
          key: 'meetings',
          title: 'Meetings Held',
          count: meetings,
          breakdown: toBreakdown(meetingsByConf.get(cid) ?? new Map()),
        });
      }

      const touchpoints = touchTotals.get(cid) ?? 0;
      if (touchpoints > 0) {
        items.push({
          key: 'touchpoints',
          title: 'Touchpoints',
          count: touchpoints,
          breakdown: toBreakdown(touchByConf.get(cid) ?? new Map()),
        });
      }

      const perEvent = eventsByConf.get(cid);
      if (perEvent && perEvent.size > 0) {
        const breakdown = toBreakdown(new Map(Array.from(perEvent.entries()).map(([n, s]) => [n, s.size])));
        // Counted across events rather than deduplicated across them: someone
        // at two hosted events attended two of them.
        const total = breakdown.reduce((sum, b) => sum + b.count, 0);
        items.push({ key: 'event_attendees', title: 'Event Attendees', count: total, breakdown });
      }

      const end = row.end_date ? String(row.end_date) : null;
      const start = row.start_date ? String(row.start_date) : null;

      return {
        id: cid,
        name: String(row.name ?? ''),
        start_date: start,
        end_date: end,
        location: cityState(
          row.location ? String(row.location) : null,
          row.location_city ? String(row.location_city) : null,
          row.location_state ? String(row.location_state) : null,
        ),
        logo_url: row.logo_url ? String(row.logo_url) : null,
        // Still running counts as upcoming: nothing about it is final yet.
        upcoming: (end ?? start ?? '') >= today,
        items,
      };
    });

    return NextResponse.json({ conferences, attendeeCount });
  } catch (error) {
    console.error('GET /api/conference-timeline error:', error);
    return NextResponse.json({ error: 'Failed to load conference timeline' }, { status: 500 });
  }
}
