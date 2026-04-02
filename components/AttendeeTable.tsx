'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { MergeModal } from './MergeModal';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_name?: string;
  company_type?: string;
  email?: string;
  notes?: string;
  conference_count: number;
}

interface AttendeeTableProps {
  attendees: Attendee[];
  onRefresh: () => void;
}

type SortKey = 'last_name' | 'first_name' | 'title' | 'company_name' | 'email' | 'conference_count';
type SortDir = 'asc' | 'desc';

function conferenceBadgeClass(count: number): string {
  if (count >= 4) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700';
  if (count === 3) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700';
  if (count === 2) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700';
  return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) {
    return (
      <svg className="w-3 h-3 ml-1 text-gray-300 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return sortDir === 'asc' ? (
    <svg className="w-3 h-3 ml-1 text-procare-bright-blue inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-3 h-3 ml-1 text-procare-bright-blue inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function AttendeeTable({ attendees, onRefresh }: AttendeeTableProps) {
  const [search, setSearch] = useState('');
  const [filterCompanyType, setFilterCompanyType] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('last_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (col: SortKey) => {
    if (col === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    const list = attendees.filter((a) => {
      const fullName = `${a.first_name} ${a.last_name}`.toLowerCase();
      const matchesSearch =
        !search ||
        fullName.includes(search.toLowerCase()) ||
        a.company_name?.toLowerCase().includes(search.toLowerCase()) ||
        a.email?.toLowerCase().includes(search.toLowerCase()) ||
        a.title?.toLowerCase().includes(search.toLowerCase());
      const matchesType = !filterCompanyType || a.company_type === filterCompanyType;
      return matchesSearch && matchesType;
    });

    list.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      if (sortKey === 'last_name') {
        aVal = `${a.last_name} ${a.first_name}`.toLowerCase();
        bVal = `${b.last_name} ${b.first_name}`.toLowerCase();
      } else if (sortKey === 'first_name') {
        aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
        bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
      } else {
        aVal = (a[sortKey] ?? '');
        bVal = (b[sortKey] ?? '');
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [attendees, search, filterCompanyType, sortKey, sortDir]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedAttendees = attendees.filter((a) => selectedIds.has(a.id));

  const handleMerge = async (masterId: number, duplicateIds: number[]) => {
    const res = await fetch('/api/attendees/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ master_id: masterId, duplicate_ids: duplicateIds }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Merge failed');
    }
    toast.success('Attendees merged successfully!');
    setSelectedIds(new Set());
    onRefresh();
  };

  const companyTypes = Array.from(new Set(attendees.map((a) => a.company_type).filter(Boolean))) as string[];

  const thClass = 'px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-procare-dark-blue whitespace-nowrap';

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, company, email, title..."
              className="input-field pl-9"
            />
          </div>
        </div>
        <select value={filterCompanyType} onChange={(e) => setFilterCompanyType(e.target.value)} className="input-field w-auto">
          <option value="">All Company Types</option>
          {companyTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {selectedIds.size >= 2 && (
          <button onClick={() => setShowMergeModal(true)} className="btn-gold flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Merge ({selectedIds.size})
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Showing {filtered.length} of {attendees.length} attendees
        {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(filtered.map((a) => a.id)));
                    else setSelectedIds(new Set());
                  }}
                  className="accent-procare-bright-blue"
                />
              </th>
              <th className={thClass} onClick={() => handleSort('last_name')}>
                Name <SortIcon col="last_name" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('title')}>
                Title <SortIcon col="title" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('company_name')}>
                Company <SortIcon col="company_name" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('email')}>
                Email <SortIcon col="email" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('conference_count')}>
                Conferences <SortIcon col="conference_count" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Notes</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">No attendees found.</td>
              </tr>
            ) : (
              filtered.map((attendee) => (
                <tr key={attendee.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(attendee.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(attendee.id)}
                      onChange={() => toggleSelect(attendee.id)}
                      className="accent-procare-bright-blue"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{attendee.first_name} {attendee.last_name}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                    {attendee.title || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {attendee.company_name ? (
                      <div>
                        <p className="text-gray-800">{attendee.company_name}</p>
                        {attendee.company_type && (
                          <span className="badge-blue text-xs">{attendee.company_type}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">
                    {attendee.email ? (
                      <a href={`mailto:${attendee.email}`} className="text-procare-bright-blue hover:underline">
                        {attendee.email}
                      </a>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={conferenceBadgeClass(Number(attendee.conference_count))}>
                      {attendee.conference_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[140px] truncate text-gray-500 text-xs">
                    {attendee.notes || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/attendees/${attendee.id}`} className="text-procare-bright-blue hover:underline text-xs font-medium">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <MergeModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        onMerge={handleMerge}
        items={selectedAttendees.map((a) => ({
          id: a.id,
          label: `${a.first_name} ${a.last_name}`,
          sublabel: [a.title, a.company_name].filter(Boolean).join(' · '),
        }))}
        title="Merge Attendees"
        description="Select the master record. All conference associations from duplicate records will be merged into the master. Duplicate records will be deleted."
      />
    </div>
  );
}
