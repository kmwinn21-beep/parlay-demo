'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getInitials } from '@/lib/initials';

interface UserOption {
  id: number;
  value: string;
}

// Bulk-assigns outreach reps to multiple companies at once (from CompanyTable's
// bulk action bar). Unlike OutreachAssignModal's single-company edit (which
// replaces that company's assignee list wholesale), this is additive — it reads
// each selected company's current assignees first and unions in the newly
// picked reps, so it never silently un-assigns someone already on a company
// that happens to be in this batch.
export function BulkAssignOutreachModal({
  conferenceId,
  companyIds,
  companyNames,
  onClose,
  onAssigned,
}: {
  conferenceId: number;
  companyIds: number[];
  companyNames: string[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/users')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: UserOption[]) => setUsers(data))
      .catch(() => toast.error('Failed to load users'));
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => u.value.toLowerCase().includes(q));
  }, [users, search]);

  const toggleUser = (id: number) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedUserIds.size === 0) return;
    setSubmitting(true);
    try {
      const outreachRes = await fetch(`/api/conferences/${conferenceId}/outreach`);
      const existing = outreachRes.ok
        ? (await outreachRes.json() as { companies: { companyId: number; assignees: { userId: number }[] }[] }).companies
        : [];
      const existingByCompany = new Map(existing.map(c => [c.companyId, c.assignees.map(a => a.userId)]));

      const selectedUserIdsArr = Array.from(selectedUserIds);
      const results = await Promise.all(companyIds.map(companyId => {
        const union = new Set([...(existingByCompany.get(companyId) ?? []), ...selectedUserIdsArr]);
        return fetch(`/api/conferences/${conferenceId}/outreach/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, userIds: Array.from(union) }),
        });
      }));

      if (results.some(r => !r.ok)) throw new Error();
      toast.success(`Outreach assigned to ${companyIds.length} ${companyIds.length === 1 ? 'company' : 'companies'}`);
      onAssigned();
      onClose();
    } catch {
      toast.error('Failed to assign outreach');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 py-6">
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full mx-4 max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-brand-primary font-serif truncate">
            Assign Outreach — {companyIds.length} {companyIds.length === 1 ? 'company' : 'companies'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Companies</p>
            <p className="text-xs text-gray-600 truncate" title={companyNames.join(', ')}>{companyNames.join(', ')}</p>
          </div>

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
        </div>

        <div className="flex gap-2 px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selectedUserIds.size === 0}
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
