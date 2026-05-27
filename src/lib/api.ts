import { getVerifiedSession } from './supabase-browser';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const verified = await getVerifiedSession();
  if (!verified?.session?.access_token) {
    window.location.href = `/auth.html?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
    throw new ApiError('Authentication required', 401, null);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${verified.session.access_token}`,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : `Request failed with ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (eventType: string, data: any) => void,
): Promise<void> {
  const verified = await getVerifiedSession();
  if (!verified?.session?.access_token) {
    window.location.href = `/auth.html?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
    throw new ApiError('Authentication required', 401, null);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${verified.session.access_token}`,
    },
    body: JSON.stringify(body || {}),
  });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : `Stream failed with ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const eventType = chunk.split('\n').find(line => line.startsWith('event:'))?.replace(/^event:\s*/, '').trim() || 'message';
      const dataLine = chunk.split('\n').find(line => line.startsWith('data:'));
      if (!dataLine) continue;
      onEvent(eventType, JSON.parse(dataLine.replace(/^data:\s*/, '')));
    }
  }
}
