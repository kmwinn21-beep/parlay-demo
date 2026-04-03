'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface FollowUp {
  attendee_id: number;
  conference_id: number;
  next_steps: string;
  next_steps_notes: string | null;
  completed: boolean;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  conference_name: string;
  start_date: string;
}

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function FollowUpsTable({
  followUps,
  onToggle,
}: {
  followUps: FollowUp[];
  onToggle: (attendeeId: number, conferenceId: number, completed: boolean) => void;
}) {
  if (followUps.length === 0) {
    return (
      <div className="text-center py-10">
        <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <p className="text-gray-400 text-sm">No follow-ups yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Title</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Company</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Next Step</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Conference</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Completed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {followUps.map((fu) => (
            <tr
              key={`${fu.attendee_id}-${fu.conference_id}`}
              className={`transition-colors ${fu.completed ? 'bg-green-50 hover:bg-green-50' : 'hover:bg-gray-50'}`}
            >
              <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                <Link
                  href={`/attendees/${fu.attendee_id}`}
                  className="text-procare-bright-blue hover:underline"
                >
                  {fu.first_name} {fu.last_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                {fu.title || <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                {fu.company_name || <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3">
                <div>
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${fu.completed ? 'bg-green-100 text-green-700' : 'bg-procare-dark-blue text-white'}`}>
                    {fu.next_steps}
                  </span>
                  {fu.next_steps_notes && (
                    <p className="text-xs text-gray-500 mt-1 max-w-[200px] truncate" title={fu.next_steps_notes}>
                      {fu.next_steps_notes}
                    </p>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                <Link
                  href={`/conferences/${fu.conference_id}`}
                  className="text-procare-bright-blue hover:underline text-xs"
                >
                  {fu.conference_name}
                </Link>
                <p className="text-xs text-gray-400">{formatDate(fu.start_date)}</p>
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onToggle(fu.attendee_id, fu.conference_id, !fu.completed)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                    fu.completed
                      ? 'bg-green-500 text-white border-green-600 hover:bg-green-600'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-green-400 hover:text-green-600'
                  }`}
                >
                  {fu.completed ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Done
                    </>
                  ) : (
                    'Mark Done'
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');

  const fetchFollowUps = useCallback(async () => {
    try {
      const res = await fetch('/api/follow-ups');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFollowUps(data);
    } catch {
      toast.error('Failed to load follow-ups');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchFollowUps(); }, [fetchFollowUps]);

  const handleToggle = async (attendeeId: number, conferenceId: number, completed: boolean) => {
    // Optimistic update
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
      // Revert on error
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

  const filtered = followUps.filter((fu) => {
    if (filter === 'pending') return !fu.completed;
    if (filter === 'completed') return fu.completed;
    return true;
  });

  const pendingCount = followUps.filter((fu) => !fu.completed).length;
  const completedCount = followUps.filter((fu) => fu.completed).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Follow Ups</h1>
        <p className="text-sm text-gray-500 mt-1">Track next steps across all conferences.</p>
      </div>

      {/* Stats */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-procare-dark-blue font-serif">{followUps.length}</p>
            <p className="text-xs text-gray-500 mt-1">Total</p>
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

      {/* Filter tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
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
              {tab === 'pending' ? `Pending (${pendingCount})` : tab === 'completed' ? `Completed (${completedCount})` : `All (${followUps.length})`}
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
          <FollowUpsTable followUps={filtered} onToggle={handleToggle} />
        )}
      </div>
    </div>
  );
}
