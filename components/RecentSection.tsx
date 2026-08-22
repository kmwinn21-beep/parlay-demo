'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardAgendaSection } from './DashboardAgendaSection';
import { useActiveConference } from '@/components/ActiveConferenceContext';

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

export function RecentSection({ allConferences, defaultConferenceId }: Props) {
  const [agendaView, setAgendaView] = useState<'my' | 'full'>('my');
  const { activeConference } = useActiveConference();

  const firstAvailable =
    allConferences.find(c => c.status === 'in_progress')?.id ??
    allConferences.find(c => c.status === 'upcoming')?.id ??
    allConferences[0]?.id ??
    null;

  const [selectedId, setSelectedId] = useState<number | null>(defaultConferenceId ?? firstAvailable);

  // Sync dropdown with active conference context whenever it changes
  useEffect(() => {
    if (!activeConference) return;
    const match = allConferences.find(c => c.id === activeConference.id);
    if (match) setSelectedId(match.id);
  }, [activeConference, allConferences]);

  const selectedConference = allConferences.find(c => c.id === selectedId);

  const inProgressConfs = allConferences.filter(c => c.status === 'in_progress').sort((a, b) => a.start_date.localeCompare(b.start_date));
  const upcomingConfs = allConferences.filter(c => c.status === 'upcoming').sort((a, b) => a.end_date.localeCompare(b.end_date));
  const pastConfs = allConferences.filter(c => c.status === 'past').sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    // The card is desktop-only: on a phone this already sits inside the action
    // card, so a second one just nested a panel in a panel. Without it the day
    // bars run the full width of the section.
    <div className="h-full flex flex-col overflow-hidden p-0 lg:bg-white lg:rounded-xl lg:shadow-sm lg:border lg:border-gray-100 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 mb-4 flex-shrink-0 px-4 lg:px-0">
        {/* Row 1: My/Full Agenda toggle — full width on a phone, where the
            View link is dropped and there is nothing to share the row with */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-1 lg:flex-none items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setAgendaView('my')}
              className={`flex-1 lg:flex-none px-3 py-1.5 lg:py-1 rounded-md text-xs font-medium transition-all ${agendaView === 'my' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              My Agenda
            </button>
            <button
              onClick={() => setAgendaView('full')}
              className={`flex-1 lg:flex-none px-3 py-1.5 lg:py-1 rounded-md text-xs font-medium transition-all ${agendaView === 'full' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Full Agenda
            </button>
          </div>
          {selectedConference && (
            <Link href={`/conferences/${selectedConference.id}`} className="hidden lg:inline text-sm text-brand-secondary hover:underline">View →</Link>
          )}
        </div>

        {/* Row 2: full-width conference dropdown */}
        {allConferences.length > 0 && (
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(Number(e.target.value))}
            className="input-field text-sm w-full"
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
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        {allConferences.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">No conferences available.</p>
          </div>
        ) : selectedId && selectedConference ? (
          <DashboardAgendaSection conferenceId={selectedId} conferenceName={selectedConference.name} view={agendaView} onViewChange={setAgendaView} />
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">Select a conference above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
