'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardDrawer } from '@/components/DashboardDrawer';

interface AttendeeRaw {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  company_id: number | null;
  company_name: string | null;
  company_type?: string | null;
}

interface Addable {
  id: number;
  firstName: string;
  lastName: string;
  title: string | null;
  companyName: string | null;
  companyId: number | null;
}

interface Group { label: string; attendees: Addable[] }

/** The recommendation tiers, best first. Mirrors the conference targets tab. */
const TIER_ORDER = ['must_target', 'high_priority', 'worth_engaging', 'monitor', 'low_priority'] as const;
const TIER_LABELS: Record<string, string> = {
  must_target: 'Must Target',
  high_priority: 'High Priority',
  worth_engaging: 'Worth Engaging',
  monitor: 'Monitor',
  low_priority: 'Low Priority',
};
/** What each recommendation tier means as a conference target tier. */
const TIER_TO_CONF_TIER: Record<string, string> = {
  must_target: '1', high_priority: '2', worth_engaging: '3',
  monitor: 'unassigned', low_priority: 'unassigned', unscored: 'unassigned',
};

/**
 * Adding targets from the phone. The dashboard's Targets card had no way to do
 * it at all — you had to open the conference to add anyone.
 *
 * Grouped by target recommendation where there is one. Attendees whose company
 * hasn't been scored fall back to their company type, ICP types first in the
 * order the admin set them, and everything left over lands in Other — so the
 * list is still ordered by how much the company looks like a customer rather
 * than dumping the unscored in one heap.
 */
export function DashboardAddTargetsDrawer({
  conferenceId, conferenceName, existingTargetIds, onClose, onAdded,
}: {
  conferenceId: number;
  conferenceName: string;
  /** Already targets — they don't need adding again. */
  existingTargetIds: Set<number>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [attendees, setAttendees] = useState<AttendeeRaw[]>([]);
  const [tierByCompany, setTierByCompany] = useState<Map<number, { tierKey: string; score: number }>>(new Map());
  const [icpTypes, setIcpTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/conferences/${conferenceId}`).then(r => (r.ok ? r.json() : {})),
      // The company types the admin marked as ICP, in the order they set them.
      fetch('/api/admin/icp-rules').then(r => (r.ok ? r.json() : { rules: [] })),
    ])
      .then(([conf, icp]) => {
        setAttendees(((conf as { attendees?: AttendeeRaw[] }).attendees ?? []));
        const rules = (icp as { rules?: { category: string; conditions: { option_value: string }[] }[] }).rules ?? [];
        setIcpTypes(
          rules.filter(r => r.category === 'company_type')
            .flatMap(r => r.conditions.map(c => String(c.option_value ?? '').trim()))
            .filter(Boolean),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Scores arrive in batches, same as the conference tab — the list fills in
    // rather than making the reader wait for every company.
    let cancelled = false;
    (async () => {
      let offset = 0;
      try {
        while (!cancelled) {
          const params = new URLSearchParams({ batch: '1', offset: String(offset), limit: '25' });
          const res = await fetch(`/api/conferences/${conferenceId}/targeting?${params}`, { cache: 'no-store' });
          if (!res.ok || cancelled) break;
          const data = await res.json() as {
            companies?: Array<{ company_id: number; target_priority_tier_key: string; target_priority_score: number }>;
            pagination?: { has_more: boolean; next_offset: number | null };
          };
          if (cancelled) break;
          setTierByCompany(prev => {
            const next = new Map(prev);
            for (const c of data.companies ?? []) {
              next.set(c.company_id, { tierKey: c.target_priority_tier_key ?? 'unscored', score: c.target_priority_score ?? 0 });
            }
            return next;
          });
          setLoadingTiers(false);
          if (!data.pagination?.has_more || data.pagination.next_offset == null) break;
          offset = data.pagination.next_offset;
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoadingTiers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [conferenceId]);

  const groups = useMemo<Group[]>(() => {
    const term = search.trim().toLowerCase();
    const matches = (a: AttendeeRaw) => {
      if (!term) return true;
      return `${a.first_name} ${a.last_name}`.toLowerCase().includes(term)
        || (a.company_name ?? '').toLowerCase().includes(term)
        || (a.title ?? '').toLowerCase().includes(term);
    };
    const shape = (a: AttendeeRaw): Addable => ({
      id: a.id, firstName: a.first_name, lastName: a.last_name,
      title: a.title ?? null, companyName: a.company_name ?? null, companyId: a.company_id ?? null,
    });

    const byTier = new Map<string, Map<number, { score: number; rows: AttendeeRaw[] }>>();
    for (const k of TIER_ORDER) byTier.set(k, new Map());
    // No recommendation for these — grouped by company type below.
    const byType = new Map<string, AttendeeRaw[]>();

    for (const a of attendees) {
      if (existingTargetIds.has(a.id)) continue;
      if (!matches(a)) continue;
      const info = a.company_id ? tierByCompany.get(a.company_id) : undefined;
      if (info && byTier.has(info.tierKey)) {
        const bucket = byTier.get(info.tierKey)!;
        const cid = a.company_id ?? 0;
        if (!bucket.has(cid)) bucket.set(cid, { score: info.score, rows: [] });
        bucket.get(cid)!.rows.push(a);
      } else {
        const type = (a.company_type ?? '').trim();
        const key = type || 'Other';
        if (!byType.has(key)) byType.set(key, []);
        byType.get(key)!.push(a);
      }
    }

    const out: Group[] = [];
    for (const k of TIER_ORDER) {
      const bucket = byTier.get(k)!;
      const rows = Array.from(bucket.values())
        .sort((a, b) => b.score - a.score)
        .flatMap(({ rows: rs }) => [...rs].sort((a, b) => a.first_name.localeCompare(b.first_name)).map(shape));
      if (rows.length > 0) out.push({ label: TIER_LABELS[k], attendees: rows });
    }

    // ICP company types in the admin's own order, then anything else by name,
    // then Other last — it's the bucket for people with no company type at all.
    const typeKeys = Array.from(byType.keys()).filter(k => k !== 'Other');
    const icpLower = icpTypes.map(t => t.toLowerCase());
    typeKeys.sort((a, b) => {
      const ai = icpLower.indexOf(a.toLowerCase());
      const bi = icpLower.indexOf(b.toLowerCase());
      if (ai !== bi) return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
      return a.localeCompare(b);
    });
    for (const k of [...typeKeys, ...(byType.has('Other') ? ['Other'] : [])]) {
      const rows = [...byType.get(k)!].sort((a, b) => a.first_name.localeCompare(b.first_name)).map(shape);
      if (rows.length > 0) out.push({ label: k, attendees: rows });
    }
    return out;
  }, [attendees, tierByCompany, existingTargetIds, search, icpTypes]);

  // A search narrows things to the point that collapsed groups just hide the
  // answer, so results open themselves.
  const isOpen = (label: string) => (search.trim() ? true : expanded.has(label));

  const handleAdd = async () => {
    if (selectedIds.size === 0) return;
    setPending(true);
    const picked = groups.flatMap(g => g.attendees).filter(a => selectedIds.has(a.id));
    try {
      await Promise.all(picked.map(a => {
        const info = a.companyId ? tierByCompany.get(a.companyId) : undefined;
        const tier = TIER_TO_CONF_TIER[info?.tierKey ?? 'unscored'] ?? 'unassigned';
        return fetch(`/api/conferences/${conferenceId}/targets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendee_id: a.id, tier }),
        });
      }));
      onAdded();
      onClose();
    } catch {
      setPending(false);
    }
  };

  return (
    <DashboardDrawer
      title={<h3 className="text-sm font-semibold text-brand-primary font-serif truncate">Add Targets</h3>}
      subtitle={conferenceName}
      onClose={onClose}
    >
      <div className="flex flex-col min-h-full">
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 space-y-2 sticky top-0 bg-white z-20">
        <div className="relative">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, company, or title…"
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand-secondary"
          />
        </div>
        <div className="flex items-center justify-between">
          {groups.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                const labels = groups.map(g => g.label);
                setExpanded(labels.every(l => expanded.has(l)) ? new Set() : new Set(labels));
              }}
              className="text-xs text-brand-secondary hover:text-brand-primary transition-colors font-medium"
            >
              {groups.every(g => expanded.has(g.label)) ? 'Collapse all' : 'Expand all'}
            </button>
          ) : <span />}
          <span className="text-xs text-gray-400">{selectedIds.size} selected</span>
        </div>
      </div>

      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-xs">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            Loading attendees…
          </div>
        ) : groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-gray-400">
            {search.trim() ? 'Nobody matches that search.' : 'Every attendee is already a target.'}
          </p>
        ) : groups.map(group => {
          const open = isOpen(group.label);
          const selectedInGroup = group.attendees.filter(a => selectedIds.has(a.id)).length;
          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => setExpanded(prev => {
                  const next = new Set(prev);
                  if (next.has(group.label)) next.delete(group.label); else next.add(group.label);
                  return next;
                })}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100 sticky top-0 z-10 hover:bg-gray-100 transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider truncate">{group.label}</span>
                  <span className="text-xs text-gray-400">({group.attendees.length})</span>
                  {selectedInGroup > 0 && <span className="text-xs font-semibold text-brand-secondary">{selectedInGroup} selected</span>}
                </span>
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {open && group.attendees.map(a => (
                <label key={a.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer select-none border-b border-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => setSelectedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                      return next;
                    })}
                    className="mt-0.5 flex-shrink-0 accent-brand-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-gray-800 leading-tight">
                      {a.firstName} {a.lastName}
                      {a.title && <span className="font-normal text-gray-500">, {a.title}</span>}
                    </span>
                    {a.companyName && <span className="block text-xs text-gray-400 truncate mt-0.5">{a.companyName}</span>}
                  </span>
                </label>
              ))}
            </div>
          );
        })}
        {loadingTiers && !loading && (
          <div className="flex items-center gap-2 px-4 py-3 text-gray-400 text-xs border-t border-gray-100">
            <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            Loading recommendations…
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-2 flex-shrink-0 sticky bottom-0 bg-white">
        <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={selectedIds.size === 0 || pending}
          className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Adding…' : `Add${selectedIds.size > 0 ? ` ${selectedIds.size}` : ''} Target${selectedIds.size !== 1 ? 's' : ''}`}
        </button>
      </div>
      </div>
    </DashboardDrawer>
  );
}
