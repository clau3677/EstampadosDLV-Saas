// Client-side hook para leer el usuario autenticado.
// Usa /api/auth/me con SWR para cache + refresh automático.
'use client';

import useSWR from 'swr';

const fetcher = (url) => fetch(url, { credentials: 'include' }).then(r => r.json());

export function useAuth() {
  const { data, error, isLoading, mutate } = useSWR('/api/auth/me', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
  const user = data?.user || null;
  return {
    user,
    loading: isLoading,
    error,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isOperator: user?.role === 'operator',
    isCustomer: user?.role === 'customer',
    refresh: mutate,
  };
}

export async function apiLogout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}
