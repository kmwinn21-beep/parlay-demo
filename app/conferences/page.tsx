import Link from 'next/link';
import { getDb } from '@/lib/db';

interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes?: string;
  created_at: string;
  attendee_count: number;
}

function getConferences(): Conference[] {
  const db = getDb();
  return db.prepare(
    `SELECT c.*, COUNT(ca.attendee_id) as attendee_count
     FROM conferences c
     LEFT JOIN conference_attendees ca ON c.id = ca.conference_id
     GROUP BY c.id
     ORDER BY c.start_date DESC`
  ).all() as Conference[];
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ConferencesPage() {
  const conferences = getConferences();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Conferences</h1>
          <p className="text-sm text-gray-500">{conferences.length} conference{conferences.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <Link href="/conferences/new" className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New Conference
        </Link>
      </div>

      {/* Conferences List */}
      {conferences.length === 0 ? (
        <div className="card text-center py-16">
          <svg className="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-700 mb-2 font-serif">No conferences yet</h2>
          <p className="text-sm text-gray-400 mb-6">Create your first conference to start tracking attendees.</p>
          <Link href="/conferences/new" className="btn-primary inline-block">
            Add Your First Conference
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {conferences.map((conf) => (
            <Link
              key={conf.id}
              href={`/conferences/${conf.id}`}
              className="card hover:shadow-md transition-all hover:border-procare-bright-blue border border-transparent group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-procare-dark-blue group-hover:text-procare-bright-blue transition-colors font-serif">
                    {conf.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                    <span className="flex items-center gap-1 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {formatDate(conf.start_date)}
                      {conf.end_date && conf.end_date !== conf.start_date
                        ? ` – ${formatDate(conf.end_date)}`
                        : ''}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {conf.location}
                    </span>
                  </div>
                  {conf.notes && (
                    <p className="text-sm text-gray-500 mt-2 line-clamp-2">{conf.notes}</p>
                  )}
                </div>
                <div className="ml-6 flex-shrink-0 text-right">
                  <div className="bg-procare-dark-blue text-white rounded-xl px-4 py-2 text-center min-w-[80px]">
                    <p className="text-2xl font-bold font-serif">{conf.attendee_count}</p>
                    <p className="text-xs text-blue-300">attendees</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
