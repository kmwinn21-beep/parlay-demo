import { Suspense } from 'react';
import type { Client } from '@libsql/client';
import Link from 'next/link';
import { dbReady } from '@/lib/db';
import { getDb } from '@/lib/getDb';
import { QuickNotesSection } from '@/components/QuickNotesSection';
import { getServerSessionUser } from '@/lib/auth';
import { DashboardConferenceBanner, type BannerData } from '@/components/DashboardConferenceBanner';
import { DashboardOpenFollowUps, type OpenFollowUp } from '@/components/DashboardOpenFollowUps';
import { RecentSection, type DashboardConference } from '@/components/RecentSection';
import { DashboardTargetsSection } from '@/components/DashboardTargetsSection';
import { DashboardActionCard } from '@/components/DashboardActionCard';
import { UpgradeSuccessBanner } from '@/components/UpgradeSuccessBanner';
export const dynamic = 'force-dynamic';

async function getUserDisplayName(tenantDb: Client, userId: number): Promise<string> {
  try {
    const r = await tenantDb.execute({
      sql: 'SELECT co.value AS display_name FROM users u JOIN config_options co ON u.config_id = co.id WHERE u.id = ?',
      args: [userId],
    });
    return r.rows[0] ? String(r.rows[0].display_name ?? '').trim() : '';
  } catch { return ''; }
}

async function getBannerData(tenantDb: Client, userId: number): Promise<BannerData> {
  await dbReady;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const displayName = await getUserDisplayName(tenantDb, userId);
    const displayNameLower = displayName.toLowerCase();

    // Find active conference where user is internal attendee
    const activeRes = await tenantDb.execute({
      sql: `SELECT id, name, start_date, end_date, location FROM conferences
            WHERE start_date <= ? AND end_date >= ?
              AND LOWER(',' || COALESCE(internal_attendees,'') || ',') LIKE ?
            ORDER BY start_date ASC LIMIT 1`,
      args: [today, today, `%,${displayNameLower},%`],
    });

    if (activeRes.rows[0]) {
      const conf = activeRes.rows[0];
      const confId = Number(conf.id);
      const startDate = String(conf.start_date);
      const endDate = String(conf.end_date);
      const dayNumber = Math.floor((new Date(today).getTime() - new Date(startDate + 'T00:00:00').getTime()) / 86400000) + 1;
      const totalDays = Math.floor((new Date(endDate + 'T00:00:00').getTime() - new Date(startDate + 'T00:00:00').getTime()) / 86400000) + 1;

      // Parallel queries for stats + today's meetings
      const [companiesRes, meetingsHeldRes, touchpointsRes, unengagedRes, todayMeetingsRes] = await Promise.all([
        tenantDb.execute({
          sql: `SELECT COUNT(DISTINCT company_id) as cnt FROM (
                  SELECT a.company_id FROM meetings m JOIN attendees a ON m.attendee_id = a.id WHERE m.conference_id = ? AND a.company_id IS NOT NULL
                  UNION
                  SELECT a.company_id FROM attendee_touchpoints tp JOIN attendees a ON tp.attendee_id = a.id WHERE tp.conference_id = ? AND a.company_id IS NOT NULL
                )`,
          args: [confId, confId],
        }).catch(() => ({ rows: [{ cnt: 0 }] })),
        tenantDb.execute({
          sql: `SELECT COUNT(*) as cnt FROM meetings m
                JOIN config_options cop ON cop.category = 'action' AND LOWER(m.outcome) = LOWER(cop.value)
                WHERE m.conference_id = ? AND cop.action_key = 'meeting_held'`,
          args: [confId],
        }).catch(() => ({ rows: [{ cnt: 0 }] })),
        tenantDb.execute({
          sql: `SELECT COUNT(*) as cnt FROM attendee_touchpoints WHERE conference_id = ?`,
          args: [confId],
        }).catch(() => ({ rows: [{ cnt: 0 }] })),
        tenantDb.execute({
          sql: `SELECT COUNT(DISTINCT a.company_id) as cnt
                FROM conference_targets ct JOIN attendees a ON ct.attendee_id = a.id
                WHERE ct.conference_id = ? AND ct.tier = '1' AND a.company_id IS NOT NULL
                  AND a.company_id NOT IN (
                    SELECT att.company_id FROM meetings m JOIN attendees att ON m.attendee_id = att.id
                    WHERE m.conference_id = ? AND att.company_id IS NOT NULL
                    UNION
                    SELECT att.company_id FROM attendee_touchpoints tp JOIN attendees att ON tp.attendee_id = att.id
                    WHERE tp.conference_id = ? AND att.company_id IS NOT NULL
                  )`,
          args: [confId, confId, confId],
        }).catch(() => ({ rows: [{ cnt: 0 }] })),
        tenantDb.execute({
          sql: `SELECT m.id, m.meeting_time, m.outcome, m.location,
                       a.first_name, a.last_name, co.name AS company_name
                FROM meetings m
                JOIN attendees a ON m.attendee_id = a.id
                LEFT JOIN companies co ON a.company_id = co.id
                WHERE m.conference_id = ? AND m.meeting_date = ?
                ORDER BY m.meeting_time ASC`,
          args: [confId, today],
        }).catch(() => ({ rows: [] })),
      ]);

      return {
        state: 'active',
        conference: { id: confId, name: String(conf.name), start_date: startDate, end_date: endDate, location: conf.location ? String(conf.location) : null },
        dayNumber,
        totalDays,
        stats: {
          companiesEngaged: Number((companiesRes.rows[0] as { cnt?: unknown })?.cnt ?? 0),
          meetingsHeld: Number((meetingsHeldRes.rows[0] as { cnt?: unknown })?.cnt ?? 0),
          touchpoints: Number((touchpointsRes.rows[0] as { cnt?: unknown })?.cnt ?? 0),
          mustTargetUnengaged: Number((unengagedRes.rows[0] as { cnt?: unknown })?.cnt ?? 0),
        },
        todayMeetings: todayMeetingsRes.rows.map(r => ({
          id: Number(r.id),
          meeting_time: String(r.meeting_time ?? ''),
          outcome: r.outcome ? String(r.outcome) : null,
          location: r.location ? String(r.location) : null,
          attendee_first_name: String(r.first_name ?? ''),
          attendee_last_name: String(r.last_name ?? ''),
          company_name: r.company_name ? String(r.company_name) : null,
        })),
      };
    }

    // No active conference — find next upcoming where user is internal attendee
    const upcomingRes = await tenantDb.execute({
      sql: `SELECT id, name, start_date, end_date, location FROM conferences
            WHERE start_date > ?
              AND LOWER(',' || COALESCE(internal_attendees,'') || ',') LIKE ?
            ORDER BY start_date ASC LIMIT 1`,
      args: [today, `%,${displayNameLower},%`],
    });

    if (upcomingRes.rows[0]) {
      const conf = upcomingRes.rows[0];
      const confId = Number(conf.id);
      const startDate = String(conf.start_date);
      const daysUntil = Math.ceil((new Date(startDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);

      const [attendeeCountRes, icpRes, targetsRes, meetingsRes] = await Promise.all([
        tenantDb.execute({ sql: `SELECT COUNT(*) as cnt FROM conference_attendees WHERE conference_id = ?`, args: [confId] }).catch(() => ({ rows: [{ cnt: 0 }] })),
        tenantDb.execute({ sql: `SELECT COUNT(*) as cnt FROM icp_rules`, args: [] }).catch(() => ({ rows: [{ cnt: 0 }] })),
        tenantDb.execute({ sql: `SELECT COUNT(*) as cnt FROM conference_targets WHERE conference_id = ? AND tier != 'unassigned'`, args: [confId] }).catch(() => ({ rows: [{ cnt: 0 }] })),
        tenantDb.execute({ sql: `SELECT COUNT(*) as cnt FROM meetings WHERE conference_id = ?`, args: [confId] }).catch(() => ({ rows: [{ cnt: 0 }] })),
      ]);

      const attendeeCount = Number((attendeeCountRes.rows[0] as { cnt?: unknown })?.cnt ?? 0);

      const prepChecklist = {
        attendeesUploaded: attendeeCount > 0,
        icpConfigured: Number((icpRes.rows[0] as { cnt?: unknown })?.cnt ?? 0) > 0,
        targetsSet: Number((targetsRes.rows[0] as { cnt?: unknown })?.cnt ?? 0) > 0,
        preConferenceReview: false,
        meetingsScheduled: Number((meetingsRes.rows[0] as { cnt?: unknown })?.cnt ?? 0) > 0,
      };

      return {
        state: 'upcoming',
        conference: { id: confId, name: String(conf.name), start_date: startDate, end_date: String(conf.end_date ?? ''), location: conf.location ? String(conf.location) : null },
        daysUntil,
        attendeeCount,
        mustTargetCount: 0,
        prepChecklist,
      };
    }

    return { state: 'none' };
  } catch (e) {
    console.error('getBannerData error:', e);
    return { state: 'none' };
  }
}

async function getOpenFollowUps(tenantDb: Client): Promise<OpenFollowUp[]> {
  await dbReady;
  try {
    const result = await tenantDb.execute({
      sql: `SELECT fu.id, fu.next_steps, fu.completed, fu.conference_id,
                   a.first_name, a.last_name, co.name AS company_name,
                   c.name AS conference_name, c.end_date AS conference_end_date
            FROM follow_ups fu
            JOIN attendees a ON fu.attendee_id = a.id
            LEFT JOIN companies co ON a.company_id = co.id
            JOIN conferences c ON fu.conference_id = c.id
            WHERE fu.completed = 0 AND fu.next_steps IS NOT NULL AND fu.next_steps != ''
            ORDER BY c.end_date ASC, fu.rowid ASC`,
      args: [],
    });
    return result.rows.map(r => ({
      id: Number(r.id),
      next_steps: String(r.next_steps ?? ''),
      completed: false,
      conference_id: Number(r.conference_id),
      first_name: String(r.first_name ?? ''),
      last_name: String(r.last_name ?? ''),
      company_name: r.company_name ? String(r.company_name) : null,
      conference_name: String(r.conference_name ?? ''),
      conference_end_date: String(r.conference_end_date ?? ''),
    }));
  } catch { return []; }
}

async function getAwaitingUploadConferences(tenantDb: Client): Promise<{ id: number; name: string; start_date: string; end_date: string; location: string; internal_attendees: string[]; attendee_count: number }[]> {
  await dbReady;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await tenantDb.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location, c.internal_attendees,
            (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) as attendee_count
          FROM conferences c
          WHERE c.start_date >= ?
            AND (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) = 0
          ORDER BY c.start_date ASC`,
    args: [today],
  });
    return result.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      start_date: String(r.start_date ?? ''),
      end_date: String(r.end_date ?? ''),
      location: String(r.location ?? ''),
      internal_attendees: r.internal_attendees ? String(r.internal_attendees).split(',').map(s => s.trim()).filter(Boolean) : [],
      attendee_count: Number(r.attendee_count ?? 0),
    }));
  } catch {
    return [];
  }
}

async function getAllConferences(tenantDb: Client): Promise<DashboardConference[]> {
  await dbReady;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await tenantDb.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location, c.internal_attendees,
            (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) as attendee_count
          FROM conferences c
          WHERE (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) > 0
          ORDER BY c.start_date DESC`,
    args: [],
  });
    return result.rows.map((r) => {
    const startDate = String(r.start_date ?? '');
    const endDate = String(r.end_date ?? '');
    const status: 'in_progress' | 'upcoming' | 'past' =
      startDate <= today && endDate >= today ? 'in_progress' :
      endDate >= today ? 'upcoming' : 'past';
    return {
      id: Number(r.id),
      name: String(r.name ?? ''),
      start_date: startDate,
      end_date: endDate,
      location: String(r.location ?? ''),
      internal_attendees: r.internal_attendees ? String(r.internal_attendees).split(',').map(s => s.trim()).filter(Boolean) : [],
      attendee_count: Number(r.attendee_count ?? 0),
      status,
    };
    });
  } catch {
    return [];
  }
}

/* ---------- Skeleton components for Suspense fallbacks ---------- */

function StatsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2 rounded-2xl bg-gray-300 h-36" />
        <div className="card">
          <div className="h-4 w-28 bg-gray-200 rounded mb-4" />
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-5 w-10 bg-gray-200 rounded" />
                  <div className="h-3 w-16 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentSkeleton() {
  return (
    <div className="card h-full animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded mb-5" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 rounded-xl border border-gray-100">
            <div className="h-5 w-32 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-24 bg-gray-200 rounded mb-1" />
            <div className="h-3 w-20 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TargetsAndUpcomingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
      <div className="lg:col-span-2 card">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-24 bg-gray-200 rounded" />
          <div className="h-9 w-48 bg-gray-200 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="card">
        <div className="h-6 w-36 bg-gray-200 rounded mb-5" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Async section components for Suspense ---------- */

async function StatsSection() {
  const sessionUser = await getServerSessionUser();
  const tenantDb = await getDb(sessionUser?.accountId);
  const bannerData = sessionUser ? await getBannerData(tenantDb, sessionUser.id) : { state: 'none' as const };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
      <div className="lg:col-span-2">
        <DashboardConferenceBanner bannerData={bannerData} />
      </div>
      <DashboardActionCard bannerState={bannerData.state} />
    </div>
  );
}

async function RecentAgendaWrapper() {
  const sessionUser = await getServerSessionUser();
  const tenantDb = await getDb(sessionUser?.accountId);
  const [allConferences, awaitingUploadConferences] = await Promise.all([
    getAllConferences(tenantDb),
    getAwaitingUploadConferences(tenantDb),
  ]);

  let defaultConferenceId: number | null = null;
  const inProgress = allConferences.filter(c => c.status === 'in_progress');
  if (inProgress.length > 0) {
    if (sessionUser) {
      try {
        const configResult = await tenantDb.execute({
          sql: 'SELECT co.value FROM users u JOIN config_options co ON u.config_id = co.id WHERE u.id = ?',
          args: [sessionUser.id],
        });
        if (configResult.rows.length > 0) {
          const displayName = String(configResult.rows[0].value ?? '').trim().toLowerCase();
          for (const conf of inProgress) {
            if (conf.internal_attendees.some(a => a.toLowerCase() === displayName)) {
              defaultConferenceId = conf.id;
              break;
            }
          }
        }
      } catch {
        defaultConferenceId = null;
      }
    }
  }

  const upcomingConferences = allConferences
    .filter(c => c.status !== 'past')
    .sort((a, b) => {
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
      if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
      return a.start_date.localeCompare(b.start_date);
    });

  return (
    <RecentSection
      upcomingConferences={upcomingConferences}
      awaitingUploadConferences={awaitingUploadConferences}
      allConferences={allConferences}
      defaultConferenceId={defaultConferenceId}
    />
  );
}

async function TargetsAndRecentSection() {
  const sessionUser = await getServerSessionUser();
  const tenantDb = await getDb(sessionUser?.accountId);
  const [allConferences, openFollowUps, bannerData] = await Promise.all([
    getAllConferences(tenantDb),
    getOpenFollowUps(tenantDb),
    sessionUser ? getBannerData(tenantDb, sessionUser.id) : Promise.resolve({ state: 'none' as const }),
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 card">
        <DashboardTargetsSection allConferences={allConferences} />
      </div>
      <DashboardOpenFollowUps
        followUps={openFollowUps}
        bannerData={bannerData}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Post-checkout success/cancel banner — useSearchParams requires Suspense */}
      <Suspense fallback={null}>
        <UpgradeSuccessBanner />
      </Suspense>

      {/* Overview stats + Conference Tracking banner */}
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>

      {/* Quick Notes + Recent/My Agenda — side by side, max 489px */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch">
        <div className="lg:col-span-2 max-h-[489px] flex flex-col min-h-0">
          <QuickNotesSection />
        </div>
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <Suspense fallback={<RecentSkeleton />}>
            <RecentAgendaWrapper />
          </Suspense>
        </div>
      </div>

      {/* Targets + Recent */}
      <Suspense fallback={<TargetsAndUpcomingSkeleton />}>
        <TargetsAndRecentSection />
      </Suspense>
    </div>
  );
}
