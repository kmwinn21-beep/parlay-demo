'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DashboardAgendaSection } from './DashboardAgendaSection';
import AttendeesTooltip from './AttendeesTooltip';
import AwaitingUploadModal from './AwaitingUploadModal';

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

interface AwaitingConference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  internal_attendees: string[];
  attendee_count: number;
}

interface Props {
  upcomingConferences: DashboardConference[];
  awaitingUploadConferences: AwaitingConference[];
  allConferences: DashboardConference[];
  defaultConferenceId: number | null;
}

function formatMonthDay(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

export function RecentSection({ upcomingConferences, awaitingUploadConferences, allConferences, defaultConferenceId }: Props) {
  const [tab, setTab] = useState<'agenda' | 'upcoming'>('agenda');

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
    <div className="card h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setTab('agenda')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${tab === 'agenda' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            My Agenda
          </button>
          <button
            onClick={() => setTab('upcoming')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${tab === 'upcoming' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Current &amp; Upcoming
          </button>
        </div>

        {tab === 'agenda' && allConferences.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={selectedId ?? ''}
              onChange={e => setSelectedId(Number(e.target.value))}
              className="input-field text-sm"
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
            {selectedConference && (
              <Link href={`/conferences/${selectedConference.id}`} className="text-sm text-brand-secondary hover:underline">View →</Link>
            )}
          </div>
        )}
        {tab === 'upcoming' && (
          <AwaitingUploadModal conferences={awaitingUploadConferences} />
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>

        {/* My Agenda tab — unchanged */}
        {tab === 'agenda' && (
          allConferences.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">No conferences available.</p>
            </div>
          ) : (
            <>
              {selectedId && selectedConference ? (
                <DashboardAgendaSection conferenceId={selectedId} conferenceName={selectedConference.name} />
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">Select a conference above.</p>
                </div>
              )}
            </>
          )
        )}

        {/* Current & Upcoming tab */}
        {tab === 'upcoming' && (
          upcomingConferences.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-400 text-sm">No current or upcoming conferences.</p>
              <Link href="/conferences/new" className="btn-primary mt-3 inline-block text-sm">Add Conference</Link>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              style={{ alignContent: 'start' }}
            >
              {upcomingConferences.map(conf => {
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
                            {formatMonthDay(conf.start_date)} – {formatMonthDay(conf.end_date || conf.start_date)}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{conf.location}</p>
                        </div>
                        {conf.internal_attendees.length > 0 && (
                          <AttendeesTooltip attendees={conf.internal_attendees} align="right" />
                        )}
                      </div>
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
          )
        )}
      </div>
    </div>
  );
}
