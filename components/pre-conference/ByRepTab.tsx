'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { ByRepEntry, ByRepCompany } from '../PreConferenceReview';

interface CompanyNote {
  id: number;
  content: string;
  created_at: string | null;
  rep?: string | null;
  conference_name?: string | null;
}

function CompanyNotesPanel({ companyId, companyName, conferenceName }: { companyId: number; companyName: string; conferenceName: string }) {
  const [notes, setNotes] = useState<CompanyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/notes?entity_type=company&entity_id=${companyId}`)
      .then((r) => r.json())
      .then((data: CompanyNote[]) => setNotes(Array.isArray(data) ? data : []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [companyId]);

  async function addNote() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: 'company', entity_id: companyId, content, conference_name: conferenceName, company_name: companyName }),
      });
      if (res.ok) {
        const note: CompanyNote = await res.json();
        setNotes((prev) => [note, ...prev]);
        setContent('');
      }
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading…
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400">No notes yet.</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {notes.map((n) => (
            <div key={n.id} className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-700">{n.content}</p>
              <p className="text-xs text-gray-400 mt-1">{n.rep ?? 'Unknown'}{n.conference_name ? ` · ${n.conference_name}` : ''}</p>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-gray-100 pt-3">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Add a note…" rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-secondary/30" />
        <button onClick={addNote} disabled={saving || !content.trim()} className="mt-2 btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
          {saving ? 'Saving…' : 'Add Note'}
        </button>
      </div>
    </div>
  );
}

type PopupType = 'company' | 'notes' | 'attendees';

function CompanyRecordPopup({ company, onClose }: { company: ByRepCompany; onClose: () => void }) {
  const servicesList = company.services ? company.services.split(',').map(s => s.trim()).filter(Boolean) : [];
  const icpValue = String(company.icp || '').toLowerCase();
  const isIcp = icpValue === 'yes' || icpValue === '1' || icpValue === 'true';

  return (
    <div className="p-5 space-y-5">
      {/* Company Details */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Company Details</p>
        <div className="space-y-2">
          {[
            { label: 'Type', value: company.company_type },
            { label: 'Profit type', value: company.profit_type },
            { label: 'Structure', value: company.entity_structure },
            { label: 'WSE', value: company.wse != null ? company.wse.toLocaleString() : null },
          ].map(({ label, value }) => value ? (
            <div key={label} className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50">
              <span className="text-xs text-gray-500 flex-shrink-0 w-28">{label}</span>
              <span className="text-xs font-medium text-gray-800 text-right">{value}</span>
            </div>
          ) : null)}
          {servicesList.length > 0 && (
            <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50">
              <span className="text-xs text-gray-500 flex-shrink-0 w-28">Services</span>
              <span className="text-xs font-medium text-gray-800 text-right">{servicesList.join(', ')}</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50">
            <span className="text-xs text-gray-500 flex-shrink-0 w-28">ICP</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isIcp ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {company.icp ?? 'No'}
            </span>
          </div>
          {company.company_status && (
            <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50">
              <span className="text-xs text-gray-500 flex-shrink-0 w-28">Status</span>
              <span className="text-xs font-medium text-gray-800 text-right">{company.company_status}</span>
            </div>
          )}
          {company.assigned_user_names.length > 0 && (
            <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50">
              <span className="text-xs text-gray-500 flex-shrink-0 w-28">Assigned rep</span>
              <span className="text-xs font-medium text-gray-800 text-right">{company.assigned_user_names.join(', ')}</span>
            </div>
          )}
          {company.website && (
            <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50">
              <span className="text-xs text-gray-500 flex-shrink-0 w-28">Website</span>
              <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-brand-secondary hover:underline text-right truncate max-w-[180px]">
                {company.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Internal Relationships */}
      {company.internal_relationships.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Internal Relationships ({company.internal_relationships.length})
          </p>
          <div className="space-y-2">
            {company.internal_relationships.map((rel, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-800">{rel.rep_names.join(', ') || '—'}</span>
                  {rel.relationship_status && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">{rel.relationship_status}</span>
                  )}
                </div>
                {rel.description && <p className="text-xs text-gray-600">{rel.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href={`/companies/${company.company_id}`} className="inline-block text-xs text-brand-secondary hover:underline">
        View Full Company Record →
      </Link>
    </div>
  );
}

function CompanyPopup({ company, type, conferenceName, onClose }: { company: ByRepCompany; type: PopupType; conferenceName: string; onClose: () => void }) {
  const titles: Record<PopupType, string> = { company: 'Company Record', notes: 'Notes', attendees: 'Attendees' };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{company.company_name}</h3>
            <p className="text-xs text-gray-500">{titles[type]}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {type === 'company' && <CompanyRecordPopup company={company} onClose={onClose} />}
        {type === 'notes' && (
          <div className="p-5">
            <CompanyNotesPanel companyId={company.company_id} companyName={company.company_name} conferenceName={conferenceName} />
          </div>
        )}
        {type === 'attendees' && (
          <div className="p-5 space-y-2">
            {company.attendees.length === 0 ? (
              <p className="text-sm text-gray-400">No attendees.</p>
            ) : (
              company.attendees.map((a) => (
                <Link key={String(a.id)} href={`/attendees/${a.id}`} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{String(a.first_name)} {String(a.last_name)}</p>
                    {a.title && <p className="text-xs text-gray-500">{String(a.title)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{String(a.status)}</span>}
                    <span className="text-xs text-gray-400">H:{a.health}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Icon buttons for Record / Notes / Attendees
function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-brand-secondary/40 hover:text-brand-secondary transition-colors">
      {children}
    </button>
  );
}

function RepSection({ entry, conferenceId, conferenceName, expandedRep, onToggle }: {
  entry: ByRepEntry;
  conferenceId: number;
  conferenceName: string;
  expandedRep: string | null;
  onToggle: (rep: string) => void;
}) {
  const isOpen = expandedRep === entry.rep;
  const [popup, setPopup] = useState<{ company: ByRepCompany; type: PopupType } | null>(null);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => onToggle(entry.rep)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div>
          <span className="font-semibold text-gray-800 text-sm">{entry.rep}</span>
          <span className="ml-2 text-xs text-gray-400">{entry.companies.length} {entry.companies.length === 1 ? 'company' : 'companies'}</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {entry.companies.map((co) => (
            <div key={co.company_id} className="border border-gray-100 rounded-lg p-3 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{co.company_name}</p>
                  {co.company_type && <p className="text-xs text-gray-400">{co.company_type}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {/* Record icon */}
                  <IconButton title="Company Record" onClick={() => setPopup({ company: co, type: 'company' })}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 21v-8H7v8M7 3v5h8" />
                    </svg>
                  </IconButton>
                  {/* Notes icon */}
                  <IconButton title="Notes" onClick={() => setPopup({ company: co, type: 'notes' })}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </IconButton>
                  {/* Attendees icon */}
                  <IconButton title={`Attendees (${co.attendees.length})`} onClick={() => setPopup({ company: co, type: 'attendees' })}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </IconButton>
                </div>
              </div>
              {co.relationship_status && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">{co.relationship_status}</span>
              )}
              {co.attendees.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">{co.attendees.length} attendee{co.attendees.length !== 1 ? 's' : ''}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {popup && (
        <CompanyPopup company={popup.company} type={popup.type} conferenceName={conferenceName} onClose={() => setPopup(null)} />
      )}
    </div>
  );
}

export function ByRepTab({ entries, conferenceId, conferenceName }: { entries: ByRepEntry[]; conferenceId: number; conferenceName: string }) {
  const [expandedRep, setExpandedRep] = useState<string | null>(null);

  function handleToggle(rep: string) {
    setExpandedRep((prev) => (prev === rep ? null : rep));
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No rep-company assignments found for this conference.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{entries.length} rep{entries.length !== 1 ? 's' : ''} with company assignments — click to expand</p>
      {entries.map((entry) => (
        <RepSection key={entry.rep} entry={entry} conferenceId={conferenceId} conferenceName={conferenceName} expandedRep={expandedRep} onToggle={handleToggle} />
      ))}
    </div>
  );
}
