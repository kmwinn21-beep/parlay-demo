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
  company_wse: number | null;
}

const TARGETING_TIER_TO_CONF_TIER: Record<string, string> = {
  must_target: '1',
  high_priority: '2',
  worth_engaging: '3',
  monitor: 'unassigned',
  low_priority: 'unassigned',
  unscored: 'unassigned',
};

interface CompanyTierInfo {
  tierKey: string;
  score: number;
}

interface Props {
  conferenceId: number;
  conferenceName: string;
  meetingAttendeeIds: Set<number>;
}

const TIER_GROUP_ORDER = ['must_target', 'high_priority', 'worth_engaging', 'monitor', 'low_priority', 'unscored'] as const;
const TIER_GROUP_LABELS: Record<string, string> = {
  must_target: 'Must Target',
  high_priority: 'High Priority',
  worth_engaging: 'Worth Engaging',
  monitor: 'Monitor',
  low_priority: 'Low Priority',
  unscored: 'Other',
};

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
  const [companyTierMap, setCompanyTierMap] = useState<Map<number, CompanyTierInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(true);

  useEffect(() => {
    // Phase 1: fast — load targets, attendees, seniority so the charts and
    // kanban render immediately without waiting for the slower targeting API.
    Promise.all([
      fetch(`/api/conferences/${conferenceId}/targets`).then(r => r.ok ? r.json() : []),
      fetch(`/api/conferences/${conferenceId}`).then(r => r.ok ? r.json() : {}),
      fetch('/api/config?category=seniority').then(r => r.ok ? r.json() : []),
    ])
      .then(([targets, confData, senOptions]) => {
        const tMap = new Map<number, TargetEntry>();
        for (const t of (targets as TargetEntry[])) tMap.set(t.attendeeId, t);
        setTargetMap(tMap);

        const attendees: AttendeeRaw[] = ((confData as { attendees?: AttendeeRaw[] }).attendees ?? []);
        setAllAttendees(attendees);

        const sMap = new Map<string, string>();
        for (const o of (senOptions as { id: number; value: string }[])) {
          sMap.set(String(o.id), o.value);
        }
        setSeniorityMap(sMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Phase 2: background — load targeting scores for the + Target dropdown.
    // loadingAttendees stays true until this resolves.
    fetch(`/api/conferences/${conferenceId}/targeting`)
      .then(r => r.ok ? r.json() : { companies: [] })
      .then((targetingData: { companies?: Array<{ company_id: number; target_priority_tier_key: string; target_priority_score: number }> }) => {
        const companies = targetingData.companies ?? [];
        const ctMap = new Map<number, CompanyTierInfo>();
        for (const c of companies) {
          ctMap.set(c.company_id, {
            tierKey: c.target_priority_tier_key ?? 'unscored',
            score: c.target_priority_score ?? 0,
          });
        }
        setCompanyTierMap(ctMap);
      })
      .catch(() => {})
      .finally(() => setLoadingAttendees(false));
  }, [conferenceId]);

  // Build grouped attendee list for the "+ Target" dropdown, excluding existing targets.
  // Groups ordered Must Target → High Priority → Worth Engaging → Monitor → Low Priority → Other.
  // Companies within each group sorted by target_priority_score descending.
  const addableGroups = useMemo<AddableGroup[]>(() => {
    if (loadingAttendees) return [];

    // Per-tier buckets: tierKey → companyId → { score, attendees }
    const tierBuckets = new Map<string, Map<number, { score: number; attendees: AttendeeRaw[] }>>();
    for (const tierKey of TIER_GROUP_ORDER) tierBuckets.set(tierKey, new Map());

    for (const a of allAttendees) {
      if (targetMap.has(a.id)) continue;
      const companyId = a.company_id ?? 0;
      const tierInfo = companyId > 0 ? companyTierMap.get(companyId) : undefined;
      const tierKey: string = tierInfo?.tierKey ?? 'unscored';
      const score = tierInfo?.score ?? 0;

      const bucket = tierBuckets.get(tierKey) ?? tierBuckets.get('unscored')!;
      if (!bucket.has(companyId)) bucket.set(companyId, { score, attendees: [] });
      bucket.get(companyId)!.attendees.push(a);
    }

    const groups: AddableGroup[] = [];
    for (const tierKey of TIER_GROUP_ORDER) {
      const companyMap = tierBuckets.get(tierKey);
      if (!companyMap || companyMap.size === 0) continue;

      // Sort companies by score descending, then flatten attendees
      const sortedCompanies = Array.from(companyMap.values())
        .sort((a, b) => b.score - a.score);

      const attendees = sortedCompanies.flatMap(({ attendees: atts }) =>
        [...atts]
          .sort((a, b) => a.first_name.localeCompare(b.first_name))
          .map(a => ({
            id: a.id,
            firstName: a.first_name,
            lastName: a.last_name,
            title: a.title ?? null,
            seniority: resolveAttSeniority(a.seniority, a.title, seniorityMap),
            companyName: a.company_name ?? null,
            companyId: a.company_id ?? null,
            companyWse: a.company_wse ?? null,
          }))
      );

      if (attendees.length > 0) {
        groups.push({ label: TIER_GROUP_LABELS[tierKey] ?? tierKey, attendees });
      }
    }

    return groups;
  }, [allAttendees, targetMap, seniorityMap, companyTierMap, loadingAttendees]);

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

  const addTargets = useCallback(async (entries: Array<Omit<TargetEntry, 'tier'>>) => {
    // Resolve the conference tier for each entry from its company's targeting tier
    const withTiers = entries.map(e => {
      const tierInfo = companyTierMap.get(e.companyId ?? 0);
      const tier = TARGETING_TIER_TO_CONF_TIER[tierInfo?.tierKey ?? 'unscored'] ?? 'unassigned';
      return { ...e, tier };
    });
    setTargetMap(prev => {
      const next = new Map(prev);
      for (const e of withTiers) next.set(e.attendeeId, e);
      return next;
    });
    await Promise.all(
      withTiers.map(e =>
        fetch(`/api/conferences/${conferenceId}/targets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendee_id: e.attendeeId, tier: e.tier }),
        }).catch(() => {}),
      ),
    );
  }, [conferenceId, companyTierMap]);

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
      conferenceId={conferenceId}
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
