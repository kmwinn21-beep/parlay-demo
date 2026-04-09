'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { NewMeetingModal } from './NewMeetingModal';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/conferences': 'Conferences',
  '/conferences/new': 'New Conference',
  '/attendees': 'Attendees',
  '/companies': 'Companies',
  '/admin': 'Admin Panel',
  '/follow-ups': 'Meetings & Follow Ups',
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith('/conferences/') && pathname.includes('/')) {
    const segments = pathname.split('/');
    if (segments.length === 3) return 'Conference Details';
  }
  if (pathname.startsWith('/attendees/')) return 'Attendee Details';
  if (pathname.startsWith('/companies/')) return 'Company Details';
  return 'Senior Housing Conference Hub';
}

interface ConferenceOption {
  id: number;
  name: string;
  start_date: string;
}

function formatDateShort(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const title = getPageTitle(pathname);
  const [showConferences, setShowConferences] = useState(false);
  const [conferences, setConferences] = useState<ConferenceOption[]>([]);
  const [isLoadingConfs, setIsLoadingConfs] = useState(false);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showConferences && conferences.length === 0) {
      setIsLoadingConfs(true);
      fetch('/api/conferences')
        .then(res => res.json())
        .then((data: ConferenceOption[]) => setConferences(data))
        .catch(() => {})
        .finally(() => setIsLoadingConfs(false));
    }
  }, [showConferences, conferences.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowConferences(false);
      }
    }
    if (showConferences) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showConferences]);

  return (
    <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div>
        <h1 className="text-xl font-semibold text-procare-dark-blue font-serif">{title}</h1>
        <p className="text-xs text-gray-500 hidden sm:block">Senior Housing Conference Hub</p>
      </div>
      <div className="flex items-center gap-2">
        {/* New Meeting */}
        <button
          type="button"
          onClick={() => setShowMeetingModal(true)}
          className="flex items-center gap-2 px-2 lg:px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="New Meeting"
        >
          <svg className="w-5 h-5 text-procare-dark-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-sm font-medium text-procare-dark-blue hidden lg:block">New Meeting</span>
        </button>
        {/* Add New Conference */}
        <Link
          href="/conferences/new"
          className="flex items-center gap-2 px-2 lg:px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="Add New Conference"
        >
          <svg className="w-5 h-5 text-procare-dark-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm font-medium text-procare-dark-blue hidden lg:block">New Conference</span>
        </Link>
        {/* Conference Navigator */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setShowConferences(prev => !prev)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Go to conference"
          >
            <svg className="w-5 h-5 text-procare-dark-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium text-procare-dark-blue hidden sm:block">Go To</span>
            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showConferences ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showConferences && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Go to Conference</p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {isLoadingConfs ? (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin w-5 h-5 border-2 border-procare-bright-blue border-t-transparent rounded-full" />
                  </div>
                ) : conferences.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No conferences found.</p>
                ) : (
                  conferences.map(conf => (
                    <button
                      key={conf.id}
                      type="button"
                      onClick={() => { setShowConferences(false); router.push(`/conferences/${conf.id}`); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                    >
                      <span className="text-sm font-medium text-gray-800 truncate">{conf.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatDateShort(conf.start_date)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <Link href="/admin" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5 text-procare-dark-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-medium text-procare-dark-blue hidden sm:block">Admin Panel</span>
        </Link>
      </div>
      <NewMeetingModal isOpen={showMeetingModal} onClose={() => setShowMeetingModal(false)} />
    </header>
  );
}
