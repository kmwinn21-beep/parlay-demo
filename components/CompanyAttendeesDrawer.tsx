'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { effectiveSeniority } from '@/lib/parsers';
import { useConfigColors } from '@/lib/useConfigColors';
import { getBadgeClass, getPillClass, getPreset } from '@/lib/colors';
import { useUserOptions, parseRepIds, getRepInitials } from '@/lib/useUserOptions';
import { useCapabilities } from '@/lib/useCapabilities';
import { ActivityTimelineModal } from './ActivityTimelineModal';

export interface CompanyAttendeeLite {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  seniority?: string;
  function?: string;
  company_type?: string;
  company_name?: string;
  company_id?: number;
  company_assigned_user?: string;
  email?: string;
  linkedin_url?: string;
}

interface Props {
  companyId: number;
  companyName: string;
  // e.g. "ModExpo 2026" — when provided, the header reads "[Company] - [Conference] Attendees"
  conferenceLabel?: string;
  attendees: CompanyAttendeeLite[];
  onClose: () => void;
}

interface TimelineActivity {
  meetings: unknown[];
  followUps: unknown[];
  touchpoints: unknown[];
  hostedEvents: unknown[];
  firstContacts: unknown[];
}

function AttendeeMiniCard({ attendee }: { attendee: CompanyAttendeeLite }) {
  const colorMaps = useConfigColors();
  const userOptionsFull = useUserOptions();
  const seniority = effectiveSeniority(attendee.seniority, attendee.title);
  const initials = `${attendee.first_name?.[0] ?? ''}${attendee.last_name?.[0] ?? ''}`.toUpperCase();
  const repUsers = parseRepIds(attendee.company_assigned_user ?? '').map(id => userOptionsFull.find(u => u.id === id)).filter(Boolean);

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-brand-primary flex items-center justify-center text-white text-sm font-bold font-serif flex-shrink-0">
          {initials || '?'}
        </div>
        <div className="min-w-0">
          <Link href={`/attendees/${attendee.id}`} className="text-sm font-bold text-brand-primary hover:text-brand-secondary hover:underline">
            {attendee.first_name} {attendee.last_name}
          </Link>
          {attendee.title && <p className="text-xs text-gray-600 mt-0.5 truncate">{attendee.title}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {attendee.title && <span className={`badge ${getPillClass(seniority, colorMaps.seniority || {})}`}>{seniority}</span>}
            {attendee.function && <span className={`badge ${getPillClass(attendee.function, colorMaps.function || {})}`}>{attendee.function}</span>}
            {attendee.company_type && <span className={getBadgeClass(attendee.company_type, colorMaps.company_type || {})}>{attendee.company_type}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Company</p>
          {attendee.company_name ? (
            attendee.company_id ? (
              <Link href={`/companies/${attendee.company_id}`} className="text-sm font-medium text-gray-800 hover:text-brand-secondary hover:underline">{attendee.company_name}</Link>
            ) : <p className="text-sm font-medium text-gray-800">{attendee.company_name}</p>
          ) : <p className="text-sm text-gray-400">—</p>}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Assigned Rep(s)</p>
          <div className="flex flex-wrap gap-1">
            {repUsers.length > 0 ? repUsers.map((user, i) => (
              <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                  <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                </svg>
                {getRepInitials(user!.value)}
              </span>
            )) : <p className="text-sm text-gray-400">—</p>}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email</p>
          {attendee.email ? (
            <div className="flex items-center gap-2">
              <a href={`mailto:${attendee.email}`} className="text-sm text-brand-secondary hover:underline truncate" title={attendee.email}>
                {attendee.email}
              </a>
              <button
                type="button"
                title="Copy email"
                onClick={() => {
                  navigator.clipboard.writeText(attendee.email!)
                    .then(() => toast.success('Email copied to clipboard.'))
                    .catch(() => toast.error('Failed to copy email.'));
                }}
                className="flex-shrink-0 text-gray-400 hover:text-brand-secondary transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          ) : <p className="text-sm text-gray-400">—</p>}
        </div>
      </div>
    </div>
  );
}

function TimelineIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="2" y1="10" x2="18" y2="10" /><circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="10" cy="13" r="1.5" fill="currentColor" stroke="none" /><circle cx="14" cy="5" r="1.5" fill="currentColor" stroke="none" /><line x1="6" y1="10" x2="6" y2="6" strokeWidth="1.4" /><line x1="10" y1="10" x2="10" y2="13" strokeWidth="1.4" /><line x1="14" y1="10" x2="14" y2="5" strokeWidth="1.4" />
    </svg>
  );
}

export function CompanyAttendeesDrawer({ companyId, companyName, conferenceLabel, attendees, onClose }: Props) {
  const { planCapabilities } = useCapabilities();
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(true);
  const [hasActivity, setHasActivity] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    fetch(`/api/companies/${companyId}/activity-timeline`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: { activity?: TimelineActivity } | null) => {
        if (cancelled) return;
        const a = data?.activity;
        setHasActivity(Boolean(a) && (
          a!.meetings.length > 0 || a!.followUps.length > 0 || a!.touchpoints.length > 0 ||
          a!.hostedEvents.length > 0 || a!.firstContacts.length > 0
        ));
      })
      .catch(() => { if (!cancelled) setHasActivity(false); })
      .finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  const capabilityEnabled = Boolean(planCapabilities?.intelligence_core?.activity_timeline);

  const content = (
    <div className="fixed inset-0 z-50">
      {/* Backdrop — shared by both the attendees drawer and the docked timeline; closes both */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Attendee drawer — slides up from the bottom on mobile, in from the right on desktop.
          When the timeline is open on desktop, it moves to anchor against the left sidebar
          instead of sitting flush against the timeline drawer. Hidden on mobile while the
          timeline is open (no room for both side by side). */}
      <div
        className={`drawer-mobile-responsive fixed inset-x-0 bottom-0 sm:inset-y-0 sm:inset-x-auto ${timelineOpen ? 'sm:left-64' : 'sm:right-0'} h-[85vh] sm:h-auto w-full sm:w-[480px] bg-white shadow-2xl overflow-hidden rounded-t-2xl sm:rounded-t-none ${timelineOpen ? 'hidden sm:flex sm:rounded-tr-2xl' : 'flex sm:rounded-tl-2xl'} flex-col`}
      >
        <div
          className="flex-shrink-0 px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'rgb(var(--brand-primary-rgb))' }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-0.5">{attendees.length} Attendee{attendees.length === 1 ? '' : 's'}</p>
            {(() => {
              const title = conferenceLabel ? `${companyName} - ${conferenceLabel} Attendees` : companyName;
              return <h2 className="text-base font-bold text-white leading-snug truncate" title={title}>{title}</h2>;
            })()}
          </div>
          <button type="button" onClick={onClose} className="flex-shrink-0 text-white/70 hover:text-white transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {capabilityEnabled && (
            activityLoading ? (
              <div className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-400">
                <svg className="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading Recent Activity
              </div>
            ) : hasActivity ? (
              <button
                type="button"
                onClick={() => setTimelineOpen(true)}
                title="View Activity Timeline"
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors text-sm font-medium text-brand-secondary"
              >
                <TimelineIcon className="w-4 h-4 flex-shrink-0" />
                View Activity Timeline
              </button>
            ) : (
              <div className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-400">
                <TimelineIcon className="w-4 h-4 flex-shrink-0" />
                No activity found for {companyName}.
              </div>
            )
          )}
          {attendees.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No attendees at this conference.</p>
          ) : attendees.map(a => <AttendeeMiniCard key={a.id} attendee={a} />)}
        </div>
      </div>

      {/* Activity timeline — always anchored flush to the right edge, independent of the
          attendee drawer's position. pointer-events-none on the full-screen wrapper lets
          clicks outside the panel itself fall through to the shared backdrop above. */}
      {timelineOpen && (
        <div className="fixed inset-0 flex items-end sm:items-stretch sm:justify-end pointer-events-none">
          <div className="pointer-events-auto w-full sm:w-auto">
            <ActivityTimelineModal
              isOpen={timelineOpen}
              onClose={() => setTimelineOpen(false)}
              companyId={companyId}
              companyName={companyName}
              variant="docked"
              defaultWidth={750}
            />
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
