'use client';

import { useIsDesktop } from '@/lib/useIsDesktop';

/**
 * The agenda's desktop home. On phones it renders nothing, because the same
 * agenda is mounted inside the dashboard action card behind its Agenda button —
 * and the agenda holds its own fetches and expansion state, so exactly one copy
 * of it may ever be live.
 */
export function DesktopAgendaSlot({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return null;
  return <div className="lg:col-span-2 flex flex-col min-h-0">{children}</div>;
}
