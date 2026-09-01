'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

/**
 * Broadcast whenever a target is added or removed anywhere in the app.
 *
 * Targeting is now reachable from several places at once — the targets tab, the
 * attendees table, a company's attendee drawer — and two of them can be mounted
 * together. Without this, adding someone in the drawer would leave the table
 * behind it showing them as untargeted until the page was reloaded.
 */
export const TARGETS_CHANGED_EVENT = 'parlay:conference-targets-changed';

/**
 * Who is a target at this conference, and one call to change that.
 *
 * The set is what the buttons read, so a target set anywhere else in the site
 * shows as one here. Toggling is optimistic — the button flips on the click and
 * rolls back if the write fails — because the alternative is a red dot that
 * appears a beat after a rep has already moved on to the next row.
 */
export function useConferenceTargets(conferenceId: number | null | undefined) {
  const [targetIds, setTargetIds] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = useCallback(() => {
    if (conferenceId == null) return;
    fetch(`/api/conferences/${conferenceId}/targets`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { attendeeId: number }[]) => setTargetIds(new Set(rows.map(r => Number(r.attendeeId)))))
      .catch(() => {});
  }, [conferenceId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const onChanged = () => reload();
    window.addEventListener(TARGETS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(TARGETS_CHANGED_EVENT, onChanged);
  }, [reload]);

  const toggleTarget = useCallback(async (attendeeId: number) => {
    if (conferenceId == null) return;
    const wasTarget = targetIds.has(attendeeId);
    setBusyId(attendeeId);
    setTargetIds(prev => {
      const next = new Set(prev);
      if (wasTarget) next.delete(attendeeId); else next.add(attendeeId);
      return next;
    });
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId }),
      });
      if (!res.ok) throw new Error('failed');
      // The route toggles server-side and reports which way it went, so the
      // message describes what actually happened rather than what was intended.
      const data = await res.json() as { action?: string };
      const removed = data.action === 'removed';
      setTargetIds(prev => {
        const next = new Set(prev);
        if (removed) next.delete(attendeeId); else next.add(attendeeId);
        return next;
      });
      toast.success(removed ? 'Target Removed' : 'Target Added');
      window.dispatchEvent(new CustomEvent(TARGETS_CHANGED_EVENT));
    } catch {
      setTargetIds(prev => {
        const next = new Set(prev);
        if (wasTarget) next.add(attendeeId); else next.delete(attendeeId);
        return next;
      });
      toast.error('Could not update targets.');
    } finally {
      setBusyId(null);
    }
  }, [conferenceId, targetIds]);

  return { targetIds, busyId, toggleTarget, reload };
}
