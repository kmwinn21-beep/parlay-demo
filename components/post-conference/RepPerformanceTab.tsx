'use client';

import Link from 'next/link';
import type { RepPerformanceRow, PostConferenceData } from '../PostConferenceReview';

type RepPerformance = PostConferenceData['repPerformance'];

function RepPill({ name }: { name: string }) {
  return (
    <span style={{ background: 'rgba(34,58,94,0.08)', color: '#223A5E', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 500 }}>
      {name}
    </span>
  );
}

function FuBar({ rate }: { rate: number }) {
  const color = rate >= 60 ? '#059669' : rate >= 30 ? '#d97706' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium w-9 text-right flex-shrink-0" style={{ color }}>{rate}%</span>
    </div>
  );
}

function FollowUpStatusBadge({ status }: { status: RepPerformanceRow['companies'][number]['followUpStatus'] }) {
  const map = {
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    in_progress: 'bg-blue-50 text-brand-secondary border-blue-200',
    not_started: 'bg-amber-50 text-amber-700 border-amber-200',
    none: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  const labels = { completed: 'FU Done', in_progress: 'In Progress', not_started: 'FU Pending', none: 'No FU' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium border ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

function HealthChip({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {up ? `+${delta}` : delta}
    </span>
  );
}

function RepCard({ rep }: { rep: RepPerformanceRow }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Rep header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <RepPill name={rep.repName} />
        <span className="text-xs text-gray-400">{rep.contactsCaptured} contacts</span>
      </div>

      {/* Stats row */}
      <div className="px-4 py-3 grid grid-cols-3 gap-2 border-b border-gray-100">
        {[
          { label: 'Newly Engaged', value: rep.newlyEngaged, color: '#059669' },
          { label: 'Meetings Held', value: rep.meetingsHeld, color: '#0f766e' },
          { label: 'FU Created', value: rep.followUpsCreated, color: '#223A5E' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-gray-500 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Follow-up rate */}
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 font-medium">Follow-up Rate</span>
          <span className="text-xs text-gray-400">{rep.followUpsCompleted}/{rep.followUpsCreated}</span>
        </div>
        <FuBar rate={rep.followUpRate} />
      </div>

      {/* Company breakdown */}
      {rep.companies.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Companies</p>
          <div className="space-y-1.5">
            {rep.companies.slice(0, 6).map((c, i) => (
              <div key={i} className="flex items-center gap-2 min-w-0">
                <Link href={`/companies/${c.company_id}`} className="text-xs text-brand-primary hover:text-brand-secondary truncate flex-1 min-w-0">
                  {c.company_name}
                </Link>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {c.icp === 'Yes' && <span className="badge-green text-xs px-1.5 py-0">ICP</span>}
                  <FollowUpStatusBadge status={c.followUpStatus} />
                  <HealthChip delta={c.healthDelta} />
                </div>
              </div>
            ))}
            {rep.companies.length > 6 && (
              <p className="text-xs text-gray-400">+{rep.companies.length - 6} more</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RepPerformanceTab({ repPerformance }: { repPerformance: RepPerformance }) {
  // Filter out any combined multi-rep entries (contain a comma in the name)
  const singleRepRows = repPerformance.filter(r => !r.repName.includes(','));

  if (singleRepRows.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-16">No rep performance data available.</p>;
  }

  const sorted = [...singleRepRows].sort((a, b) => b.contactsCaptured - a.contactsCaptured);

  return (
    <div className="space-y-6">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Activity by Rep</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {sorted.map(rep => <RepCard key={rep.repName} rep={rep} />)}
      </div>
    </div>
  );
}
