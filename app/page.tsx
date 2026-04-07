import Link from 'next/link';
import { db, dbReady } from '@/lib/db';
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
  attendee_count: number;
  internal_attendees: string[];
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
  const result = await db.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location, c.internal_attendees,
                 COUNT(ca.attendee_id) as attendee_count
          FROM conferences c
          LEFT JOIN conference_attendees ca ON c.id = ca.conference_id
          GROUP BY c.id
          ORDER BY c.start_date DESC
          LIMIT 5`,
    args: [],
  });
  return result.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ''),
    start_date: String(r.start_date ?? ''),
    end_date: String(r.end_date ?? ''),
    location: String(r.location ?? ''),
    attendee_count: Number(r.attendee_count ?? 0),
    internal_attendees: r.internal_attendees ? String(r.internal_attendees).split(',').map(s => s.trim()).filter(Boolean) : [],
  }));
}

async function getUpcomingConferences(): Promise<RecentConference[]> {
  await dbReady;
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.location, c.internal_attendees,
                 COUNT(ca.attendee_id) as attendee_count
          FROM conferences c
          LEFT JOIN conference_attendees ca ON c.id = ca.conference_id
          WHERE c.end_date >= ?
          GROUP BY c.id
          ORDER BY c.start_date ASC`,
    args: [today],
  });
  return result.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ''),
    start_date: String(r.start_date ?? ''),
    end_date: String(r.end_date ?? ''),
    location: String(r.location ?? ''),
    attendee_count: Number(r.attendee_count ?? 0),
    internal_attendees: r.internal_attendees ? String(r.internal_attendees).split(',').map(s => s.trim()).filter(Boolean) : [],
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

export default async function DashboardPage() {
  const [stats, recentConferences, upcomingConferences] = await Promise.all([getStats(), getRecentConferences(), getUpcomingConferences()]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome Header */}
      <div className="bg-procare-dark-blue rounded-2xl p-8 text-white relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl font-bold font-serif mb-2">
            Senior Housing Conference Hub
          </h1>
          <p className="text-blue-200 text-base">
            Track and manage your conference attendees — all in one place.
          </p>
          <p className="text-blue-300 text-sm mt-1 italic">Caring for people who care for people.</p>
        </div>
        {/* Decorative element */}
        <div className="absolute right-8 top-4 w-32 h-32 rounded-full bg-procare-bright-blue opacity-20" />
        <div className="absolute right-16 top-12 w-20 h-20 rounded-full bg-procare-gold opacity-10" />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/conferences" className="card hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Conferences</p>
              <p className="text-3xl font-bold text-procare-dark-blue font-serif">
                {stats.totalConferences}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-procare-bright-blue transition-colors">
              <svg className="w-6 h-6 text-procare-bright-blue group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </Link>

        <Link href="/attendees" className="card hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Attendees</p>
              <p className="text-3xl font-bold text-procare-dark-blue font-serif">
                {stats.totalAttendees}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center group-hover:bg-procare-gold transition-colors">
              <svg className="w-6 h-6 text-yellow-600 group-hover:text-procare-dark-blue transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
        </Link>

        <Link href="/companies" className="card hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Companies</p>
              <p className="text-3xl font-bold text-procare-dark-blue font-serif">
                {stats.totalCompanies}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-500 transition-colors">
              <svg className="w-6 h-6 text-green-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
        </Link>
      </div>

      {/* Current & Upcoming Conferences */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-procare-dark-blue font-serif flex items-center gap-2">
            <svg className="w-5 h-5 text-procare-bright-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Current &amp; Upcoming Conferences
            <span className="text-sm font-normal text-gray-500">({upcomingConferences.length})</span>
          </h2>
          <Link href="/conferences" className="text-sm text-procare-bright-blue hover:underline">View all →</Link>
        </div>
        {upcomingConferences.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No current or upcoming conferences. <Link href="/conferences/new" className="text-procare-bright-blue hover:underline">Add one →</Link></p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingConferences.map((conf) => {
              const today = new Date().toISOString().slice(0, 10);
              const isActive = conf.start_date <= today && conf.end_date >= today;
              return (
                <Link
                  key={conf.id}
                  href={`/conferences/${conf.id}`}
                  className="block p-4 rounded-xl border hover:shadow-md transition-all hover:border-procare-bright-blue group"
                  style={{ borderColor: isActive ? '#1B76BC' : undefined }}
                >
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-procare-bright-blue mb-2">
                      <span className="w-2 h-2 rounded-full bg-procare-bright-blue animate-pulse" />
                      In Progress
                    </span>
                  )}
                  <p className="font-semibold text-gray-800 group-hover:text-procare-bright-blue transition-colors leading-tight">{conf.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDate(conf.start_date)}
                    {conf.end_date && conf.end_date !== conf.start_date ? ` – ${formatDate(conf.end_date)}` : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{conf.location}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="badge-blue text-xs">{conf.attendee_count} attendees</span>
                      {conf.internal_attendees.length > 0 && (
                        <span className="relative group/tip">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 border border-blue-200 text-procare-bright-blue cursor-default">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </span>
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tip:flex flex-col items-center z-20">
                            <span className="rounded-lg bg-gray-900 px-3 py-2.5 text-xs text-white shadow-xl">
                              <span className="block font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Internal Attendees</span>
                              <span className="block space-y-1">
                                {conf.internal_attendees.map((name, i) => (
                                  <span key={i} className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                                    <span className="whitespace-nowrap">{name}</span>
                                  </span>
                                ))}
                              </span>
                            </span>
                            <span className="w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
                          </span>
                        </span>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-procare-bright-blue transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Conferences + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Conferences */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Recent Conferences</h2>
            <Link href="/conferences" className="text-sm text-procare-bright-blue hover:underline">
              View all →
            </Link>
          </div>

          {recentConferences.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-400 text-sm">No conferences yet.</p>
              <Link href="/conferences/new" className="btn-primary mt-3 inline-block text-sm">
                Add Your First Conference
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentConferences.map((conf) => (
                <Link
                  key={conf.id}
                  href={`/conferences/${conf.id}`}
                  className="block p-4 rounded-lg border border-gray-100 hover:border-procare-bright-blue hover:bg-blue-50 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-800">{conf.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(conf.start_date)}
                        {conf.end_date && conf.end_date !== conf.start_date
                          ? ` – ${formatDate(conf.end_date)}`
                          : ''}
                        {' · '}
                        {conf.location}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      {conf.internal_attendees.length > 0 && (
                        <span className="relative group/tip2">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 border border-blue-200 text-procare-bright-blue cursor-default">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </span>
                          <span className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover/tip2:flex flex-col items-end z-20">
                            <span className="rounded-lg bg-gray-900 px-3 py-2.5 text-xs text-white shadow-xl">
                              <span className="block font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Internal Attendees</span>
                              <span className="block space-y-1">
                                {conf.internal_attendees.map((name, i) => (
                                  <span key={i} className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                                    <span className="whitespace-nowrap">{name}</span>
                                  </span>
                                ))}
                              </span>
                            </span>
                            <span className="w-2 h-2 bg-gray-900 rotate-45 -mt-1 mr-2" />
                          </span>
                        </span>
                      )}
                      <span className="badge-blue text-xs">
                        {conf.attendee_count} attendees
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h2 className="text-lg font-semibold text-procare-dark-blue mb-5 font-serif">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/conferences/new" className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-procare-bright-blue hover:bg-blue-50 transition-all group">
              <div className="w-9 h-9 rounded-lg bg-procare-dark-blue flex items-center justify-center group-hover:bg-procare-bright-blue transition-colors flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Add Conference</p>
                <p className="text-xs text-gray-400">Import attendees from file</p>
              </div>
            </Link>

            <Link href="/attendees" className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-procare-bright-blue hover:bg-blue-50 transition-all group">
              <div className="w-9 h-9 rounded-lg bg-procare-bright-blue flex items-center justify-center group-hover:bg-procare-dark-blue transition-colors flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">View Attendees</p>
                <p className="text-xs text-gray-400">Search and manage contacts</p>
              </div>
            </Link>

            <Link href="/companies" className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-procare-bright-blue hover:bg-blue-50 transition-all group">
              <div className="w-9 h-9 rounded-lg bg-procare-gold flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-procare-dark-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Manage Companies</p>
                <p className="text-xs text-gray-400">View and merge companies</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
