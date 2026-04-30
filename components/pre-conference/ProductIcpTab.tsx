'use client';

import Link from 'next/link';
import { TargetBtn } from './TargetBtn';
import type { ProductIcpEntry, TargetEntry } from '../PreConferenceReview';

function HealthDot({ score }: { score: number }) {
  const color = score >= 75 ? '#34D399' : score >= 50 ? '#f59e0b' : score >= 25 ? '#f97316' : '#ef4444';
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />;
}

export function ProductIcpTab({
  productIcp,
  targetMap,
  onToggleTarget,
}: {
  productIcp: ProductIcpEntry[];
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
}) {
  if (productIcp.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No attendees at this conference have a product assigned.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">
        {productIcp.length} product{productIcp.length !== 1 ? 's' : ''} represented at this conference
      </p>

      {/* Horizontal scroll container with one column per product */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {productIcp.map((entry) => {
          const totalAttendees = entry.companies.reduce((sum, c) => sum + c.attendees.length, 0);
          const hex = entry.color ?? null;
          // Light fill (18% opacity) + full-color 2px border + full-color text
          const headerStyle = hex
            ? { backgroundColor: `${hex}2e`, borderColor: hex, color: hex }
            : {};

          return (
            <div key={entry.product} className="flex-shrink-0 w-72 flex flex-col gap-3">
              {/* Product column header */}
              <div
                className={`rounded-xl px-4 py-2.5 border-2 ${hex ? '' : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary'}`}
                style={headerStyle}
              >
                <h3 className="font-semibold text-sm">{entry.product}</h3>
                <p className="text-xs mt-0.5 opacity-70">
                  {entry.companies.length} {entry.companies.length === 1 ? 'company' : 'companies'} · {totalAttendees} {totalAttendees === 1 ? 'attendee' : 'attendees'}
                </p>
              </div>

              {/* Company cards */}
              {entry.companies.map((company) => (
                <div
                  key={company.companyId}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all flex flex-col gap-3 bg-white"
                >
                  {/* Company header */}
                  <div className="min-w-0">
                    {company.companyId > 0 ? (
                      <Link
                        href={`/companies/${company.companyId}`}
                        className="font-semibold text-gray-900 hover:text-brand-secondary transition-colors text-sm block truncate"
                      >
                        {company.companyName}
                      </Link>
                    ) : (
                      <span className="font-semibold text-gray-900 text-sm block truncate">
                        {company.companyName || 'Unknown Company'}
                      </span>
                    )}
                    {company.assignedUserNames.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {company.assignedUserNames.map((name) => (
                          <span key={name} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Attendees */}
                  <div className="space-y-1">
                    {company.attendees.map((a) => {
                      const isTarget = targetMap.has(a.id);
                      const subtitleParts = [a.title, a.function].filter(Boolean);
                      return (
                        <div key={a.id} className="flex items-center gap-2 text-xs min-w-0">
                          <HealthDot score={a.health} />
                          <Link
                            href={`/attendees/${a.id}`}
                            className="text-gray-700 truncate flex-1 hover:text-brand-secondary transition-colors min-w-0"
                          >
                            <span className="font-medium">{a.firstName} {a.lastName}</span>
                            {subtitleParts.length > 0 && (
                              <span className="text-gray-400"> · {subtitleParts.join(' · ')}</span>
                            )}
                          </Link>
                          <TargetBtn
                            isTarget={isTarget}
                            onClick={() => onToggleTarget({
                              attendeeId: a.id,
                              firstName: a.firstName,
                              lastName: a.lastName,
                              title: a.title,
                              seniority: a.seniority,
                              companyName: company.companyName,
                              companyId: company.companyId > 0 ? company.companyId : null,
                              assignedUserNames: company.assignedUserNames,
                            })}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
