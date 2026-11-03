'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { User } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Resolves with the signed-in user (e.g. to check mustChangePassword). */
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Current user, or null when there is no valid session (AUTH_REQUIRED is not an error). */
async function fetchCurrentUser(signal: AbortSignal): Promise<User | null> {
  try {
    const { user } = await api.get('/auth/me', undefined, { signal });
    return user;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'AUTH_REQUIRED') return null;
    throw err;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => fetchCurrentUser(signal),
  });
  // Any failure to load the session (e.g. network) leaves the user signed out.
  const user = me.data ?? null;

  /** After the signed-in identity changes, cached data may be role-specific. */
  const resetOtherQueries = useCallback(
    () => queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] }),
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await api.post('/auth/login', { email, password });
      resetOtherQueries();
      queryClient.setQueryData(queryKeys.me, user);
      return user;
    },
    [queryClient, resetOtherQueries],
  );

  const register = useCallback(
    async (input: { name: string; email: string; password: string; phone?: string }) => {
      const { user } = await api.post('/auth/register', input);
      resetOtherQueries();
      queryClient.setQueryData(queryKeys.me, user);
    },
    [queryClient, resetOtherQueries],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      resetOtherQueries();
      queryClient.setQueryData(queryKeys.me, null);
    }
  }, [queryClient, resetOtherQueries]);

  const value = useMemo(
    () => ({ user, loading: me.isPending, login, register, logout }),
    [user, me.isPending, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export const isAdmin = (user: User | null): boolean =>
  user?.role === 'admin' || user?.role === 'super_admin';
export const isStaff = (user: User | null): boolean =>
  isAdmin(user) || user?.role === 'department_worker';
