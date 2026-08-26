'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getInitials } from '@/lib/initials';

interface UserOption {
  id: number;
  value: string;
}

interface CompanyOption {
  id: number;
  name: string;
}

interface AssignableAttendee {
  attendeeId: number;
  name: string;
  title: string | null;
  assignedUserIds: number[];
}

/**
 * Assigns outreach for a company's attendees at a conference.
 *
 * Outreach belongs to a person, not a company, so the modal is a list of that
 * company's attendees with a rep list applied to whichever of them are ticked.
 * Untick someone and they come off the outreach list; that's the same
 * declarative shape the endpoint takes.
 *
 * Opened with `attendeeId` it narrows to one person — the path the rep pill on
 * an attendee card uses — and leaves everyone else at that company alone.
 */
export function OutreachAssignModal({
  conferenceId,
  companyId,
  companyName,
  attendeeId,
  onClose,
  onAssigned,
}: {
  conferenceId: number;
  companyId?: number;
  companyName?: string;
  /** Scope the modal to a single attendee rather than the whole company. */
  attendeeId?: number;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[] | null>(companyId ? null : []);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | undefined>(companyId);
  const [selectedCompanyName, setSelectedCompanyName] = useState<string | undefined>(companyName);
  const [attendees, setAttendees] = useState<AssignableAttendee[] | null>(null);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<number>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/users')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: UserOption[]) => setUsers(data))
      .catch(() => toast.error('Failed to load users'));
  }, []);

  // Company picker only needed when opened without a pre-selected company (the
  // "Assign company" header button flow) — populate from companies that actually
  // have attendees at this conference.
  useEffect(() => {
    if (companyId) return;
    fetch(`/api/conferences/${conferenceId}/outreach/companies-with-attendees`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: CompanyOption[]) => setCompanies(data))
      .catch(() => { setCompanies([]); toast.error('Failed to load companies'); });
  }, [conferenceId, companyId]);

  // Once a company is settled, load its attendees and pre-tick whoever is
  // already assigned, seeding the rep list from what they already have.
  useEffect(() => {
    if (!selectedCompanyId) { setAttendees(null); return; }
    setAttendees(null);
    fetch(`/api/conferences/${conferenceId}/outreach/assign?companyId=${selectedCompanyId}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: { attendees: AssignableAttendee[] }) => {
        const list = attendeeId != null
          ? data.attendees.filter(a => a.attendeeId === attendeeId)
          : data.attendees;
        setAttendees(list);
        setSelectedAttendeeIds(new Set(
          attendeeId != null ? [attendeeId] : list.filter(a => a.assignedUserIds.length > 0).map(a => a.attendeeId)
        ));
        // The union of who's already on these people — the common case is one
        // shared rep, and starting from blank would silently unassign everyone.
        setSelectedUserIds(new Set(list.flatMap(a => a.assignedUserIds)));
      })
      .catch(() => { setAttendees([]); toast.error('Failed to load attendees'); });
  }, [conferenceId, selectedCompanyId, attendeeId]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => u.value.toLowerCase().includes(q));
  }, [users, search]);

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    const list = companies ?? [];
    if (!q) return list;
    return list.filter(c => c.name.toLowerCase().includes(q));
  }, [companies, companySearch]);

  const toggleUser = (id: number) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAttendee = (id: number) => {
    setSelectedAttendeeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const post = async (assignments: { attendeeId: number; userIds: number[] }[]) => {
    const res = await fetch(`/api/conferences/${conferenceId}/outreach/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: selectedCompanyId, assignments }),
    });
    if (!res.ok) throw new Error();
  };

  const handleSubmit = async () => {
    if (!selectedCompanyId || selectedUserIds.size === 0 || selectedAttendeeIds.size === 0) return;
    setSubmitting(true);
    try {
      const reps = Array.from(selectedUserIds);
      // Every attendee on screen is sent, ticked or not: an unticked one gets an
      // empty rep list, which is how un-assigning happens.
      await post((attendees ?? []).map(a => ({
        attendeeId: a.attendeeId,
        userIds: selectedAttendeeIds.has(a.attendeeId) ? reps : [],
      })));
      toast.success('Outreach assigned');
      onAssigned();
      onClose();
    } catch {
      toast.error('Failed to assign outreach');
    } finally {
      setSubmitting(false);
    }
  };

  // Clears every attendee at this company, which drops it out of the Outreach
  // list entirely since the tab only returns companies with an assignment.
  const handleRemoveCompany = async () => {
    if (!selectedCompanyId || !attendees) return;
    if (!confirm(`Remove ${selectedCompanyName ?? 'this company'} from Outreach? This clears all assigned reps and outreach tracking for this company at this conference.`)) return;
    setSubmitting(true);
    try {
      await post(attendees.map(a => ({ attendeeId: a.attendeeId, userIds: [] })));
      toast.success('Removed from Outreach');
      onAssigned();
      onClose();
    } catch {
      toast.error('Failed to remove company');
    } finally {
      setSubmitting(false);
    }
  };

  const needsCompanyPicker = !companyId;
  const isEditingExisting = attendeeId == null && (attendees ?? []).some(a => a.assignedUserIds.length > 0);
  const singleAttendeeName = attendeeId != null ? attendees?.[0]?.name : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 py-6">
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full mx-4 max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-brand-primary font-serif truncate">
            {singleAttendeeName
              ? `Assign Outreach - ${singleAttendeeName}`
              : selectedCompanyName
                ? `Assign Outreach - ${selectedCompanyName}`
                : 'Assign Company for Outreach'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {needsCompanyPicker && !selectedCompanyId && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Company</label>
              <input
                type="text"
                value={companySearch}
                onChange={e => setCompanySearch(e.target.value)}
                placeholder="Search companies…"
                className="input-field text-sm w-full mb-2"
              />
              <div className="border border-gray-100 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-50">
                {companies === null && <p className="text-xs text-gray-400 px-3 py-2">Loading…</p>}
                {companies !== null && filteredCompanies.length === 0 && (
                  <p className="text-xs text-gray-400 px-3 py-2">No companies found.</p>
                )}
                {filteredCompanies.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedCompanyId(c.id); setSelectedCompanyName(c.name); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {needsCompanyPicker && selectedCompanyId && (
            <button
              type="button"
              onClick={() => { setSelectedCompanyId(undefined); setSelectedCompanyName(undefined); }}
              className="text-xs text-brand-secondary hover:underline"
            >
              ← Change company
            </button>
          )}

          {/* Who the outreach is for. Hidden when the modal is already scoped to
              one person — there'd be exactly one row, always ticked. */}
          {selectedCompanyId && attendeeId == null && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-xs font-semibold text-gray-500">Attendees</label>
                {attendees && attendees.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAttendeeIds(
                      selectedAttendeeIds.size === attendees.length
                        ? new Set()
                        : new Set(attendees.map(a => a.attendeeId))
                    )}
                    className="text-xs text-brand-secondary hover:underline"
                  >
                    {selectedAttendeeIds.size === attendees.length ? 'Clear all' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="border border-gray-100 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-50">
                {attendees === null && <p className="text-xs text-gray-400 px-3 py-2">Loading…</p>}
                {attendees !== null && attendees.length === 0 && (
                  <p className="text-xs text-gray-400 px-3 py-2">No attendees from this company at this conference.</p>
                )}
                {(attendees ?? []).map(a => (
                  <label key={a.attendeeId} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedAttendeeIds.has(a.attendeeId)}
                      onChange={() => toggleAttendee(a.attendeeId)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-700 truncate">{a.name}</span>
                      <span className="block text-xs text-gray-400 truncate">{a.title || '—'}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {selectedCompanyId && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                {attendeeId != null ? 'Assign Reps' : 'Assign Reps to the selected attendees'}
              </label>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search users…"
                className="input-field text-sm w-full mb-2"
              />
              <div className="border border-gray-100 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-50">
                {filteredUsers.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">No users found.</p>}
                {filteredUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="w-4 h-4 rounded"
                    />
                    <div className="w-6 h-6 rounded-full bg-brand-secondary text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                      {getInitials(u.value)}
                    </div>
                    <span className="text-sm text-gray-700 truncate">{u.value}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-3 border-t border-gray-100 flex-shrink-0">
          {isEditingExisting && (
            <button
              type="button"
              onClick={handleRemoveCompany}
              disabled={submitting}
              title="Remove this company from Outreach"
              className="text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selectedCompanyId || selectedUserIds.size === 0 || selectedAttendeeIds.size === 0}
            className="btn-primary text-sm flex-1 disabled:opacity-50"
          >
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
