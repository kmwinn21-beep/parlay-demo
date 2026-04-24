'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TargetBtn } from './TargetBtn';
import type { LandscapeData, TargetEntry, ClientCompanyEntry } from '../PreConferenceReview';

type OverlapAttendee = LandscapeData['priorOverlapAttendees'][number];

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

function UserPill({ name }: { name: string }) {
  return (
    <span className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-blue-100 text-blue-800 border border-blue-300">
      <svg className="w-3 h-3 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {name}
    </span>
  );
}

function ClientCompanyCard({ co, unitTypeLabel }: { co: ClientCompanyEntry; unitTypeLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left gap-2"
      >
        <span className="text-xs font-semibold text-gray-800 truncate flex-1">{co.companyName}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-bold text-brand-primary">{co.attendeeCount}</span>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Unit type pill row */}
      {co.wse != null && (
        <div className="px-3 pt-1.5 pb-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/20">
            {unitTypeLabel}: {co.wse.toLocaleString()}
          </span>
        </div>
      )}

      {/* Expanded attendee list */}
      {expanded && co.attendees.length > 0 && (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {co.attendees.map(a => (
            <div key={a.id} className="px-3 py-1.5">
              <Link
                href={`/attendees/${a.id}`}
                className="text-xs font-medium text-gray-800 hover:text-brand-secondary transition-colors block truncate"
                onClick={e => e.stopPropagation()}
              >
                {a.firstName} {a.lastName}
              </Link>
              {a.title && <p className="text-xs text-gray-400 truncate">{a.title}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LandscapeTab({
  data,
  targetMap,
  onToggleTarget,
}: {
  data: LandscapeData;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
}) {
  return (
    <div className="space-y-8">
      {/* 5-column layout: stat cards | charts (×3) | client attendees */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-stretch">
        {/* Col 1: stacked stat cards */}
        <div className="flex flex-col gap-3">
          {[
            { label: 'Total Attendees', value: data.totalAttendees },
            { label: 'Companies', value: data.totalCompanies },
            { label: 'ICP Companies', value: data.icpCount },
          ].map((s) => (
            <div key={s.label} className="flex-1 bg-gray-50 rounded-xl p-4 text-center border border-gray-100 flex flex-col items-center justify-center">
              <p className="text-2xl font-bold text-brand-primary">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Cols 2-4: stacked charts */}
        <div className="md:col-span-3 flex flex-col gap-6 justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Company Type Breakdown</h3>
            <BarChart items={data.companyTypeBreakdown} total={data.totalAttendees} colorClass="bg-brand-secondary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Seniority Breakdown</h3>
            <BarChart items={data.seniorityBreakdown} total={data.totalAttendees} colorClass="bg-brand-highlight" />
          </div>
        </div>

        {/* Col 5: Client Attendees */}
        <div className="flex flex-col border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">Client Attendees</h3>
            {data.clientCompanies.length > 0 && (
              <span className="text-xs font-semibold text-gray-400">{data.clientCompanies.length}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {data.clientCompanies.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No client companies attending</p>
            ) : (
              data.clientCompanies.map(co => (
                <ClientCompanyCard key={co.companyId} co={co} unitTypeLabel={data.unitTypeLabel} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Prior overlap */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Prior Conference Overlap</h3>
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
            {data.priorOverlapCount} {data.priorOverlapTypeLabel}&apos;s
          </span>
        </div>
        {data.priorOverlapAttendees.length === 0 ? (
          <p className="text-sm text-gray-400">No returning {data.priorOverlapTypeLabel} attendees from prior conferences.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.priorOverlapAttendees.map((a) => {
              const isTarget = targetMap.has(Number(a.id));
              return (
                <div
                  key={String(a.id)}
                  className="flex flex-col gap-2 p-3 rounded-lg border border-gray-100 hover:border-brand-secondary/40 hover:bg-blue-50/50 transition-colors relative"
                >
                  {/* Target button — upper right */}
                  <div className="absolute top-2 right-2">
                    <TargetBtn
                      isTarget={isTarget}
                      onClick={() => onToggleTarget({
                        attendeeId: Number(a.id),
                        firstName: String(a.first_name),
                        lastName: String(a.last_name),
                        title: a.title ? String(a.title) : null,
                        seniority: a.seniority ?? null,
                        companyName: a.company_name ? String(a.company_name) : null,
                        companyId: a.company_id ?? null,
                        assignedUserNames: a.assigned_user_names,
                      })}
                    />
                  </div>

                  {/* Avatar + name row */}
                  <div className="flex items-start gap-3 pr-5">
                    <div className="w-8 h-8 rounded-full bg-brand-secondary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-brand-secondary">
                        {String(a.first_name)[0]}{String(a.last_name)[0]}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <Link href={`/attendees/${a.id}`} className="text-sm font-medium text-gray-800 truncate leading-tight hover:text-brand-secondary block">
                        {String(a.first_name)} {String(a.last_name)}
                      </Link>
                      <p className="text-xs text-gray-500 truncate">{a.company_name ?? '—'}</p>
                      {a.prior_conference && (
                        <p className="text-xs text-gray-400 truncate">({a.prior_conference})</p>
                      )}
                    </div>
                  </div>

                  {/* Assigned user pill */}
                  {a.assigned_user_names.length > 0 && (
                    <UserPill name={a.assigned_user_names[0]} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
