'use client';

import Link from 'next/link';
import type { GapsData } from '../PreConferenceReview';

function GapCard({ title, count, description, children }: { title: string; count: number; description: string; children?: React.ReactNode }) {
  return (
    <div className="border border-red-200 bg-red-50 rounded-xl p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z" />
          </svg>
        </div>
        <div>
          <h4 className="font-semibold text-red-800 text-sm">{title}</h4>
          <p className="text-xs text-red-600 mt-0.5">{count} {description}</p>
        </div>
      </div>
      {children && <div className="space-y-1.5 pl-11">{children}</div>}
    </div>
  );
}

export function CoverageGapsTab({ gaps }: { gaps: GapsData }) {
  const hasNoGaps = gaps.totalGaps === 0 && gaps.attendeesWithOpenFollowUps.length === 0;

  if (hasNoGaps) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-gray-700 font-semibold">No coverage gaps detected</p>
        <p className="text-sm text-gray-400 mt-1">All ICP companies have relationships and meetings scheduled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {gaps.totalGaps} coverage {gaps.totalGaps === 1 ? 'gap' : 'gaps'} detected
      </p>

      {gaps.icpAttendeesNoMeeting.length > 0 && (
        <GapCard
          title="ICP Attendees Without Meetings"
          count={gaps.icpAttendeesNoMeeting.length}
          description={`ICP ${gaps.icpAttendeesNoMeeting.length === 1 ? 'attendee has' : 'attendees have'} no scheduled meeting`}
        >
          {gaps.icpAttendeesNoMeeting.map((a) => (
            <Link key={a.id} href={`/attendees/${a.id}`} className="flex items-center gap-2 text-xs text-red-700 hover:text-red-900 transition-colors">
              <span className="font-medium">{a.first_name} {a.last_name}</span>
              {a.company_name && <span className="text-red-500">· {a.company_name}</span>}
            </Link>
          ))}
        </GapCard>
      )}

      {gaps.icpCompaniesNoRelationship.length > 0 && (
        <GapCard
          title="ICP Companies Without Relationship Records"
          count={gaps.icpCompaniesNoRelationship.length}
          description={`ICP ${gaps.icpCompaniesNoRelationship.length === 1 ? 'company has' : 'companies have'} no internal relationship on file`}
        >
          {gaps.icpCompaniesNoRelationship.map((c) => (
            <Link key={c.id} href={`/companies/${c.id}`} className="flex items-center gap-2 text-xs text-red-700 hover:text-red-900 transition-colors">
              <span className="font-medium">{c.name}</span>
              {c.company_type && <span className="text-red-500">· {c.company_type}</span>}
            </Link>
          ))}
        </GapCard>
      )}

      {gaps.attendeesWithOpenFollowUps.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-amber-800 text-sm">Open Follow-ups</h4>
              <p className="text-xs text-amber-600 mt-0.5">
                {gaps.attendeesWithOpenFollowUps.length} {gaps.attendeesWithOpenFollowUps.length === 1 ? 'attendee has' : 'attendees have'} pending follow-ups
              </p>
            </div>
          </div>
          <div className="space-y-1.5 pl-11">
            {gaps.attendeesWithOpenFollowUps.map((a) => (
              <Link key={a.id} href={`/attendees/${a.id}`} className="flex items-center gap-2 text-xs text-amber-700 hover:text-amber-900 transition-colors">
                <span className="font-medium">{a.first_name} {a.last_name}</span>
                {a.company_name && <span className="text-amber-500">· {a.company_name}</span>}
                <span className="ml-auto text-amber-600 font-semibold">{a.openCount} open</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
