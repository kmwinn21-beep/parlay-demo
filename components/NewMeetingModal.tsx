'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { useActiveConference } from '@/components/ActiveConferenceContext';
import { type UserOption } from '@/lib/useUserOptions';
import { useHideBottomNav } from './BottomNavContext';
import { type Meeting } from '@/components/MeetingsTable';
import { useUser } from '@/components/UserContext';
import { GroupedCompanyDropdown } from '@/components/GroupedCompanyDropdown';
import { SendCalendarInvitePrompt } from '@/components/SendCalendarInvitePrompt';
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from '@/lib/calendarInvite';

interface ConferenceOption {
  id: number;
  name: string;
  start_date: string;
  end_date?: string;
  location_timezone?: string | null;
}

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  company_id: number | null;
  company_name: string | null;
  email?: string | null;
}

interface CompanyOption {
  id: number;
  name: string;
  company_type?: string | null;
}

interface ConferenceMeeting {
  id: number;
  meeting_date: string;
  meeting_time: string;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  scheduled_by: string | null;
}

/** Returns every date (YYYY-MM-DD) between start and end inclusive, capped at 14 days. */
function getConferenceDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const startMs = new Date(start + 'T00:00:00').getTime();
  const endMs = new Date(end + 'T00:00:00').getTime();
  let cur = startMs;
  while (cur <= endMs && dates.length < 14) {
    const d = new Date(cur);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur += 86400000;
  }
  return dates;
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatChipDate(ymd: string): { short: string; full: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const short = `${DAY_ABBR[date.getDay()]} ${MONTH_ABBR[m - 1]} ${d}`;
  const full = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return { short, full };
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatTime12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// 6:00 AM → 9:45 PM in 15-min increments
const TIME_OPTIONS: { value: string; label: string }[] = Array.from({ length: 64 }, (_, i) => {
  const totalMins = 360 + i * 15;
  const h24 = Math.floor(totalMins / 60);
  const min = totalMins % 60;
  const value = `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  const label = formatTime12(value);
  return { value, label };
});

function SidebarContent({
  selectedConference,
  loadingMeetings,
  meetingsByDay,
  meetingDate,
  meetingTime,
  collapsedDays,
  setCollapsedDays,
  selectedRepIds,
}: {
  selectedConference: ConferenceOption | undefined;
  loadingMeetings: boolean;
  meetingsByDay: [string, ConferenceMeeting[]][];
  meetingDate: string;
  meetingTime: string;
  collapsedDays: Set<string>;
  setCollapsedDays: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedRepIds: number[];
}) {
  return (
    <>
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0 hidden md:block">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scheduled Meetings</p>
        <p className="text-xs text-gray-400 mt-0.5">{selectedConference?.name}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loadingMeetings ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-xs">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : meetingsByDay.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-gray-400">No meetings scheduled yet.</p>
        ) : (
          meetingsByDay.map(([day, dayMeetings]) => {
            const { short } = formatChipDate(day);
            const isCollapsed = collapsedDays.has(day);
            const isSelectedDay = day === meetingDate;
            return (
              <div key={day} className="border-b border-gray-100 last:border-0">
                <button
                  type="button"
                  onClick={() => setCollapsedDays(prev => {
                    const next = new Set(Array.from(prev));
                    if (next.has(day)) next.delete(day); else next.add(day);
                    return next;
                  })}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-100 transition-colors ${isSelectedDay ? 'bg-brand-primary/5' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${isSelectedDay ? 'text-brand-primary' : 'text-gray-700'}`}>{short}</span>
                    <span className="text-xs text-gray-400 bg-gray-200 rounded-full px-1.5 py-0.5 leading-none">{dayMeetings.length}</span>
                  </div>
                  <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {!isCollapsed && (
                  <div className="px-4 pb-2 space-y-1.5">
                    {dayMeetings.map(m => {
                      const selMins = meetingTime ? timeToMins(meetingTime) : -1;
                      const mMins = m.meeting_time ? timeToMins(m.meeting_time) : -1;
                      const isConflict = selMins >= 0 && mMins >= 0 && day === meetingDate && Math.abs(mMins - selMins) < 30;
                      const isRepConflict = isConflict && m.scheduled_by
                        ? m.scheduled_by.split(',').map(s => Number(s.trim())).some(id => selectedRepIds.includes(id))
                        : false;
                      return (
                        <div key={m.id} className={`rounded-lg px-2.5 py-2 text-xs ${isRepConflict ? 'bg-red-50 border border-red-200' : isConflict ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-gray-100'}`}>
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="font-medium text-gray-800 truncate">{m.first_name} {m.last_name}</span>
                            {m.meeting_time && (
                              <span className={`flex-shrink-0 font-semibold tabular-nums ${isRepConflict ? 'text-red-600' : isConflict ? 'text-amber-600' : 'text-brand-primary'}`}>
                                {formatTime12(m.meeting_time)}
                              </span>
                            )}
                          </div>
                          {m.company_name && <p className="text-gray-400 truncate">{m.company_name}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

interface NewMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillCompanyId?: number;
  prefillAttendeeId?: number;
  onSuccess?: (meeting: Meeting) => void;
  availableConferences?: Array<{ id: number; name: string; start_date: string; end_date?: string }>;
  defaultConferenceId?: number;
}

export function NewMeetingModal({
  isOpen,
  onClose,
  prefillCompanyId,
  prefillAttendeeId,
  onSuccess,
  availableConferences,
  defaultConferenceId,
}: NewMeetingModalProps) {
  useHideBottomNav(isOpen);
  const { user } = useUser();
  const { activeConference } = useActiveConference();
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [conferences, setConferences] = useState<ConferenceOption[]>([]);
  const [attendees, setAttendees] = useState<AttendeeOption[]>([]);
  const [loadingConference, setLoadingConference] = useState(false);
  const [inviteContext, setInviteContext] = useState<{
    attendeeName: string;
    attendeeEmail: string | null;
    title: string;
    location: string;
    dateYMD: string;
    timeHM: string;
    timezone: string | null;
  } | null>(null);

  const [selectedRepIds, setSelectedRepIds] = useState<number[]>([]);
  const [selectedConferenceId, setSelectedConferenceId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedAttendeeId, setSelectedAttendeeId] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [meetingType, setMeetingType] = useState('');
  const [meetingTypeOptions, setMeetingTypeOptions] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [additionalAttendees, setAdditionalAttendees] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [companyTypeLookup, setCompanyTypeLookup] = useState<Map<number, string | null>>(new Map());
  const [showFullCalendar, setShowFullCalendar] = useState(false);

  // Conference meetings sidebar
  const [conferenceMeetings, setConferenceMeetings] = useState<ConferenceMeeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const isPrefilling = useRef(false);

  // Fetch users and conferences on open
  useEffect(() => {
    if (!isOpen) return;
    if (user?.configId) setSelectedRepIds([user.configId]);
    fetch('/api/config?category=user&form=conference_detail')
      .then(r => r.json())
      .then((data: { id: number; value: string }[]) =>
        setUserOptions(data.map(d => ({ id: Number(d.id), value: String(d.value) })))
      ).catch(() => {});
    fetch('/api/config?category=meeting_type')
      .then(r => r.json())
      .then((data: { value: string }[]) => setMeetingTypeOptions(data.map(d => d.value)))
      .catch(() => {});
    if (availableConferences) {
      setConferences(availableConferences);
    } else {
      fetch('/api/conferences')
        .then(r => r.json())
        .then((data: ConferenceOption[]) => setConferences(data))
        .catch(() => {});
    }
    const effectiveConfId = defaultConferenceId ?? activeConference?.id;
    if (effectiveConfId) setSelectedConferenceId(String(effectiveConfId));
    fetch('/api/companies?minimal=1')
      .then(r => r.json())
      .then((data: Array<{ id: number; company_type?: string | null }>) => {
        setCompanyTypeLookup(new Map(data.map(c => [Number(c.id), c.company_type ?? null])));
      }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fetch conference attendees + sidebar meetings when conference changes
  useEffect(() => {
    if (!selectedConferenceId) {
      setAttendees([]);
      setSelectedCompanyId('');
      setSelectedAttendeeId('');
      setConferenceMeetings([]);
      setCollapsedDays(new Set());
      return;
    }
    setLoadingConference(true);
    setSelectedCompanyId('');
    setSelectedAttendeeId('');

    // Fetch attendees
    fetch(`/api/conferences/${selectedConferenceId}`)
      .then(r => r.json())
      .then((data: { attendees: AttendeeOption[] }) => {
        const fetched = data.attendees || [];
        setAttendees(fetched);
        if (prefillCompanyId) {
          const hasCompany = fetched.some(a => a.company_id === prefillCompanyId);
          if (hasCompany) {
            isPrefilling.current = true;
            setSelectedCompanyId(String(prefillCompanyId));
            if (prefillAttendeeId) {
              const hasAttendee = fetched.some(a => a.id === prefillAttendeeId && a.company_id === prefillCompanyId);
              if (hasAttendee) setSelectedAttendeeId(String(prefillAttendeeId));
            }
          }
        }
      })
      .catch(() => setAttendees([]))
      .finally(() => setLoadingConference(false));

    // Fetch sidebar meetings
    setLoadingMeetings(true);
    fetch(`/api/meetings?conference_id=${selectedConferenceId}`)
      .then(r => r.json())
      .then((data: ConferenceMeeting[]) => {
        setConferenceMeetings(data.sort((a, b) => {
          const d = a.meeting_date.localeCompare(b.meeting_date);
          return d !== 0 ? d : (a.meeting_time || '').localeCompare(b.meeting_time || '');
        }));
        setCollapsedDays(new Set()); // expand all on new conference
      })
      .catch(() => setConferenceMeetings([]))
      .finally(() => setLoadingMeetings(false));
  }, [selectedConferenceId, prefillCompanyId, prefillAttendeeId]);

  // Collapse non-matching day groups when a date is selected
  useEffect(() => {
    if (!meetingDate || conferenceMeetings.length === 0) return;
    const allDays = Array.from(new Set(conferenceMeetings.map(m => m.meeting_date)));
    setCollapsedDays(new Set(allDays.filter(d => d !== meetingDate)));
  }, [meetingDate, conferenceMeetings]);

  // Reset contact when company changes (skip if prefill)
  useEffect(() => {
    if (isPrefilling.current) { isPrefilling.current = false; return; }
    setSelectedAttendeeId('');
  }, [selectedCompanyId]);

  const companies = useMemo<CompanyOption[]>(() => {
    const map = new Map<number, { name: string; company_type: string | null }>();
    for (const a of attendees) {
      if (a.company_id && a.company_name) {
        map.set(a.company_id, { name: a.company_name, company_type: companyTypeLookup.get(a.company_id) ?? null });
      }
    }
    return Array.from(map.entries())
      .map(([id, { name, company_type }]) => ({ id, name, company_type }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [attendees, companyTypeLookup]);

  const contacts = useMemo(() => {
    if (!selectedCompanyId) return [];
    const cid = Number(selectedCompanyId);
    return attendees
      .filter(a => a.company_id === cid)
      .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
  }, [attendees, selectedCompanyId]);

  // Conference date chips
  const selectedConference = conferences.find(c => c.id === Number(selectedConferenceId));
  const conferenceDates: string[] = useMemo(() => {
    if (!selectedConference?.end_date) return [];
    return getConferenceDateRange(selectedConference.start_date, selectedConference.end_date);
  }, [selectedConference]);

  // Conflict detection
  const conflicts = useMemo(() => {
    if (!meetingDate || !meetingTime || conferenceMeetings.length === 0) return { repConflict: false, overlapConflict: false };
    const selMins = timeToMins(meetingTime);
    const sameDayMeetings = conferenceMeetings.filter(m => m.meeting_date === meetingDate && m.meeting_time);

    // Rep conflict: selected rep has a meeting at the exact same time on this date (across any conference)
    const repConflict = selectedRepIds.length > 0 && sameDayMeetings.some(m => {
      if (!m.scheduled_by) return false;
      const mRepIds = m.scheduled_by.split(',').map(s => Number(s.trim()));
      const repOverlap = mRepIds.some(id => selectedRepIds.includes(id));
      if (!repOverlap) return false;
      return timeToMins(m.meeting_time) === selMins;
    });

    // Overlap: any meeting on same date within 30-min window
    const overlapConflict = sameDayMeetings.some(m => {
      const mMins = timeToMins(m.meeting_time);
      return Math.abs(mMins - selMins) < 30;
    });

    return { repConflict, overlapConflict };
  }, [meetingDate, meetingTime, conferenceMeetings, selectedRepIds]);

  // Sidebar: group meetings by day
  const meetingsByDay = useMemo(() => {
    const map = new Map<string, ConferenceMeeting[]>();
    for (const m of conferenceMeetings) {
      const day = m.meeting_date;
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [conferenceMeetings]);

  function resetForm() {
    setSelectedRepIds([]);
    setSelectedConferenceId('');
    setSelectedCompanyId('');
    setSelectedAttendeeId('');
    setMeetingDate('');
    setMeetingTime('');
    setMeetingType('');
    setLocation('');
    setAdditionalAttendees('');
    setShowFullCalendar(false);
    setConferenceMeetings([]);
    setCollapsedDays(new Set());
    setShowMobileSidebar(false);
    isPrefilling.current = false;
  }

  function handleClose() { resetForm(); onClose(); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAttendeeId || !selectedConferenceId || !meetingDate || !meetingTime) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendee_id: Number(selectedAttendeeId),
          conference_id: Number(selectedConferenceId),
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          meeting_type: meetingType || null,
          location: location || null,
          scheduled_by: selectedRepIds.length > 0 ? selectedRepIds.join(',') : null,
          additional_attendees: additionalAttendees || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to schedule meeting');
      }
      const created = await res.json();
      toast.success('Meeting scheduled successfully!');
      {
        const contact = contacts.find(a => a.id === Number(selectedAttendeeId));
        const conf = conferences.find(c => c.id === Number(selectedConferenceId));
        const company = companies.find(c => c.id === Number(selectedCompanyId));
        const meeting: Meeting = {
          id: Number(created.id),
          attendee_id: Number(selectedAttendeeId),
          conference_id: Number(selectedConferenceId),
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          meeting_type: meetingType || null,
          location: location || null,
          scheduled_by: selectedRepIds.length > 0 ? selectedRepIds.join(',') : null,
          additional_attendees: additionalAttendees || null,
          outcome: created.outcome || 'Scheduled',
          created_at: created.created_at || new Date().toISOString(),
          first_name: contact?.first_name || '',
          last_name: contact?.last_name || '',
          title: contact?.title || null,
          company_id: contact?.company_id || null,
          company_name: company?.name || null,
          company_wse: null,
          conference_name: conf?.name || '',
        };
        onSuccess?.(meeting);
        // Broadcast so any Meetings tab/list elsewhere on the page (which may not have a
        // direct prop connection to this modal, e.g. a globally-mounted drawer) can also
        // optimistically insert this meeting instead of requiring a reload.
        window.dispatchEvent(new CustomEvent('meeting-scheduled', { detail: meeting }));

        // Offer to draft a calendar invite instead of closing immediately — the modal stays
        // mounted (isOpen is still true) and swaps to the SendCalendarInvitePrompt below.
        if (contact) {
          const attendeeFirst = contact.first_name || 'Attendee';
          const repFirst = user?.firstName || 'Rep';
          setInviteContext({
            attendeeName: `${contact.first_name} ${contact.last_name}`.trim(),
            attendeeEmail: contact.email || null,
            title: `${attendeeFirst} and ${repFirst}: ${conf?.name || 'Conference'} Meeting`,
            location: location || meetingType || '',
            dateYMD: meetingDate,
            timeHM: meetingTime,
            timezone: conf?.location_timezone || null,
          });
        } else {
          handleClose();
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule meeting');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  if (inviteContext) {
    const finish = () => { setInviteContext(null); handleClose(); };
    return (
      <SendCalendarInvitePrompt
        attendeeName={inviteContext.attendeeName}
        onDismiss={finish}
        onGoogle={() => {
          window.open(buildGoogleCalendarUrl({
            title: inviteContext.title,
            attendeeEmail: inviteContext.attendeeEmail,
            location: inviteContext.location,
            dateYMD: inviteContext.dateYMD,
            timeHM: inviteContext.timeHM,
            timezone: inviteContext.timezone,
          }), '_blank', 'noopener,noreferrer');
          finish();
        }}
        onOutlook={() => {
          window.open(buildOutlookCalendarUrl({
            title: inviteContext.title,
            attendeeEmail: inviteContext.attendeeEmail,
            location: inviteContext.location,
            dateYMD: inviteContext.dateYMD,
            timeHM: inviteContext.timeHM,
            timezone: inviteContext.timezone,
          }), '_blank', 'noopener,noreferrer');
          finish();
        }}
      />
    );
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary focus:border-brand-secondary bg-white';
  const labelClass = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1';
  const hasSidebar = selectedConferenceId !== '' && (conferenceMeetings.length > 0 || loadingMeetings);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 py-6">
      <div className={`relative bg-white rounded-xl shadow-2xl border border-brand-highlight w-full mx-4 max-h-[90vh] min-h-0 flex flex-col transition-all duration-200 overflow-hidden ${hasSidebar ? 'max-w-4xl' : 'max-w-lg'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-brand-primary font-serif">Schedule New Meeting</h2>
          <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — form + optional sidebar */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-w-0 min-h-0">
            {/* Rep */}
            <div>
              <label className={labelClass}>Rep</label>
              <RepMultiSelect
                options={userOptions}
                selectedIds={selectedRepIds}
                onChange={setSelectedRepIds}
                triggerClass={`${inputClass} flex items-center justify-between gap-2`}
                placeholder="Select reps..."
              />
            </div>

            {/* Conference */}
            <div>
              <label className={labelClass}>Conference *</label>
              <select className={inputClass} value={selectedConferenceId} onChange={e => { setSelectedConferenceId(e.target.value); setMeetingDate(''); setShowFullCalendar(false); }} required>
                <option value="">Select conference...</option>
                {conferences.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Company */}
            <div>
              <label className={labelClass}>Company *</label>
              <GroupedCompanyDropdown
                companies={companies}
                value={selectedCompanyId ? Number(selectedCompanyId) : null}
                onChange={(id) => setSelectedCompanyId(String(id))}
                onClear={() => setSelectedCompanyId('')}
                placeholder={!selectedConferenceId ? 'Select a conference first' : loadingConference ? 'Loading companies...' : 'Search companies...'}
                disabled={!selectedConferenceId || loadingConference}
                inputClassName={inputClass}
              />
            </div>

            {/* Contact */}
            <div>
              <label className={labelClass}>Contact *</label>
              <select className={inputClass} value={selectedAttendeeId} onChange={e => setSelectedAttendeeId(e.target.value)} required disabled={!selectedCompanyId}>
                <option value="">{selectedCompanyId ? 'Select contact...' : 'Select a company first'}</option>
                {contacts.map(a => (
                  <option key={a.id} value={a.id}>{a.first_name} {a.last_name}{a.title ? ` — ${a.title}` : ''}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className={labelClass}>Date *</label>
              {conferenceDates.length > 0 && !showFullCalendar ? (
                <div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {conferenceDates.map(ymd => {
                      const { short, full } = formatChipDate(ymd);
                      const selected = meetingDate === ymd;
                      return (
                        <button key={ymd} type="button" title={full}
                          onClick={() => setMeetingDate(ymd)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                            selected
                              ? 'bg-brand-primary text-white border-brand-primary'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-brand-primary hover:text-brand-primary'
                          }`}
                        >{short}</button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => { setShowFullCalendar(true); setMeetingDate(''); }}
                    className="text-xs text-brand-secondary hover:text-brand-primary transition-colors flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Pick another date
                  </button>
                </div>
              ) : (
                <div>
                  <input type="date" className={inputClass} value={meetingDate}
                    min={selectedConference?.start_date}
                    onChange={e => setMeetingDate(e.target.value)} required />
                  {conferenceDates.length > 0 && (
                    <button type="button" onClick={() => { setShowFullCalendar(false); setMeetingDate(''); }}
                      className="mt-1.5 text-xs text-brand-secondary hover:text-brand-primary transition-colors flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to conference dates
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Time — 15-min increment dropdown */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass} style={{ marginBottom: 0 }}>Time *</label>
                {hasSidebar && (
                  <button
                    type="button"
                    onClick={() => setShowMobileSidebar(true)}
                    className="md:hidden flex items-center gap-1.5 text-xs font-medium text-brand-secondary hover:text-brand-primary transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {loadingMeetings ? 'Loading…' : `${conferenceMeetings.length} meeting${conferenceMeetings.length !== 1 ? 's' : ''}`}
                    {(conflicts.repConflict || conflicts.overlapConflict) && (
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conflicts.repConflict ? 'bg-red-500' : 'bg-amber-400'}`} />
                    )}
                  </button>
                )}
              </div>
              <select className={inputClass} value={meetingTime} onChange={e => setMeetingTime(e.target.value)} required>
                <option value="">Select time...</option>
                {TIME_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {/* Conflict warnings */}
              {meetingDate && meetingTime && (conflicts.repConflict || conflicts.overlapConflict) && (
                <div className="mt-2 space-y-1.5">
                  {conflicts.repConflict && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                      <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <p className="text-xs text-red-700 font-medium">Rep conflict — selected rep already has a meeting at this time.</p>
                    </div>
                  )}
                  {conflicts.overlapConflict && !conflicts.repConflict && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <p className="text-xs text-amber-700 font-medium">Another meeting is scheduled within 30 minutes of this time.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Meeting Type */}
            <div>
              <label className={labelClass}>Meeting Type</label>
              <select className={inputClass} value={meetingType} onChange={e => setMeetingType(e.target.value)}>
                <option value="">— None —</option>
                {meetingTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            {/* Location */}
            <div>
              <label className={labelClass}>Meeting Location</label>
              <input type="text" className={inputClass} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Room 201, Lobby Bar" />
            </div>

            {/* Additional Attendees */}
            <div>
              <label className={labelClass}>Additional Attendees</label>
              <input type="text" className={inputClass} value={additionalAttendees} onChange={e => setAdditionalAttendees(e.target.value)} placeholder="Comma-separated names" />
            </div>
          </form>

          {/* Sidebar — conference meetings (desktop: always visible, mobile: hidden — use sheet) */}
          {hasSidebar && (
            <div className="hidden md:flex w-72 flex-shrink-0 border-l border-gray-200 flex-col overflow-hidden bg-gray-50 min-h-0">
              <SidebarContent
                selectedConference={selectedConference}
                loadingMeetings={loadingMeetings}
                meetingsByDay={meetingsByDay}
                meetingDate={meetingDate}
                meetingTime={meetingTime}
                collapsedDays={collapsedDays}
                setCollapsedDays={setCollapsedDays}
                selectedRepIds={selectedRepIds}
              />
            </div>
          )}
        </div>

        {/* Mobile meetings sheet — slides over the form */}
        {hasSidebar && showMobileSidebar && (
          <div className="md:hidden absolute inset-0 z-20 flex flex-col bg-white rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div>
                <p className="text-sm font-semibold text-brand-primary font-serif">Scheduled Meetings</p>
                <p className="text-xs text-gray-400 mt-0.5">{selectedConference?.name}</p>
              </div>
              <button type="button" onClick={() => setShowMobileSidebar(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SidebarContent
              selectedConference={selectedConference}
              loadingMeetings={loadingMeetings}
              meetingsByDay={meetingsByDay}
              meetingDate={meetingDate}
              meetingTime={meetingTime}
              collapsedDays={collapsedDays}
              setCollapsedDays={setCollapsedDays}
              selectedRepIds={selectedRepIds}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button type="button" onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button type="submit" onClick={handleSubmit}
            disabled={submitting || !selectedAttendeeId || !selectedConferenceId || !meetingDate || !meetingTime || !!user?.demoVisitor}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-secondary rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Scheduling...' : 'Schedule Meeting'}
          </button>
        </div>
      </div>
    </div>
  );
}
