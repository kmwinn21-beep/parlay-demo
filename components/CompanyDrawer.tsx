'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AttendeeItem {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  seniority?: string;
}

interface ConferenceItem {
  id: number;
  name: string;
  start_date?: string;
  end_date?: string;
}

interface CompanyDetail {
  id: number;
  name: string;
  website?: string | null;
  company_type?: string | null;
  profit_type?: string | null;
  icp?: string | null;
  wse?: number | null;
  services?: string[];
  status?: string | null;
  attendees?: AttendeeItem[];
  conferences?: ConferenceItem[];
}

interface NoteItem {
  id: number;
  content: string;
  created_at: string;
}

interface Props {
  companyId: number | null;
  onClose: () => void;
}

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 30) return `${diffDays} days ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return '1 month ago';
    if (diffMonths < 12) return `${diffMonths} months ago`;
    const diffYears = Math.floor(diffDays / 365);
    return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
  } catch {
    return dateStr;
  }
}

function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return '';
  const fmt = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return d;
    }
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return fmt(start);
  if (end) return fmt(end);
  return '';
}

function isIcpYes(value?: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'yes' || v === 'true' || v === '1';
}

export function CompanyDrawer({ companyId, onClose }: Props) {
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collapsible section state
  const [attendeesExpanded, setAttendeesExpanded] = useState(true);
  const [conferencesExpanded, setConferencesExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);

  useEffect(() => {
    if (companyId === null) {
      setCompany(null);
      setNotes([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setCompany(null);
    setNotes([]);
    // Reset section state on new company
    setAttendeesExpanded(true);
    setConferencesExpanded(false);
    setNotesExpanded(false);

    Promise.all([
      fetch(`/api/companies/${companyId}`).then(r => r.ok ? r.json() : Promise.reject(new Error(`Company fetch failed: ${r.status}`))),
      fetch(`/api/notes?entity_type=company&entity_id=${companyId}`).then(r => r.ok ? r.json() : Promise.reject(new Error(`Notes fetch failed: ${r.status}`))),
    ])
      .then(([companyData, notesData]) => {
        setCompany(companyData);
        setNotes(Array.isArray(notesData) ? notesData : []);
      })
      .catch(err => {
        setError(err.message ?? 'Failed to load company details.');
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  // Close on Escape key
  useEffect(() => {
    if (companyId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [companyId, onClose]);

  if (companyId === null) return null;

  return (
    <div className="fixed inset-0 z-50">
      <style>{`
        @keyframes debriefFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Drawer panel — slides in from right */}
      <div
        className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: 'slideInRight 0.25s ease-out' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 px-5 py-4 flex items-center gap-3"
          style={{ backgroundColor: '#223A5E' }}
        >
          {/* Company initial avatar */}
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold font-serif flex-shrink-0 bg-white/20 text-white">
            {company?.name ? company.name[0].toUpperCase() : '?'}
          </div>
          {/* Name + type */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white font-serif leading-tight truncate">
              {loading ? 'Loading…' : (company?.name ?? '—')}
            </h2>
            {company?.company_type && (
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-medium bg-white/20 text-white/90">
                {company.company_type}
              </span>
            )}
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            className="flex-shrink-0 text-white/70 hover:text-white transition-colors p-1"
            aria-label="Close drawer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-5 space-y-3 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          )}

          {error && !loading && (
            <div className="p-5">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {!loading && !error && company && (
            <>
              {/* Key facts grid */}
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Key Facts</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {/* Website */}
                  <div>
                    <dt className="text-xs text-gray-400 font-medium">Website</dt>
                    <dd className="mt-0.5 text-sm text-gray-800">
                      {company.website ? (
                        <a
                          href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-secondary hover:underline flex items-center gap-1 truncate"
                        >
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          <span className="truncate">{company.website.replace(/^https?:\/\//, '')}</span>
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </dd>
                  </div>

                  {/* ICP */}
                  <div>
                    <dt className="text-xs text-gray-400 font-medium">ICP</dt>
                    <dd className="mt-0.5 text-sm text-gray-800">
                      {isIcpYes(company.icp) ? (
                        <span className="inline-flex items-center gap-1 text-green-700">
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Yes
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </dd>
                  </div>

                  {/* Units */}
                  <div>
                    <dt className="text-xs text-gray-400 font-medium">Units</dt>
                    <dd className="mt-0.5 text-sm text-gray-800">
                      {company.wse != null ? (
                        <span className="flex items-center gap-1">
                          <span>🛏</span>
                          <span>{company.wse.toLocaleString()}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </dd>
                  </div>

                  {/* Company type */}
                  <div>
                    <dt className="text-xs text-gray-400 font-medium">Type</dt>
                    <dd className="mt-0.5 text-sm text-gray-800">
                      {company.company_type ? (
                        <span>{company.company_type}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </dd>
                  </div>

                  {/* Services */}
                  <div className="col-span-2">
                    <dt className="text-xs text-gray-400 font-medium">Services</dt>
                    <dd className="mt-0.5 text-sm text-gray-800">
                      {company.services && company.services.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {company.services.map((s, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Attendees section */}
              <div className="border-b border-gray-100">
                <button
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setAttendeesExpanded(v => !v)}
                >
                  <span className="text-sm font-semibold text-brand-primary font-serif">
                    Attendees
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      ({company.attendees?.length ?? 0})
                    </span>
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${attendeesExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {attendeesExpanded && (
                  <div className="px-5 pb-4">
                    {!company.attendees || company.attendees.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">No attendees.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b border-gray-100">
                            <th className="text-left pb-2 font-medium">Name</th>
                            <th className="text-left pb-2 font-medium">Title</th>
                            <th className="text-left pb-2 font-medium">Seniority</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {company.attendees.map(a => (
                            <tr key={a.id} className="hover:bg-gray-50">
                              <td className="py-2 pr-3">
                                <Link
                                  href={`/attendees/${a.id}`}
                                  className="text-brand-secondary hover:underline font-medium whitespace-nowrap"
                                >
                                  {a.first_name} {a.last_name}
                                </Link>
                              </td>
                              <td className="py-2 pr-3 text-gray-600 truncate max-w-[120px]">
                                {a.title ?? '—'}
                              </td>
                              <td className="py-2 text-gray-500 whitespace-nowrap">
                                {a.seniority ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>

              {/* Conferences section */}
              <div className="border-b border-gray-100">
                <button
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setConferencesExpanded(v => !v)}
                >
                  <span className="text-sm font-semibold text-brand-primary font-serif">
                    Conferences
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      ({company.conferences?.length ?? 0})
                    </span>
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${conferencesExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {conferencesExpanded && (
                  <div className="px-5 pb-4">
                    {!company.conferences || company.conferences.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">No conferences.</p>
                    ) : (
                      <ul className="space-y-2">
                        {company.conferences.map(c => (
                          <li key={c.id} className="flex items-start justify-between gap-3">
                            <span className="text-sm text-gray-800 font-medium">{c.name}</span>
                            {(c.start_date || c.end_date) && (
                              <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                                {formatDateRange(c.start_date, c.end_date)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Notes section */}
              <div className="border-b border-gray-100">
                <button
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setNotesExpanded(v => !v)}
                >
                  <span className="text-sm font-semibold text-brand-primary font-serif">
                    Notes
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      ({notes.length})
                    </span>
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${notesExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {notesExpanded && (
                  <div className="px-5 pb-4">
                    {notes.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">No notes yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {notes.map(n => (
                          <li key={n.id} className="text-sm">
                            <p className="text-gray-800 whitespace-pre-wrap">{n.content}</p>
                            <p className="text-xs text-gray-400 mt-1">{formatRelativeDate(n.created_at)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-200 px-5 py-3 bg-white">
          <Link
            href={`/companies/${companyId}`}
            onClick={onClose}
            className="text-sm font-medium text-brand-secondary hover:underline flex items-center gap-1"
          >
            View full record
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
