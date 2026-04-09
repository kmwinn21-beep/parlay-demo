'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { MeetingsTable, type Meeting, type EditFormData } from '@/components/MeetingsTable';
import { BackButton } from '@/components/BackButton';
import { useConfigColors } from '@/lib/useConfigColors';
import { type UserOption, parseRepIds } from '@/lib/useUserOptions';

function FilterSelect({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="input-field w-auto text-sm">
      <option value="">{label}</option>
      {children}
    </select>
  );
}

function FilterDropdown({ label, options, selected, onToggle, onClear }: { label: string; options: string[]; selected: Set<string>; onToggle: (v: string) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`input-field w-auto flex items-center gap-2 text-sm whitespace-nowrap ${selected.size > 0 ? 'border-procare-bright-blue text-procare-bright-blue' : ''}`}
      >
        {label}{selected.size > 0 ? ` (${selected.size})` : ''}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 min-w-[180px] max-h-56 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-gray-400">No options</div>
          ) : options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm">
              <input type="checkbox" checked={selected.has(opt)} onChange={() => onToggle(opt)} className="accent-procare-bright-blue" />
              <span className="truncate">{opt}</span>
            </label>
          ))}
          {selected.size > 0 && (
            <button onClick={onClear} className="text-xs text-red-500 hover:underline px-2 mt-1">Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [nextStepsOptions, setNextStepsOptions] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [conferenceOptions, setConferenceOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [activeTab, setActiveTab] = useState<'meetings' | 'followups'>('meetings');
  const colorMaps = useConfigColors();

  // Shared filters
  const [filterRep, setFilterRep] = useState('');
  const [filterConference, setFilterConference] = useState('');

  // Meetings-specific filters
  const [filterOutcome, setFilterOutcome] = useState<Set<string>>(new Set());
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Follow-ups-specific filters
  const [filterNextStep, setFilterNextStep] = useState<Set<string>>(new Set());

  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [fuRes, mtgRes, cfgRes, confRes] = await Promise.all([
        fetch('/api/follow-ups'),
        fetch('/api/meetings'),
        fetch('/api/config'),
        fetch('/api/conferences'),
      ]);
      if (!fuRes.ok) throw new Error();
      if (!mtgRes.ok) throw new Error();
      const fuData = await fuRes.json();
      const mtgData = await mtgRes.json();
      setFollowUps(fuData);
      setMeetings(mtgData);

      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        if (Array.isArray(cfgData)) {
          const actionOpts = cfgData.filter((o: { category: string }) => o.category === 'action');
          setActionOptions(actionOpts.map((o: { value: string }) => o.value));
          const userOpts = cfgData.filter((o: { category: string }) => o.category === 'user');
          setUserOptions(userOpts.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
          const nsOpts = cfgData.filter((o: { category: string }) => o.category === 'next_steps');
          setNextStepsOptions(nsOpts.map((o: { value: string }) => o.value));
        }
      }

      if (confRes.ok) {
        const confData = await confRes.json();
        if (Array.isArray(confData)) {
          setConferenceOptions(confData.map((c: { name: string }) => c.name).filter(Boolean));
        }
      }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (attendeeId: number, conferenceId: number, completed: boolean) => {
    setFollowUps((prev) =>
      prev.map((fu) =>
        fu.attendee_id === attendeeId && fu.conference_id === conferenceId
          ? { ...fu, completed }
          : fu
      )
    );
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId, completed }),
      });
      if (!res.ok) throw new Error();
      toast.success(completed ? 'Marked as completed!' : 'Marked as pending.');
    } catch {
      setFollowUps((prev) =>
        prev.map((fu) =>
          fu.attendee_id === attendeeId && fu.conference_id === conferenceId
            ? { ...fu, completed: !completed }
            : fu
        )
      );
      toast.error('Failed to update.');
    }
  };

  const handleDeleteFollowUp = async (attendeeId: number, conferenceId: number) => {
    if (!confirm('Are you sure you want to delete this follow-up?')) return;
    const prev = followUps;
    setFollowUps((fus) => fus.filter((fu) => !(fu.attendee_id === attendeeId && fu.conference_id === conferenceId)));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Follow-up deleted.');
    } catch {
      setFollowUps(prev);
      toast.error('Failed to delete follow-up.');
    }
  };

  const handleOutcomeChange = async (meetingId: number, outcome: string) => {
    setMeetings((prev) => prev.map((m) => m.id === meetingId ? { ...m, outcome } : m));
    try {
      const res = await fetch('/api/meetings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meetingId, outcome }),
      });
      if (!res.ok) throw new Error();
      toast.success('Outcome updated.');
    } catch {
      toast.error('Failed to update outcome.');
      fetchData();
    }
  };

  const handleDeleteMeeting = async (meetingId: number) => {
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    const prev = meetings;
    setMeetings((ms) => ms.filter((m) => m.id !== meetingId));
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Meeting deleted.');
    } catch {
      setMeetings(prev);
      toast.error('Failed to delete meeting.');
    }
  };

  const handleRepChange = async (attendeeId: number, conferenceId: number, rep: string | null) => {
    setFollowUps((prev) =>
      prev.map((fu) =>
        fu.attendee_id === attendeeId && fu.conference_id === conferenceId
          ? { ...fu, assigned_rep: rep }
          : fu
      )
    );
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId, assigned_rep: rep }),
      });
      if (!res.ok) throw new Error();
      toast.success('Rep updated.');
    } catch {
      fetchData();
      toast.error('Failed to update rep.');
    }
  };

  const toggleOutcome = (v: string) => setFilterOutcome(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleNextStep = (v: string) => setFilterNextStep(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const filteredMeetings = useMemo(() => {
    return meetings.filter(m => {
      if (filterRep && !parseRepIds(m.scheduled_by).map(String).includes(filterRep)) return false;
      if (filterConference && m.conference_name !== filterConference) return false;
      if (filterOutcome.size > 0 && !filterOutcome.has(m.outcome || '')) return false;
      if (filterDateFrom && m.meeting_date < filterDateFrom) return false;
      if (filterDateTo && m.meeting_date > filterDateTo) return false;
      return true;
    });
  }, [meetings, filterRep, filterConference, filterOutcome, filterDateFrom, filterDateTo]);

  const filteredFollowUps = useMemo(() => {
    return followUps.filter(fu => {
      if (filter === 'pending' && fu.completed) return false;
      if (filter === 'completed' && !fu.completed) return false;
      if (filterRep && !parseRepIds(fu.assigned_rep).map(String).includes(filterRep)) return false;
      if (filterConference && fu.conference_name !== filterConference) return false;
      if (filterNextStep.size > 0 && !filterNextStep.has(fu.next_steps)) return false;
      return true;
    });
  }, [followUps, filter, filterRep, filterConference, filterNextStep]);

  const meetingsFilterCount = (filterRep ? 1 : 0) + (filterConference ? 1 : 0) + (filterOutcome.size > 0 ? 1 : 0) + (filterDateFrom || filterDateTo ? 1 : 0);
  const followUpsFilterCount = (filterRep ? 1 : 0) + (filterConference ? 1 : 0) + (filterNextStep.size > 0 ? 1 : 0);
  const activeFilterCount = activeTab === 'meetings' ? meetingsFilterCount : followUpsFilterCount;

  const filtered = filteredFollowUps;

  const pendingCount = followUps.filter((fu) => !fu.completed).length;
  const completedCount = followUps.filter((fu) => fu.completed).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BackButton />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Meetings &amp; Follow Ups</h1>
        <p className="text-sm text-gray-500 mt-1">Track meetings and next steps across all conferences.</p>
      </div>

      {/* Stats */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-procare-dark-blue font-serif">{meetings.length}</p>
            <p className="text-xs text-gray-500 mt-1">Meetings</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-procare-dark-blue font-serif">{followUps.length}</p>
            <p className="text-xs text-gray-500 mt-1">Follow Ups</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-procare-bright-blue font-serif">{pendingCount}</p>
            <p className="text-xs text-gray-500 mt-1">Pending</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-green-600 font-serif">{completedCount}</p>
            <p className="text-xs text-gray-500 mt-1">Completed</p>
          </div>
        </div>
      )}

      {/* Top-level tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-6 whitespace-nowrap">
          <button
            type="button"
            onClick={() => setActiveTab('meetings')}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'meetings'
                ? 'border-procare-bright-blue text-procare-bright-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Meetings ({meetings.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('followups')}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'followups'
                ? 'border-procare-bright-blue text-procare-bright-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Follow Ups ({followUps.length})
          </button>
        </nav>
      </div>

      {/* Meetings Tab Content */}
      {activeTab === 'meetings' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => setShowMobileFilters(v => !v)}
              className={`lg:hidden input-field w-auto flex items-center gap-2 text-sm ${activeFilterCount > 0 ? 'border-procare-bright-blue text-procare-bright-blue' : ''}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              <svg className={`w-3 h-3 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className={`${showMobileFilters ? 'flex' : 'hidden'} lg:flex flex-wrap gap-3 w-full lg:w-auto lg:contents`}>
              <FilterSelect value={filterRep} onChange={setFilterRep} label="All Reps">
                {userOptions.map(u => <option key={u.id} value={String(u.id)}>{u.value}</option>)}
              </FilterSelect>
              <FilterSelect value={filterConference} onChange={setFilterConference} label="All Conferences">
                {conferenceOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </FilterSelect>
              <FilterDropdown
                label="Outcome"
                options={actionOptions}
                selected={filterOutcome}
                onToggle={toggleOutcome}
                onClear={() => setFilterOutcome(new Set())}
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="input-field w-auto text-sm"
                  title="From date"
                  placeholder="From"
                />
                <span className="text-gray-400 text-xs">to</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="input-field w-auto text-sm"
                  title="To date"
                  placeholder="To"
                />
              </div>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
              </div>
            ) : (
              <MeetingsTable
                meetings={filteredMeetings}
                actionOptions={actionOptions}
                colorMap={colorMaps.action || {}}
                userOptions={userOptions}
                onOutcomeChange={handleOutcomeChange}
                onDelete={handleDeleteMeeting}
                onEdit={async (meetingId, data) => {
                  setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, ...data } : m));
                  try {
                    const res = await fetch(`/api/meetings/${meetingId}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(data),
                    });
                    if (!res.ok) throw new Error();
                    toast.success('Meeting updated.');
                  } catch {
                    fetchData();
                    toast.error('Failed to update meeting.');
                  }
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Follow Ups Tab Content */}
      {activeTab === 'followups' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => setShowMobileFilters(v => !v)}
              className={`lg:hidden input-field w-auto flex items-center gap-2 text-sm ${activeFilterCount > 0 ? 'border-procare-bright-blue text-procare-bright-blue' : ''}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              <svg className={`w-3 h-3 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className={`${showMobileFilters ? 'flex' : 'hidden'} lg:flex flex-wrap gap-3 w-full lg:w-auto lg:contents`}>
              <FilterSelect value={filterRep} onChange={setFilterRep} label="All Reps">
                {userOptions.map(u => <option key={u.id} value={String(u.id)}>{u.value}</option>)}
              </FilterSelect>
              <FilterSelect value={filterConference} onChange={setFilterConference} label="All Conferences">
                {conferenceOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </FilterSelect>
              <FilterDropdown
                label="Next Step"
                options={nextStepsOptions}
                selected={filterNextStep}
                onToggle={toggleNextStep}
                onClear={() => setFilterNextStep(new Set())}
              />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="border-b border-gray-200 overflow-x-auto mb-4">
            <nav className="flex gap-6 whitespace-nowrap">
              {(['pending', 'all', 'completed'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors capitalize ${
                    filter === tab
                      ? 'border-procare-bright-blue text-procare-bright-blue'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'pending'
                    ? `Pending (${pendingCount})`
                    : tab === 'completed'
                    ? `Completed (${completedCount})`
                    : `All (${followUps.length})`}
                </button>
              ))}
            </nav>
          </div>

          {/* Table */}
          <div className="card p-0 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
              </div>
            ) : (
              <FollowUpsTable followUps={filtered} onToggle={handleToggle} onDelete={handleDeleteFollowUp} userOptions={userOptions} onRepChange={handleRepChange} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
