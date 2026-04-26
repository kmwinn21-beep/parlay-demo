'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { TargetBtn } from './TargetBtn';
import type { TargetEntry } from '../PreConferenceReview';
import type { ParlayRec, ParlayRecsData } from '@/app/api/conferences/[id]/parlay-recommendations/route';

const MAX_RELOADS = 5;

const PRIORITY_STYLES = {
  High: {
    border: 'border-red-200',
    bg: 'bg-red-50',
    text: 'text-red-600',
    count: 'text-red-600',
    label: 'High Priority',
  },
  Medium: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    count: 'text-amber-600',
    label: 'Medium Priority',
  },
  Watch: {
    border: 'border-gray-200',
    bg: 'bg-gray-50',
    text: 'text-gray-500',
    count: 'text-gray-500',
    label: 'Watch',
  },
} as const;

function ParlayRecCard({
  rec,
  targetMap,
  onToggleTarget,
}: {
  rec: ParlayRec;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
}) {
  const [angleExpanded, setAngleExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all flex flex-col gap-3 overflow-hidden min-w-0 bg-white">
      {/* Header */}
      <div className="min-w-0">
        {rec.company_id ? (
          <Link
            href={`/companies/${rec.company_id}`}
            className="font-semibold text-gray-900 hover:text-brand-secondary transition-colors text-sm block truncate"
          >
            {rec.company_name}
          </Link>
        ) : (
          <p className="font-semibold text-gray-900 text-sm truncate">{rec.company_name}</p>
        )}
        <span className="text-xs text-gray-500">{rec.relationship_status}</span>
      </div>

      {/* AI reasoning — replaces description */}
      {rec.why_target.length > 0 && (
        <ul className="space-y-1.5">
          {rec.why_target.map((reason, i) => (
            <li key={i} className="text-xs text-gray-600 flex gap-1.5 items-start">
              <span className="text-brand-secondary mt-0.5 flex-shrink-0">·</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Opening angle — expandable */}
      {rec.suggested_opening_angle && (
        <div className="border-l-2 border-brand-secondary/30 pl-2">
          <p className={`text-xs text-gray-500 italic${angleExpanded ? '' : ' line-clamp-3'}`}>
            {rec.suggested_opening_angle}
          </p>
          <button
            onClick={() => setAngleExpanded(e => !e)}
            className="text-xs text-brand-secondary/70 hover:text-brand-secondary mt-0.5 transition-colors"
          >
            {angleExpanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}

      {/* Rep names */}
      {rec.rep_names.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rec.rep_names.map(name => (
            <span key={name} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
              {name}
            </span>
          ))}
        </div>
      )}

      {/* AT THIS CONFERENCE */}
      {rec.attendees.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">At This Conference</p>
          <div className="space-y-1">
            {rec.attendees.map(a => {
              const isTarget = targetMap.has(a.id);
              return (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  <Link
                    href={`/attendees/${a.id}`}
                    className="text-gray-700 truncate flex-1 hover:text-brand-secondary transition-colors"
                  >
                    {a.first_name} {a.last_name}{a.title ? ` · ${a.title}` : ''}
                  </Link>
                  <TargetBtn
                    isTarget={isTarget}
                    onClick={() => onToggleTarget({
                      attendeeId: a.id,
                      firstName: a.first_name,
                      lastName: a.last_name,
                      title: a.title,
                      seniority: a.seniority,
                      companyName: rec.company_name,
                      companyId: rec.company_id,
                      assignedUserNames: rec.rep_names,
                    })}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ParlayRecommendationsTab({
  conferenceId,
  targetMap,
  onToggleTarget,
}: {
  conferenceId: number;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
}) {
  const [data, setData] = useState<ParlayRecsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({ High: null, Medium: null, Watch: null });

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetch(`/api/conferences/${conferenceId}/parlay-recommendations`)
      .then(r => r.json())
      .then((json: { data: ParlayRecsData | null }) => {
        setData(json.data);
      })
      .catch(() => setError('Failed to load recommendations.'))
      .finally(() => setLoading(false));
  }, [conferenceId]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/parlay-recommendations`, { method: 'POST' });
      if (res.status === 429) {
        setError(`Maximum of ${MAX_RELOADS} regenerations reached.`);
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Failed to generate recommendations.');
        return;
      }
      const json = await res.json() as { data: ParlayRecsData };
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate recommendations.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <div>
          <p className="text-gray-800 font-semibold mb-1">No recommendations generated yet</p>
          <p className="text-sm text-gray-500 max-w-md">
            Parlay will analyze attending companies against your ICP profile and relationship history to surface the highest-value targets for this conference.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={generate}
          disabled={generating}
          className="btn-primary text-sm flex items-center gap-2"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Parlay is analyzing your conference…
            </>
          ) : 'Generate Recommendations'}
        </button>
      </div>
    );
  }

  const recs = data.recommendations ?? [];
  const highRecs = recs.filter(r => r.priority === 'High');
  const mediumRecs = recs.filter(r => r.priority === 'Medium');
  const watchRecs = recs.filter(r => r.priority === 'Watch');
  const reloadCount = data.reload_count ?? 0;
  const canReload = reloadCount < MAX_RELOADS;
  const scrollToTier = (tier: string) => {
    sectionRefs.current[tier]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-4">
      {/* Stat cards — clickable, scroll to section */}
      <div className="grid grid-cols-3 gap-3">
        {(['High', 'Medium', 'Watch'] as const).map(tier => {
          const count = recs.filter(r => r.priority === tier).length;
          const s = PRIORITY_STYLES[tier];
          return (
            <button
              key={tier}
              onClick={() => scrollToTier(tier)}
              className={`border-2 ${s.border} ${s.bg} rounded-xl p-3 text-center transition-opacity hover:opacity-75 active:opacity-60`}
            >
              <div className={`text-2xl font-bold ${s.count}`}>{count}</div>
              <div className="text-xs font-semibold text-gray-500">{s.label}</div>
            </button>
          );
        })}
      </div>

      {/* Generated timestamp */}
      <p className="text-xs text-gray-400">
        Generated {new Date(data.generated_at).toLocaleString()}
      </p>

      {/* Reload controls — below cards so they don't crowd the layout */}
      <div className="flex items-center gap-3">
        {canReload ? (
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand-secondary transition-colors disabled:opacity-50"
            title="Regenerate recommendations"
          >
            {generating ? (
              <div className="w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {generating ? 'Regenerating…' : 'Reload'}
          </button>
        ) : null}
        <span className="text-xs text-gray-400">
          {reloadCount} of {MAX_RELOADS} regenerations used
        </span>
        {error && <p className="text-xs text-red-600 ml-auto">{error}</p>}
      </div>

      {/* Three-column priority layout */}
      {recs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No recommendations returned.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {(['High', 'Medium', 'Watch'] as const).map(tier => {
            const tierRecs = tier === 'High' ? highRecs : tier === 'Medium' ? mediumRecs : watchRecs;
            const s = PRIORITY_STYLES[tier];
            return (
              <div key={tier} ref={el => { sectionRefs.current[tier] = el; }}>
                <h3 className={`text-xs font-bold uppercase tracking-wide mb-3 ${s.text}`}>
                  {tier} · {tierRecs.length}
                </h3>
                <div className="space-y-4">
                  {tierRecs.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">None</p>
                  ) : (
                    tierRecs.map(rec => (
                      <ParlayRecCard
                        key={rec.company_name}
                        rec={rec}
                        targetMap={targetMap}
                        onToggleTarget={onToggleTarget}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ICP Companies to Watch */}
      {data.watch_list.length > 0 && (
        <details className="mt-2">
          <summary className="text-sm font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700 transition-colors">
            ⚠️ ICP Companies to Watch — {data.watch_list.length}
          </summary>
          <ul className="mt-3 space-y-1.5 pl-2">
            {data.watch_list.map(item => (
              <li key={item.company_name} className="text-sm text-gray-600">
                <span className="font-medium text-gray-800">{item.company_name}</span> — {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Notable Exclusions */}
      {data.exclusions.length > 0 && (
        <details className="mt-2">
          <summary className="text-sm font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-700 transition-colors">
            ❌ Notable Exclusions — {data.exclusions.length}
          </summary>
          <ul className="mt-3 space-y-1.5 pl-2">
            {data.exclusions.map(item => (
              <li key={item.company_name} className="text-sm text-gray-600">
                <span className="font-medium text-gray-800">{item.company_name}</span> — {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
