'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBottomNav } from './BottomNavContext';
import { GlobalSearchModal } from './GlobalSearch';
import { useUnreadNotificationCount } from '@/lib/useUnreadNotificationCount';

const STORAGE_KEY = 'floatingNavPos';
const BTN = 56; // diameter in px (w-14)
const PAD = 20; // min distance from viewport edges

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/conferences',
    label: 'Events',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/attendees',
    label: 'People',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: '/companies',
    label: 'Companies',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: '/follow-ups',
    label: 'Meetings',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: '/notifications',
    label: 'Notifications',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
];

function safeDefaultPos(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return {
    x: window.innerWidth - BTN - PAD,
    y: window.innerHeight - BTN - PAD - 44, // extra for iOS home indicator
  };
}

function safeClamp(p: { x: number; y: number }): { x: number; y: number } {
  if (typeof window === 'undefined') return p;
  return {
    x: Math.max(PAD, Math.min(window.innerWidth - BTN - PAD, p.x)),
    y: Math.max(PAD, Math.min(window.innerHeight - BTN - PAD, p.y)),
  };
}

export function FloatingNav() {
  const pathname = usePathname();
  const { hidden } = useBottomNav();
  const unreadCount = useUnreadNotificationCount();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);
  const ds = useRef({
    on: false,
    drag: false,
    sx: 0, sy: 0,   // pointer start
    bx: 0, by: 0,   // button start
    timer: null as ReturnType<typeof setTimeout> | null,
  });

  // Load saved position (client-only)
  useEffect(() => {
    let saved: { x: number; y: number } | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw) as { x: number; y: number };
    } catch {}
    if (saved && saved.x >= 0 && saved.y >= 0) {
      setPos(safeClamp(saved));
    } else {
      setPos(safeDefaultPos());
    }
  }, []);

  // Close menu on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  /* ── Pointer handlers ── */
  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const d = ds.current;
    d.on = true; d.drag = false;
    d.sx = e.clientX; d.sy = e.clientY;
    d.bx = pos?.x ?? 0; d.by = pos?.y ?? 0;
    // Long-press threshold: 400 ms → enter drag mode
    d.timer = setTimeout(() => {
      d.drag = true;
      setDragging(true);
      setOpen(false);
    }, 400);
    fabRef.current?.setPointerCapture(e.pointerId);
  }, [pos]);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = ds.current;
    if (!d.on) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    // Finger moved >8px before long-press fired → treat as scroll, cancel drag
    if (!d.drag && Math.hypot(dx, dy) > 8) {
      if (d.timer) { clearTimeout(d.timer); d.timer = null; }
      d.on = false;
      return;
    }
    if (d.drag) setPos(safeClamp({ x: d.bx + dx, y: d.by + dy }));
  }, []);

  const onUp = useCallback(() => {
    const d = ds.current;
    if (!d.on) return;
    d.on = false;
    if (d.timer) { clearTimeout(d.timer); d.timer = null; }
    if (d.drag) {
      d.drag = false;
      setDragging(false);
      // Persist position
      setPos(prev => {
        if (prev) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prev)); } catch {}
        }
        return prev;
      });
    } else {
      // Short tap → toggle menu
      setOpen(v => !v);
    }
  }, []);

  if (!pos || hidden) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const above = pos.y > vh / 2;            // menu goes above FAB
  const onRight = pos.x + BTN / 2 > vw / 2; // menu right-aligns to FAB

  // Build menu items: Dashboard→…→Meetings + Search at end
  // Reverse order when rendering above so Dashboard is nearest the FAB
  const items = [
    ...NAV_ITEMS.map(n => ({
      key: n.href,
      label: n.label,
      icon: n.icon,
      href: n.href as string | null,
      active: n.href === '/' ? pathname === '/' : pathname.startsWith(n.href),
    })),
    {
      key: 'search',
      label: 'Search',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      href: null,
      active: false,
    },
  ];
  // When above, reverse so stagger goes from FAB outward (Dashboard closest, Search farthest)
  const ordered = above ? [...items].reverse() : items;

  return (
    <>
      {/* Tap-away backdrop */}
      {open && (
        <div className="fixed inset-0 z-[59]" onClick={() => setOpen(false)} />
      )}

      {/* Global search modal */}
      {showSearch && <GlobalSearchModal onClose={() => setShowSearch(false)} />}

      {/* Menu items */}
      <div
        style={{
          position: 'fixed',
          zIndex: 60,
          ...(onRight
            ? { right: vw - pos.x - BTN }
            : { left: pos.x }),
          ...(above
            ? { bottom: vh - pos.y + 10 }
            : { top: pos.y + BTN + 10 }),
          display: open ? 'flex' : 'none',
          flexDirection: above ? 'column-reverse' : 'column',
          gap: 6,
        }}
      >
        {ordered.map((item, i) => {
          const isActive = item.active;
          const pillCls = isActive
            ? 'bg-procare-gold text-procare-dark-blue border-yellow-500/40 font-semibold'
            : 'bg-procare-dark-blue/90 text-blue-100 border-blue-700/40 hover:bg-procare-bright-blue/90';

          return (
            <div
              key={item.key}
              style={{
                transition: 'opacity 0.2s ease, transform 0.2s ease',
                transitionDelay: open ? `${i * 45}ms` : '0ms',
                opacity: open ? 1 : 0,
                transform: open
                  ? 'translateY(0) scale(1)'
                  : `translateY(${above ? '10px' : '-10px'}) scale(0.88)`,
              }}
            >
              {item.href !== null ? (
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-lg backdrop-blur-sm border min-w-[152px] transition-colors ${pillCls}`}
                >
                  {item.href === '/notifications' && unreadCount > 0 ? (
                    <span className="relative flex-shrink-0">
                      {item.icon}
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    </span>
                  ) : item.icon}
                  <span className="text-sm font-medium leading-none">{item.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => { setOpen(false); setShowSearch(true); }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-lg backdrop-blur-sm border min-w-[152px] transition-colors ${pillCls}`}
                >
                  {item.icon}
                  <span className="text-sm font-medium leading-none">{item.label}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* FAB button */}
      <div
        ref={fabRef}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: 61,
          width: BTN,
          height: BTN,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        } as React.CSSProperties}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={[
          'rounded-full flex items-center justify-center select-none',
          'bg-procare-dark-blue/85 backdrop-blur-sm',
          'border border-blue-700/50 shadow-2xl',
          'transition-all duration-150',
          dragging
            ? 'scale-110 shadow-black/40'
            : open
              ? 'ring-2 ring-procare-gold ring-offset-1 ring-offset-transparent'
              : 'active:scale-90',
        ].join(' ')}
        role="button"
        aria-label="Navigation menu"
        aria-expanded={open}
      >
        {/* Hamburger ↔ X with rotation */}
        <div style={{ transition: 'transform 0.3s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          {open ? (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </div>
        {/* Unread notification badge on FAB */}
        {!open && unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none pointer-events-none"
            style={{ position: 'absolute', top: -4, right: -4 }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>
    </>
  );
}
