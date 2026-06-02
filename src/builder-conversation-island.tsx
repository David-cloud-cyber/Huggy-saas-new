import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { CheckIcon, FileText, MessageSquareIcon, XIcon } from "lucide-react";
import { nanoid } from "nanoid";

import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
  type ConversationDownloadMessage,
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
    };

export type HuggyConversationMessage = {
  id: string;
  content: string;
  role: HuggyConversationRole;
  working?: boolean;
  block?: HuggyConversationBlock;
  actions?: HuggyConversationAction[];
};

export type HuggyConversationApi = {
  addMessage: (message: { id?: string; role: HuggyConversationRole; content: string; working?: boolean; block?: HuggyConversationBlock }) => string;
  updateMessage: (id: string, content: string) => void;
  setWorking: (id: string, label: string) => void;
  clearWorking: (id: string) => void;
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
      white-space: pre-wrap;
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

    .huggy-working-steps {
      display: grid;
      gap: 5px;
      margin-top: 9px;
      padding-top: 9px;
      border-top: 1px solid var(--border-light, var(--border));
      color: var(--text-sub);
      font-size: 11.5px;
      line-height: 1.45;
    }

    .huggy-working-step {
      display: flex;
      gap: 7px;
      align-items: flex-start;
    }

    .huggy-working-step strong {
      color: var(--text);
      font-weight: 800;
      font-size: 10px;
      min-width: 14px;
      text-align: center;
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

    @media (prefers-reduced-motion: reduce) {
      .huggy-message {
        animation: none !important;
      }

      .huggy-message-actions button,
      .huggy-conversation-download,
      .huggy-conversation-scroll,
      .huggy-reasoning-streaming .huggy-reasoning-dot {
        transition: none !important;
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function blockToText(block: HuggyConversationBlock | undefined, fallback: string) {
  if (!block) return fallback;
  if (block.type === "reasoning") return `${block.title || "Agent notes"}\n${block.content}`;
  if (block.type === "plan") return `${block.title}\n${block.description || ""}\n${block.content}`.trim();
  if (block.type === "task") return [block.title, ...block.items.map(item => `${item.status || "pending"}: ${item.label}`)].join("\n");
  return `${block.title}\n${block.body}`;
}

function planSummary(content: string) {
  const firstLine = content.split("\n").map(line => line.trim()).find(Boolean);
  if (!firstLine) return "Huggy prepared a short implementation plan before changing the app.";
  return firstLine.length > 170 ? `${firstLine.slice(0, 167)}...` : firstLine;
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

function renderWorkingBlock(message: HuggyConversationMessage) {
  const [headline = "Thinking", ...steps] = message.content.split("\n").filter(Boolean);
  const taskItems = steps.map((step, index) => {
    const done = step.startsWith("done:");
    const active = step.startsWith("now:");
    const label = step.replace(/^(done|now):\s*/, "");
    return {
      id: `${message.id}_step_${index}`,
      label,
      status: done ? "done" as const : active ? "active" as const : "pending" as const,
    };
  });

  return (
    <>
      <Reasoning isStreaming>
        <ReasoningTrigger>{headline}</ReasoningTrigger>
        <ReasoningContent>
          <ShiningText text={headline} />
        </ReasoningContent>
      </Reasoning>
      {taskItems.length ? (
        <Task defaultOpen>
          <TaskTrigger title="What Huggy is doing" />
          <TaskContent>
            {taskItems.map(item => (
              <TaskItem key={item.id} status={item.status}>
                {item.label}
              </TaskItem>
            ))}
          </TaskContent>
        </Task>
      ) : null}
    </>
  );
}

function BuilderConversation({
  messages,
}: {
  messages: HuggyConversationMessage[];
}) {
  const downloadableMessages = React.useMemo<ConversationDownloadMessage[]>(
    () => messages.map(message => ({
      key: message.id,
      content: blockToText(message.block, message.content),
      role: message.role,
    })),
    [messages],
  );

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
                {message.working ? renderWorkingBlock(message) : renderMessageBlock(message) || message.content}
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
      <ConversationDownload messages={downloadableMessages} />
      <ConversationScrollButton />
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
