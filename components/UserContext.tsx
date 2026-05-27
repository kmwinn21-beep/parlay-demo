'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface AuthUser {
  id: number;
  email: string;
  role: 'user' | 'administrator' | 'sales_rep' | 'manager' | 'analyst' | 'conference_coordinator' | 'stakeholder';
  emailVerified: boolean;
  configId: number | null;
  displayName: string | null;
  repName: string | null;
  createdAt: string | null;
  firstName: string | null;
  demoVisitor?: boolean;
  capabilities?: Record<string, boolean>;
}

interface UserContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => void;
  patchUser: (partial: Partial<AuthUser>) => void;
}

const UserContext = createContext<UserContextValue>({ user: null, loading: true, refresh: () => {}, patchUser: () => {} });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(prev => data?.user ?? prev))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const patchUser = useCallback((partial: Partial<AuthUser>) => {
    setUser(prev => prev ? { ...prev, ...partial } : prev);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <UserContext.Provider value={{ user, loading, refresh, patchUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
