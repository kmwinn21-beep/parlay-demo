'use client';

import { useState, useEffect } from 'react';
import { subscribeUnreadNotifications, unreadNotificationCount } from '@/lib/unreadNotifications';

/**
 * The unread badge's number.
 *
 * A subscriber now rather than a fetcher: this and the header's bell both
 * wanted the same number and each polled for it, which cost two requests a
 * minute for one figure. See lib/unreadNotifications.ts.
 */
export function useUnreadNotificationCount(): number {
  const [count, setCount] = useState(unreadNotificationCount);
  useEffect(() => subscribeUnreadNotifications(setCount), []);
  return count;
}
