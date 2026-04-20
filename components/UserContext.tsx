'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface AuthUser {
  id: number;
  email: string;
  role: 'user' | 'administrator';
  emailVerified: boolean;
  configId: number | null;
  displayName: string | null;
  repName: string | null;
  createdAt: string | null;
}

interface UserContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => void;
}

const UserContext = createContext<UserContextValue>({ user: null, loading: true, refresh: () => {} });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <UserContext.Provider value={{ user, loading, refresh }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
