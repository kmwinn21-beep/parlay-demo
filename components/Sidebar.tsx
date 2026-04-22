'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import { useUser } from './UserContext';
import { useUnreadNotificationCount } from '@/lib/useUnreadNotificationCount';
import { useAppName } from '@/lib/useAppName';
import { useTagline } from '@/lib/useTagline';
import { LogoImage } from './LogoImage';

const navItems = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/conferences',
    label: 'Conferences',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/attendees',
    label: 'Attendees',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: '/companies',
    label: 'Companies',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: '/follow-ups',
    label: 'Meetings & Follow Ups',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
{
    href: '/relationships',
    label: 'Relationships',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2 2m0 0l2-2m-2 2V9m-7 3l3-3 3 3m4-3l3 3-3 3m-8-3H5m14 0h-2M7 21h10a2 2 0 002-2V9.5a2 2 0 00-.586-1.414l-2.5-2.5A2 2 0 0014.5 5h-5a2 2 0 00-1.414.586l-2.5 2.5A2 2 0 005 9.5V19a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/notifications',
    label: 'Notifications',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const unreadCount = useUnreadNotificationCount();
  const appName = useAppName();
  const tagline = useTagline();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/auth/login';
    } catch {
      toast.error('Logout failed.');
    }
  };

  return (
    <aside className="w-64 bg-brand-primary flex flex-col flex-shrink-0 h-full">
      {/* Logo area */}
      <div className="p-5 border-b border-white/20">
        <div className="flex items-center gap-3">
          <LogoImage variant="sidebar" width={140} height={42} className="object-contain" alt="Logo" />
        </div>
        <p className="text-white/60 text-xs mt-2 italic">{tagline}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              isActive(item.href)
                ? 'bg-brand-highlight text-brand-primary'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {item.href === '/notifications' && unreadCount > 0 ? (
              <span className="relative flex-shrink-0">
                {item.icon}
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              </span>
            ) : item.icon}
            {item.label}
          </Link>
        ))}

        {/* Admin link — only for administrators */}
        {user?.role === 'administrator' && (
          <Link
            href="/admin"
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              isActive('/admin')
                ? 'bg-brand-highlight text-brand-primary'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Admin Settings
          </Link>
        )}
      </nav>

      {/* Footer — user info + logout */}
      <div className="p-4 border-t border-white/20 space-y-3">
        {user && (
          <Link
            href="/auth/account"
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors group"
          >
            <div className="w-7 h-7 rounded-full bg-brand-secondary flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {user.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-medium truncate group-hover:text-brand-highlight transition-colors">
                {user.email.split('@')[0]}
              </p>
              <p className="text-white/50 text-[10px] capitalize">{user.role}</p>
            </div>
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors text-xs"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
        <div className="flex items-center gap-2 pt-1">
          <Image src="/emblem.png" alt="Procare HR Emblem" width={24} height={24} className="object-contain opacity-60" />
          <div>
            <p className="text-white/60 text-xs">{appName}</p>
            <p className="text-white/50 text-xs">v1.0</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
