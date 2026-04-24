'use client';

import type { PostConferenceData } from '../PostConferenceReview';

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

function CompareRow({ label, current, avg }: { label: string; current: number; avg: number }) {
  const diff = current - avg;
  const up = diff >= 0;
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-800">{current}</span>
        {avg > 0 && (
          <span className={`text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-500'}`}>
            {up ? '↑' : '↓'} {Math.abs(diff)} vs avg
          </span>
        )}
      </div>
    </div>
  );
}

export function SummaryTab({ summary }: { summary: Summary }) {
  const fuRate = summary.followUpsCreated > 0
    ? Math.round((summary.followUpsCompleted / summary.followUpsCreated) * 100) : 0;
  const maxCt = Math.max(1, ...summary.companyTypeBreakdown.map(c => c.count));
  const maxEng = Math.max(1,
    summary.engagementByType.meetingsHeld,
    summary.engagementByType.socialConversations,
    summary.engagementByType.touchpoints,
    summary.engagementByType.notesLogged,
    summary.engagementByType.zeroEngagement,
  );

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <StatCard label="Contacts Captured" value={summary.totalCaptured} sub={`${summary.newlyEngaged} newly engaged`} color="#223A5E" />
        <StatCard label="Newly Engaged" value={summary.newlyEngaged} color="#059669" />
        <StatCard label="Meetings Held" value={summary.meetingsHeld} sub={`${summary.walkInMeetings} unplanned`} color="#059669" />
        <StatCard label="Follow-up Rate" value={`${fuRate}%`} sub={`${summary.followUpsCompleted} / ${summary.followUpsCreated}`}
          color={fuRate >= 40 ? '#059669' : '#d97706'} />
        <StatCard label="Relationships Improved" value={summary.relationshipsImproved} color="#059669" />
        <StatCard label="ICP Contacts" value={summary.icpContacts} color="#223A5E" />
      </div>

      {/* Two-column breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Company type breakdown */}
        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Captures by Company Type</h4>
          {summary.companyTypeBreakdown.length === 0
            ? <p className="text-xs text-gray-400">No data</p>
            : (
              <div className="space-y-2">
                {summary.companyTypeBreakdown.map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-28 truncate flex-shrink-0">{item.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-2 rounded-full bg-brand-secondary" style={{ width: `${Math.round((item.count / maxCt) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right flex-shrink-0">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Engagement quality */}
        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Engagement Quality</h4>
          <div className="space-y-2">
            {[
              { label: 'Meetings Held', value: summary.engagementByType.meetingsHeld, color: '#059669' },
              { label: 'Social Conversations', value: summary.engagementByType.socialConversations, color: '#0f766e' },
              { label: 'Touchpoints', value: summary.engagementByType.touchpoints, color: '#1B76BC' },
              { label: 'Notes Logged', value: summary.engagementByType.notesLogged, color: '#7c3aed' },
              { label: 'Zero Engagement', value: summary.engagementByType.zeroEngagement, color: '#ef4444' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-32 truncate flex-shrink-0">{item.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full" style={{ width: `${Math.round((item.value / maxEng) * 100)}%`, backgroundColor: item.color }} />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right flex-shrink-0">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Conference vs prior average */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Conference vs Prior Average</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="rounded-xl border border-gray-200 p-4 bg-white">
            <CompareRow label="Contacts per Rep" current={summary.priorAverageComparison.contactsPerRep.current} avg={summary.priorAverageComparison.contactsPerRep.avg} />
            <CompareRow label="Meetings per Rep" current={summary.priorAverageComparison.meetingsPerRep.current} avg={summary.priorAverageComparison.meetingsPerRep.avg} />
            <CompareRow label="ICP Capture Rate %" current={summary.priorAverageComparison.icpCaptureRate.current} avg={summary.priorAverageComparison.icpCaptureRate.avg} />
          </div>
          <div className="rounded-xl border border-gray-200 p-4 bg-white">
            <CompareRow label="Follow-up Rate %" current={summary.priorAverageComparison.followUpRate.current} avg={summary.priorAverageComparison.followUpRate.avg} />
            <CompareRow label="Notes per Contact" current={summary.priorAverageComparison.notesPerContact.current} avg={summary.priorAverageComparison.notesPerContact.avg} />
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-gray-600">Newly Engaged</span>
              <span className="text-sm font-semibold text-gray-800">{summary.newlyEngaged}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
