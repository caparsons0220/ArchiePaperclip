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
  type HomeChatToolInventoryItem,
  type HomeChatToolSourceKind,
  type BudgetScopeType,
  type ProjectWorkspace,
  type WorkspaceRuntimeDesiredState,
  type WorkspaceRuntimeService,
  type WorkspaceRuntimeServiceStateMap,
} from "@paperclipai/shared";
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
import { badRequest, forbidden, notFound } from "../errors.js";

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
  name: string;
  displayName: string;
  description: string;
  category: HomeToolCategory;
  riskLevel: HomeToolRiskLevel;
  inputSchema: Record<string, unknown>;
  keywords: string[];
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

interface HomeToolDefinition extends HomeToolDescriptor {
  handler: (ctx: HomeToolContext, input: Record<string, unknown>) => Promise<{ content: string; data?: unknown }>;
}

interface HomeToolInventoryEntry {
  item: HomeChatToolInventoryItem;
  keywords: string[];
}

interface HomeToolInventoryProvider {
  sourceKind: HomeChatToolSourceKind;
  sourceId: string;
  listEntries: () => HomeToolInventoryEntry[];
}

const INTERNAL_HOME_TOOL_SOURCE_ID = "paperclip.home.internal";

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

  async function getProjectWorkspaceRowById(ctx: HomeToolContext, projectWorkspaceId: string) {
    return await db
      .select({
        id: projectWorkspaces.id,
        companyId: projectWorkspaces.companyId,
        projectId: projectWorkspaces.projectId,
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

  async function resolveRestartPreviewTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
  ): Promise<RestartPreviewTarget> {
    const executionWorkspaceId = asString(input.executionWorkspaceId);
    const projectId = asString(input.projectId);
    const projectWorkspaceId = asString(input.projectWorkspaceId);
    const runtimeServiceId = asString(input.runtimeServiceId);

    if (executionWorkspaceId && (projectId || projectWorkspaceId)) {
      throw badRequest("Provide either executionWorkspaceId or projectId/projectWorkspaceId when restarting a preview runtime");
    }

    if (executionWorkspaceId) {
      return {
        kind: "execution_workspace",
        executionWorkspaceId,
        runtimeServiceId,
      };
    }

    if (projectId || projectWorkspaceId) {
      const projectWorkspaceRow = projectWorkspaceId
        ? await getProjectWorkspaceRowById(ctx, projectWorkspaceId)
        : null;
      if (projectWorkspaceId && !projectWorkspaceRow) {
        throw notFound("Project workspace not found");
      }
      return {
        kind: "project_workspace",
        projectId: projectId ?? projectWorkspaceRow!.projectId,
        projectWorkspaceId,
        runtimeServiceId,
      };
    }

    if (runtimeServiceId) {
      const runtimeService = await db
        .select({
          id: workspaceRuntimeServices.id,
          companyId: workspaceRuntimeServices.companyId,
          projectId: workspaceRuntimeServices.projectId,
          projectWorkspaceId: workspaceRuntimeServices.projectWorkspaceId,
          executionWorkspaceId: workspaceRuntimeServices.executionWorkspaceId,
        })
        .from(workspaceRuntimeServices)
        .where(
          and(
            eq(workspaceRuntimeServices.id, runtimeServiceId),
            eq(workspaceRuntimeServices.companyId, ctx.companyId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!runtimeService) {
        throw notFound("Runtime service not found");
      }
      if (runtimeService.executionWorkspaceId) {
        return {
          kind: "execution_workspace",
          executionWorkspaceId: runtimeService.executionWorkspaceId,
          runtimeServiceId,
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
          runtimeServiceId,
        };
      }
      throw badRequest("Runtime service is not attached to a controllable workspace");
    }

    throw badRequest(
      "Need executionWorkspaceId, projectId, projectWorkspaceId, or runtimeServiceId to restart a preview runtime",
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
      description: "Create a new company agenda item/issue.",
      category: "agenda",
      riskLevel: "low",
      keywords: ["create issue", "new task", "agenda", "todo", "assign work", "make task"],
      inputSchema: objectSchema({
        title: stringProperty("Issue title."),
        description: stringProperty("Optional issue description."),
        priority: stringProperty("Priority: low, medium, high, critical."),
        status: stringProperty("Initial status, usually todo or backlog."),
        assigneeAgentId: stringProperty("Optional agent id to assign."),
        projectId: stringProperty("Optional project id."),
        labelIds: { type: "array", items: { type: "string" }, description: "Optional label ids." },
      }, ["title"]),
      handler: async (ctx, input) => {
        const title = asString(input.title);
        if (!title) throw badRequest("title is required");
        const issue = await issueSvc.create(ctx.companyId, {
          title,
          description: asString(input.description),
          priority: asString(input.priority) ?? "medium",
          status: asString(input.status) ?? "todo",
          assigneeAgentId: asString(input.assigneeAgentId),
          projectId: asString(input.projectId),
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
      description: "Change an issue status or priority.",
      category: "agenda",
      riskLevel: "low",
      keywords: ["update issue", "change status", "mark done", "mark blocked", "priority"],
      inputSchema: objectSchema({
        issueId: stringProperty("Issue id."),
        status: stringProperty("New status."),
        priority: stringProperty("Optional priority."),
        comment: stringProperty("Optional comment to append with the update."),
      }, ["issueId"]),
      handler: async (ctx, input) => {
        const issueId = asString(input.issueId);
        if (!issueId) throw badRequest("issueId is required");
        await assertCompanyEntityAccess(ctx, "issue", issueId);
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
      description: "Pause an agent in the active company.",
      category: "agents",
      riskLevel: "low",
      keywords: ["pause agent", "stop agent", "hold worker", "disable agent"],
      inputSchema: objectSchema({ agentId: stringProperty("Agent id.") }, ["agentId"]),
      handler: async (ctx, input) => {
        const agentId = asString(input.agentId);
        if (!agentId) throw badRequest("agentId is required");
        await assertCompanyEntityAccess(ctx, "agent", agentId);
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
      description: "Resume a paused agent in the active company.",
      category: "agents",
      riskLevel: "low",
      keywords: ["resume agent", "unpause agent", "start agent", "reactivate worker"],
      inputSchema: objectSchema({ agentId: stringProperty("Agent id.") }, ["agentId"]),
      handler: async (ctx, input) => {
        const agentId = asString(input.agentId);
        if (!agentId) throw badRequest("agentId is required");
        await assertCompanyEntityAccess(ctx, "agent", agentId);
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
      description: "Restart a selected project or execution workspace runtime service.",
      category: "projects",
      riskLevel: "risky",
      keywords: ["restart preview", "restart runtime", "refresh app", "start preview", "stop preview"],
      inputSchema: objectSchema({
        executionWorkspaceId: stringProperty("Execution workspace id when restarting an execution workspace runtime."),
        projectId: stringProperty("Project id when restarting a project workspace runtime."),
        projectWorkspaceId: stringProperty("Project workspace id when restarting a project workspace runtime."),
        runtimeServiceId: stringProperty("Optional runtime service id."),
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
      description: "Update company or agent budget settings.",
      category: "costs",
      riskLevel: "risky",
      keywords: ["update budget", "raise budget", "lower budget", "spend limit"],
      inputSchema: objectSchema({
        scope: stringProperty("company, agent, or project."),
        agentId: stringProperty("Agent id for agent budget changes."),
        projectId: stringProperty("Project id for project budget changes."),
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
          const agentId = asString(input.agentId);
          if (!agentId) throw badRequest("agentId is required for agent budget updates");
          const agent = await assertCompanyEntityAccess(ctx, "agent", agentId);
          scopeType = "agent";
          scopeId = agent.id;
          await agentSvc.update(agent.id, { budgetMonthlyCents: amount });
        } else if (scope === "project") {
          const projectId = asString(input.projectId);
          if (!projectId) throw badRequest("projectId is required for project budget updates");
          const project = await projectSvc.getById(projectId);
          if (!project) throw notFound("Project not found");
          if (project.companyId !== ctx.companyId) throw forbidden("Project does not belong to the active company");
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
    {
      name: "list_plugin_tools",
      displayName: "List plugin tools",
      description: "List already-installed plugin tools that may be available for the company.",
      category: "plugins",
      riskLevel: "safe",
      keywords: ["plugins", "integrations", "external tools", "tool registry"],
      inputSchema: objectSchema({}),
      handler: async () => ({
        content: "Installed plugin tool discovery is handled by the plugin tool dispatcher. Home AI will only execute plugin tools through company-scoped wrappers.",
        data: { availableThroughPluginDispatcher: true },
      }),
    },
  ];

  const byName = new Map(definitions.map((tool) => [tool.name, tool]));

  function publicDescriptor(tool: HomeToolDefinition): HomeToolDescriptor {
    const { handler: _handler, ...descriptor } = tool;
    return descriptor;
  }

  function createInventoryItem(
    sourceKind: HomeChatToolSourceKind,
    sourceId: string,
    tool: HomeToolDefinition,
  ): HomeChatToolInventoryItem {
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

  function boundedLimit(limit: number) {
    return Math.max(1, Math.min(25, Math.floor(limit)));
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
  } = {}): HomeChatToolInventoryItem[] {
    const limit = boundedLimit(options.limit ?? 25);
    return listInventoryEntries(options.category)
      .slice(0, limit)
      .map((entry) => entry.item);
  }

  function searchInventory(query: string, category?: string | null, limit = 8): HomeChatToolInventoryItem[] {
    const normalized = query.toLowerCase().trim();
    const terms = normalized.split(/\s+/).filter(Boolean);
    return listInventoryEntries(category)
      .map((entry) => {
        const haystack = [
          entry.item.name,
          entry.item.displayName,
          entry.item.description,
          entry.item.category,
          ...entry.keywords,
        ].join(" ").toLowerCase();
        const score = terms.length === 0
          ? 1
          : terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { entry, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.entry.item.name.localeCompare(right.entry.item.name))
      .slice(0, boundedLimit(limit))
      .map((entry) => entry.entry.item);
  }

  function listTools(): HomeToolDescriptor[] {
    return definitions.map(publicDescriptor);
  }

  function getTool(name: string): HomeToolDescriptor | null {
    const tool = byName.get(name);
    return tool ? publicDescriptor(tool) : null;
  }

  function searchTools(query: string, category?: string | null, limit = 8): HomeToolDescriptor[] {
    return searchInventory(query, category, limit)
      .map((item) => byName.get(item.name))
      .filter((tool): tool is HomeToolDefinition => Boolean(tool))
      .map(publicDescriptor);
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
    searchTools,
    executeTool,
    searchCompanyState,
  };
}
