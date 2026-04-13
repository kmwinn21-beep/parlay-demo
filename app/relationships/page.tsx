'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { getBadgeClass } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { useConfigOptions } from '@/lib/useConfigOptions';
import { getRepInitials, resolveRepInitials, useConfigWithIds, useUserOptions } from '@/lib/useUserOptions';

interface CompanyOption {
  id: number;
  name: string;
}

interface InternalRelationship {
  id: number;
  company_id: number;
  rep_ids: string | null;
  contact_ids: string | null;
  relationship_status: string;
  description: string;
  created_at: string;
}

interface CompanyDetails {
  id: number;
  name: string;
  company_type: string | null;
  entity_structure: string | null;
  assigned_user: string | null;
  status: string | null;
  services: string[];
  icp: string | null;
  wse: number | null;
  attendees: Array<{ id: number; first_name: string; last_name: string; title?: string | null }>;
}

interface RelationshipEntry {
  id: number;
  contacts: Array<{ id: number; first_name: string; last_name: string; title?: string }>;
  statuses: string[];
  description: string;
}

interface RepMapNode {
  repId: number;
  repName: string;
  initials: string;
  statuses: string[];
  relationshipCount: number;
  entries: RelationshipEntry[];
}

function parseIds(csv: string | null | undefined): number[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map(v => Number(v.trim()))
    .filter(v => !Number.isNaN(v) && v > 0);
}

function repInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function RepPill({ name }: { name: string }) {
  const initials = getRepInitials(name);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
        <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
      </svg>
      {initials}
    </span>
  );
}

export default function RelationshipsPage() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [companySearch, setCompanySearch] = useState('');
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const companyDropdownRef = useRef<HTMLDivElement>(null);
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null);
  const [relationships, setRelationships] = useState<InternalRelationship[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingRelationships, setLoadingRelationships] = useState(false);
  const [loadingCompanyDetails, setLoadingCompanyDetails] = useState(false);
  const [relationshipRefreshKey, setRelationshipRefreshKey] = useState(0);

  const userOptions = useUserOptions();
  const relTypeOptions = useConfigWithIds('rep_relationship_type');
  const configOptions = useConfigOptions();
  const colorMaps = useConfigColors();

  useEffect(() => {
    let mounted = true;
    fetch('/api/companies?minimal=1&has_relationships=1')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: number; name: string }>) => {
        if (!mounted) return;
        const normalized = rows.map(r => ({
          id: Number(r.id),
          name: String(r.name),
        }));
        setCompanies(normalized);
      })
      .catch(() => {
        if (!mounted) return;
        setCompanies([]);
      })
      .finally(() => {
        if (mounted) setLoadingCompanies(false);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) {
      setRelationships([]);
      setCompanyDetails(null);
      return;
    }
    let mounted = true;
    setLoadingRelationships(true);
    setLoadingCompanyDetails(true);
    fetch(`/api/internal-relationships?company_id=${selectedCompanyId}`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: InternalRelationship[]) => {
        if (!mounted) return;
        setRelationships(rows);
      })
      .catch(() => {
        if (!mounted) return;
        setRelationships([]);
      })
      .finally(() => {
        if (mounted) setLoadingRelationships(false);
      });

    fetch(`/api/companies/${selectedCompanyId}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: CompanyDetails | null) => {
        if (!mounted) return;
        setCompanyDetails(data);
      })
      .catch(() => {
        if (!mounted) return;
        setCompanyDetails(null);
      })
      .finally(() => {
        if (mounted) setLoadingCompanyDetails(false);
      });
    return () => { mounted = false; };
  }, [selectedCompanyId, relationshipRefreshKey]);

  useEffect(() => {
    if (!companyDropdownOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(e.target as Node)) {
        setCompanyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [companyDropdownOpen]);

  const attendeeMap = useMemo(() => {
    const map = new Map<number, { id: number; first_name: string; last_name: string; title?: string }>();
    (companyDetails?.attendees ?? []).forEach(att => {
      map.set(att.id, { id: att.id, first_name: att.first_name, last_name: att.last_name, title: att.title || undefined });
    });
    return map;
  }, [companyDetails]);

  const mapNodes = useMemo<RepMapNode[]>(() => {
    const byRep = new Map<number, {
      repName: string;
      statuses: Set<string>;
      relationshipCount: number;
      entries: RelationshipEntry[];
    }>();

    for (const rel of relationships) {
      const repIds = parseIds(rel.rep_ids);
      const statusIds = parseIds(rel.relationship_status);

      const statusLabels = statusIds
        .map(id => relTypeOptions.find(opt => opt.id === id)?.value)
        .filter(Boolean) as string[];

      const contacts = parseIds(rel.contact_ids)
        .map(id => attendeeMap.get(id))
        .filter(Boolean) as Array<{ id: number; first_name: string; last_name: string; title?: string }>;

      for (const repId of repIds) {
        const repName = userOptions.find(u => u.id === repId)?.value;
        if (!repName) continue;
        const existing = byRep.get(repId) ?? {
          repName,
          statuses: new Set<string>(),
          relationshipCount: 0,
          entries: [],
        };
        statusLabels.forEach(status => existing.statuses.add(status));
        existing.relationshipCount += 1;
        existing.entries.push({
          id: rel.id,
          contacts,
          statuses: statusLabels,
          description: rel.description,
        });
        byRep.set(repId, existing);
      }
    }

    return Array.from(byRep.entries())
      .map(([repId, data]) => ({
        repId,
        repName: data.repName,
        initials: repInitials(data.repName),
        statuses: Array.from(data.statuses),
        relationshipCount: data.relationshipCount,
        entries: data.entries,
      }))
      .sort((a, b) => a.repName.localeCompare(b.repName));
  }, [attendeeMap, relationships, relTypeOptions, userOptions]);

  const statusValues = useMemo(
    () => (companyDetails?.status || '').split(',').map(s => s.trim()).filter(Boolean),
    [companyDetails?.status]
  );
  const icpTrueValue = (configOptions.icp ?? [])[0] ?? '';
  const sortedCompanies = useMemo(() => {
    return [...companies].sort((a, b) => a.name.localeCompare(b.name));
  }, [companies]);
  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return sortedCompanies;
    return sortedCompanies.filter(c => c.name.toLowerCase().includes(q));
  }, [companySearch, sortedCompanies]);
  const selectedCompanyLabel = useMemo(
    () => companies.find(c => c.id === selectedCompanyId)?.name ?? '',
    [companies, selectedCompanyId]
  );
  useEffect(() => {
    if (selectedCompanyId == null && sortedCompanies.length > 0) {
      setSelectedCompanyId(sortedCompanies[0].id);
      return;
    }
  }, [selectedCompanyId, sortedCompanies]);
  const companyAssignedRepInitials = useMemo(
    () => resolveRepInitials(companyDetails?.assigned_user ?? '', userOptions),
    [companyDetails?.assigned_user, userOptions]
  );
  const mapBodyHeight = Math.max(560, mapNodes.length * 220);

  const handleDeleteRelationship = async (id: number) => {
    try {
      const res = await fetch(`/api/internal-relationships?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Internal relationship removed.');
      setRelationshipRefreshKey(k => k + 1);
    } catch {
      toast.error('Failed to remove relationship.');
    }
  };

  function MiniRelationshipCard({ entry, repName, onDelete }: { entry: RelationshipEntry; repName: string; onDelete: (id: number) => void | Promise<void> }) {
    const [expanded, setExpanded] = useState(false);

    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        {/* Collapsed header — always visible */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full p-3 hover:bg-gray-50 transition-colors text-left"
        >
          {/* Top row: Contact name/title + expand chevron */}
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              {entry.contacts.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {entry.contacts.map((att) => (
                    <div key={att.id} className="min-w-0">
                      <span className="text-sm font-medium text-gray-800 leading-tight block">{att.first_name} {att.last_name}</span>
                      {att.title && <span className="text-xs text-gray-500 leading-tight block">{att.title}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-gray-400">No contact</span>
              )}
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Bottom row: Rep pill */}
          <div className="flex flex-wrap items-center gap-1 mt-2">
            <RepPill name={repName} />
          </div>
        </button>

        {/* Expanded content — relationship status pills + notes + remove */}
        {expanded && (
          <div className="px-3 pb-3 border-t border-gray-100">
            {entry.statuses.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {entry.statuses.map((status) => (
                  <span key={status} className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                    {status}
                  </span>
                ))}
              </div>
            )}
            <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{entry.description}</p>
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => { if (confirm('Remove this internal relationship?')) onDelete(entry.id); }}
                className="text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div ref={companyDropdownRef} className="max-w-md w-full relative">
          <label className="label">Company</label>
          <button
            type="button"
            onClick={() => !loadingCompanies && companies.length > 0 && setCompanyDropdownOpen(v => !v)}
            className="input-field w-full text-left flex items-center justify-between"
            disabled={loadingCompanies || companies.length === 0}
          >
            <span className={selectedCompanyLabel ? 'text-gray-800' : 'text-gray-400'}>
              {selectedCompanyLabel || (loadingCompanies ? 'Loading companies...' : 'Select a company')}
            </span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${companyDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {companyDropdownOpen && !loadingCompanies && companies.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 p-2">
                <input
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="input-field w-full"
                  placeholder="Search companies..."
                />
              </div>
              {filteredCompanies.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">No matching companies.</div>
              ) : filteredCompanies.map(company => (
                <button
                  key={company.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedCompanyId(company.id);
                    setCompanyDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                    selectedCompanyId === company.id ? 'bg-blue-100 text-procare-dark-blue font-medium' : 'text-gray-700'
                  }`}
                >
                  {company.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-sm text-gray-500">
          {loadingRelationships ? 'Loading relationship map…' : `${mapNodes.length} rep connection(s)`}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loadingRelationships || loadingCompanyDetails ? (
          <div className="h-[520px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
        ) : !companyDetails ? (
          <div className="h-[420px] flex items-center justify-center text-gray-400 text-sm">
            Company details not available.
          </div>
        ) : mapNodes.length === 0 ? (
          <div className="h-[420px] flex items-center justify-center text-gray-400 text-sm">
            No rep relationships found for this company.
          </div>
        ) : (
          <div className="relative p-6 bg-gradient-to-b from-white to-gray-50/60" style={{ minHeight: `${mapBodyHeight}px` }}>
            <div className="relative flex">
              <div className="w-[280px] flex items-stretch justify-center py-4 flex-shrink-0">
                <div className="w-full rounded-xl border border-gray-200 bg-white shadow-sm p-5" style={{ minHeight: `${Math.max(420, Math.floor((mapBodyHeight - 32) * 0.75))}px` }}>
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-procare-gold flex items-center justify-center text-procare-dark-blue text-xl font-bold font-serif flex-shrink-0">
                      {companyDetails.name?.[0] || 'C'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-[clamp(2rem,2.6vw,2.25rem)] leading-[1.08] font-bold text-procare-dark-blue font-serif break-words whitespace-normal overflow-hidden">
                        {companyDetails.name}
                      </h2>
                    </div>
                  </div>

                  <div className="space-y-4 mt-4 pt-4 border-t border-gray-100">
                    <div>
                      {companyDetails.company_type ? (
                        <span className={`${getBadgeClass(companyDetails.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1`}>
                          {companyDetails.entity_structure === 'Parent' && (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          )}
                          {companyDetails.entity_structure === 'Child' && (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
                            </svg>
                          )}
                          {companyDetails.company_type}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </div>

                    <div>
                      <span className="badge-gray">{companyDetails.attendees?.length ?? 0} attendees</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {companyAssignedRepInitials.length > 0 ? companyAssignedRepInitials.map((ini, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                          <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {ini}
                        </span>
                      )) : <span className="text-sm text-gray-400">—</span>}
                    </div>

                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">WSE</p>
                      {companyDetails.wse != null ? (
                        <span className="text-sm text-gray-600 inline-flex items-center gap-1">
                          <svg className="w-4 h-4 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                          {Number(companyDetails.wse).toLocaleString()}
                        </span>
                      ) : <p className="text-sm text-gray-400">—</p>}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Services</p>
                      {companyDetails.services && companyDetails.services.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {companyDetails.services.map((s) => (
                            <span key={s} className="badge-gray text-xs">{s}</span>
                          ))}
                        </div>
                      ) : <p className="text-sm text-gray-400">—</p>}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Status</p>
                      <span className="flex flex-wrap gap-1">
                        {statusValues.map((s) => (
                          <span key={s} className={getBadgeClass(s, colorMaps.status || {})}>{s}</span>
                        ))}
                        {statusValues.length === 0 && <span className="text-sm text-gray-400">—</span>}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">ICP</p>
                      {companyDetails.icp != null && icpTrueValue && companyDetails.icp === icpTrueValue ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          {companyDetails.icp}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">{companyDetails.icp || '—'}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 ml-8 py-4 divide-y divide-gray-100">
                {mapNodes.map((node) => (
                  <div key={node.repId} className="grid grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)] gap-4 items-start py-5 first:pt-0 last:pb-0">
                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <div className="w-full p-3 text-left">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                                {node.initials}
                              </span>
                              <span className="text-sm font-medium text-gray-800">{node.repName}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-sm text-gray-500 mt-2">
                          {node.relationshipCount} relationship{node.relationshipCount === 1 ? '' : 's'}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {node.statuses.map((status) => (
                            <span key={status} className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                              {status}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                      {node.entries.map((entry) => (
                        <MiniRelationshipCard key={entry.id} entry={entry} repName={node.repName} onDelete={handleDeleteRelationship} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
