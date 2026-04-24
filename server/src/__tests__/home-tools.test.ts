import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { createHomeToolDispatcher, createHomeToolConfirmationId } from "../services/home-tools.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
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

  it("does not expose platform/server administration tools", () => {
    const dispatcher = createDispatcherWithoutDb();
    const names = dispatcher.listTools().map((tool) => tool.name);
    expect(names).not.toContain("install_adapter");
    expect(names).not.toContain("reload_plugin");
    expect(names).not.toContain("backup_database");
    expect(names).not.toContain("run_migration");
    expect(dispatcher.searchTools("adapter install server backup database migration", null, 20).map((tool) => tool.name))
      .not.toEqual(expect.arrayContaining(["install_adapter", "backup_database", "run_migration"]));
  });

  it("blocks risky tools until the matching confirmation is supplied", async () => {
    const dispatcher = createDispatcherWithoutDb();
    const ctx = {
      companyId: randomUUID(),
      ownerUserId: "user-confirm",
      threadId: randomUUID(),
    };
    const input = { scope: "company", monthlyCents: 1000 };

    const first = await dispatcher.executeTool({
      ctx,
      name: "update_budget",
      parameters: input,
    });

    expect(first.status).toBe("confirmation_required");
    expect(first.confirmationId).toBe(createHomeToolConfirmationId(ctx, "update_budget", input));
  });
});

describeEmbeddedPostgres("home tool execution authz", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-home-tools-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
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
        companyId: companyA.id,
        ownerUserId: "user-cross-company",
        threadId: randomUUID(),
      },
      name: "pause_agent",
      parameters: { agentId: foreignAgent.id },
    })).rejects.toMatchObject({ status: 403 });
  });
});
