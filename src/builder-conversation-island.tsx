import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { Check, ChevronDown, Copy, FileText, ListChecks, Maximize2, MessageSquareIcon, Pencil, ThumbsDown, ThumbsUp, XIcon } from "lucide-react";
import { nanoid } from "nanoid";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "./components/ai-elements/conversation";
import type { ConfirmationState } from "./components/ai-elements/confirmation";
import { Message, MessageContent } from "./components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./components/ai-elements/reasoning";
import { ShiningText } from "./components/ai-elements/shining-text";
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
  role: HuggyConversationRole;
  working?: boolean;
  trace?: HuggyAgentTrace | null;
  block?: HuggyConversationBlock;
  actions?: HuggyConversationAction[];
  createdAt?: string;
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

    .huggy-flowline {
      --flow-muted: color-mix(in srgb, var(--text-sub, var(--text-muted)) 88%, transparent);
      --flow-soft: color-mix(in srgb, var(--text-sub, var(--text-muted)) 52%, transparent);
      display: grid;
      gap: 9px;
      width: min(100%, 600px);
      color: var(--text);
      padding: 2px 0;
      position: relative;
    }

    .huggy-flowline-head {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
      color: var(--flow-muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: -.01em;
    }

    .huggy-flowline-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      flex: 0 0 auto;
      background: var(--accent-blue, #2f6df6);
      box-shadow: 0 0 0 3px var(--accent-blue-soft, rgba(47,109,246,.12));
    }

    .huggy-flowline[data-status="active"] .huggy-flowline-dot {
      animation: huggy-flowline-breathe 1.45s cubic-bezier(.22,1,.36,1) infinite;
    }

    .huggy-flowline[data-status="failed"] .huggy-flowline-dot {
      background: #ef4444;
      box-shadow: 0 0 0 3px rgba(239,68,68,.12);
    }

    .huggy-flowline[data-status="cancelled"] .huggy-flowline-dot {
      background: var(--text-muted, #6f6a5f);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--text-muted, #6f6a5f) 14%, transparent);
    }

    .huggy-flowline-state {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .huggy-flowline-time {
      margin-left: auto;
      color: var(--flow-soft);
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      font-weight: 680;
    }

    .huggy-flowline-current {
      margin: 0;
      color: var(--text);
      font-size: 14px;
      font-weight: 720;
      line-height: 1.45;
      letter-spacing: -.01em;
      animation: huggy-flowline-in 180ms cubic-bezier(.22,1,.36,1) both;
    }

    .huggy-flowline-feed {
      display: grid;
      gap: 6px;
      padding-left: 16px;
      border-left: 1px solid color-mix(in srgb, var(--border-light, var(--border)) 72%, transparent);
    }

    .huggy-flowline-row,
    .huggy-flowline-file,
    .huggy-flowline-command,
    .huggy-flowline-final,
    .huggy-flowline-more,
    .huggy-flowline-group summary {
      display: flex;
      align-items: baseline;
      gap: 7px;
      min-width: 0;
      margin: 0;
      color: var(--flow-muted);
      font-size: 12.5px;
      line-height: 1.45;
      animation: huggy-flowline-in 170ms cubic-bezier(.22,1,.36,1) both;
    }

    .huggy-flowline-row[data-status="active"],
    .huggy-flowline-command[data-status="active"] {
      color: var(--text);
      font-weight: 710;
    }

    .huggy-flowline-row[data-status="failed"],
    .huggy-flowline-file[data-status="failed"],
    .huggy-flowline-command[data-status="failed"],
    .huggy-flowline-final[data-status="failed"] {
      color: #ef4444;
    }

    .huggy-flowline-row span,
    .huggy-flowline-file span,
    .huggy-flowline-command span,
    .huggy-flowline-group span {
      min-width: 0;
    }

    .huggy-flowline-detail {
      color: var(--flow-soft);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .huggy-flowline-file svg {
      width: 13px;
      height: 13px;
      flex: 0 0 auto;
      color: var(--flow-soft);
      transform: translateY(2px);
    }

    .huggy-flowline code {
      color: var(--text);
      background: transparent;
      border: 0;
      padding: 0;
      font: inherit;
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      font-size: .96em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .huggy-flowline-add {
      color: #22c55e;
      font-variant-numeric: tabular-nums;
      font-weight: 720;
    }

    .huggy-flowline-del {
      color: #fb7185;
      font-variant-numeric: tabular-nums;
      font-weight: 720;
    }

    .huggy-flowline-spinner {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      flex: 0 0 auto;
      background: currentColor;
      opacity: .55;
      transform: translateY(1px);
      animation: huggy-flowline-breathe 1.15s cubic-bezier(.22,1,.36,1) infinite;
    }

    .huggy-flowline-group {
      margin: 0;
    }

    .huggy-flowline-group summary {
      cursor: pointer;
      list-style: none;
    }

    .huggy-flowline-group summary::-webkit-details-marker {
      display: none;
    }

    .huggy-flowline-group ul {
      display: grid;
      gap: 4px;
      margin: 6px 0 0 17px;
      padding: 0;
      color: var(--flow-soft);
      font-size: 12px;
      line-height: 1.4;
    }

    .huggy-flowline-final {
      color: var(--text);
      font-weight: 650;
      white-space: pre-wrap;
    }

    .huggy-flowline-more {
      color: var(--flow-soft);
      font-size: 11.5px;
    }

    .huggy-buildstream {
      display: grid;
      gap: 16px;
      width: min(100%, 610px);
      color: var(--text);
      padding: 2px 0 4px;
    }

    .huggy-buildstream-thinking {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: color-mix(in srgb, var(--text-sub, var(--text-muted)) 82%, transparent);
      font-size: 12px;
      font-weight: 650;
      letter-spacing: -.01em;
    }

    .huggy-buildstream-chevron {
      width: 7px;
      height: 7px;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: rotate(45deg) translateY(-2px);
      opacity: .72;
    }

    .huggy-buildstream-phase {
      display: grid;
      gap: 10px;
      padding-left: 24px;
      animation: huggy-buildstream-in 190ms cubic-bezier(.22,1,.36,1) both;
    }

    .huggy-buildstream-title {
      margin: 0;
      color: var(--text);
      font-size: 14px;
      font-weight: 760;
      line-height: 1.35;
      letter-spacing: -.01em;
    }

    .huggy-buildstream-copy {
      max-width: 52ch;
      margin: 0;
      color: color-mix(in srgb, var(--text-sub, var(--text-muted)) 88%, transparent);
      font-size: 12.5px;
      line-height: 1.55;
    }

    .huggy-buildstream-feature-title {
      margin: 8px 0 -3px;
      color: var(--text);
      font-size: 13px;
      font-weight: 760;
      line-height: 1.35;
    }

    .huggy-buildstream-features {
      display: grid;
      gap: 5px;
      margin: 8px 0 0;
      padding-left: 18px;
      color: color-mix(in srgb, var(--text-sub, var(--text-muted)) 92%, transparent);
      font-size: 12.5px;
      line-height: 1.45;
    }

    .huggy-buildstream-commit {
      margin: 4px 0 0;
      color: var(--text);
      font-size: 12.5px;
      font-weight: 650;
      line-height: 1.45;
    }

    .huggy-buildstream-card {
      display: grid;
      gap: 8px;
      margin-left: 12px;
      border: 1px solid color-mix(in srgb, var(--border-light, var(--border)) 82%, transparent);
      border-radius: 9px;
      background: color-mix(in srgb, var(--bg-input) 82%, transparent);
      box-shadow: 0 1px 0 color-mix(in srgb, var(--surface) 8%, transparent) inset;
      padding: 10px;
      animation: huggy-buildstream-in 210ms cubic-bezier(.22,1,.36,1) both;
    }

    .huggy-buildstream-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: color-mix(in srgb, var(--text-sub, var(--text-muted)) 90%, transparent);
      font-size: 12px;
      font-weight: 680;
      font-variant-numeric: tabular-nums;
    }

    .huggy-buildstream-card-title,
    .huggy-buildstream-card-actions,
    .huggy-buildstream-status-left,
    .huggy-buildstream-status-icons {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }

    .huggy-buildstream-card-actions {
      margin-left: auto;
      color: color-mix(in srgb, var(--text-sub, var(--text-muted)) 72%, transparent);
    }

    .huggy-buildstream-card-actions svg {
      opacity: .72;
    }

    .huggy-buildstream-card-head svg {
      width: 14px;
      height: 14px;
      flex: 0 0 auto;
      color: currentColor;
    }

    .huggy-buildstream-task {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      min-height: 24px;
      color: color-mix(in srgb, var(--text-sub, var(--text-muted)) 88%, transparent);
      font-size: 12.5px;
      line-height: 1.35;
    }

    .huggy-buildstream-task[data-status="active"] {
      color: var(--text);
      font-weight: 710;
    }

    .huggy-buildstream-task[data-status="done"] {
      color: color-mix(in srgb, var(--text-sub, var(--text-muted)) 78%, transparent);
    }

    .huggy-buildstream-task[data-status="done"] > span:last-child {
      text-decoration: line-through;
      text-decoration-thickness: 1px;
      text-decoration-color: color-mix(in srgb, currentColor 70%, transparent);
      opacity: .72;
    }

    .huggy-buildstream-task[data-status="failed"] {
      color: #ef4444;
    }

    .huggy-buildstream-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--text-sub, var(--text-muted)) 42%, transparent);
      color: inherit;
      font-size: 10px;
      line-height: 1;
    }

    .huggy-buildstream-mark svg {
      width: 10px;
      height: 10px;
      stroke-width: 3;
    }

    .huggy-buildstream-task[data-status="active"] .huggy-buildstream-mark {
      border-style: dashed;
      animation: huggy-buildstream-spin 1.2s linear infinite;
    }

    .huggy-buildstream-task[data-status="done"] .huggy-buildstream-mark {
      border-color: #22c55e;
      background: #22c55e;
      color: #fff;
      animation: huggy-buildstream-pop 180ms cubic-bezier(.22,1,.36,1) both;
    }

    .huggy-buildstream-statusbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: 12px;
      border: 1px solid color-mix(in srgb, var(--border-light, var(--border)) 72%, transparent);
      border-radius: 8px;
      background: color-mix(in srgb, var(--bg-input) 74%, transparent);
      color: color-mix(in srgb, var(--text-sub, var(--text-muted)) 88%, transparent);
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 680;
    }

    .huggy-buildstream-statusbar svg {
      width: 14px;
      height: 14px;
      flex: 0 0 auto;
      color: currentColor;
    }

    .huggy-buildstream-status-spacer {
      flex: 1 1 auto;
    }

    .huggy-buildstream[data-status="done"] .huggy-buildstream-thinking,
    .huggy-buildstream[data-status="failed"] .huggy-buildstream-thinking,
    .huggy-buildstream[data-status="cancelled"] .huggy-buildstream-thinking {
      opacity: .58;
    }

    .huggy-buildstream[data-restored="true"] * {
      animation: none !important;
    }

    @keyframes huggy-buildstream-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes huggy-buildstream-spin {
      to { transform: rotate(360deg); }
    }

    @keyframes huggy-buildstream-pop {
      from { transform: scale(.82); }
      to { transform: scale(1); }
    }

    .huggy-flowline[data-restored="true"] *,
    .huggy-flowline[data-restored="true"] .huggy-flowline-current {
      animation: none;
    }

    @keyframes huggy-flowline-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes huggy-flowline-breathe {
      0%, 100% { opacity: .38; transform: scale(.92); }
      50% { opacity: .9; transform: scale(1.05); }
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

    @media (max-width: 680px) {
      .huggy-flowline {
        gap: 7px;
        width: 100%;
      }

      .huggy-flowline-feed {
        gap: 5px;
        padding-left: 12px;
      }

      .huggy-flowline-feed .huggy-flowline-row:nth-last-child(n+5),
      .huggy-flowline-feed .huggy-flowline-file:nth-last-child(n+5),
      .huggy-flowline-feed .huggy-flowline-command:nth-last-child(n+5),
      .huggy-flowline-feed .huggy-flowline-group:nth-last-child(n+5) {
        display: none;
      }

      .huggy-flowline-current,
      .huggy-flowline-final {
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .huggy-buildstream {
        gap: 12px;
      }

      .huggy-buildstream-phase,
      .huggy-buildstream-card,
      .huggy-buildstream-statusbar {
        margin-left: 0;
      }

      .huggy-buildstream-copy,
      .huggy-buildstream-features li:nth-child(n+4) {
        display: none;
      }

      .huggy-buildstream-card {
        padding: 9px;
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
      .huggy-flowline *,
      .huggy-buildstream *,
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

function renderStandardMessageContent(message: HuggyConversationMessage) {
  if (message.role === "assistant") return renderAssistantMarkdown(message.content);
  return renderPlainMessage(message.content);
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

function renderWorkJournalBlock(block: Extract<HuggyConversationBlock, { type: "work_journal" }>) {
  const statusLabel = block.status === "done"
    ? "Terminé"
    : block.status === "failed"
      ? "À corriger"
      : block.status === "cancelled"
        ? "Arrêté"
        : "En cours";
  const elapsed = block.elapsed ? block.elapsed : "";
  const maxVisibleEntries = block.status === "active" ? 9 : 11;
  const hiddenEntryCount = Math.max(0, block.entries.length - maxVisibleEntries);
  const visibleEntries = block.entries.slice(-maxVisibleEntries);
  const finalTextKey = workJournalCompareText(block.finalText || "");
  const finalAlreadyVisible = Boolean(finalTextKey) && visibleEntries.some(entry => {
    if (entry.kind === "group" || entry.kind === "divider") return false;
    return [entry.text, entry.detail].some(value => {
      const key = workJournalCompareText(value || "");
      return key && (key === finalTextKey || key.includes(finalTextKey) || finalTextKey.includes(key));
    });
  });
  const currentLine = block.status === "active"
    ? block.activeText || "Je prépare la suite."
    : block.status === "failed"
      ? "Le travail reste récupérable."
      : block.status === "cancelled"
        ? "Le run a été arrêté."
        : "Version prête à vérifier.";

  return (
    <div className="huggy-workline" data-status={block.status} aria-live={block.status === "active" ? "polite" : undefined}>
      <div className="huggy-workline-rail" aria-hidden="true">
        <span />
      </div>
      <div className="huggy-workline-body">
        <div className="huggy-workline-head">
          <span>Huggy</span>
          <strong>{statusLabel}</strong>
          {elapsed ? <em>{elapsed}</em> : null}
        </div>
        <p className="huggy-workline-current">{currentLine}</p>
        <div className="huggy-workline-feed">
          {hiddenEntryCount > 0 ? (
            <p className="huggy-workline-note" data-status="muted">
              {hiddenEntryCount} étapes précédentes compactées.
            </p>
          ) : null}
          {visibleEntries.map(entry => {
          if (entry.kind === "divider") {
            return (
              <div className="huggy-workline-divider" key={entry.id}>
                <span>{entry.text}</span>
              </div>
            );
          }

          if (entry.kind === "file_edit") {
            const actionLabel = entry.action === "created"
              ? "Creation de"
              : entry.action === "deleted"
                ? "Suppression de"
                : "Modification de";
            return (
              <p className="huggy-workline-file" data-status={entry.status || "done"} key={entry.id}>
                <Pencil size={16} aria-hidden="true" />
                <span>{actionLabel}</span>
                <code>{entry.path || entry.text}</code>
                <span className="huggy-workline-diff-add">+{Math.max(0, Number(entry.additions || 0))}</span>
                <span className="huggy-workline-diff-del">-{Math.max(0, Number(entry.deletions || 0))}</span>
              </p>
            );
          }

          if (entry.kind === "command") {
            return (
              <p className="huggy-workline-command" data-status={entry.status || "active"} key={entry.id}>
                <span className="huggy-workline-icon" aria-hidden="true">›</span>
                <span>{entry.text}</span>
                {entry.command ? <code>{entry.command}</code> : null}
              </p>
            );
          }

          if (entry.kind === "group") {
            const count = entry.items?.length || 0;
            return (
              <details className="huggy-workline-group" key={entry.id}>
                <summary>
                  <span className="huggy-workline-icon" aria-hidden="true">⌁</span>
                  <span>{count ? `${count} ${entry.text}` : entry.text}</span>
                </summary>
                {count ? (
                  <ul>
                    {entry.items?.map((item, index) => (
                      <li key={`${entry.id}_${index}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </details>
            );
          }

          return (
            <p className="huggy-workline-note" data-status={entry.status || "done"} key={entry.id}>
              {entry.text}
              {entry.detail ? <span>{entry.detail}</span> : null}
            </p>
          );
        })}
          {block.status === "active" ? (
            <p className="huggy-workline-live">
              <span className="huggy-workline-live-dot" aria-hidden="true" />
              <span>{block.activeText || "Huggy avance"}</span>
            </p>
          ) : null}
          {block.finalText && !finalAlreadyVisible ? (
            <p className="huggy-workline-final">{block.finalText}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function streamTextLooksFrench(block: Extract<HuggyConversationBlock, { type: "work_journal" }>) {
  const sample = [
    block.activeText || "",
    block.finalText || "",
    ...block.entries.slice(-8).flatMap(entry => [entry.text || "", entry.detail || ""]),
  ].join(" ").toLowerCase();
  return /\b(je|tu|vous|nous|pret|prêt|preview|fichier|corrige|verifie|vérifie|application|generation|génération|termine|terminé|bloque|bloqué)\b/.test(sample);
}

function buildStreamTasks(block: Extract<HuggyConversationBlock, { type: "work_journal" }>, isFrench: boolean) {
  const hasFile = block.entries.some(entry => entry.kind === "file_edit");
  const hasPreview = block.entries.some(entry => /preview|aperçu/i.test(`${entry.text} ${entry.detail || ""}`));
  const hasCheck = block.entries.some(entry => entry.kind === "command" || entry.kind === "group" || /check|verif|vérif|build/i.test(`${entry.text} ${entry.detail || ""}`));
  const failed = block.status === "failed";
  const done = block.status === "done";
  return [
    {
      label: isFrench ? "Définir le périmètre initial" : "Define the initial scope",
      status: "done",
    },
    {
      label: isFrench ? "Créer les fichiers de l’application" : "Create the application files",
      status: failed && !hasFile ? "failed" : hasFile || done ? "done" : "active",
    },
    {
      label: isFrench ? "Ouvrir et vérifier la preview" : "Open and verify the preview",
      status: failed ? "failed" : hasPreview || hasCheck || done ? "done" : hasFile ? "active" : "pending",
    },
  ] as Array<{ label: string; status: "pending" | "active" | "done" | "failed" }>;
}

function renderBuildStreamBlock(block: Extract<HuggyConversationBlock, { type: "work_journal" }>) {
  const isFrench = streamTextLooksFrench(block);
  const tasks = buildStreamTasks(block, isFrench);
  const doneCount = tasks.filter(task => task.status === "done").length;
  const hasFile = block.entries.some(entry => entry.kind === "file_edit");
  const hasPreview = block.entries.some(entry => /preview|aperçu/i.test(`${entry.text} ${entry.detail || ""}`)) || block.status === "done";
  const hasCheck = block.entries.some(entry => entry.kind === "command" || entry.kind === "group" || /check|verif|vérif|build/i.test(`${entry.text} ${entry.detail || ""}`));
  const lastUsefulLine = block.entries
    .slice()
    .reverse()
    .find(entry => entry.kind !== "divider" && entry.kind !== "group" && entry.text);
  const phaseTitle = block.status === "failed"
    ? (isFrench ? "Point bloquant détecté" : "Blocking point detected")
    : block.status === "done"
      ? (isFrench ? "Version prête à tester" : "Version ready to test")
      : hasPreview || hasCheck
        ? (isFrench ? "Vérification de la preview" : "Verifying the preview")
        : hasFile
          ? (isFrench ? "Construction de l’application" : "Building the application")
          : (isFrench ? "Définition du périmètre initial" : "Defining the initial scope");
  const body = block.status === "failed"
    ? block.finalText || (isFrench ? "Je garde le travail récupérable et j’isole le blocage restant." : "I am keeping the work recoverable and isolating the remaining blocker.")
    : block.status === "done"
      ? block.finalText || (isFrench ? "La génération est terminée. Tu peux maintenant tester la preview." : "The generation is complete. You can now test the preview.")
      : lastUsefulLine?.detail || lastUsefulLine?.text || block.activeText || (isFrench ? "Je prépare la structure, les fichiers et la preview sans afficher de logs inutiles." : "I am preparing the structure, files, and preview without noisy logs.");
  const featureTitle = isFrench ? "Première version :" : "First Version Features:";
  const features = [
    isFrench ? "Structure d’application propre et modifiable" : "Clean editable app structure",
    hasFile ? (isFrench ? "Fichiers ciblés mis à jour" : "Targeted files updated") : (isFrench ? "Fichiers nécessaires préparés" : "Required files prepared"),
    hasPreview ? (isFrench ? "Preview synchronisée" : "Preview synchronized") : (isFrench ? "Preview préparée" : "Preview prepared"),
    hasCheck ? (isFrench ? "Vérifications prises en compte" : "Checks accounted for") : (isFrench ? "Interactions et états UI prévus" : "Interactions and UI states planned"),
  ];
  const thinkingLabel = block.status === "active"
    ? "Thinking..."
    : block.status === "failed"
      ? (isFrench ? "À corriger" : "Needs fix")
      : block.status === "cancelled"
        ? (isFrench ? "Arrêté" : "Stopped")
        : (isFrench ? "Terminé" : "Done");
  const progressLabel = isFrench
    ? `${doneCount}/${tasks.length} tâches terminées`
    : `${doneCount}/${tasks.length} tasks done`;
  const commitLine = isFrench ? "Je passe à l’exécution." : "Let’s implement this design:";

  return (
    <div
      className="huggy-buildstream"
      data-restored={block.restored ? "true" : "false"}
      data-status={block.status}
      aria-live={block.status === "active" ? "polite" : "off"}
    >
      <div className="huggy-buildstream-thinking">
        <span className="huggy-buildstream-chevron" aria-hidden="true" />
        <span>{thinkingLabel}</span>
      </div>
      <div className="huggy-buildstream-phase">
        <p className="huggy-buildstream-title">{phaseTitle}</p>
        <p className="huggy-buildstream-copy">{body}</p>
        <p className="huggy-buildstream-feature-title">{featureTitle}</p>
        <ul className="huggy-buildstream-features">
          {features.map(feature => <li key={feature}>{feature}</li>)}
        </ul>
        <p className="huggy-buildstream-commit">{commitLine}</p>
      </div>
      <div className="huggy-buildstream-card">
        <div className="huggy-buildstream-card-head">
          <span className="huggy-buildstream-card-title">
            <ListChecks aria-hidden="true" />
            <span>{progressLabel}</span>
          </span>
          <span className="huggy-buildstream-card-actions" aria-hidden="true">
            <ChevronDown />
            <XIcon />
          </span>
        </div>
        {tasks.map(task => (
          <div className="huggy-buildstream-task" data-status={task.status} key={task.label}>
            <span className="huggy-buildstream-mark" aria-hidden="true">{task.status === "done" ? <Check /> : ""}</span>
            <span>{task.label}</span>
          </div>
        ))}
      </div>
      <div className="huggy-buildstream-statusbar">
        <span className="huggy-buildstream-status-left">
          <span className="huggy-buildstream-status-icons" aria-hidden="true">
            <ListChecks />
            <FileText />
          </span>
          <span>{progressLabel}</span>
        </span>
        <span className="huggy-buildstream-status-spacer" />
        <ChevronDown aria-hidden="true" />
      </div>
    </div>
  );
}

function renderMessageBlock(message: HuggyConversationMessage) {
  const block = message.block;
  if (!block) return null;

  if (block.type === "work_journal") {
    return renderBuildStreamBlock(block);
  }

  if (block.type === "reasoning") {
    return (
      <Reasoning isStreaming={Boolean(block.isStreaming)}>
        <ReasoningTrigger>{block.title || "Agent notes"}</ReasoningTrigger>
        <ReasoningContent>{block.isStreaming ? <ShiningText text={block.content} /> : block.content}</ReasoningContent>
      </Reasoning>
    );
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
  const lines = message.content.split("\n").map(line => line.trim()).filter(Boolean);
  const [headline = "Huggy ecrit", ...details] = lines;
  const activeDetail = details.find(step => step.startsWith("now:"));
  const latestDetail = activeDetail || details[details.length - 1] || "";
  const cleanDetail = latestDetail.replace(/^(done|now):\s*/, "").trim();
  const showDetail = cleanDetail && !headline.toLowerCase().includes(cleanDetail.toLowerCase());

  return (
    <span className="huggy-message-waiting" aria-live="polite">
      {showDetail ? `${headline} · ${cleanDetail}` : headline}
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
