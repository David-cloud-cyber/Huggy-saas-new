/**
 * Huggy Stream Client v2
 *
 * Single frontend entry point for consuming AI streams:
 * - Spec-compliant SSE parsing (event:, data:, multi-line data, comments,
 *   [DONE] sentinel, partial chunk recovery across TCP boundaries).
 * - fetch + ReadableStream transport with AbortController cancellation.
 * - Automatic reconnection with Last-Event-ID and exponential backoff.
 * - Smooth text renderer (requestAnimationFrame) for fluid, jank-free
 *   word-by-word streaming in the UI.
 */

import { isHuggyStreamEvent, type HuggyStreamEvent } from './stream-protocol.ts';

// ─── SSE parser (spec-compliant, chunk-safe) ────────────────────────────────

export type JsonSseEventHandler = (eventType: string, data: any) => void;

const malformedStreamEvent = {
  event_type: 'error',
  message: 'The AI stream returned a malformed event.',
  payload: {},
};

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseSseField(line: string) {
  const separator = line.indexOf(':');
  if (separator === -1) return { field: line.trim(), value: '' };
  let value = line.slice(separator + 1);
  if (value.startsWith(' ')) value = value.slice(1);
  return {
    field: line.slice(0, separator).trim(),
    value,
  };
}

function dispatchBlock(block: string, onEvent: JsonSseEventHandler) {
  const lines = normalizeNewlines(block).split('\n');
  const dataLines: string[] = [];
  let eventType = 'message';

  for (const line of lines) {
    // Skip comment/heartbeat lines (e.g., ": keepalive")
    if (!line || line.startsWith(':')) continue;

    const { field, value } = parseSseField(line);
    if (field === 'event') {
      eventType = value.trim() || 'message';
    } else if (field === 'data') {
      dataLines.push(value);
    }
  }

  if (!dataLines.length) return;

  const rawData = dataLines.join('\n').trim();
  if (!rawData || rawData === '[DONE]') {
    return;
  }

  try {
    const parsed = JSON.parse(rawData);
    const normalizedType = eventType === 'message' && typeof parsed?.event_type === 'string'
      ? parsed.event_type
      : eventType;
    onEvent(normalizedType, parsed);
  } catch {
    // Blocks are dispatched only after an SSE boundary or an explicit flush.
    // Invalid JSON here is malformed, not an incomplete network chunk.
    onEvent('error', { ...malformedStreamEvent, raw: rawData.slice(0, 200) });
  }
}

export function createJsonSseParser(onEvent: JsonSseEventHandler) {
  let buffer = '';
  return {
    push(chunk: string) {
      buffer = normalizeNewlines(`${buffer}${chunk}`);

      while (true) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary === -1) break;

        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        dispatchBlock(block, onEvent);
      }
    },

    flush() {
      const remaining = buffer.trim();
      buffer = '';
      if (remaining) dispatchBlock(remaining, onEvent);
    },

    /**
     * Returns true if there is buffered data waiting for more chunks.
     * Useful for diagnostics / detecting prematurely closed streams.
     */
    hasPendingData() {
      return buffer.length > 0;
    },
  };
}

// ─── Transport: fetch + ReadableStream with reconnection ───────────────────

export class HuggyStreamHttpError extends Error {
  status: number;

  constructor(status: number) {
    super(`Stream request failed with ${status}`);
    this.name = 'HuggyStreamHttpError';
    this.status = status;
  }
}

export interface OpenHuggyStreamOptions {
  url: string;
  init?: RequestInit;
  /** Receives every parsed SSE event (raw type + JSON payload). */
  onEvent: JsonSseEventHandler;
  /** Receives only protocol-v2 typed events, when recognizable. */
  onProtocolEvent?: (event: HuggyStreamEvent) => void;
  /** Called before each reconnection attempt. */
  onRetry?: (attempt: number, lastEventId: number | null) => void;
  /** Max automatic reconnections after a network drop. Default: 3. */
  maxRetries?: number;
}

export interface HuggyStreamHandle {
  /** Aborts the stream immediately. Safe to call multiple times. */
  cancel: () => void;
  /** Resolves when the stream ends; rejects on a fatal error. */
  done: Promise<void>;
}

export function openHuggyStream(options: OpenHuggyStreamOptions): HuggyStreamHandle {
  const controller = new AbortController();
  const maxRetries = options.maxRetries ?? 3;
  let lastEventId: number | null = null;
  let cancelled = false;

  const handleEvent: JsonSseEventHandler = (type, data) => {
    if (data && typeof data.id === 'number') lastEventId = data.id;
    if (options.onProtocolEvent && isHuggyStreamEvent(data)) {
      options.onProtocolEvent(data);
    }
    options.onEvent(type, data);
  };

  const run = async () => {
    let attempt = 0;
    while (true) {
      try {
        const headers = new Headers(options.init?.headers || {});
        headers.set('Accept', 'text/event-stream');
        if (lastEventId !== null) headers.set('Last-Event-ID', String(lastEventId));

        const response = await fetch(options.url, {
          ...options.init,
          headers,
          signal: controller.signal,
        });

        if (!response.ok) throw new HuggyStreamHttpError(response.status);
        if (!response.body) throw new Error('Streaming responses are not supported in this environment.');

        // A successful connection resets the backoff window.
        attempt = 0;

        const parser = createJsonSseParser(handleEvent);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.push(decoder.decode());
        parser.flush();
        return;
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        // Client errors are not retryable; surface them immediately.
        if (error instanceof HuggyStreamHttpError && error.status >= 400 && error.status < 500) {
          throw error;
        }
        attempt += 1;
        if (attempt > maxRetries) throw error;
        options.onRetry?.(attempt, lastEventId);
        const backoff = Math.min(600 * 2 ** (attempt - 1), 4_000) + Math.random() * 250;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  };

  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
    done: run(),
  };
}

// ─── Smooth text renderer (fluid, jank-free streaming text) ────────────────

export interface SmoothTextRenderer {
  /** Queues an incoming text chunk for smooth reveal. */
  push(text: string): void;
  /** Resolves once every queued character has been rendered. */
  finish(): Promise<void>;
  /** Stops immediately and flushes any remaining text in one paint. */
  stop(): void;
}

export interface SmoothTextRendererOptions {
  /** Minimum characters revealed per animation frame. Default: 2. */
  minCharsPerFrame?: number;
  /** Maximum characters revealed per animation frame. Default: 24. */
  maxCharsPerFrame?: number;
}

/**
 * Reveals streamed text progressively using requestAnimationFrame with an
 * adaptive speed: it accelerates when the backlog grows so the UI never
 * lags behind the model, and it never causes layout jank because each
 * frame performs exactly one render call.
 * Respects `prefers-reduced-motion` by rendering chunks instantly.
 */
export function createSmoothTextRenderer(
  render: (visibleText: string) => void,
  options: SmoothTextRendererOptions = {},
): SmoothTextRenderer {
  const minStep = Math.max(1, options.minCharsPerFrame ?? 2);
  const maxStep = Math.max(minStep, options.maxCharsPerFrame ?? 24);
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let pending = '';
  let visible = '';
  let rafId = 0;
  let stopped = false;
  let finished = false;
  let resolveFinish: (() => void) | null = null;

  const frame = () => {
    rafId = 0;
    if (stopped) return;
    if (pending) {
      const step = reduceMotion
        ? pending.length
        : Math.max(minStep, Math.min(maxStep, Math.ceil(pending.length / 12)));
      visible += pending.slice(0, step);
      pending = pending.slice(step);
      render(visible);
    }
    if (pending) {
      rafId = requestAnimationFrame(frame);
    } else if (finished && resolveFinish) {
      resolveFinish();
      resolveFinish = null;
    }
  };

  const schedule = () => {
    if (!rafId && !stopped) rafId = requestAnimationFrame(frame);
  };

  return {
    push(text: string) {
      if (!text || stopped) return;
      pending += text;
      schedule();
    },
    finish() {
      finished = true;
      if (!pending) return Promise.resolve();
      return new Promise<void>((resolve) => {
        resolveFinish = resolve;
        schedule();
      });
    },
    stop() {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      if (pending) {
        visible += pending;
        pending = '';
        render(visible);
      }
      if (resolveFinish) {
        resolveFinish();
        resolveFinish = null;
      }
    },
  };
}
