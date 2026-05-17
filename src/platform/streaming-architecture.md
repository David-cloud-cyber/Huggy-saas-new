# Huggy visual AI streaming architecture

## Goal

This module implements the production foundation for a Lovable/Bolt-style visual generation stream. The authoritative source of truth is the persisted event log in `stream_events`; live delivery can be done through Supabase Realtime, SSE, or polling fallback.

## Transport recommendation

- Supabase Realtime: persisted project/conversation events, multi-tab sync, reload recovery.
- SSE: fast assistant token streaming and lightweight live event delivery.
- Polling fallback: fetch events where `sequence_number > lastSequenceNumber` after connection loss.

## Backend endpoints to wire in Fastify or Nest

### POST `/projects/:id/messages`

Call `VisualStreamingApiHandlers.postProjectMessage(context, input)`.

Responsibilities:

- check auth and project membership;
- create user message event;
- create assistant placeholder event;
- create agent run event;
- enqueue the async worker;
- return `conversation_id`, `agent_run_id`, `user_message_id`, `assistant_message_id`.

### GET `/projects/:id/stream?conversationId=...`

Call `VisualStreamingApiHandlers.getProjectStream(context, input)` to replay missed events, then subscribe with `subscribeProjectStream`.

SSE frame format:

```txt
id: <sequence_number>
event: <event.type>
data: <serialized StreamEventEnvelope>
```

Use `Last-Event-ID` or `afterSequenceNumber` for resume.

### POST `/agent-runs/:id/cancel`

Call `VisualStreamingApiHandlers.cancelAgentRun(context, input)` and pass cancellation to the worker `AbortController` registry.

## Worker integration

Use `StreamingAgentWorker` for event-rich orchestration. It emits:

- `ai.token`
- `agent.step.*`
- `tool.call.*`
- `file.*`
- `build.*`
- `security.scan.*`
- `preview.*`
- `deploy.*`
- `ai.message.completed`

## Frontend integration

Use `reduceStreamEvents` and `buildConversationStreamViewModel` from `stream-ui.ts`.

The view model powers these components:

- `ChatPanel`
- `MessageBubble`
- `StreamingAssistantMessage`
- `AgentRunTimeline`
- `AgentStepItem`
- `ToolCallDisclosure`
- `FileChangeList`
- `FileDiffPreview`
- `BuildLogViewer`
- `ErrorDiagnosticCard`
- `PreviewReadyCard`
- `DeploymentStatusCard`
- `DomainVerificationCard`
- `CreditUsageBadge`
- `CancelGenerationButton`
- `RetryGenerationButton`
- `FixWithAIButton`
- `OpenFileButton`
- `RestoreVersionButton`

## React hook sketch

```ts
function useConversationStream(projectId: string, conversationId: string) {
  const [events, setEvents] = useState<StreamEventEnvelope[]>([]);
  const viewModel = useMemo(() => buildConversationStreamViewModel(events), [events]);

  useEffect(() => {
    const source = new EventSource(`/projects/${projectId}/stream?conversationId=${conversationId}&after=${viewModel.lastSequenceNumber}`);
    source.onmessage = (message) => {
      setEvents((current) => reduceStreamEvents(current, JSON.parse(message.data)));
    };
    return () => source.close();
  }, [projectId, conversationId]);

  return viewModel;
}
```

## Security rules

- Do not emit secrets in event payloads.
- Redact logs before persistence and streaming.
- Never expose `visibility = internal` to clients.
- Protect SSE endpoints with auth.
- Enforce Supabase RLS.
- Sanitize rendered messages, logs, and diffs.
- Keep command execution allowlisted and sandboxed.

## Performance rules

- Batch frequent `ai.token` events.
- Chunk build logs into `build_log_chunks`.
- Store large patches/logs in Supabase Storage.
- Deduplicate frontend events by `event_id`.
- Sort by `sequence_number`.
- Virtualize large logs and diffs.
- Avoid recomputing the full timeline on every token in production stores.
