import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChevronDown, Copy, Maximize2, MessageSquareIcon, Pencil, ThumbsDown, ThumbsUp, XIcon } from "lucide-react";
import { nanoid } from "nanoid";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "./components/ai-elements/conversation";
import type { ConfirmationState } from "./components/ai-elements/confirmation";
import { Message, MessageContent } from "./components/ai-elements/message";
import { AgentActivityStream } from "./components/ai-elements/agent-activity-stream";
import { Reasoning } from "./components/ai-elements/reasoning";
import { workJournalToActivityState } from "./lib/agent-activity-stream-adapter";
import "./styles/agent-activity-stream-v2.css";
import "./styles/huggy-ai-elements.css";

export type HuggyConversationRole = "user" | "assistant" | "system";

export type HuggyConversationAction = {
  id: string;
  label: string;
  onClick: () => void;
};

export type HuggyAgentTraceStep = {
  id: string;
  label: string;
  detail?: string;
  status?: "pending" | "active" | "done" | "failed" | "cancelled";
};

export type HuggyAgentTrace = {
  title: string;
  elapsed?: string;
  status?: "active" | "done" | "failed" | "cancelled";
  steps?: HuggyAgentTraceStep[];
};

export type HuggyWorklineEntry = {
  id: string;
  kind: "update" | "group" | "divider" | "summary" | "narration" | "thinking" | "file_edit" | "command";
  text: string;
  detail?: string;
  status?: "active" | "done" | "failed" | "cancelled" | "muted";
  items?: string[];
  path?: string;
  action?: "created" | "modified" | "deleted";
  additions?: number;
  deletions?: number;
  command?: string;
};

export type HuggyConversationBlock =
  | {
      type: "work_journal";
      status: "active" | "done" | "failed" | "cancelled";
      startedAt?: string;
      elapsed?: string;
      entries: HuggyWorklineEntry[];
      activeText?: string;
      finalText?: string;
      restored?: boolean;
    }
  | {
      type: "reasoning";
      title?: string;
      content: string;
      isStreaming?: boolean;
    }
  | {
      type: "confirmation";
      title: string;
      body: string;
      state: ConfirmationState;
      approveLabel?: string;
      rejectLabel?: string;
    };

export type HuggyConversationMessage = {
  id: string;
  content: string;
  parts?: import("./lib/chat-message-parts").HuggyMessagePart[];
  role: HuggyConversationRole;
  working?: boolean;
  trace?: HuggyAgentTrace | null;
  block?: HuggyConversationBlock;
  actions?: HuggyConversationAction[];
  createdAt?: string;
};

export type HuggyConversationApi = {
  addMessage: (message: { id?: string; role: HuggyConversationRole; content: string; parts?: import("./lib/chat-message-parts").HuggyMessagePart[]; working?: boolean; trace?: HuggyAgentTrace | null; block?: HuggyConversationBlock }) => string;
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
      animation: huggy-message-in 220ms cubic-bezier(.16,1,.3,1) both;
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
      transition:
        transform 160ms cubic-bezier(.22,1,.36,1),
        border-color 160ms cubic-bezier(.22,1,.36,1),
        background-color 160ms cubic-bezier(.22,1,.36,1),
        box-shadow 180ms cubic-bezier(.22,1,.36,1);
    }

    .huggy-message-content:hover {
      transform: translateY(-1px);
    }

    .huggy-message-plain {
      display: block;
      white-space: pre-wrap;
    }

    .huggy-message-waiting {
      display: inline-flex;
      align-items: center;
      color: color-mix(in srgb, var(--text) 66%, transparent);
      white-space: pre-wrap;
    }

    .huggy-message-waiting::after {
      content: "";
      width: 4px;
      height: 4px;
      margin-left: 7px;
      border-radius: 999px;
      background: currentColor;
      opacity: .48;
      animation: huggy-waiting-dot 1.25s ease-in-out infinite;
    }

    @keyframes huggy-waiting-dot {
      0%, 100% { transform: translateY(0); opacity: .26; }
      50% { transform: translateY(-2px); opacity: .68; }
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
      gap: 7px;
      width: min(100%, 560px);
      border-left: 1px solid var(--border-light, var(--border));
      border-radius: 0;
      position: relative;
      overflow: visible;
      background: transparent;
      box-shadow: none;
      padding: 2px 0 2px 12px;
      color: var(--text);
    }

    .huggy-agent-trace[data-status="active"]::after {
      content: "";
      position: absolute;
      left: -1px;
      top: 20px;
      bottom: 8px;
      width: 1px;
      background: linear-gradient(180deg, rgba(37,99,235,.56), transparent);
      opacity: .75;
      transform: none;
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
      background: var(--accent-blue, #2f6df6);
      box-shadow: 0 0 0 3px var(--accent-blue-soft, rgba(47,109,246,.10));
    }

    .huggy-agent-trace[data-status="failed"] .huggy-agent-trace-dot,
    .huggy-agent-step[data-status="failed"] .huggy-agent-step-mark {
      background: #dc2626;
      box-shadow: 0 0 0 3px rgba(220,38,38,.10);
    }

    .huggy-agent-steps {
      display: grid;
      gap: 6px;
      padding-top: 2px;
      border-top: 0;
    }

    .huggy-agent-step {
      display: flex;
      align-items: flex-start;
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

    .huggy-agent-step-copy {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .huggy-agent-step-detail {
      color: var(--text-muted);
      font-size: 11px;
      line-height: 1.38;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .huggy-agent-step[data-status="active"] .huggy-agent-step-detail {
      color: var(--text-sub, var(--text-muted));
      font-weight: 560;
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

    .huggy-message-content-trace {
      background: transparent;
      border-color: transparent;
      box-shadow: none;
      padding: 2px 0;
    }

    .huggy-message-content-trace:hover {
      transform: none;
    }

    .huggy-message-user .huggy-message-content {
      color: var(--bg);
      background: var(--text);
      border-color: transparent;
      box-shadow: 0 10px 28px rgba(0,0,0,.10);
    }

    .huggy-message-system .huggy-message-content {
      max-width: 100%;
      color: var(--text-muted);
      background: var(--bg-input);
      border-style: dashed;
      font-size: 11.5px;
      text-align: center;
    }

    .huggy-message-stack {
      max-width: min(92%, 560px);
      display: grid;
      gap: 3px;
      justify-items: start;
    }

    .huggy-message-stack .huggy-message-content {
      max-width: 100%;
    }

    .huggy-message-user .huggy-message-stack {
      justify-items: end;
    }

    .huggy-message-system .huggy-message-stack {
      max-width: 100%;
      justify-items: center;
    }

    .huggy-message-utility {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      min-height: 22px;
      color: var(--text-muted);
      opacity: .18;
      transform: translateY(-1px);
      pointer-events: none;
      transition: opacity 130ms cubic-bezier(.22,1,.36,1), transform 130ms cubic-bezier(.22,1,.36,1);
    }

    .huggy-message:hover .huggy-message-utility,
    .huggy-message:focus-within .huggy-message-utility {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    .huggy-message-utility button {
      width: 22px;
      height: 22px;
      display: inline-grid;
      place-items: center;
      border: 1px solid transparent;
      border-radius: 7px;
      color: var(--text-muted);
      background: transparent;
      cursor: pointer;
      position: relative;
      transition: background 130ms cubic-bezier(.22,1,.36,1), color 130ms cubic-bezier(.22,1,.36,1), transform 130ms cubic-bezier(.22,1,.36,1), border-color 130ms cubic-bezier(.22,1,.36,1);
    }

    .huggy-message-utility svg {
      width: 13px;
      height: 13px;
      stroke-width: 2.05;
    }

    .huggy-message-utility button:hover,
    .huggy-message-utility button:focus-visible,
    .huggy-message-utility button[data-active="true"] {
      color: var(--text);
      background: var(--bg-input);
      border-color: var(--border-light, var(--border));
      transform: translateY(-1px);
      outline: none;
    }

    .huggy-message-utility button[data-feedback="positive"][data-active="true"] {
      color: #166534;
      background: #ecfdf3;
      border-color: rgba(22,101,52,.16);
    }

    .huggy-message-utility button[data-feedback="negative"][data-active="true"] {
      color: #991b1b;
      background: #fff1f2;
      border-color: rgba(153,27,27,.16);
    }

    .huggy-message-utility button[data-tooltip]::after {
      content: attr(data-tooltip);
      position: absolute;
      left: 50%;
      bottom: calc(100% + 6px);
      transform: translateX(-50%) translateY(3px);
      border: 1px solid var(--border-light, var(--border));
      border-radius: 7px;
      background: var(--text);
      color: var(--bg);
      box-shadow: 0 12px 28px rgba(9,9,11,.14);
      padding: 4px 7px;
      font-size: 10.5px;
      font-weight: 700;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms cubic-bezier(.22,1,.36,1), transform 120ms cubic-bezier(.22,1,.36,1);
      z-index: 20;
    }

    .huggy-message-utility button[data-tooltip]:hover::after,
    .huggy-message-utility button[data-tooltip]:focus-visible::after {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .huggy-message-time {
      color: var(--text-muted);
      font-size: 10.5px;
      font-weight: 650;
      font-variant-numeric: tabular-nums;
      padding: 0 2px 0 4px;
      opacity: .78;
    }

    .huggy-feedback-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(9,9,11,.32);
      backdrop-filter: blur(8px);
      animation: huggy-feedback-in 150ms cubic-bezier(.22,1,.36,1) both;
    }

    .huggy-feedback-modal {
      width: min(720px, 100%);
      border: 1px solid var(--border-light, var(--border));
      border-radius: 22px;
      background: color-mix(in srgb, var(--bg-surface) 96%, var(--bg-elevated));
      color: var(--text);
      box-shadow: 0 24px 80px rgba(9,9,11,.20);
      padding: 24px;
    }

    .huggy-feedback-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 18px;
    }

    .huggy-feedback-head h3 {
      margin: 0;
      color: var(--text);
      font-size: clamp(22px, 2vw, 32px);
      line-height: 1.05;
      letter-spacing: -.025em;
      font-weight: 820;
    }

    .huggy-feedback-close {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
    }

    .huggy-feedback-close:hover {
      color: var(--text);
      background: var(--bg-input);
      border-color: var(--border-light, var(--border));
    }

    .huggy-feedback-reasons {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      margin-bottom: 16px;
    }

    .huggy-feedback-reason {
      min-height: 34px;
      border: 1px solid var(--border-light, var(--border));
      border-radius: 999px;
      background: var(--bg-input);
      color: var(--text);
      padding: 0 13px;
      font-size: 13px;
      font-weight: 680;
      cursor: pointer;
      transition: background 130ms cubic-bezier(.22,1,.36,1), border-color 130ms cubic-bezier(.22,1,.36,1), transform 130ms cubic-bezier(.22,1,.36,1);
    }

    .huggy-feedback-reason:hover,
    .huggy-feedback-reason[data-selected="true"] {
      background: var(--text);
      color: var(--bg);
      border-color: var(--text);
      transform: translateY(-1px);
    }

    .huggy-feedback-textarea {
      width: 100%;
      min-height: 136px;
      resize: vertical;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--bg-input);
      color: var(--text);
      padding: 13px 14px;
      font: inherit;
      font-size: 13px;
      line-height: 1.55;
      outline: none;
      box-shadow: 0 1px 0 rgba(255,255,255,.50) inset;
    }

    .huggy-feedback-textarea:focus {
      border-color: var(--border-focus, var(--text));
      box-shadow: 0 0 0 3px rgba(37,99,235,.10);
    }

    .huggy-feedback-note {
      margin: 12px 0 18px;
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .huggy-message-detail-body {
      max-height: min(58vh, 460px);
      overflow: auto;
      border: 1px solid var(--border-light, var(--border));
      border-radius: 16px;
      background: var(--bg-input);
      padding: 14px;
      color: var(--text);
      font-size: 13px;
      line-height: 1.6;
    }

    .huggy-feedback-submit {
      width: 100%;
      min-height: 42px;
      border: 1px solid var(--text);
      border-radius: 12px;
      background: var(--text);
      color: var(--bg);
      font: inherit;
      font-size: 13px;
      font-weight: 780;
      cursor: pointer;
      transition: opacity 130ms cubic-bezier(.22,1,.36,1), transform 130ms cubic-bezier(.22,1,.36,1);
    }

    .huggy-feedback-submit:hover {
      transform: translateY(-1px);
    }

    .huggy-feedback-submit:disabled {
      opacity: .48;
      cursor: not-allowed;
      transform: none;
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
      color: var(--accent-blue-deep, #173f8f);
      border-color: color-mix(in srgb, var(--accent-blue, #2f6df6) 20%, var(--border, #eceae4));
      background: var(--accent-blue-soft, rgba(47,109,246,.10));
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
      from { opacity: 0; transform: translateY(7px) scale(.992); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes huggy-dot-pulse {
      0%, 100% { opacity: .45; transform: scale(.85); }
      50% { opacity: 1; transform: scale(1); }
    }

    @keyframes huggy-agent-rail {
      from { opacity: .24; }
      50% { opacity: .82; }
      to { opacity: .24; }
    }

    @keyframes huggy-feedback-in {
      from { opacity: 0; transform: translateY(8px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @media (hover: none) {
      .huggy-message-utility {
        opacity: .52;
        transform: none;
        pointer-events: auto;
      }

      .huggy-message-utility button[data-mobile-secondary="true"] {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .huggy-message {
        animation: none !important;
      }

      .huggy-message-actions button,
      .huggy-message-utility,
      .huggy-message-utility button,
      .huggy-feedback-backdrop,
      .huggy-feedback-submit,
      .huggy-feedback-reason,
      .huggy-conversation-download,
      .huggy-conversation-scroll,
      .huggy-message-waiting::after,
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

function textFromConversationParts(parts: HuggyConversationMessage["parts"], fallback: string) {
  if (!Array.isArray(parts) || !parts.length) return fallback;
  const text = parts
    .filter(part => part.type === "text" || part.type === "reasoning")
    .map(part => String(part.text || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || fallback;
}

function renderStandardMessageContent(message: HuggyConversationMessage) {
  let content = textFromConversationParts(message.parts, message.content);
  if (!content && message.block) {
    if (message.block.type === "work_journal") {
      content = message.block.finalText || "";
    } else if (message.block.type === "reasoning") {
      content = message.block.content || "";
    }
  }
  if (message.role === "assistant") return renderAssistantMarkdown(content);
  return renderPlainMessage(content);
}

function workJournalCompareText(value = "") {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderWorkJournal(message: HuggyConversationMessage, block: Extract<HuggyConversationBlock, { type: "work_journal" }>) {
  const visibleEntries = (block.entries || []).filter(entry => {
    const normalized = workJournalCompareText(`${entry.kind} ${entry.text} ${entry.detail || ""}`);
    return normalized !== "i keep the work recoverable without claiming a false ready preview";
  });
  const state = workJournalToActivityState({ ...block, entries: visibleEntries });
  const retry = message.actions?.find(action => /retry|reessayer|réessayer|corriger/i.test(action.label))?.onClick;
  return <AgentActivityStream state={state} onRetry={retry} />;
}

function renderMessageBlock(message: HuggyConversationMessage) {
  const block = message.block;
  if (!block) return null;

  if (block.type === "work_journal") {
    return null;
  }

  if (block.type === "reasoning") {
    return null;
  }

  return (
    <div className="huggy-confirm" data-state={block.state}>
      <p>{block.body}</p>
      <div className="huggy-confirm-actions">
        {message.actions?.length ? message.actions.map(action => (
          <button key={action.id} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        )) : (
          <>
            <button type="button">{block.rejectLabel || "Cancel"}</button>
            <button type="button">{block.approveLabel || "Continue"}</button>
          </>
        )}
      </div>
    </div>
  );
}

function renderWorkingStatus(message: HuggyConversationMessage) {
  const contentLower = message.content.toLowerCase();
  const isFrench = /[\u00C0-\u017F]/i.test(message.content) || 
                   /ecrit|precise|prepare|generation|en cours|je |corriger/i.test(contentLower);
  const label = isFrench ? "Génération en cours" : "Generating";

  return (
    <span className="huggy-message-waiting" aria-live="polite">
      {label}
    </span>
  );
}

function renderAgentTrace(message: HuggyConversationMessage) {
  // Legacy traces are intentionally not rendered anymore.
  // The builder now uses a simple wait state plus a final response/preview.
  // Keeping this as a no-op preserves the old API surface.
  void message;
  return null;
}

const BuilderConversationMessageItem = React.memo(function BuilderConversationMessageItem({
  message,
  feedback,
  onPositive,
  onNegative,
  onExpand,
}: {
  message: HuggyConversationMessage;
  feedback?: MessageFeedbackValue;
  onPositive: (message: HuggyConversationMessage) => void;
  onNegative: (message: HuggyConversationMessage) => void;
  onExpand: (message: HuggyConversationMessage) => void;
}) {
  const block = renderMessageBlock(message);
  const trace = renderAgentTrace(message);
  const contentIsTraceLike = Boolean(trace);

  return (
    <Message from={message.role}>
      <div className="huggy-message-stack">
        <MessageContent className={contentIsTraceLike ? "huggy-message-content-trace" : undefined}>
          {trace || block ? (
            <>
              {trace}
              {block}
            </>
          ) : (
            message.working ? renderWorkingStatus(message) : renderStandardMessageContent(message)
          )}
          {message.actions?.length && message.block?.type !== "confirmation" ? (
            <div className="huggy-message-actions">
              {message.actions.map(action => (
                <button key={action.id} type="button" onClick={action.onClick}>
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </MessageContent>
        <MessageUtilityBar
          message={message}
          feedback={feedback}
          onPositive={onPositive}
          onNegative={onNegative}
          onExpand={onExpand}
        />
      </div>
    </Message>
  );
});

function compactMessagesForRender(messages: HuggyConversationMessage[]) {
  return messages.length > 140 ? messages.slice(-140) : messages;
}

type MessageFeedbackValue = "positive" | "negative";

type FeedbackModalState = {
  message: HuggyConversationMessage;
  rating: MessageFeedbackValue;
};

const NEGATIVE_FEEDBACK_REASONS = [
  { id: "incorrect_or_incomplete", label: "Incorrect ou incomplet" },
  { id: "instructions_not_followed", label: "N'a pas suivi mes instructions" },
  { id: "off_topic_or_wrong_scope", label: "Hors sujet / portee inadequate" },
  { id: "lost_context", label: "Contexte perdu" },
  { id: "slow_or_buggy", label: "Lent ou bogue" },
  { id: "other", label: "Autre" },
];

function formatMessageTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
}

function dispatchConversationFeedback(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent("huggy-agent-feedback", { detail }));
}

function dispatchConversationEdit(message: HuggyConversationMessage) {
  window.dispatchEvent(new CustomEvent("huggy-edit-message", {
    detail: {
      messageId: message.id,
      content: message.content,
      role: message.role,
    },
  }));
}

async function copyMessageText(message: HuggyConversationMessage) {
  const text = message.content || "";
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function MessageUtilityBar({
  message,
  feedback,
  onPositive,
  onNegative,
  onExpand,
}: {
  message: HuggyConversationMessage;
  feedback?: MessageFeedbackValue;
  onPositive: (message: HuggyConversationMessage) => void;
  onNegative: (message: HuggyConversationMessage) => void;
  onExpand: (message: HuggyConversationMessage) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const copyTimer = React.useRef<number | null>(null);
  const time = formatMessageTime(message.createdAt);
  const isAssistant = message.role === "assistant";
  const handleCopy = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void copyMessageText(message).then(() => {
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1300);
    });
  }, [message]);

  React.useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);

  if (message.role === "system" || message.working) return null;

  return (
    <div className="huggy-message-utility" aria-label="Message actions">
      <button type="button" data-tooltip={copied ? "Copié" : "Copier"} aria-label={copied ? "Message copié" : "Copier"} onClick={handleCopy}>
        <Copy aria-hidden="true" />
      </button>
      {isAssistant ? (
        <>
          <button
            type="button"
            data-tooltip="Bonne reponse"
            data-feedback="positive"
            data-active={feedback === "positive" ? "true" : "false"}
            aria-label="Bonne reponse"
            data-mobile-secondary="true"
            onClick={event => {
              event.stopPropagation();
              onPositive(message);
            }}
          >
            <ThumbsUp aria-hidden="true" />
          </button>
          <button
            type="button"
            data-tooltip="Signaler un probleme"
            data-feedback="negative"
            data-active={feedback === "negative" ? "true" : "false"}
            aria-label="Signaler un probleme"
            data-mobile-secondary="true"
            onClick={event => {
              event.stopPropagation();
              onNegative(message);
            }}
          >
            <ThumbsDown aria-hidden="true" />
          </button>
          <button
            type="button"
            data-tooltip="Ouvrir"
            aria-label="Ouvrir le message"
            data-mobile-secondary="true"
            onClick={event => {
              event.stopPropagation();
              onExpand(message);
            }}
          >
            <Maximize2 aria-hidden="true" />
          </button>
        </>
      ) : (
        <button
          type="button"
          data-tooltip="Modifier"
          aria-label="Modifier ce message"
          data-mobile-secondary="true"
          onClick={event => {
            event.stopPropagation();
            dispatchConversationEdit(message);
          }}
        >
          <Pencil aria-hidden="true" />
        </button>
      )}
      {time ? <span className="huggy-message-time">{time}</span> : null}
    </div>
  );
}

function MessageDetailModal({
  message,
  onClose,
}: {
  message: HuggyConversationMessage | null;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!message) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="huggy-feedback-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="huggy-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="huggy-message-detail-title">
        <div className="huggy-feedback-head">
          <h3 id="huggy-message-detail-title">Message</h3>
          <button className="huggy-feedback-close" type="button" aria-label="Fermer" onClick={onClose}>
            <XIcon size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="huggy-message-detail-body">
          {renderStandardMessageContent(message)}
        </div>
      </section>
    </div>
  );
}

function FeedbackModal({
  state,
  onClose,
  onSubmit,
}: {
  state: FeedbackModalState | null;
  onClose: () => void;
  onSubmit: (reasons: string[], comment: string) => void;
}) {
  const [reasons, setReasons] = React.useState<string[]>([]);
  const [comment, setComment] = React.useState("");

  React.useEffect(() => {
    if (!state) return;
    setReasons([]);
    setComment("");
  }, [state?.message.id]);

  React.useEffect(() => {
    if (!state) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, onClose]);

  if (!state) return null;

  const toggleReason = (reason: string) => {
    setReasons(current => current.includes(reason)
      ? current.filter(item => item !== reason)
      : [...current, reason]);
  };

  const canSubmit = reasons.length > 0 || comment.trim().length > 0;

  return (
    <div className="huggy-feedback-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="huggy-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="huggy-feedback-title">
        <div className="huggy-feedback-head">
          <h3 id="huggy-feedback-title">Partager votre retroaction</h3>
          <button className="huggy-feedback-close" type="button" aria-label="Fermer" onClick={onClose}>
            <XIcon size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="huggy-feedback-reasons" aria-label="Raisons du feedback">
          {NEGATIVE_FEEDBACK_REASONS.map(reason => (
            <button
              className="huggy-feedback-reason"
              key={reason.id}
              type="button"
              data-selected={reasons.includes(reason.id) ? "true" : "false"}
              onClick={() => toggleReason(reason.id)}
            >
              + {reason.label}
            </button>
          ))}
        </div>
        <textarea
          className="huggy-feedback-textarea"
          value={comment}
          onChange={event => setComment(event.target.value)}
          placeholder="Expliquez ce qui n'allait pas ou ce que Huggy aurait du mieux comprendre..."
          autoFocus
        />
        <p className="huggy-feedback-note">
          Vos commentaires servent a ameliorer Huggy. Ne partagez pas de mot de passe, cle API ou donnee sensible.
        </p>
        <button
          className="huggy-feedback-submit"
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(reasons, comment)}
        >
          Envoyer
        </button>
      </section>
    </div>
  );
}

function BuilderConversation({
  messages,
}: {
  messages: HuggyConversationMessage[];
}) {
  const [feedbackByMessage, setFeedbackByMessage] = React.useState<Record<string, MessageFeedbackValue>>({});
  const [feedbackModal, setFeedbackModal] = React.useState<FeedbackModalState | null>(null);
  const [expandedMessage, setExpandedMessage] = React.useState<HuggyConversationMessage | null>(null);

  const sendFeedback = React.useCallback((message: HuggyConversationMessage, rating: MessageFeedbackValue, reasons: string[] = [], comment = "") => {
    setFeedbackByMessage(current => ({ ...current, [message.id]: rating }));
    dispatchConversationFeedback({
      messageId: message.id,
      role: message.role,
      content: message.content,
      rating,
      feedback: rating === "positive" ? "keep" : "reject",
      reasons,
      comment,
    });
  }, []);
  const handlePositive = React.useCallback((target: HuggyConversationMessage) => sendFeedback(target, "positive"), [sendFeedback]);
  const handleNegative = React.useCallback((target: HuggyConversationMessage) => setFeedbackModal({ message: target, rating: "negative" }), []);

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
            <BuilderConversationMessageItem
              feedback={feedbackByMessage[message.id]}
              key={message.id}
              message={message}
              onExpand={setExpandedMessage}
              onNegative={handleNegative}
              onPositive={handlePositive}
            />
          ))
        )}
      </ConversationContent>
      <FeedbackModal
        state={feedbackModal}
        onClose={() => setFeedbackModal(null)}
        onSubmit={(reasons, comment) => {
          if (feedbackModal) sendFeedback(feedbackModal.message, feedbackModal.rating, reasons, comment);
          setFeedbackModal(null);
        }}
      />
      <MessageDetailModal message={expandedMessage} onClose={() => setExpandedMessage(null)} />
    </Conversation>
  );
}

export function mountBuilderConversation(host: HTMLElement): HuggyConversationApi {
  ensureConversationStyles();
  host.innerHTML = "";
  host.dataset.reactConversation = "true";

  const root: Root = createRoot(host);
  let messages: HuggyConversationMessage[] = [];
  let renderFrame = 0;

  const render = () => {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      root.render(<BuilderConversation messages={compactMessagesForRender(messages)} />);
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
          parts: message.parts,
          working: Boolean(message.working),
          trace: message.trace || null,
          block: message.block,
          actions: [],
          createdAt: new Date().toISOString(),
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
