'use client';

import { useEffect, useState } from 'react';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { getRepInitials } from '@/lib/useUserOptions';

interface InternalRelationship {
  id: number;
  company_id: number;
  rep_ids: string | null;
  contact_ids: string | null;
  relationship_status: string;
  description: string;
  created_at: string;
}

interface UserOption { id: number; value: string; }
interface RelTypeOption { id: number; value: string; }
interface AttendeeOption { id: number; first_name: string; last_name: string; title?: string; }

function RepPill({ name }: { name: string }) {
  const colorMaps = useConfigColors();
  const initials = getRepInitials(name);
  const colorClass = getPreset(colorMaps.user?.[name]).badgeClass;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
        <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
      </svg>
      {initials}
    </span>
  );
}

function RelCard({
  rel,
  userOptions,
  attendeeDetailMap,
  relTypeOptions,
}: {
  rel: InternalRelationship;
  userOptions: UserOption[];
  attendeeDetailMap: Map<number, AttendeeOption>;
  relTypeOptions: RelTypeOption[];
}) {
  const [expanded, setExpanded] = useState(false);
  const colorMaps = useConfigColors();

  const reps = rel.rep_ids
    ? rel.rep_ids.split(',').map(id => userOptions.find(u => u.id === Number(id.trim()))?.value || null).filter(Boolean) as string[]
    : [];

  const contacts = rel.contact_ids
    ? rel.contact_ids.split(',').map(id => attendeeDetailMap.get(Number(id.trim())) || null).filter(Boolean) as AttendeeOption[]
    : [];

  const statusNames = rel.relationship_status
    ? rel.relationship_status.split(',').map(id => relTypeOptions.find(o => o.id === Number(id.trim()))?.value || id.trim()).filter(Boolean)
    : [];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full p-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            {contacts.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {contacts.map(att => (
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
        {reps.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-2">
            {reps.map((name, i) => <RepPill key={i} name={name} />)}
          </div>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {statusNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {statusNames.map((s, i) => (
                <span key={i} className={getBadgeClass(s, colorMaps.rep_relationship_type || {})}>{s}</span>
              ))}
            </div>
          )}
          {rel.description && (
            <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{rel.description}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function CompanyRelationshipsPopup({
  companyId,
  companyName,
  onClose,
}: {
  companyId: number;
  companyName: string;
  onClose: () => void;
}) {
  const [relationships, setRelationships] = useState<InternalRelationship[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [relTypeOptions, setRelTypeOptions] = useState<RelTypeOption[]>([]);
  const [attendeeDetailMap, setAttendeeDetailMap] = useState<Map<number, AttendeeOption>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/internal-relationships?company_id=${companyId}`).then(r => r.json()),
      fetch('/api/config?category=user').then(r => r.json()),
      fetch('/api/config?category=rep_relationship_type').then(r => r.json()),
    ]).then(([rels, users, relTypes]) => {
      setRelationships(rels);
      setUserOptions((users as { id: number; value: string }[]).map(o => ({ id: Number(o.id), value: String(o.value) })));
      setRelTypeOptions((relTypes as { id: number; value: string }[]).map(o => ({ id: Number(o.id), value: String(o.value) })));
    }).catch(console.error).finally(() => setIsLoading(false));
  }, [companyId]);

  useEffect(() => {
    if (!relationships.length) return;
    const allIds = new Set<number>();
    for (const rel of relationships) {
      if (!rel.contact_ids) continue;
      for (const s of rel.contact_ids.split(',')) {
        const n = Number(s.trim());
        if (n) allIds.add(n);
      }
    }
    if (!allIds.size) return;
    const map = new Map<number, AttendeeOption>();
    Promise.all(
      Array.from(allIds).map(id =>
        fetch(`/api/attendees/${id}`).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    ).then(results => {
      for (const d of results) {
        if (d?.id) map.set(d.id, { id: d.id, first_name: d.first_name, last_name: d.last_name, title: d.title || undefined });
      }
      setAttendeeDetailMap(new Map(map));
    });
  }, [relationships]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-procare-gold w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-bold text-procare-dark-blue font-serif">{companyName} Relationships</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3 flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
            </div>
          ) : relationships.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No relationships found.</p>
          ) : relationships.map(rel => (
            <RelCard
              key={rel.id}
              rel={rel}
              userOptions={userOptions}
              attendeeDetailMap={attendeeDetailMap}
              relTypeOptions={relTypeOptions}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
