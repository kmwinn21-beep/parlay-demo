'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ConferenceTargetsTab } from './pre-conference/ConferenceTargetsTab';
import type { AddableGroup } from './pre-conference/ConferenceTargetsTab';
import type { TargetEntry } from './PreConferenceReview';
import { effectiveSeniority } from '@/lib/parsers';

interface AttendeeRaw {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  seniority: string | null;
  company_name: string | null;
  company_id: number | null;
  company_type: string | null;
}

interface Props {
  conferenceId: number;
  conferenceName: string;
  meetingAttendeeIds: Set<number>;
}

function resolveAttSeniority(raw: string | null, title: string | null, senMap: Map<string, string>): string {
  if (!raw) return effectiveSeniority(undefined, title ?? undefined) || 'Other';
  const mapped = senMap.get(String(raw));
  if (mapped) return mapped;
  return effectiveSeniority(raw, title ?? undefined) || 'Other';
}

export function ConferenceDetailsTargetsTab({ conferenceId, conferenceName, meetingAttendeeIds }: Props) {
  const [targetMap, setTargetMap] = useState<Map<number, TargetEntry>>(new Map());
  const [allAttendees, setAllAttendees] = useState<AttendeeRaw[]>([]);
  const [seniorityMap, setSeniorityMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/conferences/${conferenceId}/targets`).then(r => r.ok ? r.json() : []),
      fetch(`/api/conferences/${conferenceId}`).then(r => r.ok ? r.json() : {}),
      fetch('/api/config?category=seniority').then(r => r.ok ? r.json() : []),
    ])
      .then(([targets, confData, senOptions]) => {
        // Targets
        const tMap = new Map<number, TargetEntry>();
        for (const t of (targets as TargetEntry[])) tMap.set(t.attendeeId, t);
        setTargetMap(tMap);

        // Conference attendees
        const attendees: AttendeeRaw[] = ((confData as { attendees?: AttendeeRaw[] }).attendees ?? []);
        setAllAttendees(attendees);

        // Seniority ID → label map
        const sMap = new Map<string, string>();
        for (const o of (senOptions as { id: number; value: string }[])) {
          sMap.set(String(o.id), o.value);
        }
        setSeniorityMap(sMap);
      })
      .catch(() => {})
      .finally(() => { setLoading(false); setLoadingAttendees(false); });
  }, [conferenceId]);

  // Build grouped attendee list for the "+ Target" dropdown, excluding existing targets
  const addableGroups = useMemo<AddableGroup[]>(() => {
    if (loadingAttendees) return [];

    const g1: AttendeeRaw[] = [];
    const g2: AttendeeRaw[] = [];
    const g3: AttendeeRaw[] = [];
    const g4: AttendeeRaw[] = [];

    for (const a of allAttendees) {
      if (targetMap.has(a.id)) continue;

      const sen = resolveAttSeniority(a.seniority, a.title, seniorityMap);
      const ct = (a.company_type ?? '').toLowerCase();
      const isOperator = ct.includes('operator');
      const isCapital = ct.includes('capital');

      if (sen === 'C-Suite' && isOperator) g1.push(a);
      else if ((sen === 'VP/SVP' || sen === 'SVP' || sen === 'VP') && isOperator) g2.push(a);
      else if (isCapital) g3.push(a);
      else g4.push(a);
    }

    const byFirstName = (a: AttendeeRaw, b: AttendeeRaw) => a.first_name.localeCompare(b.first_name);
    const toAddable = (arr: AttendeeRaw[]) =>
      arr.sort(byFirstName).map(a => ({
        id: a.id,
        firstName: a.first_name,
        lastName: a.last_name,
        title: a.title ?? null,
        seniority: resolveAttSeniority(a.seniority, a.title, seniorityMap),
        companyName: a.company_name ?? null,
        companyId: a.company_id ?? null,
      }));

    return (
      [
        { label: 'C-Suite · Operator', attendees: toAddable(g1) },
        { label: 'VP/SVP · Operator', attendees: toAddable(g2) },
        { label: 'Capital', attendees: toAddable(g3) },
        { label: 'Other', attendees: toAddable(g4) },
      ] as AddableGroup[]
    ).filter(g => g.attendees.length > 0);
  }, [allAttendees, targetMap, seniorityMap, loadingAttendees]);

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

  // Batch-add multiple attendees as Unassigned targets
  const addTargets = useCallback(async (entries: Array<Omit<TargetEntry, 'tier'>>) => {
    setTargetMap(prev => {
      const next = new Map(prev);
      for (const e of entries) next.set(e.attendeeId, { ...e, tier: 'unassigned' });
      return next;
    });
    await Promise.all(
      entries.map(e =>
        fetch(`/api/conferences/${conferenceId}/targets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendee_id: e.attendeeId }),
        }).catch(() => {}),
      ),
    );
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
      addableGroups={addableGroups}
      onAddTargets={addTargets}
      loadingAddAttendees={loadingAttendees}
    />
  );
}
