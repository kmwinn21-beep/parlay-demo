'use client';

import Link from 'next/link';
import type { RelationshipRow } from '../PreConferenceReview';

function HealthDot({ score }: { score: number }) {
  const color = score >= 75 ? '#34D399' : score >= 50 ? '#f59e0b' : score >= 25 ? '#f97316' : '#ef4444';
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />;
}

export function RelationshipsTab({ relationships }: { relationships: RelationshipRow[] }) {
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
          <div key={rel.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all flex flex-col gap-3">
            {/* Header */}
            <div>
              <Link href={`/companies/${rel.company_id}`} className="font-semibold text-gray-900 hover:text-brand-secondary transition-colors text-sm block truncate">
                {rel.company_name}
              </Link>
              {rel.relationship_status && (
                <span className="text-xs text-gray-500">{rel.relationship_status}</span>
              )}
            </div>

            {/* Description */}
            {rel.description && (
              <p className="text-xs text-gray-600 line-clamp-3">{rel.description}</p>
            )}

            {/* Rep names (resolved) */}
            {rel.rep_names.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {rel.rep_names.map((name) => (
                  <span key={name} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
                    {name}
                  </span>
                ))}
              </div>
            )}

            {/* Contact names (resolved from attendee IDs) */}
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
                  {rel.attendees.map((a) => (
                    <Link key={String(a.id)} href={`/attendees/${a.id}`} className="flex items-center gap-2 text-xs hover:text-brand-secondary transition-colors">
                      <HealthDot score={a.health} />
                      <span className="text-gray-700 truncate">{String(a.first_name)} {String(a.last_name)}{a.title ? ` · ${String(a.title)}` : ''}</span>
                      <span className="text-gray-400 ml-auto flex-shrink-0">{a.health}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recent notes */}
            {rel.recentNotes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Recent Notes</p>
                <div className="space-y-1.5">
                  {rel.recentNotes.map((n) => (
                    <div key={n.id} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-700 line-clamp-2">{n.content}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{n.rep ?? 'Unknown'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
