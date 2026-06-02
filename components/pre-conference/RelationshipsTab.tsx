'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { TargetBtn } from './TargetBtn';
import { useRecordDrawer } from './RecordDrawerContext';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { getRepInitials } from '@/lib/useUserOptions';
import { TouchpointMap } from '@/components/TouchpointMap';
import type { RelationshipRow, TargetEntry } from '../PreConferenceReview';

// ── Helpers (mirrors RelationshipMapDrawer) ────────────────────────────────────

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

// ── Sub-components (same as RelationshipMapDrawer) ─────────────────────────────

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

// ── Timeline types ─────────────────────────────────────────────────────────────

interface TimelineMeeting { id: number; meeting_date: string; meeting_time: string; location: string | null; outcome: string | null; meeting_type: string | null; }
interface TimelineNote { id: number; content: string; created_at: string; rep: string | null; }
interface TimelineFollowUp { id: number; next_steps: string | null; assigned_rep: string | null; completed: number | null; created_at: string; }
interface TimelineSocial { social_event_id: number; rsvp_status: string; event_type: string | null; event_name: string | null; event_date: string | null; }
interface Touchpoint {
  conference: { id: number; name: string; start_date: string; end_date: string; location: string };
  meetings: TimelineMeeting[];
  notes: TimelineNote[];
  followUps: TimelineFollowUp[];
  socialEvents: TimelineSocial[];
  depthScore: number;
}
interface TimelineData {
  attendee: { id: number; first_name: string; last_name: string; title: string | null; email: string | null; status: string | null; seniority: string | null; company_name: string | null; company_type: string | null; icp: string | null; wse: number | null };
  touchpoints: Touchpoint[];
  healthScore: number;
  daysSinceLastTouch: number | null;
  totalTouchpoints: number;
  followUpCompletionRate: number | null;
  loggedTouchpoints: number;
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

// ── Relationship Attendee Card ─────────────────────────────────────────────────

function RelationshipAttendeeCard({
  attendee,
  repNames,
  isTarget,
  onToggleTarget,
  readOnly,
}: {
  attendee: RelationshipRow['attendees'][0] & { company_name: string; company_id: number };
  repNames: string[];
  isTarget: boolean;
  onToggleTarget: () => void;
  readOnly: boolean;
}) {
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showTpMap, setShowTpMap] = useState(false);
  const [repsOpen, setRepsOpen] = useState(false);
  const tpBtnRef = useRef<HTMLDivElement>(null);
  const colorMaps = useConfigColors();

  useEffect(() => {
    fetch(`/api/attendees/${attendee.id}/timeline`)
      .then(r => r.ok ? r.json() : null)
      .then((d: TimelineData | null) => {
        setTimeline(d);
        if (d && d.touchpoints.length > 0) setSelectedIdx(d.touchpoints.length - 1);
      })
      .catch(() => {});
  }, [attendee.id]);

  const healthScore = timeline?.healthScore ?? 0;
  const hColor = scoreColor(healthScore);
  const touchpoints = timeline?.touchpoints ?? [];
  const totalTouchpoints = timeline?.totalTouchpoints ?? 0;
  const loggedTouchpoints = timeline?.loggedTouchpoints ?? 0;
  const followUpRate = timeline?.followUpCompletionRate ?? null;
  const icp = timeline?.attendee.icp;
  const attendeeStatus = timeline?.attendee.status;
  const selectedTp = selectedIdx !== null ? touchpoints[selectedIdx] ?? null : null;
  const avatarLetter = (attendee.first_name?.[0] ?? '').toUpperCase();

  return (
    <div className="card flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-brand-primary font-bold font-serif text-lg flex-shrink-0"
          style={{ background: timeline ? `${hColor}22` : 'rgba(34,58,94,0.08)' }}>
          {avatarLetter}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link href={`/attendees/${attendee.id}`}
              className="font-semibold text-brand-primary hover:text-brand-secondary transition-colors leading-tight font-serif truncate">
              {attendee.first_name} {attendee.last_name}
            </Link>
            <TargetBtn
              isTarget={isTarget}
              disabled={readOnly}
              onClick={onToggleTarget}
            />
          </div>
          {attendee.title && (
            <div className="text-xs text-gray-500 leading-snug mt-0.5 truncate">{attendee.title}</div>
          )}
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
            {attendeeStatus.split(',').map((s: string) => s.trim()).join(', ')}
          </span>
        )}
        {attendee.seniority && (
          <span className="badge-gray text-xs px-2 py-0.5">{attendee.seniority}</span>
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
            attendeeId={attendee.id}
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

      {/* Reps (expandable) */}
      {repNames.length > 0 && (
        <div className="border-t border-gray-100 -mx-4 px-4 pt-0">
          <button type="button" onClick={() => setRepsOpen(v => !v)}
            className="w-full flex items-center justify-between py-2 hover:opacity-70 transition-opacity text-left">
            <span className="text-[11px] text-gray-400 font-medium">
              {repNames.length} {repNames.length === 1 ? 'rep' : 'reps'} with relationship
            </span>
            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${repsOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {repsOpen && (
            <div className="pb-1 divide-y divide-gray-50">
              {repNames.map(name => {
                const ini = getRepInitials(name);
                const colorClass = getPreset(colorMaps.user?.[name]).badgeClass;
                return (
                  <div key={name} className="flex items-center gap-2 py-2">
                    <span className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[9px] font-bold flex-shrink-0 ${colorClass}`}>
                      {ini}
                    </span>
                    <p className="text-xs font-medium text-gray-700 leading-tight">{name}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Company grouping ───────────────────────────────────────────────────────────

interface CompanyGroup {
  id: number;
  name: string;
  attendees: (RelationshipRow['attendees'][0] & { company_name: string; company_id: number; rep_names: string[] })[];
  repNames: string[];
  status: string;
  description: string;
  totalRelationships: number;
}

function groupRelationshipsByCompany(relationships: RelationshipRow[]): CompanyGroup[] {
  const map = new Map<number, CompanyGroup>();
  for (const rel of relationships) {
    if (!map.has(rel.company_id)) {
      map.set(rel.company_id, {
        id: rel.company_id,
        name: rel.company_name,
        attendees: [],
        repNames: [],
        status: rel.relationship_status,
        description: rel.description,
        totalRelationships: 0,
      });
    }
    const group = map.get(rel.company_id)!;
    group.totalRelationships += 1;
    // Merge rep names (deduplicate)
    for (const r of rel.rep_names) {
      if (!group.repNames.includes(r)) group.repNames.push(r);
    }
    // Merge attendees (deduplicate by id)
    for (const a of rel.attendees) {
      if (!group.attendees.find(x => x.id === a.id)) {
        group.attendees.push({ ...a, company_name: rel.company_name, company_id: rel.company_id, rep_names: rel.rep_names });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.attendees.length - a.attendees.length || a.name.localeCompare(b.name));
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function RelationshipsTab({
  relationships,
  targetMap,
  onToggleTarget,
  readOnly = false,
}: {
  relationships: RelationshipRow[];
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  readOnly?: boolean;
}) {
  const openRecord = useRecordDrawer();
  const companies = groupRelationshipsByCompany(relationships);
  const [selectedId, setSelectedId] = useState<number | null>(companies[0]?.id ?? null);

  // Auto-select first company if none selected yet
  useEffect(() => {
    if (selectedId === null && companies.length > 0) setSelectedId(companies[0].id);
  }, [companies, selectedId]);

  if (relationships.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No internal relationships found for companies attending this conference.</p>
      </div>
    );
  }

  const selectedCompany = companies.find(c => c.id === selectedId) ?? null;

  return (
    <div className="flex gap-4 h-full min-h-0">

      {/* ── Left: company list ── */}
      <div className="w-56 flex-shrink-0 overflow-y-auto space-y-2 pr-1">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide px-1 mb-3">
          {companies.length} Compan{companies.length !== 1 ? 'ies' : 'y'}
        </p>
        {companies.map(co => {
          const isSelected = co.id === selectedId;
          return (
            <button
              key={co.id}
              type="button"
              onClick={() => setSelectedId(co.id)}
              className={`w-full text-left rounded-xl border p-3 transition-all ${
                isSelected
                  ? 'border-brand-primary bg-brand-primary/5 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-brand-primary/40 hover:shadow-sm'
              }`}
            >
              <button
                type="button"
                onClick={e => { e.stopPropagation(); openRecord('company', co.id); }}
                className="font-semibold text-sm text-gray-900 hover:text-brand-secondary transition-colors truncate block text-left w-full leading-tight"
              >
                {co.name}
              </button>
              {co.status && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{co.status}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {co.attendees.length > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">
                    {co.attendees.length} at conf
                  </span>
                )}
                {co.repNames.length > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-brand-secondary">
                    {co.repNames.length} rep{co.repNames.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Right: attendee cards ── */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {selectedCompany ? (
          selectedCompany.attendees.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-gray-400 text-sm">No contacts from {selectedCompany.name} are attending this conference.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 content-start pb-4">
              {selectedCompany.attendees.map(a => (
                <RelationshipAttendeeCard
                  key={a.id}
                  attendee={a}
                  repNames={a.rep_names}
                  isTarget={targetMap.has(a.id)}
                  onToggleTarget={() => onToggleTarget({
                    attendeeId: a.id,
                    firstName: a.first_name,
                    lastName: a.last_name,
                    title: a.title,
                    seniority: a.seniority ?? null,
                    companyName: a.company_name,
                    companyId: a.company_id,
                    companyWse: null,
                    assignedUserNames: a.rep_names,
                  })}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-gray-400 text-sm">Select a company to view relationship contacts.</p>
          </div>
        )}
      </div>
    </div>
  );
}
