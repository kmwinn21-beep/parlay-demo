'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConferenceTargetsTab } from './pre-conference/ConferenceTargetsTab';
import type { TargetEntry } from './PreConferenceReview';

interface Props {
  conferenceId: number;
  conferenceName: string;
  meetingAttendeeIds: Set<number>;
}

export function ConferenceDetailsTargetsTab({ conferenceId, conferenceName, meetingAttendeeIds }: Props) {
  const [targetMap, setTargetMap] = useState<Map<number, TargetEntry>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/conferences/${conferenceId}/targets`)
      .then(r => r.ok ? r.json() : [])
      .then((targets: TargetEntry[]) => {
        const tMap = new Map<number, TargetEntry>();
        for (const t of targets) tMap.set(t.attendeeId, t);
        setTargetMap(tMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conferenceId]);

  const toggleTarget = useCallback(async (entry: Omit<TargetEntry, 'tier'>) => {
    const isTarget = targetMap.has(entry.attendeeId);
    if (isTarget) {
      setTargetMap(prev => { const next = new Map(prev); next.delete(entry.attendeeId); return next; });
    } else {
      setTargetMap(prev => new Map(prev).set(entry.attendeeId, { ...entry, tier: 'unassigned' }));
    }
    try {
      await fetch(`/api/conferences/${conferenceId}/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: entry.attendeeId }),
      });
    } catch {
      // Revert optimistic update on error
      if (isTarget) {
        setTargetMap(prev => new Map(prev).set(entry.attendeeId, { ...entry, tier: 'unassigned' }));
      } else {
        setTargetMap(prev => { const next = new Map(prev); next.delete(entry.attendeeId); return next; });
      }
    }
  }, [conferenceId, targetMap]);

  const setTier = useCallback(async (attendeeId: number, tier: string) => {
    setTargetMap(prev => {
      const next = new Map(prev);
      const entry = next.get(attendeeId);
      if (entry) next.set(attendeeId, { ...entry, tier });
      return next;
    });
    try {
      await fetch(`/api/conferences/${conferenceId}/targets/${attendeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
    } catch { /* optimistic only */ }
  }, [conferenceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent mr-2" />
        Loading targets…
      </div>
    );
  }

  return (
    <ConferenceTargetsTab
      conferenceName={conferenceName}
      targetMap={targetMap}
      meetingAttendeeIds={meetingAttendeeIds}
      onToggleTarget={toggleTarget}
      onSetTier={setTier}
    />
  );
}
