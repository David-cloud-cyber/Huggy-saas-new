/**
 * Robust SSE parser with:
 * - Proper SSE spec handling (event:, data:, id:, retry: fields)
 * - Multi-line data: field merging
 * - Heartbeat/comment line skipping (`: keepalive`)
 * - Partial JSON recovery across TCP chunk boundaries
 * - [DONE] sentinel handling (OpenAI/OpenRouter streaming)
 */

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
    // Ignore id:, retry: fields for now (could be added for reconnection support)
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
