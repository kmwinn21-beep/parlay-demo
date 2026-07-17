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

export function OutreachAssignModal({
  conferenceId,
  companyId,
  companyName,
  currentAssigneeIds,
  onClose,
  onAssigned,
}: {
  conferenceId: number;
  companyId?: number;
  companyName?: string;
  currentAssigneeIds: number[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[] | null>(companyId ? null : []);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | undefined>(companyId);
  const [selectedCompanyName, setSelectedCompanyName] = useState<string | undefined>(companyName);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set(currentAssigneeIds));
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

  const handleSubmit = async () => {
    if (!selectedCompanyId || selectedUserIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/outreach/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId, userIds: Array.from(selectedUserIds) }),
      });
      if (!res.ok) throw new Error();
      toast.success('Outreach assigned');
      onAssigned();
      onClose();
    } catch {
      toast.error('Failed to assign outreach');
    } finally {
      setSubmitting(false);
    }
  };

  const needsCompanyPicker = !companyId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 py-6">
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full mx-4 max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-brand-primary font-serif truncate">
            {selectedCompanyName ? `Assign — ${selectedCompanyName}` : 'Assign Company for Outreach'}
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

          {(!needsCompanyPicker || selectedCompanyId) && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Assign Reps</label>
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
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selectedCompanyId || selectedUserIds.size === 0}
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
