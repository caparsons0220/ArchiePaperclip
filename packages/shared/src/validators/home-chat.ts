import { z } from "zod";

export const HOME_CHAT_PROVIDERS = ["openai", "anthropic"] as const;
export const HOME_CHAT_MESSAGE_ROLES = ["user", "assistant"] as const;

export const homeChatProviderSchema = z.enum(HOME_CHAT_PROVIDERS);
export type HomeChatProvider = z.infer<typeof homeChatProviderSchema>;

export const homeChatMessageRoleSchema = z.enum(HOME_CHAT_MESSAGE_ROLES);
export type HomeChatMessageRole = z.infer<typeof homeChatMessageRoleSchema>;

export const homeChatModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: homeChatProviderSchema,
  isDefault: z.boolean(),
});

export const homeChatMessageSchema = z.object({
  id: z.string().min(1),
  role: homeChatMessageRoleSchema,
  content: z.string().min(1),
  modelId: z.string().min(1),
  provider: homeChatProviderSchema,
  createdAt: z.string().datetime(),
});

export const homeChatThreadSummarySchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  ownerUserId: z.string().min(1),
  title: z.string().min(1),
  selectedModelId: z.string().min(1),
  messageCount: z.number().int().nonnegative(),
  preview: z.string().nullable(),
  lastMessageAt: z.string().datetime().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const homeChatThreadSchema = homeChatThreadSummarySchema.extend({
  messages: z.array(homeChatMessageSchema),
});

export const createHomeChatThreadSchema = z.object({
  selectedModelId: z.string().min(1).optional(),
});
export type CreateHomeChatThread = z.infer<typeof createHomeChatThreadSchema>;

export const updateHomeChatThreadSchema = z.object({
  selectedModelId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(120).optional(),
}).refine((value) => value.selectedModelId !== undefined || value.title !== undefined, {
  message: "selectedModelId or title is required",
});
export type UpdateHomeChatThread = z.infer<typeof updateHomeChatThreadSchema>;

export const homeChatStreamRequestSchema = z.object({
  content: z.string().trim().min(1).max(20000),
  modelId: z.string().min(1).optional(),
});
export type HomeChatStreamRequest = z.infer<typeof homeChatStreamRequestSchema>;

export const homeChatSessionEventSchema = z.object({
  type: z.literal("session"),
  threadId: z.string().uuid(),
  selectedModelId: z.string().min(1),
  title: z.string().min(1),
});

export const homeChatAssistantStartEventSchema = z.object({
  type: z.literal("assistant_start"),
  messageId: z.string().min(1),
  modelId: z.string().min(1),
  provider: homeChatProviderSchema,
  createdAt: z.string().datetime(),
});

export const homeChatAssistantDeltaEventSchema = z.object({
  type: z.literal("assistant_delta"),
  messageId: z.string().min(1),
  delta: z.string(),
});

export const homeChatAssistantDoneEventSchema = z.object({
  type: z.literal("assistant_done"),
  message: homeChatMessageSchema,
});

export const homeChatErrorEventSchema = z.object({
  type: z.literal("error"),
  error: z.string().min(1),
});

export const homeChatStreamEventSchema = z.union([
  homeChatSessionEventSchema,
  homeChatAssistantStartEventSchema,
  homeChatAssistantDeltaEventSchema,
  homeChatAssistantDoneEventSchema,
  homeChatErrorEventSchema,
]);

export type HomeChatStreamEvent = z.infer<typeof homeChatStreamEventSchema>;
