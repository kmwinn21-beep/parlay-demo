'use client';

import Link from 'next/link';
import type { RelationshipShiftRow, PostConferenceData } from '../PostConferenceReview';

type RelationshipShifts = PostConferenceData['relationshipShifts'];

function HealthBar({ score }: { score: number }) {
  const color = score >= 75 ? '#34D399' : score >= 50 ? '#f59e0b' : score >= 25 ? '#f97316' : '#ef4444';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 bg-gray-100 rounded-full h-1.5 overflow-hidden flex-shrink-0">
        <div className="h-1.5 rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium" style={{ color }}>{score}</span>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {up ? `↑ +${delta}` : `↓ ${delta}`} pts
    </span>
  );
}

function ShiftCard({ r, direction }: { r: RelationshipShiftRow; direction: 'improved' | 'declined' }) {
  return (
    <div className={`rounded-xl border p-4 bg-white space-y-2 hover:shadow-sm transition-all ${direction === 'improved' ? 'border-emerald-200' : 'border-red-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/attendees/${r.attendee_id}`} className="text-sm font-semibold text-brand-primary hover:text-brand-secondary transition-colors block truncate">
            {r.attendeeName}
          </Link>
          {r.company_name && (
            <Link href={r.company_id ? `/companies/${r.company_id}` : '#'} className="text-xs text-gray-400 hover:text-brand-secondary truncate block">
              {r.company_name}
            </Link>
          )}
        </div>
        <DeltaBadge delta={r.healthDelta} />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400 uppercase tracking-wider" style={{ fontSize: 9 }}>Before</span>
          <HealthBar score={r.healthBefore} />
        </div>
        <span className="text-gray-300 text-xs">→</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400 uppercase tracking-wider" style={{ fontSize: 9 }}>After</span>
          <HealthBar score={r.healthAfter} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {r.icp === 'Yes' && <span className="badge-green text-xs px-2 py-0.5">ICP</span>}
        {r.company_type && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
            {r.company_type.split(',')[0].trim()}
          </span>
        )}
        {r.assignedUsers.length > 0 && r.assignedUsers.map((u, i) => (
          <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
            style={{ background: 'rgba(34,58,94,0.06)', color: '#223A5E', borderColor: 'rgba(34,58,94,0.15)' }}>
            {u}
          </span>
        ))}
        {r.priorConferenceCount > 0 && (
          <span className="text-xs text-gray-400">{r.priorConferenceCount} prior conf{r.priorConferenceCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      {r.shiftReason && (
        <p className="text-xs text-gray-500 border-t border-gray-100 pt-2">{r.shiftReason}</p>
      )}
    </div>
  );
}

export function RelationshipShiftsTab({ relationshipShifts }: { relationshipShifts: RelationshipShifts }) {
  const { improved, declined, unchanged } = relationshipShifts;
  const total = improved.length + declined.length + unchanged.length;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total Contacts', value: total, color: '#223A5E' },
          { label: 'Improved', value: improved.length, color: '#059669' },
          { label: 'Declined', value: declined.length, color: '#ef4444' },
          { label: 'Unchanged', value: unchanged.length, color: '#6b7280' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-gray-100 p-4 bg-white">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs font-semibold text-gray-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Net impact bar */}
      {total > 0 && (
        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Net Relationship Impact</h4>
          <div className="flex h-6 rounded-full overflow-hidden">
            {improved.length > 0 && (
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round((improved.length / total) * 100)}%` }} title={`${improved.length} improved`} />
            )}
            {unchanged.length > 0 && (
              <div className="h-full bg-gray-200" style={{ width: `${Math.round((unchanged.length / total) * 100)}%` }} title={`${unchanged.length} unchanged`} />
            )}
            {declined.length > 0 && (
              <div className="h-full bg-red-400 transition-all" style={{ width: `${Math.round((declined.length / total) * 100)}%` }} title={`${declined.length} declined`} />
            )}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Improved</span>
            <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> Unchanged</span>
            <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Declined</span>
          </div>
        </div>
      )}

      {/* Improved */}
      {improved.length > 0 && (
        <div>
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-emerald-200" />
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider whitespace-nowrap">Improved ({improved.length})</span>
            <div className="flex-1 h-px bg-emerald-200" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {improved.map(r => <ShiftCard key={r.attendee_id} r={r} direction="improved" />)}
          </div>
        </div>
      )}

      {/* Declined */}
      {declined.length > 0 && (
        <div>
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-red-200" />
            <span className="text-xs font-semibold text-red-500 uppercase tracking-wider whitespace-nowrap">Declined ({declined.length})</span>
            <div className="flex-1 h-px bg-red-200" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {declined.map(r => <ShiftCard key={r.attendee_id} r={r} direction="declined" />)}
          </div>
        </div>
      )}

      {total === 0 && (
        <p className="text-sm text-gray-400 text-center py-16">No relationship shift data available.</p>
      )}
    </div>
  );
}
