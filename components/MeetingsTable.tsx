'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';

export interface Meeting {
  id: number;
  attendee_id: number;
  conference_id: number;
  meeting_date: string;
  meeting_time: string;
  location: string | null;
  scheduled_by: string | null;
  additional_attendees: string | null;
  outcome: string | null;
  created_at: string;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  conference_name: string;
}

type SortKey = 'name' | 'title' | 'datetime' | 'conference' | 'outcome';

function formatMeetingDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMeetingTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function MeetingInfoTooltip({ scheduledBy, location, attendees }: { scheduledBy?: string | null; location?: string | null; attendees?: string | null }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const attendeeList = attendees ? attendees.split(',').map(n => n.trim()).filter(Boolean) : [];
  const hasContent = scheduledBy || location || attendeeList.length > 0;

  const handleMouseEnter = () => {
    if (!ref.current || !hasContent) return;
    const rect = ref.current.getBoundingClientRect();
    const w = Math.min(240, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
    const above = rect.top > 180;
    setPos({ top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above });
  };

  if (!hasContent) return null;

  return (
    <div ref={ref} className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={() => setPos(null)}>
      <button type="button" className="text-gray-400 hover:text-procare-bright-blue transition-colors" title="Meeting Info">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5 space-y-2">
            {scheduledBy && (
              <div>
                <p className="font-semibold mb-0.5 text-gray-300 uppercase tracking-wide text-[10px]">Scheduled By</p>
                <p>{scheduledBy}</p>
              </div>
            )}
            {location && (
              <div>
                <p className="font-semibold mb-0.5 text-gray-300 uppercase tracking-wide text-[10px]">Location</p>
                <p>{location}</p>
              </div>
            )}
            {attendeeList.length > 0 && (
              <div>
                <p className="font-semibold mb-1 text-gray-300 uppercase tracking-wide text-[10px]">Additional Attendees</p>
                <ul className="space-y-1">{attendeeList.map((name, i) => <li key={i} className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />{name}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function MeetingsTable({
  meetings,
  actionOptions,
  onOutcomeChange,
  onDelete,
}: {
  meetings: Meeting[];
  actionOptions: string[];
  onOutcomeChange: (meetingId: number, outcome: string) => void;
  onDelete?: (meetingId: number) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('datetime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...meetings].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name':
        cmp = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
        break;
      case 'title':
        cmp = (a.title || '').localeCompare(b.title || '');
        break;
      case 'datetime':
        cmp = `${a.meeting_date} ${a.meeting_time}`.localeCompare(`${b.meeting_date} ${b.meeting_time}`);
        break;
      case 'conference':
        cmp = a.conference_name.localeCompare(b.conference_name);
        break;
      case 'outcome':
        cmp = (a.outcome || '').localeCompare(b.outcome || '');
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === col && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sortDir === 'asc'
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />}
          </svg>
        )}
      </span>
    </th>
  );

  if (meetings.length === 0) {
    return (
      <div className="text-center py-8">
        <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-gray-400 text-xs">No meetings scheduled yet.</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile card layout */}
      <div className="block lg:hidden divide-y divide-gray-100">
        {sorted.map((m) => (
          <div key={m.id} className="p-4 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Link href={`/attendees/${m.attendee_id}`} className="text-sm font-semibold text-procare-bright-blue hover:underline">
                  {m.first_name} {m.last_name}
                </Link>
                {m.title && <p className="text-xs text-gray-500 mt-0.5">{m.title}</p>}
              </div>
              <MeetingInfoTooltip scheduledBy={m.scheduled_by} location={m.location} attendees={m.additional_attendees} />
              {onDelete && (
                <button onClick={() => onDelete(m.id)} className="flex-shrink-0 text-red-400 hover:text-red-600 p-1 rounded" title="Delete">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-600">
                {formatMeetingDate(m.meeting_date)} at {formatMeetingTime(m.meeting_time)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Link href={`/conferences/${m.conference_id}`} className="text-xs text-procare-bright-blue hover:underline">
                {m.conference_name}
              </Link>
            </div>
            <div className="mt-2">
              <select
                value={m.outcome || ''}
                onChange={e => onOutcomeChange(m.id, e.target.value)}
                className="input-field text-xs py-1"
              >
                <option value="">— Select Outcome —</option>
                {actionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table layout */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full" style={{ fontSize: '0.7rem' }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <SortHeader label="Name" col="name" />
              <SortHeader label="Title" col="title" />
              <SortHeader label="Date/Time" col="datetime" />
              <SortHeader label="Conference" col="conference" />
              <SortHeader label="Outcome" col="outcome" />
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Info</th>
              {onDelete && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((m) => (
              <tr key={m.id} className="transition-colors align-top hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800">
                  <Link href={`/attendees/${m.attendee_id}`} className="text-procare-bright-blue hover:underline leading-snug">
                    {m.first_name} {m.last_name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-600 leading-snug">
                  {m.title || <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 text-gray-600 leading-snug">
                  <div className="font-medium">{formatMeetingDate(m.meeting_date)}</div>
                  <div className="text-gray-400">{formatMeetingTime(m.meeting_time)}</div>
                </td>
                <td className="px-3 py-2 text-gray-600 leading-snug">
                  <Link href={`/conferences/${m.conference_id}`} className="text-procare-bright-blue hover:underline">
                    {m.conference_name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={m.outcome || ''}
                    onChange={e => onOutcomeChange(m.id, e.target.value)}
                    className="input-field text-xs py-1 min-w-[120px]"
                  >
                    <option value="">— Select —</option>
                    {actionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <MeetingInfoTooltip scheduledBy={m.scheduled_by} location={m.location} attendees={m.additional_attendees} />
                </td>
                {onDelete && (
                  <td className="px-3 py-2">
                    <button onClick={() => onDelete(m.id)} className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
