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

export interface HomeChatToolCallRequestedEvent {
  type: "tool_call_requested";
  toolCallId: string;
  name: string;
  displayName: string;
  input: Record<string, unknown>;
  riskLevel: "safe" | "low" | "risky";
  requiresConfirmation: boolean;
  confirmationId?: string;
}

export interface HomeChatToolCallStartedEvent {
  type: "tool_call_started";
  toolCallId: string;
  name: string;
  displayName: string;
}

export interface HomeChatToolCallResultEvent {
  type: "tool_call_result";
  toolCallId: string;
  name: string;
  displayName: string;
  content: string;
  data?: unknown;
}

export interface HomeChatToolConfirmationRequiredEvent {
  type: "tool_confirmation_required";
  toolCallId: string;
  name: string;
  displayName: string;
  input: Record<string, unknown>;
  confirmationId: string;
  reason: string;
}

export interface HomeChatToolCallFailedEvent {
  type: "tool_call_failed";
  toolCallId: string;
  name: string;
  displayName: string;
  error: string;
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
  | HomeChatToolCallRequestedEvent
  | HomeChatToolCallStartedEvent
  | HomeChatToolCallResultEvent
  | HomeChatToolConfirmationRequiredEvent
  | HomeChatToolCallFailedEvent
  | HomeChatErrorEvent;
