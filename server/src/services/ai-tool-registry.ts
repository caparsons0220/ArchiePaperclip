import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import type { HomeChatToolSourceKind } from "@paperclipai/shared";
import { badRequest } from "../errors.js";
import {
  createHomeCapabilityRegistry,
  type HomeActionContext,
  type HomeActionDescriptor,
  type HomeActionExecution,
  type HomeCapabilityRegistryOptions,
  type HomeCapabilityRiskLevel,
} from "./home-capabilities/registry.js";
import {
  HOME_CAPABILITIES,
  type HomeCapabilityDefinition,
  type HomeCapabilityId,
} from "./home-capabilities/capabilities/index.js";

export const AI_TOOL_REGISTRY_SOURCE_ID = "paperclip.ai-tool-registry" as const;
export const AI_TOOL_INVENTORY_TOOL_NAME = "ai_tools" as const;

export type AiToolSurface = "home" | "agent";
export type AiToolset = "all" | "company" | "home" | "agent" | "safe";

export interface AiToolRegistryContext extends HomeActionContext {
  surface: AiToolSurface;
  toolsets?: AiToolset[];
}

export interface AiToolActionInventoryItem {
  name: string;
  displayName: string;
  description: string;
  category: string;
  family: string;
  operationKind: "read" | "write" | "destructive";
  riskLevel: HomeCapabilityRiskLevel;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  disabledReason?: string;
}

export interface AiToolDescriptor {
  registryKey: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  family: string;
  entityType: string;
  operationKind: "read" | "write" | "destructive";
  riskLevel: HomeCapabilityRiskLevel;
  inputSchema: Record<string, unknown>;
  sourceKind: HomeChatToolSourceKind;
  sourceId: string;
  toolsets: AiToolset[];
  capabilityId?: HomeCapabilityId;
  actionName?: string;
  actions?: AiToolActionInventoryItem[];
  homeAction?: HomeActionDescriptor;
}

export interface AiToolInventoryItem {
  registryKey: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  riskLevel: HomeCapabilityRiskLevel;
  inputSchema: Record<string, unknown>;
  sourceKind: HomeChatToolSourceKind;
  sourceId: string;
  toolsets: AiToolset[];
  enabled: boolean;
  disabledReason?: string;
  actions?: AiToolActionInventoryItem[];
}

export interface AiToolSelection {
  query: string;
  isCapabilityQuery: boolean;
  limit: number;
  tools: AiToolDescriptor[];
}

export interface AiToolExecution {
  toolCallId: string;
  descriptor: AiToolDescriptor;
  input: Record<string, unknown>;
  status: "completed";
  content: string;
  data?: unknown;
}

export interface AiToolRegistryOptions {
  homeCapabilityRegistry?: ReturnType<typeof createHomeCapabilityRegistry>;
  homeCapabilityRegistryOptions?: HomeCapabilityRegistryOptions;
}

interface CapabilityEntry {
  config: HomeCapabilityDefinition;
  enabledActions: HomeActionDescriptor[];
  allActions: Array<{ action: HomeActionDescriptor; disabledReason?: string }>;
}

const DEFAULT_AI_TOOL_LIMIT = 8;
const CAPABILITY_AI_TOOL_LIMIT = 20;
const AI_TOOL_LIMIT_MAX = 20;
const AI_TOOL_INVENTORY_LIMIT_MAX = 200;

const CAPABILITY_QUERY_PATTERNS = [
  /\bwhat can (you|archie) do\b/i,
  /\bwhat tools\b/i,
  /\bwhich tools\b/i,
  /\bwhat actions\b/i,
  /\bavailable tools\b/i,
  /\bavailable actions\b/i,
  /\bcapabilities\b/i,
];

const DENIED_INTERNAL_CATEGORIES = new Set(["workspace", "plugins"]);

const ADMIN_NAME_PATTERNS = [
  /\badmin\b/i,
  /\badapter\b/i,
  /\bbackup\b/i,
  /\bconfig\b/i,
  /\bdatabase\b/i,
  /\bdeploy\b/i,
  /execution_workspace/i,
  /execution_workspaces/i,
  /\bmigration\b/i,
  /\bplugin\b/i,
  /\bpreview\b/i,
  /\bprocess\b/i,
  /reset_agent_runtime_session/i,
  /restart_.*runtime/i,
  /runtime_service/i,
  /\bserver\b/i,
  /\bshell\b/i,
  /\bssh\b/i,
  /start_.*runtime/i,
  /stop_.*runtime/i,
  /\bterminal\b/i,
  /workspace_runtime/i,
];

const ADMIN_ROUTE_PATTERNS = [
  /\/api\/adapters\b/i,
  /\/api\/plugins\b/i,
  /\/api\/instance\b/i,
  /\/api\/execution-workspaces\b/i,
  /\/runtime-services\b/i,
];

const COMPANY_ACTION_NAMES = new Set([
  "get_company_overview",
  "get_company_dashboard",
  "list_recent_activity",
  "update_company_branding",
  "update_company_settings",
  "set_company_logo",
  "get_company_user_profile",
  "get_company_sidebar_badges",
  "get_global_sidebar_preferences",
  "update_global_sidebar_preferences",
  "get_company_sidebar_preferences",
  "update_company_sidebar_preferences",
  "list_goals",
  "get_goal",
  "create_goal",
  "update_goal",
  "delete_goal",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function boundedLimit(limit: number | undefined, fallback: number, max: number) {
  const raw = typeof limit === "number" ? limit : fallback;
  return Math.max(1, Math.min(max, Math.floor(raw)));
}

function isCapabilityQuery(query: string) {
  return CAPABILITY_QUERY_PATTERNS.some((pattern) => pattern.test(query));
}

function capabilityForAction(action: HomeActionDescriptor): HomeCapabilityId | null {
  if (COMPANY_ACTION_NAMES.has(action.name)) return "company";
  switch (action.category) {
    case "agenda":
      return "agenda";
    case "agents":
    case "runs":
      return "agents";
    case "projects":
      return "projects";
    case "routines":
      return "routines";
    case "approvals":
      return "approvals";
    case "costs":
      return "costs";
    case "skills":
      return "skills";
    case "assets":
      return "assets";
    case "access":
      return "access";
    case "secrets":
      return "secrets";
    case "profile":
    case "manual":
    case "journal":
      return "company";
    default:
      return null;
  }
}

function actionDisabledReason(action: HomeActionDescriptor): string | null {
  if (DENIED_INTERNAL_CATEGORIES.has(action.category)) {
    return `category "${action.category}" is not Home-callable`;
  }
  if (ADMIN_NAME_PATTERNS.some((pattern) => pattern.test(action.name))) {
    return "action name matches an admin/platform/runtime deny rule";
  }
  if (action.routeReferences.some((route) => ADMIN_ROUTE_PATTERNS.some((pattern) => pattern.test(route)))) {
    return "action route references an admin/platform/runtime surface";
  }
  if (!capabilityForAction(action)) {
    return "action is not assigned to a Home capability";
  }
  return null;
}

function scoreText(query: string, values: Array<string | string[] | undefined>) {
  const normalized = query.toLowerCase().trim();
  const terms = normalized.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;

  const haystacks = values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.toLowerCase());

  let score = 0;
  for (const term of terms) {
    for (const haystack of haystacks) {
      if (haystack === term) score += 8;
      if (haystack.includes(term)) score += 2;
    }
  }
  for (const haystack of haystacks) {
    if (haystack === normalized) score += 12;
    if (normalized.length > 1 && haystack.includes(normalized)) score += 5;
  }
  return score;
}

function actionRiskRank(riskLevel: HomeCapabilityRiskLevel) {
  if (riskLevel === "safe") return 0;
  if (riskLevel === "low") return 1;
  return 2;
}

function highestRisk(actions: HomeActionDescriptor[]): HomeCapabilityRiskLevel {
  if (actions.some((action) => action.riskLevel === "risky")) return "risky";
  if (actions.some((action) => action.riskLevel === "low")) return "low";
  return "safe";
}

function capabilityOperationKind(actions: HomeActionDescriptor[]): "read" | "write" | "destructive" {
  if (actions.some((action) => action.operationKind === "destructive")) return "destructive";
  if (actions.some((action) => action.operationKind === "write")) return "write";
  return "read";
}

function actionInventoryItem(action: HomeActionDescriptor, disabledReason?: string): AiToolActionInventoryItem {
  return {
    name: action.name,
    displayName: action.displayName,
    description: action.description,
    category: action.category,
    family: action.family,
    operationKind: action.operationKind,
    riskLevel: action.riskLevel,
    inputSchema: action.inputSchema,
    enabled: !disabledReason,
    disabledReason,
  };
}

function buildCapabilityInputSchema(capability: HomeCapabilityDefinition, actions: HomeActionDescriptor[]) {
  const actionNames = actions.map((action) => action.name).sort();
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: actionNames,
        description: `Action to run inside the ${capability.displayName} capability. Use ai_tools with action=schema when unsure about the selected action input.`,
      },
      input: {
        type: "object",
        description: "Parameters for the selected action. The exact schema is available through ai_tools action=schema.",
        additionalProperties: true,
      },
    },
    required: ["action"],
  };
}

function descriptorFromAction(action: HomeActionDescriptor, capabilityId: HomeCapabilityId): AiToolDescriptor {
  const toolsets: AiToolset[] = ["all", "company", "home"];
  if (action.riskLevel === "safe") toolsets.push("safe");
  return {
    registryKey: `home_action.${capabilityId}.${action.name}`,
    name: action.name,
    displayName: action.displayName,
    description: action.description,
    category: capabilityId,
    family: action.family,
    entityType: action.entityType,
    operationKind: action.operationKind,
    riskLevel: action.riskLevel,
    inputSchema: action.inputSchema,
    sourceKind: "internal",
    sourceId: "paperclip.home.capabilities",
    toolsets,
    capabilityId,
    actionName: action.name,
    homeAction: action,
  };
}

function descriptorFromCapability(entry: CapabilityEntry): AiToolDescriptor {
  const enabledActions = entry.enabledActions;
  const toolsets: AiToolset[] = ["all", "company", "home"];
  if (enabledActions.every((action) => action.riskLevel === "safe")) toolsets.push("safe");
  return {
    registryKey: `home_capability.${entry.config.id}`,
    name: entry.config.id,
    displayName: entry.config.displayName,
    description: entry.config.description,
    category: entry.config.category,
    family: entry.config.family,
    entityType: "home_capability",
    operationKind: capabilityOperationKind(enabledActions),
    riskLevel: highestRisk(enabledActions),
    inputSchema: buildCapabilityInputSchema(entry.config, enabledActions),
    sourceKind: "internal",
    sourceId: "paperclip.home.capabilities",
    toolsets,
    capabilityId: entry.config.id,
    actions: entry.allActions.map(({ action, disabledReason }) => actionInventoryItem(action, disabledReason)),
  };
}

const AI_TOOL_INVENTORY_DESCRIPTOR: AiToolDescriptor = {
  registryKey: "registry.ai_tools",
  name: AI_TOOL_INVENTORY_TOOL_NAME,
  displayName: "AI tool inventory",
  description:
    "List, search, inspect schemas for, or explain the Home capability tools and actions this AI can call right now.",
  category: "tools",
  family: "tool_registry",
  entityType: "ai_tool",
  operationKind: "read",
  riskLevel: "safe",
  sourceKind: "internal",
  sourceId: AI_TOOL_REGISTRY_SOURCE_ID,
  toolsets: ["all", "company", "home", "safe"],
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: ["list", "search", "schema", "explain_selection"],
        description: "Use list for callable capabilities, search for matching actions, schema for exact action input, explain_selection to debug turn selection.",
      },
      query: {
        type: "string",
        description: "Search or selection query. Required for search and explain_selection.",
      },
      capability: {
        type: "string",
        description: "Optional capability filter such as agenda, agents, projects, approvals, costs, assets, skills, access, secrets, or company.",
      },
      target: {
        type: "string",
        description: "Capability or action name for action=schema.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: AI_TOOL_INVENTORY_LIMIT_MAX,
        description: "Maximum number of tools or actions to return.",
      },
      includeDisabled: {
        type: "boolean",
        description: "When true, include disabled actions and their reasons. Default false.",
      },
    },
    required: ["action"],
  },
};

function inventoryItemFromDescriptor(
  descriptor: AiToolDescriptor,
  enabled: boolean,
  disabledReason?: string,
): AiToolInventoryItem {
  return {
    registryKey: descriptor.registryKey,
    name: descriptor.name,
    displayName: descriptor.displayName,
    description: descriptor.description,
    category: descriptor.category,
    riskLevel: descriptor.riskLevel,
    inputSchema: descriptor.inputSchema,
    sourceKind: descriptor.sourceKind,
    sourceId: descriptor.sourceId,
    toolsets: descriptor.toolsets,
    enabled,
    disabledReason,
    actions: descriptor.actions,
  };
}

function summarizeTools(tools: AiToolInventoryItem[]) {
  return tools.map((tool) => ({
    name: tool.name,
    displayName: tool.displayName,
    description: tool.description,
    category: tool.category,
    riskLevel: tool.riskLevel,
    sourceKind: tool.sourceKind,
    sourceId: tool.sourceId,
    enabled: tool.enabled,
    disabledReason: tool.disabledReason,
    actions: tool.actions?.map((action) => ({
      name: action.name,
      displayName: action.displayName,
      description: action.description,
      riskLevel: action.riskLevel,
      enabled: action.enabled,
      disabledReason: action.disabledReason,
    })),
  }));
}

function summarizeActions(actions: AiToolActionInventoryItem[]) {
  return actions.map((action) => ({
    name: action.name,
    displayName: action.displayName,
    description: action.description,
    category: action.category,
    family: action.family,
    operationKind: action.operationKind,
    riskLevel: action.riskLevel,
    enabled: action.enabled,
    disabledReason: action.disabledReason,
  }));
}

export function createAiToolRegistry(db: Db, options: AiToolRegistryOptions = {}) {
  const homeCapabilities = options.homeCapabilityRegistry
    ?? createHomeCapabilityRegistry(db, options.homeCapabilityRegistryOptions);

  function capabilityEntries(includeDisabled = false): CapabilityEntry[] {
    const grouped = new Map<HomeCapabilityId, CapabilityEntry>();
    for (const config of HOME_CAPABILITIES) {
      grouped.set(config.id, { config, enabledActions: [], allActions: [] });
    }

    for (const action of homeCapabilities.listTools()) {
      const capabilityId = capabilityForAction(action);
      if (!capabilityId) continue;
      const entry = grouped.get(capabilityId);
      if (!entry) continue;
      const disabledReason = actionDisabledReason(action) ?? undefined;
      if (!disabledReason) {
        entry.enabledActions.push(action);
      }
      if (!disabledReason || includeDisabled) {
        entry.allActions.push({ action, disabledReason });
      }
    }

    return [...grouped.values()]
      .map((entry) => ({
        ...entry,
        enabledActions: entry.enabledActions.sort((left, right) => left.name.localeCompare(right.name)),
        allActions: entry.allActions.sort((left, right) => left.action.name.localeCompare(right.action.name)),
      }))
      .filter((entry) => entry.enabledActions.length > 0 || (includeDisabled && entry.allActions.length > 0));
  }

  function allCapabilityDescriptors(includeDisabled = false): AiToolDescriptor[] {
    return capabilityEntries(includeDisabled).map(descriptorFromCapability);
  }

  function matchesContextToolsets(tool: AiToolDescriptor, ctx: AiToolRegistryContext) {
    const toolsets: AiToolset[] = ctx.toolsets?.length ? ctx.toolsets : [ctx.surface, "company"];
    return toolsets.some((toolset) => tool.toolsets.includes(toolset));
  }

  function listEffectiveTools(ctx: AiToolRegistryContext, options: {
    category?: string | null;
    includeDisabled?: boolean;
    limit?: number;
  } = {}): AiToolInventoryItem[] {
    const category = options.category?.trim();
    const limit = boundedLimit(options.limit, AI_TOOL_INVENTORY_LIMIT_MAX, AI_TOOL_INVENTORY_LIMIT_MAX);
    const descriptors = [AI_TOOL_INVENTORY_DESCRIPTOR, ...allCapabilityDescriptors(options.includeDisabled === true)]
      .filter((descriptor) => !category || descriptor.name === category || descriptor.category === category)
      .filter((descriptor) => matchesContextToolsets(descriptor, ctx));
    return descriptors
      .slice(0, limit)
      .map((descriptor) => inventoryItemFromDescriptor(descriptor, true));
  }

  function enabledDescriptors(ctx: AiToolRegistryContext) {
    return [AI_TOOL_INVENTORY_DESCRIPTOR, ...allCapabilityDescriptors()]
      .filter((tool) => matchesContextToolsets(tool, ctx));
  }

  function findCapability(name: string, includeDisabled = false): CapabilityEntry | null {
    const normalized = name.trim();
    if (!normalized) return null;
    return capabilityEntries(includeDisabled).find((entry) => entry.config.id === normalized) ?? null;
  }

  function findAction(name: string, includeDisabled = false): { capability: CapabilityEntry; action: HomeActionDescriptor; disabledReason?: string } | null {
    const normalized = name.trim();
    if (!normalized) return null;
    for (const capability of capabilityEntries(includeDisabled)) {
      for (const entry of capability.allActions) {
        if (entry.action.name === normalized) {
          return { capability, action: entry.action, disabledReason: entry.disabledReason };
        }
      }
    }
    return null;
  }

  function scoreCapability(entry: CapabilityEntry, query: string) {
    const actionValues = entry.allActions.flatMap(({ action }) => [
      action.name,
      action.displayName,
      action.description,
      action.family,
      action.entityType,
      action.keywords,
    ]);
    return scoreText(query, [
      entry.config.id,
      entry.config.displayName,
      entry.config.description,
      entry.config.keywords,
      ...actionValues,
    ]);
  }

  function searchTools(ctx: AiToolRegistryContext, query: string, options: {
    category?: string | null;
    limit?: number;
  } = {}): AiToolInventoryItem[] {
    const normalized = query.trim();
    const category = options.category?.trim();
    const limit = boundedLimit(options.limit, 8, AI_TOOL_INVENTORY_LIMIT_MAX);
    if (!normalized) return listEffectiveTools(ctx, { category, limit });

    const ranked = capabilityEntries()
      .filter((entry) => !category || entry.config.id === category || entry.config.category === category)
      .map((entry) => ({ entry, score: scoreCapability(entry, normalized) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) =>
        right.score - left.score
        || left.entry.config.id.localeCompare(right.entry.config.id))
      .slice(0, limit)
      .map(({ entry }) => descriptorFromCapability(entry))
      .filter((tool) => matchesContextToolsets(tool, ctx));

    return ranked.map((tool) => inventoryItemFromDescriptor(tool, true));
  }

  function selectTools(ctx: AiToolRegistryContext, query: string, options: {
    category?: string | null;
    limit?: number;
  } = {}): AiToolSelection {
    const capabilityMode = isCapabilityQuery(query);
    const limit = boundedLimit(
      options.limit,
      capabilityMode ? CAPABILITY_AI_TOOL_LIMIT : DEFAULT_AI_TOOL_LIMIT,
      AI_TOOL_LIMIT_MAX,
    );
    const directLimit = Math.max(1, limit - 1);
    const category = options.category?.trim();
    const entries = capabilityEntries();
    const selectedEntries = capabilityMode
      ? entries
      : entries
        .filter((entry) => !category || entry.config.id === category || entry.config.category === category)
        .map((entry) => ({ entry, score: scoreCapability(entry, query) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) =>
          right.score - left.score
          || highestRisk(left.entry.enabledActions).localeCompare(highestRisk(right.entry.enabledActions))
          || left.entry.config.id.localeCompare(right.entry.config.id))
        .map(({ entry }) => entry);

    const fallbackEntries = selectedEntries.length > 0 ? [] : entries;
    const seen = new Set<string>([AI_TOOL_INVENTORY_TOOL_NAME]);
    const tools = [AI_TOOL_INVENTORY_DESCRIPTOR];
    for (const entry of [...selectedEntries, ...fallbackEntries]) {
      const descriptor = descriptorFromCapability(entry);
      if (!matchesContextToolsets(descriptor, ctx) || seen.has(descriptor.name)) continue;
      seen.add(descriptor.name);
      tools.push(descriptor);
      if (tools.length >= directLimit + 1) break;
    }

    return {
      query,
      isCapabilityQuery: capabilityMode,
      limit,
      tools,
    };
  }

  function getTool(ctx: AiToolRegistryContext, name: string) {
    return enabledDescriptors(ctx).find((tool) => tool.name === name) ?? null;
  }

  function getToolCallDescriptor(ctx: AiToolRegistryContext, name: string, parameters: unknown): AiToolDescriptor | null {
    if (name === AI_TOOL_INVENTORY_TOOL_NAME) return AI_TOOL_INVENTORY_DESCRIPTOR;
    const capability = findCapability(name);
    if (!capability) return getTool(ctx, name);
    const record = asRecord(parameters);
    const actionName = asString(record.action);
    if (!actionName) return descriptorFromCapability(capability);
    const action = capability.enabledActions.find((entry) => entry.name === actionName);
    return action ? descriptorFromAction(action, capability.config.id) : descriptorFromCapability(capability);
  }

  async function executeInventoryTool(input: {
    ctx: AiToolRegistryContext;
    parameters: Record<string, unknown>;
    toolCallId: string;
  }): Promise<AiToolExecution> {
    const action = asString(input.parameters.action) || "list";
    const query = asString(input.parameters.query);
    const capability = asString(input.parameters.capability) || null;
    const target = asString(input.parameters.target);
    const limit = boundedLimit(
      typeof input.parameters.limit === "number" ? input.parameters.limit : undefined,
      12,
      AI_TOOL_INVENTORY_LIMIT_MAX,
    );
    const includeDisabled = input.parameters.includeDisabled === true;

    if (action === "search") {
      const matchedActions = capabilityEntries(includeDisabled)
        .filter((entry) => !capability || entry.config.id === capability)
        .flatMap((entry) => entry.allActions.map(({ action: item, disabledReason }) => ({
          capability: entry.config.id,
          item,
          disabledReason,
          score: scoreText(query, [
            item.name,
            item.displayName,
            item.description,
            item.category,
            item.family,
            item.entityType,
            item.keywords,
          ]),
        })))
        .filter((entry) => entry.score > 0)
        .sort((left, right) =>
          right.score - left.score
          || actionRiskRank(left.item.riskLevel) - actionRiskRank(right.item.riskLevel)
          || left.item.name.localeCompare(right.item.name))
        .slice(0, limit)
        .map((entry) => ({
          capability: entry.capability,
          ...actionInventoryItem(entry.item, entry.disabledReason),
        }));
      const fallback = matchedActions.length === 0
        ? listEffectiveTools(input.ctx, { category: capability, limit: Math.min(limit, 12) })
        : [];
      return {
        toolCallId: input.toolCallId,
        descriptor: AI_TOOL_INVENTORY_DESCRIPTOR,
        input: input.parameters,
        status: "completed",
        content: matchedActions.length > 0
          ? `Found ${matchedActions.length} matching Home actions.`
          : "No exact action matches. Returning a fallback slice of currently callable Home capabilities.",
        data: {
          action,
          query,
          results: matchedActions,
          fallback: summarizeTools(fallback),
        },
      };
    }

    if (action === "schema") {
      const resolvedAction = target ? findAction(target, includeDisabled) : null;
      const resolvedCapability = target ? findCapability(target, includeDisabled) : null;
      if (!resolvedAction && !resolvedCapability) {
        throw badRequest("ai_tools schema requires target to be a known Home capability or action name");
      }
      return {
        toolCallId: input.toolCallId,
        descriptor: AI_TOOL_INVENTORY_DESCRIPTOR,
        input: input.parameters,
        status: "completed",
        content: resolvedAction
          ? `Loaded schema for Home action ${resolvedAction.action.name}.`
          : `Loaded schema for Home capability ${resolvedCapability!.config.id}.`,
        data: resolvedAction
          ? {
              action,
              capability: resolvedAction.capability.config.id,
              target: resolvedAction.action.name,
              schema: resolvedAction.action.inputSchema,
              disabledReason: resolvedAction.disabledReason,
            }
          : {
              action,
              capability: resolvedCapability!.config.id,
              target: resolvedCapability!.config.id,
              schema: descriptorFromCapability(resolvedCapability!).inputSchema,
              actions: summarizeActions(resolvedCapability!.allActions.map(({ action: item, disabledReason }) => actionInventoryItem(item, disabledReason))),
            },
      };
    }

    if (action === "explain_selection") {
      const selection = selectTools(input.ctx, query, { category: capability, limit: Math.min(limit, AI_TOOL_LIMIT_MAX) });
      return {
        toolCallId: input.toolCallId,
        descriptor: AI_TOOL_INVENTORY_DESCRIPTOR,
        input: input.parameters,
        status: "completed",
        content: `Selected ${selection.tools.length} Home capability tools for this request.`,
        data: {
          action,
          query,
          isCapabilityQuery: selection.isCapabilityQuery,
          selected: summarizeTools(selection.tools.map((tool) => inventoryItemFromDescriptor(tool, true))),
        },
      };
    }

    if (action !== "list") {
      throw badRequest(`Unknown AI tool inventory action: ${action}`);
    }

    const tools = listEffectiveTools(input.ctx, {
      category: capability,
      includeDisabled,
      limit,
    });
    return {
      toolCallId: input.toolCallId,
      descriptor: AI_TOOL_INVENTORY_DESCRIPTOR,
      input: input.parameters,
      status: "completed",
      content: `Listed ${tools.filter((tool) => tool.enabled).length} currently callable Home capability tools.`,
      data: {
        action,
        tools: summarizeTools(tools),
      },
    };
  }

  async function executeTool(input: {
    ctx: AiToolRegistryContext;
    name: string;
    parameters: unknown;
    toolCallId?: string;
  }): Promise<AiToolExecution> {
    const toolCallId = input.toolCallId ?? randomUUID();
    const parameters = asRecord(input.parameters);
    if (input.name === AI_TOOL_INVENTORY_TOOL_NAME) {
      return executeInventoryTool({
        ctx: input.ctx,
        parameters,
        toolCallId,
      });
    }

    const capability = findCapability(input.name);
    if (!capability) {
      throw badRequest(`Unknown Home capability: ${input.name}`);
    }
    const actionName = asString(parameters.action);
    if (!actionName) {
      throw badRequest(`Home capability "${input.name}" requires an action`);
    }
    const action = capability.enabledActions.find((entry) => entry.name === actionName) ?? null;
    if (!action) {
      const validActions = capability.enabledActions.map((entry) => entry.name).sort().join(", ");
      throw badRequest(`Unknown action "${actionName}" for Home capability "${input.name}". Available actions: ${validActions}`);
    }
    const rawInput = "input" in parameters ? parameters.input : Object.fromEntries(
      Object.entries(parameters).filter(([key]) => key !== "action"),
    );
    const actionInput = asRecord(rawInput);
    const execution: HomeActionExecution = await homeCapabilities.executeTool({
      ctx: input.ctx,
      name: action.name,
      parameters: actionInput,
      toolCallId,
    });
    return {
      toolCallId: execution.toolCallId,
      descriptor: descriptorFromAction(action, capability.config.id),
      input: execution.input,
      status: execution.status,
      content: execution.content,
      data: execution.data,
    };
  }

  return {
    listEffectiveTools,
    searchTools,
    selectTools,
    getTool,
    getToolCallDescriptor,
    executeTool,
  };
}


