'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AssignFollowUpModal } from '@/components/AssignFollowUpModal';
import type { CompanyRollupRow } from '../PostConferenceReview';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_PRIORITY: Record<string, number> = {
  '1': 0, 'must target': 0, 'must_target': 0,
  '2': 1, 'high priority': 1, 'high_priority': 1,
  '3': 2, 'worth engaging': 2, 'worth_engaging': 2,
  'unassigned': 3, 'monitor': 3,
};

const TIER_LABELS: Record<string, string> = {
  '1': 'Must Target', 'must target': 'Must Target', 'must_target': 'Must Target',
  '2': 'High Priority', 'high priority': 'High Priority', 'high_priority': 'High Priority',
  '3': 'Worth Engaging', 'worth engaging': 'Worth Engaging', 'worth_engaging': 'Worth Engaging',
  'unassigned': 'Monitor', 'monitor': 'Monitor',
};

function tierLabel(t: string | null): string {
  if (!t) return '';
  return TIER_LABELS[t.toLowerCase()] ?? t;
}

function tierPill(t: string | null) {
  if (!t) return null;
  const label = tierLabel(t);
  const key = t.toLowerCase();
  const cls =
    key === '1' || key.includes('must') ? 'bg-red-100 text-red-700 border-red-200' :
    key === '2' || key.includes('high') ? 'bg-purple-100 text-purple-700 border-purple-200' :
    key === '3' || key.includes('worth') ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{label}</span>;
}

function healthColor(score: number): string {
  return score >= 75 ? '#059669' : score >= 50 ? '#f59e0b' : score >= 25 ? '#f97316' : '#ef4444';
}

function HealthBar({ score }: { score: number }) {
  const color = healthColor(score);
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="w-12 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className="h-1.5 rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>{score}</span>
    </div>
  );
}

function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">= flat</span>;
  const pos = delta > 0;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${pos ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
      {pos ? '+' : ''}{delta} pts
    </span>
  );
}

function BuyerRoleDot({ role }: { role: string | null }) {
  const color =
    role === 'decision_maker' ? '#9333ea' :
    role === 'influencer' ? '#0d9488' :
    role === 'target_title' ? '#f59e0b' :
    '#9ca3af';
  const title = role === 'decision_maker' ? 'Decision Maker' : role === 'influencer' ? 'Influencer' : role === 'target_title' ? 'Target Title' : 'Not mapped';
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: color }} title={title} />;
}

// Derive buyer role from seniority when no product signal exists
function deriveBuyerRole(seniority: string | null): string | null {
  if (!seniority) return null;
  const s = seniority.toLowerCase();
  if (s.includes('c-suite') || s.includes('vp') || s.includes('svp')) return 'decision_maker';
  if (s.includes('director')) return 'influencer';
  return null;
}

function formatPipeline(units: number | null, avgCostPerUnit: number): { value: string; subtitle: string; hasValue: boolean } {
  if (units == null) return { value: 'Units not set', subtitle: '', hasValue: false };
  if (avgCostPerUnit <= 0) return { value: 'Set cost per unit in admin settings', subtitle: '', hasValue: false };
  const total = Math.round(units * avgCostPerUnit);
  const rate = '$' + avgCostPerUnit.toLocaleString('en-US');
  return {
    value: '$' + total.toLocaleString('en-US'),
    subtitle: `${units.toLocaleString('en-US')} users · ${rate} / user / yr`,
    hasValue: true,
  };
}

function fuRatePct(created: number, completed: number): number | null {
  if (created === 0) return null;
  return Math.round((completed / created) * 100);
}

function FuRateDisplay({ created, completed, showBar = false }: { created: number; completed: number; showBar?: boolean }) {
  const pct = fuRatePct(created, completed);
  if (pct === null) return <span className="text-gray-400">—</span>;
  const color = pct >= 60 ? '#059669' : pct >= 30 ? '#f59e0b' : '#ef4444';
  if (!showBar) {
    return <span className="text-xs font-medium" style={{ color }}>{pct}%</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden flex-shrink-0">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

function CompanyAvatar({ name, companyType }: { name: string; companyType: string | null }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  // Color by company type key — deterministic hash for consistency
  const colors = [
    { bg: '#dbeafe', text: '#1e40af' },
    { bg: '#dcfce7', text: '#166534' },
    { bg: '#fce7f3', text: '#9d174d' },
    { bg: '#fef3c7', text: '#92400e' },
    { bg: '#ede9fe', text: '#5b21b6' },
    { bg: '#ccfbf1', text: '#134e4a' },
  ];
  const hash = (companyType ?? name).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const { bg, text } = colors[hash % colors.length];
  return (
    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold" style={{ backgroundColor: bg, color: text }}>
      {initials || '?'}
    </div>
  );
}

function EngagementBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    Meeting: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Follow-up': 'bg-amber-50 text-amber-700 border-amber-200',
    Touchpoint: 'bg-blue-50 text-blue-700 border-blue-200',
    Note: 'bg-purple-50 text-purple-700 border-purple-200',
    'No activity': 'bg-gray-100 text-gray-400 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${styles[type] ?? styles['No activity']}`}>
      {type}
    </span>
  );
}

// ── Company card ──────────────────────────────────────────────────────────────

function CompanyCard({
  row,
  avgCostPerUnit,
  conferenceId,
  conferenceName,
}: {
  row: CompanyRollupRow;
  avgCostPerUnit: number;
  conferenceId: number;
  conferenceName: string;
}) {
  const [open, setOpen] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const router = useRouter();

  const noActivity = row.meetings_held === 0 && row.touchpoints === 0 && row.notes_logged === 0 && row.follow_ups_created === 0;
  const pipeline = formatPipeline(row.units, avgCostPerUnit);

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Header row — always visible, click to expand */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
        >
          {/* Avatar */}
          <CompanyAvatar name={row.company_name} companyType={row.company_type} />

          {/* Name + subtitle */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{row.company_name}</p>
            <p className="text-xs text-gray-400 truncate">
              {[row.industry, row.units != null ? `${row.units.toLocaleString('en-US')} users` : 'units not set'].filter(Boolean).join(' · ')}
            </p>
          </div>

          {/* Right-side badges */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {row.icp === 'Yes' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">ICP</span>
            )}
            {row.target_tier && tierPill(row.target_tier)}
            <HealthBar score={row.health_score} />
            <DeltaChip delta={row.health_delta} />
            {noActivity && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">No activity</span>
            )}
            <svg
              className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Expanded body */}
        {open && (
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {/* 1. Activity grid */}
            <div className="px-4 py-3 grid grid-cols-5 gap-2">
              {[
                { label: 'Meetings held', value: row.meetings_held, colored: row.meetings_held > 0 },
                { label: 'Touchpoints', value: row.touchpoints, colored: row.touchpoints > 0 },
                { label: 'Notes logged', value: row.notes_logged, colored: row.notes_logged > 0 },
                { label: 'New contacts', value: row.new_contacts, colored: row.new_contacts > 0 },
              ].map(({ label, value, colored }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className={`text-lg font-bold ${colored ? 'text-emerald-600' : 'text-gray-400'}`}>{value}</span>
                  <span className="text-xs text-gray-400 text-center leading-tight">{label}</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-0.5">
                <div className="text-lg font-bold">
                  <FuRateDisplay created={row.follow_ups_created} completed={row.follow_ups_completed} />
                </div>
                <span className="text-xs text-gray-400 text-center leading-tight">Follow-up rate</span>
              </div>
            </div>

            {/* 2. Pipeline influence */}
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-gray-600">Pipeline influence</p>
                {pipeline.subtitle && (
                  <p className="text-xs text-gray-400 mt-0.5">{pipeline.subtitle}</p>
                )}
              </div>
              <span className={`text-sm font-semibold flex-shrink-0 ${pipeline.hasValue ? 'text-blue-600' : 'text-gray-400 text-xs font-normal'}`}>
                {pipeline.value}
              </span>
            </div>

            {/* 3. Contacts */}
            {row.contacts.length > 0 && (
              <div className="px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacts at this conference</p>
                {row.contacts.map(c => {
                  const effectiveBuyerRole = c.buyer_role ?? deriveBuyerRole(c.seniority);
                  const engTypes = c.engagement_types.length > 0 ? c.engagement_types : ['No activity'];
                  return (
                    <div key={c.attendee_id} className="flex items-start gap-2">
                      <BuyerRoleDot role={effectiveBuyerRole} />
                      <div className="flex-1 min-w-0">
                        <Link href={`/attendees/${c.attendee_id}`} className="text-xs font-medium text-brand-primary hover:text-brand-secondary hover:underline">
                          {c.first_name} {c.last_name}
                        </Link>
                        {c.title && <span className="text-xs text-gray-400 ml-1.5 truncate">{c.title}</span>}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap justify-end flex-shrink-0">
                        {engTypes.map(t => <EngagementBadge key={t} type={t} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4. Rep activity */}
            {row.reps.length > 0 && (
              <div className="px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rep activity</p>
                {row.reps.map(rep => {
                  const parts: string[] = [];
                  if (rep.meetings > 0) parts.push(`${rep.meetings} meeting${rep.meetings !== 1 ? 's' : ''}`);
                  if (rep.touchpoints > 0) parts.push(`${rep.touchpoints} touchpoint${rep.touchpoints !== 1 ? 's' : ''}`);
                  return (
                    <div key={rep.rep_name} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-gray-700">{rep.rep_name}</span>
                        {parts.length > 0 && (
                          <span className="text-xs text-gray-400 ml-1.5">{parts.join(' · ')}</span>
                        )}
                      </div>
                      <FuRateDisplay created={rep.follow_ups_created} completed={rep.follow_ups_completed} showBar />
                    </div>
                  );
                })}
              </div>
            )}

            {/* 5. No activity warning */}
            {noActivity && (
              <div className="px-4 py-3">
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-xs text-amber-700">
                    No engagement recorded — {row.contacts.length} contact{row.contacts.length !== 1 ? 's' : ''} attended with no meetings, touchpoints, or notes logged by any rep.
                  </p>
                </div>
              </div>
            )}

            {/* 6. Action buttons */}
            <div className="px-4 py-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFollowUpModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add follow-up
              </button>
              <Link
                href={`/companies/${row.company_id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                onClick={e => e.stopPropagation()}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open company
              </Link>
            </div>
          </div>
        )}
      </div>

      {showFollowUpModal && (
        <AssignFollowUpModal
          isOpen={showFollowUpModal}
          onClose={() => setShowFollowUpModal(false)}
          onSuccess={() => setShowFollowUpModal(false)}
          defaultConferenceId={conferenceId}
          defaultCompanyId={row.company_id}
        />
      )}
    </>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'icp' | 'no_followup' | 'had_meeting' | 'no_activity';
type SortKey = 'pipeline' | 'health_delta' | 'tier' | 'fu_rate' | 'name';

interface Props {
  companyRollup: CompanyRollupRow[];
  avgCostPerUnit: number;
  conferenceId: number;
  conferenceName: string;
}

export function CompanyRollupTab({ companyRollup, avgCostPerUnit, conferenceId, conferenceName }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('pipeline');

  const filtered = useMemo(() => {
    return companyRollup.filter(row => {
      if (filter === 'icp') return row.icp === 'Yes';
      if (filter === 'no_followup') return row.follow_ups_created === 0;
      if (filter === 'had_meeting') return row.meetings_held > 0;
      if (filter === 'no_activity') return row.meetings_held === 0 && row.touchpoints === 0 && row.notes_logged === 0 && row.follow_ups_created === 0;
      return true;
    });
  }, [companyRollup, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sort === 'pipeline') {
        const aV = a.units != null && avgCostPerUnit > 0 ? a.units * avgCostPerUnit : null;
        const bV = b.units != null && avgCostPerUnit > 0 ? b.units * avgCostPerUnit : null;
        if (aV == null && bV == null) return a.company_name.localeCompare(b.company_name);
        if (aV == null) return 1;
        if (bV == null) return -1;
        return bV - aV;
      }
      if (sort === 'health_delta') return b.health_delta - a.health_delta;
      if (sort === 'tier') {
        const aT = TIER_PRIORITY[a.target_tier?.toLowerCase() ?? ''] ?? 99;
        const bT = TIER_PRIORITY[b.target_tier?.toLowerCase() ?? ''] ?? 99;
        if (aT !== bT) return aT - bT;
        return a.company_name.localeCompare(b.company_name);
      }
      if (sort === 'fu_rate') {
        const aR = fuRatePct(a.follow_ups_created, a.follow_ups_completed);
        const bR = fuRatePct(b.follow_ups_created, b.follow_ups_completed);
        if (aR == null && bR == null) return 0;
        if (aR == null) return 1;
        if (bR == null) return -1;
        return aR - bR; // ascending — worst first
      }
      if (sort === 'name') return a.company_name.localeCompare(b.company_name);
      return 0;
    });
  }, [filtered, sort, avgCostPerUnit]);

  // Summary counts
  const icpCount = filtered.filter(r => r.icp === 'Yes').length;
  const openFollowUps = filtered.reduce((sum, r) => sum + (r.follow_ups_created - r.follow_ups_completed), 0);
  const pipelineTotal = filtered.reduce((sum, r) => {
    if (r.units == null || avgCostPerUnit <= 0) return sum;
    return sum + r.units * avgCostPerUnit;
  }, 0);
  const pipelineTotalStr = avgCostPerUnit > 0 && pipelineTotal > 0
    ? '$' + Math.round(pipelineTotal).toLocaleString('en-US')
    : null;

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All companies' },
    { key: 'icp', label: 'ICP only' },
    { key: 'no_followup', label: 'No follow-up' },
    { key: 'had_meeting', label: 'Had meeting' },
    { key: 'no_activity', label: 'No activity' },
  ];

  if (companyRollup.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <p className="text-sm text-gray-500 font-medium">No company data available for this conference.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap flex-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                filter === f.key
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400">Sort:</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-brand-primary"
          >
            <option value="pipeline">Pipeline influence</option>
            <option value="health_delta">Health delta</option>
            <option value="tier">Target tier</option>
            <option value="fu_rate">Follow-up rate (worst first)</option>
            <option value="name">Company name (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Summary counts */}
      <p className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">{filtered.length}</span> {filtered.length === 1 ? 'company' : 'companies'}
        {' · '}
        <span className="font-medium text-gray-700">{icpCount}</span> ICP
        {' · '}
        <span className="font-medium text-gray-700">{openFollowUps}</span> open follow-up{openFollowUps !== 1 ? 's' : ''}
        {pipelineTotalStr && (
          <> · <span className="font-medium text-blue-600">{pipelineTotalStr}</span> pipeline influence</>
        )}
      </p>

      {/* List */}
      {sorted.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">No companies match this filter.</p>
          <button type="button" onClick={() => setFilter('all')} className="mt-2 text-xs text-brand-primary hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(row => (
            <CompanyCard
              key={row.company_id}
              row={row}
              avgCostPerUnit={avgCostPerUnit}
              conferenceId={conferenceId}
              conferenceName={conferenceName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
