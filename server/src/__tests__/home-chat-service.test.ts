import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  agentWakeupRequests,
  approvals,
  authUsers,
  agents,
  budgetIncidents,
  budgetPolicies,
  companyMemberships,
  companySecretVersions,
  companySecrets,
  companySkills,
  companies,
  createDb,
  heartbeatRuns,
  homeChatThreads,
  invites,
  issueComments,
  issueInboxArchives,
  issues,
  projects,
  projectWorkspaces,
  workspaceRuntimeServices,
} from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { cleanupHomeHeartbeatSideEffects } from "./helpers/home-heartbeat-cleanup.js";
import { homeChatService } from "../services/home-chat.js";
import { createHomeToolDispatcher } from "../services/home-tools.js";
import { issueService } from "../services/issues.js";
import { projectService } from "../services/projects.js";
import { secretService } from "../services/secrets.js";
import { stopRuntimeServicesForProjectWorkspace } from "../services/workspace-runtime.js";

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

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport().catch(() => ({ supported: true }));
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
    svc = homeChatService(db, {
      homeToolDispatcherOptions: {
        heartbeatOptions: { autoStartQueuedRuns: false },
      },
    });
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
    await db.delete(invites);
    await db.delete(workspaceRuntimeServices);
    await db.delete(projectWorkspaces);
    await db.delete(projects);
    await db.delete(budgetIncidents);
    await db.delete(budgetPolicies);
    await db.delete(approvals);
    await db.delete(issueInboxArchives);
    await db.delete(companyMemberships);
    await db.delete(companySecretVersions);
    await db.delete(companySecrets);
    await db.delete(companySkills);
    await db.delete(homeChatThreads);
    await db.delete(issueComments);
    await db.delete(issues);
    await cleanupHomeHeartbeatSideEffects(db);
    await db.delete(agents);
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

  it("keeps direct internal tools available across multiple OpenAI tool rounds", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-tools-${randomUUID()}`;
    const company = await insertCompany(db, "Tool Company");
    await insertUser(db, userId, "Tool User");
    const agent = await db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "Sales Agent",
        role: "sales",
        title: "Sales Agent",
        model: "test-model",
        status: "idle",
      })
      .returning()
      .then((rows) => rows[0]!);
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-list-agents",
            name: "list_agents",
            arguments: JSON.stringify({}),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-pause-agent",
            name: "pause_agent",
            arguments: JSON.stringify({ agentId: agent.id }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "Use pause_agent." },
      ]));

    const events: string[] = [];
    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Pause the Sales Agent.",
      modelId: "gpt-5.4",
      onEvent: (event) => {
        events.push(event.type);
      },
    });

    expect(openAICreateMock).toHaveBeenCalledTimes(3);
    expect(openAICreateMock.mock.calls[0]?.[0]).not.toHaveProperty("previous_response_id");
    expect(openAICreateMock.mock.calls[1]?.[0]).not.toHaveProperty("previous_response_id");
    expect(openAICreateMock.mock.calls[2]?.[0]).not.toHaveProperty("previous_response_id");
    const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["list_agents", "pause_agent"]));
    expect(firstTools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      "list_home_tools",
      "search_home_tools",
      "call_home_tool",
    ]));
    expect(openAICreateMock.mock.calls[1]?.[0]?.store).toBe(false);
    expect(openAICreateMock.mock.calls[1]?.[0]?.input).toEqual(expect.arrayContaining([
      {
        role: "user",
        content: "Pause the Sales Agent.",
      },
      {
        type: "function_call",
        call_id: "call-list-agents",
        name: "list_agents",
        arguments: JSON.stringify({}),
      },
      {
        type: "function_call_output",
        call_id: "call-list-agents",
        output: expect.stringContaining("\"tool\": \"list_agents\""),
      },
    ]));
    expect(events).toEqual(expect.arrayContaining(["tool_call_started", "tool_call_result"]));
    expect(assistantMessage.content).toBe("Use pause_agent.");
  });

  it("executes agent actions end to end with human-readable refs", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-agent-ref-tools-${randomUUID()}`;
    const company = await insertCompany(db, "Agent Ref Tool Company");
    await insertUser(db, userId, "Agent Ref Tool User");
    await db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "CEO",
        role: "general",
        title: "Chief Executive Officer",
        model: "test-model",
        status: "idle",
      });
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-list-agents",
            name: "list_agents",
            arguments: JSON.stringify({}),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-pause-agent-ref",
            name: "pause_agent",
            arguments: JSON.stringify({ agentRef: "CEO" }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "Paused the CEO agent." },
      ]));

    const events: Array<{ type: string; name?: string; error?: string }> = [];
    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Pause the CEO agent.",
      modelId: "gpt-5.4",
      onEvent: (event) => {
        if ("name" in event) {
          events.push({
            type: event.type,
            name: event.name,
            error: "error" in event ? event.error : undefined,
          });
        } else {
          events.push({ type: event.type });
        }
      },
    });

    expect(events).toEqual(expect.arrayContaining([
      { type: "tool_call_requested", name: "pause_agent", error: undefined },
      { type: "tool_call_started", name: "pause_agent", error: undefined },
      { type: "tool_call_result", name: "pause_agent", error: undefined },
    ]));
    expect(events.find((event) => event.type === "tool_call_failed")).toBeUndefined();
    expect(assistantMessage.content).toBe("Paused the CEO agent.");
  });

  it("executes agent wake actions end to end with lookup plus runtime-aware tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-agent-wake-tools-${randomUUID()}`;
    const company = await insertCompany(db, "Agent Wake Tool Company");
    await insertUser(db, userId, "Agent Wake Tool User");
    const agent = await db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "CEO",
        role: "general",
        title: "Chief Executive Officer",
        model: "test-model",
        status: "idle",
      })
      .returning()
      .then((rows) => rows[0]!);
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-list-agents-wake",
            name: "list_agents",
            arguments: JSON.stringify({}),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-wake-agent",
            name: "wake_agent",
            arguments: JSON.stringify({
              agentRef: "CEO",
              reason: "manual_followup",
              payload: { topic: "launch" },
            }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "Queued a wakeup for the CEO agent." },
      ]));

    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Wake the CEO agent.",
      modelId: "gpt-5.4",
      onEvent: () => undefined,
    });

    const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "list_agents",
      "get_agent",
      "get_agent_runtime_state",
      "wake_agent",
    ]));
    expect(firstTools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      "list_home_tools",
      "search_home_tools",
      "call_home_tool",
      "install_adapter",
      "reload_plugin",
    ]));

    const run = await db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.agentId, agent.id))
      .then((rows) => rows[0] ?? null);
    expect(run).toMatchObject({
      companyId: company.id,
      agentId: agent.id,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "queued",
    });
    const wakeupRequest = run?.wakeupRequestId
      ? await db
        .select()
        .from(agentWakeupRequests)
        .where(eq(agentWakeupRequests.id, run.wakeupRequestId))
        .then((rows) => rows[0] ?? null)
      : null;
    expect(wakeupRequest).toMatchObject({
      id: run?.wakeupRequestId,
      companyId: company.id,
      agentId: agent.id,
      status: "queued",
      runId: run?.id,
      source: "on_demand",
      triggerDetail: "manual",
      reason: "manual_followup",
    });
    expect(assistantMessage.content).toBe("Queued a wakeup for the CEO agent.");
  });

  it("executes company invite creation end to end with internal-only access tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-home-invite-tools-${randomUUID()}`;
    const company = await insertCompany(db, "Invite Tool Company");
    await insertUser(db, userId, "Invite Tool User");
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-create-company-invite",
            name: "create_company_invite",
            arguments: JSON.stringify({
              allowedJoinTypes: "human",
              humanRole: "operator",
              agentMessage: "Alex, join the company.",
            }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "Created an invite for Alex." },
      ]));

    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Invite alex to the company.",
      modelId: "gpt-5.4",
      onEvent: () => undefined,
    });

    const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "create_company_invite",
      "list_company_invites",
    ]));
    expect(firstTools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      "install_adapter",
      "reload_plugin",
      "backup_database",
      "run_migration",
    ]));

    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.companyId, company.id))
      .then((rows) => rows[0] ?? null);
    expect(invite).toMatchObject({
      companyId: company.id,
      allowedJoinTypes: "human",
      inviteType: "company_join",
      invitedByUserId: userId,
    });
    expect(assistantMessage.content).toBe("Created an invite for Alex.");
  });

  it("executes issue comment actions end to end with lookup plus mutation tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-issue-comment-tools-${randomUUID()}`;
    const company = await insertCompany(db, "Issue Comment Tool Company");
    await insertUser(db, userId, "Issue Comment Tool User");
    const issuesSvc = issueService(db);
    const issue = await issuesSvc.create(company.id, {
      title: "Onboarding",
      status: "todo",
      priority: "medium",
    });
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-list-issues",
            name: "list_issues",
            arguments: JSON.stringify({ q: "Onboarding" }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-add-issue-comment",
            name: "add_issue_comment",
            arguments: JSON.stringify({
              issueRef: "Onboarding",
              body: "Need a tighter rollout checklist before launch.",
            }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "Added the comment to the onboarding issue." },
      ]));

    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Add a comment to the onboarding issue saying we need a tighter rollout checklist before launch.",
      modelId: "gpt-5.4",
      onEvent: () => undefined,
    });

    const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "list_issues",
      "get_issue",
      "add_issue_comment",
    ]));

    const comments = await issuesSvc.listComments(issue.id, { order: "asc" });
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain("Need a tighter rollout checklist before launch.");
    expect(assistantMessage.content).toBe("Added the comment to the onboarding issue.");
  });

  it("executes company user profile lookups end to end with directory-aware tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `dotta-${randomUUID()}`;
    const company = await insertCompany(db, "Profile Tool Company");
    await insertUser(db, userId, "Dotta");
    await db.insert(companyMemberships).values({
      companyId: company.id,
      principalType: "user",
      principalId: userId,
      status: "active",
      membershipRole: "admin",
    });
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-get-company-user-profile",
            name: "get_company_user_profile",
            arguments: JSON.stringify({
              userRef: "dotta",
            }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "Loaded Dotta's company profile." },
      ]));

    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Show dotta's profile.",
      modelId: "gpt-5.4",
      onEvent: () => undefined,
    });

    const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_company_user_profile",
      "list_company_user_directory",
    ]));
    expect(assistantMessage.content).toBe("Loaded Dotta's company profile.");
  });

  it("executes issue inbox archive actions end to end with lookup plus state tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-archive-issue-${randomUUID()}`;
    const company = await insertCompany(db, "Issue Archive Tool Company");
    await insertUser(db, userId, "Archive Tool User");
    const issue = await issueService(db).create(company.id, {
      title: "Onboarding",
      status: "todo",
      priority: "medium",
    });
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-list-issues-archive",
            name: "list_issues",
            arguments: JSON.stringify({ q: "Onboarding" }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-archive-issue-inbox",
            name: "archive_issue_inbox",
            arguments: JSON.stringify({
              issueRef: "Onboarding",
            }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "Archived onboarding from the inbox." },
      ]));

    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Archive onboarding from my inbox.",
      modelId: "gpt-5.4",
      onEvent: () => undefined,
    });

    const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "list_issues",
      "get_issue",
      "archive_issue_inbox",
    ]));
    const archived = await db
      .select()
      .from(issueInboxArchives)
      .where(eq(issueInboxArchives.issueId, issue.id))
      .then((rows) => rows[0] ?? null);
    expect(archived).toMatchObject({
      companyId: company.id,
      issueId: issue.id,
      userId,
    });
    expect(assistantMessage.content).toBe("Archived onboarding from the inbox.");
  });

  it("executes issue checkout actions end to end with issue and agent lookup tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-checkout-issue-${randomUUID()}`;
    const company = await insertCompany(db, "Issue Checkout Tool Company");
    await insertUser(db, userId, "Checkout Tool User");
    const issue = await issueService(db).create(company.id, {
      title: "Onboarding",
      status: "todo",
      priority: "medium",
    });
    const agent = await db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "CEO",
        role: "ceo",
        title: "Chief Executive Officer",
        adapterType: "process",
        adapterConfig: {},
        runtimeConfig: {},
        status: "idle",
      })
      .returning()
      .then((rows) => rows[0]!);
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-list-issues-checkout",
            name: "list_issues",
            arguments: JSON.stringify({ q: "Onboarding" }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-checkout-issue",
            name: "checkout_issue",
            arguments: JSON.stringify({
              issueRef: "Onboarding",
              agentRef: "CEO",
            }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "Checked out onboarding to the CEO agent." },
      ]));

    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Check out onboarding to the CEO agent.",
      modelId: "gpt-5.4",
      onEvent: () => undefined,
    });

    const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "list_issues",
      "get_issue",
      "list_agents",
      "get_agent",
      "checkout_issue",
    ]));
    const updatedIssue = await db
      .select()
      .from(issues)
      .where(eq(issues.id, issue.id))
      .then((rows) => rows[0] ?? null);
    expect(updatedIssue).toMatchObject({
      assigneeAgentId: agent.id,
    });
    const run = await db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.agentId, agent.id))
      .then((rows) => rows[0] ?? null);
    expect(run).toMatchObject({
      status: "queued",
      invocationSource: "assignment",
    });
    expect(assistantMessage.content).toBe("Checked out onboarding to the CEO agent.");
  });

  it("executes preview stop actions end to end with runtime-aware tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-stop-preview-${randomUUID()}`;
    const company = await insertCompany(db, "Stop Preview Tool Company");
    await insertUser(db, userId, "Stop Preview User");
    const projectsSvc = projectService(db);
    const dispatcher = createHomeToolDispatcher(db, {
      heartbeatOptions: { autoStartQueuedRuns: false },
    });
    const workspaceRoot = await fs.mkdtemp(path.join(process.cwd(), "tmp-home-chat-runtime-" + randomUUID()));
    const originalShell = process.env.SHELL;
    if (process.platform === "win32") {
      process.env.SHELL = "C:\\Program Files\\Git\\bin\\bash.exe";
    }

    try {
      const project = await projectsSvc.create(company.id, { name: "Onboarding" });
      const workspace = await projectsSvc.createWorkspace(project.id, {
        name: "Preview Workspace",
        cwd: workspaceRoot,
        isPrimary: true,
        runtimeConfig: {
          workspaceRuntime: {
            services: [
              {
                name: "web",
                command:
                  "node -e \"require('node:http').createServer((req,res)=>res.end('ok')).listen(Number(process.env.PORT), '127.0.0.1')\"",
                port: { type: "auto" },
                readiness: {
                  type: "http",
                  urlTemplate: "http://127.0.0.1:{{port}}",
                  timeoutSec: 10,
                  intervalMs: 100,
                },
                lifecycle: "shared",
                reuseScope: "project_workspace",
                stopPolicy: { type: "manual" },
              },
            ],
          },
        },
      });
      await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId: userId,
          threadId: randomUUID(),
        },
        name: "start_project_workspace_runtime",
        parameters: {
          projectRef: "Onboarding",
          projectWorkspaceRef: "Preview Workspace",
        },
      });

      const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });
      openAICreateMock
        .mockResolvedValueOnce(createAsyncIterable([
          {
            type: "response.output_item.done",
            item: {
              type: "function_call",
              call_id: "call-stop-project-runtime",
              name: "stop_project_workspace_runtime",
              arguments: JSON.stringify({
                projectRef: "Onboarding",
                projectWorkspaceRef: "Preview Workspace",
              }),
            },
          },
        ]))
        .mockResolvedValueOnce(createAsyncIterable([
          { type: "response.output_text.delta", delta: "Stopped the onboarding preview." },
        ]));

      const assistantMessage = await svc.streamThreadReply({
        companyId: company.id,
        ownerUserId: userId,
        threadId: thread.id,
        content: "Stop the onboarding preview.",
        modelId: "gpt-5.4",
        onEvent: () => undefined,
      });

      const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
      expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "stop_project_workspace_runtime",
        "list_projects",
        "list_project_workspaces",
        "get_active_preview",
      ]));
      const runtimeRows = await db
        .select()
        .from(workspaceRuntimeServices)
        .where(eq(workspaceRuntimeServices.projectWorkspaceId, workspace.id));
      expect(runtimeRows.every((row) => row.status === "stopped")).toBe(true);
      expect(assistantMessage.content).toBe("Stopped the onboarding preview.");
    } finally {
      process.env.SHELL = originalShell;
      const workspaceId = await db
        .select()
        .from(projectWorkspaces)
        .where(eq(projectWorkspaces.cwd, workspaceRoot))
        .then((rows) => rows[0]?.id ?? null);
      if (workspaceId) {
        await stopRuntimeServicesForProjectWorkspace({
          db,
          projectWorkspaceId: workspaceId,
        }).catch(() => undefined);
      }
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("executes secret rotation actions end to end with redacted secret tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const originalSecretsMasterKey = process.env.PAPERCLIP_SECRETS_MASTER_KEY;
    process.env.PAPERCLIP_SECRETS_MASTER_KEY = "12345678901234567890123456789012";
    const userId = `user-rotate-secret-${randomUUID()}`;
    const company = await insertCompany(db, "Rotate Secret Tool Company");
    await insertUser(db, userId, "Rotate Secret User");
    const secrets = secretService(db);
    const secret = await secrets.create(company.id, {
      name: "FOLLOWUP_BOSS_API_KEY",
      provider: "local_encrypted",
      value: "first-secret",
    }, {
      userId,
    });
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    try {
      openAICreateMock
        .mockResolvedValueOnce(createAsyncIterable([
          {
            type: "response.output_item.done",
            item: {
              type: "function_call",
              call_id: "call-rotate-secret",
              name: "rotate_company_secret",
              arguments: JSON.stringify({
                secretRef: "FOLLOWUP_BOSS_API_KEY",
                value: "second-secret",
              }),
            },
          },
        ]))
        .mockResolvedValueOnce(createAsyncIterable([
          { type: "response.output_text.delta", delta: "Rotated the FollowupBoss secret." },
        ]));

      const assistantMessage = await svc.streamThreadReply({
        companyId: company.id,
        ownerUserId: userId,
        threadId: thread.id,
        content: "Rotate the FollowupBoss secret.",
        modelId: "gpt-5.4",
        onEvent: () => undefined,
      });

      const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
      expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "list_secret_metadata",
        "rotate_company_secret",
      ]));
      const rotated = await db
        .select()
        .from(companySecrets)
        .where(eq(companySecrets.id, secret.id))
        .then((rows) => rows[0] ?? null);
      expect(rotated).toMatchObject({
        latestVersion: 2,
      });
      expect(assistantMessage.content).toBe("Rotated the FollowupBoss secret.");
    } finally {
      process.env.PAPERCLIP_SECRETS_MASTER_KEY = originalSecretsMasterKey;
    }
  });

  it("executes approval actions end to end with approval lookup tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-approval-tools-${randomUUID()}`;
    const company = await insertCompany(db, "Approval Tool Company");
    await insertUser(db, userId, "Approval Tool User");
    const approval = await db
      .insert(approvals)
      .values({
        companyId: company.id,
        type: "budget_override_required",
        requestedByUserId: userId,
        status: "pending",
        payload: { scopeType: "company", amountLimit: 1200 },
      })
      .returning()
      .then((rows) => rows[0]!);
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-list-approvals",
            name: "list_approvals",
            arguments: JSON.stringify({ status: "pending" }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-approve-approval",
            name: "approve_approval",
            arguments: JSON.stringify({
              approvalId: approval.id,
              decisionNote: "Approved for launch.",
            }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "Approved the latest budget approval." },
      ]));

    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Approve the latest budget approval.",
      modelId: "gpt-5.4",
      onEvent: () => undefined,
    });

    const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "list_approvals",
      "get_approval",
      "approve_approval",
    ]));
    const approved = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, approval.id))
      .then((rows) => rows[0] ?? null);
    expect(approved).toMatchObject({
      status: "approved",
      decidedByUserId: userId,
    });
    expect(assistantMessage.content).toBe("Approved the latest budget approval.");
  });

  it("widens direct internal tool exposure for capability questions without wrapper tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-capability-tools-${randomUUID()}`;
    const company = await insertCompany(db, "Capability Company");
    await insertUser(db, userId, "Capability User");
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock.mockResolvedValue(createAsyncIterable([
      { type: "response.output_text.delta", delta: "I can help with agents, budgets, projects, and approvals." },
    ]));

    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "What can Archie do?",
      modelId: "gpt-5.4",
      onEvent: () => undefined,
    });

    const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.length).toBeGreaterThan(10);
    expect(firstTools.length).toBeLessThanOrEqual(20);
    expect(firstTools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "list_agents",
      "get_costs_and_budgets",
      "list_projects",
      "list_approvals",
    ]));
    expect(firstTools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      "list_home_tools",
      "search_home_tools",
      "call_home_tool",
    ]));
    expect(assistantMessage.content).toBe("I can help with agents, budgets, projects, and approvals.");
  });

  it("rejects malformed OpenAI tool calls without emitting fake tool events", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-malformed-tool-${randomUUID()}`;
    const company = await insertCompany(db, "Malformed Tool Company");
    await insertUser(db, userId, "Malformed Tool User");
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4-mini" });

    openAICreateMock.mockResolvedValueOnce(createAsyncIterable([
      {
        type: "response.function_call_arguments.done",
        call_id: "call-missing-name",
        arguments: JSON.stringify({ scope: "company", monthlyCents: 1000 }),
      },
    ]));

    const toolEvents: Array<{ type: string; name?: string; displayName?: string; error?: string }> = [];
    await expect(svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Give me a company overview.",
      modelId: "gpt-5.4-mini",
      onEvent: (event) => {
        if (
          event.type === "tool_call_failed"
          || event.type === "tool_call_requested"
          || event.type === "tool_call_started"
          || event.type === "tool_call_result"
        ) {
          toolEvents.push({
            type: event.type,
            name: event.name,
            displayName: event.displayName,
            error: "error" in event ? event.error : undefined,
          });
        }
      },
    })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("incomplete Home tool call"),
    });

    expect(toolEvents).toEqual([]);
    expect(openAICreateMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces structured ambiguous-reference failures for Home tools", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-ambiguous-agent-tool-${randomUUID()}`;
    const company = await insertCompany(db, "Ambiguous Agent Tool Company");
    await insertUser(db, userId, "Ambiguous Agent Tool User");
    await db.insert(agents).values([
      {
        companyId: company.id,
        name: "CEO",
        role: "general",
        title: "Chief Executive Officer",
        model: "test-model",
        status: "idle",
      },
      {
        companyId: company.id,
        name: "Ceo",
        role: "general",
        title: "Executive Lead",
        model: "test-model",
        status: "idle",
      },
    ]);
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-pause-agent-ambiguous",
            name: "pause_agent",
            arguments: JSON.stringify({ agentRef: "CEO" }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "I found multiple matching agents. Use a more specific reference." },
      ]));

    const toolEvents: Array<{ type: string; name?: string; error?: string; data?: unknown }> = [];
    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Pause the CEO agent.",
      modelId: "gpt-5.4",
      onEvent: (event) => {
        if (
          event.type === "tool_call_failed"
          || event.type === "tool_call_requested"
          || event.type === "tool_call_started"
          || event.type === "tool_call_result"
        ) {
          toolEvents.push({
            type: event.type,
            name: event.name,
            error: "error" in event ? event.error : undefined,
            data: "data" in event ? event.data : undefined,
          });
        }
      },
    });

    const failedEvent = toolEvents.find((event) => event.type === "tool_call_failed");
    expect(failedEvent).toMatchObject({
      name: "pause_agent",
      error: 'Agent reference "CEO" is ambiguous in this company.',
      data: expect.objectContaining({
        code: "ambiguous_reference",
        entityType: "agent",
        reference: "CEO",
      }),
    });
    expect(openAICreateMock.mock.calls[1]?.[0]?.input).toEqual(expect.arrayContaining([
      {
        type: "function_call_output",
        call_id: "call-pause-agent-ambiguous",
        output: expect.stringContaining('"code": "ambiguous_reference"'),
      },
    ]));
    expect(assistantMessage.content).toBe("I found multiple matching agents. Use a more specific reference.");
  });

  it("auto-executes risky OpenAI tool calls exactly once", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    const userId = `user-confirm-tool-${randomUUID()}`;
    const company = await insertCompany(db, "Confirm Tool Company");
    await insertUser(db, userId, "Confirm Tool User");
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "gpt-5.4" });

    openAICreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call-update-budget",
            name: "update_budget",
            arguments: JSON.stringify({ scope: "company", monthlyCents: 1000 }),
          },
        },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "response.output_text.delta", delta: "Updated the company budget to $10." },
      ]));

    const events: Array<{ type: string; name?: string }> = [];
    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Set the company budget to $10.",
      modelId: "gpt-5.4",
      onEvent: (event) => {
        events.push({ type: event.type, name: "name" in event ? event.name : undefined });
      },
    });

    expect(events).toEqual(expect.arrayContaining([
      { type: "tool_call_requested", name: "update_budget" },
      { type: "tool_call_started", name: "update_budget" },
      { type: "tool_call_result", name: "update_budget" },
    ]));
    const firstTools = openAICreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.map((tool) => tool.name)).toContain("update_budget");
    expect(firstTools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      "list_home_tools",
      "search_home_tools",
      "call_home_tool",
    ]));
    expect(events.map((event) => event.type)).not.toContain("tool_confirmation_required");
    expect(assistantMessage.content).toBe("Updated the company budget to $10.");

    const updatedCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.id, company.id))
      .then((rows) => rows[0] ?? null);
    expect(updatedCompany?.budgetMonthlyCents).toBe(1000);

    const homeToolEvents = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.companyId, company.id));
    expect(homeToolEvents.filter((event) => event.action === "home_tool.executed")).toHaveLength(1);
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

  it("auto-executes risky Anthropic tool calls and streams the result path", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    const userId = `user-anthropic-tool-${randomUUID()}`;
    const company = await insertCompany(db, "Anthropic Tool Company");
    await insertUser(db, userId, "Anthropic Tool User");
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "claude-haiku-4-5" });

    anthropicCreateMock
      .mockResolvedValueOnce(createAsyncIterable([
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "toolu_update_budget", name: "update_budget" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: "{\"scope\":\"company\",\"monthlyCents\":2500}",
          },
        },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" },
      ]))
      .mockResolvedValueOnce(createAsyncIterable([
        { type: "content_block_delta", delta: { type: "text_delta", text: "Budget updated." } },
        { type: "content_block_stop" },
        { type: "message_stop" },
      ]));

    const toolEvents: Array<{ type: string; name?: string }> = [];
    const assistantMessage = await svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Raise the company budget to $25.",
      modelId: "claude-haiku-4-5",
      onEvent: (event) => {
        toolEvents.push({ type: event.type, name: "name" in event ? event.name : undefined });
      },
    });

    expect(toolEvents).toEqual(expect.arrayContaining([
      { type: "tool_call_requested", name: "update_budget" },
      { type: "tool_call_started", name: "update_budget" },
      { type: "tool_call_result", name: "update_budget" },
    ]));
    const firstTools = anthropicCreateMock.mock.calls[0]?.[0]?.tools as Array<{ name?: string }>;
    expect(firstTools.map((tool) => tool.name)).toContain("update_budget");
    expect(firstTools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      "list_home_tools",
      "search_home_tools",
      "call_home_tool",
    ]));
    expect(toolEvents.map((event) => event.type)).not.toContain("tool_confirmation_required");
    expect(assistantMessage.content).toBe("Budget updated.");

    const updatedCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.id, company.id))
      .then((rows) => rows[0] ?? null);
    expect(updatedCompany?.budgetMonthlyCents).toBe(2500);
  });

  it("rejects malformed Anthropic tool calls without emitting fake tool events", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
    const userId = `user-anthropic-malformed-tool-${randomUUID()}`;
    const company = await insertCompany(db, "Malformed Anthropic Tool Company");
    await insertUser(db, userId, "Malformed Anthropic Tool User");
    const thread = await svc.createThread(company.id, userId, { selectedModelId: "claude-haiku-4-5" });

    anthropicCreateMock.mockResolvedValueOnce(createAsyncIterable([
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_missing_name", name: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: "{\"scope\":\"company\"}",
        },
      },
      { type: "content_block_stop", index: 0 },
      { type: "message_stop" },
    ]));

    const toolEvents: Array<{ type: string; name?: string }> = [];
    await expect(svc.streamThreadReply({
      companyId: company.id,
      ownerUserId: userId,
      threadId: thread.id,
      content: "Change the company budget.",
      modelId: "claude-haiku-4-5",
      onEvent: (event) => {
        if (
          event.type === "tool_call_failed"
          || event.type === "tool_call_requested"
          || event.type === "tool_call_started"
          || event.type === "tool_call_result"
        ) {
          toolEvents.push({ type: event.type, name: event.name });
        }
      },
    })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("without a valid tool name"),
    });

    expect(toolEvents).toEqual([]);
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
