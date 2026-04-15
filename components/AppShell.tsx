'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { FloatingNav } from './FloatingNav';
import { BottomNavProvider } from './BottomNavContext';
import { UserProvider } from './UserContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Auth pages render without the shell (no sidebar/header/nav)
  if (pathname.startsWith('/auth/')) {
    return <>{children}</>;
  }

  return (
    <UserProvider>
      <BottomNavProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          {/* Sidebar — desktop only */}
          <div className="hidden lg:flex">
            <Sidebar />
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <Header />
            <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
              {children}
            </main>
          </div>

          {/* Floating nav — mobile only */}
          <div className="lg:hidden">
            <FloatingNav />
          </div>
        </div>
      </BottomNavProvider>
    </UserProvider>
  );
}
