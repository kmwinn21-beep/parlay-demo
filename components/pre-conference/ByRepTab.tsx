'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { ByRepEntry } from '../PreConferenceReview';

type PopupType = 'company' | 'notes' | 'attendees';

interface PopupState {
  type: PopupType;
  companyId: number;
  companyName: string;
  repName: string;
}

interface CompanyNote {
  id: number;
  content: string;
  created_at: string | null;
  rep?: string | null;
  conference_name?: string | null;
  attendee_name?: string | null;
}

function CompanyNotesPanel({ companyId, companyName, conferenceName }: { companyId: number; companyName: string; conferenceName: string }) {
  const [notes, setNotes] = useState<CompanyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400">No notes yet for {companyName}.</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {notes.map((n) => (
            <div key={n.id} className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-700">{n.content}</p>
              <p className="text-xs text-gray-400 mt-1">
                {n.rep ?? 'Unknown'}
                {n.conference_name ? ` · ${n.conference_name}` : ''}
                {n.attendee_name ? ` · ${n.attendee_name}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-gray-100 pt-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-secondary/30"
        />
        <button
          onClick={addNote}
          disabled={saving || !content.trim()}
          className="mt-2 btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add Note'}
        </button>
      </div>
    </div>
  );
}

function Popup({ popup, entry, conferenceId, conferenceName, onClose }: {
  popup: PopupState;
  entry: ByRepEntry;
  conferenceId: number;
  conferenceName: string;
  onClose: () => void;
}) {
  const company = entry.companies.find((c) => c.company_id === popup.companyId);
  if (!company) return null;

  const popupTitles: Record<PopupType, string> = {
    company: 'Company Record',
    notes: 'Notes',
    attendees: 'Attendees',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{company.company_name}</h3>
            <p className="text-xs text-gray-500">{popupTitles[popup.type]} · {popup.repName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {popup.type === 'company' && (
            <div className="space-y-3">
              {company.company_type && (
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Type</span>
                  <p className="text-sm text-gray-800 mt-0.5">{company.company_type}</p>
                </div>
              )}
              {company.relationship_status && (
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Relationship</span>
                  <p className="text-sm text-gray-800 mt-0.5">{company.relationship_status}</p>
                </div>
              )}
              {company.description && (
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Description</span>
                  <p className="text-sm text-gray-700 mt-0.5">{company.description}</p>
                </div>
              )}
              {!company.company_type && !company.relationship_status && !company.description && (
                <p className="text-sm text-gray-400">No company record details available.</p>
              )}
              <Link href={`/companies/${company.company_id}`} className="inline-block text-xs text-brand-secondary hover:underline mt-2">
                View Full Company Record →
              </Link>
            </div>
          )}

          {popup.type === 'notes' && (
            <CompanyNotesPanel companyId={popup.companyId} companyName={company.company_name} conferenceName={conferenceName} />
          )}

          {popup.type === 'attendees' && (
            <div className="space-y-2">
              {company.attendees.length === 0 ? (
                <p className="text-sm text-gray-400">No attendees for this company at this conference.</p>
              ) : (
                company.attendees.map((a) => (
                  <Link key={a.id} href={`/attendees/${a.id}`} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{a.first_name} {a.last_name}</p>
                      {a.title && <p className="text-xs text-gray-500">{a.title}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {a.status && (
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{a.status}</span>
                      )}
                      <span className="text-xs text-gray-400">H:{a.health}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RepSection({ entry, conferenceId, conferenceName }: { entry: ByRepEntry; conferenceId: number; conferenceName: string }) {
  const [popup, setPopup] = useState<PopupState | null>(null);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-800 text-sm">{entry.rep}</h3>
        <p className="text-xs text-gray-500">{entry.companies.length} {entry.companies.length === 1 ? 'company' : 'companies'}</p>
      </div>
      <div className="divide-y divide-gray-100">
        {entry.companies.map((co) => (
          <div key={co.company_id} className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{co.company_name}</p>
              {co.company_type && <p className="text-xs text-gray-400">{co.company_type}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setPopup({ type: 'company', companyId: co.company_id, companyName: co.company_name, repName: entry.rep })}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-brand-secondary/40 hover:text-brand-secondary transition-colors"
              >
                Record
              </button>
              <button
                onClick={() => setPopup({ type: 'notes', companyId: co.company_id, companyName: co.company_name, repName: entry.rep })}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-brand-secondary/40 hover:text-brand-secondary transition-colors"
              >
                Notes
              </button>
              <button
                onClick={() => setPopup({ type: 'attendees', companyId: co.company_id, companyName: co.company_name, repName: entry.rep })}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-brand-secondary/40 hover:text-brand-secondary transition-colors"
              >
                Attendees ({co.attendees.length})
              </button>
            </div>
          </div>
        ))}
      </div>
      {popup && (
        <Popup popup={popup} entry={entry} conferenceId={conferenceId} conferenceName={conferenceName} onClose={() => setPopup(null)} />
      )}
    </div>
  );
}

export function ByRepTab({ entries, conferenceId, conferenceName }: { entries: ByRepEntry[]; conferenceId: number; conferenceName: string }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No rep-company relationships found for this conference.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">{entries.length} rep{entries.length !== 1 ? 's' : ''} with company assignments</p>
      {entries.map((entry) => (
        <RepSection key={entry.rep} entry={entry} conferenceId={conferenceId} conferenceName={conferenceName} />
      ))}
    </div>
  );
}
