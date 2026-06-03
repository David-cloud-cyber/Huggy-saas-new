import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { CheckIcon, Code2, FileText, MessageSquareIcon, XIcon } from "lucide-react";
import { nanoid } from "nanoid";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "./components/ai-elements/conversation";
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
  type ConfirmationState,
} from "./components/ai-elements/confirmation";
import { Message, MessageContent } from "./components/ai-elements/message";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "./components/ai-elements/plan";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./components/ai-elements/reasoning";
import { ShiningText } from "./components/ai-elements/shining-text";
import { Task, TaskContent, TaskItem, TaskTrigger } from "./components/ai-elements/task";

export type HuggyConversationRole = "user" | "assistant" | "system";

export type HuggyConversationAction = {
  id: string;
  label: string;
  onClick: () => void;
};

export type HuggyConversationTaskItem = {
  id: string;
  label: string;
  status?: "pending" | "active" | "done" | "failed" | "cancelled";
};

export type HuggyAgentTraceStep = {
  id: string;
  label: string;
  status?: "pending" | "active" | "done" | "failed" | "cancelled";
};

export type HuggyAgentTrace = {
  title: string;
  elapsed?: string;
  status?: "active" | "done" | "failed" | "cancelled";
  steps?: HuggyAgentTraceStep[];
};

export type HuggyConversationBlock =
  | {
      type: "reasoning";
      title?: string;
      content: string;
      isStreaming?: boolean;
    }
  | {
      type: "plan";
      title: string;
      description?: string;
      content: string;
      defaultOpen?: boolean;
    }
  | {
      type: "task";
      title: string;
      items: HuggyConversationTaskItem[];
      defaultOpen?: boolean;
    }
  | {
      type: "confirmation";
      title: string;
      body: string;
      state: ConfirmationState;
      approveLabel?: string;
      rejectLabel?: string;
    }
  | {
      type: "code_preview";
      title: string;
      subtitle?: string;
      language?: string;
      code: string;
      status?: "writing" | "done" | "failed";
      defaultOpen?: boolean;
    };

export type HuggyConversationMessage = {
  id: string;
  content: string;
  role: HuggyConversationRole;
  working?: boolean;
  trace?: HuggyAgentTrace | null;
  block?: HuggyConversationBlock;
  actions?: HuggyConversationAction[];
};

export type HuggyConversationApi = {
  addMessage: (message: { id?: string; role: HuggyConversationRole; content: string; working?: boolean; trace?: HuggyAgentTrace | null; block?: HuggyConversationBlock }) => string;
  updateMessage: (id: string, content: string) => void;
  setWorking: (id: string, label: string) => void;
  clearWorking: (id: string) => void;
  setTrace: (id: string, trace: HuggyAgentTrace | null) => void;
  setBlock: (id: string, block: HuggyConversationBlock | null) => void;
  removeMessage: (id: string) => void;
  addAction: (id: string, label: string, onClick: () => void) => void;
  clear: () => void;
  messages: () => HuggyConversationMessage[];
};

function ensureConversationStyles() {
  if (document.getElementById("huggy-react-conversation-styles")) return;
  const style = document.createElement("style");
  style.id = "huggy-react-conversation-styles";
  style.textContent = `
    .huggy-conversation {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .huggy-conversation-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 100%;
    }

    .huggy-conversation-empty {
      border: 1px dashed var(--border);
      border-radius: 12px;
      background: var(--bg-input);
      color: var(--text-muted);
      padding: 18px;
      text-align: left;
    }

    .huggy-conversation-empty-icon {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      margin-bottom: 10px;
      background: var(--bg-surface);
    }

    .huggy-conversation-empty h3 {
      color: var(--text);
      font-size: 14px;
      font-weight: 650;
      margin: 0 0 8px;
    }

    .huggy-conversation-empty p {
      color: var(--text-sub);
      font-size: 12px;
      line-height: 1.6;
      margin: 0;
    }

    .huggy-message {
      display: flex;
      width: 100%;
      animation: huggy-message-in 180ms cubic-bezier(.22,1,.36,1) both;
    }

    .huggy-message-user {
      justify-content: flex-end;
    }

    .huggy-message-assistant {
      justify-content: flex-start;
    }

    .huggy-message-system {
      justify-content: center;
    }

    .huggy-message-content {
      max-width: min(92%, 520px);
      overflow-wrap: anywhere;
      border: 1px solid var(--border-light, var(--border));
      border-radius: 13px;
      padding: 10px 12px;
      font-size: 12.5px;
      line-height: 1.58;
      color: var(--text);
      background: var(--bg-surface);
      box-shadow: 0 1px 0 rgba(9,9,11,.03) inset;
    }

    .huggy-message-plain {
      display: block;
      white-space: pre-wrap;
    }

    .huggy-message-markdown {
      display: grid;
      gap: 8px;
    }

    .huggy-message-markdown p,
    .huggy-message-markdown h4,
    .huggy-message-markdown ul,
    .huggy-message-markdown ol {
      margin: 0;
    }

    .huggy-message-markdown h4 {
      color: var(--text);
      font-size: 12.5px;
      font-weight: 780;
      line-height: 1.35;
    }

    .huggy-message-markdown ul,
    .huggy-message-markdown ol {
      display: grid;
      gap: 5px;
      padding-left: 18px;
    }

    .huggy-message-markdown li {
      padding-left: 2px;
    }

    .huggy-message-markdown strong {
      color: var(--text);
      font-weight: 760;
    }

    .huggy-message-markdown code {
      border: 1px solid var(--border-light, var(--border));
      border-radius: 5px;
      background: var(--bg-input);
      color: var(--text);
      padding: 1px 5px;
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      font-size: .92em;
    }

    .huggy-message-markdown a {
      color: var(--text);
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-thickness: 1px;
    }

    .huggy-agent-trace {
      display: grid;
      gap: 9px;
      width: min(100%, 520px);
      border: 1px solid var(--border-light, var(--border));
      border-radius: 14px;
      position: relative;
      overflow: hidden;
      background:
        radial-gradient(circle at 14% 0%, rgba(59,130,246,.07), transparent 36%),
        color-mix(in srgb, var(--bg-surface) 90%, var(--bg-elevated));
      box-shadow: 0 1px 0 rgba(255,255,255,.55) inset, 0 10px 24px rgba(9,9,11,.045);
      padding: 10px;
      color: var(--text);
    }

    .huggy-agent-trace[data-status="active"]::after {
      content: "";
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(37,99,235,.58), transparent);
      transform: translateX(-62%);
      animation: huggy-agent-rail 1.6s cubic-bezier(.22,1,.36,1) infinite;
    }

    .huggy-agent-trace-head {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-size: 12.5px;
      font-weight: 760;
      letter-spacing: -.01em;
    }

    .huggy-agent-trace-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .huggy-agent-trace-elapsed {
      margin-left: auto;
      color: var(--text-sub, var(--text-muted));
      font-size: 11px;
      font-weight: 650;
      font-variant-numeric: tabular-nums;
    }

    .huggy-agent-trace-dot,
    .huggy-agent-step-mark {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      flex: 0 0 auto;
      background: var(--text);
      box-shadow: 0 0 0 3px rgba(9,9,11,.06);
    }

    .huggy-agent-trace[data-status="active"] .huggy-agent-trace-dot,
    .huggy-agent-step[data-status="active"] .huggy-agent-step-mark {
      animation: huggy-dot-pulse 1.1s cubic-bezier(.22,1,.36,1) infinite;
    }

    .huggy-agent-trace[data-status="done"] .huggy-agent-trace-dot,
    .huggy-agent-step[data-status="done"] .huggy-agent-step-mark {
      background: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,.10);
    }

    .huggy-agent-trace[data-status="failed"] .huggy-agent-trace-dot,
    .huggy-agent-step[data-status="failed"] .huggy-agent-step-mark {
      background: #dc2626;
      box-shadow: 0 0 0 3px rgba(220,38,38,.10);
    }

    .huggy-agent-steps {
      display: grid;
      gap: 5px;
      padding-top: 8px;
      border-top: 1px solid var(--border-light, var(--border));
    }

    .huggy-agent-step {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-sub, var(--text-muted));
      font-size: 11.5px;
      line-height: 1.35;
      min-width: 0;
    }

    .huggy-agent-step[data-status="active"] {
      color: var(--text);
      font-weight: 700;
    }

    .huggy-agent-step[data-status="done"] {
      color: var(--text-muted);
    }

    .huggy-agent-step-label {
      min-width: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .huggy-agent-step + .huggy-agent-step {
      position: relative;
    }

    .huggy-agent-step + .huggy-agent-step::before {
      content: "";
      position: absolute;
      left: 3px;
      top: -8px;
      width: 1px;
      height: 8px;
      background: var(--border-light, var(--border));
    }

    .huggy-message-user .huggy-message-content {
      color: var(--bg);
      background: var(--text);
      border-color: transparent;
    }

    .huggy-message-system .huggy-message-content {
      max-width: 100%;
      color: var(--text-muted);
      background: var(--bg-input);
      border-style: dashed;
      font-size: 11.5px;
      text-align: center;
    }

    .huggy-live-status {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--text-sub);
      font-size: 12px;
      font-weight: 680;
      letter-spacing: -.01em;
      line-height: 1.35;
    }

    .huggy-live-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--accent-blue, #2f6df6);
      box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 47, 109, 246), .10);
      flex: 0 0 auto;
      animation: huggy-dot-pulse 900ms cubic-bezier(.22,1,.36,1) infinite;
    }

    .huggy-live-text {
      color: var(--text);
    }

    .huggy-live-detail {
      color: var(--text-muted);
      font-weight: 520;
    }

    .huggy-plan,
    .huggy-reasoning,
    .huggy-task,
    .huggy-confirmation {
      display: grid;
      gap: 9px;
      border: 1px solid var(--border-light, var(--border));
      border-radius: 12px;
      background: var(--bg-input);
      padding: 10px;
    }

    .huggy-plan-header,
    .huggy-plan-footer,
    .huggy-confirmation-actions {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .huggy-plan-title {
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--text);
      font-size: 12.5px;
      font-weight: 760;
      line-height: 1.35;
      margin: 0;
    }

    .huggy-plan-description {
      color: var(--text-sub);
      font-size: 11.5px;
      line-height: 1.55;
      margin: 5px 0 0;
    }

    .huggy-plan-trigger,
    .huggy-plan-action button,
    .huggy-reasoning-trigger,
    .huggy-task-trigger,
    .huggy-confirmation-action {
      min-height: 26px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--bg-surface);
      color: var(--text);
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 740;
      transition: transform 140ms cubic-bezier(.22,1,.36,1), border-color 140ms cubic-bezier(.22,1,.36,1), background 140ms cubic-bezier(.22,1,.36,1);
    }

    .huggy-plan-trigger:hover,
    .huggy-plan-action button:hover,
    .huggy-reasoning-trigger:hover,
    .huggy-task-trigger:hover,
    .huggy-confirmation-action:hover {
      transform: translateY(-1px);
      border-color: var(--border-focus, var(--border));
    }

    .huggy-plan-trigger {
      width: 26px;
      flex: 0 0 auto;
    }

    .huggy-plan-content,
    .huggy-reasoning-content,
    .huggy-task-content {
      color: var(--text);
      border-top: 1px solid var(--border-light, var(--border));
      padding-top: 9px;
      font-size: 11.8px;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .huggy-plan-footer {
      justify-content: flex-end;
      border-top: 1px solid var(--border-light, var(--border));
      padding-top: 9px;
    }

    .huggy-plan-action {
      display: flex;
      justify-content: flex-end;
      gap: 7px;
      flex-wrap: wrap;
    }

    .huggy-plan-action button {
      padding: 0 9px;
    }

    .huggy-reasoning-trigger,
    .huggy-task-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      text-align: left;
      padding: 0 9px;
    }

    .huggy-reasoning-trigger span:nth-child(2),
    .huggy-task-trigger span:first-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .huggy-reasoning-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--text);
      box-shadow: 0 0 0 3px rgba(9,9,11,.08);
      flex: 0 0 auto;
    }

    .huggy-reasoning-streaming .huggy-reasoning-dot {
      animation: huggy-dot-pulse 1100ms cubic-bezier(.22,1,.36,1) infinite;
    }

    .huggy-task-content {
      display: grid;
      gap: 6px;
    }

    .huggy-task-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      color: var(--text-sub);
    }

    .huggy-task-item-active {
      color: var(--text);
    }

    .huggy-task-item-done {
      color: var(--text-muted);
    }

    .huggy-task-item-failed,
    .huggy-task-item-cancelled {
      color: var(--danger, #b91c1c);
    }

    .huggy-task-status {
      min-width: 20px;
      color: var(--text);
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      font-size: 10px;
      font-weight: 800;
    }

    .huggy-task-file {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--border-light, var(--border));
      border-radius: 6px;
      padding: 1px 6px;
      background: var(--bg-surface);
    }

    .huggy-confirmation-title {
      color: var(--text);
      font-size: 12px;
      line-height: 1.55;
    }

    .huggy-confirmation-title svg {
      vertical-align: -2px;
      margin-right: 5px;
    }

    .huggy-code-preview {
      display: grid;
      gap: 0;
      border: 1px solid var(--border-light, var(--border));
      border-radius: 12px;
      overflow: hidden;
      background: color-mix(in srgb, var(--bg-input) 86%, var(--bg-elevated));
      box-shadow: 0 1px 0 rgba(255,255,255,.46) inset;
    }

    .huggy-code-preview summary {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      padding: 8px 10px;
      cursor: pointer;
      list-style: none;
      color: var(--text);
      font-size: 11.5px;
      font-weight: 760;
    }

    .huggy-code-preview summary::-webkit-details-marker {
      display: none;
    }

    .huggy-code-preview-title {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .huggy-code-preview-title strong,
    .huggy-code-preview-title span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .huggy-code-preview-title span {
      color: var(--text-sub);
      font-size: 10.5px;
      font-weight: 620;
    }

    .huggy-code-preview-badge {
      height: 20px;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--border-light, var(--border));
      border-radius: 999px;
      padding: 0 7px;
      color: var(--text-sub);
      background: var(--bg-surface);
      font-size: 10px;
      font-weight: 780;
      text-transform: uppercase;
      letter-spacing: .06em;
    }

    .huggy-code-preview[data-status="writing"] .huggy-code-preview-badge {
      color: #1d4ed8;
      border-color: rgba(37,99,235,.20);
      background: rgba(37,99,235,.07);
    }

    .huggy-code-preview[data-status="failed"] .huggy-code-preview-badge {
      color: #b91c1c;
      border-color: rgba(185,28,28,.20);
      background: rgba(185,28,28,.07);
    }

    .huggy-code-preview pre {
      margin: 0;
      max-height: 190px;
      overflow: auto;
      border-top: 1px solid var(--border-light, var(--border));
      background: color-mix(in srgb, var(--bg-surface) 72%, var(--bg-elevated));
      padding: 10px 12px;
      color: var(--text);
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      font-size: 10.8px;
      line-height: 1.62;
      white-space: pre;
    }

    .huggy-code-preview code {
      font: inherit;
    }

    .huggy-confirmation-actions {
      justify-content: flex-end;
    }

    .huggy-confirmation-action {
      padding: 0 9px;
    }

    .huggy-confirmation-action:last-child {
      background: var(--text);
      color: var(--bg);
      border-color: var(--text);
    }

    .huggy-message-actions {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
      margin-top: 9px;
    }

    .huggy-message-actions button,
    .huggy-conversation-download,
    .huggy-conversation-scroll {
      height: 28px;
      border: 1px solid var(--border);
      background: var(--bg-input);
      color: var(--text);
      border-radius: 7px;
      padding: 0 9px;
      font-size: 11px;
      font-weight: 720;
      cursor: pointer;
      transition: transform 140ms cubic-bezier(.22,1,.36,1), border-color 140ms cubic-bezier(.22,1,.36,1), background 140ms cubic-bezier(.22,1,.36,1);
    }

    .huggy-message-actions button:hover,
    .huggy-conversation-download:hover,
    .huggy-conversation-scroll:hover {
      transform: translateY(-1px);
      border-color: var(--border-focus, var(--border));
      background: var(--accent-hover, var(--bg-elevated));
    }

    .huggy-conversation-download {
      position: sticky;
      bottom: 0;
      align-self: flex-end;
      opacity: .72;
      margin-top: 6px;
    }

    .huggy-conversation-scroll {
      position: sticky;
      bottom: 0;
      align-self: flex-end;
      width: 28px;
      padding: 0;
      opacity: .72;
      margin-top: -34px;
    }

    @keyframes huggy-message-in {
      from { opacity: 0; transform: translateY(6px) scale(.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes huggy-dot-pulse {
      0%, 100% { opacity: .45; transform: scale(.85); }
      50% { opacity: 1; transform: scale(1); }
    }

    @keyframes huggy-agent-rail {
      from { transform: translateX(-64%); opacity: .32; }
      50% { opacity: .9; }
      to { transform: translateX(64%); opacity: .32; }
    }

    @media (prefers-reduced-motion: reduce) {
      .huggy-message {
        animation: none !important;
      }

      .huggy-message-actions button,
      .huggy-conversation-download,
      .huggy-conversation-scroll,
      .huggy-live-dot,
      .huggy-agent-trace-dot,
      .huggy-agent-step-mark,
      .huggy-reasoning-streaming .huggy-reasoning-dot,
      .huggy-agent-trace[data-status="active"]::after {
        transition: none !important;
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function planSummary(content: string) {
  const firstLine = content.split("\n").map(line => line.trim()).find(Boolean);
  if (!firstLine) return "Huggy prepared a short implementation plan before changing the app.";
  return firstLine.length > 170 ? `${firstLine.slice(0, 167)}...` : firstLine;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenPattern = /(`[^`]+`|\*\*[^*]+?\*\*|__[^_]+?__|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (value: string) => {
    if (value) nodes.push(value);
  };

  while ((match = tokenPattern.exec(text)) !== null) {
    pushText(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `inline_${match.index}_${token.length}`;

    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const labelEnd = token.indexOf("](");
      const label = token.slice(1, labelEnd);
      const url = token.slice(labelEnd + 2, -1);
      nodes.push(
        <a key={key} href={url} target="_blank" rel="noreferrer">
          {label}
        </a>,
      );
    } else {
      const trailing = token.match(/[).,;:!?]+$/)?.[0] || "";
      const href = trailing ? token.slice(0, -trailing.length) : token;
      nodes.push(
        <a key={key} href={href} target="_blank" rel="noreferrer">
          {href}
        </a>,
      );
      pushText(trailing);
    }
    lastIndex = tokenPattern.lastIndex;
  }

  pushText(text.slice(lastIndex));
  return nodes.length ? nodes : [text];
}

function renderAssistantMarkdown(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) {
      blocks.push(<p key={`p_${blocks.length}`}>{renderInlineMarkdown(text)}</p>);
    }
    paragraph = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    const Tag = listType;
    blocks.push(
      <Tag key={`list_${blocks.length}`}>
        {listItems.map((item, index) => (
          <li key={`${index}_${item.slice(0, 18)}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </Tag>,
    );
    listItems = [];
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<h4 key={`h_${blocks.length}`}>{renderInlineMarkdown(heading[1])}</h4>);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return <div className="huggy-message-markdown">{blocks.length ? blocks : <p>{content}</p>}</div>;
}

function renderPlainMessage(content: string) {
  return <span className="huggy-message-plain">{content}</span>;
}

function renderStandardMessageContent(message: HuggyConversationMessage) {
  if (message.role === "assistant") return renderAssistantMarkdown(message.content);
  return renderPlainMessage(message.content);
}

function renderMessageBlock(message: HuggyConversationMessage) {
  const block = message.block;
  if (!block) return null;

  if (block.type === "reasoning") {
    return (
      <Reasoning isStreaming={Boolean(block.isStreaming)}>
        <ReasoningTrigger>{block.title || "Agent notes"}</ReasoningTrigger>
        <ReasoningContent>{block.isStreaming ? <ShiningText text={block.content} /> : block.content}</ReasoningContent>
      </Reasoning>
    );
  }

  if (block.type === "plan") {
    return (
      <Plan defaultOpen={block.defaultOpen ?? false}>
        <PlanHeader>
          <div>
            <PlanTitle>
              <FileText size={14} aria-hidden="true" />
              {block.title}
            </PlanTitle>
            <PlanDescription>{block.description || planSummary(block.content)}</PlanDescription>
          </div>
          <PlanTrigger />
        </PlanHeader>
        <PlanContent>{block.content}</PlanContent>
        {message.actions?.length ? (
          <PlanFooter>
            <PlanAction>
              {message.actions.map(action => (
                <button key={action.id} type="button" onClick={action.onClick}>
                  {action.label}
                </button>
              ))}
            </PlanAction>
          </PlanFooter>
        ) : null}
      </Plan>
    );
  }

  if (block.type === "task") {
    return (
      <Task defaultOpen={block.defaultOpen ?? true}>
        <TaskTrigger title={block.title} />
        <TaskContent>
          {block.items.map(item => (
            <TaskItem key={item.id} status={item.status}>
              {item.label}
            </TaskItem>
          ))}
        </TaskContent>
      </Task>
    );
  }

  if (block.type === "code_preview") {
    const status = block.status || "done";
    return (
      <div className="huggy-code-preview" data-status={status}>
        <details open={block.defaultOpen ?? false}>
          <summary>
            <Code2 size={14} aria-hidden="true" />
            <span className="huggy-code-preview-title">
              <strong>{block.title}</strong>
              {block.subtitle ? <span>{block.subtitle}</span> : null}
            </span>
            <span className="huggy-code-preview-badge">{status === "writing" ? "Writing" : status === "failed" ? "Issue" : "Done"}</span>
          </summary>
          <pre aria-label={block.title}>
            <code>{block.code}</code>
          </pre>
        </details>
      </div>
    );
  }

  return (
    <Confirmation approval={{ id: message.id }} state={block.state}>
      <ConfirmationTitle>
        <ConfirmationRequest>{block.body}</ConfirmationRequest>
        <ConfirmationAccepted>
          <CheckIcon size={14} aria-hidden="true" />
          <span>Action approved.</span>
        </ConfirmationAccepted>
        <ConfirmationRejected>
          <XIcon size={14} aria-hidden="true" />
          <span>Action rejected.</span>
        </ConfirmationRejected>
      </ConfirmationTitle>
      <ConfirmationActions>
        {message.actions?.length ? (
          message.actions.map(action => (
            <ConfirmationAction key={action.id} onClick={action.onClick}>
              {action.label}
            </ConfirmationAction>
          ))
        ) : (
          <>
            <ConfirmationAction>{block.rejectLabel || "Cancel"}</ConfirmationAction>
            <ConfirmationAction>{block.approveLabel || "Continue"}</ConfirmationAction>
          </>
        )}
      </ConfirmationActions>
    </Confirmation>
  );
}

function renderWorkingStatus(message: HuggyConversationMessage) {
  const lines = message.content.split("\n").map(line => line.trim()).filter(Boolean);
  const [headline = "Thinking", ...details] = lines;
  const activeDetail = details.find(step => step.startsWith("now:"));
  const latestDetail = activeDetail || details[details.length - 1] || "";
  const cleanDetail = latestDetail.replace(/^(done|now):\s*/, "").trim();
  const showDetail = cleanDetail && !headline.toLowerCase().includes(cleanDetail.toLowerCase());

  return (
    <div className="huggy-live-status" aria-live="polite">
      <span className="huggy-live-dot" aria-hidden="true" />
      <span className="huggy-live-text">{headline}</span>
      {showDetail ? <span className="huggy-live-detail">· {cleanDetail}</span> : null}
    </div>
  );
}

function renderAgentTrace(message: HuggyConversationMessage) {
  const trace = message.trace;
  if (!trace) return null;
  const status = trace.status || (message.working ? "active" : "done");
  const rawSteps = (trace.steps || []).filter(step => step.label?.trim());
  const steps = rawSteps.length
    ? rawSteps
    : [{ id: "current", label: trace.title || message.content || "Working", status }];
  const title = trace.title || (status === "done" ? "Completed" : "Working");

  return (
    <div className="huggy-agent-trace" data-status={status}>
      <div className="huggy-agent-trace-head">
        <span className="huggy-agent-trace-dot" aria-hidden="true" />
        <span className="huggy-agent-trace-title">{title}</span>
        {trace.elapsed ? <span className="huggy-agent-trace-elapsed" aria-hidden="true">{trace.elapsed}</span> : null}
      </div>
      <div className="huggy-agent-steps">
        {steps.slice(-6).map(step => {
          const stepStatus = step.status || "pending";
          return (
            <div className="huggy-agent-step" data-status={stepStatus} key={step.id || step.label}>
              {stepStatus === "done" ? (
                <CheckIcon className="huggy-agent-step-mark" size={12} aria-hidden="true" />
              ) : stepStatus === "failed" ? (
                <XIcon className="huggy-agent-step-mark" size={12} aria-hidden="true" />
              ) : (
                <span className="huggy-agent-step-mark" aria-hidden="true" />
              )}
              <span className="huggy-agent-step-label">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BuilderConversation({
  messages,
}: {
  messages: HuggyConversationMessage[];
}) {
  return (
    <Conversation className="relative size-full">
      <ConversationContent>
        {messages.length === 0 ? (
          <ConversationEmptyState
            description="Messages will appear here as Huggy understands, plans, builds and verifies your app."
            icon={<MessageSquareIcon size={16} />}
            title="Start a conversation"
          />
        ) : (
          messages.map(message => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {(() => {
                  const trace = renderAgentTrace(message);
                  const block = renderMessageBlock(message);
                  if (trace || block) {
                    return (
                      <>
                        {trace}
                        {block}
                      </>
                    );
                  }
                  return message.working ? renderWorkingStatus(message) : renderStandardMessageContent(message);
                })()}
                {message.actions?.length && message.block?.type !== "plan" && message.block?.type !== "confirmation" ? (
                  <div className="huggy-message-actions">
                    {message.actions.map(action => (
                      <button key={action.id} type="button" onClick={action.onClick}>
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </MessageContent>
            </Message>
          ))
        )}
      </ConversationContent>
    </Conversation>
  );
}

export function mountBuilderConversation(host: HTMLElement): HuggyConversationApi {
  ensureConversationStyles();
  host.innerHTML = "";
  host.dataset.reactConversation = "true";

  const root: Root = createRoot(host);
  let messages: HuggyConversationMessage[] = [];

  const render = () => {
    root.render(<BuilderConversation messages={[...messages]} />);
    requestAnimationFrame(() => {
      host.scrollTop = host.scrollHeight;
    });
  };

  const api: HuggyConversationApi = {
    addMessage(message) {
      const id = message.id || `msg_${nanoid()}`;
      messages = [
        ...messages,
        {
          id,
          role: message.role,
          content: message.content,
          working: Boolean(message.working),
          trace: message.trace || null,
          block: message.block,
          actions: [],
        },
      ];
      render();
      return id;
    },
    updateMessage(id, content) {
      messages = messages.map(message => message.id === id ? { ...message, content } : message);
      render();
    },
    setWorking(id, label) {
      messages = messages.map(message => message.id === id ? { ...message, content: label, working: true } : message);
      render();
    },
    clearWorking(id) {
      messages = messages.map(message => message.id === id ? { ...message, working: false } : message);
      render();
    },
    setTrace(id, trace) {
      messages = messages.map(message => message.id === id ? { ...message, trace } : message);
      render();
    },
    setBlock(id, block) {
      messages = messages.map(message => message.id === id ? { ...message, block: block || undefined } : message);
      render();
    },
    removeMessage(id) {
      messages = messages.filter(message => message.id !== id);
      render();
    },
    addAction(id, label, onClick) {
      messages = messages.map(message => message.id === id
        ? {
            ...message,
            actions: [
              ...(message.actions || []),
              { id: `action_${nanoid()}`, label, onClick },
            ],
          }
        : message);
      render();
    },
    clear() {
      messages = [];
      render();
    },
    messages() {
      return [...messages];
    },
  };

  render();
  return api;
}
