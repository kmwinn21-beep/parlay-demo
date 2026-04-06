'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getPreset, type ColorMap } from '@/lib/colors';

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
  company_id: number | null;
  company_name: string | null;
  conference_name: string;
}

type SortKey = 'name' | 'title' | 'scheduled_by' | 'company' | 'datetime' | 'conference' | 'outcome';

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

function OutcomeButton({
  value,
  options,
  colorMap,
  onChange,
}: {
  value: string | null;
  options: string[];
  colorMap: ColorMap;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = spaceBelow < 200 && rect.top > 200;
      setDropdownPos({
        top: above ? rect.top : rect.bottom + 4,
        left: rect.left,
        above,
      });
    }
    setOpen(o => !o);
  };

  const preset = value ? getPreset(colorMap[value]) : null;
  const btnClass = preset
    ? `${preset.pillClass} px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap`
    : 'bg-gray-100 text-gray-500 border border-gray-300 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap';

  return (
    <div ref={ref} className="relative inline-block">
      <button ref={btnRef} type="button" className={btnClass} onClick={handleToggle}>
        {value || '— Select —'}
        <svg className="w-3 h-3 ml-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && dropdownPos && (
        <div
          style={{
            position: 'fixed',
            top: dropdownPos.above ? dropdownPos.top : dropdownPos.top,
            left: dropdownPos.left,
            zIndex: 9999,
            transform: dropdownPos.above ? 'translateY(-100%)' : 'translateY(0)',
          }}
          className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]"
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
            onClick={() => { onChange(''); setOpen(false); }}
          >
            — Clear —
          </button>
          {options.map(opt => {
            const p = getPreset(colorMap[opt]);
            return (
              <button
                key={opt}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                onClick={() => { onChange(opt); setOpen(false); }}
              >
                <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0`} style={{ backgroundColor: p.swatch }} />
                <span className={opt === value ? 'font-semibold' : ''}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface EditFormData {
  meeting_date: string;
  meeting_time: string;
  location: string;
  scheduled_by: string;
  additional_attendees: string;
}

function EditMeetingRow({
  meeting,
  onSave,
  onCancel,
  onDelete,
  userOptions = [],
}: {
  meeting: Meeting;
  onSave: (meetingId: number, data: EditFormData) => void;
  onCancel: () => void;
  onDelete?: (meetingId: number) => void;
  userOptions?: string[];
}) {
  const [form, setForm] = useState<EditFormData>({
    meeting_date: meeting.meeting_date,
    meeting_time: meeting.meeting_time,
    location: meeting.location || '',
    scheduled_by: meeting.scheduled_by || '',
    additional_attendees: meeting.additional_attendees || '',
  });

  const inputClass = 'w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-procare-bright-blue focus:border-procare-bright-blue bg-white';

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">
          Editing meeting with {meeting.first_name} {meeting.last_name}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Date *</label>
          <input type="date" className={inputClass} value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} required />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Time *</label>
          <input type="time" className={inputClass} value={form.meeting_time} onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))} required />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Location</label>
          <input type="text" className={inputClass} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Room 201, Lobby" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Scheduled By</label>
          <select className={inputClass} value={form.scheduled_by} onChange={e => setForm(f => ({ ...f, scheduled_by: e.target.value }))}>
            <option value="">Select user...</option>
            {userOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Additional Attendees</label>
          <input type="text" className={inputClass} value={form.additional_attendees} onChange={e => setForm(f => ({ ...f, additional_attendees: e.target.value }))} placeholder="Comma-separated names" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 bg-procare-bright-blue text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
            disabled={!form.meeting_date || !form.meeting_time}
            onClick={() => onSave(meeting.id, form)}
          >
            Save
          </button>
          <button
            type="button"
            className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300 transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
        {onDelete && (
          <button
            type="button"
            className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded border border-red-200 hover:bg-red-100 transition-colors"
            onClick={() => onDelete(meeting.id)}
          >
            Delete Meeting
          </button>
        )}
      </div>
    </div>
  );
}

function EditMeetingTableRow({
  meeting,
  onSave,
  onCancel,
  onDelete,
  colSpan,
  userOptions = [],
}: {
  meeting: Meeting;
  onSave: (meetingId: number, data: EditFormData) => void;
  onCancel: () => void;
  onDelete?: (meetingId: number) => void;
  colSpan: number;
  userOptions?: string[];
}) {
  const [form, setForm] = useState<EditFormData>({
    meeting_date: meeting.meeting_date,
    meeting_time: meeting.meeting_time,
    location: meeting.location || '',
    scheduled_by: meeting.scheduled_by || '',
    additional_attendees: meeting.additional_attendees || '',
  });

  const inputClass = 'w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-procare-bright-blue focus:border-procare-bright-blue bg-white';

  return (
    <tr className="bg-blue-50">
      <td colSpan={colSpan} className="px-3 py-3">
        <div className="space-y-2">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Editing meeting with {meeting.first_name} {meeting.last_name}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Date *</label>
              <input type="date" className={inputClass} value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Time *</label>
              <input type="time" className={inputClass} value={form.meeting_time} onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Location</label>
              <input type="text" className={inputClass} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Room 201" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Scheduled By</label>
              <select className={inputClass} value={form.scheduled_by} onChange={e => setForm(f => ({ ...f, scheduled_by: e.target.value }))}>
                <option value="">Select user...</option>
                {userOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Add&apos;l Attendees</label>
              <input type="text" className={inputClass} value={form.additional_attendees} onChange={e => setForm(f => ({ ...f, additional_attendees: e.target.value }))} placeholder="Comma-separated" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-2.5 py-1 bg-procare-bright-blue text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                disabled={!form.meeting_date || !form.meeting_time}
                onClick={() => onSave(meeting.id, form)}
              >
                Save
              </button>
              <button
                type="button"
                className="px-2.5 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300 transition-colors"
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
            {onDelete && (
              <button
                type="button"
                className="px-2.5 py-1 bg-red-50 text-red-600 text-xs font-semibold rounded border border-red-200 hover:bg-red-100 transition-colors"
                onClick={() => onDelete(meeting.id)}
              >
                Delete Meeting
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export function MeetingsTable({
  meetings,
  actionOptions,
  colorMap,
  onOutcomeChange,
  onDelete,
  onEdit,
  userOptions = [],
}: {
  meetings: Meeting[];
  actionOptions: string[];
  colorMap: ColorMap;
  onOutcomeChange: (meetingId: number, outcome: string) => void;
  onDelete?: (meetingId: number) => void;
  onEdit?: (meetingId: number, data: EditFormData) => void;
  userOptions?: string[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>('datetime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editingId, setEditingId] = useState<number | null>(null);
  const hasActions = !!onEdit;

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
      case 'scheduled_by':
        cmp = (a.scheduled_by || '').localeCompare(b.scheduled_by || '');
        break;
      case 'company':
        cmp = (a.company_name || '').localeCompare(b.company_name || '');
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
            {editingId === m.id && onEdit ? (
              <EditMeetingRow
                meeting={m}
                onSave={(id, data) => { onEdit(id, data); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
                onDelete={onDelete ? (id) => { onDelete(id); setEditingId(null); } : undefined}
                userOptions={userOptions}
              />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <Link href={`/attendees/${m.attendee_id}`} className="text-sm font-semibold text-procare-bright-blue hover:underline">
                      {m.first_name} {m.last_name}
                    </Link>
                    {m.title && <p className="text-xs text-gray-500 mt-0.5">{m.title}</p>}
                    {m.company_name && m.company_id ? (
                      <Link href={`/companies/${m.company_id}`} className="text-xs text-procare-bright-blue hover:underline mt-0.5">
                        {m.company_name}
                      </Link>
                    ) : m.company_name ? (
                      <p className="text-xs text-gray-400 mt-0.5">{m.company_name}</p>
                    ) : null}
                  </div>
                  <MeetingInfoTooltip scheduledBy={m.scheduled_by} location={m.location} attendees={m.additional_attendees} />
                  {onEdit && (
                    <button onClick={() => setEditingId(m.id)} className="flex-shrink-0 text-gray-400 hover:text-procare-bright-blue p-1 rounded" title="Edit">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
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
                <div className="mt-2 flex items-center justify-between gap-2">
                  <OutcomeButton
                    value={m.outcome}
                    options={actionOptions}
                    colorMap={colorMap}
                    onChange={(val) => onOutcomeChange(m.id, val)}
                  />
                  {m.scheduled_by && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium whitespace-nowrap">
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {m.scheduled_by}
                    </span>
                  )}
                </div>
              </>
            )}
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
              <SortHeader label="Scheduled By" col="scheduled_by" />
              <SortHeader label="Company" col="company" />
              <SortHeader label="Date/Time" col="datetime" />
              <SortHeader label="Conference" col="conference" />
              <SortHeader label="Outcome" col="outcome" />
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Info</th>
              {hasActions && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((m) => (
              editingId === m.id && onEdit ? (
                <EditMeetingTableRow
                  key={m.id}
                  meeting={m}
                  onSave={(id, data) => { onEdit(id, data); setEditingId(null); }}
                  onCancel={() => setEditingId(null)}
                  onDelete={onDelete ? (id) => { onDelete(id); setEditingId(null); } : undefined}
                  colSpan={8 + (hasActions ? 1 : 0)}
                  userOptions={userOptions}
                />
              ) : (
              <tr key={m.id} className="transition-colors align-top hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800">
                  <Link href={`/attendees/${m.attendee_id}`} className="text-procare-bright-blue hover:underline leading-snug">
                    {m.first_name} {m.last_name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-600 leading-snug">
                  <span className="block text-xs leading-snug break-words whitespace-normal">{m.title || <span className="text-gray-300">—</span>}</span>
                </td>
                <td className="px-3 py-2 leading-snug">
                  {m.scheduled_by ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium whitespace-nowrap">
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {m.scheduled_by}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600 leading-snug">
                  {m.company_name && m.company_id ? (
                    <Link href={`/companies/${m.company_id}`} className="text-xs text-procare-bright-blue hover:underline break-words whitespace-normal leading-snug">
                      {m.company_name}
                    </Link>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
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
                  <OutcomeButton
                    value={m.outcome}
                    options={actionOptions}
                    colorMap={colorMap}
                    onChange={(val) => onOutcomeChange(m.id, val)}
                  />
                </td>
                <td className="px-3 py-2">
                  <MeetingInfoTooltip scheduledBy={m.scheduled_by} location={m.location} attendees={m.additional_attendees} />
                </td>
                {hasActions && (
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingId(m.id)} className="text-gray-400 hover:text-procare-bright-blue text-xs font-medium transition-colors">Edit</button>
                    </div>
                  </td>
                )}
              </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
