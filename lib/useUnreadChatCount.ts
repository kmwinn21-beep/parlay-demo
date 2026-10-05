'use client';

import { useChatPanel } from '@/components/ChatPanelContext';

/**
 * Unread chat messages, for the floating nav's badge.
 *
 * Read from the chat panel's own state rather than fetched.
 *
 * This hook used to poll /api/chat/conversations and /api/chat/groups every
 * fifteen seconds to add up a number — the same two endpoints, on the same
 * schedule, that ChatPanelProvider was already polling, and whose totals it
 * already exposes as totalUnread. Every chat request in the production logs
 * was therefore being made twice: 168 calls to each endpoint over six hours
 * where 84 would have done.
 *
 * Its one caller sits inside that provider, so there was never anything to
 * fetch here.
 */
export function useUnreadChatCount(): number {
  return useChatPanel().totalUnread;
}
