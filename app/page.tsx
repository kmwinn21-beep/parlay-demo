import { Suspense } from 'react';
import Link from 'next/link';
import { db, dbReady } from '@/lib/db';
import { PriorityLeads, PriorityLead } from '@/components/PriorityLeads';
import AttendeesTooltip from '@/components/AttendeesTooltip';
import AwaitingUploadModal from '@/components/AwaitingUploadModal';
import { QuickNotesSection } from '@/components/QuickNotesSection';
import { getServerSessionUser } from '@/lib/auth';
import { DashboardBanner } from '@/components/DashboardBanner';
import { RecentSection, type DashboardConference } from '@/components/RecentSection';
export const dynamic = 'force-dynamic';

interface DashboardStats {
  totalConferences: number;
  totalAttendees: number;
  totalCompanies: number;
}

interface RecentConference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  internal_attendees: string[];
  attendee_count: number;
}

async function getDashboardTitle(): Promise<string> {
  await dbReady;
  try {
    const row = await db.execute({
      sql: "SELECT value FROM site_settings WHERE key = 'dashboard_title'",
      args: [],
    });
    return row.rows[0] ? String(row.rows[0].value).trim() : 'Conference Tracking';
  } catch {
    return 'Conference Tracking';
  }
}

async function getStats(): Promise<DashboardStats> {
  await dbReady;
  const [confResult, attResult, compResult] = await Promise.all([
    db.execute({ sql: 'SELECT COUNT(*) as count FROM conferences', args: [] }),
    db.execute({ sql: 'SELECT COUNT(*) as count FROM attendees', args: [] }),
    db.execute({ sql: 'SELECT COUNT(*) as count FROM companies', args: [] }),
  ]);
  return {
    totalConferences: Number(confResult.rows[0].count ?? 0),
    totalAttendees: Number(attResult.rows[0].count ?? 0),
    totalCompanies: Number(compResult.rows[0].count ?? 0),
  };
}

async function getRecentConferences(): Promise<RecentConference[]> {
  await dbReady;
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location, c.internal_attendees,
            (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) as attendee_count
          FROM conferences c
          WHERE c.end_date < ?
            AND (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) > 0
          ORDER BY c.start_date DESC
          LIMIT 5`,
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
}

async function getUpcomingConferences(): Promise<RecentConference[]> {
  await dbReady;
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location, c.internal_attendees,
            (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) as attendee_count
          FROM conferences c
          WHERE c.end_date >= ?
            AND (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.conference_id = c.id) > 0
          ORDER BY c.end_date ASC`,
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
}

async function getAwaitingUploadConferences(): Promise<RecentConference[]> {
  await dbReady;
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.execute({
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
}

async function getAllConferences(): Promise<DashboardConference[]> {
  await dbReady;
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.execute({
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
}

async function getPriorityLeads(): Promise<PriorityLead[]> {
  await dbReady;
  const sessionUser = await getServerSessionUser();
  if (!sessionUser) return [];

  const configResult = await db.execute({
    sql: 'SELECT config_id FROM users WHERE id = ?',
    args: [sessionUser.id],
  });
  const markerConfigId = configResult.rows[0]?.config_id != null
    ? Number(configResult.rows[0].config_id)
    : null;
  if (markerConfigId == null) return [];

  const result = await db.execute({
    sql: `SELECT c.id, c.name, c.assigned_user, c.wse,
            COALESCE(conf_agg.conference_count, 0) as conference_count,
            conf_agg.conference_names
          FROM companies c
          INNER JOIN company_user_statuses cus ON cus.company_id = c.id
          LEFT JOIN (
            SELECT a2.company_id,
                   COUNT(DISTINCT ca.conference_id) as conference_count,
                   GROUP_CONCAT(DISTINCT conf.name) as conference_names
            FROM attendees a2
            JOIN conference_attendees ca ON a2.id = ca.attendee_id
            JOIN conferences conf ON ca.conference_id = conf.id
            GROUP BY a2.company_id
          ) conf_agg ON c.id = conf_agg.company_id
          WHERE cus.marked_by_config_id = ?
          GROUP BY c.id
          ORDER BY c.name ASC
          LIMIT 10`,
    args: [markerConfigId],
  });
  return result.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ''),
    assigned_user: r.assigned_user ? String(r.assigned_user) : null,
    wse: r.wse != null ? Number(r.wse) : null,
    conference_count: Number(r.conference_count ?? 0),
    conference_names: r.conference_names ? String(r.conference_names) : undefined,
  }));
}


function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMonthDay(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
  });
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

function UpcomingSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="h-6 w-48 bg-gray-200 rounded mb-5" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-xl border border-gray-100">
            <div className="h-5 w-40 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-32 bg-gray-200 rounded mb-1" />
            <div className="h-3 w-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickNotesAndUpcomingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
      <div className="card lg:col-span-1">
        <div className="h-6 w-28 bg-gray-200 rounded mb-5" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="card lg:col-span-2">
        <div className="h-6 w-48 bg-gray-200 rounded mb-5" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 rounded-xl border border-gray-100">
              <div className="h-5 w-40 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-32 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function QuickNotesAndUpcomingSection() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
      <div className="lg:col-span-1 h-full">
        <QuickNotesSection className="h-full" />
      </div>
      <div className="lg:col-span-2 h-full">
        <UpcomingSection />
      </div>
    </div>
  );
}

function RecentAndPrioritySkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
      <div className="lg:col-span-2 card">
        <div className="h-6 w-24 bg-gray-200 rounded mb-5" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 rounded-lg border border-gray-100">
              <div className="h-5 w-48 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-36 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="h-6 w-32 bg-gray-200 rounded mb-5" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Async section components for Suspense ---------- */

async function StatsSection() {
  const [stats, dashboardTitle, sessionUser] = await Promise.all([
    getStats(),
    getDashboardTitle(),
    getServerSessionUser(),
  ]);
  const isAdmin = sessionUser?.role === 'administrator';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
      {/* Banner — col 1-2 */}
        <div className="lg:col-span-2 bg-brand-primary rounded-2xl p-8 text-white relative overflow-hidden flex items-center">
          <div className="relative z-10">
            <DashboardBanner initialTitle={dashboardTitle} isAdmin={isAdmin} />
          </div>
          <div className="absolute right-8 top-4 w-32 h-32 rounded-full bg-brand-secondary opacity-20" />
          <div className="absolute right-16 top-12 w-20 h-20 rounded-full bg-brand-highlight opacity-10" />
        </div>

        {/* Overview card — col 3 */}
        <div className="card flex flex-col justify-center">
          <div className="flex flex-row gap-1">
            <Link href="/conferences" className="flex-1 flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-blue-50 transition-colors group">
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-brand-secondary transition-colors flex-shrink-0">
                  <svg className="w-4 h-4 text-brand-secondary group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-xl font-bold text-brand-primary font-serif leading-none">{stats.totalConferences}</p>
              </div>
              <p className="text-xs text-gray-500 leading-tight">Conferences</p>
            </Link>
            <Link href="/attendees" className="flex-1 flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-yellow-50 transition-colors group">
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center group-hover:bg-brand-highlight transition-colors flex-shrink-0">
                  <svg className="w-4 h-4 text-yellow-600 group-hover:text-brand-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-xl font-bold text-brand-primary font-serif leading-none">{stats.totalAttendees}</p>
              </div>
              <p className="text-xs text-gray-500 leading-tight">Attendees</p>
            </Link>
            <Link href="/companies" className="flex-1 flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-green-50 transition-colors group">
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-500 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4 text-green-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <p className="text-xl font-bold text-brand-primary font-serif leading-none">{stats.totalCompanies}</p>
              </div>
              <p className="text-xs text-gray-500 leading-tight">Companies</p>
            </Link>
          </div>
        </div>
    </div>
  );
}

async function UpcomingSection() {
  const [upcomingConferences, awaitingUploadConferences] = await Promise.all([
    getUpcomingConferences(),
    getAwaitingUploadConferences(),
  ]);
  return (
    <div className="card h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-brand-primary font-serif flex items-center gap-2">
          <svg className="w-5 h-5 text-brand-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Current &amp; Upcoming
          <span className="text-sm font-normal text-gray-500">({upcomingConferences.length})</span>
        </h2>
        <AwaitingUploadModal conferences={awaitingUploadConferences} />
      </div>
      {upcomingConferences.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No current or upcoming conferences. <Link href="/conferences/new" className="text-brand-secondary hover:underline">Add one →</Link></p>
      ) : (
        <div
          className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none', alignContent: 'start' }}
        >
          {upcomingConferences.map((conf) => {
            const today = new Date().toISOString().slice(0, 10);
            const isActive = conf.start_date <= today && conf.end_date >= today;
            return (
              <Link
                key={conf.id}
                href={`/conferences/${conf.id}`}
                className="flex flex-col p-4 rounded-xl border hover:shadow-md transition-all hover:border-brand-secondary group"
                style={{ borderColor: isActive ? '#1B76BC' : undefined }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-secondary mb-2">
                          <span className="w-2 h-2 rounded-full bg-brand-secondary animate-pulse" />
                          In Progress
                        </span>
                      )}
                      <p className="font-semibold text-gray-800 group-hover:text-brand-secondary transition-colors leading-tight">{conf.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatMonthDay(conf.start_date)} - {formatMonthDay(conf.end_date || conf.start_date)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{conf.location}</p>
                    </div>
                    {conf.internal_attendees.length > 0 && (
                      <AttendeesTooltip attendees={conf.internal_attendees} align="right" />
                    )}
                  </div>
                  {conf.attendee_count === 0 && (
                    <div className="mt-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z" />
                        </svg>
                        Awaiting Upload
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex justify-end mt-2 flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-brand-secondary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

async function RecentAndPrioritySection() {
  const [recentConferences, priorityLeads, allConferences] = await Promise.all([
    getRecentConferences(),
    getPriorityLeads(),
    getAllConferences(),
  ]);

  // Detect if the signed-in user is an internal attendee at an in-progress conference
  let defaultConferenceId: number | null = null;
  const inProgress = allConferences.filter(c => c.status === 'in_progress');
  if (inProgress.length > 0) {
    const sessionUser = await getServerSessionUser();
    if (sessionUser) {
      const configResult = await db.execute({
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
    }
  }

  const recentWithStatus: DashboardConference[] = recentConferences.map(c => ({ ...c, status: 'past' as const }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Priority Leads */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-brand-primary font-serif flex items-center gap-2">
            Priority Leads
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
              </svg>
            </span>
          </h2>
          <Link href="/companies?status=Priority" className="text-sm text-brand-secondary hover:underline">View all &rarr;</Link>
        </div>
        <PriorityLeads leads={priorityLeads} />
      </div>

      {/* Recent / My Agenda */}
      <RecentSection
        recentConferences={recentWithStatus}
        allConferences={allConferences}
        defaultToMyAgenda={defaultConferenceId != null}
        defaultConferenceId={defaultConferenceId}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Overview stats + Conference Tracking banner */}
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>

      {/* Quick Notes + Current & Upcoming — side by side, same height, max 489px */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-1 max-h-[489px] flex flex-col min-h-0">
          <QuickNotesSection />
        </div>
        <div className="lg:col-span-2 max-h-[489px] flex flex-col min-h-0">
          <Suspense fallback={<UpcomingSkeleton />}>
            <UpcomingSection />
          </Suspense>
        </div>
      </div>

      {/* Priority Leads + Recent Conferences */}
      <Suspense fallback={<RecentAndPrioritySkeleton />}>
        <RecentAndPrioritySection />
      </Suspense>
    </div>
  );
}
