'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { getRepInitials } from '@/lib/useUserOptions';
import type { UserOption } from '@/lib/useUserOptions';

interface InternalRelationship {
  id: number;
  company_id: number;
  rep_ids: string | null;
  contact_ids: string | null;
  relationship_status: string;
  description: string;
  created_at: string;
}

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
}

interface RelTypeOption {
  id: number;
  value: string;
}

interface RepEntry {
  userId: number;
  name: string;
  tags: string[];
}

interface ContactGroup {
  contact: AttendeeOption;
  reps: RepEntry[];
  repCount: number;
}

// Deterministic color for contact initials avatars
const AVATAR_COLORS = [
  { bg: '#dbeafe', text: '#1e40af' },
  { bg: '#dcfce7', text: '#166534' },
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#f3e8ff', text: '#6b21a8' },
  { bg: '#ffe4e6', text: '#9f1239' },
  { bg: '#e0f2fe', text: '#075985' },
  { bg: '#ecfdf5', text: '#064e3b' },
  { bg: '#fce7f3', text: '#9d174d' },
];

function avatarColor(name: string) {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function buildGroups(
  relationships: InternalRelationship[],
  contactMap: Map<number, AttendeeOption>,
  userMap: Map<number, string>,
  relTypeMap: Map<number, string>,
): ContactGroup[] {
  const groupMap = new Map<number, { contact: AttendeeOption; repTags: Map<number, Set<string>> }>();

  for (const rel of relationships) {
    const contactIds = (rel.contact_ids ?? '').split(',').map(s => Number(s.trim())).filter(Boolean);
    const repIds = (rel.rep_ids ?? '').split(',').map(s => Number(s.trim())).filter(Boolean);
    const tagIds = (rel.relationship_status ?? '').split(',').map(s => Number(s.trim())).filter(Boolean);
    const tags = tagIds.map(id => relTypeMap.get(id)).filter((t): t is string => !!t);

    for (const contactId of contactIds) {
      const contact = contactMap.get(contactId);
      if (!contact) continue;

      if (!groupMap.has(contactId)) {
        groupMap.set(contactId, { contact, repTags: new Map() });
      }
      const group = groupMap.get(contactId)!;

      for (const repId of repIds) {
        const existing = group.repTags.get(repId) ?? new Set<string>();
        tags.forEach(t => existing.add(t));
        group.repTags.set(repId, existing);
      }
    }
  }

  return Array.from(groupMap.values())
    .map(({ contact, repTags }) => ({
      contact,
      reps: Array.from(repTags.entries()).map(([userId, tagSet]) => ({
        userId,
        name: userMap.get(userId) ?? `Rep ${userId}`,
        tags: Array.from(tagSet),
      })),
      repCount: repTags.size,
    }))
    .sort((a, b) =>
      b.repCount - a.repCount ||
      `${a.contact.first_name} ${a.contact.last_name}`.localeCompare(`${b.contact.first_name} ${b.contact.last_name}`)
    );
}

function RepRow({ rep }: { rep: RepEntry }) {
  const colorMaps = useConfigColors();
  const ini = getRepInitials(rep.name);
  const colorClass = getPreset(colorMaps.user?.[rep.name]).badgeClass;
  return (
    <div className="flex items-start gap-2 py-2">
      <span className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[9px] font-bold flex-shrink-0 ${colorClass}`}>
        {ini}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-700 leading-tight">{rep.name}</p>
        {rep.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {rep.tags.map((tag, i) => (
              <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getBadgeClass(tag, colorMaps.rep_relationship_type || {})}`}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactCard({ group, defaultExpanded }: {
  group: ContactGroup;
  defaultExpanded: boolean;
}) {
  const [repsOpen, setRepsOpen] = useState(defaultExpanded);
  const { contact, reps, repCount } = group;
  const { bg, text } = avatarColor(`${contact.first_name} ${contact.last_name}`);
  const ini = initials(contact.first_name, contact.last_name);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Contact header */}
      <div className="p-4 flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
          style={{ backgroundColor: bg, color: text }}
        >
          {ini}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/attendees/${contact.id}`}
            className="text-sm font-semibold text-brand-primary hover:text-brand-secondary hover:underline leading-tight block"
          >
            {contact.first_name} {contact.last_name}
          </Link>
          {contact.title && (
            <p className="text-xs text-gray-500 leading-tight mt-0.5">{contact.title}</p>
          )}
        </div>
        <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
          {repCount} {repCount === 1 ? 'rep' : 'reps'}
        </span>
      </div>

      {/* Expandable rep section */}
      <div className="border-t border-gray-100">
        <button
          type="button"
          onClick={() => setRepsOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors text-left"
        >
          <span className="text-[11px] text-gray-400 font-medium">
            {repCount} {repCount === 1 ? 'rep' : 'reps'} with relationship
          </span>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${repsOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {repsOpen && (
          <div className="px-4 pb-2 divide-y divide-gray-50">
            {reps.map(rep => (
              <RepRow key={rep.userId} rep={rep} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const CLOSE_BTN = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export function RelationshipMapDrawer({
  relationships,
  contacts,
  userOptions,
  relTypeOptions,
  companyName,
  onClose,
}: {
  relationships: InternalRelationship[];
  contacts: Map<number, AttendeeOption>;
  userOptions: UserOption[];
  relTypeOptions: RelTypeOption[];
  companyName?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const userMap = new Map(userOptions.map(u => [u.id, u.value]));
  const relTypeMap = new Map(relTypeOptions.map(r => [r.id, r.value]));
  const groups = buildGroups(relationships, contacts, userMap, relTypeMap);

  const totalReps = new Set(
    relationships.flatMap(r =>
      (r.rep_ids ?? '').split(',').map(s => Number(s.trim())).filter(Boolean)
    )
  ).size;

  return (
    <>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      <div className="fixed inset-0 z-50">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        {/* Drawer panel */}
        <div
          className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] bg-white shadow-2xl flex flex-col"
          style={{ animation: 'slideInRight 0.25s ease-out' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Relationship map</h3>
              <p className="text-xs text-gray-500">
                {companyName && `${companyName} · `}
                {groups.length} {groups.length === 1 ? 'contact' : 'contacts'} · {totalReps} {totalReps === 1 ? 'rep' : 'reps'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            >
              {CLOSE_BTN}
            </button>
          </div>

          {/* Content */}
          {groups.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center px-8">
              <div>
                <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-sm text-gray-500">No internal relationships recorded for this company.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {groups.map((group, i) => (
                <ContactCard
                  key={group.contact.id}
                  group={group}
                  defaultExpanded={i === 0}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
