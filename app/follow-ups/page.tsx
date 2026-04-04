'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { MeetingsTable, type Meeting } from '@/components/MeetingsTable';
import { BackButton } from '@/components/BackButton';

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');

  const fetchData = useCallback(async () => {
    try {
      const [fuRes, mtgRes, cfgRes] = await Promise.all([
        fetch('/api/follow-ups'),
        fetch('/api/meetings'),
        fetch('/api/config'),
      ]);
      if (!fuRes.ok) throw new Error();
      if (!mtgRes.ok) throw new Error();
      const fuData = await fuRes.json();
      const mtgData = await mtgRes.json();
      setFollowUps(fuData);
      setMeetings(mtgData);

      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        const actionsCat = cfgData.categories?.find((c: { name: string }) => c.name === 'Actions');
        if (actionsCat?.options) {
          setActionOptions(actionsCat.options.map((o: { value: string }) => o.value));
        }
      }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (attendeeId: number, conferenceId: number, completed: boolean) => {
    setFollowUps((prev) =>
      prev.map((fu) =>
        fu.attendee_id === attendeeId && fu.conference_id === conferenceId
          ? { ...fu, completed }
          : fu
      )
    );
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId, completed }),
      });
      if (!res.ok) throw new Error();
      toast.success(completed ? 'Marked as completed!' : 'Marked as pending.');
    } catch {
      setFollowUps((prev) =>
        prev.map((fu) =>
          fu.attendee_id === attendeeId && fu.conference_id === conferenceId
            ? { ...fu, completed: !completed }
            : fu
        )
      );
      toast.error('Failed to update.');
    }
  };

  const handleDeleteFollowUp = async (attendeeId: number, conferenceId: number) => {
    if (!confirm('Are you sure you want to delete this follow-up?')) return;
    const prev = followUps;
    setFollowUps((fus) => fus.filter((fu) => !(fu.attendee_id === attendeeId && fu.conference_id === conferenceId)));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Follow-up deleted.');
    } catch {
      setFollowUps(prev);
      toast.error('Failed to delete follow-up.');
    }
  };

  const handleOutcomeChange = async (meetingId: number, outcome: string) => {
    setMeetings((prev) => prev.map((m) => m.id === meetingId ? { ...m, outcome } : m));
    try {
      const res = await fetch('/api/meetings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meetingId, outcome }),
      });
      if (!res.ok) throw new Error();
      toast.success('Outcome updated.');
    } catch {
      toast.error('Failed to update outcome.');
      fetchData();
    }
  };

  const handleDeleteMeeting = async (meetingId: number) => {
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    const prev = meetings;
    setMeetings((ms) => ms.filter((m) => m.id !== meetingId));
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Meeting deleted.');
    } catch {
      setMeetings(prev);
      toast.error('Failed to delete meeting.');
    }
  };

  const filtered = followUps.filter((fu) => {
    if (filter === 'pending') return !fu.completed;
    if (filter === 'completed') return fu.completed;
    return true;
  });

  const pendingCount = followUps.filter((fu) => !fu.completed).length;
  const completedCount = followUps.filter((fu) => fu.completed).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BackButton />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Meetings &amp; Follow Ups</h1>
        <p className="text-sm text-gray-500 mt-1">Track meetings and next steps across all conferences.</p>
      </div>

      {/* Stats */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-procare-dark-blue font-serif">{meetings.length}</p>
            <p className="text-xs text-gray-500 mt-1">Meetings</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-procare-dark-blue font-serif">{followUps.length}</p>
            <p className="text-xs text-gray-500 mt-1">Follow Ups</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-procare-bright-blue font-serif">{pendingCount}</p>
            <p className="text-xs text-gray-500 mt-1">Pending</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-green-600 font-serif">{completedCount}</p>
            <p className="text-xs text-gray-500 mt-1">Completed</p>
          </div>
        </div>
      )}

      {/* Meetings Section */}
      <div>
        <h2 className="text-lg font-semibold text-procare-dark-blue font-serif mb-3">Meetings</h2>
        <div className="card p-0 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
            </div>
          ) : (
            <MeetingsTable
              meetings={meetings}
              actionOptions={actionOptions}
              onOutcomeChange={handleOutcomeChange}
              onDelete={handleDeleteMeeting}
            />
          )}
        </div>
      </div>

      {/* Follow Ups Section */}
      <div>
        <h2 className="text-lg font-semibold text-procare-dark-blue font-serif mb-3">Follow Ups</h2>

        {/* Filter tabs */}
        <div className="border-b border-gray-200 overflow-x-auto mb-4">
          <nav className="flex gap-6 whitespace-nowrap">
            {(['pending', 'all', 'completed'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors capitalize ${
                  filter === tab
                    ? 'border-procare-bright-blue text-procare-bright-blue'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'pending'
                  ? `Pending (${pendingCount})`
                  : tab === 'completed'
                  ? `Completed (${completedCount})`
                  : `All (${followUps.length})`}
              </button>
            ))}
          </nav>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
            </div>
          ) : (
            <FollowUpsTable followUps={filtered} onToggle={handleToggle} onDelete={handleDeleteFollowUp} />
          )}
        </div>
      </div>
    </div>
  );
}
