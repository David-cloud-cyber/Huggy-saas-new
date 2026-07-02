import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import "highlight.js/styles/github-dark.css";
import katex from "katex";
import "katex/dist/katex.min.css";
import MarkdownIt from "markdown-it";
import { nanoid } from "nanoid";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnimatePresence, motion } from "motion/react";
import { Response } from "./components/ui/response";
import type { HuggyStreamEvent } from "./lib/stream-protocol";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "./components/ai-elements/tool";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "./components/ai-elements/reasoning";
import { Sources, SourcesTrigger, SourcesContent, Source } from "./components/ai-elements/sources";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

export type HuggyConversationRole = "user" | "assistant" | "system";

export type HuggyConversationAction = {
  id: string;
  label: string;
  onClick: () => void;
};

type LiveRunLine = {
  id: string;
  text: string;
  status: "active" | "done" | "failed" | "muted";
};

type ToolEntry = {
  id: string;
  name: string;
  status: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: string;
  error?: string;
};

type SourceEntry = { id: string; url: string; title?: string };
type AttachmentEntry = { id: string; name: string; url?: string; mediaType?: string; size?: number };

type LiveRunState = {
  status: "active" | "done" | "failed" | "cancelled";
  intentText: string;
  activeText: string;
  summary: string;
  assistantText: string;
  reasoningText: string;
  tools: ToolEntry[];
  sources: SourceEntry[];
  attachments: AttachmentEntry[];
  startedAt: number;
  lines: LiveRunLine[];
};

export type HuggyConversationMessage = {
  id: string;
  role: HuggyConversationRole;
  content: string;
  working?: boolean;
  actions?: HuggyConversationAction[];
  createdAt?: string;
  liveRun?: LiveRunState;
};

export type HuggyConversationApi = {
  addMessage: (message: { id?: string; role: HuggyConversationRole; content: string; working?: boolean }) => string;
  updateMessage: (id: string, content: string) => void;
  setParts: (id: string, parts: unknown[], content?: string) => void;
  setWorking: (id: string, label: string) => void;
  clearWorking: (id: string) => void;
  setBlock: (id: string, block: unknown | null) => void;
  setFlow: (id: string, flow: unknown) => void;
  startLiveRun: (id: string, meta?: { intent?: string; activeText?: string }) => void;
  applyStreamEvent: (id: string, event: HuggyStreamEvent) => void;
  appendAssistantDelta: (id: string, text: string) => void;
  finishLiveRun: (id: string, summary?: string) => void;
  removeMessage: (id: string) => void;
  addAction: (id: string, label: string, onClick: () => void) => void;
  clear: () => void;
  messages: () => HuggyConversationMessage[];
};

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  highlight(code, language) {
    const lang = String(language || "").trim();
    if (lang && hljs.getLanguage(lang)) {
      try {
        const highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        return `<pre class="huggy-code-block"><code class="hljs language-${escapeAttr(lang)}">${highlighted}</code></pre>`;
      } catch {
        // Fall through to escaped text.
      }
    }
    return `<pre class="huggy-code-block"><code>${escapeHtml(code)}</code></pre>`;
  },
});

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value: unknown) {
  return String(value ?? "").replace(/[^a-z0-9_-]/gi, "");
}

function humanCheckName(name: string) {
  const value = String(name || "").replace(/[_-]+/g, " ").trim();
  if (!value) return "Verification";
  if (/build|runner|compile/i.test(value)) return "Build";
  if (/preview/i.test(value)) return "Preview";
  if (/browser|interaction/i.test(value)) return "Interactions";
  if (/security|secret/i.test(value)) return "Security";
  if (/mobile|responsive/i.test(value)) return "Mobile";
  if (/quality|design|visual/i.test(value)) return "Quality";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanCheckStatus(status: string) {
  const value = String(status || "").toLowerCase();
  if (value === "pass") return "OK";
  if (value === "fail") return "a corriger";
  if (value === "skip") return "ignore";
  if (value === "running" || value === "active") return "en cours";
  return value || "verifie";
}

function liveLineStatusForCheck(status: string): LiveRunLine["status"] {
  const value = String(status || "").toLowerCase();
  if (value === "fail" || value === "failed") return "failed";
  if (value === "skip" || value === "skipped") return "muted";
  if (value === "running" || value === "active") return "active";
  return "done";
}

function formatFileDoneLine(event: { path: string; additions?: number; deletions?: number }) {
  const additions = Number(event.additions || 0);
  const deletions = Number(event.deletions || 0);
  const suffix = additions || deletions ? ` +${additions} -${deletions}` : "";
  return `Modification de ${event.path}${suffix}`;
}

function renderMath(value: string, displayMode: boolean) {
  try {
    return katex.renderToString(value, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return escapeHtml(value);
  }
}

function renderMarkdown(value: string) {
  const mathBlocks: string[] = [];
  const inlineMath: string[] = [];
  const withBlockMath = String(value || "").replace(/\$\$([\s\S]+?)\$\$/g, (_match, expression) => {
    const index = mathBlocks.push(String(expression || "").trim()) - 1;
    return `\n\n<div data-huggy-math-block="${index}"></div>\n\n`;
  });
  const withInlineMath = withBlockMath.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (_match, expression) => {
    const index = inlineMath.push(String(expression || "").trim()) - 1;
    return `<span data-huggy-math-inline="${index}"></span>`;
  });
  let html = markdown.render(withInlineMath);
  mathBlocks.forEach((expression, index) => {
    html = html.replace(`<div data-huggy-math-block="${index}"></div>`, `<div class="huggy-math-block">${renderMath(expression, true)}</div>`);
  });
  inlineMath.forEach((expression, index) => {
    html = html.replace(`<span data-huggy-math-inline="${index}"></span>`, `<span class="huggy-math-inline">${renderMath(expression, false)}</span>`);
  });
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["class", "target", "rel"],
  });
}

function textFromParts(parts: unknown[], fallback = "") {
  const text = parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const record = part as { text?: unknown; result?: unknown; content?: unknown; name?: unknown; path?: unknown; command?: unknown };
      const primary = record.text ?? record.result ?? record.content;
      if (primary) return String(primary);
      const secondary = [record.name, record.path, record.command].filter(Boolean).join(" ");
      return secondary ? String(secondary) : "";
    })
    .filter(Boolean)
    .join("\n");
  return text || fallback;
}

function textFromBlock(block: unknown) {
  if (!block || typeof block !== "object") return "";
  const record = block as { title?: unknown; body?: unknown; content?: unknown; summary?: unknown; intro?: unknown };
  return [record.title, record.body ?? record.content ?? record.summary ?? record.intro]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function cloneMessages(messages: HuggyConversationMessage[]) {
  return messages.map((message) => ({
    ...message,
    actions: [...(message.actions || [])],
    liveRun: message.liveRun
      ? {
        ...message.liveRun,
        lines: [...message.liveRun.lines],
      }
      : undefined,
  }));
}

function createStore() {
  let messages: HuggyConversationMessage[] = [];
  const listeners = new Set<() => void>();
  let raf = 0;

  const notify = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      listeners.forEach((listener) => listener());
    });
  };

  const mutate = (callback: () => void) => {
    callback();
    notify();
  };

  const find = (id: string) => messages.find((message) => message.id === id);

  // ── Smooth streaming text reveal ─────────────────────────────────────────
  // Network deltas arrive in bursts; revealing them character-by-character on
  // animation frames keeps the assistant text flowing instead of jumping.
  // The reveal speed adapts to the backlog so the UI never lags the model,
  // and any authoritative full-content update flushes the buffer instantly.
  const pendingDeltas = new Map<string, string>();
  let drainRaf = 0;
  const prefersReducedMotion = () =>
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const drainPendingDeltas = () => {
    drainRaf = 0;
    if (!pendingDeltas.size) return;
    const instant = prefersReducedMotion();
    for (const [id, pending] of pendingDeltas) {
      const message = find(id);
      if (!message) {
        pendingDeltas.delete(id);
        continue;
      }
      const step = instant ? pending.length : Math.max(2, Math.min(24, Math.ceil(pending.length / 12)));
      message.content += pending.slice(0, step);
      const rest = pending.slice(step);
      if (rest) pendingDeltas.set(id, rest);
      else pendingDeltas.delete(id);
    }
    notify();
    if (pendingDeltas.size) drainRaf = window.requestAnimationFrame(drainPendingDeltas);
  };

  const scheduleDrain = () => {
    if (!drainRaf) drainRaf = window.requestAnimationFrame(drainPendingDeltas);
  };

  const enqueueAssistantDelta = (message: HuggyConversationMessage, text: string) => {
    // First token after a "thinking" placeholder: drop the shimmer label so
    // the streamed text takes over cleanly without flashing the label.
    if (message.working && message.content && !pendingDeltas.has(message.id)) {
      message.content = "";
    }
    message.working = false;
    pendingDeltas.set(message.id, (pendingDeltas.get(message.id) || "") + text);
    scheduleDrain();
  };

  // A full-content update (final commit, block, parts…) is authoritative:
  // discard any not-yet-revealed streamed text for that message.
  const flushPendingDeltas = (id: string) => {
    pendingDeltas.delete(id);
  };

  const ensureLiveRun = (message: HuggyConversationMessage, meta: { intent?: string; activeText?: string } = {}): LiveRunState => {
    if (!message.liveRun) {
      message.liveRun = {
        status: "active",
        intentText: meta.intent || "",
        activeText: meta.activeText || "",
        summary: "",
        assistantText: "",
        reasoningText: "",
        tools: [],
        sources: [],
        attachments: [],
        startedAt: Date.now(),
        lines: [],
      };
    }
    if (meta.intent) message.liveRun.intentText = meta.intent;
    if (meta.activeText) message.liveRun.activeText = meta.activeText;
    message.working = true;
    return message.liveRun as LiveRunState;
  };

  const addLine = (run: LiveRunState, text: string, status: LiveRunLine["status"] = "done") => {
    const clean = String(text || "").trim();
    if (!clean) return;
    const last = run.lines[run.lines.length - 1];
    if (last?.text === clean && last.status === status) return;
    if (status === "active") {
      run.lines.forEach((line) => {
        if (line.status === "active") line.status = "done";
      });
    }
    run.lines.push({ id: nanoid(), text: clean, status });
    if (run.lines.length > 8) run.lines = run.lines.slice(-8);
  };

  const api: HuggyConversationApi & { subscribe: (listener: () => void) => () => void } = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    addMessage(message) {
      const id = message.id || nanoid();
      mutate(() => {
        messages.push({
          id,
          role: message.role,
          content: message.content,
          working: Boolean(message.working),
          actions: [],
          createdAt: new Date().toISOString(),
        });
      });
      return id;
    },
    updateMessage(id, content) {
      mutate(() => {
        const message = find(id);
        if (!message) return;
        flushPendingDeltas(id);
        message.content = content;
        if (content) message.working = false;
      });
    },
    setParts(id, parts, content = "") {
      mutate(() => {
        const message = find(id);
        if (!message) return;
        const text = textFromParts(parts, content);
        if (text) flushPendingDeltas(id);
        if (text) message.content = text;
        if (message.liveRun && text) {
          message.liveRun.summary = text;
          message.liveRun.status = message.liveRun.status === "failed" ? "failed" : "done";
        }
        message.working = false;
      });
    },
    setWorking(id, label) {
      mutate(() => {
        const message = find(id);
        if (!message) return;
        message.working = true;
        if (label) message.content = label;
      });
    },
    clearWorking(id) {
      mutate(() => {
        const message = find(id);
        if (!message) return;
        message.working = false;
      });
    },
    setBlock(id, block) {
      mutate(() => {
        const message = find(id);
        if (!message || !block) return;
        const text = textFromBlock(block);
        if (text) {
          flushPendingDeltas(id);
          message.content = text;
        }
      });
    },
    setFlow(id, flow) {
      mutate(() => {
        const message = find(id);
        if (!message || !flow || typeof flow !== "object") return;
        const record = flow as {
          status?: LiveRunState["status"];
          intro?: string;
          phase?: string;
          streamingText?: string;
          summary?: string;
          checklist?: Array<{ label?: string; status?: LiveRunLine["status"] }>;
        };
        const run = ensureLiveRun(message, { intent: record.intro, activeText: record.phase || record.streamingText });
        run.status = record.status || run.status;
        run.intentText = record.intro || run.intentText;
        run.activeText = record.streamingText || record.phase || run.activeText;
        run.summary = record.summary || run.summary;
        (record.checklist || []).slice(-5).forEach((item) => {
          if (item.label) addLine(run, item.label, item.status || "done");
        });
        if (run.status !== "active") message.working = false;
      });
    },
    startLiveRun(id, meta = {}) {
      mutate(() => {
        const message = find(id);
        if (!message) return;
        ensureLiveRun(message, meta);
      });
    },
    applyStreamEvent(id, event) {
      mutate(() => {
        const message = find(id);
        if (!message) return;
        const run = ensureLiveRun(message);
        switch (event.type) {
          case "status":
            run.activeText = event.message;
            break;
          case "milestone":
            if (event.label) {
              run.activeText = event.label;
              addLine(run, event.label, event.state === "active" ? "active" : "done");
            }
            break;
          case "phase":
            if (event.label) {
              run.activeText = event.label;
              addLine(run, event.label, event.state === "failed" ? "failed" : event.state === "active" ? "active" : "done");
            }
            break;
          case "understanding":
            run.intentText = event.summary;
            run.activeText = event.summary;
            addLine(run, event.summary, "active");
            break;
          case "assumption":
            run.activeText = event.text;
            addLine(run, event.text, "active");
            break;
          case "clarification":
            run.activeText = event.question;
            addLine(run, event.question, "active");
            break;
          case "plan":
            event.steps.slice(0, 5).forEach((step) => addLine(run, step.title || step.id, "muted"));
            break;
          case "plan_step":
            addLine(run, event.stepId, event.state === "failed" ? "failed" : event.state === "active" ? "active" : "done");
            break;
          case "reasoning_delta":
            run.activeText = event.text;
            run.reasoningText += event.text;
            break;
          case "assistant_delta":
            run.assistantText += event.text;
            enqueueAssistantDelta(message, event.text);
            break;
          case "file_start":
            run.activeText = `Je modifie ${event.path}.`;
            addLine(run, run.activeText, "active");
            break;
          case "file_delta":
            run.activeText = `Je continue ${event.path}.`;
            break;
          case "file_done":
            addLine(run, formatFileDoneLine(event), "done");
            break;
          case "check":
            addLine(
              run,
              `${humanCheckName(event.name)} ${humanCheckStatus(event.status)}${event.detail ? ` - ${event.detail}` : ""}`,
              liveLineStatusForCheck(event.status),
            );
            break;
          case "warning":
            addLine(run, event.message, "failed");
            break;
          case "error":
            run.status = event.recoverable ? "failed" : "failed";
            run.summary = event.message;
            addLine(run, event.message, "failed");
            message.working = false;
            break;
          case "done":
            run.status = run.status === "failed" ? "failed" : "done";
            message.working = false;
            break;
          case "tool_call": {
            const existing = run.tools.find((t) => t.id === event.callId);
            if (existing) {
              existing.input = event.input ?? existing.input;
              existing.status = event.state || "input-available";
            } else {
              run.tools.push({
                id: event.callId,
                name: event.name,
                input: event.input,
                status: event.state || "input-available",
              });
            }
            addLine(run, `Outil: ${event.name}`, "active");
            break;
          }
          case "tool_result": {
            const entry = run.tools.find((t) => t.id === event.callId);
            const outputText = typeof event.output === "string" ? event.output : event.output != null ? JSON.stringify(event.output, null, 2) : undefined;
            if (entry) {
              entry.status = event.error ? "output-error" : "output-available";
              entry.output = outputText;
              entry.error = event.error;
            } else {
              run.tools.push({
                id: event.callId,
                name: event.name || "tool",
                status: event.error ? "output-error" : "output-available",
                output: outputText,
                error: event.error,
              });
            }
            addLine(run, `Outil ${event.error ? "echec" : "OK"}: ${event.name || event.callId}`, event.error ? "failed" : "done");
            break;
          }
          case "source":
            if (!run.sources.find((s) => s.url === event.url)) {
              run.sources.push({ id: nanoid(), url: event.url, title: event.title });
            }
            break;
          case "citation":
            if (!run.sources.find((s) => s.url === event.url)) {
              run.sources.push({ id: nanoid(), url: event.url, title: event.title });
            }
            break;
          case "attachment":
            run.attachments.push({
              id: nanoid(),
              name: event.name,
              url: event.url,
              mediaType: event.mediaType,
              size: event.size,
            });
            break;
          default:
            break;
        }
      });
    },
    appendAssistantDelta(id, text) {
      if (!text) return;
      mutate(() => {
        const message = find(id);
        if (!message) return;
        if (message.liveRun) message.liveRun.assistantText += text;
        enqueueAssistantDelta(message, text);
      });
    },
    finishLiveRun(id, summary = "") {
      mutate(() => {
        const message = find(id);
        if (!message) return;
        const run = ensureLiveRun(message);
        run.status = run.status === "failed" ? "failed" : "done";
        run.summary = summary || run.summary;
        message.working = false;
        if (!message.content && !pendingDeltas.has(id) && run.summary) message.content = run.summary;
      });
    },
    removeMessage(id) {
      mutate(() => {
        flushPendingDeltas(id);
        messages = messages.filter((message) => message.id !== id);
      });
    },
    addAction(id, label, onClick) {
      mutate(() => {
        const message = find(id);
        if (!message) return;
        message.actions ||= [];
        message.actions.push({ id: nanoid(), label, onClick });
      });
    },
    clear() {
      mutate(() => {
        pendingDeltas.clear();
        messages = [];
      });
    },
    messages() {
      return cloneMessages(messages);
    },
  };

  return api;
}

function ensureConversationStyles() {
  if (document.getElementById("huggy-react-conversation-styles")) return;
  const style = document.createElement("style");
  style.id = "huggy-react-conversation-styles";
  style.textContent = `
    .huggy-conversation-react {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 0 0 8px;
    }

    .huggy-conversation-empty {
      border: 1px dashed color-mix(in srgb, var(--border) 62%, transparent);
      border-radius: 12px;
      color: var(--text-sub);
      padding: 16px;
      background: color-mix(in srgb, var(--bg-surface) 56%, transparent);
    }

    .huggy-conversation-empty h3 {
      margin: 0 0 7px;
      color: var(--text);
      font-size: 13px;
      font-weight: 720;
    }

    .huggy-conversation-empty p {
      margin: 0;
      font-size: 12px;
      line-height: 1.55;
    }

    .huggy-chat-message {
      display: flex;
      width: 100%;
      animation: huggy-message-in 180ms ease-out both;
    }

    .huggy-chat-message.user { justify-content: flex-end; }
    .huggy-chat-message.assistant,
    .huggy-chat-message.system { justify-content: flex-start; }

    .huggy-chat-bubble {
      max-width: min(92%, 640px);
      border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
      border-radius: 14px;
      padding: 12px 14px;
      color: var(--text);
      background: color-mix(in srgb, var(--bg-surface) 78%, transparent);
      box-shadow: 0 1px 2px rgba(0,0,0,.04);
      overflow-wrap: anywhere;
      font-size: 12.5px;
      line-height: 1.62;
    }

    .huggy-chat-message.user .huggy-chat-bubble {
      max-width: min(86%, 520px);
      background: var(--text);
      color: var(--bg);
      border-color: transparent;
      white-space: pre-wrap;
    }

    .huggy-chat-message.system .huggy-chat-bubble {
      color: var(--text-sub);
      background: transparent;
      border-style: dashed;
    }

    .huggy-chat-working {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--text-sub);
    }

    .huggy-chat-working::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--accent, #3b82f6);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent, #3b82f6) 42%, transparent);
      animation: huggy-pulse 1.25s ease-in-out infinite;
    }

    .huggy-typing-indicator {
      position: sticky;
      bottom: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent, #3b82f6) 10%, transparent);
      color: var(--text-sub);
      font-size: 12px;
      width: fit-content;
    }
    .huggy-typing-dot {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: var(--accent, #3b82f6);
      animation: huggy-typing-bounce 1s ease-in-out infinite;
    }
    .huggy-typing-dot:nth-child(2) { animation-delay: 0.15s; }
    .huggy-typing-dot:nth-child(3) { animation-delay: 0.3s; }
    .huggy-typing-label { margin-left: 4px; }
    @keyframes huggy-typing-bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40% { transform: translateY(-3px); opacity: 1; }
    }

    .huggy-live-run {
      display: grid;
      gap: 10px;
      min-width: min(100%, 360px);
    }

    .huggy-live-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--text);
      font-size: 12px;
      font-weight: 720;
    }

    .huggy-live-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #10b981;
      flex: 0 0 auto;
      animation: huggy-pulse 1.25s ease-in-out infinite;
    }

    .huggy-live-dot.is-done { animation: none; background: #22c55e; }
    .huggy-live-dot.is-failed { animation: none; background: #ef4444; }

    .huggy-live-time {
      color: var(--text-muted);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .huggy-shimmer-text {
      display: inline;
      color: color-mix(in srgb, var(--text) 86%, var(--accent, #3b82f6));
      background: linear-gradient(90deg, var(--text-muted), var(--text), var(--accent, #3b82f6), var(--text));
      background-size: 260% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: huggy-text-shimmer 2.25s ease-in-out infinite;
    }

    .huggy-live-lines {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .huggy-live-line {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr);
      gap: 8px;
      align-items: start;
      color: var(--text-sub);
      font-size: 11.5px;
      line-height: 1.45;
    }

    .huggy-live-line span:first-child {
      width: 7px;
      height: 7px;
      margin-top: 5px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--text-muted) 72%, transparent);
    }

    .huggy-live-line.is-active span:first-child {
      background: var(--accent, #3b82f6);
      animation: huggy-pulse 1.25s ease-in-out infinite;
    }

    .huggy-live-line.is-done span:first-child { background: #22c55e; }
    .huggy-live-line.is-failed span:first-child { background: #ef4444; }
    .huggy-live-line.is-muted { opacity: .65; }

    .huggy-live-summary {
      color: var(--text);
      font-size: 12.5px;
      line-height: 1.55;
    }

    .huggy-rich-response {
      color: var(--text);
    }

    .huggy-rich-response > :first-child { margin-top: 0; }
    .huggy-rich-response > :last-child { margin-bottom: 0; }
    .huggy-rich-response p { margin: 0 0 10px; }
    .huggy-rich-response h1,
    .huggy-rich-response h2,
    .huggy-rich-response h3 {
      margin: 12px 0 7px;
      line-height: 1.18;
      font-weight: 760;
    }
    .huggy-rich-response h1 { font-size: 18px; }
    .huggy-rich-response h2 { font-size: 15px; }
    .huggy-rich-response h3 { font-size: 13px; }
    .huggy-rich-response ul,
    .huggy-rich-response ol {
      margin: 8px 0 10px 18px;
      padding: 0;
    }
    .huggy-rich-response li { margin: 3px 0; }
    .huggy-rich-response blockquote {
      margin: 10px 0;
      padding-left: 11px;
      border-left: 2px solid color-mix(in srgb, var(--accent, #3b82f6) 55%, var(--border));
      color: var(--text-sub);
    }
    .huggy-rich-response table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 11.5px;
      overflow: hidden;
      border-radius: 10px;
    }
    .huggy-rich-response th,
    .huggy-rich-response td {
      border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
      padding: 7px 8px;
      text-align: left;
    }
    .huggy-rich-response th {
      background: color-mix(in srgb, var(--bg-input) 80%, transparent);
      font-weight: 720;
    }
    .huggy-rich-response code:not(pre code) {
      padding: 1px 5px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--bg-input) 90%, transparent);
      color: var(--text);
      font-size: .92em;
    }
    .huggy-code-block {
      margin: 10px 0;
      padding: 12px;
      border-radius: 11px;
      overflow: auto;
      background: #0f1117;
      border: 1px solid color-mix(in srgb, var(--border) 64%, transparent);
      font-size: 11.5px;
      line-height: 1.55;
    }
    .huggy-math-block {
      overflow-x: auto;
      padding: 6px 0;
    }
    .huggy-chat-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 10px;
    }
    .huggy-chat-actions button {
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

    @keyframes huggy-message-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes huggy-pulse {
      0%, 100% { opacity: .55; transform: scale(.94); }
      50% { opacity: 1; transform: scale(1.08); }
    }

    @keyframes huggy-text-shimmer {
      0% { background-position: 180% 0; }
      100% { background-position: -80% 0; }
    }

    .huggy-tools-stack { display: grid; gap: 6px; margin: 8px 0; }
    .huggy-tool {
      border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
      border-radius: 10px;
      background: color-mix(in srgb, var(--bg-input) 60%, transparent);
      overflow: hidden;
    }
    .huggy-tool-header {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 8px 10px; background: transparent; border: 0; cursor: pointer;
      color: var(--text); font: inherit; font-size: 12px; font-weight: 600;
    }
    .huggy-tool-chevron { width: 12px; color: var(--text-muted); }
    .huggy-tool-icon { display: inline-flex; }
    .huggy-tool-name { flex: 1; text-align: left; }
    .huggy-tool-status {
      font-size: 10.5px; font-weight: 600; padding: 2px 7px; border-radius: 999px;
      background: color-mix(in srgb, var(--accent, #3b82f6) 14%, transparent);
      color: color-mix(in srgb, var(--text) 80%, var(--accent, #3b82f6));
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .huggy-tool-status.status-output-error {
      background: color-mix(in srgb, #ef4444 18%, transparent);
      color: #ef4444;
    }
    .huggy-tool-status.status-output-available {
      background: color-mix(in srgb, #22c55e 16%, transparent);
      color: #16a34a;
    }
    .huggy-tool-content {
      padding: 0 10px 10px;
      display: grid; gap: 8px;
      border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    }
    .huggy-tool-input, .huggy-tool-output-pre {
      margin: 8px 0 0; padding: 8px 10px;
      background: #0f1117; color: #e5e7eb;
      border-radius: 8px; font-size: 11px; line-height: 1.5;
      overflow: auto; max-height: 280px;
    }
    .huggy-tool-output.is-error { color: #ef4444; font-size: 12px; margin-top: 8px; }

    .huggy-reasoning {
      border-left: 2px solid color-mix(in srgb, var(--accent, #3b82f6) 50%, var(--border));
      padding-left: 10px; margin: 6px 0 10px; color: var(--text-sub);
    }
    .huggy-reasoning-trigger {
      background: transparent; border: 0; padding: 2px 0;
      color: var(--text-sub); font-size: 11.5px; font-weight: 600;
      cursor: pointer;
    }
    .huggy-reasoning-content { margin-top: 6px; font-size: 12px; }

    .huggy-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .huggy-attachment {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 10px; border-radius: 8px; text-decoration: none;
      background: color-mix(in srgb, var(--bg-input) 80%, transparent);
      color: var(--text); font-size: 11.5px;
      border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    }
    .huggy-attachment-meta { color: var(--text-muted); font-size: 10.5px; }

    @media (prefers-reduced-motion: reduce) {
      .huggy-chat-message,
      .huggy-live-dot,
      .huggy-live-line.is-active span:first-child,
      .huggy-chat-working::before,
      .huggy-shimmer-text {
        animation: none !important;
      }
      .huggy-shimmer-text {
        -webkit-text-fill-color: currentColor;
        background: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function RichResponse({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return <div className="huggy-rich-response" dangerouslySetInnerHTML={{ __html: html }} />;
}

function ShimmeringText({ text }: { text: string }) {
  return <span className="huggy-shimmer-text">{text}</span>;
}

import { CYCLING_PHRASES_FR, CYCLING_INTERVAL_MS } from "./lib/shimmer-config";

function CyclingShimmer({ initialLabel }: { initialLabel?: string }) {
  const phrases = useMemo(() => {
    const base = [...CYCLING_PHRASES_FR];
    const seed = (initialLabel || "").trim();
    if (seed && !base.includes(seed)) base.unshift(seed);
    return base;
  }, [initialLabel]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % phrases.length);
    }, CYCLING_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [phrases.length]);
  return (
    <span className="huggy-cycling-shimmer" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={phrases[index]}
          className="huggy-shimmer-text"
          initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
          transition={{ duration: 0.42, ease: "easeOut" }}
          style={{ display: "inline-block" }}
        >
          {phrases[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function formatElapsed(startedAt: number) {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}m ${seconds}s`;
}

function LiveRunView({ run }: { run: LiveRunState }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (run.status !== "active") return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [run.status]);

  const headline = run.activeText || run.intentText || run.summary || "Huggy travaille...";
  const dotClass = run.status === "done" ? "is-done" : run.status === "failed" ? "is-failed" : "";

  return (
    <div className="huggy-live-run" aria-live="polite">
      <div className="huggy-live-head">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span className={`huggy-live-dot ${dotClass}`} />
          {run.status === "active" ? <ShimmeringText text={headline} /> : <span>{run.summary || headline}</span>}
        </span>
        <span className="huggy-live-time">{formatElapsed(run.startedAt)}</span>
      </div>
      {run.lines.length > 0 ? (
        <ul className="huggy-live-lines">
          {run.lines.slice(-6).map((line) => (
            <li className={`huggy-live-line is-${line.status}`} key={line.id}>
              <span />
              <strong>{line.text}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      {run.status !== "active" && run.summary ? <div className="huggy-live-summary">{run.summary}</div> : null}
    </div>
  );
}

function MessageView({ message }: { message: HuggyConversationMessage }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const hasStreamedText = isAssistant && message.content.trim().length > 0;
  const showThinking = isAssistant && message.working && !message.liveRun && !hasStreamedText;
  const run = message.liveRun;
  const reasoningText = run?.reasoningText || "";
  const tools = run?.tools || [];
  const sources = run?.sources || [];
  const attachments = run?.attachments || [];

  return (
    <div className={`huggy-chat-message ${message.role}${message.working ? " is-working" : ""}`} data-message-id={message.id}>
      <div className="huggy-chat-bubble">
        {message.liveRun ? <LiveRunView run={message.liveRun} /> : null}
        {showThinking ? <CyclingShimmer initialLabel={message.content} /> : null}
        {isAssistant && reasoningText ? (
          <Reasoning isStreaming={message.working} defaultOpen={false}>
            <ReasoningTrigger label={message.working ? "Réflexion en cours…" : "Réflexion"} />
            <ReasoningContent>
              <Response>{reasoningText}</Response>
            </ReasoningContent>
          </Reasoning>
        ) : null}
        {isAssistant && tools.length > 0 ? (
          <div className="huggy-tools-stack">
            {tools.map((tool) => (
              <Tool key={tool.id} defaultOpen={false}>
                <ToolHeader name={tool.name} status={tool.status} />
                <ToolContent>
                  {tool.input !== undefined ? <ToolInput input={tool.input} /> : null}
                  {tool.output !== undefined || tool.error ? (
                    <ToolOutput
                      errorText={tool.error}
                      output={tool.output ? <pre className="huggy-tool-output-pre"><code>{tool.output}</code></pre> : null}
                    />
                  ) : null}
                </ToolContent>
              </Tool>
            ))}
          </div>
        ) : null}
        {isUser ? (
          <>{message.content}</>
        ) : hasStreamedText ? (
          <Response>{message.content}</Response>
        ) : !isAssistant && !message.liveRun && message.content ? (
          <>{message.content}</>
        ) : null}
        {isAssistant && sources.length > 0 ? (
          <Sources>
            <SourcesTrigger count={sources.length} />
            <SourcesContent>
              {sources.map((s) => (
                <Source key={s.id} href={s.url} title={s.title || s.url} />
              ))}
            </SourcesContent>
          </Sources>
        ) : null}
        {isAssistant && attachments.length > 0 ? (
          <div className="huggy-attachments">
            {attachments.map((a) => (
              <a key={a.id} className="huggy-attachment" href={a.url || "#"} target="_blank" rel="noreferrer">
                <span className="huggy-attachment-name">{a.name}</span>
                {a.mediaType ? <span className="huggy-attachment-meta">{a.mediaType}</span> : null}
              </a>
            ))}
          </div>
        ) : null}
        {message.actions?.length ? (
          <div className="huggy-chat-actions">
            {message.actions.map((action) => (
              <button key={action.id} type="button" onClick={action.onClick}>
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConversationApp({ store, host }: { store: ReturnType<typeof createStore>; host: HTMLElement }) {
  const [version, setVersion] = useState(0);
  const messages = store.messages();
  const lastLengthRef = useRef(0);
  const isStreaming = messages.some((m) => m.role === "assistant" && m.working);

  useEffect(() => store.subscribe(() => setVersion((value) => value + 1)), [store]);

  useEffect(() => {
    void version;
    const distanceFromBottom = host.scrollHeight - host.clientHeight - host.scrollTop;
    if (isStreaming || distanceFromBottom < 180 || messages.length !== lastLengthRef.current) {
      host.scrollTo({ top: host.scrollHeight, behavior: "smooth" });
    }
    lastLengthRef.current = messages.length;
  }, [host, messages.length, version, isStreaming]);

  return (
    <div className="huggy-conversation-react">
      {messages.length ? (
        messages.map((message) => <MessageView key={message.id} message={message} />)
      ) : (
        <div className="huggy-conversation-empty">
          <h3>Entamez une conversation</h3>
          <p>Les messages apparaitront ici pendant que Huggy repond, planifie ou construit.</p>
        </div>
      )}
      {isStreaming ? (
        <div className="huggy-typing-indicator" aria-live="polite">
          <span className="huggy-typing-dot" />
          <span className="huggy-typing-dot" />
          <span className="huggy-typing-dot" />
          <span className="huggy-typing-label">Huggy est en train d’écrire…</span>
        </div>
      ) : null}
    </div>
  );
}

export function mountBuilderConversation(host: HTMLElement): HuggyConversationApi {
  ensureConversationStyles();
  host.innerHTML = "";
  const store = createStore();
  const root: Root = createRoot(host);
  root.render(<ConversationApp host={host} store={store} />);
  window.addEventListener("beforeunload", () => root.unmount(), { once: true });
  return store;
}
