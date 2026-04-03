'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/conferences': 'Conferences',
  '/conferences/new': 'New Conference',
  '/attendees': 'Attendees',
  '/companies': 'Companies',
  '/admin': 'Admin Panel',
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

export function Header() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div>
        <h1 className="text-xl font-semibold text-procare-dark-blue font-serif">{title}</h1>
        <p className="text-xs text-gray-500">Senior Housing Conference Hub</p>
      </div>
      <Link href="/admin" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
        <svg className="w-5 h-5 text-procare-dark-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-sm font-medium text-procare-dark-blue hidden sm:block">Admin Panel</span>
      </Link>
    </header>
  );
}
