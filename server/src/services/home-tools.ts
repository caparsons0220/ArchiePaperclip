import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, isNotNull, ne, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  companies,
  issues,
  projectWorkspaces,
  workspaceRuntimeServices,
} from "@paperclipai/db";
import {
  type HomeChatToolSourceKind,
  type BudgetScopeType,
  type ProjectWorkspace,
  type WorkspaceRuntimeDesiredState,
  type WorkspaceRuntimeService,
  type WorkspaceRuntimeServiceStateMap,
  isUuidLike,
  normalizeAgentUrlKey,
  normalizeProjectUrlKey,
} from "@paperclipai/shared";
import type { HomeChatToolFailureData } from "@paperclipai/shared/home-chat";
import { activityService } from "./activity.js";
import { agentService } from "./agents.js";
import { approvalService } from "./approvals.js";
import { budgetService } from "./budgets.js";
import { companyService } from "./companies.js";
import { companySkillService } from "./company-skills.js";
import { costService } from "./costs.js";
import { dashboardService } from "./dashboard.js";
import {
  executionWorkspaceService,
  mergeExecutionWorkspaceConfig,
} from "./execution-workspaces.js";
import { goalService } from "./goals.js";
import { issueService } from "./issues.js";
import { projectService } from "./projects.js";
import {
  buildWorkspaceRuntimeDesiredStatePatch,
  ensurePersistedExecutionWorkspaceAvailable,
  listConfiguredRuntimeServiceEntries,
  startRuntimeServicesForWorkspaceControl,
  stopRuntimeServicesForExecutionWorkspace,
  stopRuntimeServicesForProjectWorkspace,
} from "./workspace-runtime.js";
import { routineService } from "./routines.js";
import { secretService } from "./secrets.js";
import { logActivity } from "./activity-log.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";

export type HomeToolRiskLevel = "safe" | "low" | "risky";

export type HomeToolCategory =
  | "workspace"
  | "profile"
  | "agenda"
  | "manual"
  | "agents"
  | "runs"
  | "projects"
  | "routines"
  | "approvals"
  | "journal"
  | "costs"
  | "secrets"
  | "access"
  | "skills"
  | "assets"
  | "plugins";

export interface HomeToolDescriptor {
  registryKey: string;
  name: string;
  displayName: string;
  description: string;
  category: HomeToolCategory;
  riskLevel: HomeToolRiskLevel;
  inputSchema: Record<string, unknown>;
  keywords: string[];
}

export interface HomeToolInventoryItem {
  name: string;
  displayName: string;
  description: string;
  category: string;
  riskLevel: HomeToolRiskLevel;
  inputSchema: Record<string, unknown>;
  sourceKind: HomeChatToolSourceKind;
  sourceId: string;
}

export interface HomeToolSelection {
  query: string;
  isCapabilityQuery: boolean;
  limit: number;
  tools: HomeToolDescriptor[];
}

export interface HomeToolContext {
  companyId: string;
  ownerUserId: string;
  threadId: string;
}

export interface HomeToolExecution {
  toolCallId: string;
  descriptor: HomeToolDescriptor;
  input: Record<string, unknown>;
  status: "completed";
  content: string;
  data?: unknown;
}

interface HomeToolDefinition extends Omit<HomeToolDescriptor, "registryKey"> {
  handler: (ctx: HomeToolContext, input: Record<string, unknown>) => Promise<{ content: string; data?: unknown }>;
}

interface HomeToolInventoryEntry {
  item: HomeToolInventoryItem;
  keywords: string[];
}

interface HomeToolInventoryProvider {
  sourceKind: HomeChatToolSourceKind;
  sourceId: string;
  listEntries: () => HomeToolInventoryEntry[];
}

interface HomeToolFailureCandidate {
  id?: string;
  label: string;
  ref?: string;
}

interface HomeToolRefSelector {
  id: string | null;
  ref: string | null;
  legacyRef: string | null;
  reference: string | null;
}

const INTERNAL_HOME_TOOL_SOURCE_ID = "paperclip.home.internal";
const DEFAULT_TOOL_SELECTION_LIMIT = 12;
const CAPABILITY_TOOL_SELECTION_LIMIT = 20;
const TOOL_SELECTION_LIMIT_MAX = 20;
const TOOL_INVENTORY_LIMIT_MAX = 25;
const ISSUE_IDENTIFIER_RE = /^[A-Z]+-\d+$/i;
const CAPABILITY_QUERY_PATTERNS = [
  /\bwhat can (you|archie) do\b/i,
  /\bwhat tools\b/i,
  /\bwhich tools\b/i,
  /\bwhat actions\b/i,
  /\bavailable tools\b/i,
  /\bavailable actions\b/i,
  /\bcapabilities\b/i,
];
const HOME_TOOL_COMPANIONS: Record<string, string[]> = {
  create_issue: ["list_agents", "list_projects"],
  update_issue_status: ["list_issues"],
  pause_agent: ["list_agents"],
  resume_agent: ["list_agents"],
  restart_preview_runtime: ["list_projects", "list_execution_workspaces", "get_active_preview"],
  update_budget: ["get_costs_and_budgets", "list_agents", "list_projects"],
};

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

function stringProperty(description: string, extra: Record<string, unknown> = {}) {
  return { type: "string", description, ...extra };
}

function numberProperty(description: string, extra: Record<string, unknown> = {}) {
  return { type: "number", description, ...extra };
}

function booleanProperty(description: string) {
  return { type: "boolean", description };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLooseRef(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const normalized = compactWhitespace(value).toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function buildToolFailureData(input: {
  code: HomeChatToolFailureData["code"];
  entityType?: string;
  reference?: string | null;
  candidates?: HomeToolFailureCandidate[];
  hint?: string;
}): HomeChatToolFailureData {
  return {
    code: input.code,
    entityType: input.entityType,
    reference: input.reference ?? undefined,
    candidates: input.candidates?.filter((candidate) => candidate.label.trim().length > 0),
    hint: input.hint,
  };
}

function throwToolBadReference(input: {
  message: string;
  entityType: string;
  reference?: string | null;
  candidates?: HomeToolFailureCandidate[];
  hint?: string;
}): never {
  throw badRequest(input.message, buildToolFailureData({
    code: "invalid_reference",
    entityType: input.entityType,
    reference: input.reference,
    candidates: input.candidates,
    hint: input.hint,
  }));
}

function throwToolNotFound(input: {
  message: string;
  entityType: string;
  reference?: string | null;
  hint?: string;
}): never {
  throw notFound(input.message, buildToolFailureData({
    code: "not_found",
    entityType: input.entityType,
    reference: input.reference,
    hint: input.hint,
  }));
}

function throwToolConflict(input: {
  message: string;
  entityType: string;
  reference?: string | null;
  candidates?: HomeToolFailureCandidate[];
  hint?: string;
}): never {
  throw conflict(input.message, buildToolFailureData({
    code: "ambiguous_reference",
    entityType: input.entityType,
    reference: input.reference,
    candidates: input.candidates,
    hint: input.hint,
  }));
}

function throwToolForbiddenScope(input: {
  message: string;
  entityType: string;
  reference?: string | null;
  hint?: string;
}): never {
  throw forbidden(input.message, buildToolFailureData({
    code: "forbidden_company_scope",
    entityType: input.entityType,
    reference: input.reference,
    hint: input.hint,
  }));
}

function pickRefSelector(input: Record<string, unknown>, idField: string, refField: string): HomeToolRefSelector {
  const rawId = asString(input[idField]);
  const rawRef = asString(input[refField]);
  const legacyRef = rawId && !isUuidLike(rawId) ? rawId : null;
  return {
    id: rawId && isUuidLike(rawId) ? rawId : null,
    ref: rawRef,
    legacyRef,
    reference: rawRef ?? legacyRef,
  };
}

function buildNamedCandidates<T>(
  rows: T[],
  options: {
    id: (row: T) => string;
    label: (row: T) => string;
    ref?: (row: T) => string | null | undefined;
  },
): HomeToolFailureCandidate[] {
  return rows.map((row) => ({
    id: options.id(row),
    label: options.label(row),
    ref: options.ref?.(row) ?? undefined,
  }));
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function summarizeRows(rows: unknown[], noun: string) {
  return `Found ${rows.length} ${noun}${rows.length === 1 ? "" : "s"}.`;
}

type RestartPreviewTarget =
  | {
      kind: "execution_workspace";
      executionWorkspaceId: string;
      runtimeServiceId: string | null;
    }
  | {
      kind: "project_workspace";
      projectId: string;
      projectWorkspaceId: string | null;
      runtimeServiceId: string | null;
    };

function createWorkspaceControlActor(ctx: HomeToolContext) {
  return {
    id: null,
    name: "Board",
    companyId: ctx.companyId,
  };
}

function buildProjectWorkspaceRuntimeRef(input: {
  projectId: string;
  workspace: ProjectWorkspace;
}) {
  const cwd = input.workspace.cwd?.trim();
  if (!cwd) {
    throw badRequest("Project workspace needs a local path before Archie Bravo can manage runtime services");
  }
  return {
    baseCwd: cwd,
    source: "project_primary" as const,
    projectId: input.projectId,
    workspaceId: input.workspace.id,
    repoUrl: input.workspace.repoUrl,
    repoRef: input.workspace.repoRef,
    strategy: "project_primary" as const,
    cwd,
    branchName: input.workspace.defaultRef ?? input.workspace.repoRef ?? null,
    worktreePath: null,
    warnings: [],
    created: false,
  };
}

function describeTarget(label: string, services: Array<{ serviceName: string }>) {
  const serviceNames = services.map((service) => service.serviceName);
  const serviceSummary =
    serviceNames.length === 0
      ? "no services"
      : `${serviceNames.length} service${serviceNames.length === 1 ? "" : "s"} (${serviceNames.join(", ")})`;
  return `${label} with ${serviceSummary}`;
}

function resolveServiceIndexFromRuntimeServiceId(input: {
  config: Record<string, unknown>;
  runtimeServices: WorkspaceRuntimeService[];
  runtimeServiceId: string | null;
  targetLabel: string;
}) {
  if (!input.runtimeServiceId) {
    return {
      runtimeServiceId: null,
      serviceIndex: null,
    };
  }

  const runtimeService = input.runtimeServices.find((service) => service.id === input.runtimeServiceId) ?? null;
  if (!runtimeService) {
    throw notFound(`Runtime service not found for ${input.targetLabel}`);
  }

  const configuredServices = listConfiguredRuntimeServiceEntries({ workspaceRuntime: input.config });
  if (configuredServices.length === 0) {
    throw badRequest(`${input.targetLabel} has no configured runtime services to restart`);
  }

  const namedMatches = configuredServices
    .map((service, index) => ({
      index,
      name: asString((service as Record<string, unknown>).name),
    }))
    .filter((entry) => entry.name === runtimeService.serviceName);

  if (namedMatches.length === 1) {
    return {
      runtimeServiceId: runtimeService.id,
      serviceIndex: namedMatches[0]!.index,
    };
  }

  if (configuredServices.length === 1) {
    return {
      runtimeServiceId: runtimeService.id,
      serviceIndex: 0,
    };
  }

  throw badRequest(
    `Need a clearer runtime target for ${input.targetLabel}. This runtime service could not be mapped back to a unique configured service.`,
  );
}

export function createHomeToolDispatcher(db: Db) {
  const companiesSvc = companyService(db);
  const dashboard = dashboardService(db);
  const activity = activityService(db);
  const issueSvc = issueService(db);
  const agentSvc = agentService(db);
  const projectSvc = projectService(db);
  const goalSvc = goalService(db);
  const routineSvc = routineService(db);
  const approvalSvc = approvalService(db);
  const costs = costService(db);
  const budgets = budgetService(db);
  const executionWorkspaces = executionWorkspaceService(db);
  const companySkills = companySkillService(db);
  const secrets = secretService(db);

  async function assertCompanyEntityAccess(
    ctx: HomeToolContext,
    kind: "agent",
    id: string,
  ): Promise<NonNullable<Awaited<ReturnType<typeof agentSvc.getById>>>>;
  async function assertCompanyEntityAccess(
    ctx: HomeToolContext,
    kind: "issue",
    id: string,
  ): Promise<NonNullable<Awaited<ReturnType<typeof issueSvc.getById>>>>;
  async function assertCompanyEntityAccess(ctx: HomeToolContext, kind: "agent" | "issue", id: string) {
    if (kind === "agent") {
      const row = await agentSvc.getById(id);
      if (!row) throw notFound("Agent not found");
      if (row.companyId !== ctx.companyId) throw forbidden("Agent does not belong to the active company");
      return row;
    }
    const row = await issueSvc.getById(id);
    if (!row) throw notFound("Issue not found");
    if (row.companyId !== ctx.companyId) throw forbidden("Issue does not belong to the active company");
    return row;
  }

  async function resolveAgentTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "agentId";
    const refField = options.refField ?? "agentRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "agent",
        hint: "Use the agent UUID or the company-local agent name/urlKey.",
      });
    }

    const matchReference = async (reference: string) => {
      const resolved = await agentSvc.resolveByReference(ctx.companyId, reference);
      if (resolved.ambiguous) {
        const candidates = (await agentSvc.list(ctx.companyId, { includeTerminated: false }))
          .filter((agent) => normalizeAgentUrlKey(agent.name) === normalizeAgentUrlKey(reference))
          .map((agent) => ({
            id: agent.id,
            label: agent.name,
            ref: agent.urlKey,
          }));
        throwToolConflict({
          message: `Agent reference "${reference}" is ambiguous in this company.`,
          entityType: "agent",
          reference,
          candidates,
          hint: "Use the exact agent ID or a more specific company-local agent name.",
        });
      }
      if (!resolved.agent) {
        throwToolNotFound({
          message: `Agent "${reference}" was not found in this company.`,
          entityType: "agent",
          reference,
          hint: "Call list_agents first or use the exact agent name/urlKey.",
        });
      }
      return resolved.agent;
    };

    if (selector.id) {
      const agent = await agentSvc.getById(selector.id);
      if (!agent) {
        throwToolNotFound({
          message: `Agent "${selector.id}" was not found.`,
          entityType: "agent",
          reference: selector.id,
          hint: "Use the exact agent UUID or company-local agent name.",
        });
      }
      if (agent.companyId !== ctx.companyId) {
        throwToolForbiddenScope({
          message: "Agent does not belong to the active company.",
          entityType: "agent",
          reference: selector.id,
          hint: "Use an agent from the current company only.",
        });
      }
      if (selector.ref) {
        const resolvedByRef = await matchReference(selector.ref);
        if (resolvedByRef.id !== agent.id) {
          throwToolBadReference({
            message: "Provided agentId and agentRef point to different agents.",
            entityType: "agent",
            reference: selector.ref,
            candidates: [{
              id: agent.id,
              label: agent.name,
              ref: agent.urlKey,
            }],
            hint: "Pass either the exact agent ID or the matching agent ref, not conflicting selectors.",
          });
        }
      }
      return agent;
    }

    return await matchReference(selector.reference!);
  }

  async function findIssueReferenceMatches(companyId: string, reference: string) {
    const trimmed = reference.trim();
    const normalized = normalizeLooseRef(trimmed);
    if (!trimmed || !normalized) return [];
    const rows = await db
      .select({
        id: issues.id,
        companyId: issues.companyId,
        identifier: issues.identifier,
        title: issues.title,
      })
      .from(issues)
      .where(eq(issues.companyId, companyId));

    return rows.filter((row) =>
      row.identifier?.toUpperCase() === trimmed.toUpperCase()
      || normalizeLooseRef(row.title) === normalized
    );
  }

  async function resolveIssueTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "issueId";
    const refField = options.refField ?? "issueRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "issue",
        hint: "Use the issue UUID, identifier, or exact issue title.",
      });
    }

    const matchReference = async (reference: string) => {
      const matches = await findIssueReferenceMatches(ctx.companyId, reference);
      if (matches.length > 1) {
        throwToolConflict({
          message: `Issue reference "${reference}" is ambiguous in this company.`,
          entityType: "issue",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.identifier ? `${row.identifier}: ${row.title}` : row.title,
            ref: (row) => row.identifier ?? row.title,
          }),
          hint: "Use the issue UUID or identifier when multiple issue titles match.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Issue "${reference}" was not found in this company.`,
          entityType: "issue",
          reference,
          hint: "Use the issue UUID, identifier, or exact title.",
        });
      }
      return await assertCompanyEntityAccess(ctx, "issue", match.id);
    };

    if (selector.id) {
      const issue = await assertCompanyEntityAccess(ctx, "issue", selector.id);
      if (selector.ref) {
        const resolvedByRef = await matchReference(selector.ref);
        if (resolvedByRef.id !== issue.id) {
          throwToolBadReference({
            message: "Provided issueId and issueRef point to different issues.",
            entityType: "issue",
            reference: selector.ref,
            candidates: [{
              id: issue.id,
              label: issue.identifier ? `${issue.identifier}: ${issue.title}` : issue.title,
              ref: issue.identifier ?? issue.title,
            }],
            hint: "Pass either the exact issue ID or the matching issue ref, not conflicting selectors.",
          });
        }
      }
      return issue;
    }

    return await matchReference(selector.reference!);
  }

  async function resolveProjectTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "projectId";
    const refField = options.refField ?? "projectRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "project",
        hint: "Use the project UUID or the company-local project name/urlKey.",
      });
    }

    const matchReference = async (reference: string) => {
      const resolved = await projectSvc.resolveByReference(ctx.companyId, reference);
      if (resolved.ambiguous) {
        const candidates = (await projectSvc.list(ctx.companyId))
          .filter((project) => normalizeProjectUrlKey(project.name) === normalizeProjectUrlKey(reference))
          .map((project) => ({
            id: project.id,
            label: project.name,
            ref: project.urlKey,
          }));
        throwToolConflict({
          message: `Project reference "${reference}" is ambiguous in this company.`,
          entityType: "project",
          reference,
          candidates,
          hint: "Use the exact project ID or a more specific project name/urlKey.",
        });
      }
      if (!resolved.project) {
        throwToolNotFound({
          message: `Project "${reference}" was not found in this company.`,
          entityType: "project",
          reference,
          hint: "Call list_projects first or use the exact project name/urlKey.",
        });
      }
      const project = await projectSvc.getById(resolved.project.id);
      if (!project) {
        throwToolNotFound({
          message: `Project "${reference}" was not found in this company.`,
          entityType: "project",
          reference,
        });
      }
      return project;
    };

    if (selector.id) {
      const project = await projectSvc.getById(selector.id);
      if (!project) {
        throwToolNotFound({
          message: `Project "${selector.id}" was not found.`,
          entityType: "project",
          reference: selector.id,
        });
      }
      if (project.companyId !== ctx.companyId) {
        throwToolForbiddenScope({
          message: "Project does not belong to the active company.",
          entityType: "project",
          reference: selector.id,
          hint: "Use a project from the current company only.",
        });
      }
      if (selector.ref) {
        const resolvedByRef = await matchReference(selector.ref);
        if (resolvedByRef.id !== project.id) {
          throwToolBadReference({
            message: "Provided projectId and projectRef point to different projects.",
            entityType: "project",
            reference: selector.ref,
            candidates: [{
              id: project.id,
              label: project.name,
              ref: project.urlKey,
            }],
            hint: "Pass either the exact project ID or the matching project ref, not conflicting selectors.",
          });
        }
      }
      return project;
    }

    return await matchReference(selector.reference!);
  }

  async function resolveExecutionWorkspaceTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "executionWorkspaceId";
    const refField = options.refField ?? "executionWorkspaceRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "execution_workspace",
        hint: "Use the execution workspace UUID or exact execution workspace name.",
      });
    }

    const matchReference = async (reference: string) => {
      const normalized = normalizeLooseRef(reference);
      const matches = (await executionWorkspaces.listSummaries(ctx.companyId))
        .filter((workspace) => normalizeLooseRef(workspace.name) === normalized);
      if (matches.length > 1) {
        throwToolConflict({
          message: `Execution workspace reference "${reference}" is ambiguous in this company.`,
          entityType: "execution_workspace",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.name,
            ref: (row) => row.name,
          }),
          hint: "Use the execution workspace UUID or a more specific workspace name.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Execution workspace "${reference}" was not found in this company.`,
          entityType: "execution_workspace",
          reference,
          hint: "Call list_execution_workspaces first or use the exact execution workspace name.",
        });
      }
      const workspace = await executionWorkspaces.getById(match.id);
      if (!workspace) {
        throwToolNotFound({
          message: `Execution workspace "${reference}" was not found in this company.`,
          entityType: "execution_workspace",
          reference,
        });
      }
      return workspace;
    };

    if (selector.id) {
      const workspace = await executionWorkspaces.getById(selector.id);
      if (!workspace) {
        throwToolNotFound({
          message: `Execution workspace "${selector.id}" was not found.`,
          entityType: "execution_workspace",
          reference: selector.id,
        });
      }
      if (workspace.companyId !== ctx.companyId) {
        throwToolForbiddenScope({
          message: "Execution workspace does not belong to the active company.",
          entityType: "execution_workspace",
          reference: selector.id,
          hint: "Use an execution workspace from the current company only.",
        });
      }
      if (selector.ref) {
        const resolvedByRef = await matchReference(selector.ref);
        if (resolvedByRef.id !== workspace.id) {
          throwToolBadReference({
            message: "Provided executionWorkspaceId and executionWorkspaceRef point to different workspaces.",
            entityType: "execution_workspace",
            reference: selector.ref,
            candidates: [{
              id: workspace.id,
              label: workspace.name,
              ref: workspace.name,
            }],
            hint: "Pass either the exact execution workspace ID or the matching ref, not conflicting selectors.",
          });
        }
      }
      return workspace;
    }

    return await matchReference(selector.reference!);
  }

  async function getProjectWorkspaceRowById(ctx: HomeToolContext, projectWorkspaceId: string) {
    return await db
      .select({
        id: projectWorkspaces.id,
        companyId: projectWorkspaces.companyId,
        projectId: projectWorkspaces.projectId,
        name: projectWorkspaces.name,
      })
      .from(projectWorkspaces)
      .where(
        and(
          eq(projectWorkspaces.id, projectWorkspaceId),
          eq(projectWorkspaces.companyId, ctx.companyId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  async function resolveProjectWorkspaceReferenceTarget(input: {
    ctx: HomeToolContext;
    projectId: string | null;
    projectWorkspaceId: string | null;
    projectWorkspaceRef: string | null;
  }) {
    if (input.projectWorkspaceId) {
      const row = await getProjectWorkspaceRowById(input.ctx, input.projectWorkspaceId);
      if (!row) {
        throwToolNotFound({
          message: `Project workspace "${input.projectWorkspaceId}" was not found.`,
          entityType: "project_workspace",
          reference: input.projectWorkspaceId,
        });
      }
      if (input.projectId && row.projectId !== input.projectId) {
        throwToolBadReference({
          message: "Provided projectId and projectWorkspaceId point to different project workspaces.",
          entityType: "project_workspace",
          reference: input.projectWorkspaceId,
          candidates: [{
            id: row.id,
            label: row.name,
            ref: row.name,
          }],
          hint: "Use a project workspace that belongs to the selected project.",
        });
      }
      if (
        input.projectWorkspaceRef
        && normalizeLooseRef(row.name) !== normalizeLooseRef(input.projectWorkspaceRef)
      ) {
        throwToolBadReference({
          message: "Provided projectWorkspaceId and projectWorkspaceRef point to different workspaces.",
          entityType: "project_workspace",
          reference: input.projectWorkspaceRef,
          candidates: [{
            id: row.id,
            label: row.name,
            ref: row.name,
          }],
          hint: "Pass either the exact project workspace ID or the matching workspace name, not conflicting selectors.",
        });
      }
      return row;
    }

    if (!input.projectWorkspaceRef) return null;

    const normalized = normalizeLooseRef(input.projectWorkspaceRef);
    const rows = await db
      .select({
        id: projectWorkspaces.id,
        companyId: projectWorkspaces.companyId,
        projectId: projectWorkspaces.projectId,
        name: projectWorkspaces.name,
      })
      .from(projectWorkspaces)
      .where(
        and(
          eq(projectWorkspaces.companyId, input.ctx.companyId),
          ...(input.projectId ? [eq(projectWorkspaces.projectId, input.projectId)] : []),
        ),
      );

    const matches = rows.filter((row) => normalizeLooseRef(row.name) === normalized);
    if (matches.length > 1) {
      throwToolConflict({
        message: `Project workspace reference "${input.projectWorkspaceRef}" is ambiguous in this company.`,
        entityType: "project_workspace",
        reference: input.projectWorkspaceRef,
        candidates: buildNamedCandidates(matches, {
          id: (row) => row.id,
          label: (row) => row.name,
          ref: (row) => row.name,
        }),
        hint: input.projectId
          ? "Use the project workspace UUID if multiple workspaces in this project share that name."
          : "Use the project workspace UUID or also pass a project ref to narrow the match.",
      });
    }
    const match = matches[0] ?? null;
    if (!match) {
      throwToolNotFound({
        message: `Project workspace "${input.projectWorkspaceRef}" was not found in this company.`,
        entityType: "project_workspace",
        reference: input.projectWorkspaceRef,
        hint: "Use the exact project workspace name or call list_projects first.",
      });
    }
    return match;
  }

  async function resolveRuntimeServiceReferenceTarget(input: {
    ctx: HomeToolContext;
    runtimeServiceId: string | null;
    runtimeServiceRef: string | null;
    executionWorkspaceId?: string | null;
    projectId?: string | null;
    projectWorkspaceId?: string | null;
  }) {
    if (input.runtimeServiceId) {
      const row = await db
        .select({
          id: workspaceRuntimeServices.id,
          companyId: workspaceRuntimeServices.companyId,
          projectId: workspaceRuntimeServices.projectId,
          projectWorkspaceId: workspaceRuntimeServices.projectWorkspaceId,
          executionWorkspaceId: workspaceRuntimeServices.executionWorkspaceId,
          serviceName: workspaceRuntimeServices.serviceName,
          url: workspaceRuntimeServices.url,
        })
        .from(workspaceRuntimeServices)
        .where(
          and(
            eq(workspaceRuntimeServices.id, input.runtimeServiceId),
            eq(workspaceRuntimeServices.companyId, input.ctx.companyId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!row) {
        throwToolNotFound({
          message: `Runtime service "${input.runtimeServiceId}" was not found in this company.`,
          entityType: "runtime_service",
          reference: input.runtimeServiceId,
        });
      }
      if (
        input.runtimeServiceRef
        && normalizeLooseRef(row.serviceName) !== normalizeLooseRef(input.runtimeServiceRef)
        && normalizeLooseRef(row.url) !== normalizeLooseRef(input.runtimeServiceRef)
      ) {
        throwToolBadReference({
          message: "Provided runtimeServiceId and runtimeServiceRef point to different runtime services.",
          entityType: "runtime_service",
          reference: input.runtimeServiceRef,
          candidates: [{
            id: row.id,
            label: row.url ? `${row.serviceName} (${row.url})` : row.serviceName,
            ref: row.serviceName,
          }],
          hint: "Pass either the exact runtime service ID or the matching service name/URL, not conflicting selectors.",
        });
      }
      return row;
    }

    if (!input.runtimeServiceRef) return null;

    const normalized = normalizeLooseRef(input.runtimeServiceRef);
    const rows = await db
      .select({
        id: workspaceRuntimeServices.id,
        companyId: workspaceRuntimeServices.companyId,
        projectId: workspaceRuntimeServices.projectId,
        projectWorkspaceId: workspaceRuntimeServices.projectWorkspaceId,
        executionWorkspaceId: workspaceRuntimeServices.executionWorkspaceId,
        serviceName: workspaceRuntimeServices.serviceName,
        url: workspaceRuntimeServices.url,
      })
      .from(workspaceRuntimeServices)
      .where(eq(workspaceRuntimeServices.companyId, input.ctx.companyId));

    const scopedRows = rows.filter((row) => {
      if (input.executionWorkspaceId && row.executionWorkspaceId !== input.executionWorkspaceId) return false;
      if (input.projectWorkspaceId && row.projectWorkspaceId !== input.projectWorkspaceId) return false;
      if (input.projectId && row.projectId !== input.projectId) return false;
      return true;
    });

    const matches = scopedRows.filter((row) =>
      normalizeLooseRef(row.serviceName) === normalized
      || normalizeLooseRef(row.url) === normalized
    );
    if (matches.length > 1) {
      throwToolConflict({
        message: `Runtime service reference "${input.runtimeServiceRef}" is ambiguous in this company.`,
        entityType: "runtime_service",
        reference: input.runtimeServiceRef,
        candidates: buildNamedCandidates(matches, {
          id: (row) => row.id,
          label: (row) => row.url ? `${row.serviceName} (${row.url})` : row.serviceName,
          ref: (row) => row.serviceName,
        }),
        hint: "Use the runtime service UUID or narrow the request with a project/workspace reference.",
      });
    }
    const match = matches[0] ?? null;
    if (!match) {
      throwToolNotFound({
        message: `Runtime service "${input.runtimeServiceRef}" was not found in this company.`,
        entityType: "runtime_service",
        reference: input.runtimeServiceRef,
        hint: "Use the exact runtime service ID/name or call get_active_preview first.",
      });
    }
    return match;
  }

  async function resolveRestartPreviewTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
  ): Promise<RestartPreviewTarget> {
    const executionWorkspaceSelector = pickRefSelector(input, "executionWorkspaceId", "executionWorkspaceRef");
    const projectSelector = pickRefSelector(input, "projectId", "projectRef");
    const projectWorkspaceSelector = pickRefSelector(input, "projectWorkspaceId", "projectWorkspaceRef");
    const runtimeServiceSelector = pickRefSelector(input, "runtimeServiceId", "runtimeServiceRef");

    const hasExecutionWorkspaceSelector = Boolean(executionWorkspaceSelector.id || executionWorkspaceSelector.reference);
    const hasProjectSelector = Boolean(projectSelector.id || projectSelector.reference);
    const hasProjectWorkspaceSelector = Boolean(projectWorkspaceSelector.id || projectWorkspaceSelector.reference);
    const hasRuntimeServiceSelector = Boolean(runtimeServiceSelector.id || runtimeServiceSelector.reference);

    if (hasExecutionWorkspaceSelector && (hasProjectSelector || hasProjectWorkspaceSelector)) {
      throwToolBadReference({
        message: "Provide either executionWorkspaceId/executionWorkspaceRef or project/project workspace selectors when restarting a preview runtime.",
        entityType: "runtime_service",
        hint: "Use one target path only: execution workspace or project/project workspace.",
      });
    }

    if (hasExecutionWorkspaceSelector) {
      const executionWorkspace = await resolveExecutionWorkspaceTarget(ctx, input);
      const runtimeService = hasRuntimeServiceSelector
        ? await resolveRuntimeServiceReferenceTarget({
          ctx,
          runtimeServiceId: runtimeServiceSelector.id,
          runtimeServiceRef: runtimeServiceSelector.reference,
          executionWorkspaceId: executionWorkspace.id,
        })
        : null;
      return {
        kind: "execution_workspace",
        executionWorkspaceId: executionWorkspace.id,
        runtimeServiceId: runtimeService?.id ?? null,
      };
    }

    if (hasProjectSelector || hasProjectWorkspaceSelector) {
      const project = hasProjectSelector
        ? await resolveProjectTarget(ctx, input)
        : null;
      const projectWorkspace = hasProjectWorkspaceSelector
        ? await resolveProjectWorkspaceReferenceTarget({
          ctx,
          projectId: project?.id ?? null,
          projectWorkspaceId: projectWorkspaceSelector.id,
          projectWorkspaceRef: projectWorkspaceSelector.reference,
        })
        : null;
      if (project && projectWorkspace && projectWorkspace.projectId !== project.id) {
        throwToolBadReference({
          message: "Provided projectId and projectWorkspace selectors point to different project workspaces.",
          entityType: "project_workspace",
          reference: projectWorkspaceSelector.reference ?? projectWorkspaceSelector.id,
          candidates: [{
            id: projectWorkspace.id,
            label: projectWorkspace.name,
            ref: projectWorkspace.name,
          }],
          hint: "Use a project workspace that belongs to the selected project.",
        });
      }
      const resolvedProjectId = project?.id ?? projectWorkspace?.projectId ?? null;
      if (!resolvedProjectId) {
        throwToolBadReference({
          message: "Project or project workspace reference is required to restart a project preview runtime.",
          entityType: "project",
          hint: "Use the project UUID/name or the project workspace UUID/name.",
        });
      }
      const runtimeService = hasRuntimeServiceSelector
        ? await resolveRuntimeServiceReferenceTarget({
          ctx,
          runtimeServiceId: runtimeServiceSelector.id,
          runtimeServiceRef: runtimeServiceSelector.reference,
          projectId: resolvedProjectId,
          projectWorkspaceId: projectWorkspace?.id ?? null,
        })
        : null;
      return {
        kind: "project_workspace",
        projectId: resolvedProjectId,
        projectWorkspaceId: projectWorkspace?.id ?? null,
        runtimeServiceId: runtimeService?.id ?? null,
      };
    }

    if (hasRuntimeServiceSelector) {
      const runtimeService = await resolveRuntimeServiceReferenceTarget({
        ctx,
        runtimeServiceId: runtimeServiceSelector.id,
        runtimeServiceRef: runtimeServiceSelector.reference,
      });
      if (!runtimeService) {
        throwToolBadReference({
          message: "runtimeServiceId or runtimeServiceRef is required to target a runtime service.",
          entityType: "runtime_service",
          hint: "Use the runtime service UUID, name, or URL.",
        });
      }
      if (runtimeService.executionWorkspaceId) {
        return {
          kind: "execution_workspace",
          executionWorkspaceId: runtimeService.executionWorkspaceId,
          runtimeServiceId: runtimeService.id,
        };
      }
      if (runtimeService.projectId || runtimeService.projectWorkspaceId) {
        const projectWorkspaceRow = runtimeService.projectWorkspaceId
          ? await getProjectWorkspaceRowById(ctx, runtimeService.projectWorkspaceId)
          : null;
        const resolvedProjectId = runtimeService.projectId ?? projectWorkspaceRow?.projectId ?? null;
        if (!resolvedProjectId) {
          throw badRequest("Runtime service is not attached to a project workspace Archie Bravo can resolve");
        }
        return {
          kind: "project_workspace",
          projectId: resolvedProjectId,
          projectWorkspaceId: runtimeService.projectWorkspaceId ?? null,
          runtimeServiceId: runtimeService.id,
        };
      }
      throw badRequest("Runtime service is not attached to a controllable workspace");
    }

    throw badRequest(
      "Need executionWorkspaceId/executionWorkspaceRef, projectId/projectRef, projectWorkspaceId/projectWorkspaceRef, or runtimeServiceId/runtimeServiceRef to restart a preview runtime",
    );
  }

  function resolveRuntimeStatePatch(input: {
    config: Record<string, unknown>;
    currentDesiredState: WorkspaceRuntimeDesiredState | null | undefined;
    currentServiceStates: WorkspaceRuntimeServiceStateMap | null | undefined;
    serviceIndex: number | null;
  }) {
    return buildWorkspaceRuntimeDesiredStatePatch({
      config: { workspaceRuntime: input.config },
      currentDesiredState: input.currentDesiredState ?? null,
      currentServiceStates: input.currentServiceStates,
      action: "restart",
      serviceIndex: input.serviceIndex,
    });
  }

  async function resolveProjectWorkspaceTarget(ctx: HomeToolContext, target: Extract<RestartPreviewTarget, { kind: "project_workspace" }>) {
    const project = await projectSvc.getById(target.projectId);
    if (!project) throw notFound("Project not found");
    if (project.companyId !== ctx.companyId) throw forbidden("Project does not belong to the active company");

    if (target.projectWorkspaceId) {
      const workspace = project.workspaces.find((entry) => entry.id === target.projectWorkspaceId) ?? null;
      if (!workspace) throw notFound("Project workspace not found");
      return { project, workspace };
    }
    const runtimeWorkspaces = project.workspaces.filter(
      (workspace) => workspace.runtimeConfig?.workspaceRuntime && workspace.cwd,
    );
    if (runtimeWorkspaces.length === 1) {
      return { project, workspace: runtimeWorkspaces[0]! };
    }
    if (runtimeWorkspaces.length === 0) {
      throw badRequest("Project has no runtime-configured workspace to restart");
    }
    throw badRequest("Need projectWorkspaceId or runtimeServiceId because this project has multiple runtime workspaces");
  }

  async function restartProjectWorkspaceRuntime(ctx: HomeToolContext, target: Extract<RestartPreviewTarget, { kind: "project_workspace" }>) {
    const { project, workspace } = await resolveProjectWorkspaceTarget(ctx, target);
    const runtimeConfig = workspace.runtimeConfig?.workspaceRuntime ?? null;
    if (!runtimeConfig) {
      throw badRequest("Project workspace has no runtime service configuration");
    }

    const selection = resolveServiceIndexFromRuntimeServiceId({
      config: runtimeConfig,
      runtimeServices: workspace.runtimeServices ?? [],
      runtimeServiceId: target.runtimeServiceId,
      targetLabel: `project workspace "${workspace.name}"`,
    });

    await stopRuntimeServicesForProjectWorkspace({
      db,
      projectWorkspaceId: workspace.id,
      runtimeServiceId: selection.runtimeServiceId,
    });

    const startedServices = await startRuntimeServicesForWorkspaceControl({
      db,
      actor: createWorkspaceControlActor(ctx),
      issue: null,
      workspace: buildProjectWorkspaceRuntimeRef({
        projectId: project.id,
        workspace,
      }),
      config: { workspaceRuntime: runtimeConfig },
      adapterEnv: {},
      serviceIndex: selection.serviceIndex,
    });

    const nextRuntimeState = resolveRuntimeStatePatch({
      config: runtimeConfig,
      currentDesiredState: workspace.runtimeConfig?.desiredState ?? null,
      currentServiceStates: workspace.runtimeConfig?.serviceStates ?? null,
      serviceIndex: selection.serviceIndex,
    });
    await projectSvc.updateWorkspace(project.id, workspace.id, {
      runtimeConfig: {
        desiredState: nextRuntimeState.desiredState,
        serviceStates: nextRuntimeState.serviceStates,
      },
    });

    return {
      content: `Restarted preview runtime for ${describeTarget(`project workspace "${workspace.name}"`, startedServices)}.`,
      data: {
        targetKind: "project_workspace",
        projectId: project.id,
        projectWorkspaceId: workspace.id,
        runtimeServiceId: selection.runtimeServiceId,
        startedServices,
      },
    };
  }

  async function restartExecutionWorkspaceRuntime(ctx: HomeToolContext, target: Extract<RestartPreviewTarget, { kind: "execution_workspace" }>) {
    const workspace = await executionWorkspaces.getById(target.executionWorkspaceId);
    if (!workspace) throw notFound("Execution workspace not found");
    if (workspace.companyId !== ctx.companyId) {
      throw forbidden("Execution workspace does not belong to the active company");
    }

    const project = workspace.projectId ? await projectSvc.getById(workspace.projectId) : null;
    const projectWorkspace = workspace.projectWorkspaceId && project
      ? project.workspaces.find((entry) => entry.id === workspace.projectWorkspaceId) ?? null
      : null;
    const runtimeConfig = workspace.config?.workspaceRuntime ?? projectWorkspace?.runtimeConfig?.workspaceRuntime ?? null;
    if (!runtimeConfig) {
      throw badRequest("Execution workspace has no runtime service configuration");
    }

    const selection = resolveServiceIndexFromRuntimeServiceId({
      config: runtimeConfig,
      runtimeServices: workspace.runtimeServices ?? [],
      runtimeServiceId: target.runtimeServiceId,
      targetLabel: `execution workspace "${workspace.name}"`,
    });

    await stopRuntimeServicesForExecutionWorkspace({
      db,
      executionWorkspaceId: workspace.id,
      workspaceCwd: workspace.cwd,
      runtimeServiceId: selection.runtimeServiceId,
    });

    const realizedWorkspace = await ensurePersistedExecutionWorkspaceAvailable({
      base: {
        baseCwd: projectWorkspace?.cwd ?? workspace.cwd ?? "",
        source: workspace.mode === "shared_workspace" ? "project_primary" : "task_session",
        projectId: workspace.projectId,
        workspaceId: workspace.projectWorkspaceId,
        repoUrl: workspace.repoUrl,
        repoRef: workspace.baseRef,
      },
      workspace: {
        mode: workspace.mode,
        strategyType: workspace.strategyType,
        cwd: workspace.cwd,
        providerRef: workspace.providerRef,
        projectId: workspace.projectId,
        projectWorkspaceId: workspace.projectWorkspaceId,
        repoUrl: workspace.repoUrl,
        baseRef: workspace.baseRef,
        branchName: workspace.branchName,
        config: {
          provisionCommand: workspace.config?.provisionCommand ?? null,
        },
      },
      issue: workspace.sourceIssueId
        ? {
            id: workspace.sourceIssueId,
            identifier: null,
            title: workspace.name,
          }
        : null,
      agent: createWorkspaceControlActor(ctx),
    });
    if (!realizedWorkspace) {
      throw badRequest("Execution workspace needs a local path before Archie Bravo can manage runtime services");
    }

    const startedServices = await startRuntimeServicesForWorkspaceControl({
      db,
      actor: createWorkspaceControlActor(ctx),
      issue: workspace.sourceIssueId
        ? {
            id: workspace.sourceIssueId,
            identifier: null,
            title: workspace.name,
          }
        : null,
      workspace: realizedWorkspace,
      executionWorkspaceId: workspace.id,
      config: { workspaceRuntime: runtimeConfig },
      adapterEnv: {},
      serviceIndex: selection.serviceIndex,
    });

    const nextRuntimeState = resolveRuntimeStatePatch({
      config: runtimeConfig,
      currentDesiredState: workspace.config?.desiredState ?? null,
      currentServiceStates: workspace.config?.serviceStates ?? null,
      serviceIndex: selection.serviceIndex,
    });
    await executionWorkspaces.update(workspace.id, {
      metadata: mergeExecutionWorkspaceConfig(workspace.metadata, {
        desiredState: nextRuntimeState.desiredState,
        serviceStates: nextRuntimeState.serviceStates,
      }),
    });

    return {
      content: `Restarted preview runtime for ${describeTarget(`execution workspace "${workspace.name}"`, startedServices)}.`,
      data: {
        targetKind: "execution_workspace",
        executionWorkspaceId: workspace.id,
        runtimeServiceId: selection.runtimeServiceId,
        startedServices,
      },
    };
  }

  const definitions: HomeToolDefinition[] = [
    {
      name: "get_company_overview",
      displayName: "Get company overview",
      description: "Read the active company profile, dashboard summary, budgets, agents, issues, and current previews.",
      category: "workspace",
      riskLevel: "safe",
      keywords: ["overview", "company", "dashboard", "status", "workspace", "summary", "what is happening"],
      inputSchema: objectSchema({}),
      handler: async (ctx) => {
        const [company, summary, activePreviews] = await Promise.all([
          companiesSvc.getById(ctx.companyId),
          dashboard.summary(ctx.companyId),
          db
            .select()
            .from(workspaceRuntimeServices)
            .where(and(
              eq(workspaceRuntimeServices.companyId, ctx.companyId),
              isNotNull(workspaceRuntimeServices.url),
              or(eq(workspaceRuntimeServices.status, "running"), eq(workspaceRuntimeServices.status, "starting")),
            ))
            .orderBy(desc(workspaceRuntimeServices.updatedAt))
            .limit(10),
        ]);
        if (!company) throw notFound("Company not found");
        return {
          content: `Loaded ${company.name}: ${summary.tasks.open} open tasks, ${summary.agents.active + summary.agents.running} active/running agents, ${summary.pendingApprovals} pending approvals.`,
          data: { company, dashboard: summary, activePreviews },
        };
      },
    },
    {
      name: "list_recent_activity",
      displayName: "List recent activity",
      description: "Read the company journal/activity feed to answer what happened recently.",
      category: "journal",
      riskLevel: "safe",
      keywords: ["journal", "activity", "recent", "what happened", "today", "updates", "history"],
      inputSchema: objectSchema({
        limit: numberProperty("Maximum activity rows to return.", { minimum: 1, maximum: 100 }),
        entityType: stringProperty("Optional entity type filter."),
      }),
      handler: async (ctx, input) => {
        const rows = await activity.list({
          companyId: ctx.companyId,
          limit: Math.min(100, Math.max(1, Math.floor(asNumber(input.limit, 25)))),
          entityType: asString(input.entityType) ?? undefined,
        });
        return { content: summarizeRows(rows, "activity item"), data: rows };
      },
    },
    {
      name: "list_issues",
      displayName: "List agenda items",
      description: "Search and list company agenda items/issues by status, assignee, project, or text query.",
      category: "agenda",
      riskLevel: "safe",
      keywords: ["issue", "task", "agenda", "work item", "todo", "blocked", "search", "list"],
      inputSchema: objectSchema({
        q: stringProperty("Optional text query."),
        status: stringProperty("Optional status filter such as todo, in_progress, blocked, done."),
        assigneeAgentId: stringProperty("Optional agent id."),
        projectId: stringProperty("Optional project id."),
        limit: numberProperty("Maximum issues to return.", { minimum: 1, maximum: 100 }),
      }),
      handler: async (ctx, input) => {
        const rows = await issueSvc.list(ctx.companyId, {
          q: asString(input.q) ?? undefined,
          status: asString(input.status) ?? undefined,
          assigneeAgentId: asString(input.assigneeAgentId) ?? undefined,
          projectId: asString(input.projectId) ?? undefined,
          limit: Math.min(100, Math.max(1, Math.floor(asNumber(input.limit, 50)))),
        });
        return { content: summarizeRows(rows, "agenda item"), data: rows };
      },
    },
    {
      name: "create_issue",
      displayName: "Create agenda item",
      description: "Create a new company agenda item/issue. Project and assignee selectors may use a UUID or a company-local human ref.",
      category: "agenda",
      riskLevel: "low",
      keywords: ["create issue", "new task", "agenda", "todo", "assign work", "make task"],
      inputSchema: objectSchema({
        title: stringProperty("Issue title."),
        description: stringProperty("Optional issue description."),
        priority: stringProperty("Priority: low, medium, high, critical."),
        status: stringProperty("Initial status, usually todo or backlog."),
        assigneeAgentId: stringProperty("Optional agent UUID. If this is not a UUID, Archie treats it as an agent ref."),
        assigneeAgentRef: stringProperty("Optional company-local agent name or urlKey."),
        projectId: stringProperty("Optional project UUID. If this is not a UUID, Archie treats it as a project ref."),
        projectRef: stringProperty("Optional company-local project name or urlKey."),
        labelIds: { type: "array", items: { type: "string" }, description: "Optional label ids." },
      }, ["title"]),
      handler: async (ctx, input) => {
        const title = asString(input.title);
        if (!title) throw badRequest("title is required");
        const assignee = asString(input.assigneeAgentId) || asString(input.assigneeAgentRef)
          ? await resolveAgentTarget(ctx, input, {
            idField: "assigneeAgentId",
            refField: "assigneeAgentRef",
            requiredMessage: "assigneeAgentId or assigneeAgentRef is required when assigning an issue",
          })
          : null;
        const project = asString(input.projectId) || asString(input.projectRef)
          ? await resolveProjectTarget(ctx, input, {
            idField: "projectId",
            refField: "projectRef",
            requiredMessage: "projectId or projectRef is required when assigning an issue to a project",
          })
          : null;
        const issue = await issueSvc.create(ctx.companyId, {
          title,
          description: asString(input.description),
          priority: asString(input.priority) ?? "medium",
          status: asString(input.status) ?? "todo",
          assigneeAgentId: assignee?.id ?? null,
          projectId: project?.id ?? null,
          labelIds: asStringArray(input.labelIds),
          createdByUserId: ctx.ownerUserId,
        });
        await logActivity(db, {
          companyId: ctx.companyId,
          actorType: "user",
          actorId: ctx.ownerUserId,
          agentId: null,
          runId: null,
          action: "home_tool.issue_created",
          entityType: "issue",
          entityId: issue.id,
          details: { tool: "create_issue", title },
        });
        return { content: `Created agenda item ${issue.identifier ?? issue.id}: ${issue.title}.`, data: issue };
      },
    },
    {
      name: "update_issue_status",
      displayName: "Update agenda status",
      description: "Change an issue status or priority. Issue selectors may use a UUID, issue identifier, or exact issue title in the active company.",
      category: "agenda",
      riskLevel: "low",
      keywords: ["update issue", "change status", "mark done", "mark blocked", "priority"],
      inputSchema: objectSchema({
        issueId: stringProperty("Issue UUID. If this is not a UUID, Archie treats it as an issue ref."),
        issueRef: stringProperty("Issue identifier or exact issue title."),
        status: stringProperty("New status."),
        priority: stringProperty("Optional priority."),
        comment: stringProperty("Optional comment to append with the update."),
      }),
      handler: async (ctx, input) => {
        const issue = await resolveIssueTarget(ctx, input);
        const issueId = issue.id;
        const updated = await issueSvc.update(issueId, {
          status: asString(input.status) ?? undefined,
          priority: asString(input.priority) ?? undefined,
          actorUserId: ctx.ownerUserId,
        });
        if (!updated) throw notFound("Issue not found");
        const comment = asString(input.comment);
        if (comment) {
          await issueSvc.addComment(issueId, comment, { userId: ctx.ownerUserId });
        }
        return { content: `Updated agenda item ${updated.identifier ?? updated.id}.`, data: updated };
      },
    },
    {
      name: "list_agents",
      displayName: "List agents",
      description: "List company coordinator/worker agents and their statuses.",
      category: "agents",
      riskLevel: "safe",
      keywords: ["agents", "workers", "coordinator", "roles", "team", "org"],
      inputSchema: objectSchema({
        includeTerminated: booleanProperty("Whether to include terminated agents."),
      }),
      handler: async (ctx, input) => {
        const rows = await agentSvc.list(ctx.companyId, { includeTerminated: input.includeTerminated === true });
        return { content: summarizeRows(rows, "agent"), data: rows };
      },
    },
    {
      name: "pause_agent",
      displayName: "Pause agent",
      description: "Pause an agent in the active company. You may pass the agent UUID or a company-local agent ref.",
      category: "agents",
      riskLevel: "low",
      keywords: ["pause agent", "stop agent", "hold worker", "disable agent"],
      inputSchema: objectSchema({
        agentId: stringProperty("Agent UUID. If this is not a UUID, Archie treats it as an agent ref."),
        agentRef: stringProperty("Company-local agent name or urlKey."),
      }),
      handler: async (ctx, input) => {
        const targetAgent = await resolveAgentTarget(ctx, input);
        const agentId = targetAgent.id;
        const agent = await agentSvc.pause(agentId, "manual");
        if (!agent) throw notFound("Agent not found");
        await logActivity(db, {
          companyId: ctx.companyId,
          actorType: "user",
          actorId: ctx.ownerUserId,
          agentId,
          runId: null,
          action: "home_tool.agent_paused",
          entityType: "agent",
          entityId: agentId,
          details: { tool: "pause_agent" },
        });
        return { content: `Paused ${agent.name}.`, data: agent };
      },
    },
    {
      name: "resume_agent",
      displayName: "Resume agent",
      description: "Resume a paused agent in the active company. You may pass the agent UUID or a company-local agent ref.",
      category: "agents",
      riskLevel: "low",
      keywords: ["resume agent", "unpause agent", "start agent", "reactivate worker"],
      inputSchema: objectSchema({
        agentId: stringProperty("Agent UUID. If this is not a UUID, Archie treats it as an agent ref."),
        agentRef: stringProperty("Company-local agent name or urlKey."),
      }),
      handler: async (ctx, input) => {
        const targetAgent = await resolveAgentTarget(ctx, input);
        const agentId = targetAgent.id;
        const agent = await agentSvc.resume(agentId);
        if (!agent) throw notFound("Agent not found");
        await logActivity(db, {
          companyId: ctx.companyId,
          actorType: "user",
          actorId: ctx.ownerUserId,
          agentId,
          runId: null,
          action: "home_tool.agent_resumed",
          entityType: "agent",
          entityId: agentId,
          details: { tool: "resume_agent" },
        });
        return { content: `Resumed ${agent.name}.`, data: agent };
      },
    },
    {
      name: "list_projects",
      displayName: "List projects",
      description: "List company projects and attached workspaces.",
      category: "projects",
      riskLevel: "safe",
      keywords: ["projects", "workspace", "repo", "codebase", "preview"],
      inputSchema: objectSchema({}),
      handler: async (ctx) => {
        const rows = await projectSvc.list(ctx.companyId);
        return { content: summarizeRows(rows, "project"), data: rows };
      },
    },
    {
      name: "list_execution_workspaces",
      displayName: "List execution workspaces",
      description: "List active execution workspaces and runtime service metadata.",
      category: "projects",
      riskLevel: "safe",
      keywords: ["execution workspace", "runtime", "preview", "worktree", "workspace"],
      inputSchema: objectSchema({
        status: stringProperty("Optional workspace status."),
        issueId: stringProperty("Optional issue id."),
        projectId: stringProperty("Optional project id."),
        summary: booleanProperty("Return summaries only."),
      }),
      handler: async (ctx, input) => {
        const filters = {
          status: asString(input.status) ?? undefined,
          issueId: asString(input.issueId) ?? undefined,
          projectId: asString(input.projectId) ?? undefined,
        };
        const rows = input.summary === true
          ? await executionWorkspaces.listSummaries(ctx.companyId, filters)
          : await executionWorkspaces.list(ctx.companyId, filters);
        return { content: summarizeRows(rows, "execution workspace"), data: rows };
      },
    },
    {
      name: "get_active_preview",
      displayName: "Get active preview",
      description: "Find active preview/runtime URLs for the company.",
      category: "projects",
      riskLevel: "safe",
      keywords: ["preview", "url", "running app", "runtime service", "open app", "live app"],
      inputSchema: objectSchema({}),
      handler: async (ctx) => {
        const rows = await db
          .select()
          .from(workspaceRuntimeServices)
          .where(and(
            eq(workspaceRuntimeServices.companyId, ctx.companyId),
            isNotNull(workspaceRuntimeServices.url),
            ne(workspaceRuntimeServices.status, "stopped"),
          ))
          .orderBy(desc(workspaceRuntimeServices.updatedAt))
          .limit(20);
        return { content: summarizeRows(rows, "active preview/runtime service"), data: rows };
      },
    },
    {
      name: "restart_preview_runtime",
      displayName: "Restart preview runtime",
      description: "Restart a selected project or execution workspace runtime service. Target selectors may use UUIDs or company-local refs.",
      category: "projects",
      riskLevel: "risky",
      keywords: ["restart preview", "restart runtime", "refresh app", "start preview", "stop preview"],
      inputSchema: objectSchema({
        executionWorkspaceId: stringProperty("Execution workspace UUID. If this is not a UUID, Archie treats it as an execution workspace ref."),
        executionWorkspaceRef: stringProperty("Execution workspace name."),
        projectId: stringProperty("Project UUID. If this is not a UUID, Archie treats it as a project ref."),
        projectRef: stringProperty("Company-local project name or urlKey."),
        projectWorkspaceId: stringProperty("Project workspace UUID. If this is not a UUID, Archie treats it as a project workspace ref."),
        projectWorkspaceRef: stringProperty("Project workspace name."),
        runtimeServiceId: stringProperty("Runtime service UUID. If this is not a UUID, Archie treats it as a runtime service ref."),
        runtimeServiceRef: stringProperty("Runtime service name or URL."),
      }),
      handler: async (ctx, input) => {
        const target = await resolveRestartPreviewTarget(ctx, input);
        return target.kind === "execution_workspace"
          ? await restartExecutionWorkspaceRuntime(ctx, target)
          : await restartProjectWorkspaceRuntime(ctx, target);
      },
    },
    {
      name: "list_goals",
      displayName: "List manual/goals",
      description: "List company goals/manual plan rows.",
      category: "manual",
      riskLevel: "safe",
      keywords: ["manual", "goals", "plan", "north star", "mission", "strategy"],
      inputSchema: objectSchema({}),
      handler: async (ctx) => {
        const rows = await goalSvc.list(ctx.companyId);
        return { content: summarizeRows(rows, "goal/manual item"), data: rows };
      },
    },
    {
      name: "create_goal",
      displayName: "Create manual/goal item",
      description: "Create a company goal/manual plan item.",
      category: "manual",
      riskLevel: "low",
      keywords: ["create goal", "manual section", "add plan", "north star"],
      inputSchema: objectSchema({
        title: stringProperty("Goal/manual item title."),
        description: stringProperty("Optional description."),
        level: stringProperty("Goal level, usually company, project, or agent."),
        status: stringProperty("Goal status, usually active."),
      }, ["title"]),
      handler: async (ctx, input) => {
        const title = asString(input.title);
        if (!title) throw badRequest("title is required");
        const goal = await goalSvc.create(ctx.companyId, {
          title,
          description: asString(input.description),
          level: asString(input.level) ?? "company",
          status: asString(input.status) ?? "active",
        });
        await logActivity(db, {
          companyId: ctx.companyId,
          actorType: "user",
          actorId: ctx.ownerUserId,
          agentId: null,
          runId: null,
          action: "home_tool.goal_created",
          entityType: "goal",
          entityId: goal.id,
          details: { tool: "create_goal", title },
        });
        return { content: `Created goal/manual item: ${goal.title}.`, data: goal };
      },
    },
    {
      name: "list_routines",
      displayName: "List routines",
      description: "List company recurring work routines and triggers.",
      category: "routines",
      riskLevel: "safe",
      keywords: ["routines", "cron", "recurring", "schedule", "automation"],
      inputSchema: objectSchema({}),
      handler: async (ctx) => {
        const rows = await routineSvc.list(ctx.companyId);
        return { content: summarizeRows(rows, "routine"), data: rows };
      },
    },
    {
      name: "list_approvals",
      displayName: "List approvals",
      description: "List company approvals, questions, and gated decisions.",
      category: "approvals",
      riskLevel: "safe",
      keywords: ["approvals", "questions", "decisions", "pending", "gated"],
      inputSchema: objectSchema({ status: stringProperty("Optional approval status.") }),
      handler: async (ctx, input) => {
        const rows = await approvalSvc.list(ctx.companyId, asString(input.status) ?? undefined);
        return { content: summarizeRows(rows, "approval"), data: rows };
      },
    },
    {
      name: "get_costs_and_budgets",
      displayName: "Get costs and budgets",
      description: "Read spend summaries, budget overview, by-agent spend, and quota windows.",
      category: "costs",
      riskLevel: "safe",
      keywords: ["cost", "budget", "spend", "burn", "quota", "risk"],
      inputSchema: objectSchema({}),
      handler: async (ctx) => {
        const [summary, byAgent, byProject, overview] = await Promise.all([
          costs.summary(ctx.companyId),
          costs.byAgent(ctx.companyId),
          costs.byProject(ctx.companyId),
          budgets.overview(ctx.companyId),
        ]);
        return {
          content: `Loaded costs: ${summary.spendCents} cents spent, ${summary.utilizationPercent}% utilization.`,
          data: { summary, byAgent, byProject, budgetOverview: overview },
        };
      },
    },
    {
      name: "list_company_skills",
      displayName: "List company skills",
      description: "List reusable company skills available to agents.",
      category: "skills",
      riskLevel: "safe",
      keywords: ["skills", "capabilities", "company skills", "agent skills"],
      inputSchema: objectSchema({}),
      handler: async (ctx) => {
        const rows = await companySkills.list(ctx.companyId);
        return { content: summarizeRows(rows, "company skill"), data: rows };
      },
    },
    {
      name: "list_secret_metadata",
      displayName: "List secret metadata",
      description: "List secret names/providers without revealing decrypted values.",
      category: "secrets",
      riskLevel: "safe",
      keywords: ["secrets", "integrations", "api keys", "env", "credentials"],
      inputSchema: objectSchema({}),
      handler: async (ctx) => {
        const rows = await secrets.list(ctx.companyId);
        return {
          content: summarizeRows(rows, "secret metadata item"),
          data: rows.map((row) => ({
            id: row.id,
            companyId: row.companyId,
            name: row.name,
            provider: row.provider,
            externalRef: row.externalRef,
            description: row.description,
            latestVersion: row.latestVersion,
            createdByUserId: row.createdByUserId,
            createdByAgentId: row.createdByAgentId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            value: "***REDACTED***",
          })),
        };
      },
    },
    {
      name: "update_budget",
      displayName: "Update budget",
      description: "Update company, agent, or project budget settings. Agent and project selectors may use UUIDs or company-local refs.",
      category: "costs",
      riskLevel: "risky",
      keywords: ["update budget", "raise budget", "lower budget", "spend limit"],
      inputSchema: objectSchema({
        scope: stringProperty("company, agent, or project."),
        agentId: stringProperty("Agent UUID for agent budget changes. If this is not a UUID, Archie treats it as an agent ref."),
        agentRef: stringProperty("Company-local agent name or urlKey for agent budget changes."),
        projectId: stringProperty("Project UUID for project budget changes. If this is not a UUID, Archie treats it as a project ref."),
        projectRef: stringProperty("Company-local project name or urlKey for project budget changes."),
        monthlyCents: numberProperty("Monthly budget in cents."),
        warnPercent: numberProperty("Warn percentage, from 1 to 99.", { minimum: 1, maximum: 99 }),
        hardStopEnabled: booleanProperty("Whether budget hard-stop is enabled."),
      }, ["scope", "monthlyCents"]),
      handler: async (ctx, input) => {
        const scope = asString(input.scope);
        const amount = Math.max(0, Math.floor(asNumber(input.monthlyCents, -1)));
        if (amount < 0) throw badRequest("monthlyCents is required");

        let scopeType: BudgetScopeType;
        let scopeId: string;
        if (scope === "company") {
          scopeType = "company";
          scopeId = ctx.companyId;
          await companiesSvc.update(ctx.companyId, { budgetMonthlyCents: amount });
        } else if (scope === "agent") {
          const agent = await resolveAgentTarget(ctx, input, {
            requiredMessage: "agentId or agentRef is required for agent budget updates",
          });
          scopeType = "agent";
          scopeId = agent.id;
          await agentSvc.update(agent.id, { budgetMonthlyCents: amount });
        } else if (scope === "project") {
          const project = await resolveProjectTarget(ctx, input, {
            requiredMessage: "projectId or projectRef is required for project budget updates",
          });
          scopeType = "project";
          scopeId = project.id;
        } else {
          throw badRequest("scope must be company, agent, or project");
        }

        const summary = await budgets.upsertPolicy(
          ctx.companyId,
          {
            scopeType,
            scopeId,
            amount,
            windowKind: scopeType === "project" ? "lifetime" : "calendar_month_utc",
            warnPercent: Math.max(1, Math.min(99, Math.floor(asNumber(input.warnPercent, 80)))),
            hardStopEnabled: input.hardStopEnabled === false ? false : true,
          },
          ctx.ownerUserId,
        );
        return { content: `Updated ${scopeType} budget to ${amount} cents.`, data: summary };
      },
    },
  ];

  const byName = new Map(definitions.map((tool) => [tool.name, tool]));
  const byRegistryKey = new Map<string, HomeToolDefinition>(
    definitions.map((tool) => [`internal.${tool.name}`, tool]),
  );

  function publicDescriptor(tool: HomeToolDefinition): HomeToolDescriptor {
    const { handler: _handler, ...descriptor } = tool;
    return {
      registryKey: `internal.${tool.name}`,
      ...descriptor,
    };
  }

  function createInventoryItem(
    sourceKind: HomeChatToolSourceKind,
    sourceId: string,
    tool: HomeToolDefinition,
  ): HomeToolInventoryItem {
    return {
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
      category: tool.category,
      riskLevel: tool.riskLevel,
      inputSchema: tool.inputSchema,
      sourceKind,
      sourceId,
    };
  }

  function boundedInventoryLimit(limit: number) {
    return Math.max(1, Math.min(TOOL_INVENTORY_LIMIT_MAX, Math.floor(limit)));
  }

  function boundedSelectionLimit(limit: number) {
    return Math.max(1, Math.min(TOOL_SELECTION_LIMIT_MAX, Math.floor(limit)));
  }

  function isCapabilityQuery(query: string) {
    return CAPABILITY_QUERY_PATTERNS.some((pattern) => pattern.test(query));
  }

  function scoreEntry(entry: HomeToolInventoryEntry, query: string) {
    const normalized = query.toLowerCase().trim();
    const terms = normalized.split(/\s+/).filter(Boolean);

    if (terms.length === 0) return 0;

    const name = entry.item.name.toLowerCase();
    const displayName = entry.item.displayName.toLowerCase();
    const description = entry.item.description.toLowerCase();
    const category = entry.item.category.toLowerCase();
    const keywords = entry.keywords.map((keyword) => keyword.toLowerCase());
    const joinedKeywords = keywords.join(" ");

    let score = 0;
    for (const term of terms) {
      if (name === term) score += 10;
      if (displayName === term) score += 10;
      if (name.includes(term)) score += 6;
      if (displayName.includes(term)) score += 5;
      if (keywords.some((keyword) => keyword === term)) score += 4;
      if (joinedKeywords.includes(term)) score += 3;
      if (category.includes(term)) score += 2;
      if (description.includes(term)) score += 1;
    }

    if (name === normalized) score += 12;
    if (displayName === normalized) score += 10;
    if (name.includes(normalized) && normalized.length > 1) score += 6;
    if (displayName.includes(normalized) && normalized.length > 1) score += 5;

    return score;
  }

  function rankInventoryEntries(query: string, category?: string | null) {
    return listInventoryEntries(category)
      .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
      .sort((left, right) =>
        right.score - left.score
        || left.entry.item.riskLevel.localeCompare(right.entry.item.riskLevel)
        || left.entry.item.name.localeCompare(right.entry.item.name));
  }

  const inventoryProviders: HomeToolInventoryProvider[] = [
    {
      sourceKind: "internal",
      sourceId: INTERNAL_HOME_TOOL_SOURCE_ID,
      listEntries: () => definitions.map((tool) => ({
        item: createInventoryItem("internal", INTERNAL_HOME_TOOL_SOURCE_ID, tool),
        keywords: tool.keywords,
      })),
    },
  ];

  function listInventoryEntries(category?: string | null): HomeToolInventoryEntry[] {
    const categoryFilter = category?.trim();
    return inventoryProviders
      .flatMap((provider) => provider.listEntries())
      .filter((entry) => !categoryFilter || entry.item.category === categoryFilter);
  }

  function listInventory(options: {
    category?: string | null;
    limit?: number;
  } = {}): HomeToolInventoryItem[] {
    const limit = boundedInventoryLimit(options.limit ?? TOOL_INVENTORY_LIMIT_MAX);
    return listInventoryEntries(options.category)
      .slice(0, limit)
      .map((entry) => entry.item);
  }

  function searchInventory(query: string, category?: string | null, limit = 8): HomeToolInventoryItem[] {
    return rankInventoryEntries(query, category)
      .filter((entry) => entry.score > 0)
      .slice(0, boundedInventoryLimit(limit))
      .map((entry) => entry.entry.item);
  }

  function listTools(): HomeToolDescriptor[] {
    return definitions.map(publicDescriptor);
  }

  function getTool(name: string): HomeToolDescriptor | null {
    const tool = byName.get(name);
    return tool ? publicDescriptor(tool) : null;
  }

  function getToolByRegistryKey(registryKey: string): HomeToolDescriptor | null {
    const tool = byRegistryKey.get(registryKey);
    return tool ? publicDescriptor(tool) : null;
  }

  function searchTools(query: string, category?: string | null, limit = 8): HomeToolDescriptor[] {
    return searchInventory(query, category, limit)
      .map((item) => byName.get(item.name))
      .filter((tool): tool is HomeToolDefinition => Boolean(tool))
      .map(publicDescriptor);
  }

  function expandSelectionWithCompanions(tools: HomeToolDescriptor[], limit: number) {
    const seen = new Set<string>();
    const expanded: HomeToolDescriptor[] = [];

    const pushTool = (tool: HomeToolDescriptor | undefined | null) => {
      if (!tool || seen.has(tool.name) || expanded.length >= limit) return;
      seen.add(tool.name);
      expanded.push(tool);
    };

    for (const tool of tools) {
      pushTool(tool);
      const companionNames = HOME_TOOL_COMPANIONS[tool.name] ?? [];
      for (const companionName of companionNames) {
        pushTool(getTool(companionName));
      }
      if (expanded.length >= limit) break;
    }

    return expanded;
  }

  function selectTools(query: string, options: {
    category?: string | null;
    limit?: number;
  } = {}): HomeToolSelection {
    const normalized = query.trim();
    const capabilityMode = isCapabilityQuery(normalized);
    const limit = boundedSelectionLimit(options.limit ?? (
      capabilityMode ? CAPABILITY_TOOL_SELECTION_LIMIT : DEFAULT_TOOL_SELECTION_LIMIT
    ));

    const ranked = normalized.length === 0
      ? []
      : rankInventoryEntries(normalized, options.category).filter((entry) => entry.score > 0);

    const fallbackEntries = capabilityMode || ranked.length === 0
      ? listInventoryEntries(options.category)
      : [];

    const selectedNames = new Set<string>();
    const selectedTools: HomeToolDescriptor[] = [];

    for (const rankedEntry of ranked) {
      const tool = byName.get(rankedEntry.entry.item.name);
      if (!tool || selectedNames.has(tool.name)) continue;
      selectedNames.add(tool.name);
      selectedTools.push(publicDescriptor(tool));
      if (selectedTools.length >= limit) break;
    }

      if (selectedTools.length < limit) {
      for (const fallbackEntry of fallbackEntries) {
        const tool = byName.get(fallbackEntry.item.name);
        if (!tool || selectedNames.has(tool.name)) continue;
        selectedNames.add(tool.name);
        selectedTools.push(publicDescriptor(tool));
        if (selectedTools.length >= limit) break;
      }
    }

    const expandedTools = expandSelectionWithCompanions(selectedTools, limit);

    if (expandedTools.length < limit) {
      for (const fallbackEntry of fallbackEntries) {
        const tool = byName.get(fallbackEntry.item.name);
        if (!tool) continue;
        const descriptor = publicDescriptor(tool);
        if (expandedTools.some((entry) => entry.name === descriptor.name)) continue;
        expandedTools.push(descriptor);
        if (expandedTools.length >= limit) break;
      }
    }

    return {
      query,
      isCapabilityQuery: capabilityMode,
      limit,
      tools: expandedTools,
    };
  }

  async function executeTool(input: {
    ctx: HomeToolContext;
    name: string;
    parameters: unknown;
    toolCallId?: string;
  }): Promise<HomeToolExecution> {
    const tool = byName.get(input.name);
    if (!tool) throw badRequest(`Unknown Home tool: ${input.name}`);

    const parameters = asRecord(input.parameters);
    const toolCallId = input.toolCallId ?? randomUUID();

    const result = await tool.handler(input.ctx, parameters);
    if (tool.riskLevel !== "safe") {
      await logActivity(db, {
        companyId: input.ctx.companyId,
        actorType: "user",
        actorId: input.ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.executed",
        entityType: "home_chat_thread",
        entityId: input.ctx.threadId,
        details: {
          tool: tool.name,
          riskLevel: tool.riskLevel,
        },
      });
    }
    return {
      toolCallId,
      descriptor: publicDescriptor(tool),
      input: parameters,
      status: "completed",
      content: result.content,
      data: result.data,
    };
  }

  async function searchCompanyState(ctx: HomeToolContext, query: string, limit = 10) {
    const q = query.trim();
    if (!q) return { issues: [], agents: [] };
    const boundedLimit = Math.max(1, Math.min(25, Math.floor(limit)));
    const [issueRows, agentRows] = await Promise.all([
      db
        .select()
        .from(issues)
        .where(and(
          eq(issues.companyId, ctx.companyId),
          or(ilike(issues.title, `%${q}%`), ilike(issues.description, `%${q}%`)),
        ))
        .limit(boundedLimit),
      db
        .select()
        .from(agents)
        .where(and(
          eq(agents.companyId, ctx.companyId),
          or(ilike(agents.name, `%${q}%`), ilike(agents.role, `%${q}%`), ilike(agents.capabilities, `%${q}%`)),
        ))
        .limit(boundedLimit),
    ]);
    return { issues: issueRows, agents: agentRows };
  }

  return {
    listInventory,
    searchInventory,
    listTools,
    getTool,
    getToolByRegistryKey,
    searchTools,
    selectTools,
    executeTool,
    searchCompanyState,
  };
}
