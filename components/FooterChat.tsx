'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@/components/UserContext';
import { useChatPanel } from '@/components/ChatPanelContext';
import { MessagingMenu } from '@/components/MessagingMenu';
import { ChatDrawer } from '@/components/ChatDrawer';
import { Avatar, GroupAvatar, getDisplayName, targetName } from '@/components/chatCommon';

const BAR_POSITION_STORAGE_KEY = 'footerChatBarLeft';
const BAR_WIDTH = 260;

/** Furthest left offset that still leaves the whole bar on screen. */
function maxBarLeft(): number {
  return Math.max(8, window.innerWidth - BAR_WIDTH - 8);
}

/**
 * The messaging dock: the draggable bar along the bottom edge, the mobile
 * Direct/Groups sheet, and the conversation drawer.
 *
 * The bar is the handle for a minimised chat and the way back to the menu. It
 * can be dismissed outright — via its own hide button, or by closing a chat —
 * and the header's chat icon always brings it back.
 */
export function FooterChat() {
  const { user, loading: userLoading } = useUser();
  const {
    panelOpen, setPanelOpen,
    activeChat, chatMinimized, restoreChat, minimizeChat, exitChat,
    barHidden, setBarHidden,
    totalUnread,
  } = useChatPanel();

  // Horizontal position of the desktop bar — null means the default
  // bottom-right spot; once dragged it pins to an explicit, persisted offset.
  const [barLeft, setBarLeft] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragMovedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(BAR_POSITION_STORAGE_KEY);
    if (saved != null) {
      const n = Number(saved);
      if (Number.isFinite(n)) setBarLeft(Math.min(Math.max(8, n), maxBarLeft()));
    }
  }, []);

  // Re-clamp when the window narrows so a position saved on a wider screen
  // doesn't leave the bar hanging off the edge.
  useEffect(() => {
    const onResize = () => setBarLeft(prev => (prev == null ? prev : Math.min(Math.max(8, prev), maxBarLeft())));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = barRef.current;
    if (!el) return;
    const startMouseX = e.clientX;
    const startLeft = el.getBoundingClientRect().left;
    dragMovedRef.current = false;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startMouseX;
      if (Math.abs(delta) > 4) dragMovedRef.current = true;
      setBarLeft(Math.min(Math.max(8, startLeft + delta), maxBarLeft()));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (dragMovedRef.current) {
        setBarLeft(prev => {
          if (prev != null) localStorage.setItem(BAR_POSITION_STORAGE_KEY, String(prev));
          return prev;
        });
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  if (userLoading || !user) return null;

  const showDrawer = activeChat != null && !chatMinimized;

  return (
    <>
      {/* Mobile Direct/Groups sheet — the desktop menu hangs off the header
          icon instead (see Header). */}
      {panelOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPanelOpen(false)} />
          <div className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 h-[90vh] w-full bg-white rounded-t-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
            <MessagingMenu onClose={() => setPanelOpen(false)} />
          </div>
        </div>
      )}

      {showDrawer && <ChatDrawer target={activeChat} />}

      {/* Bottom bar — stood down while the drawer is up, since the drawer
          carries the same controls and the bar would sit over its input. */}
      {!barHidden && !showDrawer && (
        <div
          ref={barRef}
          className="hidden lg:flex fixed bottom-0 z-50 items-end"
          style={barLeft != null ? { left: barLeft } : { right: 16 }}
        >
          <div
            className={`flex items-center gap-2 pl-2 pr-1.5 py-2 border border-b-0 rounded-t-xl shadow-lg transition-colors select-none ${
              totalUnread > 0 ? 'bg-brand-highlight/25 border-brand-highlight' : 'bg-white border-gray-200'
            }`}
            style={{ width: BAR_WIDTH }}
          >
            <span
              onMouseDown={handleDragStart}
              title="Drag to move"
              className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="8" cy="6" r="1.5" /><circle cx="16" cy="6" r="1.5" />
                <circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" />
                <circle cx="8" cy="18" r="1.5" /><circle cx="16" cy="18" r="1.5" />
              </svg>
            </span>

            {activeChat ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (dragMovedRef.current) { dragMovedRef.current = false; return; }
                    if (chatMinimized) restoreChat(); else minimizeChat();
                  }}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  title={chatMinimized ? 'Reopen chat' : 'Minimize chat'}
                >
                  {activeChat.kind === 'dm'
                    ? <Avatar name={getDisplayName(activeChat.user.email, activeChat.user.displayName)} size="sm" />
                    : <GroupAvatar />}
                  <span className="text-sm font-semibold text-gray-800 truncate">{targetName(activeChat)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => (chatMinimized ? restoreChat() : minimizeChat())}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
                  title={chatMinimized ? 'Reopen chat' : 'Minimize chat'}
                  aria-label={chatMinimized ? 'Reopen chat' : 'Minimize chat'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={chatMinimized ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={exitChat}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
                  title="Close chat"
                  aria-label="Close chat"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (dragMovedRef.current) { dragMovedRef.current = false; return; }
                    setPanelOpen(!panelOpen);
                  }}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  title="Open messaging"
                >
                  <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-800">Messaging</span>
                  {totalUnread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none flex-shrink-0">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setPanelOpen(false); setBarHidden(true); }}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
                  title="Hide the messaging bar"
                  aria-label="Hide the messaging bar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
