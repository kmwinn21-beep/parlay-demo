'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  loadConferenceNav, invalidateConferenceNav,
  type ConferenceOption, type ConferenceLoad,
} from '@/lib/conferenceNav';
import toast from 'react-hot-toast';
import { NewMeetingModal } from './NewMeetingModal';
import { NewNoteModal } from './NewNoteModal';
import { AssignFollowUpModal } from './AssignFollowUpModal';
import { NewRelationshipModal } from './NewRelationshipModal';
import { AgendaUploadModal } from './AgendaUploadModal';
import { TouchpointQuickModal } from './DashboardActionCard';
import { useClosedDealDraft } from '@/lib/ClosedDealDraftContext';
import { GlobalSearchModal } from './GlobalSearch';
import { useChatPanel } from './ChatPanelContext';
import { MessagingMenu } from './MessagingMenu';
import { NotificationBell } from './NotificationBell';
import { useFloatingNav } from './FloatingNavContext';
import { OutstandingFollowUps } from './OutstandingFollowUps';
import { useUser } from './UserContext';
import { useAppName } from '@/lib/useAppName';
import { useCapabilities } from '@/lib/useCapabilities';
import { clearActiveConferenceStorage } from '@/components/ActiveConferenceContext';
import { SetConferenceButton } from '@/components/SetConferenceButton';
import { MobileHeaderSearchBar } from '@/components/MobileHeaderSearchBar';
import { MobileMenuDrawer, MobileMenuSection } from '@/components/MobileMenuDrawer';
import { useIsPhone } from '@/lib/useIsPhone';
const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/conferences': 'Conferences',
  '/conferences/new': 'New Conference',
  '/attendees': 'Attendees',
  '/companies': 'Companies',
  '/admin': 'Admin Settings',
  '/follow-ups': 'Meetings & Follow Ups',
  '/relationships': 'Relationships',
  '/notifications': 'Notifications',
  '/auth/account': 'My Account',
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith('/conferences/') && pathname.split('/').length === 3) return 'Conference Details';
  if (pathname.startsWith('/attendees/')) return 'Attendee Details';
  if (pathname.startsWith('/companies/')) return 'Company Details';
  return process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';
}

function formatDateShort(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * " · day 2 of 4", for a conference that is on today.
 *
 * The one thing somebody standing in the hall opens this list to confirm, and
 * only ever shown against a conference whose dates already bracket today.
 * Empty where the dates cannot say — a single day needs no counting out, and
 * a bad pair of dates should go quiet rather than print "day -3 of 0".
 */
function conferenceDayOf(conf: { start_date: string; end_date: string }, today: string): string {
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const start = day(conf.start_date);
  const end = day(conf.end_date);
  const now = day(today);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now)) return '';
  const span = Math.round((end - start) / 86_400_000) + 1;
  const which = Math.round((now - start) / 86_400_000) + 1;
  if (span < 2 || which < 1 || which > span) return '';
  return ` · day ${which} of ${span}`;
}

// ─── Module-level conference pre-fetcher ────────────────────────────────────
// Starts the network request the instant this module is imported — before React
// mounts the Header component and before any useEffect can fire. The caching,
// and the rules for when a failed read is tried again, live in
// lib/conferenceNav.ts.
loadConferenceNav();
// ────────────────────────────────────────────────────────────────────────────

export function Header() {
  const pathname = usePathname();
  const { user } = useUser();
  const appName = useAppName();
  const { open: navOpen, setOpen: setNavOpen, setAnchor: setNavAnchor } = useFloatingNav();
  const markRef = useRef<HTMLButtonElement>(null);
  const { planCapabilities } = useCapabilities();
  const { panelOpen, setPanelOpen, totalUnread } = useChatPanel();
  const title = getPageTitle(pathname);
  const [showConferences, setShowConferences] = useState(false);
  // Initialise directly from cache — if the fetch already completed the
  // dropdown renders with data on the very first paint with no loading state.
  const [conferences, setConferences] = useState<ConferenceOption[]>([]);
  /**
   * The last load did not come back with a list.
   *
   * Kept apart from the list itself so the menu can say which of the two
   * empties it is looking at, and offer a retry for the one that has a point.
   */
  const [confsFailed, setConfsFailed] = useState(false);
  const [isLoadingConfs, setIsLoadingConfs] = useState(true);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showRelationshipModal, setShowRelationshipModal] = useState(false);
  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [showTouchpointsModal, setShowTouchpointsModal] = useState(false);
  const { openDeal: openClosedDeal } = useClosedDealDraft();
  const [showAddNew, setShowAddNew] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const messagingRef = useRef<HTMLDivElement>(null);
  const [uploadJob, setUploadJob] = useState<{ jobId: string; total: number; processed: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /** One place the three callers put a load's result, so they cannot differ. */
  const applyConferences = useCallback(({ conferences: list, failed }: ConferenceLoad) => {
    setConferences(list);
    setConfsFailed(failed);
    setIsLoadingConfs(false);
  }, []);

  /**
   * Throw the cache away and load again.
   *
   * What opening the menu does, and what the retry in it does. A fresh read is
   * the point of opening it — a conference created on another tab should be
   * there — and after a failure there is nothing cached to throw away anyway.
   */
  const refreshConferences = useCallback(() => {
    invalidateConferenceNav();
    setIsLoadingConfs(true);
    loadConferenceNav().then(applyConferences);
  }, [applyConferences]);
  const addNewRef = useRef<HTMLDivElement>(null);
  const isPhone = useIsPhone();

  /*
   * The eight things that can be added, said once.
   *
   * They were eight all-but-identical blocks of markup, and now they are
   * drawn twice — a list in the desktop panel, rows with a line of
   * explanation each in the phone drawer — so one list is the only way the
   * two can agree. The hint is the phone's: the panel has no width for it.
   *
   * `group` is where the day splits. Note, Meeting, Follow Up and Touchpoints
   * are taken standing up with a phone in one hand; the other four are desk
   * work, and on a phone they sit below a line saying so.
   */
  const ADD_NEW_ITEMS: Array<{
    key: string;
    label: string;
    hint: string;
    group: 'there' | 'desk';
    tint: string;
    icon: ReactNode;
    href?: string;
    run?: () => void;
  }> = [
    {
      key: 'note', label: 'Note', group: 'there', tint: 'bg-yellow-100 text-yellow-800',
      hint: 'What was said, against a company or an attendee',
      run: () => setShowNoteModal(true),
      icon: (
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
    {
      key: 'meeting', label: 'Meeting', group: 'there', tint: 'bg-violet-100 text-violet-700',
      hint: 'Booked ahead, or logged after the fact',
      run: () => setShowMeetingModal(true),
      icon: (
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      key: 'follow-up', label: 'Follow Up', group: 'there', tint: 'bg-amber-100 text-amber-700',
      hint: 'Something owed to someone, with a date on it',
      run: () => setShowFollowUpModal(true),
      icon: (
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      key: 'touchpoints', label: 'Touchpoints', group: 'there', tint: 'bg-teal-100 text-teal-700',
      hint: 'Brief or informal attendee interaction(s)',
      run: () => setShowTouchpointsModal(true),
      icon: (
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      ),
    },
    {
      key: 'relationship', label: 'Relationship', group: 'desk', tint: 'bg-indigo-100 text-indigo-700',
      hint: 'Who works with whom, and in what way',
      run: () => setShowRelationshipModal(true),
      icon: (
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
    },
    {
      key: 'conference', label: 'Conference', group: 'desk', tint: 'bg-blue-100 text-blue-700',
      hint: 'A new one on the calendar, with its dates',
      href: '/conferences/new',
      icon: (
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      key: 'agenda', label: 'Agenda', group: 'desk', tint: 'bg-slate-200 text-slate-600',
      hint: 'A session or a slot on a conference’s programme',
      run: () => setShowAgendaModal(true),
      icon: (
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      key: 'closed-deal', label: 'Closed / Won Deal', group: 'desk', tint: 'bg-emerald-100 text-emerald-700',
      hint: 'Where it landed, and what it was worth',
      run: () => openClosedDeal(),
      icon: (
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
    },
  ];

  /*
   * The conference list, drawn by both the desktop panel and the phone
   * drawer.
   *
   * In progress first, then what is coming, then what is done — and on a
   * phone the running one says which day of it today is, which is the one
   * thing somebody standing at a conference opens this to confirm.
   */
  const conferenceList = (mobile: boolean) => {
    if (isLoadingConfs) {
      return (
        <div className="flex justify-center py-6">
          <div className="animate-spin w-5 h-5 border-2 border-brand-secondary border-t-transparent rounded-full" />
        </div>
      );
    }
    /* Said out loud rather than shown as an empty list. The request not
       arriving and the account having nothing in it are different facts, and
       only one of them is worth a retry button. */
    if (confsFailed) {
      return (
        <div className="px-4 py-5 text-center">
          <p className="text-sm text-gray-500">Couldn&rsquo;t load conferences.</p>
          <button
            type="button"
            onClick={refreshConferences}
            className="mt-2 text-sm font-semibold text-brand-secondary hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }
    if (conferences.length === 0) {
      return <p className="text-sm text-gray-400 text-center py-4">No conferences found.</p>;
    }

    const today = new Date().toISOString().slice(0, 10);
    const userDisplayName = user?.displayName?.trim().toLowerCase() ?? null;
    const isUserAttendee = (conf: ConferenceOption) => {
      if (!userDisplayName || !conf.internal_attendees) return false;
      return conf.internal_attendees.split(',').some(a => a.trim().toLowerCase() === userDisplayName);
    };

    const inProgress = conferences
      .filter(c => c.start_date <= today && c.end_date >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const upcoming = conferences
      .filter(c => c.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const past = conferences
      .filter(c => c.end_date < today)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));

    const groups = [
      { label: 'In Progress', items: inProgress },
      { label: 'Upcoming',    items: upcoming },
      { label: 'Past',        items: past },
    ].filter(g => g.items.length > 0);

    const dot = (conf: ConferenceOption) => isUserAttendee(conf) && (
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: 'rgb(var(--brand-accent-rgb))' }}
      />
    );

    const renderConf = (conf: ConferenceOption) => (
      <Link
        key={conf.id}
        href={`/conferences/${conf.id}`}
        onClick={() => setShowConferences(false)}
        className={mobile
          ? 'w-full text-left px-4 py-3 flex items-center gap-2.5 border-b border-gray-100 last:border-0 active:bg-gray-50'
          : 'w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 border-b border-gray-50 last:border-0'}
      >
        {mobile ? (
          <>
            {dot(conf) || <span className="w-2 flex-shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-brand-primary truncate">{conf.name}</span>
              {conf.start_date <= today && conf.end_date >= today && (
                <span className="block text-[11.5px] font-medium text-green-700">
                  On now{conferenceDayOf(conf, today)}
                </span>
              )}
            </span>
            <span className="text-xs font-medium text-gray-400 flex-shrink-0">{formatDateShort(conf.start_date)}</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2 min-w-0">
              {dot(conf)}
              <span className="text-sm font-medium text-gray-800 truncate">{conf.name}</span>
            </span>
            <span className="text-xs text-gray-400 flex-shrink-0">{formatDateShort(conf.start_date)}</span>
          </>
        )}
      </Link>
    );

    return groups.map(({ label, items }) => (
      <div key={label}>
        {mobile ? <MobileMenuSection label={label} sticky /> : (
          <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
          </div>
        )}
        {items.map(renderConf)}
      </div>
    ));
  };

  // Re-fetch the conference list on every route change so that after a
  // conference is created or deleted the nav dropdown stays accurate.
  useEffect(() => {
    loadConferenceNav().then(applyConferences);
  }, [pathname, applyConferences]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowConferences(false);
      }
      if (addNewRef.current && !addNewRef.current.contains(e.target as Node)) {
        setShowAddNew(false);
      }
    }
    if (showConferences || showAddNew) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showConferences, showAddNew]);

  // Cmd+K / Ctrl+K opens global search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(v => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Poll for background upload job progress
  useEffect(() => {
    const check = async () => {
      const stored = localStorage.getItem('upload_job_in_progress');
      if (!stored) { setUploadJob(null); return; }
      try {
        const parsed = JSON.parse(stored);
        const res = await fetch(`/api/upload-jobs/${parsed.jobId}`).catch(() => null);
        if (!res?.ok) return;
        const data = await res.json();
        if (data.status === 'done' || data.status === 'error') {
          localStorage.removeItem('upload_job_in_progress');
          setUploadJob(null);
        } else {
          setUploadJob({ jobId: parsed.jobId, total: parsed.totalRows ?? data.total_rows ?? 0, processed: Number(data.processed_rows ?? 0) });
        }
      } catch {
        // non-fatal
      }
    };
    check();
    const t = setInterval(check, 25_000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      clearActiveConferenceStorage();
      const clerkSignOut = (window as Window & { Clerk?: { signOut: (o: { redirectUrl: string }) => Promise<void> } }).Clerk?.signOut;
      if (clerkSignOut) {
        await clerkSignOut({ redirectUrl: '/auth/login' });
      } else {
        window.location.href = '/auth/login';
      }
    } catch {
      toast.error('Logout failed.');
    }
  };

  return (
    <header data-app-header className="header-mobile-dark relative bg-brand-primary lg:bg-white border-b border-transparent lg:border-gray-200 rounded-b-3xl lg:rounded-none min-h-[85px] lg:min-h-0 px-4 lg:px-6 py-3 flex items-center justify-between flex-shrink-0">
      {/* `contents` on phones: the letter mark becomes a direct flex child of the
          header, so the row's space-between distributes it and every icon with
          one equal gap. Restored to a block from sm up, where the app name sits
          beneath the mark and would otherwise be scattered into the icon row. */}
      <div className="contents sm:block">
        <h1 className="hidden lg:block text-xl font-semibold text-brand-primary font-serif">{title}</h1>
        {/* Always the Parlay brand mark on mobile, regardless of any tenant favicon
            configured in Brand settings (that customization only applies elsewhere). */}
        {/* The mark opens the floating nav rather than linking to the
            dashboard — Dashboard is the menu's first item, so nothing is lost.
            It publishes its own rectangle so the menu can be laid out around
            it; FloatingNav has no other way to know where its trigger is. */}
        <button
          ref={markRef}
          type="button"
          title="Menu"
          aria-label="Menu"
          aria-expanded={navOpen}
          onClick={() => {
            const rect = markRef.current?.getBoundingClientRect();
            if (rect) setNavAnchor({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
            setNavOpen(v => !v);
          }}
          className={`header-bar-btn lg:hidden order-last sm:order-none flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors ${navOpen ? 'header-bar-btn-active' : ''}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={navOpen ? '/favicon.png' : '/WhiteLetterMarkParlay.png'}
            alt="Parlay"
            className="header-bar-mark h-8 w-8 object-contain"
          />
        </button>
        <p className="text-xs text-white/70 lg:text-gray-500 hidden sm:block">{appName}</p>
      </div>
      <div className="contents sm:flex sm:items-center sm:gap-2">
        {/* Set Active Conference — desktop only */}
        <div className="hidden lg:block">
          <SetConferenceButton />
        </div>
        {/* Background upload progress pill */}
        {uploadJob && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700 flex-shrink-0">
            <svg className="animate-spin h-3 w-3 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>
              Uploading
              {uploadJob.total > 0 && ` ${Math.min(99, Math.round((uploadJob.processed / uploadJob.total) * 100))}%`}
            </span>
            <button
              type="button"
              onClick={() => { localStorage.removeItem('upload_job_in_progress'); setUploadJob(null); }}
              className="text-blue-400 hover:text-blue-600 ml-0.5 leading-none"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {/* Notification Bell */}
        <NotificationBell />
        {/* Outstanding Follow Ups */}
        <OutstandingFollowUps />
        {/* Add New Dropdown */}
        <div className="relative" ref={addNewRef}>
          <button
            type="button"
            onClick={() => setShowAddNew(prev => !prev)}
            className={`flex items-center gap-2 px-2 lg:px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors ${showAddNew ? 'header-bar-btn-active' : ''}`}
            title="Add New"
          >
            <svg className="header-bar-icon w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium text-brand-primary hidden lg:block">Add New</span>
            <svg className={`header-bar-icon hidden lg:block w-3.5 h-3.5 text-gray-400 transition-transform ${showAddNew ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showAddNew && !isPhone && (
            <div className="hidden sm:block absolute right-0 top-full mt-1 w-56 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl z-[100] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Add New</p>
              </div>
              <div>
                {ADD_NEW_ITEMS.map(item => {
                  const body = (
                    <>
                      <span className="w-[18px] h-[18px] text-brand-primary flex-shrink-0">{item.icon}</span>
                      <span className="text-sm font-medium text-gray-800">{item.label}</span>
                    </>
                  );
                  const cls = 'w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center gap-3 border-b border-gray-50 last:border-0';
                  return item.href ? (
                    <Link key={item.key} href={item.href} onClick={() => setShowAddNew(false)} className={cls}>{body}</Link>
                  ) : (
                    <button key={item.key} type="button" onClick={() => { setShowAddNew(false); item.run?.(); }} className={cls}>{body}</button>
                  );
                })}
              </div>
            </div>
          )}
          {/* ── The same eight, as a phone drawer ──

              The width buys each one the line that says what it is for, which
              a 224px panel could not hold, and splits them where the day
              splits: the four taken standing up at a conference, then the four
              that are desk work. */}
          {showAddNew && isPhone && (
            <MobileMenuDrawer title="Add new" onClose={() => setShowAddNew(false)}>
              {(['there', 'desk'] as const).map(group => (
                <div key={group}>
                  <MobileMenuSection label={group === 'there' ? 'While you are there' : 'Back at the desk'} />
                  {ADD_NEW_ITEMS.filter(i => i.group === group).map(item => {
                    const body = (
                      <>
                        <span className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${item.tint}`}>
                          <span className="w-[19px] h-[19px]">{item.icon}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-brand-primary">{item.label}</span>
                          <span className="block mt-0.5 text-[11.5px] leading-snug text-gray-500">{item.hint}</span>
                        </span>
                      </>
                    );
                    const cls = 'w-full text-left px-4 py-3 flex items-center gap-3 border-b border-gray-100 last:border-0 active:bg-gray-50';
                    return item.href ? (
                      <Link key={item.key} href={item.href} onClick={() => setShowAddNew(false)} className={cls}>{body}</Link>
                    ) : (
                      <button key={item.key} type="button" onClick={() => { setShowAddNew(false); item.run?.(); }} className={cls}>{body}</button>
                    );
                  })}
                </div>
              ))}
            </MobileMenuDrawer>
          )}
        </div>
        {/* Conference Navigator */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => {
              const opening = !showConferences;
              setShowConferences(opening);
              if (opening) refreshConferences();
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors ${showConferences ? 'header-bar-btn-active' : ''}`}
            title="Go to conference"
          >
            <svg className="header-bar-icon w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium text-brand-primary hidden sm:block">Go To</span>
            <svg className={`header-bar-icon hidden lg:block w-3.5 h-3.5 text-gray-400 transition-transform ${showConferences ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showConferences && !isPhone && (
            <div className="hidden sm:block absolute right-0 top-full mt-1 w-72 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl z-[100] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Go to Conference</p>
              </div>
              <div className="max-h-72 overflow-y-auto">{conferenceList(false)}</div>
            </div>
          )}
          {/* ── The same list, as a phone drawer ──

              Forty conferences in a 288px panel pinned to one corner, inside
              a page that is itself scrolling. Here they get the width for a
              name and a date, rows a thumb can hit, and headings that stay
              put while their own group runs under them. */}
          {showConferences && isPhone && (
            <MobileMenuDrawer
              title="Go to conference"
              subtitle={
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{ backgroundColor: 'rgb(var(--brand-accent-rgb))' }}
                  />
                  marks the ones you are attending
                </span>
              }
              onClose={() => setShowConferences(false)}
            >
              {conferenceList(true)}
            </MobileMenuDrawer>
          )}
        </div>
        {/* Global Search — mobile only, to the right of "Go to conference"; desktop uses the button above */}
        <button
          type="button"
          onClick={() => setMobileSearchOpen(true)}
          className="header-bar-btn lg:hidden order-first sm:order-none flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors"
          title="Search"
        >
          <svg className="header-bar-icon w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* Admin Panel — administrators only, and only between sm and lg. On a
            phone in landscape this is the sole way into Admin Settings; desktop
            reaches it from the sidebar, so the header doesn't repeat it. */}
        {user?.role === 'administrator' && (
          <Link
            href="/admin"
            className={`hidden sm:flex lg:hidden items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors ${pathname === '/admin' ? 'bg-gray-100 header-bar-btn-active' : ''}`}
            title="Admin Settings"
          >
            <svg className="header-bar-icon w-4 h-4 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium text-brand-primary hidden sm:block">Admin</span>
          </Link>
        )}

        {/* Messaging — desktop only; mobile opens the same menu as a sheet from
            the FloatingNav. The menu hangs off this icon, and picking a thread
            hands off to the chat drawer. */}
        <div ref={messagingRef} className="relative hidden lg:block">
          <button
            type="button"
            aria-label="Messaging"
            onClick={() => setPanelOpen(!panelOpen)}
            className={`relative flex p-2 rounded-lg transition-colors ${panelOpen ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
            title="Messaging"
          >
            <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 border border-white text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>
          {panelOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPanelOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[460px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden z-50">
                <MessagingMenu onClose={() => setPanelOpen(false)} />
              </div>
            </>
          )}
        </div>

        {/* Global Search — desktop only, to the right of messaging; mobile uses
            the icon above and FloatingNav. */}
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          className="hidden lg:flex items-center gap-1.5 px-2 lg:px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="Search (⌘K)"
        >
          <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-sm font-medium text-brand-primary hidden lg:block">Search</span>
        </button>

        {/* User menu — hidden on mobile */}
        {user && (
          <div className="hidden sm:flex items-center gap-1">
            <Link
              href="/auth/account"
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              title={user.email}
            >
              <div className="w-7 h-7 rounded-full bg-brand-secondary flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">
                  {user.email.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium text-brand-primary hidden md:block max-w-[140px] truncate">
                {user.displayName ?? user.repName ?? user.email.split('@')[0]}
              </span>
            </Link>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-red-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {mobileSearchOpen && (
        <MobileHeaderSearchBar onClose={() => setMobileSearchOpen(false)} />
      )}
      <NewMeetingModal isOpen={showMeetingModal} onClose={() => setShowMeetingModal(false)} />
      <NewNoteModal isOpen={showNoteModal} onClose={() => setShowNoteModal(false)} />
      <AssignFollowUpModal isOpen={showFollowUpModal} onClose={() => setShowFollowUpModal(false)} onSuccess={() => {}} />
      <NewRelationshipModal isOpen={showRelationshipModal} onClose={() => setShowRelationshipModal(false)} />
      {showAgendaModal && <AgendaUploadModal onClose={() => setShowAgendaModal(false)} />}
      {showTouchpointsModal && <TouchpointQuickModal onClose={() => setShowTouchpointsModal(false)} />}
      {showSearch && <GlobalSearchModal onClose={() => setShowSearch(false)} />}
    </header>
  );
}
