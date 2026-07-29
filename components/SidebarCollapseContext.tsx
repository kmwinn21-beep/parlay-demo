'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface SidebarCollapseCtx {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

const Ctx = createContext<SidebarCollapseCtx>({
  collapsed: false,
  toggleCollapsed: () => {},
});

const KEY = 'sidebarCollapsed';

// Desktop-only icon-rail width the sidebar shrinks to — kept here so
// AppShell's fixed-position bars (which sit to the right of the sidebar)
// can react to the same collapsed state without duplicating the value.
export const SIDEBAR_COLLAPSED_WIDTH = 80; // px, matches Sidebar's w-20
export const SIDEBAR_EXPANDED_WIDTH = 256; // px, matches Sidebar's w-64

export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'true') setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(v => {
      const next = !v;
      try { localStorage.setItem(KEY, next ? 'true' : 'false'); } catch {}
      return next;
    });
  }, []);

  return (
    <Ctx.Provider value={{ collapsed, toggleCollapsed }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSidebarCollapse() {
  return useContext(Ctx);
}
