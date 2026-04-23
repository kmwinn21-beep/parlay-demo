'use client';

import Link from 'next/link';
import type { LandscapeData } from '../PreConferenceReview';

function BarChart({ items, total, colorClass }: { items: { label: string; count: number }[]; total: number; colorClass: string }) {
  if (items.length === 0) return <p className="text-sm text-gray-400">No data</p>;
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-28 truncate flex-shrink-0">{item.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className={`h-2 rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-gray-500 w-10 text-right flex-shrink-0">{item.count}</span>
          </div>
        );
      })}
    </div>
  );
}

export function LandscapeTab({ data }: { data: LandscapeData }) {
  return (
    <div className="space-y-8">
      {/* 3-column layout: stat cards left, two charts right */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: stacked stat cards */}
        <div className="space-y-3">
          {[
            { label: 'Total Attendees', value: data.totalAttendees },
            { label: 'Companies', value: data.totalCompanies },
            { label: 'ICP Companies', value: data.icpCount },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
              <p className="text-2xl font-bold text-brand-primary">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Middle: Company Type Breakdown */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Company Type Breakdown</h3>
          <BarChart items={data.companyTypeBreakdown} total={data.totalAttendees} colorClass="bg-brand-secondary" />
        </div>

        {/* Right: Seniority Breakdown */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Seniority Breakdown</h3>
          <BarChart items={data.seniorityBreakdown} total={data.totalAttendees} colorClass="bg-brand-highlight" />
        </div>
      </div>

      {/* Prior overlap — Operator companies only, 4 columns */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Prior Conference Overlap</h3>
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
            {data.priorOverlapCount} attendee{data.priorOverlapCount !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-gray-400">Operator companies only</span>
        </div>
        {data.priorOverlapAttendees.length === 0 ? (
          <p className="text-sm text-gray-400">No returning Operator attendees from prior conferences.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.priorOverlapAttendees.map((a) => (
              <Link
                key={String(a.id)}
                href={`/attendees/${a.id}`}
                className="relative flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-brand-secondary/40 hover:bg-blue-50/50 transition-colors"
              >
                {/* Assigned user pill — top right */}
                {a.assigned_user_names.length > 0 && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-brand-highlight/20 text-brand-primary text-[10px] font-semibold leading-tight max-w-[80px] truncate">
                    {a.assigned_user_names[0]}
                  </span>
                )}

                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-brand-secondary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-brand-secondary">
                    {String(a.first_name)[0]}{String(a.last_name)[0]}
                  </span>
                </div>

                {/* Name + company + conference */}
                <div className="min-w-0 pr-16">
                  <p className="text-sm font-medium text-gray-800 truncate leading-tight">{String(a.first_name)} {String(a.last_name)}</p>
                  <p className="text-xs text-gray-500 truncate">{a.company_name ?? '—'}</p>
                  {a.prior_conference && (
                    <p className="text-xs text-gray-400 truncate">({a.prior_conference})</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
