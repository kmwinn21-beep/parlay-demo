'use client';

import Link from 'next/link';
import type { IcpCompany } from '../PreConferenceReview';

function HealthBadge({ score }: { score: number }) {
  const { label, cls } = score >= 75
    ? { label: 'Strong', cls: 'bg-emerald-100 text-emerald-700' }
    : score >= 50
    ? { label: 'Warm', cls: 'bg-amber-100 text-amber-700' }
    : score >= 25
    ? { label: 'Cool', cls: 'bg-orange-100 text-orange-700' }
    : { label: 'Cold', cls: 'bg-red-100 text-red-700' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label} {score}</span>
  );
}

export function IcpCompaniesTab({ companies }: { companies: IcpCompany[] }) {
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
          <div key={co.id} className="border border-gray-200 rounded-xl p-4 hover:border-brand-secondary/40 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <h4 className="font-semibold text-gray-900 truncate text-sm">{co.name}</h4>
                {co.company_type && (
                  <span className="text-xs text-gray-500">{co.company_type}</span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <HealthBadge score={co.avgHealth} />
                {co.assigned_user_names.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-brand-highlight/20 text-brand-primary text-[10px] font-semibold max-w-[90px] truncate">
                    {co.assigned_user_names[0]}
                  </span>
                )}
              </div>
            </div>

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
              {co.attendees.slice(0, 4).map((a) => (
                <Link
                  key={a.id}
                  href={`/attendees/${a.id}`}
                  className="flex items-center justify-between text-xs hover:text-brand-secondary transition-colors"
                >
                  <span className="truncate text-gray-700">{a.first_name} {a.last_name}{a.title ? ` · ${a.title}` : ''}</span>
                  <span className="text-gray-400 ml-2 flex-shrink-0">{a.health}</span>
                </Link>
              ))}
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
