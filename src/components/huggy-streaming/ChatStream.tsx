import * as React from "react";
import { MessageContent, MessageResponse } from "../ai-elements/message";
import { Shimmer } from "../ai-elements/shimmer";

export function ChatStream({ content, streaming = false }: { content: React.ReactNode; streaming?: boolean }) {
  return (
    <MessageContent className="huggy-stream huggy-chat-stream">
      {streaming ? (
        <div className="huggy-chat-stream-status" aria-live="polite">
          <span className="huggy-stream-dot" aria-hidden="true" />
          <Shimmer>Huggy ecrit</Shimmer>
        </div>
      ) : null}
      <MessageResponse>{content}</MessageResponse>
    </MessageContent>
  );
}
