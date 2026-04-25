import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  agentRuntimeState,
  agentTaskSessions,
  agentWakeupRequests,
  approvalComments,
  approvals,
  assets,
  authUsers,
  companyLogos,
  companyMemberships,
  companyUserSidebarPreferences,
  companySecretVersions,
  companySecrets,
  budgetIncidents,
  budgetPolicies,
  companySkills,
  companies,
  costEvents,
  createDb,
  documentRevisions,
  documents,
  executionWorkspaces,
  financeEvents,
  goals,
  heartbeatRuns,
  issueAttachments,
  issueApprovals,
  issueComments,
  issueDocuments,
  issueInboxArchives,
  issueReadStates,
  issueWorkProducts,
  invites,
  issues,
  joinRequests,
  principalPermissionGrants,
  projects,
  projectWorkspaces,
  routines,
  routineRuns,
  routineTriggers,
  userSidebarPreferences,
  workspaceRuntimeServices,
} from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { cleanupHomeHeartbeatSideEffects } from "./helpers/home-heartbeat-cleanup.js";
import {
  HOME_CAPABILITY_EXCLUDED_ROUTE_PREFIXES,
  HOME_CAPABILITY_INCLUDED_FAMILIES,
  HOME_ACTION_CATALOG,
} from "../services/home-capabilities/action-catalog.js";
import { createHomeCapabilityRegistry } from "../services/home-capabilities/registry.js";
import { agentService } from "../services/agents.js";
import { documentService } from "../services/documents.js";
import { heartbeatService } from "../services/heartbeat.js";
import { issueService } from "../services/issues.js";
import { projectService } from "../services/projects.js";
import { workProductService } from "../services/work-products.js";
import { stopRuntimeServicesForProjectWorkspace } from "../services/workspace-runtime.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport().catch(() => ({ supported: true }));
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

function createRegistryWithoutDb() {
  return createHomeCapabilityRegistry({} as ReturnType<typeof createDb>);
}

function createTestRegistry(db: ReturnType<typeof createDb>) {
  return createHomeCapabilityRegistry(db, {
    heartbeatOptions: { autoStartQueuedRuns: false },
  });
}

async function insertCompany(db: ReturnType<typeof createDb>, name: string) {
  return await db
    .insert(companies)
    .values({
      name,
      issuePrefix: `HT${randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    })
    .returning()
    .then((rows) => rows[0]!);
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

describe("home capability registry", () => {
  it("lists normalized inventory items with stable internal source metadata", () => {
    const dispatcher = createRegistryWithoutDb();
    const inventory = dispatcher.listInventory();
    const updateBudget = dispatcher.searchInventory("update budget", null, 8)
      .find((tool) => tool.name === "update_budget");
    expect(inventory.length).toBeGreaterThan(0);
    expect(inventory.every((tool) => tool.sourceKind === "internal")).toBe(true);
    expect(inventory.every((tool) => tool.sourceId === "paperclip.home.capabilities")).toBe(true);
    expect(updateBudget).toMatchObject({
      displayName: "Update budget",
      riskLevel: "risky",
      sourceKind: "internal",
      sourceId: "paperclip.home.capabilities",
    });
  });

  it("exposes stable internal registry keys for direct tool dispatch", () => {
    const dispatcher = createRegistryWithoutDb();
    expect(dispatcher.getTool("update_budget")).toMatchObject({
      registryKey: "internal.update_budget",
      name: "update_budget",
    });
    expect(dispatcher.getToolByRegistryKey("internal.pause_agent")).toMatchObject({
      registryKey: "internal.pause_agent",
      name: "pause_agent",
    });
  });

  it("drives the internal catalog from a positive manifest allowlist", () => {
    const enabledEntries = HOME_ACTION_CATALOG.filter((entry) => entry.enabled);
    const dispatcher = createRegistryWithoutDb();
    const enabledNames = new Set(enabledEntries.map((entry) => entry.name));
    const enabledFamilies = new Set(enabledEntries.map((entry) => entry.family));

    expect(new Set(dispatcher.listTools().map((tool) => tool.name))).toEqual(enabledNames);

    for (const family of HOME_CAPABILITY_INCLUDED_FAMILIES) {
      expect(enabledFamilies.has(family)).toBe(true);
    }

    for (const entry of enabledEntries) {
      expect(entry.registryKey).toBe(`internal.${entry.name}`);
      expect(entry.companyScope).toBe("active_company");
      expect(entry.family.length).toBeGreaterThan(0);
      expect(entry.selectors.length).toBeGreaterThan(0);
      expect(entry.routeReferences.length).toBeGreaterThan(0);
      expect(entry.serviceReferences.length).toBeGreaterThan(0);
      expect(entry.outputIdentifiers.length).toBeGreaterThan(0);
      if (entry.operationKind !== "read") {
        expect(entry.companionNames.length).toBeGreaterThan(0);
      }
      for (const routeReference of entry.routeReferences) {
        const [, routePath = ""] = routeReference.split(/\s+/, 2);
        expect(HOME_CAPABILITY_EXCLUDED_ROUTE_PREFIXES.some((prefix) => routePath.startsWith(prefix))).toBe(false);
      }
    }
  });

  it.each([
    ["create agenda item", "create_issue"],
    ["pause an agent", "pause_agent"],
    ["wake an agent", "wake_agent"],
    ["restart preview", "restart_preview_runtime"],
    ["show budget risk", "get_costs_and_budgets"],
    ["what happened today", "list_recent_activity"],
    ["company skills", "list_company_skills"],
  ])("finds the expected tool for %s", (query, expectedName) => {
    const dispatcher = createRegistryWithoutDb();
    const results = dispatcher.searchTools(query, null, 8);
    expect(results.map((tool) => tool.name)).toContain(expectedName);
  });

  it("searches the same normalized inventory source used for listing", () => {
    const dispatcher = createRegistryWithoutDb();
    expect(dispatcher.searchInventory("pause an agent", null, 8).map((tool) => tool.name))
      .toEqual(dispatcher.searchTools("pause an agent", null, 8).map((tool) => tool.name));
  });

  it("selects a bounded direct tool subset for focused requests", () => {
    const dispatcher = createRegistryWithoutDb();
    const selection = dispatcher.selectTools("pause an agent");
    expect(selection.isCapabilityQuery).toBe(false);
    expect(selection.limit).toBe(12);
    expect(selection.tools.length).toBeLessThanOrEqual(12);
    expect(selection.tools.map((tool) => tool.name)).toContain("pause_agent");
    expect(selection.tools.map((tool) => tool.name)).toContain("list_agents");
  });

  it("adds companion lookup tools for risky action turns", () => {
    const dispatcher = createRegistryWithoutDb();
    const selection = dispatcher.selectTools("restart the preview runtime");
    expect(selection.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "restart_preview_runtime",
      "list_projects",
      "list_execution_workspaces",
      "get_active_preview",
    ]));
  });

  it("adds agent lookup/detail tools for wake actions", () => {
    const dispatcher = createRegistryWithoutDb();
    const selection = dispatcher.selectTools("wake the CEO agent");
    expect(selection.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "wake_agent",
      "list_agents",
      "get_agent",
      "get_agent_runtime_state",
    ]));
    expect(selection.tools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      "list_home_tools",
      "search_home_tools",
      "call_home_tool",
      "install_adapter",
      "backup_database",
    ]));
  });

  it("widens the direct tool subset for capability questions", () => {
    const dispatcher = createRegistryWithoutDb();
    const selection = dispatcher.selectTools("What can Archie do?");
    expect(selection.isCapabilityQuery).toBe(true);
    expect(selection.limit).toBe(20);
    expect(selection.tools.length).toBeGreaterThan(10);
    expect(selection.tools.length).toBeLessThanOrEqual(20);
  });

  it("does not expose platform/server administration tools", () => {
    const dispatcher = createRegistryWithoutDb();
    const names = dispatcher.listTools().map((tool) => tool.name);
    const inventoryNames = dispatcher.listInventory().map((tool) => tool.name);
    expect(names).not.toContain("install_adapter");
    expect(names).not.toContain("reload_plugin");
    expect(names).not.toContain("backup_database");
    expect(names).not.toContain("run_migration");
    expect(inventoryNames).not.toContain("install_adapter");
    expect(inventoryNames).not.toContain("reload_plugin");
    expect(inventoryNames).not.toContain("backup_database");
    expect(inventoryNames).not.toContain("run_migration");
    expect(dispatcher.searchTools("adapter install server backup database migration", null, 20).map((tool) => tool.name))
      .not.toEqual(expect.arrayContaining(["install_adapter", "backup_database", "run_migration"]));
  });
});

describeEmbeddedPostgres("home tool execution authz", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  function createCtx(companyId: string) {
    return {
      companyId,
      ownerUserId: "user-home-capabilities",
      threadId: randomUUID(),
    };
  }

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-home-capabilities-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(approvalComments);
    await db.delete(issueApprovals);
    await db.delete(approvals);
    await db.delete(joinRequests);
    await db.delete(invites);
    await db.delete(principalPermissionGrants);
    await db.delete(companyMemberships);
    await db.delete(companyUserSidebarPreferences);
    await db.delete(userSidebarPreferences);
    await db.delete(workspaceRuntimeServices);
    await db.delete(executionWorkspaces);
    await db.delete(projectWorkspaces);
    await db.delete(routineRuns);
    await db.delete(routineTriggers);
    await db.delete(routines);
    await db.delete(issueAttachments);
    await db.delete(issueWorkProducts);
    await db.delete(issueComments);
    await db.delete(issueReadStates);
    await db.delete(issueInboxArchives);
    await db.delete(issueDocuments);
    await db.delete(documentRevisions);
    await db.delete(documents);
    await db.delete(financeEvents);
    await db.delete(costEvents);
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(budgetIncidents);
    await db.delete(budgetPolicies);
    await db.delete(companySecretVersions);
    await db.delete(companySecrets);
    await db.delete(companySkills);
    await db.delete(goals);
    await db.delete(companyLogos);
    await cleanupHomeHeartbeatSideEffects(db);
    await db.delete(agents);
    await db.delete(assets);
    await db.delete(authUsers);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("rejects cross-company entity ids even when supplied by the model", async () => {
    const companyA = await insertCompany(db, "Home Tools A");
    const companyB = await insertCompany(db, "Home Tools B");
    const foreignAgent = await db
      .insert(agents)
      .values({
        companyId: companyB.id,
        name: "Foreign Agent",
        role: "general",
        title: "Worker",
        model: "test-model",
        status: "idle",
      })
      .returning()
      .then((rows) => rows[0]!);

    const dispatcher = createTestRegistry(db);
    await expect(dispatcher.executeTool({
      ctx: {
        ...createCtx(companyA.id),
        ownerUserId: "user-cross-company",
      },
      name: "pause_agent",
      parameters: { agentId: foreignAgent.id },
    })).rejects.toMatchObject({ status: 403 });
  });

  it("executes risky budget updates immediately", async () => {
    const company = await insertCompany(db, "Budget Company");
    const dispatcher = createTestRegistry(db);

    const result = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "update_budget",
      parameters: { scope: "company", monthlyCents: 1000 },
    });

    expect(result.status).toBe("completed");
    expect(result.content).toContain("Updated company budget");

    const updatedCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.id, company.id))
      .then((rows) => rows[0] ?? null);
    expect(updatedCompany?.budgetMonthlyCents).toBe(1000);
  });

  it("resolves agent refs for pause_agent, including legacy non-UUID agentId input", async () => {
    const company = await insertCompany(db, "Agent Ref Company");
    const dispatcher = createTestRegistry(db);
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

    const byRef = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "pause_agent",
      parameters: { agentRef: "CEO" },
    });
    expect(byRef.status).toBe("completed");
    expect(byRef.content).toContain("Paused CEO");

    await db.update(agents).set({ status: "idle", pauseReason: null, pausedAt: null }).where(eq(agents.id, agent.id));

    const byLegacyId = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "pause_agent",
      parameters: { agentId: "CEO" },
    });
    expect(byLegacyId.status).toBe("completed");
    expect(byLegacyId.content).toContain("Paused CEO");
  });

  it("returns a structured ambiguity error for human agent refs", async () => {
    const company = await insertCompany(db, "Ambiguous Agent Company");
    const dispatcher = createTestRegistry(db);
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

    await expect(dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "pause_agent",
      parameters: { agentRef: "CEO" },
    })).rejects.toMatchObject({
      status: 409,
      message: 'Agent reference "CEO" is ambiguous in this company.',
      details: expect.objectContaining({
        code: "ambiguous_reference",
        entityType: "agent",
        reference: "CEO",
      }),
    });
  });

  it("reads agent detail and org data through Home tools with service-parity results", async () => {
    const company = await insertCompany(db, "Agent Detail Company");
    const dispatcher = createTestRegistry(db);
    const agentsSvc = agentService(db);
    const ceo = await db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "CEO",
        role: "ceo",
        title: "Chief Executive Officer",
        model: "test-model",
        status: "idle",
      })
      .returning()
      .then((rows) => rows[0]!);
    const worker = await db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "Sales Agent",
        role: "sales",
        title: "Sales Agent",
        model: "test-model",
        status: "idle",
        reportsTo: ceo.id,
      })
      .returning()
      .then((rows) => rows[0]!);

    const detailResult = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "get_agent",
      parameters: { agentRef: "Sales Agent" },
    });
    expect(detailResult.status).toBe("completed");
    expect(detailResult.content).toContain("Sales Agent");
    expect(detailResult.data).toMatchObject({
      id: worker.id,
      name: "Sales Agent",
      reportsTo: ceo.id,
      chainOfCommand: await agentsSvc.getChainOfCommand(worker.id),
      access: expect.objectContaining({
        canAssignTasks: false,
        taskAssignSource: "none",
      }),
    });

    const orgResult = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "get_company_org",
      parameters: {},
    });
    expect(orgResult.status).toBe("completed");
    expect(orgResult.data).toMatchObject([
      {
        id: ceo.id,
        name: "CEO",
        role: "ceo",
        status: "idle",
        reports: [
          {
            id: worker.id,
            name: "Sales Agent",
            role: "sales",
            status: "idle",
            reports: [],
          },
        ],
      },
    ]);
  });

  it("reads and resets agent runtime sessions through Home tools with service-parity results", async () => {
    const company = await insertCompany(db, "Agent Runtime Company");
    const dispatcher = createTestRegistry(db);
    const heartbeats = heartbeatService(db);
    const agent = await db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "Ops Agent",
        role: "general",
        title: "Operations Agent",
        model: "test-model",
        status: "idle",
      })
      .returning()
      .then((rows) => rows[0]!);

    const runtimeResult = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "get_agent_runtime_state",
      parameters: { agentRef: "Ops Agent" },
    });
    expect(runtimeResult.status).toBe("completed");
    expect(runtimeResult.data).toMatchObject(await heartbeats.getRuntimeState(agent.id) as Record<string, unknown>);

    await db
      .update(agentRuntimeState)
      .set({
        sessionId: "persisted-session",
        lastError: "stale-session",
        updatedAt: new Date(),
      })
      .where(eq(agentRuntimeState.agentId, agent.id));

    const seededRuntime = await heartbeats.getRuntimeState(agent.id);
    await db.insert(agentTaskSessions).values({
      companyId: company.id,
      agentId: agent.id,
      adapterType: agent.adapterType,
      taskKey: "issue/triage",
      sessionParamsJson: { mode: "triage" },
      sessionDisplayId: "sess-triage-1",
      lastRunId: seededRuntime?.lastRunId ?? null,
      lastError: null,
    });

    const listSessionsResult = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "list_agent_task_sessions",
      parameters: { agentId: agent.id },
    });
    expect(listSessionsResult.status).toBe("completed");
    expect(listSessionsResult.data).toMatchObject([
      expect.objectContaining({
        agentId: agent.id,
        taskKey: "issue/triage",
        sessionDisplayId: "sess-triage-1",
        sessionParamsJson: { mode: "triage" },
      }),
    ]);

    const resetResult = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "reset_agent_runtime_session",
      parameters: { agentRef: "Ops Agent", taskKey: "issue/triage" },
    });
    expect(resetResult.status).toBe("completed");
    expect(resetResult.content).toContain("issue/triage");
    expect(await heartbeats.listTaskSessions(agent.id)).toHaveLength(0);
    expect(resetResult.data).toMatchObject(await heartbeats.getRuntimeState(agent.id) as Record<string, unknown>);
    expect(resetResult.data).toMatchObject({
      agentId: agent.id,
      sessionId: null,
      lastError: null,
    });
  });

  it("queues wakeups and on-demand heartbeats through Home tools", async () => {
    const company = await insertCompany(db, "Agent Wake Company");
    const dispatcher = createTestRegistry(db);
    const selection = dispatcher.selectTools("wake the Wake Agent");
    expect(selection.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "wake_agent",
      "list_agents",
      "get_agent",
      "get_agent_runtime_state",
    ]));
    expect(selection.tools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      "list_home_tools",
      "search_home_tools",
      "call_home_tool",
      "install_adapter",
      "reload_plugin",
    ]));
    const wakeAgent = await db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "Wake Agent",
        role: "general",
        title: "Wake Agent",
        model: "test-model",
        status: "idle",
      })
      .returning()
      .then((rows) => rows[0]!);
    const heartbeatAgent = await db
      .insert(agents)
      .values({
        companyId: company.id,
        name: "Heartbeat Agent",
        role: "general",
        title: "Heartbeat Agent",
        model: "test-model",
        status: "idle",
      })
      .returning()
      .then((rows) => rows[0]!);

    const wakeResult = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "wake_agent",
      parameters: {
        agentRef: "Wake Agent",
        reason: "manual_followup",
        payload: { topic: "onboarding" },
      },
    });
    expect(wakeResult.status).toBe("completed");
    expect(wakeResult.content).toContain("Queued a wakeup for Wake Agent.");
    expect(wakeResult.data).toMatchObject({
      agentId: wakeAgent.id,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "queued",
    });
    const wakeRun = wakeResult.data as { id: string; wakeupRequestId?: string | null };
    const persistedWakeRun = await db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, wakeRun.id))
      .then((rows) => rows[0] ?? null);
    const persistedWakeRequest = wakeRun.wakeupRequestId
      ? await db
        .select()
        .from(agentWakeupRequests)
        .where(eq(agentWakeupRequests.id, wakeRun.wakeupRequestId))
        .then((rows) => rows[0] ?? null)
      : null;
    expect(persistedWakeRun).toMatchObject({
      id: wakeRun.id,
      companyId: company.id,
      agentId: wakeAgent.id,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "queued",
      wakeupRequestId: wakeRun.wakeupRequestId ?? null,
    });
    expect(persistedWakeRequest).toMatchObject({
      id: wakeRun.wakeupRequestId,
      companyId: company.id,
      agentId: wakeAgent.id,
      status: "queued",
      runId: wakeRun.id,
      source: "on_demand",
      triggerDetail: "manual",
      reason: "manual_followup",
    });

    const invokeResult = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "invoke_agent_heartbeat",
      parameters: { agentId: heartbeatAgent.id },
    });
    expect(invokeResult.status).toBe("completed");
    expect(invokeResult.content).toContain("Queued an on-demand heartbeat for Heartbeat Agent.");
    expect(invokeResult.data).toMatchObject({
      agentId: heartbeatAgent.id,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "queued",
    });
    const invokeRun = invokeResult.data as { id: string; wakeupRequestId?: string | null };
    const persistedInvokeRun = await db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, invokeRun.id))
      .then((rows) => rows[0] ?? null);
    const persistedInvokeRequest = invokeRun.wakeupRequestId
      ? await db
        .select()
        .from(agentWakeupRequests)
        .where(eq(agentWakeupRequests.id, invokeRun.wakeupRequestId))
        .then((rows) => rows[0] ?? null)
      : null;
    expect(persistedInvokeRun).toMatchObject({
      id: invokeRun.id,
      companyId: company.id,
      agentId: heartbeatAgent.id,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "queued",
      wakeupRequestId: invokeRun.wakeupRequestId ?? null,
    });
    expect(persistedInvokeRequest).toMatchObject({
      id: invokeRun.wakeupRequestId,
      companyId: company.id,
      agentId: heartbeatAgent.id,
      status: "queued",
      runId: invokeRun.id,
      source: "on_demand",
      triggerDetail: "manual",
    });

    const runs = await db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.companyId, company.id));
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.agentId)).toEqual(expect.arrayContaining([wakeAgent.id, heartbeatAgent.id]));
  });

  it("adds and lists issue comments through selector-safe issue refs with service-parity results", async () => {
    const ownerUserId = `user-issue-comments-${randomUUID()}`;
    const company = await insertCompany(db, "Issue Comment Company");
    await insertUser(db, ownerUserId, "Issue Comment User");
    const dispatcher = createTestRegistry(db);
    const issuesSvc = issueService(db);
    const issue = await issuesSvc.create(company.id, {
      title: "Onboarding",
      status: "todo",
      priority: "medium",
    });

    const addResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "add_issue_comment",
      parameters: { issueRef: "Onboarding", body: "Need a tighter rollout checklist." },
    });
    expect(addResult.status).toBe("completed");
    expect(addResult.content).toContain(issue.identifier ?? issue.id);

    const comments = await issuesSvc.listComments(issue.id, { order: "asc" });
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain("Need a tighter rollout checklist.");
    expect(addResult.data).toMatchObject({
      id: comments[0]?.id,
      issueId: issue.id,
    });

    const listResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "list_issue_comments",
      parameters: { issueId: issue.id, order: "asc" },
    });
    expect(listResult.status).toBe("completed");
    expect(listResult.data).toMatchObject([
      expect.objectContaining({
        id: comments[0]?.id,
        issueId: issue.id,
      }),
    ]);
  });

  it("returns structured ambiguity errors for issue-family human refs", async () => {
    const ownerUserId = `user-issue-ambiguity-${randomUUID()}`;
    const company = await insertCompany(db, "Issue Ambiguity Company");
    await insertUser(db, ownerUserId, "Issue Ambiguity User");
    const issuesSvc = issueService(db);
    await issuesSvc.create(company.id, { title: "Onboarding", status: "todo", priority: "medium" });
    await issuesSvc.create(company.id, { title: "Onboarding", status: "todo", priority: "medium" });

    const dispatcher = createTestRegistry(db);
    await expect(dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "add_issue_comment",
      parameters: { issueRef: "Onboarding", body: "This should fail." },
    })).rejects.toMatchObject({
      status: 409,
      message: 'Issue reference "Onboarding" is ambiguous in this company.',
      details: expect.objectContaining({
        code: "ambiguous_reference",
        entityType: "issue",
        reference: "Onboarding",
      }),
    });
  });

  it("creates, updates, restores, and deletes issue documents through Home tools", async () => {
    const ownerUserId = `user-issue-docs-${randomUUID()}`;
    const company = await insertCompany(db, "Issue Document Company");
    await insertUser(db, ownerUserId, "Issue Document User");
    const dispatcher = createTestRegistry(db);
    const issuesSvc = issueService(db);
    const docsSvc = documentService(db);
    const issue = await issuesSvc.create(company.id, {
      title: "Onboarding",
      status: "todo",
      priority: "medium",
    });

    const createResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "update_issue_document",
      parameters: {
        issueRef: issue.identifier ?? issue.id,
        documentKey: "plan",
        format: "markdown",
        body: "# Rollout\n\nFirst draft.",
      },
    });
    expect(createResult.status).toBe("completed");
    const createdDocument = createResult.data as { id: string; key: string; latestRevisionId: string; body: string };
    expect(createdDocument.key).toBe("plan");

    const updateResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "update_issue_document",
      parameters: {
        issueId: issue.id,
        documentKey: "plan",
        format: "markdown",
        body: "# Rollout\n\nSecond draft.",
        baseRevisionId: createdDocument.latestRevisionId,
      },
    });
    expect(updateResult.status).toBe("completed");

    const fetched = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "get_issue_document",
      parameters: { issueRef: "Onboarding", documentKey: "plan" },
    });
    expect(fetched.status).toBe("completed");
    expect(fetched.data).toMatchObject({
      issueId: issue.id,
      key: "plan",
      body: "# Rollout\n\nSecond draft.",
    });
    expect(await docsSvc.getIssueDocumentByKey(issue.id, "plan")).toMatchObject(fetched.data as Record<string, unknown>);

    const revisions = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "list_issue_document_revisions",
      parameters: { issueId: issue.id, documentKey: "plan" },
    });
    expect(revisions.status).toBe("completed");
    expect(revisions.data).toHaveLength(2);

    const restoreResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "restore_issue_document_revision",
      parameters: { issueId: issue.id, documentKey: "plan", revisionNumber: 1 },
    });
    expect(restoreResult.status).toBe("completed");
    expect(restoreResult.data).toMatchObject({
      issueId: issue.id,
      key: "plan",
      body: "# Rollout\n\nFirst draft.",
    });

    const deleteResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "delete_issue_document",
      parameters: { issueId: issue.id, documentKey: "plan" },
    });
    expect(deleteResult.status).toBe("completed");
    expect(await docsSvc.getIssueDocumentByKey(issue.id, "plan")).toBeNull();
  });

  it("creates, updates, lists, and deletes issue work products through Home tools", async () => {
    const ownerUserId = `user-issue-work-products-${randomUUID()}`;
    const company = await insertCompany(db, "Issue Work Product Company");
    await insertUser(db, ownerUserId, "Issue Work Product User");
    const dispatcher = createTestRegistry(db);
    const issuesSvc = issueService(db);
    const workProductsSvc = workProductService(db);
    const issue = await issuesSvc.create(company.id, {
      title: "Onboarding",
      status: "todo",
      priority: "medium",
    });

    const createResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "create_issue_work_product",
      parameters: {
        issueRef: "Onboarding",
        type: "preview_url",
        provider: "preview",
        title: "Preview build",
        url: "https://example.com/preview",
        status: "active",
      },
    });
    expect(createResult.status).toBe("completed");
    const created = createResult.data as { id: string; issueId: string; title: string };

    const updateResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "update_issue_work_product",
      parameters: {
        workProductRef: "Preview build",
        issueId: issue.id,
        status: "ready_for_review",
        summary: "Ready for board review.",
      },
    });
    expect(updateResult.status).toBe("completed");
    expect(updateResult.data).toMatchObject({
      id: created.id,
      status: "ready_for_review",
      issueId: issue.id,
    });

    const listResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "list_issue_work_products",
      parameters: { issueRef: issue.identifier ?? issue.id },
    });
    expect(listResult.status).toBe("completed");
    expect(listResult.data).toMatchObject([
      expect.objectContaining({
        id: created.id,
        title: "Preview build",
      }),
    ]);
    expect(await workProductsSvc.getById(created.id)).toMatchObject(updateResult.data as Record<string, unknown>);

    const deleteResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "delete_issue_work_product",
      parameters: { workProductId: created.id },
    });
    expect(deleteResult.status).toBe("completed");
    expect(await workProductsSvc.getById(created.id)).toBeNull();
  });

  it("lists and deletes issue attachments through Home tools", async () => {
    const ownerUserId = `user-issue-attachments-${randomUUID()}`;
    const company = await insertCompany(db, "Issue Attachment Company");
    await insertUser(db, ownerUserId, "Issue Attachment User");
    const dispatcher = createTestRegistry(db);
    const issuesSvc = issueService(db);
    const issue = await issuesSvc.create(company.id, {
      title: "Onboarding",
      status: "todo",
      priority: "medium",
    });
    const attachment = await issuesSvc.createAttachment({
      issueId: issue.id,
      provider: "local_disk",
      objectKey: `issues/${issue.id}/brief.md`,
      contentType: "text/markdown",
      byteSize: 42,
      sha256: "abc123",
      originalFilename: "brief.md",
      createdByUserId: ownerUserId,
    });

    const listResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "list_issue_attachments",
      parameters: { issueRef: "Onboarding" },
    });
    expect(listResult.status).toBe("completed");
    expect(listResult.data).toMatchObject([
      expect.objectContaining({
        id: attachment.id,
        originalFilename: "brief.md",
        contentPath: `/api/attachments/${attachment.id}/content`,
      }),
    ]);

    const deleteResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "delete_issue_attachment",
      parameters: { issueId: issue.id, attachmentRef: "brief.md" },
    });
    expect(deleteResult.status).toBe("completed");
    expect(await issuesSvc.getAttachmentById(attachment.id)).toBeNull();
  });

  it("resolves project refs for project budget updates", async () => {
    const company = await insertCompany(db, "Project Budget Company");
    const projectsSvc = projectService(db);
    const dispatcher = createTestRegistry(db);
    const project = await projectsSvc.create(company.id, { name: "Onboarding" });

    const result = await dispatcher.executeTool({
      ctx: createCtx(company.id),
      name: "update_budget",
      parameters: { scope: "project", projectRef: project.urlKey, monthlyCents: 2500 },
    });

    expect(result.status).toBe("completed");
    expect(result.content).toContain("Updated project budget");
  });

  it("restarts a project preview runtime through the real workspace runtime path", async () => {
    const company = await insertCompany(db, "Runtime Company");
    const projects = projectService(db);
    const dispatcher = createTestRegistry(db);
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-home-tool-runtime-"));
    const originalShell = process.env.SHELL;
    if (process.platform === "win32") {
      process.env.SHELL = "C:\\Program Files\\Git\\bin\\bash.exe";
    }

    try {
      const project = await projects.create(company.id, {
        name: "Preview Project",
      });
      const workspace = await projects.createWorkspace(project.id, {
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
                stopPolicy: {
                  type: "manual",
                },
              },
            ],
          },
        },
      });
      expect(workspace).not.toBeNull();

      const result = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "restart_preview_runtime",
        parameters: { projectRef: project.urlKey },
      });

      expect(result.status).toBe("completed");
      expect(result.content).toContain("Restarted preview runtime");
      const data = result.data as { projectWorkspaceId: string; startedServices: Array<{ url: string | null }> };
      expect(data.projectWorkspaceId).toBe(workspace!.id);
      expect(data.startedServices).toHaveLength(1);
      await expect(fetch(data.startedServices[0]!.url!)).resolves.toMatchObject({ ok: true });

      await stopRuntimeServicesForProjectWorkspace({
        db,
        projectWorkspaceId: workspace!.id,
      });
    } finally {
      process.env.SHELL = originalShell;
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("fails with a concrete error when a project has multiple runtime workspaces and no target workspace is provided", async () => {
    const company = await insertCompany(db, "Ambiguous Runtime Company");
    const projects = projectService(db);
    const dispatcher = createTestRegistry(db);
    const firstWorkspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-home-tool-runtime-a-"));
    const secondWorkspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-home-tool-runtime-b-"));

    try {
      const project = await projects.create(company.id, {
        name: "Ambiguous Preview Project",
      });

      const runtimeConfig = {
        workspaceRuntime: {
          services: [
            {
              name: "web",
              command: "node -e \"setInterval(() => {}, 1000)\"",
              lifecycle: "shared",
              reuseScope: "project_workspace",
            },
          ],
        },
      };

      await projects.createWorkspace(project.id, {
        name: "Primary Preview",
        cwd: firstWorkspaceRoot,
        isPrimary: true,
        runtimeConfig,
      });
      await projects.createWorkspace(project.id, {
        name: "Secondary Preview",
        cwd: secondWorkspaceRoot,
        runtimeConfig,
      });

      await expect(dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "restart_preview_runtime",
        parameters: { projectId: project.id },
      })).rejects.toMatchObject({
        status: 400,
        message: "Need projectWorkspaceId or runtimeServiceId because this project has multiple runtime workspaces",
      });
    } finally {
      await fs.rm(firstWorkspaceRoot, { recursive: true, force: true });
      await fs.rm(secondWorkspaceRoot, { recursive: true, force: true });
    }
  });

  it("creates, updates, and deletes project workspaces through Home tools with ref-safe selectors", async () => {
    const company = await insertCompany(db, "Home Project Workspace Company");
    const dispatcher = createTestRegistry(db);
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-home-project-workspace-"));

    try {
      const createProject = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "create_project",
        parameters: { name: "Onboarding" },
      });
      expect(createProject.status).toBe("completed");
      const projectId = (createProject.data as { id: string }).id;

      const createWorkspace = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "create_project_workspace",
        parameters: {
          projectRef: "Onboarding",
          name: "Preview Workspace",
          cwd: workspaceRoot,
        },
      });
      expect(createWorkspace.status).toBe("completed");
      expect(createWorkspace.content).toContain("Created project workspace");
      const workspaceId = (createWorkspace.data as { id: string }).id;

      const getWorkspace = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "get_project_workspace",
        parameters: {
          projectRef: "Onboarding",
          projectWorkspaceRef: "Preview Workspace",
        },
      });
      expect(getWorkspace.status).toBe("completed");
      expect(getWorkspace.data).toMatchObject({
        id: workspaceId,
        projectId,
        name: "Preview Workspace",
      });

      const updateWorkspace = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "update_project_workspace",
        parameters: {
          projectRef: "Onboarding",
          projectWorkspaceRef: "Preview Workspace",
          name: "Preview Workspace 2",
        },
      });
      expect(updateWorkspace.status).toBe("completed");
      expect(updateWorkspace.data).toMatchObject({
        id: workspaceId,
        name: "Preview Workspace 2",
      });

      const deleteWorkspace = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "delete_project_workspace",
        parameters: {
          projectId,
          projectWorkspaceRef: "Preview Workspace 2",
        },
      });
      expect(deleteWorkspace.status).toBe("completed");
      expect(deleteWorkspace.data).toMatchObject({
        ok: true,
        projectId,
        projectWorkspaceId: workspaceId,
      });
      const persisted = await db
        .select()
        .from(projectWorkspaces)
        .where(eq(projectWorkspaces.id, workspaceId))
        .then((rows) => rows[0] ?? null);
      expect(persisted).toBeNull();
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("creates company invites and approves human join requests through Home access tools", async () => {
    const ownerUserId = `user-home-access-owner-${randomUUID()}`;
    const invitedUserId = `user-home-access-invitee-${randomUUID()}`;
    const company = await insertCompany(db, "Home Access Company");
    await insertUser(db, ownerUserId, "Owner User");
    await insertUser(db, invitedUserId, "Alex Join");
    const dispatcher = createTestRegistry(db);

    const inviteResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "create_company_invite",
      parameters: {
        allowedJoinTypes: "human",
        humanRole: "admin",
        agentMessage: "Join the company.",
      },
    });
    expect(inviteResult.status).toBe("completed");
    expect(inviteResult.data).toMatchObject({
      allowedJoinTypes: "human",
      humanRole: "admin",
      token: expect.stringContaining("pcp_invite_"),
    });
    const inviteId = (inviteResult.data as { id: string }).id;

    const joinRequest = await db
      .insert(joinRequests)
      .values({
        inviteId,
        companyId: company.id,
        requestType: "human",
        status: "pending_approval",
        requestIp: "127.0.0.1",
        requestingUserId: invitedUserId,
        requestEmailSnapshot: `${invitedUserId}@example.com`,
      })
      .returning()
      .then((rows) => rows[0]!);

    const approveResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "approve_join_request",
      parameters: {
        joinRequestRef: `${invitedUserId}@example.com`,
      },
    });
    expect(approveResult.status).toBe("completed");
    expect(approveResult.content).toContain(joinRequest.id);

    const membership = await db
      .select()
      .from(companyMemberships)
      .where(and(
        eq(companyMemberships.companyId, company.id),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, invitedUserId),
      ))
      .then((rows) => rows[0] ?? null);
    expect(membership).toMatchObject({
      companyId: company.id,
      principalType: "user",
      principalId: invitedUserId,
      status: "active",
      membershipRole: "admin",
    });

    const grants = await db
      .select()
      .from(principalPermissionGrants)
      .where(and(
        eq(principalPermissionGrants.companyId, company.id),
        eq(principalPermissionGrants.principalType, "user"),
        eq(principalPermissionGrants.principalId, invitedUserId),
      ));
    expect(grants.map((grant) => grant.permissionKey)).toEqual(expect.arrayContaining([
      "agents:create",
      "users:invite",
      "tasks:assign",
      "joins:approve",
    ]));

    const membersResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "list_company_members",
      parameters: {},
    });
    expect(membersResult.status).toBe("completed");
    expect(membersResult.data).toMatchObject({
      members: expect.arrayContaining([
        expect.objectContaining({
          principalId: invitedUserId,
          membershipRole: "admin",
          user: expect.objectContaining({
            id: invitedUserId,
          }),
        }),
      ]),
    });
  });

  it("manages company skills through Home tools, including local import and project scans", async () => {
    const company = await insertCompany(db, "Home Skill Company");
    const dispatcher = createTestRegistry(db);
    const projectsSvc = projectService(db);
    const importRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-home-skill-import-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-home-skill-workspace-"));

    try {
      await fs.writeFile(
        path.join(importRoot, "SKILL.md"),
        "# Imported Skill\n\nThis skill came from a local import.",
        "utf8",
      );
      await fs.mkdir(path.join(workspaceRoot, "skills", "release-playbook"), { recursive: true });
      await fs.writeFile(
        path.join(workspaceRoot, "skills", "release-playbook", "SKILL.md"),
        "# Release Playbook\n\nUse this for launch cutovers.",
        "utf8",
      );

      const createResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "create_company_skill",
        parameters: {
          name: "Launch Checklist",
          description: "Internal launch checklist",
          markdown: "# Launch Checklist\n\n- Stage release\n- Verify smoke tests",
        },
      });
      expect(createResult.status).toBe("completed");
      expect(createResult.data).toMatchObject({
        name: "Launch Checklist",
        slug: "launch-checklist",
        sourceType: "local_path",
      });
      const createdSkillId = (createResult.data as { id: string }).id;

      const detailResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "get_company_skill",
        parameters: { skillRef: "Launch Checklist" },
      });
      expect(detailResult.status).toBe("completed");
      expect(detailResult.data).toMatchObject({
        id: createdSkillId,
        name: "Launch Checklist",
        slug: "launch-checklist",
      });

      const updateStatusResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "get_company_skill_update_status",
        parameters: { skillId: createdSkillId },
      });
      expect(updateStatusResult.status).toBe("completed");
      expect(updateStatusResult.data).toMatchObject({
        supported: expect.any(Boolean),
        hasUpdate: expect.any(Boolean),
      });

      const updateFileResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "update_company_skill_file",
        parameters: {
          skillRef: "launch-checklist",
          path: "SKILL.md",
          content: "# Launch Checklist\n\n- Verify launch checklist ownership",
        },
      });
      expect(updateFileResult.status).toBe("completed");
      expect(updateFileResult.data).toMatchObject({
        path: "SKILL.md",
        content: "# Launch Checklist\n\n- Verify launch checklist ownership",
      });

      const readFileResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "read_company_skill_file",
        parameters: {
          skillRef: "launch-checklist",
          path: "SKILL.md",
        },
      });
      expect(readFileResult.status).toBe("completed");
      expect(readFileResult.data).toMatchObject({
        path: "SKILL.md",
        content: "# Launch Checklist\n\n- Verify launch checklist ownership",
      });

      const importResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "import_company_skills",
        parameters: { source: importRoot },
      });
      expect(importResult.status).toBe("completed");
      expect(importResult.data).toMatchObject({
        imported: expect.arrayContaining([
          expect.objectContaining({
            sourceType: "local_path",
          }),
        ]),
      });

      const project = await projectsSvc.create(company.id, { name: "Onboarding" });
      await projectsSvc.createWorkspace(project.id, {
        name: "Preview Workspace",
        cwd: workspaceRoot,
        isPrimary: true,
      });
      const scanResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "scan_project_workspaces_for_company_skills",
        parameters: {
          projectRef: "Onboarding",
          projectWorkspaceRef: "Preview Workspace",
        },
      });
      expect(scanResult.status).toBe("completed");
      expect(scanResult.data).toMatchObject({
        scannedProjects: 1,
        scannedWorkspaces: 1,
      });
      expect(scanResult.data).toMatchObject({
        imported: expect.arrayContaining([
          expect.objectContaining({
            slug: "release-playbook",
          }),
        ]),
      });

      const deleteResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "delete_company_skill",
        parameters: { skillRef: "Launch Checklist" },
      });
      expect(deleteResult.status).toBe("completed");
      const deletedSkill = await db
        .select()
        .from(companySkills)
        .where(eq(companySkills.id, createdSkillId))
        .then((rows) => rows[0] ?? null);
      expect(deletedSkill).toBeNull();
    } finally {
      await fs.rm(importRoot, { recursive: true, force: true }).catch(() => undefined);
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("creates company assets and updates company branding and settings through Home tools", async () => {
    const company = await insertCompany(db, "Brand Company");
    const dispatcher = createTestRegistry(db);
    const storageRoot = path.join(process.cwd(), "tmp-home-assets-" + randomUUID());
    const originalStorageProvider = process.env.PAPERCLIP_STORAGE_PROVIDER;
    const originalStorageDir = process.env.PAPERCLIP_STORAGE_LOCAL_DIR;

    process.env.PAPERCLIP_STORAGE_PROVIDER = "local_disk";
    process.env.PAPERCLIP_STORAGE_LOCAL_DIR = storageRoot;

    try {
      const createAssetResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "create_company_image_asset",
        parameters: {
          filename: "logo.png",
          contentType: "image/png",
          contentBase64: Buffer.from("fake-png-binary").toString("base64"),
          namespace: "branding",
        },
      });
      expect(createAssetResult.status).toBe("completed");
      expect(createAssetResult.data).toMatchObject({
        originalFilename: "logo.png",
        contentType: "image/png",
        contentPath: expect.stringContaining("/api/assets/"),
      });
      const assetId = (createAssetResult.data as { id: string }).id;

      const getAssetResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "get_company_asset",
        parameters: { assetRef: "logo.png" },
      });
      expect(getAssetResult.status).toBe("completed");
      expect(getAssetResult.data).toMatchObject({
        id: assetId,
        originalFilename: "logo.png",
        isCompanyLogo: false,
      });

      const setLogoResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "set_company_logo",
        parameters: { assetRef: "logo.png" },
      });
      expect(setLogoResult.status).toBe("completed");
      expect(setLogoResult.data).toMatchObject({
        logoAssetId: assetId,
      });
      const logoRow = await db
        .select()
        .from(companyLogos)
        .where(eq(companyLogos.companyId, company.id))
        .then((rows) => rows[0] ?? null);
      expect(logoRow).toMatchObject({
        companyId: company.id,
        assetId,
      });

      const getLogoAssetResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "get_company_asset",
        parameters: { assetId },
      });
      expect(getLogoAssetResult.status).toBe("completed");
      expect(getLogoAssetResult.data).toMatchObject({
        id: assetId,
        isCompanyLogo: true,
      });

      const brandingResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "update_company_branding",
        parameters: {
          name: "Brand Company Renamed",
          description: "The internal operating company.",
          brandColor: "#112233",
        },
      });
      expect(brandingResult.status).toBe("completed");
      expect(brandingResult.data).toMatchObject({
        name: "Brand Company Renamed",
        description: "The internal operating company.",
        brandColor: "#112233",
        logoAssetId: assetId,
      });

      const settingsResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "update_company_settings",
        parameters: {
          requireBoardApprovalForNewAgents: true,
          feedbackDataSharingEnabled: true,
        },
      });
      expect(settingsResult.status).toBe("completed");
      expect(settingsResult.data).toMatchObject({
        requireBoardApprovalForNewAgents: true,
        feedbackDataSharingEnabled: true,
        feedbackDataSharingConsentByUserId: "user-home-capabilities",
      });
      expect((settingsResult.data as { feedbackDataSharingConsentAt: Date | null }).feedbackDataSharingConsentAt)
        .not.toBeNull();
    } finally {
      process.env.PAPERCLIP_STORAGE_PROVIDER = originalStorageProvider;
      process.env.PAPERCLIP_STORAGE_LOCAL_DIR = originalStorageDir;
      await fs.rm(storageRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("loads company user profiles and persists sidebar preferences through Home tools", async () => {
    const ownerUserId = `dotta-${randomUUID()}`;
    const company = await insertCompany(db, "Profile Company");
    const secondCompany = await insertCompany(db, "Other Company");
    await insertUser(db, ownerUserId, "Dotta");
    await db.insert(companyMemberships).values({
      companyId: company.id,
      principalType: "user",
      principalId: ownerUserId,
      status: "active",
      membershipRole: "admin",
    });
    const helperAgent = await agentService(db).create(company.id, {
      name: "Helper",
      role: "general",
      title: null,
      reportsTo: null,
      capabilities: null,
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      budgetMonthlyCents: 0,
      spentMonthlyCents: 0,
      permissions: {},
      lastHeartbeatAt: null,
      metadata: null,
      status: "idle",
    });
    const issue = await db
      .insert(issues)
      .values({
        companyId: company.id,
        title: "Onboarding",
        status: "in_progress",
        priority: "medium",
        assigneeUserId: ownerUserId,
        createdByUserId: ownerUserId,
        issueNumber: 1,
        identifier: `PC-${randomUUID().slice(0, 6)}`,
      })
      .returning()
      .then((rows) => rows[0]!);
    await db.insert(issueComments).values({
      companyId: company.id,
      issueId: issue.id,
      authorUserId: ownerUserId,
      body: "Working through the launch checklist.",
    });
    await db.insert(activityLog).values({
      companyId: company.id,
      actorType: "user",
      actorId: ownerUserId,
      action: "profile.test_activity",
      entityType: "issue",
      entityId: issue.id,
      details: { source: "home-capabilities.test" },
    });
    await db.insert(costEvents).values({
      companyId: company.id,
      agentId: helperAgent.id,
      issueId: issue.id,
      provider: "openai",
      biller: "openai",
      billingType: "metered_api",
      model: "gpt-5.4",
      inputTokens: 120,
      cachedInputTokens: 0,
      outputTokens: 30,
      costCents: 37,
      occurredAt: new Date(),
    });
    const dispatcher = createTestRegistry(db);
    const projectsSvc = projectService(db);
    const firstProject = await projectsSvc.create(company.id, { name: "Alpha" });
    const secondProject = await projectsSvc.create(company.id, { name: "Beta" });

    const profileResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "get_company_user_profile",
      parameters: { userRef: "dotta" },
    });
    expect(profileResult.status).toBe("completed");
    expect(profileResult.data).toMatchObject({
      user: expect.objectContaining({
        id: ownerUserId,
        name: "Dotta",
      }),
      stats: expect.arrayContaining([
        expect.objectContaining({
          key: "last7",
          touchedIssues: expect.any(Number),
        }),
      ]),
      daily: expect.arrayContaining([
        expect.objectContaining({
          date: expect.any(String),
        }),
      ]),
    });

    const badgesResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "get_company_sidebar_badges",
      parameters: {},
    });
    expect(badgesResult.status).toBe("completed");
    expect(badgesResult.data).toMatchObject({
      inbox: expect.any(Number),
      approvals: expect.any(Number),
      failedRuns: expect.any(Number),
      joinRequests: expect.any(Number),
    });

    const updateGlobalPreferencesResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "update_global_sidebar_preferences",
      parameters: {
        orderedIds: [secondCompany.id, company.id],
      },
    });
    expect(updateGlobalPreferencesResult.status).toBe("completed");
    expect(updateGlobalPreferencesResult.data).toMatchObject({
      orderedIds: [secondCompany.id, company.id],
    });

    const getGlobalPreferencesResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "get_global_sidebar_preferences",
      parameters: {},
    });
    expect(getGlobalPreferencesResult.status).toBe("completed");
    expect(getGlobalPreferencesResult.data).toMatchObject({
      orderedIds: [secondCompany.id, company.id],
    });

    const updateCompanyPreferencesResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "update_company_sidebar_preferences",
      parameters: {
        orderedIds: [secondProject.id, firstProject.id],
      },
    });
    expect(updateCompanyPreferencesResult.status).toBe("completed");
    expect(updateCompanyPreferencesResult.data).toMatchObject({
      orderedIds: [secondProject.id, firstProject.id],
    });

    const getCompanyPreferencesResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "get_company_sidebar_preferences",
      parameters: {},
    });
    expect(getCompanyPreferencesResult.status).toBe("completed");
    expect(getCompanyPreferencesResult.data).toMatchObject({
      orderedIds: [secondProject.id, firstProject.id],
    });
  });

  it("checks out and releases issues while tracking read and inbox state through Home tools", async () => {
    const ownerUserId = `user-issue-state-${randomUUID()}`;
    const company = await insertCompany(db, "Issue State Company");
    await insertUser(db, ownerUserId, "Issue State User");
    const dispatcher = createTestRegistry(db);
    const issuesSvc = issueService(db);
    const agent = await agentService(db).create(company.id, {
      name: "CEO",
      role: "ceo",
      title: "Chief Executive Officer",
      reportsTo: null,
      capabilities: null,
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      budgetMonthlyCents: 0,
      spentMonthlyCents: 0,
      permissions: { canCreateAgents: true },
      lastHeartbeatAt: null,
      metadata: null,
      status: "idle",
    });
    const issue = await issuesSvc.create(company.id, {
      title: "Onboarding",
      status: "todo",
      priority: "medium",
    });

    const checkoutResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "checkout_issue",
      parameters: {
        issueRef: "Onboarding",
        agentRef: "CEO",
      },
    });
    expect(checkoutResult.status).toBe("completed");
    expect(checkoutResult.data).toMatchObject({
      id: issue.id,
      assigneeAgentId: agent.id,
    });
    const assignmentRun = await db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.agentId, agent.id))
      .orderBy(heartbeatRuns.createdAt)
      .then((rows) => rows[0] ?? null);
    expect(assignmentRun).toMatchObject({
      companyId: company.id,
      agentId: agent.id,
      invocationSource: "assignment",
      status: "queued",
    });

    const markReadResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "mark_issue_read",
      parameters: { issueRef: "Onboarding" },
    });
    expect(markReadResult.status).toBe("completed");
    const readState = await db
      .select()
      .from(issueReadStates)
      .where(and(eq(issueReadStates.companyId, company.id), eq(issueReadStates.issueId, issue.id)))
      .then((rows) => rows[0] ?? null);
    expect(readState).not.toBeNull();

    const markUnreadResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "mark_issue_unread",
      parameters: { issueRef: "Onboarding" },
    });
    expect(markUnreadResult.status).toBe("completed");
    const removedReadState = await db
      .select()
      .from(issueReadStates)
      .where(and(eq(issueReadStates.companyId, company.id), eq(issueReadStates.issueId, issue.id)))
      .then((rows) => rows[0] ?? null);
    expect(removedReadState).toBeNull();

    const archiveResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "archive_issue_inbox",
      parameters: { issueRef: "Onboarding" },
    });
    expect(archiveResult.status).toBe("completed");
    const archivedRow = await db
      .select()
      .from(issueInboxArchives)
      .where(and(eq(issueInboxArchives.companyId, company.id), eq(issueInboxArchives.issueId, issue.id)))
      .then((rows) => rows[0] ?? null);
    expect(archivedRow).not.toBeNull();

    const unarchiveResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "unarchive_issue_inbox",
      parameters: { issueRef: "Onboarding" },
    });
    expect(unarchiveResult.status).toBe("completed");
    const removedArchive = await db
      .select()
      .from(issueInboxArchives)
      .where(and(eq(issueInboxArchives.companyId, company.id), eq(issueInboxArchives.issueId, issue.id)))
      .then((rows) => rows[0] ?? null);
    expect(removedArchive).toBeNull();

    const releaseResult = await dispatcher.executeTool({
      ctx: {
        companyId: company.id,
        ownerUserId,
        threadId: randomUUID(),
      },
      name: "release_issue",
      parameters: { issueRef: "Onboarding" },
    });
    expect(releaseResult.status).toBe("completed");
    expect(releaseResult.data).toMatchObject({
      id: issue.id,
      assigneeAgentId: null,
    });
  });

  it("starts and stops project workspace runtimes through explicit Home alias tools", async () => {
    const company = await insertCompany(db, "Runtime Alias Company");
    const projectsSvc = projectService(db);
    const dispatcher = createTestRegistry(db);
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-home-runtime-alias-"));
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

      const startResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "start_project_workspace_runtime",
        parameters: {
          projectRef: "Onboarding",
          projectWorkspaceRef: "Preview Workspace",
        },
      });
      expect(startResult.status).toBe("completed");
      expect(startResult.content).toContain("Started preview runtime");
      const startData = startResult.data as { startedServices: Array<{ url: string | null }> };
      expect(startData.startedServices).toHaveLength(1);
      await expect(fetch(startData.startedServices[0]!.url!)).resolves.toMatchObject({ ok: true });

      const stopResult = await dispatcher.executeTool({
        ctx: createCtx(company.id),
        name: "stop_project_workspace_runtime",
        parameters: {
          projectRef: project.urlKey,
          projectWorkspaceRef: workspace.name,
        },
      });
      expect(stopResult.status).toBe("completed");
      expect(stopResult.content).toContain("Stopped preview runtime");
      expect(stopResult.data).toMatchObject({
        projectWorkspaceId: workspace.id,
        startedServices: [],
      });
    } finally {
      process.env.SHELL = originalShell;
      await stopRuntimeServicesForProjectWorkspace({
        db,
        projectWorkspaceId: (await db
          .select()
          .from(projectWorkspaces)
          .where(eq(projectWorkspaces.cwd, workspaceRoot))
          .then((rows) => rows[0]?.id ?? null)) ?? "",
      }).catch(() => undefined);
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("covers agent lifecycle, approval actions, secrets, goals, routines, and budget incidents through Home tools", async () => {
    const ownerUserId = `user-home-deep-${randomUUID()}`;
    const company = await insertCompany(db, "Deep Coverage Company");
    await insertUser(db, ownerUserId, "Deep Coverage User");
    const dispatcher = createTestRegistry(db);
    const originalSecretsMasterKey = process.env.PAPERCLIP_SECRETS_MASTER_KEY;
    process.env.PAPERCLIP_SECRETS_MASTER_KEY = "12345678901234567890123456789012";

    try {
      const createdAgent = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "create_agent",
        parameters: {
          name: "Ops Agent",
          role: "general",
          adapterType: "process",
          title: "Operations",
          budgetMonthlyCents: 250,
        },
      });
      expect(createdAgent.status).toBe("completed");
      const createdAgentId = (createdAgent.data as { id: string }).id;

      const updatedAgent = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "update_agent",
        parameters: {
          agentRef: "Ops Agent",
          title: "Operations Lead",
          metadata: { region: "us-east-1" },
        },
      });
      expect(updatedAgent.status).toBe("completed");
      expect(updatedAgent.data).toMatchObject({
        id: createdAgentId,
        title: "Operations Lead",
      });

      const issue = await issueService(db).create(company.id, {
        title: "Budget approval",
        status: "todo",
        priority: "medium",
      });

      const createdApproval = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "create_approval",
        parameters: {
          type: "budget_override_required",
          issueRef: issue.title,
          payload: {
            scopeType: "company",
            amountLimit: 500,
          },
        },
      });
      expect(createdApproval.status).toBe("completed");
      const approvalId = (createdApproval.data as { id: string }).id;

      const approvalIssues = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "list_approval_issues",
        parameters: { approvalId },
      });
      expect(approvalIssues.status).toBe("completed");
      expect(approvalIssues.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: issue.id }),
      ]));

      const approvalComment = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "add_approval_comment",
        parameters: {
          approvalId,
          body: "Need one more pass on the budget rationale.",
        },
      });
      expect(approvalComment.status).toBe("completed");
      expect(approvalComment.data).toMatchObject({
        approvalId,
        body: "Need one more pass on the budget rationale.",
      });

      const requestedRevision = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "request_approval_revision",
        parameters: {
          approvalId,
          decisionNote: "Clarify the approval payload.",
        },
      });
      expect(requestedRevision.status).toBe("completed");
      expect(requestedRevision.data).toMatchObject({
        id: approvalId,
        status: "revision_requested",
      });

      const resubmittedApproval = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "resubmit_approval",
        parameters: {
          approvalId,
          payload: {
            scopeType: "company",
            amountLimit: 700,
          },
        },
      });
      expect(resubmittedApproval.status).toBe("completed");
      expect(resubmittedApproval.data).toMatchObject({
        id: approvalId,
        status: "pending",
      });

      const approvedApproval = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "approve_approval",
        parameters: {
          approvalId,
          decisionNote: "Approved after revision.",
        },
      });
      expect(approvedApproval.status).toBe("completed");
      expect(approvedApproval.data).toMatchObject({
        id: approvalId,
        status: "approved",
      });

      const rejectedApprovalSeed = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "create_approval",
        parameters: {
          type: "budget_override_required",
          payload: {
            scopeType: "company",
            amountLimit: 900,
          },
        },
      });
      const rejectedApprovalId = (rejectedApprovalSeed.data as { id: string }).id;
      const rejectedApproval = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "reject_approval",
        parameters: {
          approvalId: rejectedApprovalId,
          decisionNote: "Rejected for now.",
        },
      });
      expect(rejectedApproval.status).toBe("completed");
      expect(rejectedApproval.data).toMatchObject({
        id: rejectedApprovalId,
        status: "rejected",
      });

      const createdSecret = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "create_company_secret",
        parameters: {
          name: "FOLLOWUP_BOSS_API_KEY",
          value: "secret-value-1",
        },
      });
      expect(createdSecret.status).toBe("completed");
      expect(createdSecret.data).toMatchObject({
        name: "FOLLOWUP_BOSS_API_KEY",
        value: "***REDACTED***",
      });

      const updatedSecret = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "update_company_secret",
        parameters: {
          secretRef: "FOLLOWUP_BOSS_API_KEY",
          description: "Primary CRM integration key",
        },
      });
      expect(updatedSecret.status).toBe("completed");
      expect(updatedSecret.data).toMatchObject({
        name: "FOLLOWUP_BOSS_API_KEY",
        description: "Primary CRM integration key",
        value: "***REDACTED***",
      });

      const rotatedSecret = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "rotate_company_secret",
        parameters: {
          secretRef: "FOLLOWUP_BOSS_API_KEY",
          value: "secret-value-2",
        },
      });
      expect(rotatedSecret.status).toBe("completed");
      expect(rotatedSecret.data).toMatchObject({
        name: "FOLLOWUP_BOSS_API_KEY",
        latestVersion: 2,
        value: "***REDACTED***",
      });

      const listedSecrets = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "list_secret_metadata",
        parameters: {},
      });
      expect(listedSecrets.status).toBe("completed");
      expect(listedSecrets.data).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: "FOLLOWUP_BOSS_API_KEY",
          value: "***REDACTED***",
        }),
      ]));

      const createdGoal = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "create_goal",
        parameters: {
          title: "Launch readiness",
          description: "Get the launch plan into production shape.",
          level: "company",
          status: "active",
        },
      });
      expect(createdGoal.status).toBe("completed");
      const goalId = (createdGoal.data as { id: string }).id;

      const updatedGoal = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "update_goal",
        parameters: {
          goalRef: "Launch readiness",
          title: "Launch readiness v2",
        },
      });
      expect(updatedGoal.status).toBe("completed");
      expect(updatedGoal.data).toMatchObject({
        id: goalId,
        title: "Launch readiness v2",
      });

      const disposableGoal = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "create_goal",
        parameters: {
          title: "Disposable goal",
          level: "company",
          status: "active",
        },
      });
      expect(disposableGoal.status).toBe("completed");
      const disposableGoalId = (disposableGoal.data as { id: string }).id;

      const createdRoutine = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "create_routine",
        parameters: {
          title: "Daily launch sync",
          goalRef: "Launch readiness v2",
          assigneeAgentRef: "Ops Agent",
          status: "active",
        },
      });
      expect(createdRoutine.status).toBe("completed");
      const routineId = (createdRoutine.data as { id: string }).id;

      const createdTrigger = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "create_routine_trigger",
        parameters: {
          routineId,
          kind: "webhook",
          label: "Launch webhook",
        },
      });
      expect(createdTrigger.status).toBe("completed");
      expect(createdTrigger.data).toMatchObject({
        secretMaterial: "***REDACTED***",
      });
      const triggerId = (createdTrigger.data as { trigger: { id: string } }).trigger.id;

      const updatedTrigger = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "update_routine_trigger",
        parameters: {
          triggerId,
          label: "Launch webhook updated",
          enabled: false,
        },
      });
      expect(updatedTrigger.status).toBe("completed");
      expect(updatedTrigger.data).toMatchObject({
        id: triggerId,
        label: "Launch webhook updated",
        enabled: false,
      });

      const routineRun = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "run_routine",
        parameters: {
          routineId,
          source: "manual",
        },
      });
      expect(routineRun.status).toBe("completed");
      expect(routineRun.data).toMatchObject({
        routineId,
      });

      const routineRunsResult = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "list_routine_runs",
        parameters: {
          routineId,
        },
      });
      expect(routineRunsResult.status).toBe("completed");
      expect(routineRunsResult.data).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: (routineRun.data as { id: string }).id,
        }),
      ]));

      const deletedTrigger = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "delete_routine_trigger",
        parameters: { triggerId },
      });
      expect(deletedTrigger.status).toBe("completed");

      const project = await projectService(db).create(company.id, { name: "Revenue" });
      await db.insert(costEvents).values({
        companyId: company.id,
        agentId: createdAgentId,
        projectId: project.id,
        issueId: issue.id,
        provider: "openai",
        biller: "openai",
        billingType: "metered_api",
        model: "gpt-5.4",
        inputTokens: 100,
        cachedInputTokens: 10,
        outputTokens: 20,
        costCents: 321,
        occurredAt: new Date(),
      });
      await db.insert(financeEvents).values({
        companyId: company.id,
        projectId: project.id,
        issueId: issue.id,
        eventKind: "invoice",
        direction: "debit",
        biller: "openai",
        provider: "openai",
        model: "gpt-5.4",
        amountCents: 450,
        occurredAt: new Date(),
      });

      const costSummary = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "get_cost_summary",
        parameters: {},
      });
      expect(costSummary.status).toBe("completed");
      expect(costSummary.data).toMatchObject({
        spendCents: 321,
      });

      const costsByAgent = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "list_costs_by_agent",
        parameters: {},
      });
      expect(costsByAgent.status).toBe("completed");
      expect(costsByAgent.data).toEqual(expect.arrayContaining([
        expect.objectContaining({
          agentId: createdAgentId,
          costCents: 321,
        }),
      ]));

      const costsByProject = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "list_costs_by_project",
        parameters: {},
      });
      expect(costsByProject.status).toBe("completed");
      expect(costsByProject.data).toEqual(expect.arrayContaining([
        expect.objectContaining({
          projectId: project.id,
          costCents: 321,
        }),
      ]));

      const financeSummary = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "get_finance_summary",
        parameters: {},
      });
      expect(financeSummary.status).toBe("completed");
      expect(financeSummary.data).toMatchObject({
        debitCents: 450,
        netCents: 450,
      });

      const financeList = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "list_finance_events",
        parameters: {},
      });
      expect(financeList.status).toBe("completed");
      expect(financeList.data).toEqual(expect.arrayContaining([
        expect.objectContaining({
          projectId: project.id,
          amountCents: 450,
        }),
      ]));

      await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "update_budget",
        parameters: {
          scope: "company",
          monthlyCents: 1000,
        },
      });
      const companyPolicy = await db
        .select()
        .from(budgetPolicies)
        .where(and(eq(budgetPolicies.companyId, company.id), eq(budgetPolicies.scopeType, "company")))
        .then((rows) => rows[0]!);
      const budgetIncident = await db
        .insert(budgetIncidents)
        .values({
          companyId: company.id,
          policyId: companyPolicy.id,
          scopeType: "company",
          scopeId: company.id,
          metric: "billed_cents",
          windowKind: "calendar_month_utc",
          windowStart: new Date(Date.UTC(2026, 3, 1)),
          windowEnd: new Date(Date.UTC(2026, 4, 1)),
          thresholdType: "hard",
          amountLimit: 1000,
          amountObserved: 1200,
          status: "open",
        })
        .returning()
        .then((rows) => rows[0]!);

      const budgetOverview = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "get_budget_overview",
        parameters: {},
      });
      expect(budgetOverview.status).toBe("completed");
      expect(budgetOverview.data).toMatchObject({
        activeIncidents: expect.arrayContaining([
          expect.objectContaining({
            id: budgetIncident.id,
          }),
        ]),
      });

      const incidentsResult = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "list_budget_incidents",
        parameters: {},
      });
      expect(incidentsResult.status).toBe("completed");
      expect(incidentsResult.data).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: budgetIncident.id,
          amountObserved: 1200,
        }),
      ]));

      const resolvedIncident = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "resolve_budget_incident",
        parameters: {
          incidentId: budgetIncident.id,
          action: "raise_budget_and_resume",
          amount: 2000,
          decisionNote: "Raise the budget and continue.",
        },
      });
      expect(resolvedIncident.status).toBe("completed");
      expect(resolvedIncident.data).toMatchObject({
        id: budgetIncident.id,
        status: "resolved",
      });

      const deletedGoal = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "delete_goal",
        parameters: {
          goalId: disposableGoalId,
        },
      });
      expect(deletedGoal.status).toBe("completed");
      const goalRow = await db
        .select()
        .from(goals)
        .where(eq(goals.id, disposableGoalId))
        .then((rows) => rows[0] ?? null);
      expect(goalRow).toBeNull();

      const deletedSecret = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "delete_company_secret",
        parameters: {
          secretRef: "FOLLOWUP_BOSS_API_KEY",
        },
      });
      expect(deletedSecret.status).toBe("completed");

      const disposableAgent = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "create_agent",
        parameters: {
          name: "Disposable Agent",
          role: "general",
          adapterType: "process",
        },
      });
      expect(disposableAgent.status).toBe("completed");

      const deletedAgent = await dispatcher.executeTool({
        ctx: {
          companyId: company.id,
          ownerUserId,
          threadId: randomUUID(),
        },
        name: "delete_agent",
        parameters: {
          agentRef: "Disposable Agent",
        },
      });
      expect(deletedAgent.status).toBe("completed");
      expect(deletedAgent.data).toMatchObject({
        ok: true,
        agentId: (disposableAgent.data as { id: string }).id,
      });
    } finally {
      process.env.PAPERCLIP_SECRETS_MASTER_KEY = originalSecretsMasterKey;
    }
  });
});



