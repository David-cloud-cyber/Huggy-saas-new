import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export type ProjectFile = {
  path: string;
  content: string;
  language?: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export function ensureDevSession() {
  if (!supabase && !localStorage.getItem('huggy-dev-token')) {
    localStorage.setItem('huggy-dev-token', 'local-dev-token');
  }
}

export async function getAccessToken() {
  if (!supabase) return localStorage.getItem('huggy-dev-token') || '';
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

export async function requireSession() {
  ensureDevSession();
  const token = await getAccessToken();
  if (!token) {
    window.location.href = '/auth.html';
    throw new Error('Authentication required');
  }
  return token;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await requireSession();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> | undefined)
  };
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function currentProjectId() {
  return new URLSearchParams(window.location.search).get('project') || localStorage.getItem('huggy-current-project-id') || '';
}

export function setCurrentProjectId(id: string) {
  localStorage.setItem('huggy-current-project-id', id);
}

export function safeText(value: unknown) {
  return String(value ?? '').replace(/[<>&"]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;'
  }[char] || char));
}
