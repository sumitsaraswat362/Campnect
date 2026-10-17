// The browser only talks to its own Admin Panel server. That server, not this
// bundle, holds the service secret used to authenticate with Campnect's API.
// Keep this same-origin so no frontend setting can bypass the trusted proxy.
export const BASE_URL = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: any;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('admin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    sessionStorage.removeItem('admin_token');
    window.dispatchEvent(new Event('auth-error'));
  }

  const json = await res.json().catch(() => ({}));
  
  if (!res.ok) {
    throw new Error(json.error?.message || json.error || json.message || `API Error: ${res.status}`);
  }

  return json.data as T;
}

export async function apiFetchMeta<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = sessionStorage.getItem('admin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    sessionStorage.removeItem('admin_token');
    window.dispatchEvent(new Event('auth-error'));
  }

  const json = await res.json().catch(() => ({}));
  
  if (!res.ok) {
    throw new Error(json.error?.message || json.error || json.message || `API Error: ${res.status}`);
  }

  return json as ApiResponse<T>;
}
