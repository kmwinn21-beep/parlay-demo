import { Suspense } from 'react';
import Link from 'next/link';
import { db, dbReady } from '@/lib/db';
import AttendeesTooltip from '@/components/AttendeesTooltip';
import AwaitingUploadModal from '@/components/AwaitingUploadModal';
import { QuickNotesSection } from '@/components/QuickNotesSection';
import { getServerSessionUser } from '@/lib/auth';
import { DashboardBanner } from '@/components/DashboardBanner';
import { RecentSection, type DashboardConference } from '@/components/RecentSection';
import { DashboardTargetsSection } from '@/components/DashboardTargetsSection';
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

async function RecentAgendaWrapper() {
  const [allConferences, recentConferences] = await Promise.all([
    getAllConferences(),
    getRecentConferences(),
  ]);

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
    <RecentSection
      recentConferences={recentWithStatus}
      allConferences={allConferences}
      defaultToMyAgenda={defaultConferenceId != null}
      defaultConferenceId={defaultConferenceId}
    />
  );
}

async function TargetsAndUpcomingSection() {
  const [upcomingConferences, awaitingUploadConferences, allConferences] = await Promise.all([
    getUpcomingConferences(),
    getAwaitingUploadConferences(),
    getAllConferences(),
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Targets — 2 cols */}
      <div className="lg:col-span-2 card">
        <DashboardTargetsSection allConferences={allConferences} />
      </div>

      {/* Current & Upcoming — 1 col, stacked */}
      <div className="card flex flex-col overflow-hidden">
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
          <p className="text-sm text-gray-400 text-center py-6">
            No current or upcoming conferences.{' '}
            <Link href="/conferences/new" className="text-brand-secondary hover:underline">Add one →</Link>
          </p>
        ) : (
          <div
            className="flex-1 min-h-0 space-y-3 overflow-y-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {upcomingConferences.map((conf) => {
              const today = new Date().toISOString().slice(0, 10);
              const isActive = conf.start_date <= today && conf.end_date >= today;
              return (
                <Link
                  key={conf.id}
                  href={`/conferences/${conf.id}`}
                  className="flex flex-col p-4 rounded-xl border hover:shadow-md transition-all hover:border-brand-secondary group block"
                  style={{ borderColor: isActive ? '#1B76BC' : undefined }}
                >
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-secondary mb-2">
                      <span className="w-2 h-2 rounded-full bg-brand-secondary animate-pulse" />
                      In Progress
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 group-hover:text-brand-secondary transition-colors leading-tight">{conf.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatMonthDay(conf.start_date)} – {formatMonthDay(conf.end_date || conf.start_date)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{conf.location}</p>
                    </div>
                    {conf.internal_attendees.length > 0 && (
                      <AttendeesTooltip attendees={conf.internal_attendees} align="right" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
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

      {/* Quick Notes + Recent/My Agenda — side by side, max 489px */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-1 max-h-[489px] flex flex-col min-h-0">
          <QuickNotesSection />
        </div>
        <div className="lg:col-span-2 max-h-[489px] flex flex-col min-h-0">
          <Suspense fallback={<RecentSkeleton />}>
            <RecentAgendaWrapper />
          </Suspense>
        </div>
      </div>

      {/* Targets + Current & Upcoming */}
      <Suspense fallback={<TargetsAndUpcomingSkeleton />}>
        <TargetsAndUpcomingSection />
      </Suspense>
    </div>
  );
}
