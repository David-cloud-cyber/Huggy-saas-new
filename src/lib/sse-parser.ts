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
  if (separator === -1) return { field: line, value: '' };

  let value = line.slice(separator + 1);
  if (value.startsWith(' ')) value = value.slice(1);

  return {
    field: line.slice(0, separator),
    value,
  };
}

function dispatchBlock(block: string, onEvent: JsonSseEventHandler) {
  const lines = normalizeNewlines(block).split('\n');
  const dataLines: string[] = [];
  let eventType = 'message';

  for (const line of lines) {
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
  if (!rawData || rawData === '[DONE]') return;

  try {
    const parsed = JSON.parse(rawData);
    const normalizedType = eventType === 'message' && typeof parsed?.event_type === 'string'
      ? parsed.event_type
      : eventType;
    onEvent(normalizedType, parsed);
  } catch {
    onEvent('error', malformedStreamEvent);
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
  };
}
