import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, ilike, isNotNull, ne, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  companies,
  issues,
  workspaceRuntimeServices,
} from "@paperclipai/db";
import {
  type BudgetScopeType,
} from "@paperclipai/shared";
import { activityService } from "./activity.js";
import { agentService } from "./agents.js";
import { approvalService } from "./approvals.js";
import { budgetService } from "./budgets.js";
import { companyService } from "./companies.js";
import { companySkillService } from "./company-skills.js";
import { costService } from "./costs.js";
import { dashboardService } from "./dashboard.js";
import { executionWorkspaceService } from "./execution-workspaces.js";
import { goalService } from "./goals.js";
import { issueService } from "./issues.js";
import { projectService } from "./projects.js";
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
  requiresConfirmation: boolean;
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
  status: "completed" | "confirmation_required";
  content: string;
  data?: unknown;
  confirmationId?: string;
}

interface HomeToolDefinition extends HomeToolDescriptor {
  handler: (ctx: HomeToolContext, input: Record<string, unknown>) => Promise<{ content: string; data?: unknown }>;
}

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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createHomeToolConfirmationId(ctx: HomeToolContext, toolName: string, input: Record<string, unknown>) {
  return createHash("sha256")
    .update("paperclip-home-tool-confirmation:v1\n")
    .update(ctx.companyId)
    .update("\n")
    .update(ctx.ownerUserId)
    .update("\n")
    .update(ctx.threadId)
    .update("\n")
    .update(toolName)
    .update("\n")
    .update(stableStringify(input))
    .digest("hex")
    .slice(0, 32);
}

function summarizeRows(rows: unknown[], noun: string) {
  return `Found ${rows.length} ${noun}${rows.length === 1 ? "" : "s"}.`;
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

  const definitions: HomeToolDefinition[] = [
    {
      name: "get_company_overview",
      displayName: "Get company overview",
      description: "Read the active company profile, dashboard summary, budgets, agents, issues, and current previews.",
      category: "workspace",
      riskLevel: "safe",
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: true,
      keywords: ["restart preview", "restart runtime", "refresh app", "start preview", "stop preview"],
      inputSchema: objectSchema({
        executionWorkspaceId: stringProperty("Execution workspace id when restarting an execution workspace runtime."),
        projectId: stringProperty("Project id when restarting a project workspace runtime."),
        projectWorkspaceId: stringProperty("Project workspace id when restarting a project workspace runtime."),
        runtimeServiceId: stringProperty("Optional runtime service id."),
      }),
      handler: async () => ({
        content: "Runtime restart confirmation was accepted. This tool is currently limited to routing intent; use the preview controls for the exact restart action until runtime target binding is fully automated.",
      }),
    },
    {
      name: "list_goals",
      displayName: "List manual/goals",
      description: "List company goals/manual plan rows.",
      category: "manual",
      riskLevel: "safe",
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: false,
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
      requiresConfirmation: true,
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
      requiresConfirmation: false,
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

  function listTools(): HomeToolDescriptor[] {
    return definitions.map(publicDescriptor);
  }

  function getTool(name: string): HomeToolDescriptor | null {
    const tool = byName.get(name);
    return tool ? publicDescriptor(tool) : null;
  }

  function searchTools(query: string, category?: string | null, limit = 8): HomeToolDescriptor[] {
    const normalized = query.toLowerCase().trim();
    const categoryFilter = category?.trim();
    const scored = definitions
      .filter((tool) => !categoryFilter || tool.category === categoryFilter)
      .map((tool) => {
        const haystack = [
          tool.name,
          tool.displayName,
          tool.description,
          tool.category,
          ...tool.keywords,
        ].join(" ").toLowerCase();
        const terms = normalized.split(/\s+/).filter(Boolean);
        const score = terms.length === 0
          ? 1
          : terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { tool, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.tool.name.localeCompare(right.tool.name))
      .slice(0, Math.max(1, Math.min(25, Math.floor(limit))));
    return scored.map((entry) => publicDescriptor(entry.tool));
  }

  async function executeTool(input: {
    ctx: HomeToolContext;
    name: string;
    parameters: unknown;
    confirmed?: { name: string; input: Record<string, unknown>; confirmationId: string } | null;
    toolCallId?: string;
  }): Promise<HomeToolExecution> {
    const tool = byName.get(input.name);
    if (!tool) throw badRequest(`Unknown Home tool: ${input.name}`);

    const parameters = asRecord(input.parameters);
    const toolCallId = input.toolCallId ?? randomUUID();
    const confirmationId = createHomeToolConfirmationId(input.ctx, tool.name, parameters);

    if (tool.requiresConfirmation) {
      const confirmed = input.confirmed;
      const matchesConfirmation =
        confirmed?.name === tool.name
        && confirmed.confirmationId === confirmationId
        && stableStringify(confirmed.input) === stableStringify(parameters);
      if (!matchesConfirmation) {
        return {
          toolCallId,
          descriptor: publicDescriptor(tool),
          input: parameters,
          status: "confirmation_required",
          content: `Confirmation required before running ${tool.displayName}.`,
          confirmationId,
        };
      }
    }

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
          requiresConfirmation: tool.requiresConfirmation,
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
    listTools,
    getTool,
    searchTools,
    executeTool,
    searchCompanyState,
  };
}
