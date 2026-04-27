'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DashboardAgendaSection } from './DashboardAgendaSection';
import AttendeesTooltip from './AttendeesTooltip';

export interface DashboardConference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  internal_attendees: string[];
  attendee_count: number;
  status: 'in_progress' | 'upcoming' | 'past';
}

interface Props {
  recentConferences: DashboardConference[];
  allConferences: DashboardConference[];
  defaultToMyAgenda: boolean;
  defaultConferenceId: number | null;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RecentSection({ recentConferences, allConferences, defaultToMyAgenda, defaultConferenceId }: Props) {
  const [tab, setTab] = useState<'recent' | 'agenda'>(defaultToMyAgenda ? 'agenda' : 'recent');

  const firstAvailable =
    allConferences.find(c => c.status === 'in_progress')?.id ??
    allConferences.find(c => c.status === 'upcoming')?.id ??
    allConferences[0]?.id ??
    null;

  const [selectedId, setSelectedId] = useState<number | null>(defaultConferenceId ?? firstAvailable);

  const selectedConference = allConferences.find(c => c.id === selectedId);

  const inProgressConfs = allConferences.filter(c => c.status === 'in_progress').sort((a, b) => a.start_date.localeCompare(b.start_date));
  const upcomingConfs = allConferences.filter(c => c.status === 'upcoming').sort((a, b) => a.end_date.localeCompare(b.end_date));
  const pastConfs = allConferences.filter(c => c.status === 'past').sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <div className="lg:col-span-2 card">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setTab('recent')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${tab === 'recent' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Recent
            </button>
            <button
              onClick={() => setTab('agenda')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${tab === 'agenda' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              My Agenda
            </button>
          </div>
        </div>
        {tab === 'recent' && (
          <Link href="/conferences" className="text-sm text-brand-secondary hover:underline">View all →</Link>
        )}
        {tab === 'agenda' && selectedConference && (
          <Link href={`/conferences/${selectedConference.id}`} className="text-sm text-brand-secondary hover:underline">View →</Link>
        )}
      </div>

      {/* Recent tab */}
      {tab === 'recent' && (
        recentConferences.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-400 text-sm">No conferences yet.</p>
            <Link href="/conferences/new" className="btn-primary mt-3 inline-block text-sm">Add Your First Conference</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recentConferences.map(conf => (
              <Link key={conf.id} href={`/conferences/${conf.id}`}
                className="block p-4 rounded-lg border border-gray-100 hover:border-brand-secondary hover:bg-blue-50 transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{conf.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(conf.start_date)}{conf.end_date && conf.end_date !== conf.start_date ? ` – ${formatDate(conf.end_date)}` : ''}
                      {' · '}{conf.location}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {conf.attendee_count === 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z" />
                        </svg>
                        Awaiting Upload
                      </span>
                    ) : conf.internal_attendees.length > 0 ? (
                      <AttendeesTooltip attendees={conf.internal_attendees} align="right" />
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )
      )}

      {/* My Agenda tab */}
      {tab === 'agenda' && (
        <div>
          {allConferences.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">No conferences available.</p>
            </div>
          ) : (
            <>
              {/* Conference selector */}
              <div className="mb-4">
                <select
                  value={selectedId ?? ''}
                  onChange={e => setSelectedId(Number(e.target.value))}
                  className="input-field text-sm w-full sm:w-auto"
                >
                  {inProgressConfs.length > 0 && (
                    <optgroup label="In Progress">
                      {inProgressConfs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  )}
                  {upcomingConfs.length > 0 && (
                    <optgroup label="Upcoming">
                      {upcomingConfs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  )}
                  {pastConfs.length > 0 && (
                    <optgroup label="Past">
                      {pastConfs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              {selectedId && selectedConference ? (
                <DashboardAgendaSection conferenceId={selectedId} conferenceName={selectedConference.name} />
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">Select a conference above.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
