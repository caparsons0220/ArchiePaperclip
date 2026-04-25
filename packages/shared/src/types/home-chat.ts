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

export type HomeChatToolRiskLevel = "safe" | "low" | "risky";

export type HomeChatToolSourceKind = "internal" | "plugin" | "mcp" | "connector";

export interface HomeChatToolActionInventoryItem {
  name: string;
  displayName: string;
  description: string;
  category: string;
  family: string;
  operationKind: "read" | "write" | "destructive";
  riskLevel: HomeChatToolRiskLevel;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  disabledReason?: string;
}

export interface HomeChatEffectiveTool {
  registryKey: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  riskLevel: HomeChatToolRiskLevel;
  inputSchema: Record<string, unknown>;
  sourceKind: HomeChatToolSourceKind;
  sourceId: string;
  toolsets: string[];
  enabled: boolean;
  disabledReason?: string;
  actions?: HomeChatToolActionInventoryItem[];
}

export type HomeChatToolFailureCode =
  | "invalid_reference"
  | "not_found"
  | "ambiguous_reference"
  | "forbidden_company_scope"
  | "conflict";

export interface HomeChatToolFailureCandidate {
  id?: string;
  label: string;
  ref?: string;
}

export interface HomeChatToolFailureData {
  code: HomeChatToolFailureCode;
  entityType?: string;
  reference?: string;
  candidates?: HomeChatToolFailureCandidate[];
  hint?: string;
}

export interface HomeChatToolCallRequestedEvent {
  type: "tool_call_requested";
  toolCallId: string;
  name: string;
  displayName: string;
  input: Record<string, unknown>;
  riskLevel: HomeChatToolRiskLevel;
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

export interface HomeChatToolCallFailedEvent {
  type: "tool_call_failed";
  toolCallId: string;
  name: string;
  displayName: string;
  error: string;
  data?: HomeChatToolFailureData;
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
  | HomeChatToolCallFailedEvent
  | HomeChatErrorEvent;
