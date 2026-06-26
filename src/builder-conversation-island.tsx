import { nanoid } from "nanoid";

export type HuggyConversationRole = "user" | "assistant" | "system";

export type HuggyConversationAction = {
  id: string;
  label: string;
  onClick: () => void;
};

export type HuggyConversationMessage = {
  id: string;
  role: HuggyConversationRole;
  content: string;
  working?: boolean;
  actions?: HuggyConversationAction[];
  createdAt?: string;
};

export type HuggyConversationApi = {
  addMessage: (message: { id?: string; role: HuggyConversationRole; content: string; working?: boolean }) => string;
  updateMessage: (id: string, content: string) => void;
  setParts: (id: string, parts: unknown[], content?: string) => void;
  setWorking: (id: string, label: string) => void;
  clearWorking: (id: string) => void;
  setBlock: (id: string, block: unknown | null) => void;
  setFlow: (id: string, flow: unknown) => void;
  removeMessage: (id: string) => void;
  addAction: (id: string, label: string, onClick: () => void) => void;
  clear: () => void;
  messages: () => HuggyConversationMessage[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textFromParts(parts: unknown[], fallback = "") {
  const text = parts
    .map(part => {
      if (!part || typeof part !== "object") return "";
      const record = part as { text?: unknown; result?: unknown; content?: unknown };
      return String(record.text ?? record.result ?? record.content ?? "");
    })
    .filter(Boolean)
    .join("\n");
  return text || fallback;
}

function textFromBlock(block: unknown) {
  if (!block || typeof block !== "object") return "";
  const record = block as { title?: unknown; body?: unknown; content?: unknown; summary?: unknown; intro?: unknown };
  return [record.title, record.body ?? record.content ?? record.summary ?? record.intro]
    .map(value => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function ensureConversationStyles() {
  if (document.getElementById("huggy-simple-conversation-styles")) return;
  const style = document.createElement("style");
  style.id = "huggy-simple-conversation-styles";
  style.textContent = `
    .huggy-conversation-simple {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 0 0 8px;
    }

    .huggy-conversation-empty {
      border: 1px dashed color-mix(in srgb, var(--border) 78%, transparent);
      border-radius: 12px;
      color: var(--text-sub);
      padding: 18px;
      background: color-mix(in srgb, var(--bg-surface) 72%, transparent);
    }

    .huggy-conversation-empty h3 {
      margin: 0 0 7px;
      color: var(--text);
      font-size: 14px;
      font-weight: 700;
    }

    .huggy-conversation-empty p {
      margin: 0;
      font-size: 12px;
      line-height: 1.55;
    }

    .huggy-simple-message {
      display: flex;
      width: 100%;
      animation: huggy-simple-message-in 180ms ease-out both;
    }

    .huggy-simple-message.user { justify-content: flex-end; }
    .huggy-simple-message.assistant,
    .huggy-simple-message.system { justify-content: flex-start; }

    .huggy-simple-bubble {
      max-width: min(92%, 560px);
      border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
      border-radius: 14px;
      padding: 11px 13px;
      color: var(--text);
      background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
      box-shadow: 0 1px 2px rgba(0,0,0,.04);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 12.5px;
      line-height: 1.6;
    }

    .huggy-simple-message.user .huggy-simple-bubble {
      background: var(--text);
      color: var(--bg);
      border-color: transparent;
    }

    .huggy-simple-message.system .huggy-simple-bubble {
      max-width: min(92%, 640px);
      color: var(--text-sub);
      background: transparent;
      border-style: dashed;
    }

    .huggy-simple-message.working .huggy-simple-bubble::after {
      content: "";
      display: inline-block;
      width: 5px;
      height: 5px;
      margin-left: 7px;
      border-radius: 999px;
      background: currentColor;
      opacity: .52;
      animation: huggy-simple-wait 1.1s ease-in-out infinite;
    }

    .huggy-simple-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 10px;
    }

    .huggy-simple-actions button {
      height: 30px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg-input);
      color: var(--text);
      padding: 0 10px;
      font: inherit;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }

    @keyframes huggy-simple-message-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes huggy-simple-wait {
      0%, 100% { opacity: .25; transform: translateY(0); }
      50% { opacity: .75; transform: translateY(-2px); }
    }

    @media (prefers-reduced-motion: reduce) {
      .huggy-simple-message,
      .huggy-simple-message.working .huggy-simple-bubble::after {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function renderMessage(message: HuggyConversationMessage) {
  const actions = message.actions?.length
    ? `<div class="huggy-simple-actions">${message.actions.map(action => `<button type="button" data-action-id="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`).join("")}</div>`
    : "";
  return `
    <div class="huggy-simple-message ${escapeHtml(message.role)}${message.working ? " working" : ""}" data-message-id="${escapeHtml(message.id)}">
      <div class="huggy-simple-bubble">${escapeHtml(message.content)}${actions}</div>
    </div>
  `;
}

export function mountBuilderConversation(host: HTMLElement): HuggyConversationApi {
  ensureConversationStyles();

  const messages: HuggyConversationMessage[] = [];
  const render = () => {
    host.innerHTML = messages.length
      ? `<div class="huggy-conversation-simple">${messages.map(renderMessage).join("")}</div>`
      : `
        <div class="huggy-conversation-simple">
          <div class="huggy-conversation-empty">
            <h3>Entamez une conversation</h3>
            <p>Les messages apparaîtront ici pendant que Huggy répond, planifie ou construit.</p>
          </div>
        </div>
      `;

    for (const message of messages) {
      for (const action of message.actions || []) {
        host
          .querySelector<HTMLButtonElement>(`[data-message-id="${CSS.escape(message.id)}"] [data-action-id="${CSS.escape(action.id)}"]`)
          ?.addEventListener("click", action.onClick);
      }
    }
    host.scrollTo({ top: host.scrollHeight, behavior: "smooth" });
  };

  render();

  return {
    addMessage(message) {
      const id = message.id || nanoid();
      messages.push({
        id,
        role: message.role,
        content: message.content,
        working: Boolean(message.working),
        actions: [],
        createdAt: new Date().toISOString(),
      });
      render();
      return id;
    },
    updateMessage(id, content) {
      const message = messages.find(item => item.id === id);
      if (!message) return;
      message.content = content;
      render();
    },
    setParts(id, parts, content = "") {
      const message = messages.find(item => item.id === id);
      if (!message) return;
      message.content = textFromParts(parts, content);
      render();
    },
    setWorking(id, label) {
      const message = messages.find(item => item.id === id);
      if (!message) return;
      message.working = true;
      message.content = label;
      render();
    },
    clearWorking(id) {
      const message = messages.find(item => item.id === id);
      if (!message) return;
      message.working = false;
      render();
    },
    setBlock(id, block) {
      const message = messages.find(item => item.id === id);
      if (!message || !block) return;
      const text = textFromBlock(block);
      if (text) message.content = text;
      render();
    },
    setFlow() {
      // [REMPLACEMENT STREAMING UI ICI]
      // L'ancien rendu visuel agent-flow est volontairement neutralise.
    },
    removeMessage(id) {
      const index = messages.findIndex(item => item.id === id);
      if (index === -1) return;
      messages.splice(index, 1);
      render();
    },
    addAction(id, label, onClick) {
      const message = messages.find(item => item.id === id);
      if (!message) return;
      message.actions ||= [];
      message.actions.push({ id: nanoid(), label, onClick });
      render();
    },
    clear() {
      messages.splice(0, messages.length);
      render();
    },
    messages() {
      return messages.map(message => ({
        ...message,
        actions: [...(message.actions || [])],
      }));
    },
  };
}
