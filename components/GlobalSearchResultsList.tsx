'use client';

import Link from 'next/link';
import { useMeetingNotesDrawer } from '@/lib/MeetingNotesDrawerContext';
import { QuickViewIcon, type QuickViewTarget } from './QuickViewDrawer';
import { totalResultCount, type SearchResults } from '@/lib/useGlobalSearch';

function PersonIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function EventIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}
function MeetingIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function FollowUpIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ResultRow({ href, onClick, icon, iconBg, name, subtitle, quickView, onQuickView }: {
  href: string;
  onClick: () => void;
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  subtitle: string | null;
  quickView?: QuickViewTarget;
  onQuickView?: (target: QuickViewTarget) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors"
    >
      <div className={`w-7 h-7 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
        {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
      </div>
      {quickView && onQuickView && (
        <QuickViewIcon onClick={() => onQuickView(quickView)} />
      )}
    </Link>
  );
}

interface Props {
  results: SearchResults;
  loading: boolean;
  searched: boolean;
  query: string;
  onClose: () => void;
  onQuickView: (target: QuickViewTarget) => void;
}

export function GlobalSearchResultsList({ results, loading, searched, query, onClose, onQuickView }: Props) {
  const { openMeetingNotes } = useMeetingNotesDrawer();
  const hasResults = totalResultCount(results) > 0;
  const isShortQuery = query.trim().length < 2;

  if (isShortQuery) {
    return <div className="py-8 text-center text-sm text-gray-400">Type at least 2 characters to search</div>;
  }
  if (!loading && searched && !hasResults) {
    return <div className="py-8 text-center text-sm text-gray-400">No results for &ldquo;{query.trim()}&rdquo;</div>;
  }
  if (!hasResults) return null;

  return (
    <div className="max-h-[60vh] overflow-y-auto">
      {results.attendees.length > 0 && (
        <section>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Attendees</p>
          {results.attendees.map(r => (
            <ResultRow
              key={r.id}
              href={`/attendees/${r.id}`}
              onClick={onClose}
              icon={<PersonIcon />}
              iconBg="bg-blue-100"
              name={r.name}
              subtitle={r.subtitle}
              quickView={{ type: 'attendee', id: r.id, name: r.name }}
              onQuickView={onQuickView}
            />
          ))}
        </section>
      )}
      {results.companies.length > 0 && (
        <section>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Companies</p>
          {results.companies.map(r => (
            <ResultRow
              key={r.id}
              href={`/companies/${r.id}`}
              onClick={onClose}
              icon={<BuildingIcon />}
              iconBg="bg-green-100"
              name={r.name}
              subtitle={r.subtitle}
              quickView={{ type: 'company', id: r.id, name: r.name }}
              onQuickView={onQuickView}
            />
          ))}
        </section>
      )}
      {results.conferences.length > 0 && (
        <section>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Conferences</p>
          {results.conferences.map(r => (
            <ResultRow
              key={r.id}
              href={`/conferences/${r.id}`}
              onClick={onClose}
              icon={<CalendarIcon />}
              iconBg="bg-purple-100"
              name={r.name}
              subtitle={r.subtitle}
              quickView={{ type: 'conference', id: r.id, name: r.name }}
              onQuickView={onQuickView}
            />
          ))}
        </section>
      )}
      {results.meetings.length > 0 && (
        <section>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Meetings</p>
          {results.meetings.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => { openMeetingNotes(r.id); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                <MeetingIcon />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                {r.subtitle && <p className="text-xs text-gray-500 truncate">{r.subtitle}</p>}
              </div>
            </button>
          ))}
        </section>
      )}
      {results.followUps.length > 0 && (
        <section>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Follow Ups</p>
          {results.followUps.map(r => (
            <ResultRow
              key={r.id}
              href={`/attendees/${r.attendee_id}`}
              onClick={onClose}
              icon={<FollowUpIcon />}
              iconBg="bg-amber-100"
              name={r.name}
              subtitle={r.subtitle}
            />
          ))}
        </section>
      )}
      {results.events.length > 0 && (
        <section>
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Events</p>
          {results.events.map(r => (
            <ResultRow
              key={r.id}
              href={`/conferences/${r.conference_id}`}
              onClick={onClose}
              icon={<EventIcon />}
              iconBg="bg-orange-100"
              name={r.name}
              subtitle={r.subtitle}
            />
          ))}
        </section>
      )}
      <div className="h-2" />
    </div>
  );
}
