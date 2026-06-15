export type HuggyMessagePart = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type RedactText = (value: string) => string;

function cleanText(value: unknown) {
  return String(value ?? '').replace(/\u0000/g, '').trim();
}

export function messagePartsFromContent(content: unknown): HuggyMessagePart[] {
  const text = cleanText(content);
  return text ? [{ type: 'text', text }] : [];
}

export function normalizeMessageParts(parts: unknown, fallbackContent: unknown = ''): HuggyMessagePart[] {
  if (!Array.isArray(parts)) return messagePartsFromContent(fallbackContent);

  const normalized = parts
    .map((part): HuggyMessagePart | null => {
      if (!part || typeof part !== 'object') return null;
      const record = part as Record<string, unknown>;
      const type = cleanText(record.type);
      if (!type) return null;

      if (type === 'text' || type === 'reasoning') {
        const text = cleanText(record.text);
        return text ? { ...record, type, text } as HuggyMessagePart : null;
      }

      return { ...record, type } as HuggyMessagePart;
    })
    .filter((part): part is HuggyMessagePart => Boolean(part));

  return normalized.length ? normalized : messagePartsFromContent(fallbackContent);
}

export function messageTextFromParts(parts: unknown, fallbackContent: unknown = '') {
  const text = normalizeMessageParts(parts, fallbackContent)
    .filter(part => part.type === 'text' || part.type === 'reasoning')
    .map(part => cleanText(part.text))
    .filter(Boolean)
    .join('\n')
    .trim();
  return text || cleanText(fallbackContent);
}

export function redactMessageParts(parts: unknown, redactText: RedactText): HuggyMessagePart[] {
  return normalizeMessageParts(parts).map(part => {
    const next: HuggyMessagePart = { ...part };
    if (typeof next.text === 'string') next.text = redactText(next.text);
    if (typeof next.error === 'string') next.error = redactText(next.error);
    if (typeof next.result === 'string') next.result = redactText(next.result);
    return next;
  });
}
