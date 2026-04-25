import { describe, expect, it } from "vitest";
import type { createDb } from "@paperclipai/db";
import {
  AI_TOOL_INVENTORY_TOOL_NAME,
  createAiToolRegistry,
  type AiToolRegistryContext,
} from "../services/ai-tool-registry.js";
import { createHomeCapabilityRegistry } from "../services/home-capabilities/registry.js";

function createRegistryWithoutDb() {
  const homeCapabilityRegistry = createHomeCapabilityRegistry({} as ReturnType<typeof createDb>);
  return createAiToolRegistry({} as ReturnType<typeof createDb>, { homeCapabilityRegistry });
}

function createCtx(): AiToolRegistryContext {
  return {
    companyId: "company-test",
    ownerUserId: "user-test",
    threadId: "thread-test",
    surface: "home",
  };
}

describe("AI tool registry", () => {
  it("lists only non-admin Home capability tools by default", () => {
    const registry = createRegistryWithoutDb();
    const tools = registry.listEffectiveTools(createCtx(), { limit: 50 });
    const names = tools.map((tool) => tool.name);

    expect(names).toContain(AI_TOOL_INVENTORY_TOOL_NAME);
    expect(names).toContain("agenda");
    expect(names).toContain("agents");
    expect(names).toContain("secrets");
    expect(tools.find((tool) => tool.name === "agenda")?.actions?.map((action) => action.name)).toContain("create_issue");
    expect(tools.find((tool) => tool.name === "agents")?.actions?.map((action) => action.name)).toContain("pause_agent");
    expect(tools.find((tool) => tool.name === "secrets")?.actions?.map((action) => action.name)).toContain("list_secret_metadata");
    expect(names).not.toContain("restart_preview_runtime");
    expect(names).not.toContain("list_execution_workspaces");
    expect(names).not.toContain("install_adapter");
    expect(tools.every((tool) => tool.enabled)).toBe(true);
  });

  it("can include disabled tools with explicit exclusion reasons for debugging", () => {
    const registry = createRegistryWithoutDb();
    const tools = registry.listEffectiveTools(createCtx(), {
      includeDisabled: true,
      limit: 200,
    });
    const restartPreview = tools
      .flatMap((tool) => tool.actions ?? [])
      .find((action) => action.name === "restart_preview_runtime");

    expect(restartPreview).toMatchObject({
      enabled: false,
      disabledReason: expect.any(String),
    });
  });

  it("assigns each exposed Home action to exactly one capability", () => {
    const registry = createRegistryWithoutDb();
    const tools = registry.listEffectiveTools(createCtx(), { limit: 50 });
    const owners = new Map<string, string>();

    for (const tool of tools.filter((entry) => entry.name !== AI_TOOL_INVENTORY_TOOL_NAME)) {
      for (const action of tool.actions?.filter((entry) => entry.enabled) ?? []) {
        expect(owners.has(action.name)).toBe(false);
        owners.set(action.name, tool.name);
      }
    }

    expect(owners.get("create_issue")).toBe("agenda");
    expect(owners.get("pause_agent")).toBe("agents");
    expect(owners.get("update_budget")).toBe("costs");
  });

  it("keeps admin-like tools out of selection while preserving the callable inventory tool", () => {
    const registry = createRegistryWithoutDb();
    const selection = registry.selectTools(createCtx(), "restart the preview runtime");
    const names = selection.tools.map((tool) => tool.name);

    expect(names).toContain(AI_TOOL_INVENTORY_TOOL_NAME);
    expect(names).not.toContain("workspace");
    expect(names).not.toContain("restart_preview_runtime");
    expect(names).not.toContain("list_execution_workspaces");
  });

  it("supports model-callable inventory search with a safe fallback slice", async () => {
    const registry = createRegistryWithoutDb();
    const result = await registry.executeTool({
      ctx: createCtx(),
      name: AI_TOOL_INVENTORY_TOOL_NAME,
      parameters: {
        action: "search",
        query: "zqxjv impossible",
        limit: 5,
      },
      toolCallId: "call-ai-tools",
    });

    expect(result.status).toBe("completed");
    expect(result.content).toContain("No exact action matches");
    expect(result.data).toMatchObject({
      action: "search",
      results: [],
      fallback: expect.arrayContaining([
        expect.objectContaining({ name: AI_TOOL_INVENTORY_TOOL_NAME }),
      ]),
    });
  });

  it("returns exact action schemas through ai_tools", async () => {
    const registry = createRegistryWithoutDb();
    const result = await registry.executeTool({
      ctx: createCtx(),
      name: AI_TOOL_INVENTORY_TOOL_NAME,
      parameters: {
        action: "schema",
        target: "create_issue",
      },
      toolCallId: "call-schema",
    });

    expect(result.status).toBe("completed");
    expect(result.data).toMatchObject({
      action: "schema",
      capability: "agenda",
      target: "create_issue",
      schema: expect.objectContaining({
        type: "object",
      }),
    });
  });
});
