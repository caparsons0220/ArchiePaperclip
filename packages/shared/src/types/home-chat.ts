export type HomeChatProvider = "openai" | "anthropic";

export type HomeChatMessageRole = "user" | "assistant";

export interface HomeChatModel {
  id: string;
  label: string;
  provider: HomeChatProvider;
  isDefault: boolean;
}

export interface HomeChatMessage {
  id: string;
  role: HomeChatMessageRole;
  content: string;
  modelId: string;
  provider: HomeChatProvider;
  createdAt: string;
}

export interface HomeChatThreadSummary {
  id: string;
  companyId: string;
  ownerUserId: string;
  title: string;
  selectedModelId: string;
  messageCount: number;
  preview: string | null;
  lastMessageAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HomeChatThread extends HomeChatThreadSummary {
  messages: HomeChatMessage[];
}

export interface HomeChatSessionEvent {
  type: "session";
  threadId: string;
  selectedModelId: string;
  title: string;
}

export interface HomeChatAssistantStartEvent {
  type: "assistant_start";
  messageId: string;
  modelId: string;
  provider: HomeChatProvider;
  createdAt: string;
}

export interface HomeChatAssistantDeltaEvent {
  type: "assistant_delta";
  messageId: string;
  delta: string;
}

export interface HomeChatAssistantDoneEvent {
  type: "assistant_done";
  message: HomeChatMessage;
}

export interface HomeChatErrorEvent {
  type: "error";
  error: string;
}

export type HomeChatStreamEvent =
  | HomeChatSessionEvent
  | HomeChatAssistantStartEvent
  | HomeChatAssistantDeltaEvent
  | HomeChatAssistantDoneEvent
  | HomeChatErrorEvent;
