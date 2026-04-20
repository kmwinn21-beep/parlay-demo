'use client';

import { useState } from 'react';

export interface PinnedNote {
  id: number;
  note_id: number;
  entity_type: string;
  entity_id: number;
  pinned_by: string;
  conference_name: string | null;
  attendee_name: string | null;
  attendee_id: number | null;
  created_at: string;
  content: string;
  note_created_at: string;
  rep: string | null;
  note_conference_name: string | null;
}

function formatDateTime(dt: string) {
  const d = new Date(dt.endsWith('Z') || dt.includes('+') ? dt : dt + 'Z');
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getUserInitials(email: string): string {
  const prefix = email.split('@')[0];
  // Try to split by common separators
  const parts = prefix.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  // Single word - take first two chars
  return prefix.slice(0, 2).toUpperCase();
}

// Render note content as plain text
function NoteContent({ content }: { content: string }) {
  return <>{content}</>;
}

export function PinnedNotesSection({
  pinnedNotes,
  onUnpin,
}: {
  pinnedNotes: PinnedNote[];
  onUnpin: (id: number) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [sectionCollapsed, setSectionCollapsed] = useState(true);

  if (pinnedNotes.length === 0) return null;

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="card border-l-4 border-l-brand-highlight">
      <button
        type="button"
        onClick={() => setSectionCollapsed(prev => !prev)}
        className="flex items-center gap-2 w-full text-left"
      >
        <svg className="w-5 h-5 text-brand-highlight flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
        </svg>
        <h2 className="text-lg font-semibold text-brand-primary font-serif">
          Pinned Notes ({pinnedNotes.length})
        </h2>
        <svg className={`w-5 h-5 text-gray-400 ml-auto transition-transform ${sectionCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!sectionCollapsed && <div className="space-y-3 mt-4">
        {pinnedNotes.map(pin => {
          const expanded = expandedIds.has(pin.id);
          const isLong = pin.content.length > 200 || pin.content.split('\n').length > 3;
          const initials = getUserInitials(pin.pinned_by);

          return (
            <div key={pin.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {/* Compact header with pills and actions */}
              <div className="px-4 py-3 flex items-center justify-between gap-2 bg-gray-50 border-b border-gray-100">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {/* Pinned by pill with user icon */}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-primary text-white text-xs font-medium" title={`Pinned by ${pin.pinned_by}`}>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                    </svg>
                    {initials}
                  </span>
                  {/* Conference pill */}
                  {pin.conference_name ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs font-medium border border-blue-100 whitespace-nowrap">
                      {pin.conference_name}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium border border-gray-200 whitespace-nowrap">
                      General
                    </span>
                  )}
                  {/* Attendee pill (if pinned from company details) */}
                  {pin.attendee_name && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-medium border border-teal-200 whitespace-nowrap">
                      {pin.attendee_name}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDateTime(pin.note_created_at)}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Expand/collapse button */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(pin.id)}
                    className="p-1 text-gray-400 hover:text-brand-secondary transition-colors rounded"
                    title={expanded ? 'Collapse' : 'Expand'}
                  >
                    <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {/* Unpin button */}
                  <button
                    type="button"
                    onClick={() => onUnpin(pin.id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded"
                    title="Unpin note"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Note content - collapsed by default showing 2 lines */}
              <div className="px-4 py-3">
                <p className={`text-sm text-gray-800 whitespace-pre-wrap leading-relaxed break-words ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
                  <NoteContent content={pin.content} />
                </p>
                {isLong && !expanded && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(pin.id)}
                    className="mt-1 text-xs text-brand-secondary hover:underline font-medium"
                  >
                    Show Full Note
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}
