'use client';

import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/conferences': 'Conferences',
  '/conferences/new': 'New Conference',
  '/attendees': 'Attendees',
  '/companies': 'Companies',
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
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-procare-dark-blue flex items-center justify-center text-white text-sm font-bold">
          P
        </div>
        <span className="text-sm text-gray-600 hidden sm:block">Procare HR</span>
      </div>
    </header>
  );
}
