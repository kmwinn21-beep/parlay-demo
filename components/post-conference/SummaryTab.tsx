'use client';

import Link from 'next/link';
import type { PostConferenceData, RepPerformanceRow } from '../PostConferenceReview';

type Summary = PostConferenceData['summary'];

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-gray-100 p-4 bg-white flex flex-col gap-1">
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs font-semibold text-gray-600">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// ── Rep activity helpers ────────────────────────────────────────────────────

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
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <RepPill name={rep.repName} />
        <span className="text-xs text-gray-400">{rep.contactsCaptured} contacts</span>
      </div>
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
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 font-medium">Follow-up Rate</span>
          <span className="text-xs text-gray-400">{rep.followUpsCompleted}/{rep.followUpsCreated}</span>
        </div>
        <FuBar rate={rep.followUpRate} />
      </div>
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

// ── Main component ──────────────────────────────────────────────────────────

export function SummaryTab({ summary, repPerformance }: { summary: Summary; repPerformance: RepPerformanceRow[] }) {
  const fuRate = summary.followUpsCreated > 0
    ? Math.round((summary.followUpsCompleted / summary.followUpsCreated) * 100) : 0;
  const maxCt = Math.max(1, ...summary.companyTypeBreakdown.map(c => c.count));
  const maxEng = Math.max(1,
    summary.engagementByType.meetingsHeld,
    summary.engagementByType.socialConversations,
    summary.engagementByType.touchpoints,
    summary.engagementByType.notesLogged,
    summary.followUpsCreated,
    summary.formSubmissions,
  );

  const compareItems: { label: string; current: number; avg: number | null }[] = [
    { label: 'Contacts per Rep', current: summary.priorAverageComparison.contactsPerRep.current, avg: summary.priorAverageComparison.contactsPerRep.avg },
    { label: 'Follow-up Rate %', current: summary.priorAverageComparison.followUpRate.current, avg: summary.priorAverageComparison.followUpRate.avg },
    { label: 'Meetings per Rep', current: summary.priorAverageComparison.meetingsPerRep.current, avg: summary.priorAverageComparison.meetingsPerRep.avg },
    { label: 'Notes per Contact', current: summary.priorAverageComparison.notesPerContact.current, avg: summary.priorAverageComparison.notesPerContact.avg },
    { label: 'ICP Capture Rate %', current: summary.priorAverageComparison.icpCaptureRate.current, avg: summary.priorAverageComparison.icpCaptureRate.avg },
    { label: 'Newly Engaged', current: summary.newlyEngaged, avg: null },
  ];

  const sortedReps = [...repPerformance]
    .filter(r => !r.repName.includes(','))
    .sort((a, b) => b.contactsCaptured - a.contactsCaptured);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Contacts Captured" value={summary.totalCaptured} sub={`${summary.newlyEngaged} newly engaged`} color="#223A5E" />
        <StatCard label="Newly Engaged" value={summary.newlyEngaged} color="#059669" />
        <StatCard label="Meetings Held" value={summary.meetingsHeld} sub={`${summary.walkInMeetings} unplanned`} color="#059669" />
        <StatCard label="Follow-up Rate" value={`${fuRate}%`} sub={`${summary.followUpsCompleted} / ${summary.followUpsCreated}`}
          color={fuRate >= 40 ? '#059669' : '#d97706'} />
        <StatCard label="Relationships Improved" value={summary.relationshipsImproved} color="#059669" />
        <StatCard label="ICP Contacts" value={summary.icpContacts} color="#223A5E" />
      </div>

      {/* Charts + comparison — 3-column row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ alignItems: 'start' }}>
        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Captures by Company Type</h4>
          {summary.companyTypeBreakdown.length === 0
            ? <p className="text-xs text-gray-400">No data</p>
            : (
              <div className="space-y-2">
                {summary.companyTypeBreakdown.map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-20 flex-shrink-0">{item.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-2 rounded-full bg-brand-secondary" style={{ width: `${Math.round((item.count / maxCt) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right flex-shrink-0">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Engagement Quality</h4>
          <div className="space-y-2">
            {[
              { label: 'Meetings Held', value: summary.engagementByType.meetingsHeld, color: '#059669' },
              { label: 'Event Attendees', value: summary.engagementByType.socialConversations, color: '#0f766e' },
              { label: 'Touchpoints', value: summary.engagementByType.touchpoints, color: '#1B76BC' },
              { label: 'Notes Logged', value: summary.engagementByType.notesLogged, color: '#7c3aed' },
              { label: 'Follow Ups', value: summary.followUpsCreated, color: '#d97706' },
              { label: 'Form Submissions', value: summary.formSubmissions, color: '#64748b' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-24 flex-shrink-0">{item.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full" style={{ width: `${Math.round((item.value / maxEng) * 100)}%`, backgroundColor: item.color }} />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right flex-shrink-0">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Conference vs Prior Average</h4>
          <p className="text-xs text-gray-400 mb-3">
            {compareItems.some(item => item.avg !== null) ? 'vs. avg across prior conferences' : 'No prior conference data'}
          </p>
          <div>
            {compareItems.map((item, i) => {
              const hasAvg = item.avg !== null;
              const diff = hasAvg ? item.current - (item.avg as number) : 0;
              const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
              return (
                <div key={i} className="flex items-center justify-between py-2"
                  style={{ borderBottom: i < compareItems.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                  <span className="text-xs text-gray-600">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <div style={{ width: 56, display: 'flex', justifyContent: 'flex-end' }}>
                      {hasAvg && (
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                          direction === 'up' ? 'bg-emerald-100 text-emerald-700' :
                          direction === 'down' ? 'bg-red-100 text-red-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {direction === 'up' ? `+${Math.abs(diff)}` : direction === 'down' ? `-${Math.abs(diff)}` : '='}
                        </span>
                      )}
                    </div>
                    <div style={{ width: 28, textAlign: 'right' }}>
                      <span className="text-sm font-semibold text-gray-800">{item.current}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Activity by Rep */}
      {sortedReps.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Activity by Rep</h4>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedReps.map(rep => <RepCard key={rep.repName} rep={rep} />)}
          </div>
        </div>
      )}
    </div>
  );
}
