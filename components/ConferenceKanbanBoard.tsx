'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { computeConferenceStage, postConferenceDaysRemaining } from '@/lib/conference-stage';
import type { ConferenceStage } from '@/lib/conference-stage';
import { ConferenceStageBadge } from '@/components/ConferenceStageBadge';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes?: string;
  internal_attendees?: string;
  attendee_count: number;
  is_historical?: number | null;
  post_conference_days?: number | null;
  stage_override?: string | null;
  territory_scope?: string | null;
  territory_ids?: string | null;
  conference_type?: string | null;
}

interface TerritoryOption {
  id: number;
  name: string;
  color: string;
}

interface EffData {
  ces_score: number | null;
  ams_score: number | null;
  cef_score: number | null;
  ses_score: number | null;
  ces_tier: string | null;
}

// ─── Session-level caches (persist across tab switches) ───────────────────────
const effCache = new Map<number, EffData | 'error'>();

// ─── Column config ────────────────────────────────────────────────────────────
const COLUMNS: Array<{ stage: ConferenceStage; label: string; headerCls: string; countCls: string }> = [
  { stage: 'planning',        label: 'Planning',        headerCls: 'bg-blue-50  border-blue-200  text-blue-800',  countCls: 'bg-blue-100  text-blue-700'  },
  { stage: 'in_progress',     label: 'In Progress',     headerCls: 'bg-green-50 border-green-200 text-green-800', countCls: 'bg-green-100 text-green-700' },
  { stage: 'post_conference', label: 'Post-Conference', headerCls: 'bg-amber-50 border-amber-200 text-amber-800', countCls: 'bg-amber-100 text-amber-700' },
  { stage: 'closed',          label: 'Closed',          headerCls: 'bg-gray-50  border-gray-200  text-gray-700',  countCls: 'bg-gray-100  text-gray-600'  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.substring(0, 2).toUpperCase() || '';
}

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Same abbreviation rule as the Plan tab's Territory column: two-or-more-word
// names use the first letter of each of the first two words ("Great Lakes" ->
// "GL"); one-word names use just their first letter ("West" -> "W"), except
// compound direction names where "east"/"west" follows a prefix ("Southeast"
// -> "SE", "Northwest" -> "NW").
function abbreviateTerritory(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const word = words[0];
  const lower = word.toLowerCase();
  const eastIdx = lower.indexOf('east');
  const westIdx = lower.indexOf('west');
  if (eastIdx > 0) return (word[0] + 'E').toUpperCase();
  if (westIdx > 0) return (word[0] + 'W').toUpperCase();
  return word[0].toUpperCase();
}

// Same circular chip style as the Plan tab's Territory column — National in
// brand-primary, Regional in that territory's own color.
function TerritoryChip({ conf, territories }: { conf: Conference; territories: TerritoryOption[] }) {
  if (conf.territory_scope === 'national') {
    return (
      <span
        title="National"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          border: '1.5px solid rgb(var(--brand-primary-rgb))',
          background: 'rgb(var(--brand-primary-rgb) / 0.12)',
          color: 'rgb(var(--brand-primary-rgb))',
          fontSize: 9, fontWeight: 700,
        }}
      >
        NT
      </span>
    );
  }
  if (conf.territory_scope === 'regional') {
    let territoryIds: number[] = [];
    try {
      const parsed = JSON.parse(conf.territory_ids ?? '[]');
      if (Array.isArray(parsed)) territoryIds = parsed.map(Number).filter((n) => !isNaN(n));
    } catch { /* ignore */ }
    const matched = territories.filter((t) => territoryIds.includes(t.id));
    if (matched.length === 0) return null;
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {matched.map((t) => (
          <span
            key={t.id}
            title={t.name}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              border: `1.5px solid ${t.color}`, background: `${t.color}1E`, color: t.color,
              fontSize: 9, fontWeight: 700,
            }}
          >
            {abbreviateTerritory(t.name)}
          </span>
        ))}
      </div>
    );
  }
  return null;
}

function scoreTier(score: number | null): string {
  if (score == null) return '';
  if (score >= 90) return 'Exceptional';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Acceptable';
  if (score >= 50) return 'Weak';
  return 'Inefficient';
}

function tierPillCls(tier: string): string {
  switch (tier) {
    case 'Exceptional': return 'bg-emerald-100 text-emerald-800';
    case 'Strong':      return 'bg-green-100   text-green-800';
    case 'Acceptable':  return 'bg-yellow-100  text-yellow-800';
    case 'Weak':        return 'bg-orange-100  text-orange-800';
    default:            return 'bg-red-100     text-red-800';
  }
}

function ScoreCell({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">{label}</span>
      <span className="text-sm font-bold text-gray-800 leading-none">
        {score != null ? score : <span className="text-gray-300">—</span>}
      </span>
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────
function hasTerritoryData(conf: Conference): boolean {
  if (conf.territory_scope === 'national') return true;
  if (conf.territory_scope === 'regional') {
    try {
      const parsed = JSON.parse(conf.territory_ids ?? '[]');
      return Array.isArray(parsed) && parsed.length > 0;
    } catch { return false; }
  }
  return false;
}

function PlanningCard({ conf, territories }: { conf: Conference; territories: TerritoryOption[] }) {
  const daysRem = undefined; // planning/in_progress don't need countdown
  if (!hasTerritoryData(conf) && !conf.conference_type) {
    return <KanbanCard conf={conf} daysRem={daysRem} />;
  }
  return (
    <KanbanCard conf={conf} daysRem={daysRem}>
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
        <TerritoryChip conf={conf} territories={territories} />
        {conf.conference_type && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-300 truncate max-w-[140px]">
            {conf.conference_type}
          </span>
        )}
      </div>
    </KanbanCard>
  );
}

function EffectivenessCard({
  conf,
  effData,
  onRetry,
}: {
  conf: Conference;
  effData: EffData | 'error' | undefined;
  onRetry: () => void;
}) {
  const daysRem = postConferenceDaysRemaining({
    end_date: conf.end_date,
    post_conference_days: conf.post_conference_days ?? null,
  });
  const stage = computeConferenceStage({
    start_date: conf.start_date,
    end_date: conf.end_date,
    post_conference_days: conf.post_conference_days ?? null,
    stage_override: conf.stage_override ?? null,
  });

  return (
    <KanbanCard conf={conf} daysRem={stage === 'post_conference' ? daysRem : undefined}>
      {effData && effData !== 'error' && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="grid grid-cols-4 gap-1 mb-1.5">
            <ScoreCell label="CES"  score={effData.ces_score} />
            <ScoreCell label="AMS"  score={effData.ams_score} />
            <ScoreCell label="CEF"  score={effData.cef_score} />
            <ScoreCell label="SES"  score={effData.ses_score} />
          </div>
          {effData.ces_tier && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${tierPillCls(effData.ces_tier)}`}>
              {effData.ces_tier}
            </span>
          )}
        </div>
      )}
      {effData === 'error' && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
          <p className="text-[10px] text-red-500 flex-1">Scores unavailable</p>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRetry(); }}
            className="text-[10px] text-brand-secondary hover:underline flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}
      {effData === undefined && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="grid grid-cols-4 gap-1">
            {['CES','AMS','CEF','SES'].map((l) => (
              <div key={l} className="flex flex-col items-center">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">{l}</span>
                <div className="w-6 h-3 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      )}
    </KanbanCard>
  );
}

function KanbanCard({
  conf,
  daysRem,
  children,
}: {
  conf: Conference;
  daysRem?: number;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={`/conferences/${conf.id}`}
      className="block card p-3 hover:shadow-md transition-all hover:border-brand-secondary border border-transparent group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-brand-primary group-hover:text-brand-secondary font-serif leading-snug line-clamp-2">
            {conf.name}
          </h4>
          <div className="mt-1 space-y-0.5">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span className="truncate">
                {formatDate(conf.start_date)}
                {conf.end_date && conf.end_date !== conf.start_date ? ` – ${formatDate(conf.end_date)}` : ''}
              </span>
            </div>
            {daysRem != null && (
              <p className={`text-[10px] font-medium ${daysRem <= 2 ? 'text-red-600' : 'text-amber-600'}`}>
                Closes in {daysRem}d
              </p>
            )}
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span className="truncate">{conf.location}</span>
            </div>
          </div>
          {conf.internal_attendees && (
            <div className="flex flex-wrap gap-1 mt-2">
              {conf.internal_attendees.split(',').filter(Boolean).map((u, i) => (
                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-[10px] text-gray-500">
                  {getInitials(u.trim())}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-center min-w-[36px]">
          {conf.attendee_count === 0 ? (
            <svg className="w-4 h-4 text-amber-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z"/>
            </svg>
          ) : (
            <>
              <p className="text-sm font-bold text-brand-primary font-serif leading-none">{conf.attendee_count}</p>
              <p className="text-[9px] text-gray-400 leading-none mt-0.5">att.</p>
            </>
          )}
        </div>
      </div>
      {children}
    </Link>
  );
}

// ─── Empty column state ───────────────────────────────────────────────────────
function EmptyColumn({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <svg className="w-8 h-8 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
      </svg>
      <p className="text-xs text-gray-400">No {label} conferences</p>
    </div>
  );
}

// ─── Loading progress bar ─────────────────────────────────────────────────────
function LoadingBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-4 h-4 border-2 border-blue-400/40 border-t-blue-500 animate-spin rounded-full flex-shrink-0" />
        <span className="text-sm font-medium text-blue-700">Loading effectiveness scores…</span>
        <span className="ml-auto text-sm text-blue-600 tabular-nums">{completed} of {total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-blue-500 mt-1.5">Populating as each conference is processed.</p>
    </div>
  );
}

// ─── Main board ───────────────────────────────────────────────────────────────
export function ConferenceKanbanBoard({ conferences }: { conferences: Conference[] }) {
  // Filters
  const [filterRep, setFilterRep]       = useState('');
  const [filterYear, setFilterYear]     = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Score data state (keyed by conf id)
  const [effData,   setEffData]   = useState<Map<number, EffData | 'error'>>(new Map(effCache));
  const [effCount,  setEffCount]  = useState(0);
  const effTotalRef = useRef(0);
  const [territories, setTerritories] = useState<TerritoryOption[]>([]);

  useEffect(() => {
    fetch('/api/admin/territories')
      .then(r => r.ok ? r.json() : { territories: [] })
      .then((data: { territories: TerritoryOption[] }) => setTerritories(data.territories ?? []))
      .catch(() => {});
  }, []);

  // Derived: separate conferences by stage, excluding historical
  const { byStage, incomplete } = useMemo(() => {
    const groups: Record<ConferenceStage, Conference[]> = {
      planning: [], in_progress: [], post_conference: [], closed: [],
    };
    const inc: Conference[] = [];
    for (const c of conferences) {
      if (c.is_historical) continue;
      if (!c.start_date || !c.end_date) { inc.push(c); continue; }
      try {
        const stage = computeConferenceStage({
          start_date: c.start_date,
          end_date: c.end_date,
          post_conference_days: c.post_conference_days ?? null,
          stage_override: c.stage_override ?? null,
        });
        groups[stage].push(c);
      } catch {
        inc.push(c);
      }
    }
    return { byStage: groups, incomplete: inc };
  }, [conferences]);

  // Filter options derived from ALL non-historical conferences
  const repOptions = useMemo(() => {
    const s = new Set<string>();
    conferences.forEach((c) => {
      if (c.is_historical) return;
      (c.internal_attendees || '').split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => s.add(v));
    });
    return Array.from(s).sort();
  }, [conferences]);

  const yearOptions = useMemo(() => {
    const s = new Set<string>();
    conferences.forEach((c) => {
      if (c.is_historical) return;
      s.add(new Date(c.start_date + 'T00:00:00').getFullYear().toString());
    });
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [conferences]);

  // Apply filters to each column
  const filtered = useMemo(() => {
    const q = filterSearch.toLowerCase();
    function keep(c: Conference): boolean {
      if (filterYear) {
        if (new Date(c.start_date + 'T00:00:00').getFullYear().toString() !== filterYear) return false;
      }
      if (filterRep) {
        const atts = (c.internal_attendees || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!atts.includes(filterRep)) return false;
      }
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    }
    return {
      planning:        byStage.planning.filter(keep),
      in_progress:     byStage.in_progress.filter(keep),
      post_conference: byStage.post_conference.filter(keep),
      closed:          byStage.closed.filter(keep),
    };
  }, [byStage, filterRep, filterYear, filterSearch]);

  // Lazy load effectiveness scores for post_conference + closed
  useEffect(() => {
    const targets = [...byStage.post_conference, ...byStage.closed].filter(
      (c) => !effCache.has(c.id)
    );
    if (targets.length === 0) return;

    effTotalRef.current = targets.length;
    let done = 0;

    (async () => {
      for (const c of targets) {
        try {
          const res = await fetch(`/api/conferences/${c.id}/effectiveness`);
          if (!res.ok) throw new Error('failed');
          const data = await res.json();
          const repCesScores: number[] = (data?.operational?.rep_ces ?? [])
            .map((r: Record<string, unknown>) => r.rep_ces_score)
            .filter((v: unknown): v is number => typeof v === 'number');
          const ses =
            repCesScores.length > 0
              ? Math.round(repCesScores.reduce((a, b) => a + b, 0) / repCesScores.length)
              : null;
          const cesScore = data?.ces?.score != null ? Math.round(Number(data.ces.score)) : null;
          const parsed: EffData = {
            ces_score: cesScore,
            ams_score: data?.marketing_audience?.marketing_audience_signal_score != null
              ? Math.round(Number(data.marketing_audience.marketing_audience_signal_score))
              : null,
            cef_score: data?.operational?.cost_efficiency?.cost_efficiency_score != null
              ? Math.round(Number(data.operational.cost_efficiency.cost_efficiency_score))
              : null,
            ses_score: ses,
            ces_tier: cesScore != null ? scoreTier(cesScore) : null,
          };
          effCache.set(c.id, parsed);
        } catch {
          effCache.set(c.id, 'error');
        }
        done++;
        const doneCopy = done;
        setEffData(new Map(effCache));
        setEffCount(doneCopy);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byStage.post_conference.length, byStage.closed.length]);

  const effTotal = effTotalRef.current;
  const needsEffLoading =
    [...byStage.post_conference, ...byStage.closed].some((c) => !effCache.has(c.id));
  const loadingInProgress = needsEffLoading && effCount < effTotal;

  function retryEff(id: number) {
    effCache.delete(id);
    setEffData((prev) => { const next = new Map(prev); next.delete(id); return next; });
    // Re-trigger the effect by bumping a counter would need external state;
    // simplest: just refetch directly
    fetch(`/api/conferences/${id}/effectiveness`)
      .then((r) => { if (!r.ok) throw new Error('failed'); return r.json(); })
      .then((data) => {
        const repCesScores: number[] = (data?.operational?.rep_ces ?? [])
          .map((r: Record<string, unknown>) => r.rep_ces_score)
          .filter((v: unknown): v is number => typeof v === 'number');
        const ses =
          repCesScores.length > 0
            ? Math.round(repCesScores.reduce((a, b) => a + b, 0) / repCesScores.length)
            : null;
        const cesScore = data?.ces?.score != null ? Math.round(Number(data.ces.score)) : null;
        const parsed: EffData = {
          ces_score: cesScore,
          ams_score: data?.marketing_audience?.marketing_audience_signal_score != null
            ? Math.round(Number(data.marketing_audience.marketing_audience_signal_score))
            : null,
          cef_score: data?.operational?.cost_efficiency?.cost_efficiency_score != null
            ? Math.round(Number(data.operational.cost_efficiency.cost_efficiency_score))
            : null,
          ses_score: ses,
          ces_tier: cesScore != null ? scoreTier(cesScore) : null,
        };
        effCache.set(id, parsed);
        setEffData(new Map(effCache));
      })
      .catch(() => {
        effCache.set(id, 'error');
        setEffData(new Map(effCache));
      });
  }

  const hasFilters = !!(filterRep || filterYear || filterSearch);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          placeholder="Search conferences…"
          className="input-field text-sm w-52"
        />
        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="input-field text-sm w-32"
        >
          <option value="">All years</option>
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={filterRep}
          onChange={(e) => setFilterRep(e.target.value)}
          className="input-field text-sm w-44"
        >
          <option value="">All reps</option>
          {repOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterRep(''); setFilterYear(''); setFilterSearch(''); }}
            className="text-xs text-brand-secondary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Loading bar */}
      {loadingInProgress && (
        <LoadingBar completed={effCount} total={effTotal} />
      )}

      {/* Kanban board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 overflow-x-auto">
        {COLUMNS.map(({ stage, label, headerCls, countCls }) => {
          const items = filtered[stage];
          return (
            <div key={stage} className="flex flex-col min-w-[260px]">
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg border mb-3 ${headerCls}`}>
                <span className="text-sm font-semibold">{label}</span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${countCls}`}>
                  {items.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 flex-1">
                {items.length === 0 ? (
                  <EmptyColumn label={label} />
                ) : (
                  items.map((conf) => {
                    if (stage === 'planning' || stage === 'in_progress') {
                      return (
                        <PlanningCard
                          key={conf.id}
                          conf={conf}
                          territories={territories}
                        />
                      );
                    }
                    return (
                      <EffectivenessCard
                        key={conf.id}
                        conf={conf}
                        effData={effData.get(conf.id)}
                        onRetry={() => retryEff(conf.id)}
                      />
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Incomplete / missing-date conferences */}
      {incomplete.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Incomplete Data ({incomplete.length})</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {incomplete.map((conf) => (
              <KanbanCard key={conf.id} conf={conf} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
