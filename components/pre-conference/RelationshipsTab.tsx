'use client';

import Link from 'next/link';
import { TargetBtn } from './TargetBtn';
import type { RelationshipRow, TargetEntry } from '../PreConferenceReview';

function HealthDot({ score }: { score: number }) {
  const color = score >= 75 ? '#34D399' : score >= 50 ? '#f59e0b' : score >= 25 ? '#f97316' : '#ef4444';
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />;
}

export function RelationshipsTab({
  relationships,
  targetMap,
  onToggleTarget,
}: {
  relationships: RelationshipRow[];
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
}) {
  if (relationships.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No internal relationships found for companies attending this conference.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{relationships.length} relationship{relationships.length !== 1 ? 's' : ''} on record</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {relationships.map((rel) => (
          <div key={rel.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all flex flex-col gap-3 overflow-hidden min-w-0">
            {/* Header */}
            <div className="min-w-0">
              <Link href={`/companies/${rel.company_id}`} className="font-semibold text-gray-900 hover:text-brand-secondary transition-colors text-sm block truncate">
                {rel.company_name}
              </Link>
              {rel.relationship_status && (
                <span className="text-xs text-gray-500 truncate block">{rel.relationship_status}</span>
              )}
            </div>

            {/* Description */}
            {rel.description && (
              <p className="text-xs text-gray-600 line-clamp-3">{rel.description}</p>
            )}

            {/* Rep names */}
            {rel.rep_names.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {rel.rep_names.map((name) => (
                  <span key={name} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
                    {name}
                  </span>
                ))}
              </div>
            )}

            {/* Contact names */}
            {rel.contact_names.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Contacts</p>
                <div className="flex flex-wrap gap-1">
                  {rel.contact_names.map((name) => (
                    <span key={name} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Attendees at this conference */}
            {rel.attendees.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">At This Conference</p>
                <div className="space-y-1">
                  {rel.attendees.map((a) => {
                    const isTarget = targetMap.has(Number(a.id));
                    return (
                      <div key={String(a.id)} className="flex items-center gap-2 text-xs">
                        <HealthDot score={a.health} />
                        <Link
                          href={`/attendees/${a.id}`}
                          className="text-gray-700 truncate flex-1 hover:text-brand-secondary transition-colors"
                        >
                          {String(a.first_name)} {String(a.last_name)}{a.title ? ` · ${String(a.title)}` : ''}
                        </Link>
                        <TargetBtn
                          isTarget={isTarget}
                          onClick={() => onToggleTarget({
                            attendeeId: Number(a.id),
                            firstName: String(a.first_name),
                            lastName: String(a.last_name),
                            title: a.title ? String(a.title) : null,
                            seniority: a.seniority ?? null,
                            companyName: rel.company_name,
                            companyId: rel.company_id,
                            assignedUserNames: rel.rep_names,
                          })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
