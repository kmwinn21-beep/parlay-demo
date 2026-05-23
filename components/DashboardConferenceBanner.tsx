'use client';

import { useState } from 'react';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TodayMeeting {
  id: number;
  meeting_time: string;
  outcome: string | null;
  location: string | null;
  attendee_first_name: string;
  attendee_last_name: string;
  company_name: string | null;
}

export interface ActiveStats {
  companiesEngaged: number;
  meetingsHeld: number;
  touchpoints: number;
  mustTargetUnengaged: number;
}

export interface PrepChecklist {
  attendeesUploaded: boolean;
  icpConfigured: boolean;
  targetsSet: boolean;
  preConferenceReview: boolean;
  meetingsScheduled: boolean;
}

export interface ConferenceInfo {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string | null;
}

export type BannerData =
  | { state: 'active'; conference: ConferenceInfo; dayNumber: number; totalDays: number; stats: ActiveStats; todayMeetings: TodayMeeting[] }
  | { state: 'upcoming'; conference: ConferenceInfo; daysUntil: number; attendeeCount: number; mustTargetCount: number; prepChecklist: PrepChecklist }
  | { state: 'none' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = end.getFullYear();
  return `${startStr} – ${endStr}, ${year}`;
}

function getMeetingStatus(outcome: string | null): { label: string; className: string } {
  if (!outcome) return { label: 'Scheduled', className: 'bg-white/15 text-white/80' };
  const lower = outcome.toLowerCase();
  if (lower.includes('held') || lower.includes('completed')) return { label: 'Held', className: 'bg-teal-500/30 text-teal-200' };
  if (lower.includes('cancel')) return { label: 'Cancelled', className: 'bg-red-500/30 text-red-200' };
  return { label: outcome, className: 'bg-white/15 text-white/80' };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-white/60 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function BannerStateActive({ data, collapsed, onToggle }: {
  data: Extract<BannerData, { state: 'active' }>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-brand-primary rounded-2xl p-6 text-white h-full flex flex-col">
      {/* Collapsed header — always visible */}
      <div className="cursor-pointer flex items-center justify-between" onClick={onToggle}>
        <div>
          <p className="text-white/60 text-xs font-medium">Today · Day {data.dayNumber} of {data.totalDays}</p>
          <h1 className="text-2xl font-bold font-serif">{data.conference.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {collapsed && (
            <>
              <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white">{data.todayMeetings.length} meetings</span>
              {data.stats.mustTargetUnengaged > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-red-500/30 text-red-200">{data.stats.mustTargetUnengaged} unengaged</span>
              )}
            </>
          )}
          <ChevronIcon collapsed={collapsed} />
        </div>
      </div>

      {/* Expanded content */}
      {!collapsed && (
        <div className="mt-4 flex-1 flex flex-col">
          {/* Quick stats row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Companies', value: data.stats.companiesEngaged, className: 'text-white' },
              { label: 'Meetings Held', value: data.stats.meetingsHeld, className: 'text-white' },
              { label: 'Touchpoints', value: data.stats.touchpoints, className: 'text-white' },
              { label: 'Unengaged', value: data.stats.mustTargetUnengaged, className: data.stats.mustTargetUnengaged > 0 ? 'text-red-300' : 'text-white' },
            ].map(stat => (
              <div key={stat.label} className="bg-white/10 rounded-xl p-3 text-center">
                <p className={`text-2xl font-bold ${stat.className}`}>{stat.value}</p>
                <p className="text-white/60 text-[10px] font-medium mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Today's meetings */}
          <div className="bg-white/10 rounded-xl p-3 mt-3">
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-2">Your Meetings Today</p>
            {data.todayMeetings.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-2">No meetings scheduled for today</p>
            ) : (
              <div className="space-y-2">
                {data.todayMeetings.map(meeting => {
                  const status = getMeetingStatus(meeting.outcome);
                  return (
                    <div key={meeting.id} className="flex items-center gap-2">
                      <span className="text-white/50 text-xs w-12 flex-shrink-0">{meeting.meeting_time}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm truncate">
                          {meeting.attendee_first_name} {meeting.attendee_last_name}
                          {meeting.company_name ? ` · ${meeting.company_name}` : ''}
                        </p>
                        {meeting.location && (
                          <p className="text-white/50 text-xs truncate">{meeting.location}</p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Must target nudge */}
          {data.stats.mustTargetUnengaged > 0 && (
            <div className="flex items-center gap-2 mt-3 bg-red-500/20 rounded-xl px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
              <p className="text-sm text-red-200 flex-1">
                {data.stats.mustTargetUnengaged} Must Target companies not yet engaged
              </p>
              <Link href={`/conferences/${data.conference.id}`} className="text-xs text-red-300 hover:text-white underline flex-shrink-0">
                View targets →
              </Link>
            </div>
          )}

          {/* All-clear state */}
          {data.stats.mustTargetUnengaged === 0 && data.todayMeetings.length === 0 && (
            <p className="text-white/50 text-sm text-center mt-3">You&apos;re all caught up for today ✓</p>
          )}
        </div>
      )}
    </div>
  );
}

function BannerStateUpcoming({ data, collapsed, onToggle }: {
  data: Extract<BannerData, { state: 'upcoming' }>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const checklistItems: { key: keyof PrepChecklist; label: string; href: string }[] = [
    { key: 'attendeesUploaded', label: 'Attendees uploaded', href: `/conferences/${data.conference.id}` },
    { key: 'icpConfigured', label: 'ICP configured', href: '/admin?tab=icp' },
    { key: 'targetsSet', label: 'Targets set', href: `/conferences/${data.conference.id}` },
    { key: 'preConferenceReview', label: 'Pre-conference review', href: `/conferences/${data.conference.id}` },
    { key: 'meetingsScheduled', label: 'Meetings scheduled', href: `/conferences/${data.conference.id}` },
  ];

  const doneCount = Object.values(data.prepChecklist).filter(Boolean).length;
  const allDone = doneCount === 5;

  return (
    <div className="bg-brand-primary rounded-2xl p-6 text-white h-full flex flex-col">
      {/* Collapsed header — always visible */}
      <div className="cursor-pointer flex items-center justify-between" onClick={onToggle}>
        <div>
          <p className="text-white/60 text-xs font-medium">{data.daysUntil} days away</p>
          <h1 className="text-2xl font-bold font-serif">{data.conference.name}</h1>
          <p className="text-white/60 text-sm mt-0.5">
            {formatDateRange(data.conference.start_date, data.conference.end_date)}
            {data.conference.location ? ` · ${data.conference.location}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {collapsed && (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-400/30 text-amber-200 text-center">
              {doneCount}/5 Done
            </span>
          )}
          <ChevronIcon collapsed={collapsed} />
        </div>
      </div>

      {/* Expanded content */}
      {!collapsed && (
        <div className="mt-4 flex-1 flex flex-col">
          {/* Prep checklist */}
          <div className="bg-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/70 text-xs font-semibold">Conference prep</p>
              <span className={`text-xs font-semibold ${allDone ? 'text-teal-300' : 'text-amber-300'}`}>
                {doneCount}/5 complete
              </span>
            </div>
            <div className="space-y-2">
              {checklistItems.map(item => {
                const done = data.prepChecklist[item.key];
                return (
                  <div key={item.key} className="flex items-center gap-2.5">
                    <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${done ? 'bg-teal-500' : 'border-2 border-dashed border-white/30'}`}>
                      {done && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`flex-1 text-sm ${done ? 'line-through text-white/40' : 'text-white'}`}>
                      {item.label}
                    </span>
                    {!done && (
                      <Link href={item.href} className="text-xs text-white/50 hover:text-white flex-shrink-0">
                        →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-white">{data.attendeeCount}</p>
              <p className="text-white/60 text-[10px] font-medium mt-0.5">Attendees</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className={`text-2xl font-bold ${data.mustTargetCount > 0 ? 'text-red-300' : 'text-white'}`}>{data.mustTargetCount}</p>
              <p className="text-white/60 text-[10px] font-medium mt-0.5">Must Target</p>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex gap-3 mt-4">
            <Link
              href={`/conferences/${data.conference.id}`}
              className="flex-1 text-center bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Pre-conference review
            </Link>
            <Link
              href={`/conferences/${data.conference.id}`}
              className="flex-1 text-center bg-brand-highlight text-brand-primary font-bold rounded-lg px-4 py-2 text-sm transition-opacity hover:opacity-90"
            >
              Schedule meetings →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function BannerStateNone() {
  return (
    <div className="bg-brand-primary rounded-2xl p-8 text-white text-center h-full flex flex-col items-center justify-center">
      <h2 className="text-xl font-bold font-serif mb-2">No upcoming conferences</h2>
      <p className="text-white/60 text-sm mb-5">Add your first conference to start tracking meetings, contacts, and pipeline influence.</p>
      <Link
        href="/conferences/new"
        className="inline-flex items-center gap-2 bg-brand-highlight text-brand-primary font-bold rounded-lg px-5 py-2.5 text-sm hover:opacity-90 transition-opacity"
      >
        Add your first conference →
      </Link>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function DashboardConferenceBanner({ bannerData }: { bannerData: BannerData }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('parlay_banner_collapsed') === 'true';
  });

  const toggle = () => {
    setCollapsed(v => {
      const next = !v;
      localStorage.setItem('parlay_banner_collapsed', String(next));
      return next;
    });
  };

  if (bannerData.state === 'none') return <BannerStateNone />;
  if (bannerData.state === 'active') return <BannerStateActive data={bannerData} collapsed={collapsed} onToggle={toggle} />;
  return <BannerStateUpcoming data={bannerData} collapsed={collapsed} onToggle={toggle} />;
}
