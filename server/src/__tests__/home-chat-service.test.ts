import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authUsers,
  companies,
  createDb,
  homeChatThreads,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { homeChatService } from "../services/home-chat.js";

const openAICreateMock = vi.hoisted(() => vi.fn());
const anthropicCreateMock = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: {
      create: openAICreateMock,
    },
  })),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: anthropicCreateMock,
    },
  })),
}));

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

function createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

async function insertUser(db: ReturnType<typeof createDb>, userId: string, name: string) {
  await db.insert(authUsers).values({
    id: userId,
    name,
    email: `${userId}@example.com`,
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertCompany(db: ReturnType<typeof createDb>, name: string) {
  return await db
    .insert(companies)
    .values({
      name,
      issuePrefix: `HC${randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    })
    .returning()
    .then((rows) => rows[0]!);
}

describeEmbeddedPostgres("home chat service", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof homeChatService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let originalOpenAIKey: string | undefined;
  let originalAnthropicKey: string | undefined;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-home-chat-service-");
    db = createDb(tempDb.connectionString);
    svc = homeChatService(db);
    originalOpenAIKey = process.env.OPENAI_API_KEY;
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  }, 20_000);

  beforeEach(() => {
    openAICreateMock.mockReset();
    anthropicCreateMock.mockReset();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });

  afterEach(async () => {
    await db.delete(homeChatThreads);
    await db.delete(authUsers);
    await db.delete(companies);
  });

  afterAll(async () => {
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    await tempDb?.cleanup();
  });

  it("isolates threads by company and owner", async () => {
    const userA = `user-a-${randomUUID()}`;
    const userB = `user-b-${randomUUID()}`;
    const companyA = await insertCompany(db, "Archie Labs");
    const companyB = await insertCompany(db, "Second Company");
    await insertUser(db, userA, "User A");
    await insertUser(db, userB, "User B");

    const threadA1 = await svc.createThread(companyA.id, userA, { selectedModelId: "gpt-5.4" });
    const threadA2 = await svc.createThread(companyA.id, userA, { selectedModelId: "claude-sonnet-4-6" });
    const threadOtherUser = await svc.createThread(companyA.id, userB, { selectedModelId: "gpt-5.4" });
    const threadOtherCompany = await svc.createThread(companyB.id, userA, { selectedModelId: "gpt-5.4-mini" });

    const companyAThreads = await svc.listThreads(companyA.id, userA);
    const companyBThreads = await svc.listThreads(companyB.id, userA);

    expect(companyAThreads).toHaveLength(2);
    expect(new Set(companyAThreads.map((thread) => thread.id))).toEqual(new Set([threadA1.id, threadA2.id]));
    expect(companyBThreads.map((thread) => thread.id)).toEqual([threadOtherCompany.id]);
    expect(await svc.getThread(companyA.id, userB, threadA1.id)).toBeNull();
    expect(await svc.getThread(companyB.id, userA, threadA1.id)).toBeNull();

    const updated = await svc.updateThread(companyA.id, userA, threadA1.id, {
      selectedModelId: "gpt-5.4-mini",
    });
    expect(updated?.selectedModelId).toBe("gpt-5.4-mini");
    expect(threadOtherUser.ownerUserId).toBe(userB);
  });

  it("streams OpenAI replies, derives the first title, and persists the final assistant message", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-openai-${randomUUID()}`;
    const company = await insertCompany(db, "Launch Company");
    await insertUser(db, userId, "OpenAI User");
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock.mockResolvedValue(createAsyncIterable([
      { type: "response.output_text.delta", delta: "Focus on " },
      { type: "response.output_text.delta", delta: "risks first." },
    ]));

    const events: string[] = [];
    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Draft the launch brief",
      modelId: "gpt-5.4-mini",
      onEvent: (event) => {
        events.push(event.type);
      },
    });

    expect(openAICreateMock).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5.4-mini",
      instructions: expect.stringContaining("Launch Company"),
      store: false,
      stream: true,
      input: [
        {
          role: "user",
          content: "Draft the launch brief",
        },
      ],
    }));
    expect(assistantMessage.content).toBe("Focus on risks first.");
    expect(events).toEqual([
      "session",
      "assistant_start",
      "assistant_delta",
      "assistant_delta",
      "assistant_done",
    ]);

    const persisted = await svc.getThread(company.id, userId, thread.id);
    expect(persisted?.title).toBe("Draft the launch brief");
    expect(persisted?.selectedModelId).toBe("gpt-5.4-mini");
    expect(persisted?.messages).toHaveLength(2);
    expect(persisted?.messages[0]).toMatchObject({
      role: "user",
      content: "Draft the launch brief",
      provider: "openai",
      modelId: "gpt-5.4-mini",
    });
    expect(persisted?.messages[1]).toMatchObject({
      role: "assistant",
      content: "Focus on risks first.",
      provider: "openai",
      modelId: "gpt-5.4-mini",
    });
  });

  it("streams Anthropic replies and updates the thread's selected model", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    const userId = `user-claude-${randomUUID()}`;
    const company = await insertCompany(db, "Roadmap Company");
    await insertUser(db, userId, "Claude User");
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    anthropicCreateMock.mockResolvedValue(createAsyncIterable([
      { type: "content_block_delta", delta: { type: "text_delta", text: "Tighten the " } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "milestones." } },
      { type: "content_block_stop" },
      { type: "message_stop" },
    ]));

    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Pressure-test the roadmap",
      modelId: "claude-haiku-4-5",
      onEvent: () => undefined,
    });

    expect(anthropicCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      model: "claude-haiku-4-5",
      system: expect.stringContaining("Roadmap Company"),
      max_tokens: 4096,
      stream: true,
      messages: [
        {
          role: "user",
          content: "Pressure-test the roadmap",
        },
      ],
    }));
    expect(assistantMessage).toMatchObject({
      content: "Tighten the milestones.",
      provider: "anthropic",
      modelId: "claude-haiku-4-5",
    });

    const persisted = await svc.getThread(company.id, userId, thread.id);
    expect(persisted?.selectedModelId).toBe("claude-haiku-4-5");
    expect(persisted?.messages.at(-1)).toMatchObject({
      role: "assistant",
      provider: "anthropic",
      modelId: "claude-haiku-4-5",
    });
  });

  it("rejects missing provider keys after persisting the user message", async () => {
    delete process.env.OPENAI_API_KEY;
    const userId = `user-missing-key-${randomUUID()}`;
    const company = await insertCompany(db, "Missing Key Company");
    await insertUser(db, userId, "Missing Key User");
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    await expect(
      svc.streamThreadReply({
        companyId: company.id,
        ownerUserId: userId,
        threadId: thread.id,
        content: "Review this week's priorities",
        onEvent: () => undefined,
      }),
    ).rejects.toMatchObject({ status: 422 });

    expect(openAICreateMock).not.toHaveBeenCalled();

    const persisted = await svc.getThread(company.id, userId, thread.id);
    expect(persisted?.messages).toHaveLength(1);
    expect(persisted?.messages[0]).toMatchObject({
      role: "user",
      content: "Review this week's priorities",
    });
  });
});
