'use client';

import { useState, useEffect, useCallback, type MutableRefObject } from 'react';
import toast from 'react-hot-toast';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { NotesSection, type EntityNote } from '@/components/NotesSection';
import { PinnedNotesSection, type PinnedNote } from '@/components/PinnedNotesSection';
import { type UserOption } from '@/lib/useUserOptions';

// ── Data shapes ───────────────────────────────────────────────────────────────

interface AttendeeData {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  status: string | null;
  function: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  company_id: number | null;
  company_name: string | null;
  created_at: string;
  verified: number | null;
  assigned_user: string | null;
}

interface CompanyAttendee {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
}

interface CompanyData {
  id: number;
  name: string;
  status: string | null;
  company_type: string | null;
  icp: string | null;
  website: string | null;
  created_at: string;
  assigned_user: string | null;
  wse: number | null;
  attendees: CompanyAttendee[];
}

interface DrawerMeeting {
  id: number;
  attendee_id: number;
  first_name: string;
  last_name: string;
  meeting_date: string;
  meeting_time: string;
  meeting_type: string | null;
  outcome: string | null;
  conference_name: string;
}

export interface CachedRecord {
  entityData: AttendeeData | CompanyData;
  followUps: FollowUp[];
  meetings: DrawerMeeting[];
  notes: EntityNote[];
  pinnedNotes: PinnedNote[];
  userOptions: UserOption[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
          <div className="flex gap-1">
            <div className="h-4 bg-gray-100 rounded w-12" />
            <div className="h-4 bg-gray-100 rounded w-16" />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-2">
            <div className="h-3 bg-gray-100 rounded w-14 flex-shrink-0" />
            <div className="h-3 bg-gray-200 rounded flex-1" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-2 bg-gray-100 rounded w-20" />
        {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg" />)}
      </div>
      <div className="space-y-2">
        <div className="h-2 bg-gray-100 rounded w-20" />
        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
      </div>
    </div>
  );
}

function SectionLabel({ title }: { title: string }) {
  return <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RecordDrawerPanel({
  type,
  entityId,
  onClose,
  onNavigate,
  onOpenMeeting,
  cacheRef,
  contentFadeKey,
}: {
  type: 'attendee' | 'company';
  entityId: number;
  onClose: () => void;
  onNavigate: (type: 'attendee' | 'company', id: number) => void;
  onOpenMeeting: (meetingId: number) => void;
  cacheRef: MutableRefObject<Map<string, CachedRecord>>;
  contentFadeKey: number;
}) {
  const cacheKey = `${type}-${entityId}`;

  const [loading, setLoading] = useState(false);
  const [entityData, setEntityData] = useState<AttendeeData | CompanyData | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [meetings, setMeetings] = useState<DrawerMeeting[]>([]);
  const [notes, setNotes] = useState<EntityNote[]>([]);
  const [pinnedNotes, setPinnedNotes] = useState<PinnedNote[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);

  const applyRecord = (rec: CachedRecord) => {
    setEntityData(rec.entityData);
    setFollowUps(rec.followUps);
    setMeetings(rec.meetings);
    setNotes(rec.notes);
    setPinnedNotes(rec.pinnedNotes);
    setUserOptions(rec.userOptions);
  };

  const invalidate = useCallback(() => {
    cacheRef.current.delete(cacheKey);
  }, [cacheKey, cacheRef]);

  const fetchAndLoad = useCallback(async () => {
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      applyRecord(cached);
      return;
    }

    setLoading(true);
    setEntityData(null);

    try {
      const fuParam = type === 'attendee' ? `attendee_id=${entityId}` : `company_id=${entityId}`;
      const mtgParam = type === 'attendee' ? `attendee_id=${entityId}` : `company_id=${entityId}`;

      const [entityRes, fuRes, mtgRes, notesRes, pinnedRes, usersRes] = await Promise.all([
        fetch(type === 'attendee' ? `/api/attendees/${entityId}` : `/api/companies/${entityId}`),
        fetch(`/api/follow-ups?${fuParam}`),
        fetch(`/api/meetings?${mtgParam}`),
        fetch(`/api/notes?entity_type=${type}&entity_id=${entityId}`),
        fetch(`/api/pinned-notes?entity_type=${type}&entity_id=${entityId}`),
        fetch('/api/config?category=user'),
      ]);

      const [ed, fus, mtgs, nts, pinned, users] = await Promise.all([
        entityRes.ok ? entityRes.json() : null,
        fuRes.ok ? fuRes.json() : [],
        mtgRes.ok ? mtgRes.json() : [],
        notesRes.ok ? notesRes.json() : [],
        pinnedRes.ok ? pinnedRes.json() : [],
        usersRes.ok ? usersRes.json() : [],
      ]);

      if (!ed) throw new Error('Record not found');

      const rec: CachedRecord = {
        entityData: ed,
        followUps: fus,
        meetings: mtgs,
        notes: nts,
        pinnedNotes: pinned,
        userOptions: users,
      };
      cacheRef.current.set(cacheKey, rec);
      applyRecord(rec);
    } catch {
      toast.error('Failed to load record');
    } finally {
      setLoading(false);
    }
  }, [type, entityId, cacheKey, cacheRef]);

  useEffect(() => { fetchAndLoad(); }, [fetchAndLoad]);

  // Invalidate cache on entity change (ensures fresh data when revisiting)
  useEffect(() => {
    return () => { cacheRef.current.delete(`${type}-${entityId}`); };
  }, [type, entityId, cacheRef]);

  // ── Follow-up handlers ─────────────────────────────────────────────────────

  const handleToggleFollowUp = useCallback(async (id: number, completed: boolean) => {
    setFollowUps(prev => prev.map(fu => fu.id === id ? { ...fu, completed } : fu));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed }),
      });
      if (!res.ok) throw new Error();
      invalidate();
    } catch {
      setFollowUps(prev => prev.map(fu => fu.id === id ? { ...fu, completed: !completed } : fu));
      toast.error('Failed to update follow-up');
    }
  }, [invalidate]);

  const handleBulkToggle = useCallback(async (ids: number[]) => {
    setFollowUps(prev => prev.map(fu => ids.includes(fu.id) ? { ...fu, completed: true } : fu));
    try {
      await Promise.all(ids.map(id =>
        fetch('/api/follow-ups', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, completed: true }),
        }).then(r => { if (!r.ok) throw new Error(); })
      ));
      invalidate();
    } catch {
      setFollowUps(prev => prev.map(fu => ids.includes(fu.id) ? { ...fu, completed: false } : fu));
      toast.error('Failed to mark all done');
      throw new Error();
    }
  }, [invalidate]);

  const handleDeleteFollowUp = useCallback(async (id: number) => {
    if (!confirm('Delete this follow-up?')) return;
    const prev = followUps;
    setFollowUps(fus => fus.filter(fu => fu.id !== id));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      invalidate();
    } catch {
      setFollowUps(prev);
      toast.error('Failed to delete');
    }
  }, [followUps, invalidate]);

  const handleRepChange = useCallback(async (id: number, rep: string | null) => {
    setFollowUps(prev => prev.map(fu => fu.id === id ? { ...fu, assigned_rep: rep } : fu));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, assigned_rep: rep }),
      });
      if (!res.ok) throw new Error();
      invalidate();
    } catch {
      toast.error('Failed to update rep');
      fetchAndLoad();
    }
  }, [invalidate, fetchAndLoad]);

  const handleUnpin = useCallback(async (pinId: number) => {
    setPinnedNotes(prev => prev.filter(p => p.id !== pinId));
    try {
      await fetch('/api/pinned-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pinId }),
      });
      invalidate();
    } catch {
      fetchAndLoad();
      toast.error('Failed to unpin note');
    }
  }, [invalidate, fetchAndLoad]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderAttendeeHeader = (a: AttendeeData) => {
    const fullName = `${a.first_name} ${a.last_name}`.trim();
    const statusValues = a.status ? a.status.split(',').map(s => s.trim()).filter(Boolean) : [];
    const funcValues = a.function ? a.function.split(',').map(s => s.trim()).filter(Boolean) : [];

    return (
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-brand-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {initials(fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-gray-900">{fullName}</span>
              {a.verified === 1 && (
                <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
              {a.linkedin_url && (
                <a href={a.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="text-blue-500 hover:text-blue-700 flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              )}
            </div>
            {a.title && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{a.title}</p>}
            {(a.seniority || funcValues.length > 0 || statusValues.length > 0) && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {a.seniority && <span className="badge">{a.seniority}</span>}
                {funcValues.map(f => <span key={f} className="badge">{f}</span>)}
                {statusValues.map(s => <span key={s} className="badge">{s}</span>)}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          {a.company_id != null && a.company_name && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-16 flex-shrink-0">Company</span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onNavigate('company', a.company_id!); }}
                className="text-brand-secondary hover:underline font-medium truncate text-left"
              >
                {a.company_name}
              </button>
            </div>
          )}
          {a.email && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-16 flex-shrink-0">Email</span>
              <a href={`mailto:${a.email}`} onClick={e => e.stopPropagation()}
                className="text-brand-secondary hover:underline truncate">{a.email}</a>
            </div>
          )}
          {a.created_at && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-16 flex-shrink-0">Added</span>
              <span className="text-gray-600">{fmtDate(a.created_at)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCompanyHeader = (co: CompanyData) => {
    const statusValues = co.status ? co.status.split(',').map(s => s.trim()).filter(Boolean) : [];
    return (
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-brand-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {initials(co.name)}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-bold text-gray-900 leading-snug">{co.name}</span>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {co.company_type && <span className="badge">{co.company_type}</span>}
              {statusValues.map(s => <span key={s} className="badge">{s}</span>)}
              {co.icp && co.icp !== 'No' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">ICP</span>
              )}
              {co.wse != null && co.wse > 0 && (
                <span className="badge">{co.wse.toLocaleString()} units</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          {co.website && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-16 flex-shrink-0">Website</span>
              <a href={co.website.startsWith('http') ? co.website : `https://${co.website}`}
                target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="text-brand-secondary hover:underline truncate">{co.website}</a>
            </div>
          )}
          {co.created_at && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-16 flex-shrink-0">Added</span>
              <span className="text-gray-600">{fmtDate(co.created_at)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMeetingCards = () => {
    if (meetings.length === 0) return null;
    return (
      <div>
        <SectionLabel title={`Meetings (${meetings.length})`} />
        <div className="space-y-2">
          {meetings.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={e => { e.stopPropagation(); onOpenMeeting(m.id); }}
              className="w-full text-left rounded-lg border border-gray-200 bg-white hover:border-brand-primary/40 hover:bg-brand-primary/5 p-2.5 transition-all"
            >
              {type === 'company' && (
                <p className="text-xs font-medium text-gray-800 truncate">
                  {m.first_name} {m.last_name}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {m.meeting_type && <span className="text-xs text-gray-600">{m.meeting_type}</span>}
                {m.outcome && <span className="text-xs text-gray-400">{m.outcome}</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {m.meeting_date && <span className="text-xs text-gray-400">{m.meeting_date}</span>}
                {m.conference_name && <span className="text-xs text-gray-400 truncate">· {m.conference_name}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderAttendeeList = () => {
    if (type !== 'company' || !entityData) return null;
    const co = entityData as CompanyData;
    if (!co.attendees?.length) return null;
    return (
      <div>
        <SectionLabel title={`Contacts (${co.attendees.length})`} />
        <div className="space-y-1.5">
          {co.attendees.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={e => { e.stopPropagation(); onNavigate('attendee', a.id); }}
              className="w-full text-left rounded-lg border border-gray-200 bg-white hover:border-brand-primary/40 hover:bg-brand-primary/5 p-2.5 transition-all"
            >
              <p className="text-xs font-semibold text-gray-800">{a.first_name} {a.last_name}</p>
              {a.title && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{a.title}</p>}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const pendingCount = followUps.filter(f => !f.completed).length;

  const renderContent = () => {
    if (!entityData) return <div className="p-8 text-center text-sm text-gray-400">Failed to load record.</div>;

    return (
      <div key={contentFadeKey} style={{ animation: 'debriefFadeIn 0.15s ease-out' }}>
        {/* Header */}
        {type === 'attendee'
          ? renderAttendeeHeader(entityData as AttendeeData)
          : renderCompanyHeader(entityData as CompanyData)
        }

        <div className="p-4 space-y-5">
          {/* Pinned Notes */}
          {pinnedNotes.length > 0 && (
            <PinnedNotesSection pinnedNotes={pinnedNotes} onUnpin={handleUnpin} />
          )}

          {/* Attendee list (company only) */}
          {renderAttendeeList()}

          {/* Meetings */}
          {renderMeetingCards()}

          {/* Follow-Ups */}
          {followUps.length > 0 && (
            <div>
              <SectionLabel title={`Follow-Ups${pendingCount > 0 ? ` (${pendingCount} pending)` : ' (all done)'}`} />
              <FollowUpsTable
                followUps={followUps}
                onToggle={handleToggleFollowUp}
                onDelete={handleDeleteFollowUp}
                userOptions={userOptions}
                onRepChange={handleRepChange}
                onBulkToggle={handleBulkToggle}
                tableName={type === 'attendee' ? 'drawer_attendee_follow_ups' : 'drawer_company_follow_ups'}
                groupBy={type === 'attendee' ? 'conference' : 'conference-attendee'}
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <SectionLabel title="Notes" />
            <NotesSection
              entityType={type}
              entityId={entityId}
              initialNotes={notes}
              currentAttendeeName={
                type === 'attendee'
                  ? `${(entityData as AttendeeData).first_name} ${(entityData as AttendeeData).last_name}`.trim()
                  : undefined
              }
              currentCompanyName={
                type === 'company' ? (entityData as CompanyData).name : undefined
              }
              currentCompanyId={
                type === 'attendee' ? ((entityData as AttendeeData).company_id ?? undefined) : undefined
              }
              currentAttendeeId={type === 'attendee' ? entityId : undefined}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col" onClick={e => e.stopPropagation()}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {type === 'attendee' ? 'Attendee Record' : 'Company Record'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading ? <LoadingSkeleton /> : renderContent()}
      </div>
    </div>
  );
}
