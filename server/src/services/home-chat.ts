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
const HOME_TOOL_LOOP_LIMIT = 2;

type HomeChatThreadRow = typeof homeChatThreads.$inferSelect;

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
    "You can use company-scoped Home tools to inspect or change the user's workspace experience. First search for tools by intent, then call a curated tool by name.",
    "Never invent URLs or call raw endpoints. Never request or expose platform/server/admin controls. Never ask the user for companyId, userId, or other scope values; the server supplies them.",
    "Risky tools return a confirmation request instead of executing. When that happens, ask for confirmation and do not claim the action was completed.",
    "Secret values are write-only/redacted. You may list secret metadata, but never reveal decrypted secret material.",
    "Keep answers practical, concise, and grounded in the company context provided here.",
    "Do not claim you executed actions, changed state, used tools, read files, or contacted external systems unless that actually happened in this request.",
    "If information is missing, say what assumption you are making or what needs to be clarified next.",
  ].join("\n");
}

function homeToolProviderDefinitions(provider: HomeChatProvider): unknown[] {
  const searchInputSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", description: "Natural-language intent to find matching Home tools." },
      category: { type: "string", description: "Optional Home tool category." },
      limit: { type: "number", description: "Maximum tools to return." },
    },
    required: ["query"],
  };
  const callInputSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", description: "Curated Home tool name returned by search_home_tools." },
      input: { type: "object", description: "Input object for the selected Home tool." },
    },
    required: ["name", "input"],
  };

  if (provider === "anthropic") {
    return [
      {
        name: "search_home_tools",
        description: "Search the curated company-scoped Home tool catalog by user intent.",
        input_schema: searchInputSchema,
      },
      {
        name: "call_home_tool",
        description: "Execute a curated company-scoped Home tool. The server injects scope and permission context.",
        input_schema: callInputSchema,
      },
    ];
  }

  return [
    {
      type: "function",
      name: "search_home_tools",
      description: "Search the curated company-scoped Home tool catalog by user intent.",
      parameters: searchInputSchema,
    },
    {
      type: "function",
      name: "call_home_tool",
      description: "Execute a curated company-scoped Home tool. The server injects scope and permission context.",
      parameters: callInputSchema,
    },
  ];
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

function buildToolResultMessage(results: Array<{ name: string; content: string; data?: unknown; confirmationRequired?: boolean }>) {
  return [
    "Company tool results from this request:",
    ...results.map((result) => [
      `Tool: ${result.name}`,
      `Status: ${result.confirmationRequired ? "confirmation_required" : "completed"}`,
      `Summary: ${result.content}`,
      result.data === undefined ? null : `Data: ${stringifyToolResult(result.data).slice(0, 12000)}`,
    ].filter(Boolean).join("\n")),
    "Use these results to answer the user. If any tool requires confirmation, explain exactly what needs confirmation and do not say it was completed.",
  ].join("\n\n");
}

async function runHomeProviderTool(input: {
  db: Db;
  ctx: HomeToolContext;
  name: string;
  arguments: Record<string, unknown>;
  confirmedToolCall?: { name: string; input: Record<string, unknown>; confirmationId: string } | null;
  onEvent: (event: HomeChatStreamEvent) => Promise<void> | void;
}) {
  const dispatcher = createHomeToolDispatcher(input.db);
  const toolCallId = randomUUID();

  if (input.name === "search_home_tools") {
    const query = typeof input.arguments.query === "string" ? input.arguments.query : "";
    const category = typeof input.arguments.category === "string" ? input.arguments.category : null;
    const limit = typeof input.arguments.limit === "number" ? input.arguments.limit : 8;
    const results = dispatcher.searchTools(query, category, limit);
    const descriptor: HomeToolDescriptor = {
      name: "search_home_tools",
      displayName: "Search Home tools",
      description: "Search the curated company-scoped Home tool catalog.",
      category: "workspace",
      riskLevel: "safe",
      requiresConfirmation: false,
      inputSchema: {},
      keywords: [],
    };
    await input.onEvent({
      type: "tool_call_started",
      toolCallId,
      name: descriptor.name,
      displayName: descriptor.displayName,
    });
    await input.onEvent({
      type: "tool_call_result",
      toolCallId,
      name: descriptor.name,
      displayName: descriptor.displayName,
      content: `Found ${results.length} matching Home tools.`,
      data: results,
    });
    return {
      name: input.name,
      content: `Found ${results.length} matching Home tools.`,
      data: results,
    };
  }

  if (input.name !== "call_home_tool") {
    throw badRequest(`Unknown Home provider tool: ${input.name}`);
  }

  const toolName = typeof input.arguments.name === "string" ? input.arguments.name : "";
  const parameters = parseJsonRecord(input.arguments.input);
  const descriptor = dispatcher.getTool(toolName);
  if (!descriptor) throw badRequest(`Unknown Home tool: ${toolName}`);

  await input.onEvent({
    type: "tool_call_requested",
    toolCallId,
    name: descriptor.name,
    displayName: descriptor.displayName,
    input: parameters,
    riskLevel: descriptor.riskLevel,
    requiresConfirmation: descriptor.requiresConfirmation,
  });

  const execution = await dispatcher.executeTool({
    ctx: input.ctx,
    name: toolName,
    parameters,
    confirmed: input.confirmedToolCall ?? null,
    toolCallId,
  });
  if (execution.status === "confirmation_required") {
    await input.onEvent({
      type: "tool_confirmation_required",
      toolCallId: execution.toolCallId,
      name: execution.descriptor.name,
      displayName: execution.descriptor.displayName,
      input: execution.input,
      confirmationId: execution.confirmationId!,
      reason: execution.content,
    });
    return {
      name: execution.descriptor.name,
      content: execution.content,
      confirmationRequired: true,
    };
  }

  await input.onEvent({
    type: "tool_call_started",
    toolCallId: execution.toolCallId,
    name: execution.descriptor.name,
    displayName: execution.descriptor.displayName,
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
    name: execution.descriptor.name,
    content: execution.content,
    data: execution.data,
  };
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
  db: Db;
  ctx: HomeToolContext;
  model: HomeChatModel;
  systemPrompt: string;
  messages: HomeChatMessage[];
  confirmedToolCall?: { name: string; input: Record<string, unknown>; confirmationId: string } | null;
  allowTools?: boolean;
  onDelta: (delta: string) => Promise<void> | void;
  onEvent: (event: HomeChatStreamEvent) => Promise<void> | void;
}): Promise<string> {
  const client = new OpenAI({ apiKey: input.apiKey });
  const stream = await client.responses.create({
    model: input.model.id,
    instructions: input.systemPrompt,
    input: input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    tools: input.allowTools === false ? undefined : homeToolProviderDefinitions("openai") as any,
    store: false,
    stream: true,
  } as any) as unknown as AsyncIterable<any>;

  let content = "";
  const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  for await (const event of stream) {
    const current = event as any;
    if (current.type === "response.output_text.delta" && typeof current.delta === "string" && current.delta.length > 0) {
      content += current.delta;
      await input.onDelta(current.delta);
      continue;
    }

    if (current.type === "response.output_item.done" && current.item?.type === "function_call") {
      toolCalls.push({
        name: String(current.item.name ?? ""),
        arguments: parseJsonRecord(current.item.arguments),
      });
      continue;
    }

    if (current.type === "error") {
      throw new Error(typeof current.message === "string" && current.message.length > 0 ? current.message : "OpenAI streaming failed");
    }
  }

  if (toolCalls.length > 0 && input.allowTools !== false) {
    const toolResults = [];
    for (const toolCall of toolCalls.slice(0, HOME_TOOL_LOOP_LIMIT)) {
      try {
        toolResults.push(await runHomeProviderTool({
          db: input.db,
          ctx: input.ctx,
          name: toolCall.name,
          arguments: toolCall.arguments,
          confirmedToolCall: input.confirmedToolCall,
          onEvent: input.onEvent,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Home tool failed";
        await input.onEvent({
          type: "tool_call_failed",
          toolCallId: randomUUID(),
          name: toolCall.name,
          displayName: toolCall.name,
          error: message,
        });
        toolResults.push({ name: toolCall.name, content: message });
      }
    }

    const followupMessages: HomeChatMessage[] = [
      ...input.messages,
      {
        id: randomUUID(),
        role: "user",
        content: buildToolResultMessage(toolResults),
        modelId: input.model.id,
        provider: input.model.provider,
        createdAt: new Date().toISOString(),
      },
    ];
    const followup: string = await streamOpenAIResponse({
      ...input,
      messages: followupMessages,
      allowTools: false,
    });
    return `${content}${followup}`.trim();
  }

  return content;
}

async function streamAnthropicResponse(input: {
  apiKey: string;
  db: Db;
  ctx: HomeToolContext;
  model: HomeChatModel;
  systemPrompt: string;
  messages: HomeChatMessage[];
  confirmedToolCall?: { name: string; input: Record<string, unknown>; confirmationId: string } | null;
  allowTools?: boolean;
  onDelta: (delta: string) => Promise<void> | void;
  onEvent: (event: HomeChatStreamEvent) => Promise<void> | void;
}): Promise<string> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const stream = await client.messages.create({
    model: input.model.id,
    system: input.systemPrompt,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    messages: input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    tools: input.allowTools === false ? undefined : homeToolProviderDefinitions("anthropic") as any,
    stream: true,
  } as any) as unknown as AsyncIterable<any>;

  let content = "";
  const toolBlocks = new Map<number, { name: string; inputJson: string }>();
  const completedToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  for await (const event of stream) {
    const current = event as any;
    if (
      current.type === "content_block_start"
      && current.content_block?.type === "tool_use"
    ) {
      toolBlocks.set(Number(current.index ?? 0), {
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

  if (completedToolCalls.length > 0 && input.allowTools !== false) {
    const toolResults = [];
    for (const toolCall of completedToolCalls.slice(0, HOME_TOOL_LOOP_LIMIT)) {
      try {
        toolResults.push(await runHomeProviderTool({
          db: input.db,
          ctx: input.ctx,
          name: toolCall.name,
          arguments: toolCall.arguments,
          confirmedToolCall: input.confirmedToolCall,
          onEvent: input.onEvent,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Home tool failed";
        await input.onEvent({
          type: "tool_call_failed",
          toolCallId: randomUUID(),
          name: toolCall.name,
          displayName: toolCall.name,
          error: message,
        });
        toolResults.push({ name: toolCall.name, content: message });
      }
    }

    const followupMessages: HomeChatMessage[] = [
      ...input.messages,
      {
        id: randomUUID(),
        role: "user",
        content: buildToolResultMessage(toolResults),
        modelId: input.model.id,
        provider: input.model.provider,
        createdAt: new Date().toISOString(),
      },
    ];
    const followup: string = await streamAnthropicResponse({
      ...input,
      messages: followupMessages,
      allowTools: false,
    });
    return `${content}${followup}`.trim();
  }

  return content;
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
      confirmedToolCall?: { name: string; input: Record<string, unknown>; confirmationId: string } | null;
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
      const confirmedToolResults = [];
      if (input.confirmedToolCall) {
        try {
          confirmedToolResults.push(await runHomeProviderTool({
            db,
            ctx,
            name: "call_home_tool",
            arguments: {
              name: input.confirmedToolCall.name,
              input: input.confirmedToolCall.input,
            },
            confirmedToolCall: input.confirmedToolCall,
            onEvent: input.onEvent,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Confirmed Home tool failed";
          await input.onEvent({
            type: "tool_call_failed",
            toolCallId: randomUUID(),
            name: input.confirmedToolCall.name,
            displayName: input.confirmedToolCall.name,
            error: message,
          });
          confirmedToolResults.push({ name: input.confirmedToolCall.name, content: message });
        }
      }

      const modelMessages = confirmedToolResults.length > 0
        ? [
          ...persistedMessages,
          {
            id: randomUUID(),
            role: "user" as const,
            content: buildToolResultMessage(confirmedToolResults),
            modelId: model.id,
            provider: model.provider,
            createdAt: new Date().toISOString(),
          },
        ]
        : persistedMessages;
      const apiKey = ensureProviderApiKey(model.provider);
      const streamInput = {
        apiKey,
        db,
        ctx,
        model,
        systemPrompt,
        messages: modelMessages,
        confirmedToolCall: input.confirmedToolCall ?? null,
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
        ? await streamOpenAIResponse(streamInput)
        : await streamAnthropicResponse(streamInput);

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
