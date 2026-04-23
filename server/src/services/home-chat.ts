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
    "Help with planning, prioritization, roadmap pressure-testing, launch briefs, and board updates for this company.",
    "Keep answers practical, concise, and grounded in the company context provided here.",
    "Do not claim you executed actions, changed state, used tools, read files, or contacted external systems unless that actually happened in this request.",
    "If information is missing, say what assumption you are making or what needs to be clarified next.",
  ].join("\n");
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
  model: HomeChatModel;
  systemPrompt: string;
  messages: HomeChatMessage[];
  onDelta: (delta: string) => Promise<void> | void;
}) {
  const client = new OpenAI({ apiKey: input.apiKey });
  const stream = await client.responses.create({
    model: input.model.id,
    instructions: input.systemPrompt,
    input: input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    store: false,
    stream: true,
  });

  let content = "";
  for await (const event of stream) {
    if (event.type === "response.output_text.delta" && typeof event.delta === "string" && event.delta.length > 0) {
      content += event.delta;
      await input.onDelta(event.delta);
      continue;
    }

    if (event.type === "error") {
      throw new Error(typeof event.message === "string" && event.message.length > 0 ? event.message : "OpenAI streaming failed");
    }
  }

  return content;
}

async function streamAnthropicResponse(input: {
  apiKey: string;
  model: HomeChatModel;
  systemPrompt: string;
  messages: HomeChatMessage[];
  onDelta: (delta: string) => Promise<void> | void;
}) {
  const client = new Anthropic({ apiKey: input.apiKey });
  const stream = await client.messages.create({
    model: input.model.id,
    system: input.systemPrompt,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    messages: input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    stream: true,
  });

  let content = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta"
      && event.delta.type === "text_delta"
      && typeof event.delta.text === "string"
      && event.delta.text.length > 0
    ) {
      content += event.delta.text;
      await input.onDelta(event.delta.text);
      continue;
    }
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
      const apiKey = ensureProviderApiKey(model.provider);
      const streamInput = {
        apiKey,
        model,
        systemPrompt,
        messages: persistedMessages,
        onDelta: async (delta: string) => {
          await input.onEvent({
            type: "assistant_delta",
            messageId: assistantMessageId,
            delta,
          });
        },
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
