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

function extractApiMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload) {
    const record = payload as { error?: unknown; message?: unknown };
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
  }
  if (/failed with 5\d\d/i.test(fallback)) {
    return 'Huggy could not complete the request because the server or AI provider returned an error. Please retry in a moment.';
  }
  return fallback;
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
    const message = extractApiMessage(payload, `Request failed with ${response.status}`);
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (eventType: string, data: any) => void,
  signal?: AbortSignal,
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
    signal,
  });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    const message = extractApiMessage(payload, `Stream failed with ${response.status}`);
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
      try {
        onEvent(eventType, JSON.parse(dataLine.replace(/^data:\s*/, '')));
      } catch {
        onEvent('error', { message: 'The AI stream returned a malformed event.' });
      }
    }
  }
}
