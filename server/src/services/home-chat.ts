import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, homeChatThreads } from "@paperclipai/db";
import {
  homeChatMessageSchema,
  type CreateHomeChatThread,
  type HomeChatMessage,
  type HomeChatModel,
  type HomeChatProvider,
  type HomeChatStreamEvent,
  type HomeChatThread,
  type HomeChatThreadSummary,
  type UpdateHomeChatThread,
} from "@paperclipai/shared/home-chat";
import { badRequest, notFound, unprocessable } from "../errors.js";
import {
  createHomeToolDispatcher,
  type HomeToolContext,
  type HomeToolDescriptor,
} from "./home-tools.js";

const HOME_CHAT_MODELS: HomeChatModel[] = [
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", isDefault: true },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", provider: "openai", isDefault: false },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", provider: "anthropic", isDefault: false },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic", isDefault: false },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic", isDefault: false },
];

const HOME_CHAT_MODEL_MAP = new Map(HOME_CHAT_MODELS.map((model) => [model.id, model]));
const DEFAULT_HOME_CHAT_MODEL_ID = HOME_CHAT_MODELS.find((model) => model.isDefault)?.id ?? "gpt-5.4";
const ANTHROPIC_MAX_TOKENS = 4_096;
const HOME_TOOL_ROUND_LIMIT = 6;
const HOME_TOOL_CALL_LIMIT = 12;
const HOME_TOOL_RESULT_CHAR_LIMIT = 12_000;
const UNKNOWN_HOME_TOOL_NAME = "unknown_home_tool";
const UNKNOWN_HOME_TOOL_DISPLAY_NAME = "Unknown Home tool";

type HomeChatThreadRow = typeof homeChatThreads.$inferSelect;
type OpenAIConversationItem = Record<string, unknown>;
type AnthropicConversationMessage = {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

function parseMessages(value: unknown): HomeChatMessage[] {
  const parsed = homeChatMessageSchema.array().safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildPreview(content: string): string {
  const compact = compactWhitespace(content);
  if (compact.length <= 96) return compact;
  return `${compact.slice(0, 93).trimEnd()}...`;
}

function deriveThreadTitle(content: string): string {
  const compact = compactWhitespace(content);
  if (!compact) return "New chat";
  if (compact.length <= 72) return compact;
  return `${compact.slice(0, 69).trimEnd()}...`;
}

function buildThreadSummary(row: HomeChatThreadRow): HomeChatThreadSummary {
  const messages = parseMessages(row.messages);
  const lastMessage = messages.at(-1) ?? null;
  return {
    id: row.id,
    companyId: row.companyId,
    ownerUserId: row.ownerUserId,
    title: row.title,
    selectedModelId: row.selectedModelId,
    messageCount: messages.length,
    preview: lastMessage ? buildPreview(lastMessage.content) : null,
    lastMessageAt: lastMessage?.createdAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildThread(row: HomeChatThreadRow): HomeChatThread {
  return {
    ...buildThreadSummary(row),
    messages: parseMessages(row.messages),
  };
}

function resolveModel(modelId?: string | null): HomeChatModel {
  const resolvedId = modelId ?? DEFAULT_HOME_CHAT_MODEL_ID;
  const model = HOME_CHAT_MODEL_MAP.get(resolvedId);
  if (!model) {
    throw badRequest(`Unknown home chat model: ${resolvedId}`);
  }
  return model;
}

function buildSystemPrompt(input: {
  companyName: string;
  companyDescription: string | null;
}) {
  const descriptionLine = input.companyDescription?.trim()
    ? `Company description: ${input.companyDescription.trim()}`
    : "Company description: not provided";

  return [
    "You are Archie Bravo, the company-scoped copilot for Paperclip.",
    `Current company: ${input.companyName}`,
    descriptionLine,
    "Help with planning, prioritization, roadmap pressure-testing, launch briefs, board updates, and company operations for this company.",
    "You can use company-scoped Home tools to inspect or change this company's state.",
    "You receive only a bounded subset of relevant Home tools on each turn. Use a tool directly when it clearly matches the user's request.",
    "If the user asks what Archie can do, summarize only the tools exposed on this turn and do not invent hidden capabilities.",
    "Never invent URLs or call raw endpoints. Never request or expose platform/server/admin controls. Never ask the user for companyId, userId, or other scope values; the server supplies them.",
    "Home tools execute immediately. Only call a tool when its effect matches the user's request, and describe the actual result returned by the server.",
    "Secret values are write-only/redacted. You may list secret metadata, but never reveal decrypted secret material.",
    "Keep answers practical, concise, and grounded in the company context provided here.",
    "Do not claim you executed actions, changed state, used tools, read files, or contacted external systems unless that actually happened in this request.",
    "If information is missing, say what assumption you are making or what needs to be clarified next.",
  ].join("\n");
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || value.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringifyToolResult(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (entry instanceof Date) return entry.toISOString();
    return entry;
  }, 2);
}

function appendAssistantContent(current: string, next: string) {
  if (!current.trim()) return next.trim();
  if (!next.trim()) return current.trim();
  return `${current.trimEnd()}\n${next.trimStart()}`.trim();
}

function serializeToolResultPayload(input: {
  name: string;
  status: "completed" | "failed";
  content: string;
  data?: unknown;
}) {
  return stringifyToolResult({
    tool: input.name,
    status: input.status,
    summary: input.content,
    data: input.data,
  }).slice(0, HOME_TOOL_RESULT_CHAR_LIMIT);
}

function sanitizeToolName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveToolIdentity(name: string, displayName?: string | null) {
  const normalizedName = sanitizeToolName(name);
  const normalizedDisplayName = sanitizeToolName(displayName ?? "");
  if (normalizedName) {
    return {
      name: normalizedName,
      displayName: normalizedDisplayName || normalizedName,
    };
  }
  return {
    name: UNKNOWN_HOME_TOOL_NAME,
    displayName: UNKNOWN_HOME_TOOL_DISPLAY_NAME,
  };
}

function mapMessagesToOpenAIInput(messages: HomeChatMessage[]): OpenAIConversationItem[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function mapMessagesToAnthropicInput(messages: HomeChatMessage[]): AnthropicConversationMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function buildProviderToolDefinitions(provider: HomeChatProvider, tools: HomeToolDescriptor[]): unknown[] {
  if (provider === "anthropic") {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

function resolveResponseId(event: Record<string, unknown>, currentResponseId: string | null) {
  if (typeof event.response_id === "string" && event.response_id.trim().length > 0) {
    return event.response_id;
  }
  const response = typeof event.response === "object" && event.response !== null
    ? event.response as Record<string, unknown>
    : null;
  if (response && typeof response.id === "string" && response.id.trim().length > 0) {
    return response.id;
  }
  return currentResponseId;
}

async function runSelectedHomeTool(input: {
  dispatcher: ReturnType<typeof createHomeToolDispatcher>;
  ctx: HomeToolContext;
  allowedTools: Map<string, HomeToolDescriptor>;
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
  onEvent: (event: HomeChatStreamEvent) => Promise<void> | void;
}) {
  const fallbackIdentity = resolveToolIdentity(input.name);
  const descriptor = input.allowedTools.get(input.name);
  if (!descriptor) {
    const message = sanitizeToolName(input.name)
      ? `Home tool is not available in this turn: ${input.name}`
      : "Provider emitted a Home tool call without a valid tool name.";
    await input.onEvent({
      type: "tool_call_failed",
      toolCallId: input.toolCallId,
      name: fallbackIdentity.name,
      displayName: fallbackIdentity.displayName,
      error: message,
    });
    return {
      toolCallId: input.toolCallId,
      name: fallbackIdentity.name,
      displayName: fallbackIdentity.displayName,
      content: message,
      data: undefined,
      status: "failed" as const,
      output: serializeToolResultPayload({
        name: fallbackIdentity.name,
        status: "failed",
        content: message,
      }),
    };
  }

  await input.onEvent({
    type: "tool_call_requested",
    toolCallId: input.toolCallId,
    name: descriptor.name,
    displayName: descriptor.displayName,
    input: input.arguments,
    riskLevel: descriptor.riskLevel,
  });
  await input.onEvent({
    type: "tool_call_started",
    toolCallId: input.toolCallId,
    name: descriptor.name,
    displayName: descriptor.displayName,
  });
  try {
    const execution = await input.dispatcher.executeTool({
      ctx: input.ctx,
      name: descriptor.name,
      parameters: input.arguments,
      toolCallId: input.toolCallId,
    });
    await input.onEvent({
      type: "tool_call_result",
      toolCallId: execution.toolCallId,
      name: execution.descriptor.name,
      displayName: execution.descriptor.displayName,
      content: execution.content,
      data: execution.data,
    });
    return {
      toolCallId: execution.toolCallId,
      name: execution.descriptor.name,
      displayName: execution.descriptor.displayName,
      content: execution.content,
      data: execution.data,
      status: "completed" as const,
      output: serializeToolResultPayload({
        name: execution.descriptor.name,
        status: "completed",
        content: execution.content,
        data: execution.data,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Home tool failed";
    await input.onEvent({
      type: "tool_call_failed",
      toolCallId: input.toolCallId,
      name: descriptor.name,
      displayName: descriptor.displayName,
      error: message,
    });
    return {
      toolCallId: input.toolCallId,
      name: descriptor.name,
      displayName: descriptor.displayName,
      content: message,
      status: "failed" as const,
      output: serializeToolResultPayload({
        name: descriptor.name,
        status: "failed",
        content: message,
      }),
    };
  }
}

function ensureProviderApiKey(provider: HomeChatProvider) {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw unprocessable("OPENAI_API_KEY is required for OpenAI home chat models");
    }
    return apiKey;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw unprocessable("ANTHROPIC_API_KEY is required for Anthropic home chat models");
  }
  return apiKey;
}

async function streamOpenAIResponse(input: {
  apiKey: string;
  dispatcher: ReturnType<typeof createHomeToolDispatcher>;
  ctx: HomeToolContext;
  model: HomeChatModel;
  systemPrompt: string;
  toolQuery: string;
  conversationInput: OpenAIConversationItem[];
  round?: number;
  totalToolCalls?: number;
  previousResponseId?: string | null;
  onDelta: (delta: string) => Promise<void> | void;
  onEvent: (event: HomeChatStreamEvent) => Promise<void> | void;
}): Promise<string> {
  const client = new OpenAI({ apiKey: input.apiKey });
  const selection = input.dispatcher.selectTools(input.toolQuery);
  const toolDefinitions = buildProviderToolDefinitions("openai", selection.tools);
  const allowedTools = new Map(selection.tools.map((tool) => [tool.name, tool]));
  const stream = await client.responses.create({
    model: input.model.id,
    instructions: input.systemPrompt,
    input: input.conversationInput,
    previous_response_id: input.previousResponseId ?? undefined,
    tools: toolDefinitions.length > 0 ? toolDefinitions as any : undefined,
    parallel_tool_calls: false,
    store: false,
    stream: true,
  } as any) as unknown as AsyncIterable<any>;

  let content = "";
  let responseId: string | null = input.previousResponseId ?? null;
  const toolCalls = new Map<string, { callId: string; name: string; arguments: Record<string, unknown> }>();
  for await (const event of stream) {
    const current = event as any;
    responseId = resolveResponseId(current, responseId);
    if (current.type === "response.output_text.delta" && typeof current.delta === "string" && current.delta.length > 0) {
      content += current.delta;
      await input.onDelta(current.delta);
      continue;
    }

    if (current.type === "response.output_item.done" && current.item?.type === "function_call") {
      const callId = String(current.item.call_id ?? current.item.id ?? `openai-tool-${toolCalls.size}`);
      const existing = toolCalls.get(callId);
      toolCalls.set(callId, {
        callId,
        name: sanitizeToolName(current.item.name) || existing?.name || "",
        arguments: Object.keys(parseJsonRecord(current.item.arguments)).length > 0
          ? parseJsonRecord(current.item.arguments)
          : existing?.arguments ?? {},
      });
      continue;
    }

    if (current.type === "response.function_call_arguments.done") {
      const callId = String(current.call_id ?? current.item_id ?? `openai-tool-${toolCalls.size}`);
      const existing = toolCalls.get(callId);
      toolCalls.set(callId, {
        callId,
        name: sanitizeToolName(current.name) || existing?.name || "",
        arguments: Object.keys(parseJsonRecord(current.arguments)).length > 0
          ? parseJsonRecord(current.arguments)
          : existing?.arguments ?? {},
      });
      continue;
    }

    if (current.type === "error") {
      throw new Error(typeof current.message === "string" && current.message.length > 0 ? current.message : "OpenAI streaming failed");
    }
  }

  const round = input.round ?? 0;
  const totalToolCalls = input.totalToolCalls ?? 0;
  const completedToolCalls = Array.from(toolCalls.values());
  if (
    completedToolCalls.length > 0
    && round < HOME_TOOL_ROUND_LIMIT
    && totalToolCalls < HOME_TOOL_CALL_LIMIT
  ) {
    const remainingToolCalls = HOME_TOOL_CALL_LIMIT - totalToolCalls;
    const toolResults = [];
    for (const toolCall of completedToolCalls.slice(0, remainingToolCalls)) {
      toolResults.push(await runSelectedHomeTool({
        dispatcher: input.dispatcher,
        ctx: input.ctx,
        allowedTools,
        toolCallId: toolCall.callId,
        name: toolCall.name,
        arguments: toolCall.arguments,
        onEvent: input.onEvent,
      }));
    }

    const followupInput = toolResults.map((result) => ({
      type: "function_call_output",
      call_id: result.toolCallId,
      output: result.output,
    }));
    const followup: string = await streamOpenAIResponse({
      ...input,
      conversationInput: responseId
        ? followupInput
        : [...input.conversationInput, ...followupInput],
      previousResponseId: responseId,
      round: round + 1,
      totalToolCalls: totalToolCalls + toolResults.length,
    });
    return appendAssistantContent(content, followup);
  }

  return content.trim();
}

async function streamAnthropicResponse(input: {
  apiKey: string;
  dispatcher: ReturnType<typeof createHomeToolDispatcher>;
  ctx: HomeToolContext;
  model: HomeChatModel;
  systemPrompt: string;
  toolQuery: string;
  messages: AnthropicConversationMessage[];
  round?: number;
  totalToolCalls?: number;
  onDelta: (delta: string) => Promise<void> | void;
  onEvent: (event: HomeChatStreamEvent) => Promise<void> | void;
}): Promise<string> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const selection = input.dispatcher.selectTools(input.toolQuery);
  const toolDefinitions = buildProviderToolDefinitions("anthropic", selection.tools);
  const allowedTools = new Map(selection.tools.map((tool) => [tool.name, tool]));
  const stream = await client.messages.create({
    model: input.model.id,
    system: input.systemPrompt,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    messages: input.messages,
    tools: toolDefinitions.length > 0 ? toolDefinitions as any : undefined,
    stream: true,
  } as any) as unknown as AsyncIterable<any>;

  let content = "";
  const toolBlocks = new Map<number, { id: string; name: string; inputJson: string }>();
  const completedToolCalls: Array<{ toolCallId: string; name: string; arguments: Record<string, unknown> }> = [];
  for await (const event of stream) {
    const current = event as any;
    if (
      current.type === "content_block_start"
      && current.content_block?.type === "tool_use"
    ) {
      toolBlocks.set(Number(current.index ?? 0), {
        id: String(current.content_block.id ?? `anthropic-tool-${toolBlocks.size}`),
        name: String(current.content_block.name ?? ""),
        inputJson: "",
      });
      continue;
    }

    if (
      current.type === "content_block_delta"
      && current.delta?.type === "input_json_delta"
    ) {
      const block = toolBlocks.get(Number(current.index ?? 0));
      if (block && typeof current.delta.partial_json === "string") {
        block.inputJson += current.delta.partial_json;
      }
      continue;
    }

    if (current.type === "content_block_stop") {
      const block = toolBlocks.get(Number(current.index ?? 0));
      if (block) {
        completedToolCalls.push({
          toolCallId: block.id,
          name: block.name,
          arguments: parseJsonRecord(block.inputJson),
        });
        toolBlocks.delete(Number(current.index ?? 0));
      }
      continue;
    }

    if (
      current.type === "content_block_delta"
      && current.delta?.type === "text_delta"
      && typeof current.delta.text === "string"
      && current.delta.text.length > 0
    ) {
      content += current.delta.text;
      await input.onDelta(current.delta.text);
      continue;
    }
  }

  const round = input.round ?? 0;
  const totalToolCalls = input.totalToolCalls ?? 0;
  if (
    completedToolCalls.length > 0
    && round < HOME_TOOL_ROUND_LIMIT
    && totalToolCalls < HOME_TOOL_CALL_LIMIT
  ) {
    const remainingToolCalls = HOME_TOOL_CALL_LIMIT - totalToolCalls;
    const toolResults = [];
    for (const toolCall of completedToolCalls.slice(0, remainingToolCalls)) {
      toolResults.push(await runSelectedHomeTool({
        dispatcher: input.dispatcher,
        ctx: input.ctx,
        allowedTools,
        toolCallId: toolCall.toolCallId,
        name: toolCall.name,
        arguments: toolCall.arguments,
        onEvent: input.onEvent,
      }));
    }

    const assistantContentBlocks: Array<Record<string, unknown>> = [];
    if (content.trim().length > 0) {
      assistantContentBlocks.push({
        type: "text",
        text: content,
      });
    }
    for (const toolCall of completedToolCalls.slice(0, remainingToolCalls)) {
      assistantContentBlocks.push({
        type: "tool_use",
        id: toolCall.toolCallId,
        name: toolCall.name,
        input: toolCall.arguments,
      });
    }

    const followupMessages: AnthropicConversationMessage[] = [
      ...input.messages,
      {
        role: "assistant",
        content: assistantContentBlocks,
      },
      {
        role: "user",
        content: toolResults.map((result) => ({
          type: "tool_result",
          tool_use_id: result.toolCallId,
          content: result.output,
          is_error: result.status === "failed" ? true : undefined,
        })),
      },
    ];
    const followup: string = await streamAnthropicResponse({
      ...input,
      messages: followupMessages,
      round: round + 1,
      totalToolCalls: totalToolCalls + toolResults.length,
    });
    return appendAssistantContent(content, followup);
  }

  return content.trim();
}

export function homeChatService(db: Db) {
  async function getOwnedThreadRow(companyId: string, ownerUserId: string, threadId: string) {
    return await db
      .select()
      .from(homeChatThreads)
      .where(
        and(
          eq(homeChatThreads.id, threadId),
          eq(homeChatThreads.companyId, companyId),
          eq(homeChatThreads.ownerUserId, ownerUserId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  return {
    listModels: async () => HOME_CHAT_MODELS,

    listThreads: async (companyId: string, ownerUserId: string) => {
      const rows = await db
        .select()
        .from(homeChatThreads)
        .where(and(eq(homeChatThreads.companyId, companyId), eq(homeChatThreads.ownerUserId, ownerUserId)))
        .orderBy(desc(homeChatThreads.updatedAt));
      return rows.map(buildThreadSummary);
    },

    getThread: async (companyId: string, ownerUserId: string, threadId: string) => {
      const row = await getOwnedThreadRow(companyId, ownerUserId, threadId);
      return row ? buildThread(row) : null;
    },

    createThread: async (companyId: string, ownerUserId: string, input: CreateHomeChatThread = {}) => {
      const model = resolveModel(input.selectedModelId);
      const row = await db
        .insert(homeChatThreads)
        .values({
          companyId,
          ownerUserId,
          title: "New chat",
          selectedModelId: model.id,
          messages: [],
        })
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!row) throw notFound("Home chat thread not found after creation");
      return buildThread(row);
    },

    updateThread: async (companyId: string, ownerUserId: string, threadId: string, input: UpdateHomeChatThread) => {
      const existing = await getOwnedThreadRow(companyId, ownerUserId, threadId);
      if (!existing) return null;

      const selectedModelId = input.selectedModelId ? resolveModel(input.selectedModelId).id : existing.selectedModelId;
      const title = typeof input.title === "string" ? input.title.trim() : existing.title;

      const row = await db
        .update(homeChatThreads)
        .set({
          selectedModelId,
          title,
          updatedAt: new Date(),
        })
        .where(eq(homeChatThreads.id, existing.id))
        .returning()
        .then((rows) => rows[0] ?? null);

      return row ? buildThread(row) : null;
    },

    streamThreadReply: async (input: {
      companyId: string;
      ownerUserId: string;
      threadId: string;
      content: string;
      modelId?: string;
      onEvent: (event: HomeChatStreamEvent) => Promise<void> | void;
    }) => {
      const existing = await getOwnedThreadRow(input.companyId, input.ownerUserId, input.threadId);
      if (!existing) {
        throw notFound("Home chat thread not found");
      }

      const trimmedContent = input.content.trim();
      if (!trimmedContent) {
        throw badRequest("Home chat content is required");
      }

      const company = await db
        .select({
          name: companies.name,
          description: companies.description,
        })
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) {
        throw notFound("Company not found");
      }

      const model = resolveModel(input.modelId ?? existing.selectedModelId);
      const existingMessages = parseMessages(existing.messages);
      const userMessage: HomeChatMessage = {
        id: randomUUID(),
        role: "user",
        content: trimmedContent,
        modelId: model.id,
        provider: model.provider,
        createdAt: new Date().toISOString(),
      };
      const nextTitle = existingMessages.some((message) => message.role === "user")
        ? existing.title
        : deriveThreadTitle(userMessage.content);
      const persistedMessages = [...existingMessages, userMessage];

      const persistedRow = await db
        .update(homeChatThreads)
        .set({
          title: nextTitle,
          selectedModelId: model.id,
          messages: persistedMessages,
          updatedAt: new Date(),
        })
        .where(eq(homeChatThreads.id, existing.id))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!persistedRow) {
        throw notFound("Home chat thread not found");
      }

      await input.onEvent({
        type: "session",
        threadId: persistedRow.id,
        selectedModelId: persistedRow.selectedModelId,
        title: persistedRow.title,
      });

      const assistantMessageId = randomUUID();
      const assistantCreatedAt = new Date().toISOString();
      await input.onEvent({
        type: "assistant_start",
        messageId: assistantMessageId,
        modelId: model.id,
        provider: model.provider,
        createdAt: assistantCreatedAt,
      });

      const systemPrompt = buildSystemPrompt({
        companyName: company.name,
        companyDescription: company.description,
      });
      const ctx: HomeToolContext = {
        companyId: input.companyId,
        ownerUserId: input.ownerUserId,
        threadId: input.threadId,
      };
      const dispatcher = createHomeToolDispatcher(db);
      const apiKey = ensureProviderApiKey(model.provider);
      const streamInput = {
        apiKey,
        dispatcher,
        ctx,
        model,
        systemPrompt,
        toolQuery: trimmedContent,
        onDelta: async (delta: string) => {
          await input.onEvent({
            type: "assistant_delta",
            messageId: assistantMessageId,
            delta,
          });
        },
        onEvent: input.onEvent,
      };

      const assistantContent = model.provider === "openai"
        ? await streamOpenAIResponse({
          ...streamInput,
          conversationInput: mapMessagesToOpenAIInput(persistedMessages),
        })
        : await streamAnthropicResponse({
          ...streamInput,
          messages: mapMessagesToAnthropicInput(persistedMessages),
        });

      if (assistantContent.trim().length === 0) {
        throw new Error("Model returned an empty response");
      }

      const assistantMessage: HomeChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: assistantContent,
        modelId: model.id,
        provider: model.provider,
        createdAt: assistantCreatedAt,
      };
      const finalMessages = [...persistedMessages, assistantMessage];

      await db
        .update(homeChatThreads)
        .set({
          title: nextTitle,
          selectedModelId: model.id,
          messages: finalMessages,
          updatedAt: new Date(),
        })
        .where(eq(homeChatThreads.id, existing.id));

      await input.onEvent({
        type: "assistant_done",
        message: assistantMessage,
      });

      return assistantMessage;
    },
  };
}
