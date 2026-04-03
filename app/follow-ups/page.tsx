'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';

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
          <FollowUpsTable followUps={filtered} onToggle={handleToggle} />
        )}
      </div>
    </div>
  );
}
