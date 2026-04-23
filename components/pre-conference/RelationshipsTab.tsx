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
      <div className="grid sm:grid-cols-2 gap-4">
        {relationships.map((rel) => (
          <div key={rel.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <Link href={`/companies/${rel.company_id}`} className="font-semibold text-gray-900 hover:text-brand-secondary transition-colors text-sm truncate block">
                  {rel.company_name}
                </Link>
                <span className="text-xs text-gray-500">{rel.relationship_status}</span>
              </div>
            </div>

            {/* Description */}
            {rel.description && (
              <p className="text-xs text-gray-600 mb-3 line-clamp-2">{rel.description}</p>
            )}

            {/* Reps */}
            {rel.rep_ids.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {rel.rep_ids.map((rep) => (
                  <span key={rep} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
                    {rep}
                  </span>
                ))}
              </div>
            )}

            {/* Attendees at this conference */}
            {rel.attendees.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">At This Conference</p>
                <div className="space-y-1">
                  {rel.attendees.map((a) => (
                    <Link key={a.id} href={`/attendees/${a.id}`} className="flex items-center gap-2 text-xs hover:text-brand-secondary transition-colors">
                      <HealthDot score={a.health} />
                      <span className="text-gray-700 truncate">{a.first_name} {a.last_name}{a.title ? ` · ${a.title}` : ''}</span>
                      <span className="text-gray-400 ml-auto flex-shrink-0">{a.health}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recent notes */}
            {rel.recentNotes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Recent Notes</p>
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
