'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface BottomNavContextType {
  hidden: boolean;
  hide: () => void;
  show: () => void;
}

const BottomNavContext = createContext<BottomNavContextType>({
  hidden: false,
  hide: () => {},
  show: () => {},
});

export function BottomNavProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  const hide = useCallback(() => setCount((c) => c + 1), []);
  const show = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  return (
    <BottomNavContext.Provider value={{ hidden: count > 0, hide, show }}>
      {children}
    </BottomNavContext.Provider>
  );
}

export function useBottomNav() {
  return useContext(BottomNavContext);
}

/** Call this hook in any modal to auto-hide the bottom nav while it is open. */
export function useHideBottomNav(isOpen: boolean) {
  const { hide, show } = useBottomNav();

  useEffect(() => {
    if (isOpen) {
      hide();
      return () => show();
    }
  }, [isOpen, hide, show]);
}
