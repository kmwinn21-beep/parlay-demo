'use client';

import Link from 'next/link';
import { TargetBtn } from './TargetBtn';
import type { IcpCompany, TargetEntry } from '../PreConferenceReview';

function HealthBadge({ score }: { score: number }) {
  const { label, cls } = score >= 75
    ? { label: 'Strong', cls: 'bg-emerald-100 text-emerald-700' }
    : score >= 50
    ? { label: 'Warm', cls: 'bg-amber-100 text-amber-700' }
    : score >= 25
    ? { label: 'Cool', cls: 'bg-orange-100 text-orange-700' }
    : { label: 'Cold', cls: 'bg-red-100 text-red-700' };
  return (
    <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label} {score}</span>
  );
}

function UserPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-blue-100 text-blue-800 border border-blue-300">
      <svg className="w-3 h-3 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {name}
    </span>
  );
}

export function IcpCompaniesTab({
  companies,
  targetMap,
  onToggleTarget,
}: {
  companies: IcpCompany[];
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
}) {
  if (companies.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No ICP companies attending this conference.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{companies.length} ICP {companies.length === 1 ? 'company' : 'companies'} — sorted by relationship health</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map((co) => (
          <div key={co.id} className="border border-gray-200 rounded-xl p-4 hover:border-brand-secondary/40 hover:shadow-sm transition-all overflow-hidden">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <h4 className="font-semibold text-gray-900 truncate text-sm">{co.name}</h4>
                {co.company_type && (
                  <span className="text-xs text-gray-500 truncate block">{co.company_type}</span>
                )}
              </div>
              <HealthBadge score={co.avgHealth} />
            </div>

            {/* Assigned user pill */}
            {co.assigned_user_names.length > 0 && (
              <div className="mb-3">
                <UserPill name={co.assigned_user_names[0]} />
              </div>
            )}

            {/* Health bar */}
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${co.avgHealth}%`,
                  backgroundColor: co.avgHealth >= 75 ? '#34D399' : co.avgHealth >= 50 ? '#f59e0b' : co.avgHealth >= 25 ? '#f97316' : '#ef4444',
                }}
              />
            </div>

            {/* Attendees */}
            <div className="space-y-1.5">
              {co.attendees.slice(0, 4).map((a) => {
                const isTarget = targetMap.has(Number(a.id));
                return (
                  <div key={Number(a.id)} className="flex items-center justify-between text-xs gap-1">
                    <Link
                      href={`/attendees/${a.id}`}
                      className="truncate text-gray-700 hover:text-brand-secondary transition-colors flex-1 min-w-0"
                    >
                      {a.first_name} {a.last_name}{a.title ? ` · ${a.title}` : ''}
                    </Link>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-gray-400">{a.health}</span>
                      <TargetBtn
                        isTarget={isTarget}
                        onClick={() => onToggleTarget({
                          attendeeId: Number(a.id),
                          firstName: String(a.first_name),
                          lastName: String(a.last_name),
                          title: a.title ? String(a.title) : null,
                          seniority: a.seniority ?? null,
                          companyName: co.name,
                          companyId: co.id,
                          companyWse: null,
                          assignedUserNames: co.assigned_user_names,
                        })}
                      />
                    </div>
                  </div>
                );
              })}
              {co.attendees.length > 4 && (
                <p className="text-xs text-gray-400">+{co.attendees.length - 4} more</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
