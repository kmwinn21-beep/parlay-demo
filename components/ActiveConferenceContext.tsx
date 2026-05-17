'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface ActiveConference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string | null;
}

interface ActiveConferenceContextValue {
  activeConference: ActiveConference | null;
  setActiveConference: (conf: ActiveConference, manual?: boolean) => void;
  clearActiveConference: () => void;
  isManuallySet: boolean;
}

const STORAGE_KEY = 'parlay_active_conf';

const ActiveConferenceContext = createContext<ActiveConferenceContextValue>({
  activeConference: null,
  setActiveConference: () => {},
  clearActiveConference: () => {},
  isManuallySet: false,
});

export function ActiveConferenceProvider({ children }: { children: React.ReactNode }) {
  const [activeConference, setActiveConferenceState] = useState<ActiveConference | null>(null);
  const [isManuallySet, setIsManuallySet] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { conference: ActiveConference; manual: boolean };
        setActiveConferenceState(parsed.conference);
        setIsManuallySet(parsed.manual);
      }
    } catch {}
  }, []);

  const setActiveConference = useCallback((conf: ActiveConference, manual = true) => {
    setActiveConferenceState(conf);
    setIsManuallySet(manual);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ conference: conf, manual }));
    } catch {}
  }, []);

  const clearActiveConference = useCallback(() => {
    setActiveConferenceState(null);
    setIsManuallySet(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return (
    <ActiveConferenceContext.Provider value={{ activeConference, setActiveConference, clearActiveConference, isManuallySet }}>
      {children}
    </ActiveConferenceContext.Provider>
  );
}

export function useActiveConference() {
  return useContext(ActiveConferenceContext);
}

export function clearActiveConferenceStorage() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}
