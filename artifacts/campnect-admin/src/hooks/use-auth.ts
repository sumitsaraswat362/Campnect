import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, BASE_URL } from '@/lib/api';
import { useEffect } from 'react';
import { useLocation } from 'wouter';

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  permissions: string[];
  session_expires_at: string;
}

export function useAuth() {
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const token = sessionStorage.getItem('admin_token');

  const { data: user, isLoading, error } = useQuery<AdminUser>({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch('/v1/admin/auth/me'),
    enabled: Boolean(token),
    retry: false,
  });

  useEffect(() => {
    const handleAuthError = () => {
      queryClient.clear();
      setLocation('/login');
    };
    window.addEventListener('auth-error', handleAuthError);
    return () => window.removeEventListener('auth-error', handleAuthError);
  }, [queryClient, setLocation]);

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
  };
}

export function useLogin() {
  const queryClient = useQueryClient();
  const [_, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const res = await fetch(`${BASE_URL}/v1/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Login failed');
      return json.data as { token: string; user: AdminUser };
    },
    onSuccess: (data) => {
      sessionStorage.setItem('admin_token', data.token);
      queryClient.setQueryData(['auth', 'me'], data.user);
      setLocation('/dashboard');
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const [_, setLocation] = useLocation();

  return () => {
    sessionStorage.removeItem('admin_token');
    queryClient.clear();
    setLocation('/login');
  };
}
