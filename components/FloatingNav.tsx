'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBottomNav } from './BottomNavContext';
import { useFloatingNav } from './FloatingNavContext';
import { GlobalSearchModal } from './GlobalSearch';
import { QuickNoteInlineModal } from './QuickNotesSection';
import { useUnreadNotificationCount } from '@/lib/useUnreadNotificationCount';
import { useUnreadChatCount } from '@/lib/useUnreadChatCount';
import { useChatPanel } from './ChatPanelContext';
import { BadgeScanResultsModal, type BadgeScanCard, compressImage, formatCardAsText } from './DashboardActionCard';
import { BatchCardScanModal, makeCard, type ScannedCard, type CardDraft } from './BatchCardScanModal';
import { resolveProductRelevance, type ProductRelevanceResult } from '@/lib/productRelevance';
import { useCapabilities } from '@/lib/useCapabilities';

/** The trigger's nominal diameter — the menu is still laid out around it. */
const BTN = 56;

const INTEL_ITEMS = [
  { href: '/program-planner', label: 'Program Planner' },
  { href: '/calendar-intelligence', label: 'Calendar Intelligence' },
  { href: '/program-intelligence', label: 'Program Intelligence' },
];

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

export function FloatingNav() {
  const pathname = usePathname();
  const { hidden } = useBottomNav();
  const { open, setOpen, anchor } = useFloatingNav();
  const { planCapabilities } = useCapabilities();
  const unreadCount = useUnreadNotificationCount();
  const unreadChatCount = useUnreadChatCount();
  const { setPanelOpen } = useChatPanel();
  const [intelOpen, setIntelOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [badgeFileKey, setBadgeFileKey] = useState(0);
  const [badgeScanCards, setBadgeScanCards] = useState<BadgeScanCard[]>([]);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanSavingId, setScanSavingId] = useState<string | null>(null);
  const [batchModalCards, setBatchModalCards] = useState<ScannedCard[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [badgeScanRelevance, setBadgeScanRelevance] = useState<Record<string, ProductRelevanceResult[]>>({});
  const floatingBadgeRef = useRef<HTMLInputElement>(null);

  // Close menu on route change
  useEffect(() => { setOpen(false); setIntelOpen(false); }, [pathname, setOpen]);
  // Close the Intelligence submenu whenever the main menu closes
  useEffect(() => { if (!open) setIntelOpen(false); }, [open]);

  const handleFloatingBadgeFile = useCallback(async (file: File) => {
    try {
      const { base64, mediaType } = await compressImage(file);
      const scanRes = await fetch('/api/scan-card/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: mediaType }),
      });
      if (!scanRes.ok) throw new Error();
      const { cards: rawCards } = await scanRes.json() as { cards: Partial<CardDraft>[] };
      const initial: BadgeScanCard[] = rawCards.map(raw => ({
        localId: Math.random().toString(36).slice(2),
        draft: { first_name: raw.first_name ?? '', last_name: raw.last_name ?? '', title: raw.title ?? '', company: raw.company ?? '', email: raw.email ?? '', phone: raw.phone ?? '' },
        attendeeMatches: [], companyMatches: [], status: 'matching' as const,
      }));
      setBadgeScanCards(initial);
      setShowScanModal(true);
      setBadgeScanRelevance({});
      initial.forEach(card => {
        if (card.draft.title) {
          void resolveProductRelevance(card.draft.title).then(results => {
            setBadgeScanRelevance(prev => ({ ...prev, [card.localId]: results }));
          });
        }
        void fetch('/api/card-scan/match', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_name: card.draft.first_name, last_name: card.draft.last_name, company: card.draft.company, email: card.draft.email }),
        }).then(async mRes => {
          const { attendeeMatches = [], companyMatches = [] } = mRes.ok ? await mRes.json() : {};
          setBadgeScanCards(prev => prev.map(c => c.localId === card.localId
            ? { ...c, attendeeMatches, companyMatches, status: (attendeeMatches.length > 0 || companyMatches.length > 0) ? 'matched' : 'no-match' }
            : c));
        }).catch(() => {
          setBadgeScanCards(prev => prev.map(c => c.localId === card.localId ? { ...c, status: 'no-match' } : c));
        });
      });
    } catch { /* silent */ }
  }, []);

  const handleFloatingScanAssignNow = useCallback((card: BadgeScanCard) => {
    const scanned: ScannedCard = {
      ...makeCard(card.draft),
      attendeeMatches: card.attendeeMatches,
      companyMatches: card.companyMatches,
      status: card.attendeeMatches.length > 0 ? 'matched' : 'no-match',
    };
    setBatchModalCards([scanned]);
    setShowScanModal(false);
    setShowBatchModal(true);
  }, []);

  const handleFloatingScanAssignLater = useCallback(async (card: BadgeScanCard, secondaryTag?: string) => {
    setScanSavingId(card.localId);
    const relevance = badgeScanRelevance[card.localId] ?? [];
    const productSuggestions = JSON.stringify(
      relevance.map((r: ProductRelevanceResult) => ({ productId: r.productId, productName: r.productName, score: r.score, buyerRole: r.buyerRole }))
    );
    const res = await fetch('/api/quick-notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: formatCardAsText(card.draft),
        tag: 'card-badge',
        secondary_tag: secondaryTag ?? null,
        product_suggestions: productSuggestions,
      }),
    });
    if (res.ok) {
      const note = await res.json();
      window.dispatchEvent(new CustomEvent('quicknote:saved', { detail: note }));
      const label = secondaryTag === 'booth-demo' ? 'Demo logged'
        : secondaryTag === 'booth-meeting' ? 'Meeting logged'
        : secondaryTag === 'booth-followup' ? 'Follow-up logged'
        : secondaryTag === 'booth-stop' ? 'Booth stop logged'
        : 'Saved to Floor Notes';
      toast.success(`${label} — assign details anytime`);
    } else { toast.error('Failed to save note.'); }
    setScanSavingId(null);
    setBadgeScanCards(prev => {
      const next = prev.filter(c => c.localId !== card.localId);
      // 1.5s auto-dismiss when an interaction type was selected
      if (next.length === 0) setTimeout(() => setShowScanModal(false), secondaryTag ? 1500 : 0);
      return next;
    });
  }, [badgeScanRelevance]);

  const handleSignOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      const clerkSignOut = (window as Window & { Clerk?: { signOut: (o: { redirectUrl: string }) => Promise<void> } }).Clerk?.signOut;
      if (clerkSignOut) {
        await clerkSignOut({ redirectUrl: '/auth/login' });
      } else {
        window.location.href = '/auth/login';
      }
    } catch {
      toast.error('Sign out failed.');
    }
  }, []);

  // Before any window read. The guard this replaced was `!pos`, which is null
  // during SSR because it is set in an effect — so `window` was never reached
  // on the server by accident rather than by design. Said out loud now.
  if (hidden || typeof window === 'undefined') return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  /**
   * The menu is laid out around the header's Parlay mark, which publishes its
   * rectangle through FloatingNavContext. There is no other trigger: this
   * component is mounted inside a `lg:hidden` wrapper in AppShell, so it has
   * only ever existed on phones, and the draggable button it used to render
   * was replaced by the mark.
   *
   * Null until the mark has been tapped once, which is also what keeps this
   * from rendering at desktop widths — the mark is display:none there and
   * never publishes.
   */
  const menuPos = anchor
    ? { x: anchor.x + Math.round((anchor.width - BTN) / 2), y: anchor.y }
    : null;

  if (!menuPos) return null;

  const above = menuPos.y > vh / 2;            // menu goes above the trigger
  const onRight = menuPos.x + BTN / 2 > vw / 2; // menu right-aligns to it

  // Build menu items: Dashboard→…→Meetings + Search at end
  // Reverse order when rendering above so Dashboard is nearest the trigger
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
      action: 'search' as const,
    },
    {
      key: 'chat',
      label: 'Chat',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      href: null,
      active: false,
      action: 'chat' as const,
    },
    {
      key: 'scan',
      label: 'Scan',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      href: null as string | null,
      active: false,
      action: 'scan' as const,
    },
    {
      key: 'quick-note',
      label: 'Floor Note',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      href: null,
      active: false,
      action: 'quick-note' as const,
    },
  ];
  const filteredItems = items.filter(item => {
    if (item.key === 'scan') return planCapabilities?.floor_capture?.ai_card_scanning !== false;
    return true;
  });

  // When above, reverse so stagger goes from the trigger outward (Dashboard closest, Search farthest)
  const ordered = above ? [...filteredItems].reverse() : filteredItems;

  const n = ordered.length;

  return (
    <>
      {/* Tap-away backdrop — always rendered so it can fade */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 59,
          background: 'rgba(0,0,0,0.18)',
          backdropFilter: open ? 'blur(1px)' : 'blur(0px)',
          WebkitBackdropFilter: open ? 'blur(1px)' : 'blur(0px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: open
            ? 'opacity 0.22s ease, backdrop-filter 0.22s ease'
            : 'opacity 0.18s ease, backdrop-filter 0.18s ease',
        } as React.CSSProperties}
      />

      {/* Global search modal */}
      {showSearch && <GlobalSearchModal onClose={() => setShowSearch(false)} />}
      {/* Quick note modal */}
      {showQuickNote && <QuickNoteInlineModal onClose={() => setShowQuickNote(false)} />}
      {/* Hidden file input for badge scan */}
      <input
        key={badgeFileKey}
        ref={floatingBadgeRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFloatingBadgeFile(f); e.target.value = ''; }}
      />
      {showScanModal && badgeScanCards.length > 0 && (
        <BadgeScanResultsModal
          cards={badgeScanCards}
          onClose={() => setShowScanModal(false)}
          onAssignNow={handleFloatingScanAssignNow}
          onAssignLater={handleFloatingScanAssignLater}
          savingId={scanSavingId}
          productRelevanceMap={badgeScanRelevance}
        />
      )}
      {showBatchModal && (
        <BatchCardScanModal
          initialCards={batchModalCards}
          onClose={() => setShowBatchModal(false)}
          onDone={() => setShowBatchModal(false)}
        />
      )}

      {/* Menu items — always in DOM so closing can animate out */}
      <div
        style={{
          position: 'fixed',
          zIndex: 60,
          ...(onRight
            ? { right: vw - menuPos.x - BTN }
            : { left: menuPos.x }),
          ...(above
            ? { bottom: vh - menuPos.y + 10 }
            : { top: menuPos.y + BTN + 10 }),
          display: 'flex',
          flexDirection: above ? 'column-reverse' : 'column',
          gap: 6,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {ordered.map((item, i) => {
          const isActive = item.active;
          const pillCls = isActive
            ? 'bg-brand-highlight text-brand-primary border-yellow-500/40 font-semibold'
            : 'bg-brand-primary/90 text-blue-100 border-blue-700/40 hover:bg-brand-secondary/90';

          // Opening: stagger from the trigger outward (i=0 nearest it → fires first)
          // Closing: reverse stagger so items fold back toward the trigger last
          const openDelay = i * 42;
          const closeDelay = (n - 1 - i) * 28;

          return (
            <div
              key={item.key}
              style={{
                transition: open
                  ? `opacity 0.26s cubic-bezier(0.34,1.56,0.64,1) ${openDelay}ms, transform 0.26s cubic-bezier(0.34,1.56,0.64,1) ${openDelay}ms`
                  : `opacity 0.16s cubic-bezier(0.4,0,1,1) ${closeDelay}ms, transform 0.16s cubic-bezier(0.4,0,1,1) ${closeDelay}ms`,
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
                  onClick={() => {
                    setOpen(false);
                    if (item.key === 'quick-note') setShowQuickNote(true);
                    else if (item.key === 'chat') setPanelOpen(true);
                    else if (item.key === 'scan') { setBadgeFileKey(k => k + 1); floatingBadgeRef.current?.click(); }
                    else setShowSearch(true);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-lg backdrop-blur-sm border w-full min-w-[152px] transition-colors ${pillCls}`}
                >
                  {item.key === 'chat' && unreadChatCount > 0 ? (
                    <span className="relative flex-shrink-0">
                      {item.icon}
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                        {unreadChatCount > 99 ? '99+' : unreadChatCount}
                      </span>
                    </span>
                  ) : item.icon}
                  <span className="text-sm font-medium leading-none">{item.label}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Intelligence / Sign out — to the left of the trigger while open */}
      {open && (
        <div
          style={{
            position: 'fixed',
            right: vw - menuPos.x + 8,
            top: menuPos.y + Math.round((BTN - 28) / 2),
            zIndex: 62,
            display: 'flex',
            gap: 12,
            whiteSpace: 'nowrap',
          }}
        >
          {/* Intelligence — reveals Program Planner / Calendar Intelligence / Program Intelligence
              stacked above this button, using the same staggered animation as the main menu items. */}
          <button
            type="button"
            onClick={() => setIntelOpen(v => !v)}
            className="text-xs font-medium text-brand-primary bg-brand-accent hover:bg-brand-accent/90 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/20 shadow-lg transition-colors"
          >
            Intelligence
          </button>

          <button
            type="button"
            onClick={() => { setOpen(false); void handleSignOut(); }}
            className="text-xs font-medium text-white/75 hover:text-white bg-brand-primary/80 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/20 shadow-lg transition-colors"
          >
            Sign out
          </button>


          {/* Submenu items — DOWNWARD from the Intelligence pill.
              They used to stack upward, which was right when the trigger floated
              near the bottom of the screen. The trigger is now the header mark at
              the very top, so upward put them off-screen behind the status bar
              and made them impossible to tap.
              Anchored to this row's own left edge (= the Intelligence button's),
              which keeps them clear of the main menu falling on the right and off
              the left edge of a narrow viewport. Always in DOM so closing can
              animate out, same as the main menu. */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              pointerEvents: intelOpen ? 'auto' : 'none',
            }}
          >
            {INTEL_ITEMS.map((item, i) => {
              const openDelay = i * 42;
              const closeDelay = (INTEL_ITEMS.length - 1 - i) * 28;
              return (
                <div
                  key={item.href}
                  style={{
                    transition: intelOpen
                      ? `opacity 0.26s cubic-bezier(0.34,1.56,0.64,1) ${openDelay}ms, transform 0.26s cubic-bezier(0.34,1.56,0.64,1) ${openDelay}ms`
                      : `opacity 0.16s cubic-bezier(0.4,0,1,1) ${closeDelay}ms, transform 0.16s cubic-bezier(0.4,0,1,1) ${closeDelay}ms`,
                    opacity: intelOpen ? 1 : 0,
                    transform: intelOpen ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.88)',
                  }}
                >
                  <Link
                    href={item.href}
                    onClick={() => { setOpen(false); setIntelOpen(false); }}
                    className="flex items-center whitespace-nowrap text-sm font-semibold text-brand-primary bg-brand-accent hover:bg-brand-accent/90 backdrop-blur-sm rounded-2xl px-4 py-2.5 border border-white/20 shadow-lg transition-colors text-left min-w-[152px]"
                  >
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}


    </>
  );
}
