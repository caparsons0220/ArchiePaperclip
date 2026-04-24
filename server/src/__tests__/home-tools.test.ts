import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  budgetIncidents,
  budgetPolicies,
  companies,
  createDb,
  projects,
  projectWorkspaces,
  workspaceRuntimeServices,
} from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { createHomeToolDispatcher } from "../services/home-tools.js";
import { projectService } from "../services/projects.js";
import { stopRuntimeServicesForProjectWorkspace } from "../services/workspace-runtime.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport().catch(() => ({ supported: true }));
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

function createDispatcherWithoutDb() {
  return createHomeToolDispatcher({} as ReturnType<typeof createDb>);
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

describe("home tool catalog", () => {
  it("lists normalized inventory items with stable internal source metadata", () => {
    const dispatcher = createDispatcherWithoutDb();
    const inventory = dispatcher.listInventory();
    expect(inventory.length).toBeGreaterThan(0);
    expect(inventory.every((tool) => tool.sourceKind === "internal")).toBe(true);
    expect(inventory.every((tool) => tool.sourceId === "paperclip.home.internal")).toBe(true);
    expect(inventory.find((tool) => tool.name === "update_budget")).toMatchObject({
      displayName: "Update budget",
      riskLevel: "risky",
      sourceKind: "internal",
      sourceId: "paperclip.home.internal",
    });
  });

  it("exposes stable internal registry keys for direct tool dispatch", () => {
    const dispatcher = createDispatcherWithoutDb();
    expect(dispatcher.getTool("update_budget")).toMatchObject({
      registryKey: "internal.update_budget",
      name: "update_budget",
    });
    expect(dispatcher.getToolByRegistryKey("internal.pause_agent")).toMatchObject({
      registryKey: "internal.pause_agent",
      name: "pause_agent",
    });
  });

  it.each([
    ["create agenda item", "create_issue"],
    ["pause an agent", "pause_agent"],
    ["restart preview", "restart_preview_runtime"],
    ["show budget risk", "get_costs_and_budgets"],
    ["what happened today", "list_recent_activity"],
    ["company skills", "list_company_skills"],
  ])("finds the expected tool for %s", (query, expectedName) => {
    const dispatcher = createDispatcherWithoutDb();
    const results = dispatcher.searchTools(query, null, 8);
    expect(results.map((tool) => tool.name)).toContain(expectedName);
  });

  it("searches the same normalized inventory source used for listing", () => {
    const dispatcher = createDispatcherWithoutDb();
    expect(dispatcher.searchInventory("pause an agent", null, 8).map((tool) => tool.name))
      .toEqual(dispatcher.searchTools("pause an agent", null, 8).map((tool) => tool.name));
  });

  it("selects a bounded direct tool subset for focused requests", () => {
    const dispatcher = createDispatcherWithoutDb();
    const selection = dispatcher.selectTools("pause an agent");
    expect(selection.isCapabilityQuery).toBe(false);
    expect(selection.limit).toBe(12);
    expect(selection.tools.length).toBeLessThanOrEqual(12);
    expect(selection.tools.map((tool) => tool.name)).toContain("pause_agent");
    expect(selection.tools.map((tool) => tool.name)).toContain("list_agents");
  });

  it("adds companion lookup tools for risky action turns", () => {
    const dispatcher = createDispatcherWithoutDb();
    const selection = dispatcher.selectTools("restart the preview runtime");
    expect(selection.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "restart_preview_runtime",
      "list_projects",
      "list_execution_workspaces",
      "get_active_preview",
    ]));
  });

  it("widens the direct tool subset for capability questions", () => {
    const dispatcher = createDispatcherWithoutDb();
    const selection = dispatcher.selectTools("What can Archie do?");
    expect(selection.isCapabilityQuery).toBe(true);
    expect(selection.limit).toBe(20);
    expect(selection.tools.length).toBeGreaterThan(10);
    expect(selection.tools.length).toBeLessThanOrEqual(20);
  });

  it("does not expose platform/server administration tools", () => {
    const dispatcher = createDispatcherWithoutDb();
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
      ownerUserId: "user-home-tools",
      threadId: randomUUID(),
    };
  }

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-home-tools-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(workspaceRuntimeServices);
    await db.delete(projectWorkspaces);
    await db.delete(projects);
    await db.delete(budgetIncidents);
    await db.delete(budgetPolicies);
    await db.delete(agents);
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

    const dispatcher = createHomeToolDispatcher(db);
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
    const dispatcher = createHomeToolDispatcher(db);

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
    const dispatcher = createHomeToolDispatcher(db);
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
    const dispatcher = createHomeToolDispatcher(db);
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

  it("resolves project refs for project budget updates", async () => {
    const company = await insertCompany(db, "Project Budget Company");
    const projectsSvc = projectService(db);
    const dispatcher = createHomeToolDispatcher(db);
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
    const dispatcher = createHomeToolDispatcher(db);
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
    const dispatcher = createHomeToolDispatcher(db);
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
});
