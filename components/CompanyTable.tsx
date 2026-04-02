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
}

interface CompanyTableProps {
  companies: Company[];
  onRefresh: () => void;
}

export function CompanyTable({ companies, onRefresh }: CompanyTableProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterProfitType, setFilterProfitType] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      const matchesSearch =
        !search || c.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = !filterType || c.company_type === filterType;
      const matchesProfit = !filterProfitType || c.profit_type === filterProfitType;
      return matchesSearch && matchesType && matchesProfit;
    });
  }, [companies, search, filterType, filterProfitType]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCompanies = companies.filter((c) => selectedIds.has(c.id));

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
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">All Types</option>
          {companyTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filterProfitType}
          onChange={(e) => setFilterProfitType(e.target.value)}
          className="input-field w-auto"
        >
          <option value="">For/Non-Profit</option>
          <option value="for-profit">For-Profit</option>
          <option value="non-profit">Non-Profit</option>
        </select>
        {selectedIds.size >= 2 && (
          <button
            onClick={() => setShowMergeModal(true)}
            className="btn-gold flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Merge ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-500 mb-3">
        Showing {filtered.length} of {companies.length} companies
        {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
      </p>

      {/* Table */}
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Company Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Profit Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Website</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Attendees</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No companies found.
                </td>
              </tr>
            ) : (
              filtered.map((company) => (
                <tr
                  key={company.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    selectedIds.has(company.id) ? 'bg-blue-50' : ''
                  }`}
                >
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
                    <Link
                      href={`/companies/${company.id}`}
                      className="text-procare-bright-blue hover:underline text-xs font-medium"
                    >
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
