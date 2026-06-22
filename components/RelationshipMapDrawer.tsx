'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { getRepInitials } from '@/lib/useUserOptions';
import { TouchpointMap } from './TouchpointMap';
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

// ── Timeline data types (matches /api/attendees/[id]/timeline) ─────────────────

interface TimelineMeeting {
  id: number; meeting_date: string; meeting_time: string;
  location: string | null; outcome: string | null; meeting_type: string | null;
}
interface TimelineNote { id: number; content: string; created_at: string; rep: string | null; }
interface TimelineFollowUp {
  id: number; next_steps: string | null; assigned_rep: string | null;
  completed: number | null; created_at: string;
}
interface TimelineSocial {
  social_event_id: number; rsvp_status: string;
  event_type: string | null; event_name: string | null; event_date: string | null;
}
interface Touchpoint {
  conference: { id: number; name: string; start_date: string; end_date: string; location: string; };
  details: { action: string | null; notes: string | null; next_steps: string | null; assigned_rep: string | null; completed: number | null; } | null;
  meetings: TimelineMeeting[];
  notes: TimelineNote[];
  followUps: TimelineFollowUp[];
  socialEvents: TimelineSocial[];
  depthScore: number;
}
interface TimelineData {
  attendee: {
    id: number; first_name: string; last_name: string; title: string | null;
    email: string | null; status: string | null; seniority: string | null;
    company_name: string | null; company_type: string | null; icp: string | null; wse: number | null;
  };
  touchpoints: Touchpoint[];
  healthScore: number;
  daysSinceLastTouch: number | null;
  totalTouchpoints: number;
  followUpCompletionRate: number | null;
  loggedTouchpoints: number;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 75) return '#34D399';
  if (s >= 50) return '#f59e0b';
  if (s >= 25) return '#f97316';
  return '#ef4444';
}

function scoreTier(s: number) {
  if (s >= 75) return 'Strong';
  if (s >= 50) return 'Warm';
  if (s >= 25) return 'Cooling';
  return 'Cold';
}

function fmtDateShort(d: string | null | undefined) {
  if (!d) return '—';
  try {
    const [y, m] = d.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  } catch { return d; }
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
      if (!groupMap.has(contactId)) groupMap.set(contactId, { contact, repTags: new Map() });
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

// ── Sub-components (copied from RelationshipTimeline) ─────────────────────────

function SmallHealthRing({ score }: { score: number }) {
  const color = scoreColor(score);
  const r = 22; const cx = 28; const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" className="flex-shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(34,58,94,0.08)" strokeWidth={4} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`} />
      <text x={cx} y={cx - 2} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 11, fill: '#223A5E', fontWeight: 700, fontFamily: 'inherit' }}>{score}</text>
      <text x={cx} y={cx + 10} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 7, fill: '#475569', letterSpacing: 0.5, fontFamily: 'inherit' }}>HLTH</text>
    </svg>
  );
}

function DepthArc({ score, color }: { score: number; color: string }) {
  const r = 14; const cx = 18; const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" className="absolute inset-0 pointer-events-none">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={2.5}
        strokeOpacity={0.55} strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`} />
    </svg>
  );
}

function ExpandableNote({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 120;
  const isLong = content.length > LIMIT;
  return (
    <div className="py-1 border-t border-gray-100">
      <div className="text-gray-600 leading-relaxed text-xs">
        {expanded || !isLong ? content : `${content.slice(0, LIMIT).trimEnd()}…`}
      </div>
      {isLong && (
        <button onClick={() => setExpanded(v => !v)}
          className="text-brand-secondary text-[10px] font-medium mt-0.5 hover:underline">
          {expanded ? 'Show less' : 'See more'}
        </button>
      )}
    </div>
  );
}

function CardDetail({ tp }: { tp: Touchpoint }) {
  const dColor = scoreColor(tp.depthScore);
  const attending = tp.socialEvents.filter(e => e.rsvp_status === 'attending');
  return (
    <div className="rounded-lg p-3 space-y-2 border border-gray-100 bg-gray-50 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href={`/conferences/${tp.conference.id}`}
            className="font-semibold text-brand-primary hover:text-brand-secondary transition-colors leading-tight block font-serif text-sm">
            {tp.conference.name}
          </Link>
          <div className="text-[10px] text-gray-400 mt-0.5">{tp.conference.location} · {fmtDateShort(tp.conference.start_date)}</div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ color: dColor, background: `${dColor}18`, border: `1px solid ${dColor}35` }}>
          {tp.depthScore}
        </span>
      </div>
      {tp.meetings.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">Meetings</div>
          {tp.meetings.map(m => (
            <div key={m.id} className="flex items-center gap-1.5 py-1 border-t border-gray-100">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0" />
              <span className="font-medium text-gray-700">{m.meeting_type || 'Meeting'}</span>
              {m.outcome && <span className="text-gray-400 truncate">— {m.outcome}</span>}
            </div>
          ))}
        </div>
      )}
      {attending.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">Events</div>
          {attending.map(e => (
            <div key={e.social_event_id} className="flex items-center gap-1.5 py-1 border-t border-gray-100">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <span className="font-medium text-gray-700">{e.event_name || e.event_type || 'Social Event'}</span>
            </div>
          ))}
        </div>
      )}
      {tp.notes.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">Notes</div>
          {tp.notes.map(n => <ExpandableNote key={n.id} content={n.content} />)}
        </div>
      )}
      {tp.followUps.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 mb-1">Follow-ups</div>
          {tp.followUps.map(f => (
            <div key={f.id} className="flex items-center gap-1.5 py-1 border-t border-gray-100">
              <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${f.completed ? 'bg-emerald-400 border-emerald-400' : 'border-gray-300'}`}>
                {f.completed ? <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : null}
              </div>
              <span className={`truncate ${f.completed ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>{f.next_steps || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Rep section ────────────────────────────────────────────────────────────────

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

// ── Full contact card ──────────────────────────────────────────────────────────

function ContactCard({ group, timeline, defaultExpanded }: {
  group: ContactGroup;
  timeline: TimelineData | null;
  defaultExpanded: boolean;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showTpMap, setShowTpMap] = useState(false);
  const [repsOpen, setRepsOpen] = useState(defaultExpanded);
  const tpBtnRef = useRef<HTMLDivElement>(null);

  const { contact, reps, repCount } = group;

  // Derive display values from timeline data when available
  const healthScore = timeline?.healthScore ?? 0;
  const hColor = scoreColor(healthScore);
  const touchpoints = timeline?.touchpoints ?? [];
  const totalTouchpoints = timeline?.totalTouchpoints ?? 0;
  const loggedTouchpoints = timeline?.loggedTouchpoints ?? 0;
  const followUpRate = timeline?.followUpCompletionRate ?? null;
  const icp = timeline?.attendee.icp;
  const attendeeStatus = timeline?.attendee.status;

  // Auto-select last touchpoint on load
  useEffect(() => {
    if (touchpoints.length > 0) setSelectedIdx(touchpoints.length - 1);
  }, [touchpoints.length]);

  const selectedTp = selectedIdx !== null ? touchpoints[selectedIdx] ?? null : null;
  const avatarLetter = (contact.first_name?.[0] ?? '').toUpperCase();

  return (
    <div className="card flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-brand-primary font-bold font-serif text-lg flex-shrink-0"
          style={{ background: timeline ? `${hColor}22` : 'rgba(34,58,94,0.08)' }}>
          {avatarLetter}
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/attendees/${contact.id}`}
            className="font-semibold text-brand-primary hover:text-brand-secondary transition-colors leading-tight block font-serif">
            {contact.first_name} {contact.last_name}
          </Link>
          <div className="text-xs text-gray-500 leading-snug mt-0.5">
            {contact.title && <span>{contact.title}</span>}
          </div>
        </div>
        {timeline ? (
          <SmallHealthRing score={healthScore} />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
        )}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {timeline && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ color: hColor, background: `${hColor}18`, border: `1px solid ${hColor}35` }}>
            {scoreTier(healthScore)}
          </span>
        )}
        {icp === 'Yes' && <span className="badge-green text-xs px-2 py-0.5">ICP</span>}
        {attendeeStatus && (
          <span className="badge-gray text-xs px-2 py-0.5">
            {attendeeStatus.split(',').map(s => s.trim()).join(', ')}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg p-2 text-center" style={{ background: '#F1F5F9', border: '1px solid rgba(34,58,94,0.07)' }}>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">Conferences</div>
          <div className="text-base font-bold font-serif leading-none mt-0.5" style={{ color: '#223A5E' }}>
            {timeline ? totalTouchpoints : '—'}
          </div>
        </div>
        <div ref={tpBtnRef} className="relative">
          <button type="button" onClick={() => setShowTpMap(prev => !prev)}
            className="w-full rounded-lg p-2 text-center hover:bg-blue-50 transition-colors cursor-pointer"
            style={{ background: '#F1F5F9', border: '1px solid rgba(34,58,94,0.07)' }}>
            <div className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">Touchpoints</div>
            <div className="text-base font-bold font-serif leading-none mt-0.5" style={{ color: '#223A5E' }}>
              {timeline ? loggedTouchpoints : '—'}
            </div>
          </button>
          <TouchpointMap
            attendeeId={contact.id}
            open={showTpMap}
            onClose={() => setShowTpMap(false)}
            anchorRef={tpBtnRef as React.RefObject<HTMLElement>}
          />
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: '#F1F5F9', border: '1px solid rgba(34,58,94,0.07)' }}>
          <div className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">Follow-ups</div>
          <div className="text-base font-bold font-serif leading-none mt-0.5" style={{ color: '#223A5E' }}>
            {timeline ? (followUpRate !== null ? `${followUpRate}%` : '—') : '—'}
          </div>
        </div>
      </div>

      {/* Conference history */}
      {timeline && touchpoints.length > 0 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-2">Conference History</div>
          <div className="flex items-center gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {touchpoints.map((tp, i) => {
              const isActive = selectedIdx === i;
              const dColor = scoreColor(tp.depthScore);
              const hasMeeting = tp.meetings.length > 0;
              const hasSocial = tp.socialEvents.some(e => e.rsvp_status === 'attending');
              return (
                <div key={tp.conference.id} className="flex items-center">
                  {i > 0 && <div className="w-3 h-px bg-gray-200 flex-shrink-0" />}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <button onClick={() => setSelectedIdx(isActive ? null : i)}
                      className="relative w-9 h-9 rounded-full flex items-center justify-center transition-all"
                      style={{
                        background: isActive ? `${dColor}14` : '#F1F5F9',
                        border: `2px solid ${isActive ? dColor : 'rgba(34,58,94,0.14)'}`,
                        boxShadow: isActive ? `0 0 10px ${dColor}44` : '0 1px 3px rgba(34,58,94,0.07)',
                      }}>
                      <DepthArc score={tp.depthScore} color={dColor} />
                      <span className="text-[10px] font-bold relative z-10" style={{ color: isActive ? dColor : '#3A506B' }}>
                        {tp.depthScore}
                      </span>
                      {hasMeeting && <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-brand-primary border border-white" />}
                      {hasSocial && <div className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-white" />}
                    </button>
                    <div className="text-[9px] text-gray-400 text-center max-w-[56px] leading-tight">
                      <div>{fmtDateShort(tp.conference.start_date)}</div>
                      <div className="text-gray-400 break-words leading-tight" style={{ fontSize: 8 }}>
                        {tp.conference.name}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : timeline ? (
        <div className="text-xs text-gray-400 text-center py-4">No conference history</div>
      ) : (
        <div className="space-y-2">
          <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
          <div className="flex gap-2">
            {[1, 2, 3].map(i => <div key={i} className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />)}
          </div>
        </div>
      )}

      {/* Selected conference detail */}
      {selectedTp && <CardDetail tp={selectedTp} />}

      {/* Rep relationships (expandable) */}
      <div className="border-t border-gray-100 -mx-4 px-4 pt-0">
        <button type="button" onClick={() => setRepsOpen(v => !v)}
          className="w-full flex items-center justify-between py-2 hover:opacity-70 transition-opacity text-left -mx-0">
          <span className="text-[11px] text-gray-400 font-medium">
            {repCount} {repCount === 1 ? 'rep' : 'reps'} with relationship
          </span>
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${repsOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {repsOpen && (
          <div className="pb-1 divide-y divide-gray-50">
            {reps.map(rep => <RepRow key={rep.userId} rep={rep} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drawer ─────────────────────────────────────────────────────────────────────

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
  const [timelineMap, setTimelineMap] = useState<Map<number, TimelineData>>(new Map());

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const userMap = new Map(userOptions.map(u => [u.id, u.value]));
  const relTypeMap = new Map(relTypeOptions.map(r => [r.id, r.value]));
  const groups = buildGroups(relationships, contacts, userMap, relTypeMap);

  // Fetch timeline data for each contact
  useEffect(() => {
    const ids = groups.map(g => g.contact.id);
    if (ids.length === 0) return;

    Promise.all(
      ids.map(id =>
        fetch(`/api/attendees/${id}/timeline`)
          .then(r => r.ok ? r.json() as Promise<TimelineData> : null)
          .catch(() => null)
      )
    ).then(results => {
      const map = new Map<number, TimelineData>();
      results.forEach((data, i) => {
        if (data) map.set(ids[i], data);
      });
      setTimelineMap(map);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationships.length]);

  const totalReps = new Set(
    relationships.flatMap(r =>
      (r.rep_ids ?? '').split(',').map(s => Number(s.trim())).filter(Boolean)
    )
  ).size;

  return (
    <>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div
          className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[90vh] sm:h-auto w-full sm:w-[520px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-50"
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
            <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
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
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {groups.map((group, i) => (
                <ContactCard
                  key={group.contact.id}
                  group={group}
                  timeline={timelineMap.get(group.contact.id) ?? null}
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
