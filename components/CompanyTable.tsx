'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { MergeModal } from './MergeModal';

interface Company {
  id: number;
  name: string;
  website?: string;
  profit_type?: string;
  company_type?: string;
  notes?: string;
  attendee_count: number;
  conference_count: number;
}

interface CompanyTableProps {
  companies: Company[];
  onRefresh: () => void;
}

type SortKey = 'name' | 'company_type' | 'profit_type' | 'website' | 'attendee_count' | 'conference_count';
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

export function CompanyTable({ companies, onRefresh }: CompanyTableProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterProfitType, setFilterProfitType] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
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
    const list = companies.filter((c) => {
      const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = !filterType || c.company_type === filterType;
      const matchesProfit = !filterProfitType || c.profit_type === filterProfitType;
      return matchesSearch && matchesType && matchesProfit;
    });

    list.sort((a, b) => {
      let aVal: string | number = a[sortKey] ?? '';
      let bVal: string | number = b[sortKey] ?? '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [companies, search, filterType, filterProfitType, sortKey, sortDir]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCompanies = companies.filter((c) => selectedIds.has(c.id));

  const handleDeleteOne = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? Attendees from this company will be unlinked. This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success(`"${name}" deleted.`);
      onRefresh();
    } catch {
      toast.error('Failed to delete company.');
    }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedIds.size} selected company/companies? Attendees will be unlinked. This cannot be undone.`)) return;
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/companies/${id}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error(); })
        )
      );
      toast.success(`${selectedIds.size} company/companies deleted.`);
      setSelectedIds(new Set());
      onRefresh();
    } catch {
      toast.error('Failed to delete some companies.');
      onRefresh();
    }
  };

  const handleMerge = async (masterId: number, duplicateIds: number[]) => {
    const res = await fetch('/api/companies/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ master_id: masterId, duplicate_ids: duplicateIds }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Merge failed');
    }
    toast.success('Companies merged successfully!');
    setSelectedIds(new Set());
    onRefresh();
  };

  const companyTypes = Array.from(new Set(companies.map((c) => c.company_type).filter(Boolean))) as string[];

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
              placeholder="Search companies..."
              className="input-field pl-9"
            />
          </div>
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field w-auto">
          <option value="">All Types</option>
          {companyTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterProfitType} onChange={(e) => setFilterProfitType(e.target.value)} className="input-field w-auto">
          <option value="">For/Non-Profit</option>
          <option value="for-profit">For-Profit</option>
          <option value="non-profit">Non-Profit</option>
        </select>
        {selectedIds.size >= 1 && (
          <button onClick={handleDeleteSelected} className="btn-danger flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete ({selectedIds.size})
          </button>
        )}
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
        Showing {filtered.length} of {companies.length} companies
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
                    if (e.target.checked) setSelectedIds(new Set(filtered.map((c) => c.id)));
                    else setSelectedIds(new Set());
                  }}
                  className="accent-procare-bright-blue"
                />
              </th>
              <th className={thClass} onClick={() => handleSort('name')}>
                Company Name <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('company_type')}>
                Type <SortIcon col="company_type" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('profit_type')}>
                Profit Type <SortIcon col="profit_type" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('website')}>
                Website <SortIcon col="website" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('attendee_count')}>
                Attendees <SortIcon col="attendee_count" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('conference_count')}>
                Conferences <SortIcon col="conference_count" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">No companies found.</td>
              </tr>
            ) : (
              filtered.map((company) => (
                <tr key={company.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(company.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(company.id)}
                      onChange={() => toggleSelect(company.id)}
                      className="accent-procare-bright-blue"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{company.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    {company.company_type ? (
                      <span className="badge-blue">{company.company_type}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {company.profit_type ? (
                      <span className={`badge ${company.profit_type === 'for-profit' ? 'badge-green' : 'badge-gold'}`}>
                        {company.profit_type}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[160px] truncate">
                    {company.website ? (
                      <a
                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-procare-bright-blue hover:underline text-xs"
                      >
                        {company.website.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge-gray">{company.attendee_count}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={conferenceBadgeClass(Number(company.conference_count))}>
                      {company.conference_count}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/companies/${company.id}`} className="text-procare-bright-blue hover:underline text-xs font-medium">
                        View
                      </Link>
                      <button
                        onClick={() => handleDeleteOne(company.id, company.name)}
                        className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
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
        items={selectedCompanies.map((c) => ({
          id: c.id,
          label: c.name,
          sublabel: [c.company_type, c.profit_type ? `(${c.profit_type})` : ''].filter(Boolean).join(' '),
        }))}
        title="Merge Companies"
        description="Select the master company record. All attendees from duplicate companies will be reassigned to the master. Duplicate company records will be deleted."
      />
    </div>
  );
}
