'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getBadgeClass } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { useUserOptions } from '@/lib/useUserOptions';
import { MentionTextarea } from './MentionTextarea';
import { type OutreachAttendeeFilter } from './OutreachCompanyCard';

export interface TimelineActivity {
  id: string;
  activityType: 'phone' | 'text' | 'email' | 'linkedin' | 'meeting';
  loggedByName: string;
  attendeeId: number | null;
  attendeeName: string | null;
  notes: string | null;
  loggedAt: string;
  supersededById: string | null;
}

export interface ThreadNote {
  id: number;
  body: string;
  userName: string;
  userInitials: string;
  createdAt: string;
  activityType: 'phone' | 'text' | 'email' | 'linkedin' | null;
  attendeeId: number | null;
  attendeeName: string | null;
}

const DOT_COLOR: Record<TimelineActivity['activityType'], string> = {
  phone: 'bg-green-500',
  text: 'bg-teal-500',
  email: 'bg-blue-500',
  linkedin: 'bg-purple-500',
  meeting: 'bg-amber-500',
};

const ACTIVITY_LABEL: Record<TimelineActivity['activityType'], string> = {
  phone: 'Phone call',
  text: 'Text Message',
  email: 'Email',
  linkedin: 'LinkedIn touch',
  meeting: 'Meeting scheduled',
};

function relativeTime(iso: string): string {
  const d = new Date(iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ANIMATION_MS = 220;

export function OutreachDrawer({
  conferenceId,
  companyId,
  companyName,
  initialTab = 'timeline',
  attendeeFilter,
  pendingActivity,
  pendingNote,
  onClose,
}: {
  conferenceId: number;
  companyId: number;
  companyName: string;
  initialTab?: 'timeline' | 'notes';
  attendeeFilter?: OutreachAttendeeFilter;
  /** A just-logged activity from OutreachCompanyCard's row icons (for this same
   * company), prepended into the timeline without waiting on a refetch. */
  pendingActivity?: TimelineActivity | null;
  /** A just-posted activity note from OutreachCompanyCard's note popover. */
  pendingNote?: ThreadNote | null;
  onClose: () => void;
}) {
  const colorMaps = useConfigColors();
  const userOptions = useUserOptions();
  const [tab, setTab] = useState<'timeline' | 'notes'>(initialTab);
  const [activities, setActivities] = useState<TimelineActivity[] | null>(null);
  const [notes, setNotes] = useState<ThreadNote[] | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [taggedUserIds, setTaggedUserIds] = useState<number[]>([]);
  const [posting, setPosting] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  // Reveal top-down on mount, collapse bottom-up on close — 'closed' is the
  // pre-mount/post-close state (scaleY 0 from the top), 'open' is fully shown;
  // closing flips transform-origin to the bottom before scaling back to 0, so
  // the same shrink motion reads as coming from the opposite edge. Desktop only —
  // below sm (640px) this becomes a bottom sheet using the same
  // drawer-mobile-responsive slide-up used by every other mobile drawer in the app.
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('open'));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = () => {
    if (!isDesktop) { onClose(); return; }
    setPhase('closing');
    setTimeout(onClose, ANIMATION_MS);
  };

  useEffect(() => {
    setTab(initialTab);
    setShowPhone(false);
  }, [initialTab, companyId, attendeeFilter?.id]);

  const handleCopyEmail = async () => {
    if (!attendeeFilter?.email) return;
    try {
      await navigator.clipboard.writeText(attendeeFilter.email);
      toast.success('Email copied');
    } catch {
      toast.error('Failed to copy email');
    }
  };

  // Same direct-profile-or-search-fallback pattern as app/attendees/[id]/page.tsx.
  const linkedinHref = attendeeFilter?.linkedinUrl
    || (attendeeFilter
      ? `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(`${attendeeFilter.name} ${companyName}`.trim())}&origin=GLOBAL_SEARCH_HEADER`
      : undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conferences/${conferenceId}/outreach/${companyId}/timeline`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { if (!cancelled) setActivities(data.activities); })
      .catch(() => { if (!cancelled) setActivities([]); });
    return () => { cancelled = true; };
  }, [conferenceId, companyId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conferences/${conferenceId}/outreach/${companyId}/notes`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { if (!cancelled) setNotes(data.notes); })
      .catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [conferenceId, companyId]);

  // Optimistically fold in an activity/note logged from OutreachCompanyCard's
  // row icons elsewhere in the tree (this drawer's own fetch effects above are
  // keyed only on [conferenceId, companyId], so they never see it otherwise).
  // Dedup by id in case the drawer remounts after the server round trip already
  // completed and its fresh fetch already includes the same row.
  useEffect(() => {
    if (!pendingActivity) return;
    setActivities(prev => {
      const base = prev ?? [];
      if (base.some(a => a.id === pendingActivity.id)) return base;
      return [pendingActivity, ...base];
    });
  }, [pendingActivity]);

  useEffect(() => {
    if (!pendingNote) return;
    setNotes(prev => {
      const base = prev ?? [];
      if (base.some(n => n.id === pendingNote.id)) return base;
      return [...base, pendingNote];
    });
  }, [pendingNote]);

  const handleMentionAdd = (configId: number) => {
    setTaggedUserIds(prev => prev.includes(configId) ? prev : [...prev, configId]);
  };

  const handlePostNote = async () => {
    const body = noteDraft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/outreach/${companyId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, taggedUsers: taggedUserIds.length > 0 ? taggedUserIds.join(',') : null }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as ThreadNote;
      setNotes(prev => [...(prev ?? []), created]);
      setNoteDraft('');
      setTaggedUserIds([]);
    } catch {
      // best-effort — leave the draft text so the user can retry
    } finally {
      setPosting(false);
    }
  };

  const visibleActivities = (activities ?? []).filter(a => !attendeeFilter || a.attendeeId === attendeeFilter.id);
  const visibleNotes = (notes ?? []).filter(n => !attendeeFilter || n.attendeeId === attendeeFilter.id);
  const supersededIds = new Set(visibleActivities.map(a => a.supersededById).filter((id): id is string => !!id));

  return (
    <>
      {!isDesktop && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={handleClose} />
      )}
      <div
        style={isDesktop ? {
          transformOrigin: phase === 'closing' ? 'bottom' : 'top',
          transform: phase === 'open' ? 'scaleY(1)' : 'scaleY(0.05)',
          opacity: phase === 'open' ? 1 : 0,
          transition: `transform ${ANIMATION_MS}ms ease, opacity ${ANIMATION_MS}ms ease`,
        } : undefined}
        className={isDesktop
          ? 'border border-gray-200 rounded-xl bg-white overflow-hidden sticky top-4 flex flex-col max-h-[calc(100vh-6rem)]'
          : 'drawer-mobile-responsive fixed inset-x-0 bottom-0 z-50 h-[75vh] w-full rounded-t-2xl border border-gray-200 bg-white overflow-hidden flex flex-col'}
      >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-100">
        <div className="min-w-0">
          {attendeeFilter ? (
            <>
              <p className="text-sm font-semibold text-gray-700 truncate">{attendeeFilter.name}</p>
              {attendeeFilter.seniorityLabel && (
                <span className={`${getBadgeClass(attendeeFilter.seniorityLabel, colorMaps.seniority || {})} text-[10px] mt-0.5`}>
                  {attendeeFilter.seniorityLabel}
                </span>
              )}
            </>
          ) : (
            <p className="text-xs font-semibold text-gray-700 truncate">{companyName}</p>
          )}
        </div>
        <button type="button" onClick={handleClose} className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {attendeeFilter && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={handleCopyEmail}
            disabled={!attendeeFilter.email}
            title={attendeeFilter.email ? 'Copy email address' : 'No email on file'}
            className="w-7 h-7 rounded-full bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPhone(v => !v)}
              disabled={!attendeeFilter.phone}
              title={attendeeFilter.phone ? 'Show phone number' : 'No phone on file'}
              className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </button>
            {showPhone && attendeeFilter.phone && (
              <div className="absolute left-0 top-8 z-10 min-w-max rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
                <a href={`callto:${attendeeFilter.phone}`} className="text-xs font-medium text-brand-secondary hover:underline whitespace-nowrap">
                  {attendeeFilter.phone}
                </a>
              </div>
            )}
          </div>
          <a
            href={linkedinHref}
            target="_blank"
            rel="noopener noreferrer"
            title={attendeeFilter.linkedinUrl ? 'LinkedIn profile' : 'Search LinkedIn'}
            className="w-7 h-7 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill={attendeeFilter.linkedinUrl ? '#0A66C2' : '#9CA3AF'} aria-label="LinkedIn">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
        </div>
      )}

      <div className="flex border-b border-gray-100 flex-shrink-0">
        {(['timeline', 'notes'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors border-b-2 ${
              tab === t ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'timeline' && (
          <div className="p-3">
            {activities === null && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-5 h-5 border-2 border-brand-secondary border-t-transparent rounded-full" />
              </div>
            )}
            {activities !== null && visibleActivities.length === 0 && (
              <div className="text-center py-8">
                <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-xs text-gray-400">No outreach logged yet.</p>
              </div>
            )}
            {activities !== null && visibleActivities.length > 0 && (
              <div className="space-y-0">
                {visibleActivities.map((a, idx) => {
                  const superseded = supersededIds.has(a.id);
                  return (
                    <div key={a.id} className="flex gap-2.5">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1 ${DOT_COLOR[a.activityType]} ${superseded ? 'opacity-40' : ''}`} />
                        {idx < visibleActivities.length - 1 && <div className="w-px flex-1 bg-gray-200 my-0.5" />}
                      </div>
                      <div className={`pb-4 min-w-0 ${superseded ? 'line-through text-gray-400 decoration-gray-300' : ''}`}>
                        <p className="text-xs font-medium text-gray-700">{ACTIVITY_LABEL[a.activityType]}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {a.loggedByName}{a.attendeeName ? ` → ${a.attendeeName}` : ''}
                        </p>
                        {a.notes && <p className="text-[11px] text-gray-500 mt-0.5">{a.notes}</p>}
                        <p className="text-[10px] text-gray-300 mt-0.5">{relativeTime(a.loggedAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div className="p-3">
            {notes === null && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-5 h-5 border-2 border-brand-secondary border-t-transparent rounded-full" />
              </div>
            )}
            {notes !== null && visibleNotes.length === 0 && (
              <div className="text-center py-8">
                <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                <p className="text-xs text-gray-400">No notes yet. Add context for your team.</p>
              </div>
            )}
            {notes !== null && visibleNotes.length > 0 && (
              <div className="space-y-3">
                {visibleNotes.map(n => (
                  <div key={n.id} className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-secondary text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                      {n.userInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-gray-700">
                        {n.userName} <span className="font-normal text-gray-300">· {relativeTime(n.createdAt)}</span>
                      </p>
                      {n.activityType && (
                        <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLOR[n.activityType]}`} />
                          <span className="font-medium">{ACTIVITY_LABEL[n.activityType]}</span>
                        </p>
                      )}
                      <p className="text-xs text-gray-600 mt-0.5 break-words">{n.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {tab === 'notes' && (
        <div className="border-t border-gray-100 p-2.5 flex flex-col gap-1.5 flex-shrink-0">
          <MentionTextarea
            value={noteDraft}
            onChange={setNoteDraft}
            onMentionAdd={handleMentionAdd}
            userOptions={userOptions}
            rows={4}
            placeholder="Add a note… (type @ to mention a user)"
            className="input-field text-xs w-full py-1.5 resize-y min-h-[88px]"
          />
          <button
            type="button"
            onClick={handlePostNote}
            disabled={posting || !noteDraft.trim()}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50 self-end"
          >
            Post
          </button>
        </div>
      )}
      </div>
    </>
  );
}
