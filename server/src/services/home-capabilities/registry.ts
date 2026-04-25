import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { and, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  activityLog,
  agents,
  authUsers,
  companyMemberships,
  costEvents,
  companies,
  heartbeatRuns,
  invites,
  issueComments,
  issues,
  joinRequests,
  principalPermissionGrants,
  projectWorkspaces,
  workspaceRuntimeServices,
  assets,
} from "@paperclipai/db";
import {
  type HomeChatToolSourceKind,
  type BudgetScopeType,
  DEFAULT_FEEDBACK_DATA_SHARING_TERMS_VERSION,
  type PermissionKey,
  type ProjectWorkspace,
  type WorkspaceRuntimeDesiredState,
  type WorkspaceRuntimeService,
  type WorkspaceRuntimeServiceStateMap,
  createAssetImageMetadataSchema,
  getClosedIsolatedExecutionWorkspaceMessage,
  isClosedIsolatedExecutionWorkspace,
  isUuidLike,
  normalizeAgentUrlKey,
  normalizeProjectUrlKey,
  updateCompanyBrandingSchema,
  updateCompanySchema,
} from "@paperclipai/shared";
import type { HomeChatToolFailureData } from "@paperclipai/shared/home-chat";
import { activityService } from "../activity.js";
import { accessService } from "../access.js";
import { agentService } from "../agents.js";
import { approvalService } from "../approvals.js";
import { assetService } from "../assets.js";
import { budgetService } from "../budgets.js";
import { companyService } from "../companies.js";
import { companySkillService } from "../company-skills.js";
import { costService } from "../costs.js";
import { dashboardService } from "../dashboard.js";
import { documentService } from "../documents.js";
import {
  executionWorkspaceService,
  mergeExecutionWorkspaceConfig,
} from "../execution-workspaces.js";
import { financeService } from "../finance.js";
import { goalService } from "../goals.js";
import { heartbeatService } from "../heartbeat.js";
import {
  HOME_ACTION_CATALOG,
  type HomeActionCatalogEntry,
} from "./action-catalog.js";
import { issueApprovalService } from "../issue-approvals.js";
import { issueService } from "../issues.js";
import { projectService } from "../projects.js";
import {
  buildWorkspaceRuntimeDesiredStatePatch,
  ensurePersistedExecutionWorkspaceAvailable,
  listConfiguredRuntimeServiceEntries,
  startRuntimeServicesForWorkspaceControl,
  stopRuntimeServicesForExecutionWorkspace,
  stopRuntimeServicesForProjectWorkspace,
} from "../workspace-runtime.js";
import { routineService } from "../routines.js";
import { secretService } from "../secrets.js";
import { sidebarBadgeService } from "../sidebar-badges.js";
import { sidebarPreferenceService } from "../sidebar-preferences.js";
import { workProductService } from "../work-products.js";
import { workspaceOperationService } from "../workspace-operations.js";
import { logActivity } from "../activity-log.js";
import { grantsForHumanRole, resolveHumanInviteRole } from "../company-member-roles.js";
import { agentJoinGrantsFromDefaults, humanJoinGrantsFromDefaults } from "../invite-grants.js";
import { notifyHireApproved } from "../hire-hook.js";
import { fetchAllQuotaWindows } from "../quota-windows.js";
import { deduplicateAgentName } from "../agents.js";
import { collapseDuplicatePendingHumanJoinRequests } from "../../lib/join-request-dedupe.js";
import { getStorageService } from "../../storage/index.js";
import { isAllowedContentType, MAX_ATTACHMENT_BYTES, SVG_CONTENT_TYPE } from "../../attachment-types.js";
import { badRequest, conflict, forbidden, notFound } from "../../errors.js";
import { redactEventPayload } from "../../redaction.js";
import { shouldWakeAssigneeOnCheckout } from "../../routes/issues-checkout-wakeup.js";

export type HomeToolRiskLevel = "safe" | "low" | "risky";
export type HomeCapabilityRiskLevel = HomeToolRiskLevel;

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
export type HomeCapabilityCategory = HomeToolCategory;

export interface HomeToolDescriptor extends HomeActionCatalogEntry {}
export interface HomeActionDescriptor extends HomeToolDescriptor {}

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
export interface HomeActionInventoryItem extends HomeToolInventoryItem {}

export interface HomeToolSelection {
  query: string;
  isCapabilityQuery: boolean;
  limit: number;
  tools: HomeToolDescriptor[];
}
export interface HomeActionSelection extends HomeToolSelection {}

export interface HomeToolContext {
  companyId: string;
  ownerUserId: string;
  threadId: string;
}
export interface HomeActionContext extends HomeToolContext {}

export interface HomeToolExecution {
  toolCallId: string;
  descriptor: HomeToolDescriptor;
  input: Record<string, unknown>;
  status: "completed";
  content: string;
  data?: unknown;
}
export interface HomeActionExecution extends HomeToolExecution {}

export interface HomeCapabilityRegistryOptions {
  heartbeat?: ReturnType<typeof heartbeatService>;
  heartbeatOptions?: Parameters<typeof heartbeatService>[1];
}

interface HomeToolDefinition extends HomeToolDescriptor {
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

const HOME_CAPABILITY_SOURCE_ID = "paperclip.home.capabilities";
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
const AGENT_WAKEUP_SOURCES = ["timer", "assignment", "on_demand", "automation"] as const;
const AGENT_WAKEUP_TRIGGER_DETAILS = ["manual", "ping", "callback", "system"] as const;
const INVITE_TOKEN_PREFIX = "pcp_invite_" as const;
const INVITE_TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const INVITE_TOKEN_SUFFIX_LENGTH = 8;
const INVITE_TOKEN_MAX_RETRIES = 5;
const COMPANY_INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const ALLOWED_COMPANY_LOGO_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  SVG_CONTENT_TYPE,
]);
const USER_PROFILE_WINDOWS = [
  { key: "last7", label: "Last 7 days", days: 7 },
  { key: "last30", label: "Last 30 days", days: 30 },
  { key: "all", label: "All time", days: null },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return asString(value);
}

function asOptionalString(value: unknown): string | undefined {
  return asString(value) ?? undefined;
}

function asOptionalRecordInput(
  value: unknown,
  fieldName: string,
): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw badRequest(`${fieldName} must be an object`);
}

function asEnumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fieldName: string,
  fallback: T[number],
): T[number] {
  if (value == null) return fallback;
  if (typeof value !== "string") {
    throw badRequest(`${fieldName} must be one of: ${allowed.join(", ")}`);
  }
  const trimmed = value.trim();
  if ((allowed as readonly string[]).includes(trimmed)) {
    return trimmed as T[number];
  }
  throw badRequest(`${fieldName} must be one of: ${allowed.join(", ")}`);
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

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  throw badRequest("Expected a boolean value");
}

function asOrderedUuidArray(value: unknown, fieldName: string) {
  const orderedIds = asStringArray(value).map((item) => item.trim()).filter((item) => item.length > 0);
  if (!Array.isArray(value)) {
    throw badRequest(`${fieldName} must be an array of UUIDs`);
  }
  if (orderedIds.some((item) => !isUuidLike(item))) {
    throw badRequest(`${fieldName} must contain UUIDs only`);
  }
  return [...new Set(orderedIds)];
}

function decodeBase64Bytes(value: string, fieldName: string) {
  const normalized = value.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!normalized) {
    throw badRequest(`${fieldName} must be non-empty base64 content`);
  }
  try {
    const buffer = Buffer.from(normalized, "base64");
    if (buffer.length === 0) {
      throw new Error("empty");
    }
    return buffer;
  } catch {
    throw badRequest(`${fieldName} must be valid base64 content`);
  }
}

function asDate(value: unknown, fieldName: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw badRequest(`${fieldName} must be a valid date`);
}

function asOptionalDate(value: unknown, fieldName: string): Date | undefined {
  if (value == null || value === "") return undefined;
  return asDate(value, fieldName);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createInviteToken() {
  const bytes = randomBytes(INVITE_TOKEN_SUFFIX_LENGTH);
  let suffix = "";
  for (let idx = 0; idx < INVITE_TOKEN_SUFFIX_LENGTH; idx += 1) {
    suffix += INVITE_TOKEN_ALPHABET[bytes[idx]! % INVITE_TOKEN_ALPHABET.length];
  }
  return `${INVITE_TOKEN_PREFIX}${suffix}`;
}

function companyInviteExpiresAt(nowMs = Date.now()) {
  return new Date(nowMs + COMPANY_INVITE_TTL_MS);
}

function mergeInviteDefaults(
  defaultsPayload: Record<string, unknown> | null | undefined,
  agentMessage: string | null,
  humanRole: "owner" | "admin" | "operator" | "viewer" | null = null,
) {
  const merged = defaultsPayload ? { ...defaultsPayload } : {};
  if (humanRole) {
    const existingHuman =
      typeof merged.human === "object" && merged.human !== null && !Array.isArray(merged.human)
        ? { ...(merged.human as Record<string, unknown>) }
        : {};
    merged.human = {
      ...existingHuman,
      role: humanRole,
      grants: grantsForHumanRole(humanRole),
    };
  }
  if (agentMessage) {
    merged.agentMessage = agentMessage;
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

function redactSecretRow<T extends {
  id: string;
  companyId: string;
  name: string;
  provider: string;
  externalRef: string | null;
  description: string | null;
  latestVersion: number;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}>(row: T) {
  return {
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
  };
}

function redactApprovalPayload<T extends { payload: Record<string, unknown> }>(approval: T): T {
  return {
    ...approval,
    payload: redactEventPayload(approval.payload) ?? {},
  };
}

function toUserProfile(
  user: {
    id: string;
    email: string | null;
    name: string | null;
    image?: string | null;
  } | null | undefined,
) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
  };
}

function toCompanyAssetMetadata(
  asset: typeof assets.$inferSelect,
  options: {
    isCompanyLogo?: boolean;
  } = {},
) {
  return {
    ...asset,
    contentPath: `/api/assets/${asset.id}/content`,
    isCompanyLogo: options.isCompanyLogo ?? false,
  };
}

function slugifyUserPart(value: string | null | undefined) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

function userSlugCandidates(row: {
  principalId: string;
  user: {
    email: string | null;
    name: string | null;
  } | null;
}) {
  const candidates = new Set<string>();
  const add = (value: string | null | undefined) => {
    const slug = slugifyUserPart(value);
    if (slug) candidates.add(slug);
  };
  add(row.user?.name);
  add(row.user?.email?.split("@")[0]);
  add(row.user?.email);
  add(row.principalId);
  return [...candidates];
}

function userIssueInvolvementSql(companyId: string, userId: string) {
  return sql<boolean>`
    (
      ${issues.createdByUserId} = ${userId}
      OR ${issues.assigneeUserId} = ${userId}
      OR EXISTS (
        SELECT 1
        FROM ${issueComments}
        WHERE ${issueComments.companyId} = ${companyId}
          AND ${issueComments.issueId} = ${issues.id}
          AND ${issueComments.authorUserId} = ${userId}
      )
    )
  `;
}

function windowStart(days: number | null) {
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDay(date: Date) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function dayKeyExpr(dateSql: ReturnType<typeof sql>) {
  return sql<string>`to_char(date_trunc('day', ${dateSql}), 'YYYY-MM-DD')`;
}

function sumCostNumber(
  column: typeof costEvents.costCents | typeof costEvents.inputTokens | typeof costEvents.cachedInputTokens | typeof costEvents.outputTokens,
) {
  return sql<number>`coalesce(sum(${column}), 0)::double precision`;
}

async function loadUsersById(db: Db, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, ReturnType<typeof toUserProfile>>();
  const rows = await db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      name: authUsers.name,
      image: authUsers.image,
    })
    .from(authUsers)
    .where(inArray(authUsers.id, userIds));
  return new Map(rows.map((row) => [row.id, toUserProfile(row)]));
}

function inviteExpired(invite: typeof invites.$inferSelect) {
  return invite.expiresAt.getTime() <= Date.now();
}

function inviteState(invite: typeof invites.$inferSelect) {
  if (invite.revokedAt) return "revoked" as const;
  if (invite.acceptedAt) return "accepted" as const;
  if (inviteExpired(invite)) return "expired" as const;
  return "active" as const;
}

function extractInviteMessage(invite: typeof invites.$inferSelect): string | null {
  const rawDefaults = invite.defaultsPayload;
  if (!rawDefaults || typeof rawDefaults !== "object" || Array.isArray(rawDefaults)) {
    return null;
  }
  const rawMessage = (rawDefaults as Record<string, unknown>).agentMessage;
  if (typeof rawMessage !== "string") {
    return null;
  }
  const trimmed = rawMessage.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractInviteHumanRole(invite: typeof invites.$inferSelect) {
  if (invite.allowedJoinTypes === "agent") return null;
  return resolveHumanInviteRole(invite.defaultsPayload as Record<string, unknown> | null | undefined);
}

function inviteStateWhereClause(state: "active" | "accepted" | "expired" | "revoked" | undefined) {
  const now = new Date();
  switch (state) {
    case "active":
      return and(
        isNull(invites.revokedAt),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, now),
      );
    case "accepted":
      return isNotNull(invites.acceptedAt);
    case "expired":
      return and(
        isNull(invites.revokedAt),
        isNull(invites.acceptedAt),
        lte(invites.expiresAt, now),
      );
    case "revoked":
      return isNotNull(invites.revokedAt);
    default:
      return undefined;
  }
}

function isInviteTokenHashCollisionError(error: unknown) {
  const candidates = [
    error,
    (error as { cause?: unknown } | null)?.cause ?? null,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const code = "code" in candidate && typeof candidate.code === "string" ? candidate.code : null;
    const constraint = "constraint" in candidate && typeof candidate.constraint === "string"
      ? candidate.constraint
      : null;
    const message = "message" in candidate && typeof candidate.message === "string"
      ? candidate.message
      : "";
    if (code !== "23505") continue;
    if (constraint === "invites_token_hash_unique_idx") return true;
    if (message.includes("invites_token_hash_unique_idx")) return true;
  }
  return false;
}

function resolveJoinRequestAgentManagerId(
  candidates: Array<{ id: string; role: string; reportsTo: string | null }>,
): string | null {
  const ceoCandidates = candidates.filter((candidate) => candidate.role === "ceo");
  if (ceoCandidates.length === 0) return null;
  const rootCeo = ceoCandidates.find((candidate) => candidate.reportsTo === null);
  return (rootCeo ?? ceoCandidates[0] ?? null)?.id ?? null;
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

export function createHomeCapabilityRegistry(db: Db, options: HomeCapabilityRegistryOptions = {}) {
  const companiesSvc = companyService(db);
  const dashboard = dashboardService(db);
  const activity = activityService(db);
  const issueSvc = issueService(db);
  const agentSvc = agentService(db);
  const access = accessService(db);
  const projectSvc = projectService(db);
  const goalSvc = goalService(db);
  const routineSvc = routineService(db);
  const approvalSvc = approvalService(db);
  const issueApprovals = issueApprovalService(db);
  const costs = costService(db);
  const finance = financeService(db);
  const budgets = budgetService(db);
  const heartbeat = options.heartbeat ?? heartbeatService(db, options.heartbeatOptions);
  const executionWorkspaces = executionWorkspaceService(db);
  const companySkills = companySkillService(db);
  const secrets = secretService(db);
  const assetsSvc = assetService(db);
  const sidebarPreferences = sidebarPreferenceService(db);
  const sidebarBadges = sidebarBadgeService(db);
  const documentsSvc = documentService(db);
  const workProductsSvc = workProductService(db);
  const workspaceOperations = workspaceOperationService(db);

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

  function canCreateAgents(agent: {
    role: string;
    permissions: Record<string, unknown> | null | undefined;
  }) {
    if (!agent.permissions || typeof agent.permissions !== "object") return false;
    return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
  }

  async function buildAgentAccessState(
    agent: NonNullable<Awaited<ReturnType<typeof agentSvc.getById>>>,
  ) {
    const membership = await access.getMembership(agent.companyId, "agent", agent.id);
    const grants = membership
      ? await access.listPrincipalGrants(agent.companyId, "agent", agent.id)
      : [];
    const hasExplicitTaskAssignGrant = grants.some((grant) => grant.permissionKey === "tasks:assign");

    if (agent.role === "ceo") {
      return {
        canAssignTasks: true,
        taskAssignSource: "ceo_role" as const,
        membership,
        grants,
      };
    }

    if (canCreateAgents(agent)) {
      return {
        canAssignTasks: true,
        taskAssignSource: "agent_creator" as const,
        membership,
        grants,
      };
    }

    if (hasExplicitTaskAssignGrant) {
      return {
        canAssignTasks: true,
        taskAssignSource: "explicit_grant" as const,
        membership,
        grants,
      };
    }

    return {
      canAssignTasks: false,
      taskAssignSource: "none" as const,
      membership,
      grants,
    };
  }

  async function buildHomeAgentDetail(
    agent: NonNullable<Awaited<ReturnType<typeof agentSvc.getById>>>,
  ) {
    const [chainOfCommand, accessState] = await Promise.all([
      agentSvc.getChainOfCommand(agent.id),
      buildAgentAccessState(agent),
    ]);

    return {
      ...agent,
      chainOfCommand,
      access: accessState,
    };
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

  async function resolveIssueDocumentRevisionId(input: {
    issueId: string;
    documentKey: string;
    revisionId: string | null;
    revisionNumber: number | null;
  }) {
    if (input.revisionId) {
      return input.revisionId;
    }
    if (input.revisionNumber === null) {
      throwToolBadReference({
        message: "revisionId or revisionNumber is required",
        entityType: "issue_document_revision",
        hint: "Use list_issue_document_revisions first to find the revision you want to restore.",
      });
    }

    const revisions = await documentsSvc.listIssueDocumentRevisions(input.issueId, input.documentKey);
    const match = revisions.find((revision) => revision.revisionNumber === input.revisionNumber) ?? null;
    if (!match) {
      throwToolNotFound({
        message: `Revision ${input.revisionNumber} was not found for issue document "${input.documentKey}".`,
        entityType: "issue_document_revision",
        reference: String(input.revisionNumber),
        hint: "Use list_issue_document_revisions first to find the revision you want to restore.",
      });
    }
    return match.id;
  }

  async function resolveIssueWorkProductTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      issueIdField?: string;
      issueRefField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const issueIdField = options.issueIdField ?? "issueId";
    const issueRefField = options.issueRefField ?? "issueRef";
    const idField = options.idField ?? "workProductId";
    const refField = options.refField ?? "workProductRef";
    const issueSelector = pickRefSelector(input, issueIdField, issueRefField);
    const selector = pickRefSelector(input, idField, refField);

    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "issue_work_product",
        hint: "Use the work product UUID, title, URL, or external id.",
      });
    }

    const issue = issueSelector.id || issueSelector.reference
      ? await resolveIssueTarget(ctx, input, {
        idField: issueIdField,
        refField: issueRefField,
        requiredMessage: `${issueIdField} or ${issueRefField} is required when targeting a work product by ref`,
      })
      : null;

    const matchReference = async (reference: string) => {
      if (!issue) {
        throwToolBadReference({
          message: `${issueIdField} or ${issueRefField} is required when targeting a work product by ref`,
          entityType: "issue_work_product",
          hint: "Use list_issue_work_products first, then pass the returned workProductId, or also pass the issue ref.",
        });
      }
      const normalized = normalizeLooseRef(reference);
      const matches = (await workProductsSvc.listForIssue(issue.id)).filter((workProduct) =>
        normalizeLooseRef(workProduct.title) === normalized
        || normalizeLooseRef(workProduct.url) === normalized
        || normalizeLooseRef(workProduct.externalId) === normalized,
      );

      if (matches.length > 1) {
        throwToolConflict({
          message: `Work product reference "${reference}" is ambiguous on this issue.`,
          entityType: "issue_work_product",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.title,
            ref: (row) => row.url ?? row.externalId ?? row.title,
          }),
          hint: "Use the workProductId when multiple work products share the same title or URL.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Work product "${reference}" was not found on this issue.`,
          entityType: "issue_work_product",
          reference,
          hint: "Use list_issue_work_products first or pass the workProductId.",
        });
      }
      return match;
    };

    if (selector.id) {
      const workProduct = await workProductsSvc.getById(selector.id);
      if (!workProduct) {
        throwToolNotFound({
          message: `Work product "${selector.id}" was not found.`,
          entityType: "issue_work_product",
          reference: selector.id,
        });
      }
      if (workProduct.companyId !== ctx.companyId) {
        throwToolForbiddenScope({
          message: "Work product does not belong to the active company.",
          entityType: "issue_work_product",
          reference: selector.id,
          hint: "Use a work product from the current company only.",
        });
      }
      if (issue && workProduct.issueId !== issue.id) {
        throwToolBadReference({
          message: "Provided issue and work product selectors point to different issues.",
          entityType: "issue_work_product",
          reference: selector.id,
          hint: "Use a work product that belongs to the selected issue.",
        });
      }
      if (selector.ref) {
        const resolvedByRef = await matchReference(selector.ref);
        if (resolvedByRef.id !== workProduct.id) {
          throwToolBadReference({
            message: "Provided workProductId and workProductRef point to different work products.",
            entityType: "issue_work_product",
            reference: selector.ref,
            candidates: [{
              id: workProduct.id,
              label: workProduct.title,
              ref: workProduct.url ?? workProduct.externalId ?? workProduct.title,
            }],
            hint: "Pass either the exact workProductId or the matching workProductRef, not conflicting selectors.",
          });
        }
      }
      return workProduct;
    }

    return await matchReference(selector.reference!);
  }

  function toLeanOrgNode(node: Record<string, unknown>): Record<string, unknown> {
    const reports = Array.isArray(node.reports)
      ? (node.reports as Array<Record<string, unknown>>).map((report) => toLeanOrgNode(report))
      : [];
    return {
      id: String(node.id),
      name: String(node.name),
      role: String(node.role),
      status: String(node.status),
      reports,
    };
  }

  function countOrgNodes(nodes: unknown[]): number {
    return nodes.reduce<number>((total, node) => {
      if (typeof node !== "object" || node === null) return total;
      const reports = Array.isArray((node as Record<string, unknown>).reports)
        ? (node as Record<string, unknown>).reports as unknown[]
        : [];
      return total + 1 + countOrgNodes(reports);
    }, 0);
  }

  async function buildSkippedWakeupResponse(
    agent: NonNullable<Awaited<ReturnType<typeof agentSvc.getById>>>,
    payload: Record<string, unknown> | null | undefined,
  ) {
    const issueId = typeof payload?.issueId === "string" && payload.issueId.trim() ? payload.issueId : null;
    if (!issueId) {
      return {
        status: "skipped" as const,
        reason: "wakeup_skipped",
        message: "Wakeup was skipped.",
        issueId: null,
        executionRunId: null,
        executionAgentId: null,
        executionAgentName: null,
      };
    }

    const issue = await db
      .select({
        id: issues.id,
        executionRunId: issues.executionRunId,
      })
      .from(issues)
      .where(and(eq(issues.id, issueId), eq(issues.companyId, agent.companyId)))
      .then((rows) => rows[0] ?? null);

    if (!issue?.executionRunId) {
      return {
        status: "skipped" as const,
        reason: "wakeup_skipped",
        message: "Wakeup was skipped.",
        issueId,
        executionRunId: null,
        executionAgentId: null,
        executionAgentName: null,
      };
    }

    const executionRun = await heartbeat.getRun(issue.executionRunId);
    if (!executionRun || (executionRun.status !== "queued" && executionRun.status !== "running")) {
      return {
        status: "skipped" as const,
        reason: "wakeup_skipped",
        message: "Wakeup was skipped.",
        issueId,
        executionRunId: issue.executionRunId,
        executionAgentId: null,
        executionAgentName: null,
      };
    }

    const executionAgent = await agentSvc.getById(executionRun.agentId);
    const executionAgentName = executionAgent?.name ?? null;

    return {
      status: "skipped" as const,
      reason: "issue_execution_deferred",
      message: executionAgentName
        ? `Wakeup was deferred because this issue is already being executed by ${executionAgentName}.`
        : "Wakeup was deferred because this issue already has an active execution run.",
      issueId,
      executionRunId: executionRun.id,
      executionAgentId: executionRun.agentId,
      executionAgentName,
    };
  }

  async function resolveIssueAttachmentTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      issueIdField?: string;
      issueRefField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const issueIdField = options.issueIdField ?? "issueId";
    const issueRefField = options.issueRefField ?? "issueRef";
    const idField = options.idField ?? "attachmentId";
    const refField = options.refField ?? "attachmentRef";
    const issueSelector = pickRefSelector(input, issueIdField, issueRefField);
    const selector = pickRefSelector(input, idField, refField);

    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "issue_attachment",
        hint: "Use the attachment UUID, original filename, or object key.",
      });
    }

    const issue = issueSelector.id || issueSelector.reference
      ? await resolveIssueTarget(ctx, input, {
        idField: issueIdField,
        refField: issueRefField,
        requiredMessage: `${issueIdField} or ${issueRefField} is required when targeting an attachment by ref`,
      })
      : null;

    const matchReference = async (reference: string) => {
      if (!issue) {
        throwToolBadReference({
          message: `${issueIdField} or ${issueRefField} is required when targeting an attachment by ref`,
          entityType: "issue_attachment",
          hint: "Use list_issue_attachments first, then pass the returned attachmentId, or also pass the issue ref.",
        });
      }
      const normalized = normalizeLooseRef(reference);
      const matches = (await issueSvc.listAttachments(issue.id)).filter((attachment) =>
        normalizeLooseRef(attachment.originalFilename) === normalized
        || normalizeLooseRef(attachment.objectKey) === normalized,
      );

      if (matches.length > 1) {
        throwToolConflict({
          message: `Attachment reference "${reference}" is ambiguous on this issue.`,
          entityType: "issue_attachment",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.originalFilename ?? row.objectKey,
            ref: (row) => row.originalFilename ?? row.objectKey,
          }),
          hint: "Use the attachmentId when multiple attachments share that filename.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Attachment "${reference}" was not found on this issue.`,
          entityType: "issue_attachment",
          reference,
          hint: "Use list_issue_attachments first or pass the attachmentId.",
        });
      }
      return match;
    };

    if (selector.id) {
      const attachment = await issueSvc.getAttachmentById(selector.id);
      if (!attachment) {
        throwToolNotFound({
          message: `Attachment "${selector.id}" was not found.`,
          entityType: "issue_attachment",
          reference: selector.id,
        });
      }
      if (attachment.companyId !== ctx.companyId) {
        throwToolForbiddenScope({
          message: "Attachment does not belong to the active company.",
          entityType: "issue_attachment",
          reference: selector.id,
          hint: "Use an attachment from the current company only.",
        });
      }
      if (issue && attachment.issueId !== issue.id) {
        throwToolBadReference({
          message: "Provided issue and attachment selectors point to different issues.",
          entityType: "issue_attachment",
          reference: selector.id,
          hint: "Use an attachment that belongs to the selected issue.",
        });
      }
      if (selector.ref) {
        const resolvedByRef = await matchReference(selector.ref);
        if (resolvedByRef.id !== attachment.id) {
          throwToolBadReference({
            message: "Provided attachmentId and attachmentRef point to different attachments.",
            entityType: "issue_attachment",
            reference: selector.ref,
            candidates: [{
              id: attachment.id,
              label: attachment.originalFilename ?? attachment.objectKey,
              ref: attachment.originalFilename ?? attachment.objectKey,
            }],
            hint: "Pass either the exact attachmentId or the matching attachmentRef, not conflicting selectors.",
          });
        }
      }
      return attachment;
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

  async function resolveGoalTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "goalId";
    const refField = options.refField ?? "goalRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "goal",
        hint: "Use the goal UUID or exact goal title from the active company.",
      });
    }

    const matchReference = async (reference: string) => {
      const normalized = normalizeLooseRef(reference);
      const matches = (await goalSvc.list(ctx.companyId))
        .filter((goal) => normalizeLooseRef(goal.title) === normalized);
      if (matches.length > 1) {
        throwToolConflict({
          message: `Goal reference "${reference}" is ambiguous in this company.`,
          entityType: "goal",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.title,
            ref: (row) => row.title,
          }),
          hint: "Use the exact goal UUID when multiple goals share that title.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Goal "${reference}" was not found in this company.`,
          entityType: "goal",
          reference,
          hint: "Call list_goals first or use the exact goal title.",
        });
      }
      return match;
    };

    if (selector.id) {
      const goal = await goalSvc.getById(selector.id);
      if (!goal) {
        throwToolNotFound({
          message: `Goal "${selector.id}" was not found.`,
          entityType: "goal",
          reference: selector.id,
        });
      }
      if (goal.companyId !== ctx.companyId) {
        throwToolForbiddenScope({
          message: "Goal does not belong to the active company.",
          entityType: "goal",
          reference: selector.id,
          hint: "Use a goal from the current company only.",
        });
      }
      if (selector.ref) {
        const resolvedByRef = await matchReference(selector.ref);
        if (resolvedByRef.id !== goal.id) {
          throwToolBadReference({
            message: "Provided goalId and goalRef point to different goals.",
            entityType: "goal",
            reference: selector.ref,
            candidates: [{
              id: goal.id,
              label: goal.title,
              ref: goal.title,
            }],
            hint: "Pass either the exact goal ID or the matching goal title, not conflicting selectors.",
          });
        }
      }
      return goal;
    }

    return await matchReference(selector.reference!);
  }

  async function resolveRoutineTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "routineId";
    const refField = options.refField ?? "routineRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "routine",
        hint: "Use the routine UUID or exact routine title from the active company.",
      });
    }

    const matchReference = async (reference: string) => {
      const normalized = normalizeLooseRef(reference);
      const matches = (await routineSvc.list(ctx.companyId))
        .filter((routine) => normalizeLooseRef(routine.title) === normalized);
      if (matches.length > 1) {
        throwToolConflict({
          message: `Routine reference "${reference}" is ambiguous in this company.`,
          entityType: "routine",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.title,
            ref: (row) => row.title,
          }),
          hint: "Use the exact routine UUID when multiple routines share that title.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Routine "${reference}" was not found in this company.`,
          entityType: "routine",
          reference,
          hint: "Call list_routines first or use the exact routine title.",
        });
      }
      return match;
    };

    if (selector.id) {
      const routine = await routineSvc.get(selector.id);
      if (!routine) {
        throwToolNotFound({
          message: `Routine "${selector.id}" was not found.`,
          entityType: "routine",
          reference: selector.id,
        });
      }
      if (routine.companyId !== ctx.companyId) {
        throwToolForbiddenScope({
          message: "Routine does not belong to the active company.",
          entityType: "routine",
          reference: selector.id,
          hint: "Use a routine from the current company only.",
        });
      }
      if (selector.ref) {
        const resolvedByRef = await matchReference(selector.ref);
        if (resolvedByRef.id !== routine.id) {
          throwToolBadReference({
            message: "Provided routineId and routineRef point to different routines.",
            entityType: "routine",
            reference: selector.ref,
            candidates: [{
              id: routine.id,
              label: routine.title,
              ref: routine.title,
            }],
            hint: "Pass either the exact routine ID or the matching routine title, not conflicting selectors.",
          });
        }
      }
      return routine;
    }

    const resolved = await matchReference(selector.reference!);
    const routine = await routineSvc.get(resolved.id);
    if (!routine) {
      throwToolNotFound({
        message: `Routine "${selector.reference}" was not found in this company.`,
        entityType: "routine",
        reference: selector.reference,
      });
    }
    return routine;
  }

  function approvalReferenceCandidates(row: Awaited<ReturnType<typeof approvalSvc.list>>[number]) {
    const payload = row.payload as Record<string, unknown> | null;
    return [
      row.type,
      typeof payload?.name === "string" ? payload.name : null,
      typeof payload?.title === "string" ? payload.title : null,
    ]
      .map((value) => normalizeLooseRef(value))
      .filter((value): value is string => Boolean(value));
  }

  async function resolveApprovalTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "approvalId";
    const refField = options.refField ?? "approvalRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "approval",
        hint: "Use the approval UUID or a unique approval type/name from the active company.",
      });
    }

    const matchReference = async (reference: string) => {
      const normalized = normalizeLooseRef(reference);
      const matches = (await approvalSvc.list(ctx.companyId))
        .filter((approval) => approvalReferenceCandidates(approval).includes(normalized!));
      if (matches.length > 1) {
        throwToolConflict({
          message: `Approval reference "${reference}" is ambiguous in this company.`,
          entityType: "approval",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => {
              const payload = row.payload as Record<string, unknown> | null;
              return typeof payload?.name === "string" ? `${row.type}: ${payload.name}` : row.type;
            },
            ref: (row) => row.type,
          }),
          hint: "Use the exact approval UUID when multiple approvals match the same reference.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Approval "${reference}" was not found in this company.`,
          entityType: "approval",
          reference,
          hint: "Call list_approvals first or use the exact approval UUID.",
        });
      }
      return match;
    };

    if (selector.id) {
      const approval = await approvalSvc.getById(selector.id);
      if (!approval) {
        throwToolNotFound({
          message: `Approval "${selector.id}" was not found.`,
          entityType: "approval",
          reference: selector.id,
        });
      }
      if (approval.companyId !== ctx.companyId) {
        throwToolForbiddenScope({
          message: "Approval does not belong to the active company.",
          entityType: "approval",
          reference: selector.id,
          hint: "Use an approval from the current company only.",
        });
      }
      if (selector.ref) {
        const resolvedByRef = await matchReference(selector.ref);
        if (resolvedByRef.id !== approval.id) {
          throwToolBadReference({
            message: "Provided approvalId and approvalRef point to different approvals.",
            entityType: "approval",
            reference: selector.ref,
            candidates: [{
              id: approval.id,
              label: approval.type,
              ref: approval.type,
            }],
            hint: "Pass either the exact approval ID or the matching approval ref, not conflicting selectors.",
          });
        }
      }
      return approval;
    }

    return await matchReference(selector.reference!);
  }

  async function resolveSecretTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "secretId";
    const refField = options.refField ?? "secretRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "secret",
        hint: "Use the secret UUID or exact secret name from the active company.",
      });
    }

    const matchReference = async (reference: string) => {
      const matches = (await secrets.list(ctx.companyId))
        .filter((secret) => normalizeLooseRef(secret.name) === normalizeLooseRef(reference));
      if (matches.length > 1) {
        throwToolConflict({
          message: `Secret reference "${reference}" is ambiguous in this company.`,
          entityType: "secret",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.name,
            ref: (row) => row.name,
          }),
          hint: "Use the exact secret UUID when multiple secrets share that name.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Secret "${reference}" was not found in this company.`,
          entityType: "secret",
          reference,
          hint: "Call list_secret_metadata first or use the exact secret name.",
        });
      }
      return match;
    };

    if (selector.id) {
      const secret = await secrets.getById(selector.id);
      if (!secret) {
        throwToolNotFound({
          message: `Secret "${selector.id}" was not found.`,
          entityType: "secret",
          reference: selector.id,
        });
      }
      if (secret.companyId !== ctx.companyId) {
        throwToolForbiddenScope({
          message: "Secret does not belong to the active company.",
          entityType: "secret",
          reference: selector.id,
          hint: "Use a secret from the current company only.",
        });
      }
      if (selector.ref) {
        const resolvedByRef = await matchReference(selector.ref);
        if (resolvedByRef.id !== secret.id) {
          throwToolBadReference({
            message: "Provided secretId and secretRef point to different secrets.",
            entityType: "secret",
            reference: selector.ref,
            candidates: [{
              id: secret.id,
              label: secret.name,
              ref: secret.name,
            }],
            hint: "Pass either the exact secret ID or the matching secret name, not conflicting selectors.",
          });
        }
      }
      return secret;
    }

    return await matchReference(selector.reference!);
  }

  async function resolveCompanySkillTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "skillId";
    const refField = options.refField ?? "skillRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "skill",
        hint: "Use the company skill UUID, exact slug, exact key, or exact skill name.",
      });
    }

    const skills = await companySkills.listFull(ctx.companyId);
    const matchReference = (reference: string) => {
      const normalized = normalizeLooseRef(reference);
      const matches = skills.filter((skill) =>
        normalizeLooseRef(skill.slug) === normalized
        || normalizeLooseRef(skill.key) === normalized
        || normalizeLooseRef(skill.name) === normalized
      );
      if (matches.length > 1) {
        throwToolConflict({
          message: `Skill reference "${reference}" is ambiguous in this company.`,
          entityType: "skill",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.name,
            ref: (row) => row.slug,
          }),
          hint: "Use the exact skill UUID when multiple company skills match.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Skill "${reference}" was not found in this company.`,
          entityType: "skill",
          reference,
          hint: "Call list_company_skills first or use the exact skill slug/key/name.",
        });
      }
      return match;
    };

    if (selector.id) {
      const skill = skills.find((entry) => entry.id === selector.id) ?? null;
      if (!skill) {
        throwToolNotFound({
          message: `Skill "${selector.id}" was not found.`,
          entityType: "skill",
          reference: selector.id,
        });
      }
      if (selector.ref) {
        const byRef = matchReference(selector.ref);
        if (byRef.id !== skill.id) {
          throwToolBadReference({
            message: "Provided skillId and skillRef point to different skills.",
            entityType: "skill",
            reference: selector.ref,
            candidates: [{
              id: skill.id,
              label: skill.name,
              ref: skill.slug,
            }],
            hint: "Pass either the exact skill UUID or the matching skill reference, not conflicting selectors.",
          });
        }
      }
      return skill;
    }

    return matchReference(selector.reference!);
  }

  async function loadCompanyAssetRecords(companyId: string) {
    return await db
      .select()
      .from(assets)
      .where(eq(assets.companyId, companyId))
      .orderBy(desc(assets.createdAt));
  }

  async function resolveAssetTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "assetId";
    const refField = options.refField ?? "assetRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "asset",
        hint: "Use the company asset UUID, exact original filename, or exact object key.",
      });
    }

    const assetRows = await loadCompanyAssetRecords(ctx.companyId);
    const matchReference = (reference: string) => {
      const normalized = normalizeLooseRef(reference);
      const matches = assetRows.filter((asset) =>
        normalizeLooseRef(asset.originalFilename) === normalized
        || normalizeLooseRef(asset.objectKey) === normalized,
      );
      if (matches.length > 1) {
        throwToolConflict({
          message: `Asset reference "${reference}" is ambiguous in this company.`,
          entityType: "asset",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.originalFilename ?? row.objectKey,
            ref: (row) => row.originalFilename ?? row.objectKey,
          }),
          hint: "Use the exact asset UUID when multiple company assets match.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Asset "${reference}" was not found in this company.`,
          entityType: "asset",
          reference,
          hint: "Call get_company_asset with the asset UUID, or use the exact stored filename/object key.",
        });
      }
      return match;
    };

    if (selector.id) {
      const asset = assetRows.find((entry) => entry.id === selector.id) ?? null;
      if (!asset) {
        throwToolNotFound({
          message: `Asset "${selector.id}" was not found.`,
          entityType: "asset",
          reference: selector.id,
        });
      }
      if (selector.ref) {
        const byRef = matchReference(selector.ref);
        if (byRef.id !== asset.id) {
          throwToolBadReference({
            message: "Provided assetId and assetRef point to different assets.",
            entityType: "asset",
            reference: selector.ref,
            candidates: [{
              id: asset.id,
              label: asset.originalFilename ?? asset.objectKey,
              ref: asset.originalFilename ?? asset.objectKey,
            }],
            hint: "Pass either the exact asset UUID or the matching asset reference, not conflicting selectors.",
          });
        }
      }
      return asset;
    }

    return matchReference(selector.reference!);
  }

  async function loadCompanyMemberRecords(
    companyId: string,
    options: { includeArchived?: boolean } = {},
  ) {
    const members = await db
      .select()
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.companyId, companyId),
          eq(companyMemberships.principalType, "user"),
          options.includeArchived ? undefined : ne(companyMemberships.status, "archived"),
        ),
      )
      .orderBy(desc(companyMemberships.updatedAt));

    const userIds = [...new Set(members.map((member) => member.principalId))];
    const [userMap, grants] = await Promise.all([
      loadUsersById(db, userIds),
      userIds.length > 0
        ? db
          .select()
          .from(principalPermissionGrants)
          .where(
            and(
              eq(principalPermissionGrants.companyId, companyId),
              eq(principalPermissionGrants.principalType, "user"),
              inArray(principalPermissionGrants.principalId, userIds),
            ),
          )
        : Promise.resolve([]),
    ]);

    const grantsByPrincipalId = new Map<string, typeof grants>();
    for (const grant of grants) {
      const existing = grantsByPrincipalId.get(grant.principalId) ?? [];
      existing.push(grant);
      grantsByPrincipalId.set(grant.principalId, existing);
    }

    return members.map((member) => {
      const normalizedRole = member.membershipRole
        ? resolveHumanInviteRole({ human: { role: member.membershipRole } })
        : null;
      const implicitGrantKeys = new Set(
        normalizedRole ? grantsForHumanRole(normalizedRole).map((grant) => grant.permissionKey) : [],
      );
      return {
        ...member,
        principalType: "user" as const,
        membershipRole: normalizedRole,
        user: userMap.get(member.principalId) ?? null,
        grants: (grantsByPrincipalId.get(member.principalId) ?? []).filter(
          (grant) => !implicitGrantKeys.has(grant.permissionKey as PermissionKey),
        ),
      };
    });
  }

  async function loadCompanyUserDirectory(companyId: string) {
    const members = await db
      .select({
        principalId: companyMemberships.principalId,
        status: companyMemberships.status,
      })
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.companyId, companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.status, "active"),
        ),
      )
      .orderBy(desc(companyMemberships.updatedAt));

    const userIds = [...new Set(members.map((member) => member.principalId))];
    const userMap = await loadUsersById(db, userIds);
    return members.map((member) => ({
      principalId: member.principalId,
      status: "active" as const,
      user: userMap.get(member.principalId) ?? null,
    }));
  }

  async function resolveCompanyUserTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
      includeArchived?: boolean;
    } = {},
  ) {
    const idField = options.idField ?? "userId";
    const refField = options.refField ?? "userRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "user",
        hint: "Use the company user ID, auth user ID, exact email, or exact display name.",
      });
    }

    const members = await loadCompanyMemberRecords(ctx.companyId, {
      includeArchived: options.includeArchived,
    });
    const matchReference = (reference: string) => {
      const normalized = normalizeLooseRef(reference);
      const matches = members.filter((member) =>
        normalizeLooseRef(member.principalId) === normalized
        || normalizeLooseRef(member.user?.email) === normalized
        || normalizeLooseRef(member.user?.name) === normalized
        || userSlugCandidates({ principalId: member.principalId, user: member.user }).includes(normalized ?? ""),
      );
      if (matches.length > 1) {
        throwToolConflict({
          message: `User reference "${reference}" is ambiguous in this company.`,
          entityType: "user",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.principalId,
            label: (row) => row.user?.email ?? row.user?.name ?? row.principalId,
            ref: (row) => row.user?.email ?? row.user?.name ?? row.principalId,
          }),
          hint: "Use the exact auth user ID when multiple company users match.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `User "${reference}" was not found in this company.`,
          entityType: "user",
          reference,
          hint: "Call list_company_user_directory first or use the exact email/name/user ID.",
        });
      }
      return match;
    };

    if (selector.id) {
      const member = members.find((entry) => entry.principalId === selector.id || entry.id === selector.id) ?? null;
      if (!member) {
        throwToolNotFound({
          message: `User "${selector.id}" was not found.`,
          entityType: "user",
          reference: selector.id,
        });
      }
      if (selector.ref) {
        const byRef = matchReference(selector.ref);
        if (byRef.principalId !== member.principalId) {
          throwToolBadReference({
            message: "Provided userId and userRef point to different users.",
            entityType: "user",
            reference: selector.ref,
            candidates: [{
              id: member.principalId,
              label: member.user?.email ?? member.user?.name ?? member.principalId,
              ref: member.user?.email ?? member.user?.name ?? member.principalId,
            }],
            hint: "Pass either the exact user ID or the matching user reference, not conflicting selectors.",
          });
        }
      }
      return member;
    }

    return matchReference(selector.reference!);
  }

  async function loadUserProfileWindowStats(
    companyId: string,
    userId: string,
    key: (typeof USER_PROFILE_WINDOWS)[number]["key"],
    label: string,
    from: Date | null,
  ) {
    const involvement = userIssueInvolvementSql(companyId, userId);
    const openStatuses = ["backlog", "todo", "in_progress", "in_review", "blocked"];
    const fromIso = from?.toISOString();
    const issueDateFilter = from ? gte(issues.updatedAt, from) : undefined;
    const activityDateFilter = from ? gte(activityLog.createdAt, from) : undefined;
    const costDateFilter = from ? gte(costEvents.occurredAt, from) : undefined;

    const [touchedIssues, createdIssues, completedIssues, assignedOpenIssues, commentCount, activityCount, costTotals] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(distinct ${issues.id})::int` })
          .from(issues)
          .where(and(eq(issues.companyId, companyId), involvement, issueDateFilter))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(issues)
          .where(and(eq(issues.companyId, companyId), eq(issues.createdByUserId, userId), from ? gte(issues.createdAt, from) : undefined))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(issues)
          .where(and(eq(issues.companyId, companyId), eq(issues.status, "done"), eq(issues.assigneeUserId, userId), from ? gte(issues.completedAt, from) : undefined))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(issues)
          .where(and(eq(issues.companyId, companyId), eq(issues.assigneeUserId, userId), inArray(issues.status, openStatuses)))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(issueComments)
          .where(and(eq(issueComments.companyId, companyId), eq(issueComments.authorUserId, userId), from ? gte(issueComments.createdAt, from) : undefined))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(activityLog)
          .where(and(eq(activityLog.companyId, companyId), eq(activityLog.actorType, "user"), eq(activityLog.actorId, userId), activityDateFilter))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        db
          .select({
            costCents: sumCostNumber(costEvents.costCents),
            inputTokens: sumCostNumber(costEvents.inputTokens),
            cachedInputTokens: sumCostNumber(costEvents.cachedInputTokens),
            outputTokens: sumCostNumber(costEvents.outputTokens),
            costEventCount: sql<number>`count(*)::int`,
          })
          .from(costEvents)
          .innerJoin(issues, and(eq(issues.id, costEvents.issueId), eq(issues.companyId, costEvents.companyId)))
          .where(and(eq(costEvents.companyId, companyId), userIssueInvolvementSql(companyId, userId), costDateFilter))
          .then((rows) => rows[0] ?? {
            costCents: 0,
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            costEventCount: 0,
          }),
      ]);

    return {
      key,
      label,
      touchedIssues,
      createdIssues,
      completedIssues,
      assignedOpenIssues,
      commentCount,
      activityCount,
      costCents: Number(costTotals.costCents ?? 0),
      inputTokens: Number(costTotals.inputTokens ?? 0),
      cachedInputTokens: Number(costTotals.cachedInputTokens ?? 0),
      outputTokens: Number(costTotals.outputTokens ?? 0),
      costEventCount: Number(costTotals.costEventCount ?? 0),
    };
  }

  async function loadUserProfileDailyStats(companyId: string, userId: string) {
    const points = new Map<string, {
      date: string;
      activityCount: number;
      completedIssues: number;
      costCents: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
    }>();
    const firstDay = startOfUtcDay(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000));
    for (let offset = 0; offset < 14; offset += 1) {
      const date = new Date(firstDay.getTime() + offset * 24 * 60 * 60 * 1000);
      points.set(isoDay(date), {
        date: isoDay(date),
        activityCount: 0,
        completedIssues: 0,
        costCents: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      });
    }

    const activityDay = dayKeyExpr(sql`${activityLog.createdAt}`);
    const activityRows = await db
      .select({
        date: activityDay,
        count: sql<number>`count(*)::int`,
      })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.companyId, companyId),
          eq(activityLog.actorType, "user"),
          eq(activityLog.actorId, userId),
          gte(activityLog.createdAt, firstDay),
        ),
      )
      .groupBy(activityDay);
    for (const row of activityRows) {
      const point = points.get(row.date);
      if (point) point.activityCount = Number(row.count ?? 0);
    }

    const completedDay = dayKeyExpr(sql`${issues.completedAt}`);
    const completedRows = await db
      .select({
        date: completedDay,
        count: sql<number>`count(*)::int`,
      })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          eq(issues.status, "done"),
          eq(issues.assigneeUserId, userId),
          gte(issues.completedAt, firstDay),
        ),
      )
      .groupBy(completedDay);
    for (const row of completedRows) {
      const point = points.get(row.date);
      if (point) point.completedIssues = Number(row.count ?? 0);
    }

    const costDay = dayKeyExpr(sql`${costEvents.occurredAt}`);
    const costRows = await db
      .select({
        date: costDay,
        costCents: sumCostNumber(costEvents.costCents),
        inputTokens: sumCostNumber(costEvents.inputTokens),
        cachedInputTokens: sumCostNumber(costEvents.cachedInputTokens),
        outputTokens: sumCostNumber(costEvents.outputTokens),
      })
      .from(costEvents)
      .innerJoin(issues, and(eq(issues.id, costEvents.issueId), eq(issues.companyId, costEvents.companyId)))
      .where(
        and(
          eq(costEvents.companyId, companyId),
          gte(costEvents.occurredAt, firstDay),
          userIssueInvolvementSql(companyId, userId),
        ),
      )
      .groupBy(costDay);
    for (const row of costRows) {
      const point = points.get(row.date);
      if (!point) continue;
      point.costCents = Number(row.costCents ?? 0);
      point.inputTokens = Number(row.inputTokens ?? 0);
      point.cachedInputTokens = Number(row.cachedInputTokens ?? 0);
      point.outputTokens = Number(row.outputTokens ?? 0);
    }

    return [...points.values()];
  }

  async function buildCompanyUserProfile(companyId: string, principalId: string) {
    const members = await loadCompanyMemberRecords(companyId, { includeArchived: true });
    const member = members.find((entry) => entry.principalId === principalId) ?? null;
    if (!member) {
      throw notFound("User not found");
    }

    const [stats, daily, recentIssues, recentActivity, topAgents, topProviders] = await Promise.all([
      Promise.all(
        USER_PROFILE_WINDOWS.map((entry) =>
          loadUserProfileWindowStats(companyId, principalId, entry.key, entry.label, windowStart(entry.days)),
        ),
      ),
      loadUserProfileDailyStats(companyId, principalId),
      db
        .select({
          id: issues.id,
          identifier: issues.identifier,
          title: issues.title,
          status: issues.status,
          priority: issues.priority,
          assigneeAgentId: issues.assigneeAgentId,
          assigneeUserId: issues.assigneeUserId,
          updatedAt: issues.updatedAt,
          completedAt: issues.completedAt,
        })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), isNull(issues.hiddenAt), userIssueInvolvementSql(companyId, principalId)))
        .orderBy(desc(issues.updatedAt))
        .limit(8),
      db
        .select({
          id: activityLog.id,
          action: activityLog.action,
          entityType: activityLog.entityType,
          entityId: activityLog.entityId,
          details: activityLog.details,
          createdAt: activityLog.createdAt,
        })
        .from(activityLog)
        .where(and(eq(activityLog.companyId, companyId), eq(activityLog.actorType, "user"), eq(activityLog.actorId, principalId)))
        .orderBy(desc(activityLog.createdAt))
        .limit(12),
      db
        .select({
          agentId: costEvents.agentId,
          agentName: agents.name,
          costCents: sumCostNumber(costEvents.costCents),
          inputTokens: sumCostNumber(costEvents.inputTokens),
          cachedInputTokens: sumCostNumber(costEvents.cachedInputTokens),
          outputTokens: sumCostNumber(costEvents.outputTokens),
        })
        .from(costEvents)
        .innerJoin(issues, and(eq(issues.id, costEvents.issueId), eq(issues.companyId, costEvents.companyId)))
        .leftJoin(agents, eq(agents.id, costEvents.agentId))
        .where(and(eq(costEvents.companyId, companyId), userIssueInvolvementSql(companyId, principalId)))
        .groupBy(costEvents.agentId, agents.name)
        .orderBy(desc(sumCostNumber(costEvents.costCents)))
        .limit(5),
      db
        .select({
          provider: costEvents.provider,
          biller: costEvents.biller,
          model: costEvents.model,
          costCents: sumCostNumber(costEvents.costCents),
          inputTokens: sumCostNumber(costEvents.inputTokens),
          cachedInputTokens: sumCostNumber(costEvents.cachedInputTokens),
          outputTokens: sumCostNumber(costEvents.outputTokens),
        })
        .from(costEvents)
        .innerJoin(issues, and(eq(issues.id, costEvents.issueId), eq(issues.companyId, costEvents.companyId)))
        .where(and(eq(costEvents.companyId, companyId), userIssueInvolvementSql(companyId, principalId)))
        .groupBy(costEvents.provider, costEvents.biller, costEvents.model)
        .orderBy(desc(sumCostNumber(costEvents.costCents)))
        .limit(5),
    ]);

    return {
      user: {
        id: member.principalId,
        slug: userSlugCandidates({ principalId: member.principalId, user: member.user })[0] ?? member.principalId,
        name: member.user?.name ?? null,
        email: member.user?.email ?? null,
        image: member.user?.image ?? null,
        membershipRole: member.membershipRole ?? null,
        membershipStatus: member.status,
        joinedAt: member.createdAt,
      },
      stats,
      daily,
      recentIssues,
      recentActivity,
      topAgents: topAgents.map((row) => ({
        agentId: row.agentId,
        agentName: row.agentName,
        costCents: Number(row.costCents ?? 0),
        inputTokens: Number(row.inputTokens ?? 0),
        cachedInputTokens: Number(row.cachedInputTokens ?? 0),
        outputTokens: Number(row.outputTokens ?? 0),
      })),
      topProviders: topProviders.map((row) => ({
        provider: row.provider,
        biller: row.biller,
        model: row.model,
        costCents: Number(row.costCents ?? 0),
        inputTokens: Number(row.inputTokens ?? 0),
        cachedInputTokens: Number(row.cachedInputTokens ?? 0),
        outputTokens: Number(row.outputTokens ?? 0),
      })),
    };
  }

  async function loadCompanyInviteRecords(
    companyId: string,
    options: {
      state?: "active" | "accepted" | "expired" | "revoked";
      limit: number;
      offset: number;
    },
  ) {
    const whereClause = inviteStateWhereClause(options.state);
    const rows = await db
      .select()
      .from(invites)
      .where(whereClause ? and(eq(invites.companyId, companyId), whereClause) : eq(invites.companyId, companyId))
      .orderBy(desc(invites.createdAt))
      .limit(options.limit + 1)
      .offset(options.offset);
    const hasMore = rows.length > options.limit;
    const visibleRows = hasMore ? rows.slice(0, options.limit) : rows;
    const userIds = [
      ...new Set(
        visibleRows
          .map((invite) => invite.invitedByUserId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const [userMap, joinRows] = await Promise.all([
      loadUsersById(db, userIds),
      visibleRows.length > 0
        ? db
          .select({ id: joinRequests.id, inviteId: joinRequests.inviteId })
          .from(joinRequests)
          .where(
            and(
              eq(joinRequests.companyId, companyId),
              inArray(joinRequests.inviteId, visibleRows.map((invite) => invite.id)),
            ),
          )
        : Promise.resolve([]),
    ]);
    const joinRequestIdByInviteId = new Map(joinRows.map((row) => [row.inviteId, row.id]));

    return {
      invites: visibleRows.map((invite) => ({
        ...invite,
        humanRole: extractInviteHumanRole(invite),
        inviteMessage: extractInviteMessage(invite),
        state: inviteState(invite),
        invitedByUser: invite.invitedByUserId
          ? userMap.get(invite.invitedByUserId) ?? null
          : null,
        relatedJoinRequestId: joinRequestIdByInviteId.get(invite.id) ?? null,
      })),
      nextOffset: hasMore ? options.offset + options.limit : null,
    };
  }

  async function loadJoinRequestRecords(companyId: string) {
    const rows = collapseDuplicatePendingHumanJoinRequests(
      await db
        .select()
        .from(joinRequests)
        .where(eq(joinRequests.companyId, companyId))
        .orderBy(desc(joinRequests.createdAt)),
    );
    const inviteIds = [...new Set(rows.map((row) => row.inviteId))];
    const inviteRows = inviteIds.length > 0
      ? await db
        .select()
        .from(invites)
        .where(inArray(invites.id, inviteIds))
      : [];
    const userIds = [
      ...new Set(
        [
          ...rows.map((row) => row.requestingUserId),
          ...rows.map((row) => row.approvedByUserId),
          ...rows.map((row) => row.rejectedByUserId),
          ...inviteRows.map((invite) => invite.invitedByUserId),
        ].filter((value): value is string => Boolean(value)),
      ),
    ];
    const userMap = await loadUsersById(db, userIds);
    const inviteMap = new Map(inviteRows.map((invite) => [invite.id, invite]));

    return rows.map((row) => {
      const invite = inviteMap.get(row.inviteId) ?? null;
      return {
        ...row,
        claimSecretHash: undefined,
        requesterUser: row.requestingUserId ? userMap.get(row.requestingUserId) ?? null : null,
        approvedByUser: row.approvedByUserId ? userMap.get(row.approvedByUserId) ?? null : null,
        rejectedByUser: row.rejectedByUserId ? userMap.get(row.rejectedByUserId) ?? null : null,
        invite: invite
          ? {
            id: invite.id,
            inviteType: invite.inviteType,
            allowedJoinTypes: invite.allowedJoinTypes,
            humanRole: extractInviteHumanRole(invite),
            inviteMessage: extractInviteMessage(invite),
            createdAt: invite.createdAt,
            expiresAt: invite.expiresAt,
            revokedAt: invite.revokedAt,
            acceptedAt: invite.acceptedAt,
            invitedByUser: invite.invitedByUserId
              ? userMap.get(invite.invitedByUserId) ?? null
              : null,
          }
          : null,
      };
    }).map(({ claimSecretHash: _claimSecretHash, ...safe }) => safe);
  }

  async function resolveMemberTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
      includeArchived?: boolean;
    } = {},
  ) {
    const idField = options.idField ?? "memberId";
    const refField = options.refField ?? "memberRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "member",
        hint: "Use the company member UUID or the exact member email/name in the active company.",
      });
    }

    const members = await loadCompanyMemberRecords(ctx.companyId, {
      includeArchived: options.includeArchived,
    });

    const matchReference = (reference: string) => {
      const normalized = normalizeLooseRef(reference);
      const matches = members.filter((member) => {
        const email = normalizeLooseRef(member.user?.email);
        const name = normalizeLooseRef(member.user?.name);
        return email === normalized || name === normalized;
      });
      if (matches.length > 1) {
        throwToolConflict({
          message: `Member reference "${reference}" is ambiguous in this company.`,
          entityType: "member",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.user?.email ?? row.user?.name ?? row.id,
            ref: (row) => row.user?.email ?? row.user?.name ?? row.id,
          }),
          hint: "Use the exact company membership UUID when multiple members match.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Member "${reference}" was not found in this company.`,
          entityType: "member",
          reference,
          hint: "Call list_company_members first or use the exact company membership UUID.",
        });
      }
      return match;
    };

    if (selector.id) {
      const member = members.find((entry) => entry.id === selector.id) ?? null;
      if (!member) {
        throwToolNotFound({
          message: `Member "${selector.id}" was not found.`,
          entityType: "member",
          reference: selector.id,
        });
      }
      if (selector.ref) {
        const byRef = matchReference(selector.ref);
        if (byRef.id !== member.id) {
          throwToolBadReference({
            message: "Provided memberId and memberRef point to different members.",
            entityType: "member",
            reference: selector.ref,
            candidates: [{
              id: member.id,
              label: member.user?.email ?? member.user?.name ?? member.id,
              ref: member.user?.email ?? member.user?.name ?? member.id,
            }],
            hint: "Pass either the exact membership UUID or the matching member email/name, not conflicting selectors.",
          });
        }
      }
      return member;
    }

    return matchReference(selector.reference!);
  }

  async function resolveInviteTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "inviteId";
    const refField = options.refField ?? "inviteRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "invite",
        hint: "Use the invite UUID or the exact invite message shown by list_company_invites.",
      });
    }

    const invitePage = await loadCompanyInviteRecords(ctx.companyId, {
      limit: 200,
      offset: 0,
    });
    const invitesForCompany = invitePage.invites;

    const matchReference = (reference: string) => {
      const normalized = normalizeLooseRef(reference);
      const matches = invitesForCompany.filter((invite) =>
        normalizeLooseRef(invite.inviteMessage) === normalized
        || normalizeLooseRef(invite.invitedByUser?.email) === normalized
        || normalizeLooseRef(invite.invitedByUser?.name) === normalized,
      );
      if (matches.length > 1) {
        throwToolConflict({
          message: `Invite reference "${reference}" is ambiguous in this company.`,
          entityType: "invite",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.inviteMessage ?? `${row.allowedJoinTypes} invite`,
            ref: (row) => row.inviteMessage ?? row.invitedByUser?.email ?? row.id,
          }),
          hint: "Use the exact invite UUID when multiple company invites match.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Invite "${reference}" was not found in this company.`,
          entityType: "invite",
          reference,
          hint: "Call list_company_invites first or use the exact invite UUID.",
        });
      }
      return match;
    };

    if (selector.id) {
      const invite = invitesForCompany.find((entry) => entry.id === selector.id) ?? null;
      if (!invite) {
        throwToolNotFound({
          message: `Invite "${selector.id}" was not found.`,
          entityType: "invite",
          reference: selector.id,
        });
      }
      if (selector.ref) {
        const byRef = matchReference(selector.ref);
        if (byRef.id !== invite.id) {
          throwToolBadReference({
            message: "Provided inviteId and inviteRef point to different invites.",
            entityType: "invite",
            reference: selector.ref,
            candidates: [{
              id: invite.id,
              label: invite.inviteMessage ?? `${invite.allowedJoinTypes} invite`,
              ref: invite.inviteMessage ?? invite.invitedByUser?.email ?? invite.id,
            }],
            hint: "Pass either the exact invite UUID or the matching invite reference, not conflicting selectors.",
          });
        }
      }
      return invite;
    }

    return matchReference(selector.reference!);
  }

  async function resolveJoinRequestTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
    options: {
      idField?: string;
      refField?: string;
      requiredMessage?: string;
    } = {},
  ) {
    const idField = options.idField ?? "joinRequestId";
    const refField = options.refField ?? "joinRequestRef";
    const selector = pickRefSelector(input, idField, refField);
    if (!selector.id && !selector.reference) {
      throwToolBadReference({
        message: options.requiredMessage ?? `${idField} or ${refField} is required`,
        entityType: "join_request",
        hint: "Use the join request UUID or the exact requester email/name or agent name.",
      });
    }

    const requests = await loadJoinRequestRecords(ctx.companyId);

    const matchReference = (reference: string) => {
      const normalized = normalizeLooseRef(reference);
      const matches = requests.filter((request) =>
        normalizeLooseRef(request.requesterUser?.email) === normalized
        || normalizeLooseRef(request.requesterUser?.name) === normalized
        || normalizeLooseRef(request.agentName) === normalized
        || normalizeLooseRef(request.requestEmailSnapshot) === normalized,
      );
      if (matches.length > 1) {
        throwToolConflict({
          message: `Join request reference "${reference}" is ambiguous in this company.`,
          entityType: "join_request",
          reference,
          candidates: buildNamedCandidates(matches, {
            id: (row) => row.id,
            label: (row) => row.requesterUser?.email ?? row.agentName ?? row.id,
            ref: (row) => row.requesterUser?.email ?? row.agentName ?? row.id,
          }),
          hint: "Use the exact join request UUID when multiple join requests match.",
        });
      }
      const match = matches[0] ?? null;
      if (!match) {
        throwToolNotFound({
          message: `Join request "${reference}" was not found in this company.`,
          entityType: "join_request",
          reference,
          hint: "Call list_join_requests first or use the exact join request UUID.",
        });
      }
      return match;
    };

    if (selector.id) {
      const request = requests.find((entry) => entry.id === selector.id) ?? null;
      if (!request) {
        throwToolNotFound({
          message: `Join request "${selector.id}" was not found.`,
          entityType: "join_request",
          reference: selector.id,
        });
      }
      if (selector.ref) {
        const byRef = matchReference(selector.ref);
        if (byRef.id !== request.id) {
          throwToolBadReference({
            message: "Provided joinRequestId and joinRequestRef point to different join requests.",
            entityType: "join_request",
            reference: selector.ref,
            candidates: [{
              id: request.id,
              label: request.requesterUser?.email ?? request.agentName ?? request.id,
              ref: request.requesterUser?.email ?? request.agentName ?? request.id,
            }],
            hint: "Pass either the exact join request UUID or the matching requester reference, not conflicting selectors.",
          });
        }
      }
      return request;
    }

    return matchReference(selector.reference!);
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
    action: "start" | "stop" | "restart";
  }) {
    return buildWorkspaceRuntimeDesiredStatePatch({
      config: { workspaceRuntime: input.config },
      currentDesiredState: input.currentDesiredState ?? null,
      currentServiceStates: input.currentServiceStates,
      action: input.action,
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

  async function controlProjectWorkspaceRuntime(
    ctx: HomeToolContext,
    target: Extract<RestartPreviewTarget, { kind: "project_workspace" }>,
    action: "start" | "stop" | "restart",
  ) {
    const { project, workspace } = await resolveProjectWorkspaceTarget(ctx, target);
    const runtimeConfig = workspace.runtimeConfig?.workspaceRuntime ?? null;
    if (!runtimeConfig && action !== "stop") {
      throw badRequest("Project workspace has no runtime service configuration");
    }

    const selection = resolveServiceIndexFromRuntimeServiceId({
      config: runtimeConfig ?? {},
      runtimeServices: workspace.runtimeServices ?? [],
      runtimeServiceId: target.runtimeServiceId,
      targetLabel: `project workspace "${workspace.name}"`,
    });

    if (action === "stop" || action === "restart") {
      await stopRuntimeServicesForProjectWorkspace({
        db,
        projectWorkspaceId: workspace.id,
        runtimeServiceId: selection.runtimeServiceId,
      });
    }

    const startedServices = action === "stop"
      ? []
      : await startRuntimeServicesForWorkspaceControl({
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
      config: runtimeConfig ?? {},
      currentDesiredState: workspace.runtimeConfig?.desiredState ?? null,
      currentServiceStates: workspace.runtimeConfig?.serviceStates ?? null,
      serviceIndex: selection.serviceIndex,
      action,
    });
    await projectSvc.updateWorkspace(project.id, workspace.id, {
      runtimeConfig: {
        desiredState: nextRuntimeState.desiredState,
        serviceStates: nextRuntimeState.serviceStates,
      },
    });

    return {
      content:
        action === "stop"
          ? `Stopped preview runtime for project workspace "${workspace.name}".`
          : `${action === "restart" ? "Restarted" : "Started"} preview runtime for ${describeTarget(`project workspace "${workspace.name}"`, startedServices)}.`,
      data: {
        targetKind: "project_workspace",
        projectId: project.id,
        projectWorkspaceId: workspace.id,
        runtimeServiceId: selection.runtimeServiceId,
        startedServices,
      },
    };
  }

  async function controlExecutionWorkspaceRuntime(
    ctx: HomeToolContext,
    target: Extract<RestartPreviewTarget, { kind: "execution_workspace" }>,
    action: "start" | "stop" | "restart",
  ) {
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
    if (!runtimeConfig && action !== "stop") {
      throw badRequest("Execution workspace has no runtime service configuration");
    }

    const selection = resolveServiceIndexFromRuntimeServiceId({
      config: runtimeConfig ?? {},
      runtimeServices: workspace.runtimeServices ?? [],
      runtimeServiceId: target.runtimeServiceId,
      targetLabel: `execution workspace "${workspace.name}"`,
    });

    if (action === "stop" || action === "restart") {
      await stopRuntimeServicesForExecutionWorkspace({
        db,
        executionWorkspaceId: workspace.id,
        workspaceCwd: workspace.cwd,
        runtimeServiceId: selection.runtimeServiceId,
      });
    }

    let startedServices: Array<{ serviceName: string; url?: string | null }> = [];
    if (action !== "stop") {
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

      startedServices = await startRuntimeServicesForWorkspaceControl({
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
    }

    const nextRuntimeState = resolveRuntimeStatePatch({
      config: runtimeConfig ?? {},
      currentDesiredState: workspace.config?.desiredState ?? null,
      currentServiceStates: workspace.config?.serviceStates ?? null,
      serviceIndex: selection.serviceIndex,
      action,
    });
    await executionWorkspaces.update(workspace.id, {
      metadata: mergeExecutionWorkspaceConfig(workspace.metadata, {
        desiredState: nextRuntimeState.desiredState,
        serviceStates: nextRuntimeState.serviceStates,
      }),
    });

    return {
      content:
        action === "stop"
          ? `Stopped preview runtime for execution workspace "${workspace.name}".`
          : `${action === "restart" ? "Restarted" : "Started"} preview runtime for ${describeTarget(`execution workspace "${workspace.name}"`, startedServices)}.`,
      data: {
        targetKind: "execution_workspace",
        executionWorkspaceId: workspace.id,
        runtimeServiceId: selection.runtimeServiceId,
        startedServices,
      },
    };
  }

  async function resolveProjectWorkspaceToolTarget(ctx: HomeToolContext, input: Record<string, unknown>) {
    const projectSelector = pickRefSelector(input, "projectId", "projectRef");
    const workspaceSelector = pickRefSelector(input, "projectWorkspaceId", "projectWorkspaceRef");
    const project = projectSelector.id || projectSelector.reference
      ? await resolveProjectTarget(ctx, input)
      : null;
    const workspaceRow = await resolveProjectWorkspaceReferenceTarget({
      ctx,
      projectId: project?.id ?? null,
      projectWorkspaceId: workspaceSelector.id,
      projectWorkspaceRef: workspaceSelector.reference,
    });
    if (!workspaceRow) {
      throwToolBadReference({
        message: "projectWorkspaceId or projectWorkspaceRef is required",
        entityType: "project_workspace",
        hint: "Use the project workspace UUID or exact workspace name.",
      });
    }
    const owningProject = project ?? await projectSvc.getById(workspaceRow.projectId);
    if (!owningProject || owningProject.companyId !== ctx.companyId) {
      throwToolForbiddenScope({
        message: "Project workspace does not belong to the active company.",
        entityType: "project_workspace",
        reference: workspaceRow.id,
      });
    }
    const workspace = owningProject.workspaces.find((entry) => entry.id === workspaceRow.id) ?? null;
    if (!workspace) {
      throwToolNotFound({
        message: `Project workspace "${workspaceRow.id}" was not found in this company.`,
        entityType: "project_workspace",
        reference: workspaceRow.id,
      });
    }
    return { project: owningProject, workspace };
  }

  type HomeToolHandler = HomeToolDefinition["handler"];

  async function resolveProjectWorkspaceRuntimeTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
  ) {
    const target = await resolveRestartPreviewTarget(ctx, input);
    if (target.kind !== "project_workspace") {
      throw badRequest(
        "Need projectId/projectRef, projectWorkspaceId/projectWorkspaceRef, or a project workspace runtimeServiceId/runtimeServiceRef for this tool",
      );
    }
    return target;
  }

  async function resolveExecutionWorkspaceRuntimeTarget(
    ctx: HomeToolContext,
    input: Record<string, unknown>,
  ) {
    const target = await resolveRestartPreviewTarget(ctx, input);
    if (target.kind !== "execution_workspace") {
      throw badRequest(
        "Need executionWorkspaceId/executionWorkspaceRef or an execution workspace runtimeServiceId/runtimeServiceRef for this tool",
      );
    }
    return target;
  }

  function createRowsHandler<T>(
    noun: string,
    loader: (ctx: HomeToolContext, input: Record<string, unknown>) => Promise<T[]>,
  ): HomeToolHandler {
    return async (ctx, input) => {
      const rows = await loader(ctx, input);
      return {
        content: summarizeRows(rows as unknown[], noun),
        data: rows,
      };
    };
  }

  const toolHandlers: Record<string, HomeToolHandler> = {
    get_company_overview: async (ctx) => {
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

    get_company_dashboard: async (ctx) => {
      const summary = await dashboard.summary(ctx.companyId);
      return {
        content: `Loaded dashboard: ${summary.tasks.open} open tasks and ${summary.pendingApprovals} pending approvals.`,
        data: summary,
      };
    },

    list_recent_activity: async (ctx, input) => {
      const rows = await activity.list({
        companyId: ctx.companyId,
        limit: Math.min(100, Math.max(1, Math.floor(asNumber(input.limit, 25)))),
        entityType: asString(input.entityType) ?? undefined,
      });
      return { content: summarizeRows(rows, "activity item"), data: rows };
    },

    list_issues: async (ctx, input) => {
      const assignee = asString(input.assigneeAgentId) || asString(input.assigneeAgentRef)
        ? await resolveAgentTarget(ctx, input, {
          idField: "assigneeAgentId",
          refField: "assigneeAgentRef",
          requiredMessage: "assigneeAgentId or assigneeAgentRef is required when filtering by assignee",
        })
        : null;
      const project = asString(input.projectId) || asString(input.projectRef)
        ? await resolveProjectTarget(ctx, input, {
          idField: "projectId",
          refField: "projectRef",
          requiredMessage: "projectId or projectRef is required when filtering by project",
        })
        : null;
      const rows = await issueSvc.list(ctx.companyId, {
        q: asString(input.q) ?? undefined,
        status: asString(input.status) ?? undefined,
        assigneeAgentId: assignee?.id ?? undefined,
        projectId: project?.id ?? undefined,
        limit: Math.min(100, Math.max(1, Math.floor(asNumber(input.limit, 50)))),
      });
      return { content: summarizeRows(rows, "agenda item"), data: rows };
    },

    get_issue: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      return {
        content: `Loaded agenda item ${issue.identifier ?? issue.id}: ${issue.title}.`,
        data: issue,
      };
    },

    create_issue: async (ctx, input) => {
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

    update_issue_status: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const updated = await issueSvc.update(issue.id, {
        status: asString(input.status) ?? undefined,
        priority: asString(input.priority) ?? undefined,
        actorUserId: ctx.ownerUserId,
      });
      if (!updated) throw notFound("Issue not found");
      const comment = asString(input.comment);
      if (comment) {
        await issueSvc.addComment(issue.id, comment, { userId: ctx.ownerUserId });
      }
      return { content: `Updated agenda item ${updated.identifier ?? updated.id}.`, data: updated };
    },

    list_issue_comments: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const order = asString(input.order);
      const rows = await issueSvc.listComments(issue.id, {
        order: order === "asc" ? "asc" : "desc",
        limit: Math.max(1, Math.min(200, Math.floor(asNumber(input.limit, 50)))),
      });
      return { content: summarizeRows(rows, "issue comment"), data: rows };
    },

    add_issue_comment: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const body = asString(input.body);
      if (!body) throw badRequest("body is required");
      const comment = await issueSvc.addComment(issue.id, body, { userId: ctx.ownerUserId });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_comment_added",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "add_issue_comment", commentId: comment.id },
      });
      return {
        content: `Added a comment to ${issue.identifier ?? issue.id}.`,
        data: comment,
      };
    },

    list_issue_documents: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const rows = await documentsSvc.listIssueDocuments(issue.id, {
        includeSystem: input.includeSystem === true,
      });
      return { content: summarizeRows(rows, "issue document"), data: rows };
    },

    get_issue_document: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const documentKey = asString(input.documentKey);
      if (!documentKey) {
        throwToolBadReference({
          message: "documentKey is required",
          entityType: "issue_document",
          hint: "Use the document key such as plan, notes, design, or review.",
        });
      }
      const document = await documentsSvc.getIssueDocumentByKey(issue.id, documentKey);
      if (!document) {
        throwToolNotFound({
          message: `Issue document "${documentKey}" was not found on this issue.`,
          entityType: "issue_document",
          reference: documentKey,
          hint: "Use list_issue_documents first to see available document keys.",
        });
      }
      return {
        content: `Loaded issue document "${document.key}" for ${issue.identifier ?? issue.id}.`,
        data: document,
      };
    },

    update_issue_document: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const documentKey = asString(input.documentKey);
      if (!documentKey) {
        throwToolBadReference({
          message: "documentKey is required",
          entityType: "issue_document",
          hint: "Use the document key such as plan, notes, design, or review.",
        });
      }
      const format = asString(input.format);
      const body = typeof input.body === "string" ? input.body : null;
      if (!format) throw badRequest("format is required");
      if (body === null) throw badRequest("body is required");

      const result = await documentsSvc.upsertIssueDocument({
        issueId: issue.id,
        key: documentKey,
        title: asString(input.title),
        format,
        body,
        changeSummary: asString(input.changeSummary),
        baseRevisionId: asString(input.baseRevisionId),
        createdByUserId: ctx.ownerUserId,
      });

      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: result.created ? "home_tool.issue_document_created" : "home_tool.issue_document_updated",
        entityType: "issue",
        entityId: issue.id,
        details: {
          tool: "update_issue_document",
          key: result.document.key,
          documentId: result.document.id,
        },
      });

      return {
        content: `${result.created ? "Created" : "Updated"} issue document "${result.document.key}" for ${issue.identifier ?? issue.id}.`,
        data: result.document,
      };
    },

    list_issue_document_revisions: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const documentKey = asString(input.documentKey);
      if (!documentKey) {
        throwToolBadReference({
          message: "documentKey is required",
          entityType: "issue_document",
          hint: "Use the document key such as plan, notes, design, or review.",
        });
      }
      const revisions = await documentsSvc.listIssueDocumentRevisions(issue.id, documentKey);
      return {
        content: summarizeRows(revisions, "issue document revision"),
        data: revisions,
      };
    },

    restore_issue_document_revision: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const documentKey = asString(input.documentKey);
      if (!documentKey) {
        throwToolBadReference({
          message: "documentKey is required",
          entityType: "issue_document",
          hint: "Use the document key such as plan, notes, design, or review.",
        });
      }
      const revisionId = await resolveIssueDocumentRevisionId({
        issueId: issue.id,
        documentKey,
        revisionId: asString(input.revisionId),
        revisionNumber: typeof input.revisionNumber === "number" && Number.isFinite(input.revisionNumber)
          ? Math.max(1, Math.floor(input.revisionNumber))
          : null,
      });

      const result = await documentsSvc.restoreIssueDocumentRevision({
        issueId: issue.id,
        key: documentKey,
        revisionId,
        createdByUserId: ctx.ownerUserId,
      });

      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_document_revision_restored",
        entityType: "issue",
        entityId: issue.id,
        details: {
          tool: "restore_issue_document_revision",
          key: result.document.key,
          restoredFromRevisionId: result.restoredFromRevisionId,
          restoredFromRevisionNumber: result.restoredFromRevisionNumber,
        },
      });

      return {
        content: `Restored issue document "${result.document.key}" for ${issue.identifier ?? issue.id}.`,
        data: result.document,
      };
    },

    delete_issue_document: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const documentKey = asString(input.documentKey);
      if (!documentKey) {
        throwToolBadReference({
          message: "documentKey is required",
          entityType: "issue_document",
          hint: "Use the document key such as plan, notes, design, or review.",
        });
      }
      const removed = await documentsSvc.deleteIssueDocument(issue.id, documentKey);
      if (!removed) {
        throwToolNotFound({
          message: `Issue document "${documentKey}" was not found on this issue.`,
          entityType: "issue_document",
          reference: documentKey,
          hint: "Use list_issue_documents first to see available document keys.",
        });
      }
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_document_deleted",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "delete_issue_document", key: removed.key, documentId: removed.id },
      });
      return {
        content: `Deleted issue document "${removed.key}" from ${issue.identifier ?? issue.id}.`,
        data: removed,
      };
    },

    list_issue_work_products: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const rows = await workProductsSvc.listForIssue(issue.id);
      return { content: summarizeRows(rows, "issue work product"), data: rows };
    },

    create_issue_work_product: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const type = asString(input.type);
      const provider = asString(input.provider);
      const title = asString(input.title);
      if (!type) throw badRequest("type is required");
      if (!provider) throw badRequest("provider is required");
      if (!title) throw badRequest("title is required");

      const project = asString(input.projectId) || asString(input.projectRef)
        ? await resolveProjectTarget(ctx, input, {
          idField: "projectId",
          refField: "projectRef",
          requiredMessage: "projectId or projectRef is required when linking a work product to a project",
        })
        : null;
      const metadata = asRecord(input.metadata);
      const product = await workProductsSvc.createForIssue(issue.id, issue.companyId, {
        projectId: project?.id ?? issue.projectId ?? null,
        executionWorkspaceId: asString(input.executionWorkspaceId),
        runtimeServiceId: asString(input.runtimeServiceId),
        type: type as any,
        provider,
        externalId: asString(input.externalId),
        title,
        url: asString(input.url),
        status: asString(input.status) ?? "active",
        reviewState: asString(input.reviewState) ?? "none",
        isPrimary: input.isPrimary === true,
        healthStatus: asString(input.healthStatus) ?? "unknown",
        summary: asString(input.summary),
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
        createdByRunId: null,
      });
      if (!product) throw conflict("Work product could not be created");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_work_product_created",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "create_issue_work_product", workProductId: product.id, type: product.type },
      });
      return {
        content: `Created work product "${product.title}" on ${issue.identifier ?? issue.id}.`,
        data: product,
      };
    },

    update_issue_work_product: async (ctx, input) => {
      const workProduct = await resolveIssueWorkProductTarget(ctx, input);
      const project = asString(input.projectId)
        ? await resolveProjectTarget(ctx, input, {
          idField: "projectId",
          refField: "projectRef",
          requiredMessage: "projectId or projectRef is required when changing the linked project",
        })
        : asString(input.projectRef)
          ? await resolveProjectTarget(ctx, input, {
            idField: "projectId",
            refField: "projectRef",
            requiredMessage: "projectId or projectRef is required when changing the linked project",
          })
          : null;
      const metadata = input.metadata === undefined ? undefined : asRecord(input.metadata);
      const updated = await workProductsSvc.update(workProduct.id, {
        projectId: project?.id ?? undefined,
        executionWorkspaceId: input.executionWorkspaceId === undefined ? undefined : asOptionalString(input.executionWorkspaceId),
        runtimeServiceId: input.runtimeServiceId === undefined ? undefined : asOptionalString(input.runtimeServiceId),
        type: input.type === undefined ? undefined : asOptionalString(input.type),
        provider: input.provider === undefined ? undefined : asOptionalString(input.provider),
        externalId: input.externalId === undefined ? undefined : asOptionalString(input.externalId),
        title: input.title === undefined ? undefined : asOptionalString(input.title),
        url: input.url === undefined ? undefined : asOptionalString(input.url),
        status: input.status === undefined ? undefined : asOptionalString(input.status),
        reviewState: input.reviewState === undefined ? undefined : asOptionalString(input.reviewState),
        isPrimary: input.isPrimary === undefined ? undefined : input.isPrimary === true,
        healthStatus: input.healthStatus === undefined ? undefined : asOptionalString(input.healthStatus),
        summary: input.summary === undefined ? undefined : asOptionalString(input.summary),
        metadata: metadata === undefined ? undefined : (Object.keys(metadata).length > 0 ? metadata : null),
      });
      if (!updated) throw notFound("Work product not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_work_product_updated",
        entityType: "issue",
        entityId: updated.issueId,
        details: { tool: "update_issue_work_product", workProductId: updated.id },
      });
      return {
        content: `Updated work product "${updated.title}".`,
        data: updated,
      };
    },

    delete_issue_work_product: async (ctx, input) => {
      const workProduct = await resolveIssueWorkProductTarget(ctx, input);
      const removed = await workProductsSvc.remove(workProduct.id);
      if (!removed) throw notFound("Work product not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_work_product_deleted",
        entityType: "issue",
        entityId: removed.issueId,
        details: { tool: "delete_issue_work_product", workProductId: removed.id },
      });
      return {
        content: `Deleted work product "${removed.title}".`,
        data: removed,
      };
    },

    list_issue_attachments: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const rows = await issueSvc.listAttachments(issue.id);
      return {
        content: summarizeRows(rows, "issue attachment"),
        data: rows.map((attachment) => ({
          ...attachment,
          contentPath: `/api/attachments/${attachment.id}/content`,
        })),
      };
    },

    delete_issue_attachment: async (ctx, input) => {
      const attachment = await resolveIssueAttachmentTarget(ctx, input);
      try {
        await getStorageService().deleteObject(attachment.companyId, attachment.objectKey);
      } catch {
        // Preserve route semantics: attachment record deletion still proceeds if storage cleanup fails.
      }
      const removed = await issueSvc.removeAttachment(attachment.id);
      if (!removed) throw notFound("Attachment not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_attachment_deleted",
        entityType: "issue",
        entityId: removed.issueId,
        details: { tool: "delete_issue_attachment", attachmentId: removed.id },
      });
      return {
        content: `Deleted attachment "${removed.originalFilename ?? removed.objectKey}".`,
        data: removed,
      };
    },

    list_issue_approvals: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const approvals = await issueApprovals.listApprovalsForIssue(issue.id);
      return {
        content: summarizeRows(approvals, "issue approval"),
        data: approvals,
      };
    },

    link_issue_approval: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const approval = await resolveApprovalTarget(ctx, input, {
        requiredMessage: "approvalId or approvalRef is required when linking an approval",
      });
      await issueApprovals.link(issue.id, approval.id, { userId: ctx.ownerUserId });
      const approvals = await issueApprovals.listApprovalsForIssue(issue.id);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_approval_linked",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "link_issue_approval", approvalId: approval.id },
      });
      return {
        content: `Linked approval ${approval.id} to ${issue.identifier ?? issue.id}.`,
        data: approvals,
      };
    },

    unlink_issue_approval: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const approval = await resolveApprovalTarget(ctx, input, {
        requiredMessage: "approvalId or approvalRef is required when unlinking an approval",
      });
      await issueApprovals.unlink(issue.id, approval.id);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_approval_unlinked",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "unlink_issue_approval", approvalId: approval.id },
      });
      return {
        content: `Unlinked approval ${approval.id} from ${issue.identifier ?? issue.id}.`,
        data: { ok: true, issueId: issue.id, approvalId: approval.id },
      };
    },

    delete_issue: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const removed = await issueSvc.remove(issue.id);
      if (!removed) throw notFound("Issue not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_deleted",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "delete_issue" },
      });
      return {
        content: `Deleted agenda item ${issue.identifier ?? issue.id}.`,
        data: removed,
      };
    },

    checkout_issue: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const agent = await resolveAgentTarget(ctx, input, {
        requiredMessage: "agentId or agentRef is required when checking out an issue",
      });
      if (issue.projectId) {
        const project = await projectSvc.getById(issue.projectId);
        if (project?.pausedAt) {
          throw conflict(
            project.pauseReason === "budget"
              ? "Project is paused because its budget hard-stop was reached"
              : "Project is paused",
          );
        }
      }
      if (issue.executionWorkspaceId) {
        const workspace = await executionWorkspaces.getById(issue.executionWorkspaceId);
        if (workspace && isClosedIsolatedExecutionWorkspace(workspace)) {
          throw conflict(getClosedIsolatedExecutionWorkspaceMessage(workspace), {
            executionWorkspace: workspace,
          });
        }
      }
      const expectedStatuses = asStringArray(input.expectedStatuses);
      const updated = await issueSvc.checkout(
        issue.id,
        agent.id,
        expectedStatuses.length > 0 ? expectedStatuses : [issue.status],
        null,
      );
      if (shouldWakeAssigneeOnCheckout({
        actorType: "board",
        actorAgentId: null,
        checkoutAgentId: agent.id,
        checkoutRunId: null,
      })) {
        await heartbeat.wakeup(agent.id, {
          source: "assignment",
          triggerDetail: "system",
          reason: "issue_checked_out",
          payload: { issueId: issue.id, mutation: "checkout" },
          requestedByActorType: "user",
          requestedByActorId: ctx.ownerUserId,
          contextSnapshot: { issueId: issue.id, source: "issue.checkout" },
        }).catch(() => null);
      }
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_checked_out",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "checkout_issue", agentId: agent.id },
      });
      return {
        content: `Checked out ${updated.identifier ?? updated.id} to ${agent.name}.`,
        data: updated,
      };
    },

    release_issue: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const released = await issueSvc.release(issue.id);
      if (!released) throw notFound("Issue not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_released",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "release_issue" },
      });
      return {
        content: `Released ${issue.identifier ?? issue.id}.`,
        data: released,
      };
    },

    mark_issue_read: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const readState = await issueSvc.markRead(ctx.companyId, issue.id, ctx.ownerUserId, new Date());
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_read_marked",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "mark_issue_read", userId: ctx.ownerUserId, lastReadAt: readState.lastReadAt },
      });
      return {
        content: `Marked ${issue.identifier ?? issue.id} as read.`,
        data: readState,
      };
    },

    mark_issue_unread: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const removed = await issueSvc.markUnread(ctx.companyId, issue.id, ctx.ownerUserId);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_read_unmarked",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "mark_issue_unread", userId: ctx.ownerUserId },
      });
      return {
        content: `Marked ${issue.identifier ?? issue.id} as unread.`,
        data: { id: issue.id, removed },
      };
    },

    archive_issue_inbox: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const archiveState = await issueSvc.archiveInbox(ctx.companyId, issue.id, ctx.ownerUserId, new Date());
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_inbox_archived",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "archive_issue_inbox", userId: ctx.ownerUserId, archivedAt: archiveState.archivedAt },
      });
      return {
        content: `Archived ${issue.identifier ?? issue.id} from the inbox.`,
        data: archiveState,
      };
    },

    unarchive_issue_inbox: async (ctx, input) => {
      const issue = await resolveIssueTarget(ctx, input);
      const removed = await issueSvc.unarchiveInbox(ctx.companyId, issue.id, ctx.ownerUserId);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.issue_inbox_unarchived",
        entityType: "issue",
        entityId: issue.id,
        details: { tool: "unarchive_issue_inbox", userId: ctx.ownerUserId },
      });
      return {
        content: `Restored ${issue.identifier ?? issue.id} to the inbox.`,
        data: removed ?? { ok: true },
      };
    },

    list_agents: async (ctx, input) => {
      const rows = await agentSvc.list(ctx.companyId, { includeTerminated: input.includeTerminated === true });
      return { content: summarizeRows(rows, "agent"), data: rows };
    },

    get_agent: async (ctx, input) => {
      const agent = await resolveAgentTarget(ctx, input);
      const detail = await buildHomeAgentDetail(agent);
      return {
        content: `Loaded ${agent.name}.`,
        data: detail,
      };
    },

    get_company_org: async (ctx) => {
      const tree = await agentSvc.orgForCompany(ctx.companyId);
      const leanTree = tree.map((node) => toLeanOrgNode(node as Record<string, unknown>));
      return {
        content: `Loaded the company org with ${countOrgNodes(leanTree)} active agent${countOrgNodes(leanTree) === 1 ? "" : "s"}.`,
        data: leanTree,
      };
    },

    get_agent_runtime_state: async (ctx, input) => {
      const agent = await resolveAgentTarget(ctx, input);
      const state = await heartbeat.getRuntimeState(agent.id);
      if (!state) throw notFound("Agent runtime state not found");
      return {
        content: `Loaded runtime state for ${agent.name}.`,
        data: state,
      };
    },

    list_agent_task_sessions: async (ctx, input) => {
      const agent = await resolveAgentTarget(ctx, input);
      const sessions = await heartbeat.listTaskSessions(agent.id);
      return {
        content: `Found ${sessions.length} task session${sessions.length === 1 ? "" : "s"} for ${agent.name}.`,
        data: sessions.map((session) => ({
          ...session,
          sessionParamsJson: redactEventPayload(session.sessionParamsJson ?? null),
        })),
      };
    },

    reset_agent_runtime_session: async (ctx, input) => {
      const agent = await resolveAgentTarget(ctx, input);
      const taskKey = asString(input.taskKey);
      const state = await heartbeat.resetRuntimeSession(agent.id, { taskKey });
      if (!state) throw notFound("Agent runtime state not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: agent.id,
        runId: null,
        action: "home_tool.agent_runtime_session_reset",
        entityType: "agent",
        entityId: agent.id,
        details: { tool: "reset_agent_runtime_session", taskKey: taskKey ?? null },
      });
      return {
        content: taskKey
          ? `Reset the "${taskKey}" task session for ${agent.name}.`
          : `Reset runtime session state for ${agent.name}.`,
        data: state,
      };
    },

    pause_agent: async (ctx, input) => {
      const targetAgent = await resolveAgentTarget(ctx, input);
      const agent = await agentSvc.pause(targetAgent.id, "manual");
      if (!agent) throw notFound("Agent not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: targetAgent.id,
        runId: null,
        action: "home_tool.agent_paused",
        entityType: "agent",
        entityId: targetAgent.id,
        details: { tool: "pause_agent" },
      });
      return { content: `Paused ${agent.name}.`, data: agent };
    },

    resume_agent: async (ctx, input) => {
      const targetAgent = await resolveAgentTarget(ctx, input);
      const agent = await agentSvc.resume(targetAgent.id);
      if (!agent) throw notFound("Agent not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: targetAgent.id,
        runId: null,
        action: "home_tool.agent_resumed",
        entityType: "agent",
        entityId: targetAgent.id,
        details: { tool: "resume_agent" },
      });
      return { content: `Resumed ${agent.name}.`, data: agent };
    },

    wake_agent: async (ctx, input) => {
      const agent = await resolveAgentTarget(ctx, input);
      const source = asEnumValue(input.source, AGENT_WAKEUP_SOURCES, "source", "on_demand");
      const triggerDetail = asEnumValue(input.triggerDetail, AGENT_WAKEUP_TRIGGER_DETAILS, "triggerDetail", "manual");
      const payload = asOptionalRecordInput(input.payload, "payload");
      const run = await heartbeat.wakeup(agent.id, {
        source,
        triggerDetail,
        reason: asString(input.reason),
        payload,
        idempotencyKey: asString(input.idempotencyKey),
        requestedByActorType: "user",
        requestedByActorId: ctx.ownerUserId,
        contextSnapshot: {
          triggeredBy: "user",
          actorId: ctx.ownerUserId,
          forceFreshSession: input.forceFreshSession === true,
        },
      });

      if (!run) {
        const skipped = await buildSkippedWakeupResponse(agent, payload);
        return {
          content: `${agent.name} wakeup was skipped.`,
          data: skipped,
        };
      }

      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: agent.id,
        runId: run.id,
        action: "home_tool.agent_wakeup_queued",
        entityType: "heartbeat_run",
        entityId: run.id,
        details: { tool: "wake_agent", agentId: agent.id },
      });
      return {
        content: `Queued a wakeup for ${agent.name}.`,
        data: run,
      };
    },

    invoke_agent_heartbeat: async (ctx, input) => {
      const agent = await resolveAgentTarget(ctx, input);
      const run = await heartbeat.invoke(
        agent.id,
        "on_demand",
        {
          triggeredBy: "user",
          actorId: ctx.ownerUserId,
        },
        "manual",
        {
          actorType: "user",
          actorId: ctx.ownerUserId,
        },
      );

      if (!run) {
        return {
          content: `${agent.name} heartbeat was skipped.`,
          data: { status: "skipped" },
        };
      }

      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: agent.id,
        runId: run.id,
        action: "home_tool.agent_heartbeat_invoked",
        entityType: "heartbeat_run",
        entityId: run.id,
        details: { tool: "invoke_agent_heartbeat", agentId: agent.id },
      });
      return {
        content: `Queued an on-demand heartbeat for ${agent.name}.`,
        data: run,
      };
    },

    create_agent: async (ctx, input) => {
      const company = await companiesSvc.getById(ctx.companyId);
      if (!company) throw notFound("Company not found");
      if (company.requireBoardApprovalForNewAgents) {
        throw conflict(
          "Direct agent creation requires board approval. Use hire_agent to create a pending hire approval instead.",
        );
      }
      const name = asString(input.name);
      const adapterType = asString(input.adapterType);
      if (!name) throw badRequest("name is required");
      if (!adapterType) throw badRequest("adapterType is required");
      const created = await agentSvc.create(ctx.companyId, {
        name,
        role: asString(input.role) ?? "general",
        title: asNullableString(input.title) ?? null,
        icon: asNullableString(input.icon) ?? null,
        reportsTo: asNullableString(input.reportsTo) ?? null,
        capabilities: asNullableString(input.capabilities) ?? null,
        adapterType,
        adapterConfig: asOptionalRecordInput(input.adapterConfig, "adapterConfig") ?? {},
        runtimeConfig: asOptionalRecordInput(input.runtimeConfig, "runtimeConfig") ?? {},
        budgetMonthlyCents: Math.max(0, Math.floor(asNumber(input.budgetMonthlyCents, 0))),
        permissions: typeof asRecord(input.permissions).canCreateAgents === "boolean"
          ? { canCreateAgents: asRecord(input.permissions).canCreateAgents === true }
          : undefined,
        metadata: asOptionalRecordInput(input.metadata, "metadata"),
        status: "idle",
        spentMonthlyCents: 0,
        lastHeartbeatAt: null,
      });
      await access.ensureMembership(ctx.companyId, "agent", created.id, "member", "active");
      const effectiveCanAssignTasks = created.role === "ceo" || Boolean(created.permissions?.canCreateAgents);
      await access.setPrincipalPermission(
        ctx.companyId,
        "agent",
        created.id,
        "tasks:assign",
        effectiveCanAssignTasks,
        ctx.ownerUserId,
      );
      if (created.budgetMonthlyCents > 0) {
        await budgets.upsertPolicy(
          ctx.companyId,
          {
            scopeType: "agent",
            scopeId: created.id,
            amount: created.budgetMonthlyCents,
            windowKind: "calendar_month_utc",
          },
          ctx.ownerUserId,
        );
      }
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.agent_created",
        entityType: "agent",
        entityId: created.id,
        details: { tool: "create_agent", name: created.name, role: created.role },
      });
      return {
        content: `Created agent ${created.name}.`,
        data: await buildHomeAgentDetail(created),
      };
    },

    hire_agent: async (ctx, input) => {
      const company = await companiesSvc.getById(ctx.companyId);
      if (!company) throw notFound("Company not found");
      const name = asString(input.name);
      const adapterType = asString(input.adapterType);
      if (!name) throw badRequest("name is required");
      if (!adapterType) throw badRequest("adapterType is required");
      const sourceIssueIds = Array.from(new Set([
        ...asStringArray(input.sourceIssueIds),
        ...(asString(input.sourceIssueId) ? [asString(input.sourceIssueId)!] : []),
      ]));
      const status = company.requireBoardApprovalForNewAgents ? "pending_approval" : "idle";
      const created = await agentSvc.create(ctx.companyId, {
        name,
        role: asString(input.role) ?? "general",
        title: asNullableString(input.title) ?? null,
        icon: asNullableString(input.icon) ?? null,
        reportsTo: asNullableString(input.reportsTo) ?? null,
        capabilities: asNullableString(input.capabilities) ?? null,
        adapterType,
        adapterConfig: asOptionalRecordInput(input.adapterConfig, "adapterConfig") ?? {},
        runtimeConfig: asOptionalRecordInput(input.runtimeConfig, "runtimeConfig") ?? {},
        budgetMonthlyCents: Math.max(0, Math.floor(asNumber(input.budgetMonthlyCents, 0))),
        permissions: typeof asRecord(input.permissions).canCreateAgents === "boolean"
          ? { canCreateAgents: asRecord(input.permissions).canCreateAgents === true }
          : undefined,
        metadata: asOptionalRecordInput(input.metadata, "metadata"),
        status,
        spentMonthlyCents: 0,
        lastHeartbeatAt: null,
      });
      await access.ensureMembership(ctx.companyId, "agent", created.id, "member", "active");
      const effectiveCanAssignTasks = created.role === "ceo" || Boolean(created.permissions?.canCreateAgents);
      await access.setPrincipalPermission(
        ctx.companyId,
        "agent",
        created.id,
        "tasks:assign",
        effectiveCanAssignTasks,
        ctx.ownerUserId,
      );

      let approval: Awaited<ReturnType<typeof approvalSvc.getById>> | null = null;
      if (company.requireBoardApprovalForNewAgents) {
        approval = await approvalSvc.create(ctx.companyId, {
          type: "hire_agent",
          requestedByAgentId: null,
          requestedByUserId: ctx.ownerUserId,
          status: "pending",
          payload: {
            name: created.name,
            role: created.role,
            title: created.title,
            icon: created.icon,
            reportsTo: created.reportsTo,
            capabilities: created.capabilities,
            adapterType: created.adapterType,
            adapterConfig: redactEventPayload((created.adapterConfig ?? {}) as Record<string, unknown>) ?? {},
            runtimeConfig: redactEventPayload((created.runtimeConfig ?? {}) as Record<string, unknown>) ?? {},
            budgetMonthlyCents: created.budgetMonthlyCents,
            metadata: redactEventPayload((created.metadata ?? {}) as Record<string, unknown>) ?? {},
            agentId: created.id,
            requestedByUserId: ctx.ownerUserId,
          },
          decisionNote: null,
          decidedByUserId: null,
          decidedAt: null,
          updatedAt: new Date(),
        });
        if (sourceIssueIds.length > 0) {
          await issueApprovals.linkManyForApproval(approval.id, sourceIssueIds, {
            userId: ctx.ownerUserId,
          });
        }
      } else if (created.budgetMonthlyCents > 0) {
        await budgets.upsertPolicy(
          ctx.companyId,
          {
            scopeType: "agent",
            scopeId: created.id,
            amount: created.budgetMonthlyCents,
            windowKind: "calendar_month_utc",
          },
          ctx.ownerUserId,
        );
      }

      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.agent_hire_created",
        entityType: "agent",
        entityId: created.id,
        details: {
          tool: "hire_agent",
          approvalId: approval?.id ?? null,
          requiresApproval: company.requireBoardApprovalForNewAgents,
        },
      });
      return {
        content: company.requireBoardApprovalForNewAgents
          ? `Created pending hire ${created.name} and opened approval ${approval?.id ?? ""}.`
          : `Hired agent ${created.name}.`,
        data: {
          agent: await buildHomeAgentDetail(created),
          approval: approval ? redactApprovalPayload(approval) : null,
        },
      };
    },

    update_agent: async (ctx, input) => {
      const agent = await resolveAgentTarget(ctx, input);
      const updated = await agentSvc.update(agent.id, {
        name: input.name === undefined ? undefined : asOptionalString(input.name),
        role: input.role === undefined ? undefined : asOptionalString(input.role),
        title: input.title === undefined ? undefined : asNullableString(input.title),
        icon: input.icon === undefined ? undefined : asNullableString(input.icon),
        reportsTo: input.reportsTo === undefined ? undefined : asNullableString(input.reportsTo),
        capabilities: input.capabilities === undefined ? undefined : asNullableString(input.capabilities),
        adapterType: input.adapterType === undefined ? undefined : asOptionalString(input.adapterType),
        adapterConfig: input.adapterConfig === undefined ? undefined : asOptionalRecordInput(input.adapterConfig, "adapterConfig") ?? undefined,
        runtimeConfig: input.runtimeConfig === undefined ? undefined : asOptionalRecordInput(input.runtimeConfig, "runtimeConfig") ?? undefined,
        budgetMonthlyCents: input.budgetMonthlyCents === undefined ? undefined : Math.max(0, Math.floor(asNumber(input.budgetMonthlyCents, 0))),
        status: input.status === undefined ? undefined : asOptionalString(input.status),
        metadata: input.metadata === undefined ? undefined : asOptionalRecordInput(input.metadata, "metadata"),
      }, {
        recordRevision: {
          createdByUserId: ctx.ownerUserId,
          source: "home_patch",
        },
      });
      if (!updated) throw notFound("Agent not found");
      if (input.budgetMonthlyCents !== undefined) {
        await budgets.upsertPolicy(
          ctx.companyId,
          {
            scopeType: "agent",
            scopeId: updated.id,
            amount: updated.budgetMonthlyCents,
            windowKind: "calendar_month_utc",
          },
          ctx.ownerUserId,
        );
      }
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.agent_updated",
        entityType: "agent",
        entityId: updated.id,
        details: { tool: "update_agent" },
      });
      return {
        content: `Updated agent ${updated.name}.`,
        data: await buildHomeAgentDetail(updated),
      };
    },

    approve_agent: async (ctx, input) => {
      const agent = await resolveAgentTarget(ctx, input);
      const approval = await agentSvc.activatePendingApproval(agent.id);
      if (!approval) throw notFound("Agent not found");
      if (!approval.activated) {
        throw conflict("Only pending approval agents can be approved");
      }
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.agent_approved",
        entityType: "agent",
        entityId: approval.agent.id,
        details: { tool: "approve_agent" },
      });
      return {
        content: `Approved agent ${approval.agent.name}.`,
        data: await buildHomeAgentDetail(approval.agent),
      };
    },

    terminate_agent: async (ctx, input) => {
      const agent = await resolveAgentTarget(ctx, input);
      const terminated = await agentSvc.terminate(agent.id);
      if (!terminated) throw notFound("Agent not found");
      await heartbeat.cancelActiveForAgent(agent.id);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.agent_terminated",
        entityType: "agent",
        entityId: terminated.id,
        details: { tool: "terminate_agent" },
      });
      return {
        content: `Terminated agent ${terminated.name}.`,
        data: terminated,
      };
    },

    delete_agent: async (ctx, input) => {
      const agent = await resolveAgentTarget(ctx, input);
      const removed = await agentSvc.remove(agent.id);
      if (!removed) throw notFound("Agent not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.agent_deleted",
        entityType: "agent",
        entityId: removed.id,
        details: { tool: "delete_agent" },
      });
      return {
        content: `Deleted agent ${removed.name}.`,
        data: { ok: true, agentId: removed.id },
      };
    },

    list_company_heartbeat_runs: async (ctx, input) => {
      const agent = asString(input.agentId) || asString(input.agentRef)
        ? await resolveAgentTarget(ctx, input)
        : null;
      const limit = Math.max(1, Math.min(1000, Math.floor(asNumber(input.limit, 200))));
      const runs = await heartbeat.list(ctx.companyId, agent?.id ?? undefined, limit);
      return {
        content: summarizeRows(runs, "heartbeat run"),
        data: runs,
      };
    },

    list_company_live_runs: async (ctx, input) => {
      const minCount = Math.max(0, Math.min(20, Math.floor(asNumber(input.minCount, 0))));
      const columns = {
        id: heartbeatRuns.id,
        status: heartbeatRuns.status,
        invocationSource: heartbeatRuns.invocationSource,
        triggerDetail: heartbeatRuns.triggerDetail,
        startedAt: heartbeatRuns.startedAt,
        finishedAt: heartbeatRuns.finishedAt,
        createdAt: heartbeatRuns.createdAt,
        agentId: heartbeatRuns.agentId,
        agentName: agents.name,
        adapterType: agents.adapterType,
        livenessState: heartbeatRuns.livenessState,
        livenessReason: heartbeatRuns.livenessReason,
        continuationAttempt: heartbeatRuns.continuationAttempt,
        lastUsefulActionAt: heartbeatRuns.lastUsefulActionAt,
        nextAction: heartbeatRuns.nextAction,
      };
      const liveRuns = await db
        .select(columns)
        .from(heartbeatRuns)
        .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
        .where(and(
          eq(heartbeatRuns.companyId, ctx.companyId),
          or(eq(heartbeatRuns.status, "queued"), eq(heartbeatRuns.status, "running")),
        ))
        .orderBy(desc(heartbeatRuns.createdAt));

      const rows = minCount > 0 && liveRuns.length < minCount
        ? [
          ...liveRuns,
          ...await db
            .select(columns)
            .from(heartbeatRuns)
            .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
            .where(and(
              eq(heartbeatRuns.companyId, ctx.companyId),
              ne(heartbeatRuns.status, "queued"),
              ne(heartbeatRuns.status, "running"),
            ))
            .orderBy(desc(heartbeatRuns.createdAt))
            .limit(minCount - liveRuns.length),
        ]
        : liveRuns;
      return {
        content: summarizeRows(rows, "live run"),
        data: rows,
      };
    },

    get_heartbeat_run: async (ctx, input) => {
      const runId = asString(input.runId);
      if (!runId) throw badRequest("runId is required");
      const run = await heartbeat.getRun(runId);
      if (!run) throw notFound("Heartbeat run not found");
      if (run.companyId !== ctx.companyId) throw forbidden("Heartbeat run does not belong to the active company");
      const retryExhaustedReason = await heartbeat.getRetryExhaustedReason(runId);
      return {
        content: `Loaded heartbeat run ${run.id}.`,
        data: {
          ...run,
          retryExhaustedReason,
        },
      };
    },

    cancel_heartbeat_run: async (ctx, input) => {
      const runId = asString(input.runId);
      if (!runId) throw badRequest("runId is required");
      const existing = await heartbeat.getRun(runId);
      if (!existing) throw notFound("Heartbeat run not found");
      if (existing.companyId !== ctx.companyId) throw forbidden("Heartbeat run does not belong to the active company");
      const run = await heartbeat.cancelRun(runId);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: run?.id ?? null,
        action: "home_tool.heartbeat_run_cancelled",
        entityType: "heartbeat_run",
        entityId: runId,
        details: { tool: "cancel_heartbeat_run" },
      });
      return {
        content: `Cancelled heartbeat run ${runId}.`,
        data: run,
      };
    },

    list_heartbeat_run_events: async (ctx, input) => {
      const runId = asString(input.runId);
      if (!runId) throw badRequest("runId is required");
      const run = await heartbeat.getRun(runId);
      if (!run) throw notFound("Heartbeat run not found");
      if (run.companyId !== ctx.companyId) throw forbidden("Heartbeat run does not belong to the active company");
      const afterSeq = Math.max(0, Math.floor(asNumber(input.afterSeq, 0)));
      const limit = Math.max(1, Math.min(1000, Math.floor(asNumber(input.limit, 200))));
      const events = await heartbeat.listEvents(runId, afterSeq, limit);
      return {
        content: summarizeRows(events, "heartbeat run event"),
        data: events.map((event) => ({
          ...event,
          payload: redactEventPayload(event.payload),
        })),
      };
    },

    list_heartbeat_run_workspace_operations: async (ctx, input) => {
      const runId = asString(input.runId);
      if (!runId) throw badRequest("runId is required");
      const run = await heartbeat.getRun(runId);
      if (!run) throw notFound("Heartbeat run not found");
      if (run.companyId !== ctx.companyId) throw forbidden("Heartbeat run does not belong to the active company");
      const context = asRecord(run.contextSnapshot);
      const executionWorkspaceId = asString(context.executionWorkspaceId);
      const operations = await workspaceOperations.listForRun(runId, executionWorkspaceId);
      return {
        content: summarizeRows(operations, "workspace operation"),
        data: operations,
      };
    },

    list_projects: async (ctx) => {
      const rows = await projectSvc.list(ctx.companyId);
      return { content: summarizeRows(rows, "project"), data: rows };
    },

    get_project: async (ctx, input) => {
      const project = await resolveProjectTarget(ctx, input);
      return {
        content: `Loaded project ${project.name}.`,
        data: project,
      };
    },

    create_project: async (ctx, input) => {
      const name = asString(input.name);
      if (!name) throw badRequest("name is required");
      const goal = asString(input.goalId) || asString(input.goalRef)
        ? await resolveGoalTarget(ctx, input, {
          requiredMessage: "goalId or goalRef is required when linking a goal",
        })
        : null;
      const leadAgent = asString(input.leadAgentId) || asString(input.leadAgentRef)
        ? await resolveAgentTarget(ctx, input, {
          idField: "leadAgentId",
          refField: "leadAgentRef",
          requiredMessage: "leadAgentId or leadAgentRef is required when assigning a lead agent",
        })
        : null;
      const project = await projectSvc.create(ctx.companyId, {
        name,
        description: asNullableString(input.description) ?? null,
        status: asString(input.status) ?? "backlog",
        goalId: goal?.id ?? null,
        goalIds: goal ? [goal.id] : undefined,
        leadAgentId: leadAgent?.id ?? null,
        targetDate: asNullableString(input.targetDate) ?? null,
        color: asNullableString(input.color) ?? null,
        env: input.env === undefined ? null : asOptionalRecordInput(input.env, "env") as any,
        executionWorkspacePolicy: input.executionWorkspacePolicy === undefined
          ? null
          : asOptionalRecordInput(input.executionWorkspacePolicy, "executionWorkspacePolicy") as any,
      });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.project_created",
        entityType: "project",
        entityId: project.id,
        details: { tool: "create_project", name: project.name },
      });
      return {
        content: `Created project ${project.name}.`,
        data: project,
      };
    },

    update_project: async (ctx, input) => {
      const project = await resolveProjectTarget(ctx, input);
      const goal = asString(input.goalId) || asString(input.goalRef)
        ? await resolveGoalTarget(ctx, input, {
          requiredMessage: "goalId or goalRef is required when linking a goal",
        })
        : undefined;
      const leadAgent = asString(input.leadAgentId) || asString(input.leadAgentRef)
        ? await resolveAgentTarget(ctx, input, {
          idField: "leadAgentId",
          refField: "leadAgentRef",
          requiredMessage: "leadAgentId or leadAgentRef is required when assigning a lead agent",
        })
        : undefined;
      const updated = await projectSvc.update(project.id, {
        name: input.name === undefined ? undefined : asOptionalString(input.name),
        description: input.description === undefined ? undefined : asNullableString(input.description),
        status: input.status === undefined ? undefined : asOptionalString(input.status),
        goalId: goal === undefined ? undefined : goal?.id ?? null,
        goalIds: goal === undefined ? undefined : (goal ? [goal.id] : []),
        leadAgentId: leadAgent === undefined ? undefined : leadAgent?.id ?? null,
        targetDate: input.targetDate === undefined ? undefined : asNullableString(input.targetDate),
        color: input.color === undefined ? undefined : asNullableString(input.color),
        env: input.env === undefined ? undefined : asOptionalRecordInput(input.env, "env") as any,
        executionWorkspacePolicy: input.executionWorkspacePolicy === undefined
          ? undefined
          : asOptionalRecordInput(input.executionWorkspacePolicy, "executionWorkspacePolicy") as any,
        archivedAt: input.archivedAt === undefined
          ? undefined
          : (input.archivedAt ? asDate(input.archivedAt, "archivedAt") : null),
      });
      if (!updated) throw notFound("Project not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.project_updated",
        entityType: "project",
        entityId: updated.id,
        details: { tool: "update_project" },
      });
      return {
        content: `Updated project ${updated.name}.`,
        data: updated,
      };
    },

    delete_project: async (ctx, input) => {
      const project = await resolveProjectTarget(ctx, input);
      const removed = await projectSvc.remove(project.id);
      if (!removed) throw notFound("Project not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.project_deleted",
        entityType: "project",
        entityId: project.id,
        details: { tool: "delete_project" },
      });
      return {
        content: `Deleted project ${project.name}.`,
        data: { ok: true, projectId: project.id },
      };
    },

    list_project_workspaces: async (ctx, input) => {
      const project = await resolveProjectTarget(ctx, input);
      const workspaces = await projectSvc.listWorkspaces(project.id);
      return {
        content: summarizeRows(workspaces, "project workspace"),
        data: workspaces,
      };
    },

    get_project_workspace: async (ctx, input) => {
      const { project, workspace } = await resolveProjectWorkspaceToolTarget(ctx, input);
      return {
        content: `Loaded project workspace "${workspace.name}" for ${project.name}.`,
        data: {
          ...workspace,
          projectName: project.name,
        },
      };
    },

    create_project_workspace: async (ctx, input) => {
      const project = await resolveProjectTarget(ctx, input);
      const workspace = await projectSvc.createWorkspace(project.id, {
        name: asOptionalString(input.name),
        sourceType: asOptionalString(input.sourceType),
        cwd: asNullableString(input.cwd) ?? undefined,
        repoUrl: asNullableString(input.repoUrl) ?? undefined,
        repoRef: asNullableString(input.repoRef) ?? undefined,
        defaultRef: asNullableString(input.defaultRef) ?? undefined,
        visibility: asOptionalString(input.visibility),
        setupCommand: asNullableString(input.setupCommand) ?? undefined,
        cleanupCommand: asNullableString(input.cleanupCommand) ?? undefined,
        remoteProvider: asNullableString(input.remoteProvider) ?? undefined,
        remoteWorkspaceRef: asNullableString(input.remoteWorkspaceRef) ?? undefined,
        sharedWorkspaceKey: asNullableString(input.sharedWorkspaceKey) ?? undefined,
        metadata: input.metadata === undefined ? undefined : asOptionalRecordInput(input.metadata, "metadata"),
        runtimeConfig: input.runtimeConfig === undefined ? undefined : asOptionalRecordInput(input.runtimeConfig, "runtimeConfig"),
        isPrimary: input.isPrimary === true,
      });
      if (!workspace) throw badRequest("Invalid project workspace payload");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.project_workspace_created",
        entityType: "project",
        entityId: project.id,
        details: { tool: "create_project_workspace", workspaceId: workspace.id },
      });
      return {
        content: `Created project workspace "${workspace.name}" on ${project.name}.`,
        data: workspace,
      };
    },

    update_project_workspace: async (ctx, input) => {
      const { project, workspace } = await resolveProjectWorkspaceToolTarget(ctx, input);
      const updated = await projectSvc.updateWorkspace(project.id, workspace.id, {
        name: input.name === undefined ? undefined : asOptionalString(input.name),
        sourceType: input.sourceType === undefined ? undefined : asOptionalString(input.sourceType),
        cwd: input.cwd === undefined ? undefined : asNullableString(input.cwd),
        repoUrl: input.repoUrl === undefined ? undefined : asNullableString(input.repoUrl),
        repoRef: input.repoRef === undefined ? undefined : asNullableString(input.repoRef),
        defaultRef: input.defaultRef === undefined ? undefined : asNullableString(input.defaultRef),
        visibility: input.visibility === undefined ? undefined : asOptionalString(input.visibility),
        setupCommand: input.setupCommand === undefined ? undefined : asNullableString(input.setupCommand),
        cleanupCommand: input.cleanupCommand === undefined ? undefined : asNullableString(input.cleanupCommand),
        remoteProvider: input.remoteProvider === undefined ? undefined : asNullableString(input.remoteProvider),
        remoteWorkspaceRef: input.remoteWorkspaceRef === undefined ? undefined : asNullableString(input.remoteWorkspaceRef),
        sharedWorkspaceKey: input.sharedWorkspaceKey === undefined ? undefined : asNullableString(input.sharedWorkspaceKey),
        metadata: input.metadata === undefined ? undefined : asOptionalRecordInput(input.metadata, "metadata"),
        runtimeConfig: input.runtimeConfig === undefined ? undefined : asOptionalRecordInput(input.runtimeConfig, "runtimeConfig"),
        isPrimary: input.isPrimary === undefined ? undefined : input.isPrimary === true,
      });
      if (!updated) throw notFound("Project workspace not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.project_workspace_updated",
        entityType: "project",
        entityId: project.id,
        details: { tool: "update_project_workspace", workspaceId: updated.id },
      });
      return {
        content: `Updated project workspace "${updated.name}" on ${project.name}.`,
        data: updated,
      };
    },

    delete_project_workspace: async (ctx, input) => {
      const { project, workspace } = await resolveProjectWorkspaceToolTarget(ctx, input);
      const removed = await projectSvc.removeWorkspace(project.id, workspace.id);
      if (!removed) throw notFound("Project workspace not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.project_workspace_deleted",
        entityType: "project",
        entityId: project.id,
        details: { tool: "delete_project_workspace", workspaceId: workspace.id },
      });
      return {
        content: `Deleted project workspace "${workspace.name}" from ${project.name}.`,
        data: { ok: true, projectWorkspaceId: workspace.id, projectId: project.id },
      };
    },

    list_execution_workspaces: async (ctx, input) => {
      const issue = asString(input.issueId) || asString(input.issueRef)
        ? await resolveIssueTarget(ctx, input, {
          idField: "issueId",
          refField: "issueRef",
          requiredMessage: "issueId or issueRef is required when filtering by issue",
        })
        : null;
      const project = asString(input.projectId) || asString(input.projectRef)
        ? await resolveProjectTarget(ctx, input, {
          idField: "projectId",
          refField: "projectRef",
          requiredMessage: "projectId or projectRef is required when filtering by project",
        })
        : null;
      const filters = {
        status: asString(input.status) ?? undefined,
        issueId: issue?.id ?? undefined,
        projectId: project?.id ?? undefined,
      };
      const rows = input.summary === true
        ? await executionWorkspaces.listSummaries(ctx.companyId, filters)
        : await executionWorkspaces.list(ctx.companyId, filters);
      return { content: summarizeRows(rows, "execution workspace"), data: rows };
    },

    get_execution_workspace: async (ctx, input) => {
      const workspace = await resolveExecutionWorkspaceTarget(ctx, input);
      return {
        content: `Loaded execution workspace "${workspace.name}".`,
        data: workspace,
      };
    },

    update_execution_workspace: async (ctx, input) => {
      const existing = await resolveExecutionWorkspaceTarget(ctx, input);
      const requestedMetadata = input.metadata === undefined
        ? (existing.metadata as Record<string, unknown> | null)
        : asOptionalRecordInput(input.metadata, "metadata");
      const metadata = input.config === undefined
        ? requestedMetadata
        : mergeExecutionWorkspaceConfig(
          requestedMetadata,
          asOptionalRecordInput(input.config, "config"),
        );
      const updated = await executionWorkspaces.update(existing.id, {
        name: input.name === undefined ? undefined : asOptionalString(input.name),
        cwd: input.cwd === undefined ? undefined : asNullableString(input.cwd),
        repoUrl: input.repoUrl === undefined ? undefined : asNullableString(input.repoUrl),
        baseRef: input.baseRef === undefined ? undefined : asNullableString(input.baseRef),
        branchName: input.branchName === undefined ? undefined : asNullableString(input.branchName),
        providerRef: input.providerRef === undefined ? undefined : asNullableString(input.providerRef),
        status: input.status === undefined ? undefined : asOptionalString(input.status),
        cleanupReason: input.cleanupReason === undefined ? undefined : asNullableString(input.cleanupReason),
        cleanupEligibleAt: input.cleanupEligibleAt === undefined
          ? undefined
          : (input.cleanupEligibleAt ? asDate(input.cleanupEligibleAt, "cleanupEligibleAt") : null),
        metadata,
      });
      if (!updated) throw notFound("Execution workspace not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.execution_workspace_updated",
        entityType: "execution_workspace",
        entityId: updated.id,
        details: { tool: "update_execution_workspace" },
      });
      return {
        content: `Updated execution workspace "${updated.name}".`,
        data: updated,
      };
    },

    archive_execution_workspace: async (ctx, input) => {
      const existing = await resolveExecutionWorkspaceTarget(ctx, input);
      const readiness = await executionWorkspaces.getCloseReadiness(existing.id);
      if (!readiness) throw notFound("Execution workspace not found");
      if (readiness.state === "blocked") {
        throw conflict(readiness.blockingReasons[0] ?? "Execution workspace cannot be archived right now");
      }
      const closedAt = new Date();
      let workspace = await executionWorkspaces.update(existing.id, {
        status: "archived",
        closedAt,
        cleanupReason: null,
      });
      if (!workspace) throw notFound("Execution workspace not found");
      if (existing.mode === "shared_workspace") {
        await db
          .update(issues)
          .set({ executionWorkspaceId: null, updatedAt: new Date() })
          .where(and(eq(issues.companyId, existing.companyId), eq(issues.executionWorkspaceId, existing.id)));
      }
      try {
        await stopRuntimeServicesForExecutionWorkspace({
          db,
          executionWorkspaceId: existing.id,
          workspaceCwd: existing.cwd,
        });
      } catch (error) {
        workspace = (await executionWorkspaces.update(existing.id, {
          status: "cleanup_failed",
          closedAt,
          cleanupReason: error instanceof Error ? error.message : String(error),
        })) ?? workspace;
      }
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.execution_workspace_archived",
        entityType: "execution_workspace",
        entityId: existing.id,
        details: { tool: "archive_execution_workspace" },
      });
      return {
        content: `Archived execution workspace "${workspace.name}".`,
        data: workspace,
      };
    },

    get_active_preview: async (ctx) => {
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

    restart_preview_runtime: async (ctx, input) => {
      const target = await resolveRestartPreviewTarget(ctx, input);
      return target.kind === "execution_workspace"
        ? await controlExecutionWorkspaceRuntime(ctx, target, "restart")
        : await controlProjectWorkspaceRuntime(ctx, target, "restart");
    },

    restart_project_workspace_runtime: async (ctx, input) => {
      const target = await resolveProjectWorkspaceRuntimeTarget(ctx, input);
      return await controlProjectWorkspaceRuntime(ctx, target, "restart");
    },

    start_project_workspace_runtime: async (ctx, input) => {
      const target = await resolveProjectWorkspaceRuntimeTarget(ctx, input);
      return await controlProjectWorkspaceRuntime(ctx, target, "start");
    },

    stop_project_workspace_runtime: async (ctx, input) => {
      const target = await resolveProjectWorkspaceRuntimeTarget(ctx, input);
      return await controlProjectWorkspaceRuntime(ctx, target, "stop");
    },

    restart_execution_workspace_runtime: async (ctx, input) => {
      const target = await resolveExecutionWorkspaceRuntimeTarget(ctx, input);
      return await controlExecutionWorkspaceRuntime(ctx, target, "restart");
    },

    start_execution_workspace_runtime: async (ctx, input) => {
      const target = await resolveExecutionWorkspaceRuntimeTarget(ctx, input);
      return await controlExecutionWorkspaceRuntime(ctx, target, "start");
    },

    stop_execution_workspace_runtime: async (ctx, input) => {
      const target = await resolveExecutionWorkspaceRuntimeTarget(ctx, input);
      return await controlExecutionWorkspaceRuntime(ctx, target, "stop");
    },

    list_goals: async (ctx) => {
      const rows = await goalSvc.list(ctx.companyId);
      return { content: summarizeRows(rows, "goal/manual item"), data: rows };
    },

    get_goal: async (ctx, input) => {
      const goal = await resolveGoalTarget(ctx, input);
      return {
        content: `Loaded goal ${goal.title}.`,
        data: goal,
      };
    },

    create_goal: async (ctx, input) => {
      const title = asString(input.title);
      if (!title) throw badRequest("title is required");
      const parentGoal = asString(input.parentId) || asString(input.parentRef)
        ? await resolveGoalTarget(ctx, input, {
          idField: "parentId",
          refField: "parentRef",
          requiredMessage: "parentId or parentRef is required when linking a parent goal",
        })
        : null;
      const goal = await goalSvc.create(ctx.companyId, {
        title,
        description: asNullableString(input.description) ?? null,
        level: asString(input.level) ?? "company",
        status: asString(input.status) ?? "active",
        parentId: parentGoal?.id ?? null,
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

    update_goal: async (ctx, input) => {
      const goal = await resolveGoalTarget(ctx, input);
      const parentGoal = asString(input.parentId) || asString(input.parentRef)
        ? await resolveGoalTarget(ctx, input, {
          idField: "parentId",
          refField: "parentRef",
          requiredMessage: "parentId or parentRef is required when linking a parent goal",
        })
        : undefined;
      const updated = await goalSvc.update(goal.id, {
        title: input.title === undefined ? undefined : asOptionalString(input.title),
        description: input.description === undefined ? undefined : asNullableString(input.description),
        level: input.level === undefined ? undefined : asOptionalString(input.level),
        status: input.status === undefined ? undefined : asOptionalString(input.status),
        parentId: parentGoal === undefined ? undefined : parentGoal?.id ?? null,
      });
      if (!updated) throw notFound("Goal not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.goal_updated",
        entityType: "goal",
        entityId: updated.id,
        details: { tool: "update_goal" },
      });
      return {
        content: `Updated goal ${updated.title}.`,
        data: updated,
      };
    },

    delete_goal: async (ctx, input) => {
      const goal = await resolveGoalTarget(ctx, input);
      const removed = await goalSvc.remove(goal.id);
      if (!removed) throw notFound("Goal not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.goal_deleted",
        entityType: "goal",
        entityId: goal.id,
        details: { tool: "delete_goal" },
      });
      return {
        content: `Deleted goal ${goal.title}.`,
        data: { ok: true, goalId: goal.id },
      };
    },

    list_routines: async (ctx) => {
      const rows = await routineSvc.list(ctx.companyId);
      return { content: summarizeRows(rows, "routine"), data: rows };
    },

    get_routine: async (ctx, input) => {
      const routine = await resolveRoutineTarget(ctx, input);
      const detail = await routineSvc.getDetail(routine.id);
      if (!detail) throw notFound("Routine not found");
      return {
        content: `Loaded routine ${detail.title}.`,
        data: detail,
      };
    },

    create_routine: async (ctx, input) => {
      const title = asString(input.title);
      if (!title) throw badRequest("title is required");
      const project = asString(input.projectId) || asString(input.projectRef)
        ? await resolveProjectTarget(ctx, input, {
          requiredMessage: "projectId or projectRef is required when linking a project",
        })
        : null;
      const goal = asString(input.goalId) || asString(input.goalRef)
        ? await resolveGoalTarget(ctx, input, {
          requiredMessage: "goalId or goalRef is required when linking a goal",
        })
        : null;
      const assignee = asString(input.assigneeAgentId) || asString(input.assigneeAgentRef)
        ? await resolveAgentTarget(ctx, input, {
          idField: "assigneeAgentId",
          refField: "assigneeAgentRef",
          requiredMessage: "assigneeAgentId or assigneeAgentRef is required when assigning a routine",
        })
        : null;
      const parentIssue = asString(input.parentIssueId) || asString(input.parentIssueRef)
        ? await resolveIssueTarget(ctx, input, {
          idField: "parentIssueId",
          refField: "parentIssueRef",
          requiredMessage: "parentIssueId or parentIssueRef is required when linking a parent issue",
        })
        : null;
      const routine = await routineSvc.create(ctx.companyId, {
        title,
        description: asNullableString(input.description) ?? null,
        projectId: project?.id ?? null,
        goalId: goal?.id ?? null,
        parentIssueId: parentIssue?.id ?? null,
        assigneeAgentId: assignee?.id ?? null,
        priority: (asString(input.priority) ?? "medium") as any,
        status: (asString(input.status) ?? "draft") as any,
        concurrencyPolicy: (asString(input.concurrencyPolicy) ?? "allow") as any,
        catchUpPolicy: (asString(input.catchUpPolicy) ?? "skip") as any,
        variables: Array.isArray(input.variables) ? input.variables as any : [],
      }, {
        userId: ctx.ownerUserId,
      });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.routine_created",
        entityType: "routine",
        entityId: routine.id,
        details: { tool: "create_routine", title: routine.title },
      });
      return {
        content: `Created routine ${routine.title}.`,
        data: routine,
      };
    },

    update_routine: async (ctx, input) => {
      const routine = await resolveRoutineTarget(ctx, input);
      const project = asString(input.projectId) || asString(input.projectRef)
        ? await resolveProjectTarget(ctx, input, {
          requiredMessage: "projectId or projectRef is required when linking a project",
        })
        : undefined;
      const goal = asString(input.goalId) || asString(input.goalRef)
        ? await resolveGoalTarget(ctx, input, {
          requiredMessage: "goalId or goalRef is required when linking a goal",
        })
        : undefined;
      const assignee = asString(input.assigneeAgentId) || asString(input.assigneeAgentRef)
        ? await resolveAgentTarget(ctx, input, {
          idField: "assigneeAgentId",
          refField: "assigneeAgentRef",
          requiredMessage: "assigneeAgentId or assigneeAgentRef is required when assigning a routine",
        })
        : undefined;
      const parentIssue = asString(input.parentIssueId) || asString(input.parentIssueRef)
        ? await resolveIssueTarget(ctx, input, {
          idField: "parentIssueId",
          refField: "parentIssueRef",
          requiredMessage: "parentIssueId or parentIssueRef is required when linking a parent issue",
        })
        : undefined;
      const updated = await routineSvc.update(routine.id, {
        title: input.title === undefined ? undefined : asOptionalString(input.title),
        description: input.description === undefined ? undefined : asNullableString(input.description),
        projectId: project === undefined ? undefined : project?.id ?? null,
        goalId: goal === undefined ? undefined : goal?.id ?? null,
        parentIssueId: parentIssue === undefined ? undefined : parentIssue?.id ?? null,
        assigneeAgentId: assignee === undefined ? undefined : assignee?.id ?? null,
        priority: input.priority === undefined ? undefined : asOptionalString(input.priority) as any,
        status: input.status === undefined ? undefined : asOptionalString(input.status) as any,
        concurrencyPolicy: input.concurrencyPolicy === undefined ? undefined : asOptionalString(input.concurrencyPolicy) as any,
        catchUpPolicy: input.catchUpPolicy === undefined ? undefined : asOptionalString(input.catchUpPolicy) as any,
        variables: input.variables === undefined ? undefined : input.variables as any,
      }, {
        userId: ctx.ownerUserId,
      });
      if (!updated) throw notFound("Routine not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.routine_updated",
        entityType: "routine",
        entityId: updated.id,
        details: { tool: "update_routine" },
      });
      return {
        content: `Updated routine ${updated.title}.`,
        data: updated,
      };
    },

    list_routine_runs: async (ctx, input) => {
      const routine = await resolveRoutineTarget(ctx, input);
      const runs = await routineSvc.listRuns(routine.id, Math.max(1, Math.min(200, Math.floor(asNumber(input.limit, 50)))));
      return {
        content: summarizeRows(runs, "routine run"),
        data: runs,
      };
    },

    create_routine_trigger: async (ctx, input) => {
      const routine = await resolveRoutineTarget(ctx, input);
      const kind = asString(input.kind);
      if (!kind) throw badRequest("kind is required");
      const created = await routineSvc.createTrigger(routine.id, {
        kind: kind as any,
        label: asNullableString(input.label) ?? null,
        enabled: input.enabled === undefined ? true : input.enabled === true,
        cronExpression: asNullableString(input.cronExpression) ?? undefined,
        timezone: asNullableString(input.timezone) ?? undefined,
        signingMode: (asNullableString(input.signingMode) ?? "bearer") as any,
        replayWindowSec: input.replayWindowSec === undefined ? 300 : Math.max(0, Math.floor(asNumber(input.replayWindowSec, 0))),
      }, {
        userId: ctx.ownerUserId,
      });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.routine_trigger_created",
        entityType: "routine_trigger",
        entityId: created.trigger.id,
        details: { tool: "create_routine_trigger", routineId: routine.id },
      });
      return {
        content: `Created ${created.trigger.kind} trigger for ${routine.title}.`,
        data: {
          trigger: created.trigger,
          secretMaterial: created.secretMaterial ? "***REDACTED***" : null,
        },
      };
    },

    update_routine_trigger: async (ctx, input) => {
      const triggerId = asString(input.triggerId);
      if (!triggerId) throw badRequest("triggerId is required");
      const trigger = await routineSvc.getTrigger(triggerId);
      if (!trigger) throw notFound("Routine trigger not found");
      const routine = await routineSvc.get(trigger.routineId);
      if (!routine || routine.companyId !== ctx.companyId) throw forbidden("Routine trigger does not belong to the active company");
      const updated = await routineSvc.updateTrigger(trigger.id, {
        label: input.label === undefined ? undefined : asNullableString(input.label),
        enabled: input.enabled === undefined ? undefined : input.enabled === true,
        cronExpression: input.cronExpression === undefined ? undefined : asNullableString(input.cronExpression),
        timezone: input.timezone === undefined ? undefined : asNullableString(input.timezone),
        signingMode: input.signingMode === undefined ? undefined : asNullableString(input.signingMode) as any,
        replayWindowSec: input.replayWindowSec === undefined ? undefined : Math.max(0, Math.floor(asNumber(input.replayWindowSec, 0))),
      }, {
        userId: ctx.ownerUserId,
      });
      if (!updated) throw notFound("Routine trigger not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.routine_trigger_updated",
        entityType: "routine_trigger",
        entityId: updated.id,
        details: { tool: "update_routine_trigger", routineId: routine.id },
      });
      return {
        content: `Updated trigger ${updated.id} for ${routine.title}.`,
        data: updated,
      };
    },

    delete_routine_trigger: async (ctx, input) => {
      const triggerId = asString(input.triggerId);
      if (!triggerId) throw badRequest("triggerId is required");
      const trigger = await routineSvc.getTrigger(triggerId);
      if (!trigger) throw notFound("Routine trigger not found");
      const routine = await routineSvc.get(trigger.routineId);
      if (!routine || routine.companyId !== ctx.companyId) throw forbidden("Routine trigger does not belong to the active company");
      const deleted = await routineSvc.deleteTrigger(triggerId);
      if (!deleted) throw notFound("Routine trigger not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.routine_trigger_deleted",
        entityType: "routine_trigger",
        entityId: triggerId,
        details: { tool: "delete_routine_trigger", routineId: routine.id },
      });
      return {
        content: `Deleted trigger ${triggerId} from ${routine.title}.`,
        data: { ok: true, triggerId },
      };
    },

    run_routine: async (ctx, input) => {
      const routine = await resolveRoutineTarget(ctx, input);
      const project = asString(input.projectId) || asString(input.projectRef)
        ? await resolveProjectTarget(ctx, input, {
          requiredMessage: "projectId or projectRef is required when overriding the project",
        })
        : null;
      const assignee = asString(input.assigneeAgentId) || asString(input.assigneeAgentRef)
        ? await resolveAgentTarget(ctx, input, {
          idField: "assigneeAgentId",
          refField: "assigneeAgentRef",
          requiredMessage: "assigneeAgentId or assigneeAgentRef is required when overriding the assignee",
        })
        : null;
      const run = await routineSvc.runRoutine(routine.id, {
        triggerId: asNullableString(input.triggerId) ?? null,
        source: (asString(input.source) ?? "manual") as any,
        payload: input.payload === undefined ? null : asOptionalRecordInput(input.payload, "payload") as any,
        variables: input.variables === undefined ? null : asOptionalRecordInput(input.variables, "variables") as any,
        projectId: project?.id ?? null,
        assigneeAgentId: assignee?.id ?? null,
        idempotencyKey: asNullableString(input.idempotencyKey) ?? null,
        executionWorkspaceId: asNullableString(input.executionWorkspaceId) ?? null,
        executionWorkspacePreference: asNullableString(input.executionWorkspacePreference) as any,
        executionWorkspaceSettings: input.executionWorkspaceSettings === undefined
          ? null
          : asOptionalRecordInput(input.executionWorkspaceSettings, "executionWorkspaceSettings") as any,
      });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.routine_run_triggered",
        entityType: "routine_run",
        entityId: run.id,
        details: { tool: "run_routine", routineId: routine.id },
      });
      return {
        content: `Triggered routine ${routine.title}.`,
        data: run,
      };
    },

    list_approvals: async (ctx, input) => {
      const rows = await approvalSvc.list(ctx.companyId, asString(input.status) ?? undefined);
      return { content: summarizeRows(rows, "approval"), data: rows.map(redactApprovalPayload) };
    },

    get_approval: async (ctx, input) => {
      const approval = await resolveApprovalTarget(ctx, input);
      return {
        content: `Loaded approval ${approval.id}.`,
        data: redactApprovalPayload(approval),
      };
    },

    create_approval: async (ctx, input) => {
      const type = asString(input.type);
      if (!type) throw badRequest("type is required");
      const payload = asOptionalRecordInput(input.payload, "payload");
      if (!payload) throw badRequest("payload is required");
      const issueIds = Array.from(new Set([
        ...asStringArray(input.issueIds),
        ...(asString(input.issueId) || asString(input.issueRef)
          ? [(await resolveIssueTarget(ctx, input)).id]
          : []),
      ]));
      const approval = await approvalSvc.create(ctx.companyId, {
        type: type as any,
        requestedByAgentId: null,
        requestedByUserId: ctx.ownerUserId,
        payload,
        status: "pending",
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
        updatedAt: new Date(),
      });
      if (issueIds.length > 0) {
        await issueApprovals.linkManyForApproval(approval.id, issueIds, { userId: ctx.ownerUserId });
      }
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.approval_created",
        entityType: "approval",
        entityId: approval.id,
        details: { tool: "create_approval", type, issueIds },
      });
      return {
        content: `Created approval ${approval.id}.`,
        data: redactApprovalPayload(approval),
      };
    },

    approve_approval: async (ctx, input) => {
      const approval = await resolveApprovalTarget(ctx, input);
      const result = await approvalSvc.approve(approval.id, ctx.ownerUserId, asNullableString(input.decisionNote) ?? null);
      const linkedIssues = await issueApprovals.listIssuesForApproval(approval.id);
      if (result.applied && result.approval.requestedByAgentId) {
        await heartbeat.wakeup(result.approval.requestedByAgentId, {
          source: "automation",
          triggerDetail: "system",
          reason: "approval_approved",
          payload: {
            approvalId: result.approval.id,
            issueIds: linkedIssues.map((issue) => issue.id),
          },
          requestedByActorType: "user",
          requestedByActorId: ctx.ownerUserId,
          contextSnapshot: {
            source: "approval.approved",
            approvalId: result.approval.id,
            issueIds: linkedIssues.map((issue) => issue.id),
          },
        }).catch(() => null);
      }
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.approval_approved",
        entityType: "approval",
        entityId: approval.id,
        details: { tool: "approve_approval", applied: result.applied },
      });
      return {
        content: result.applied ? `Approved approval ${approval.id}.` : `Approval ${approval.id} was already approved.`,
        data: redactApprovalPayload(result.approval),
      };
    },

    reject_approval: async (ctx, input) => {
      const approval = await resolveApprovalTarget(ctx, input);
      const result = await approvalSvc.reject(approval.id, ctx.ownerUserId, asNullableString(input.decisionNote) ?? null);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.approval_rejected",
        entityType: "approval",
        entityId: approval.id,
        details: { tool: "reject_approval", applied: result.applied },
      });
      return {
        content: result.applied ? `Rejected approval ${approval.id}.` : `Approval ${approval.id} was already rejected.`,
        data: redactApprovalPayload(result.approval),
      };
    },

    request_approval_revision: async (ctx, input) => {
      const approval = await resolveApprovalTarget(ctx, input);
      const updated = await approvalSvc.requestRevision(approval.id, ctx.ownerUserId, asNullableString(input.decisionNote) ?? null);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.approval_revision_requested",
        entityType: "approval",
        entityId: approval.id,
        details: { tool: "request_approval_revision" },
      });
      return {
        content: `Requested revision for approval ${approval.id}.`,
        data: redactApprovalPayload(updated),
      };
    },

    resubmit_approval: async (ctx, input) => {
      const approval = await resolveApprovalTarget(ctx, input);
      const payload = input.payload === undefined ? undefined : asOptionalRecordInput(input.payload, "payload") ?? {};
      const updated = await approvalSvc.resubmit(approval.id, payload);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.approval_resubmitted",
        entityType: "approval",
        entityId: approval.id,
        details: { tool: "resubmit_approval" },
      });
      return {
        content: `Resubmitted approval ${approval.id}.`,
        data: redactApprovalPayload(updated),
      };
    },

    list_approval_comments: async (ctx, input) => {
      const approval = await resolveApprovalTarget(ctx, input);
      const comments = await approvalSvc.listComments(approval.id);
      return {
        content: summarizeRows(comments, "approval comment"),
        data: comments,
      };
    },

    add_approval_comment: async (ctx, input) => {
      const approval = await resolveApprovalTarget(ctx, input);
      const body = asString(input.body);
      if (!body) throw badRequest("body is required");
      const comment = await approvalSvc.addComment(approval.id, body, { userId: ctx.ownerUserId });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.approval_comment_added",
        entityType: "approval",
        entityId: approval.id,
        details: { tool: "add_approval_comment", commentId: comment.id },
      });
      return {
        content: `Added a comment to approval ${approval.id}.`,
        data: comment,
      };
    },

    list_approval_issues: async (ctx, input) => {
      const approval = await resolveApprovalTarget(ctx, input);
      const linkedIssues = await issueApprovals.listIssuesForApproval(approval.id);
      return {
        content: summarizeRows(linkedIssues, "approval-linked issue"),
        data: linkedIssues,
      };
    },

    get_costs_and_budgets: async (ctx) => {
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

    get_cost_summary: async (ctx, input) => {
      const summary = await costs.summary(ctx.companyId, {
        from: asOptionalDate(input.from, "from"),
        to: asOptionalDate(input.to, "to"),
      });
      return {
        content: `Loaded cost summary: ${summary.spendCents} cents spent.`,
        data: summary,
      };
    },

    list_costs_by_agent: async (ctx, input) => {
      const rows = await costs.byAgent(ctx.companyId, {
        from: asOptionalDate(input.from, "from"),
        to: asOptionalDate(input.to, "to"),
      });
      return { content: summarizeRows(rows, "agent cost row"), data: rows };
    },

    list_costs_by_project: async (ctx, input) => {
      const rows = await costs.byProject(ctx.companyId, {
        from: asOptionalDate(input.from, "from"),
        to: asOptionalDate(input.to, "to"),
      });
      return { content: summarizeRows(rows, "project cost row"), data: rows };
    },

    get_finance_summary: async (ctx, input) => {
      const summary = await finance.summary(ctx.companyId, {
        from: asOptionalDate(input.from, "from"),
        to: asOptionalDate(input.to, "to"),
      });
      return {
        content: `Loaded finance summary: ${summary.netCents} cents net.`,
        data: summary,
      };
    },

    list_finance_events: async (ctx, input) => {
      const rows = await finance.list(
        ctx.companyId,
        {
          from: asOptionalDate(input.from, "from"),
          to: asOptionalDate(input.to, "to"),
        },
        Math.max(1, Math.min(500, Math.floor(asNumber(input.limit, 100)))),
      );
      return {
        content: summarizeRows(rows, "finance event"),
        data: rows,
      };
    },

    list_quota_windows: async (ctx) => {
      const company = await companiesSvc.getById(ctx.companyId);
      if (!company) throw notFound("Company not found");
      const rows = await fetchAllQuotaWindows();
      return {
        content: summarizeRows(rows, "quota window"),
        data: rows,
      };
    },

    get_budget_overview: async (ctx) => {
      const overview = await budgets.overview(ctx.companyId);
      return {
        content: `Loaded budget overview with ${overview.activeIncidents.length} active incident${overview.activeIncidents.length === 1 ? "" : "s"}.`,
        data: overview,
      };
    },

    list_budget_incidents: async (ctx) => {
      const overview = await budgets.overview(ctx.companyId);
      return {
        content: summarizeRows(overview.activeIncidents, "budget incident"),
        data: overview.activeIncidents,
      };
    },

    list_company_skills: createRowsHandler("company skill", async (ctx) => await companySkills.list(ctx.companyId)),

    get_company_skill: async (ctx, input) => {
      const skill = await resolveCompanySkillTarget(ctx, input);
      const detail = await companySkills.detail(ctx.companyId, skill.id);
      if (!detail) throw notFound("Company skill not found");
      return {
        content: `Loaded company skill ${detail.name}.`,
        data: detail,
      };
    },

    get_company_skill_update_status: async (ctx, input) => {
      const skill = await resolveCompanySkillTarget(ctx, input);
      const status = await companySkills.updateStatus(ctx.companyId, skill.id);
      if (!status) throw notFound("Company skill not found");
      return {
        content: `Loaded update status for ${skill.name}.`,
        data: status,
      };
    },

    read_company_skill_file: async (ctx, input) => {
      const skill = await resolveCompanySkillTarget(ctx, input);
      const detail = await companySkills.readFile(ctx.companyId, skill.id, asString(input.path) ?? "SKILL.md");
      if (!detail) throw notFound("Company skill file not found");
      return {
        content: `Read ${detail.path} from ${skill.name}.`,
        data: detail,
      };
    },

    create_company_skill: async (ctx, input) => {
      const name = asString(input.name);
      if (!name) throw badRequest("name is required");
      const created = await companySkills.createLocalSkill(ctx.companyId, {
        name,
        slug: asNullableString(input.slug) ?? undefined,
        description: asNullableString(input.description) ?? undefined,
        markdown: asNullableString(input.markdown) ?? undefined,
      });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_skill_created",
        entityType: "company_skill",
        entityId: created.id,
        details: { tool: "create_company_skill", slug: created.slug },
      });
      return {
        content: `Created company skill ${created.name}.`,
        data: created,
      };
    },

    update_company_skill_file: async (ctx, input) => {
      const skill = await resolveCompanySkillTarget(ctx, input);
      const path = asString(input.path);
      if (!path) throw badRequest("path is required");
      if (typeof input.content !== "string") throw badRequest("content is required");
      const detail = await companySkills.updateFile(ctx.companyId, skill.id, path, input.content);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_skill_file_updated",
        entityType: "company_skill",
        entityId: skill.id,
        details: { tool: "update_company_skill_file", path: detail.path },
      });
      return {
        content: `Updated ${detail.path} for ${skill.name}.`,
        data: detail,
      };
    },

    import_company_skills: async (ctx, input) => {
      const source = asString(input.source);
      if (!source) throw badRequest("source is required");
      const result = await companySkills.importFromSource(ctx.companyId, source);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_skills_imported",
        entityType: "company",
        entityId: ctx.companyId,
        details: { tool: "import_company_skills", source, importedCount: result.imported.length },
      });
      return {
        content: `Imported ${result.imported.length} company skill${result.imported.length === 1 ? "" : "s"}.`,
        data: result,
      };
    },

    scan_project_workspaces_for_company_skills: async (ctx, input) => {
      const projectIds = new Set<string>(input.projectIds === undefined ? [] : asOrderedUuidArray(input.projectIds, "projectIds"));
      const workspaceIds = new Set<string>(input.workspaceIds === undefined ? [] : asOrderedUuidArray(input.workspaceIds, "workspaceIds"));
      if (asString(input.projectId) || asString(input.projectRef)) {
        projectIds.add((await resolveProjectTarget(ctx, input)).id);
      }
      if (asString(input.projectWorkspaceId) || asString(input.projectWorkspaceRef)) {
        const { workspace } = await resolveProjectWorkspaceToolTarget(ctx, input);
        workspaceIds.add(workspace.id);
      }
      const result = await companySkills.scanProjectWorkspaces(ctx.companyId, {
        projectIds: projectIds.size > 0 ? [...projectIds] : undefined,
        workspaceIds: workspaceIds.size > 0 ? [...workspaceIds] : undefined,
      });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_skills_scanned",
        entityType: "company",
        entityId: ctx.companyId,
        details: {
          tool: "scan_project_workspaces_for_company_skills",
          scannedProjects: result.scannedProjects,
          scannedWorkspaces: result.scannedWorkspaces,
          importedCount: result.imported.length,
          updatedCount: result.updated.length,
        },
      });
      return {
        content: `Scanned ${result.scannedWorkspaces} workspace${result.scannedWorkspaces === 1 ? "" : "s"} for company skills.`,
        data: result,
      };
    },

    delete_company_skill: async (ctx, input) => {
      const skill = await resolveCompanySkillTarget(ctx, input);
      const removed = await companySkills.deleteSkill(ctx.companyId, skill.id);
      if (!removed) throw notFound("Company skill not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_skill_deleted",
        entityType: "company_skill",
        entityId: skill.id,
        details: { tool: "delete_company_skill", slug: removed.slug },
      });
      return {
        content: `Deleted company skill ${removed.name}.`,
        data: removed,
      };
    },

    create_company_image_asset: async (ctx, input) => {
      const contentType = asString(input.contentType)?.toLowerCase();
      if (!contentType) throw badRequest("contentType is required");
      if (contentType !== SVG_CONTENT_TYPE && (!contentType.startsWith("image/") || !isAllowedContentType(contentType))) {
        throw badRequest(`Unsupported image content type: ${contentType}`);
      }
      const body = decodeBase64Bytes(asString(input.contentBase64) ?? "", "contentBase64");
      if (body.length > MAX_ATTACHMENT_BYTES) {
        throw badRequest(`Image exceeds ${MAX_ATTACHMENT_BYTES} bytes`);
      }
      const metadata = createAssetImageMetadataSchema.parse({
        namespace: asOptionalString(input.namespace),
      });
      const stored = await getStorageService().putFile({
        companyId: ctx.companyId,
        namespace: `assets/${metadata.namespace ?? "general"}`,
        originalFilename: asNullableString(input.filename) ?? null,
        contentType,
        body,
      });
      const asset = await assetsSvc.create(ctx.companyId, {
        provider: stored.provider,
        objectKey: stored.objectKey,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        originalFilename: stored.originalFilename,
        createdByAgentId: null,
        createdByUserId: ctx.ownerUserId,
      });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.asset_created",
        entityType: "asset",
        entityId: asset.id,
        details: { tool: "create_company_image_asset", contentType: asset.contentType },
      });
      return {
        content: `Created company image asset ${asset.originalFilename ?? asset.id}.`,
        data: toCompanyAssetMetadata(asset),
      };
    },

    get_company_asset: async (ctx, input) => {
      const asset = await resolveAssetTarget(ctx, input);
      const company = await companiesSvc.getById(ctx.companyId);
      return {
        content: `Loaded company asset ${asset.originalFilename ?? asset.id}.`,
        data: toCompanyAssetMetadata(asset, {
          isCompanyLogo: company?.logoAssetId === asset.id,
        }),
      };
    },

    set_company_logo: async (ctx, input) => {
      const asset = await resolveAssetTarget(ctx, input);
      if (!ALLOWED_COMPANY_LOGO_CONTENT_TYPES.has(asset.contentType.toLowerCase())) {
        throw badRequest(`Unsupported image type: ${asset.contentType}`);
      }
      const company = await companiesSvc.update(ctx.companyId, {
        logoAssetId: asset.id,
      });
      if (!company) throw notFound("Company not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_logo_set",
        entityType: "company",
        entityId: ctx.companyId,
        details: { tool: "set_company_logo", assetId: asset.id },
      });
      return {
        content: `Set the company logo to ${asset.originalFilename ?? asset.id}.`,
        data: company,
      };
    },

    update_company_branding: async (ctx, input) => {
      const logoAsset = asString(input.logoAssetId) || asString(input.logoAssetRef)
        ? await resolveAssetTarget(ctx, input, {
          idField: "logoAssetId",
          refField: "logoAssetRef",
          requiredMessage: "logoAssetId or logoAssetRef is required when setting the company logo",
        })
        : null;
      if (logoAsset && !ALLOWED_COMPANY_LOGO_CONTENT_TYPES.has(logoAsset.contentType.toLowerCase())) {
        throw badRequest(`Unsupported image type: ${logoAsset.contentType}`);
      }
      const patch = updateCompanyBrandingSchema.parse({
        name: input.name === undefined ? undefined : asOptionalString(input.name),
        description: input.description === undefined ? undefined : asNullableString(input.description),
        brandColor: input.brandColor === undefined ? undefined : asNullableString(input.brandColor),
        logoAssetId: input.clearLogo === true ? null : logoAsset?.id,
      });
      const company = await companiesSvc.update(ctx.companyId, patch);
      if (!company) throw notFound("Company not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_branding_updated",
        entityType: "company",
        entityId: ctx.companyId,
        details: { tool: "update_company_branding" },
      });
      return {
        content: `Updated company branding for ${company.name}.`,
        data: company,
      };
    },

    update_company_settings: async (ctx, input) => {
      const existingCompany = await companiesSvc.getById(ctx.companyId);
      if (!existingCompany) throw notFound("Company not found");
      const patch = updateCompanySchema.parse({
        requireBoardApprovalForNewAgents:
          input.requireBoardApprovalForNewAgents === undefined
            ? undefined
            : asOptionalBoolean(input.requireBoardApprovalForNewAgents),
        feedbackDataSharingEnabled:
          input.feedbackDataSharingEnabled === undefined
            ? undefined
            : asOptionalBoolean(input.feedbackDataSharingEnabled),
        feedbackDataSharingTermsVersion:
          input.feedbackDataSharingTermsVersion === undefined
            ? undefined
            : asNullableString(input.feedbackDataSharingTermsVersion),
      });
      if (Object.keys(patch).length === 0) {
        throw badRequest("At least one company setting field is required");
      }
      if (patch.feedbackDataSharingEnabled === true && !existingCompany.feedbackDataSharingEnabled) {
        patch.feedbackDataSharingConsentAt = new Date();
        patch.feedbackDataSharingConsentByUserId = ctx.ownerUserId;
        patch.feedbackDataSharingTermsVersion =
          typeof patch.feedbackDataSharingTermsVersion === "string" && patch.feedbackDataSharingTermsVersion.length > 0
            ? patch.feedbackDataSharingTermsVersion
            : DEFAULT_FEEDBACK_DATA_SHARING_TERMS_VERSION;
      }
      const company = await companiesSvc.update(ctx.companyId, patch);
      if (!company) throw notFound("Company not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_settings_updated",
        entityType: "company",
        entityId: ctx.companyId,
        details: { tool: "update_company_settings" },
      });
      return {
        content: `Updated company settings for ${company.name}.`,
        data: company,
      };
    },

    get_company_user_profile: async (ctx, input) => {
      const user = await resolveCompanyUserTarget(ctx, input);
      const profile = await buildCompanyUserProfile(ctx.companyId, user.principalId);
      return {
        content: `Loaded profile for ${profile.user.name ?? profile.user.email ?? profile.user.id}.`,
        data: profile,
      };
    },

    get_company_sidebar_badges: async (ctx) => {
      const visibleJoinRequests = collapseDuplicatePendingHumanJoinRequests(
        await db
          .select({
            id: joinRequests.id,
            requestType: joinRequests.requestType,
            status: joinRequests.status,
            requestingUserId: joinRequests.requestingUserId,
            requestEmailSnapshot: joinRequests.requestEmailSnapshot,
            updatedAt: joinRequests.updatedAt,
            createdAt: joinRequests.createdAt,
          })
          .from(joinRequests)
          .where(and(eq(joinRequests.companyId, ctx.companyId), eq(joinRequests.status, "pending_approval"))),
      ).map(({ id, updatedAt, createdAt }) => ({
        id,
        updatedAt,
        createdAt,
      }));
      const badges = await sidebarBadges.get(ctx.companyId, {
        joinRequests: visibleJoinRequests,
      });
      const summary = await dashboard.summary(ctx.companyId);
      const hasFailedRuns = badges.failedRuns > 0;
      const alertsCount =
        (summary.agents.error > 0 && !hasFailedRuns ? 1 : 0)
        + (summary.costs.monthBudgetCents > 0 && summary.costs.monthUtilizationPercent >= 80 ? 1 : 0);
      badges.inbox = badges.failedRuns + alertsCount + badges.joinRequests + badges.approvals;
      return {
        content: `Loaded sidebar badges with ${badges.inbox} inbox item${badges.inbox === 1 ? "" : "s"}.`,
        data: badges,
      };
    },

    get_global_sidebar_preferences: async (ctx) => {
      const preferences = await sidebarPreferences.getCompanyOrder(ctx.ownerUserId);
      return {
        content: "Loaded global sidebar preferences.",
        data: preferences,
      };
    },

    update_global_sidebar_preferences: async (ctx, input) => {
      const orderedIds = asOrderedUuidArray(input.orderedIds, "orderedIds");
      const preferences = await sidebarPreferences.upsertCompanyOrder(ctx.ownerUserId, orderedIds);
      return {
        content: `Updated global sidebar preferences with ${preferences.orderedIds.length} company ID${preferences.orderedIds.length === 1 ? "" : "s"}.`,
        data: preferences,
      };
    },

    get_company_sidebar_preferences: async (ctx) => {
      const preferences = await sidebarPreferences.getProjectOrder(ctx.companyId, ctx.ownerUserId);
      return {
        content: "Loaded company sidebar preferences.",
        data: preferences,
      };
    },

    update_company_sidebar_preferences: async (ctx, input) => {
      const orderedIds = asOrderedUuidArray(input.orderedIds, "orderedIds");
      const preferences = await sidebarPreferences.upsertProjectOrder(ctx.companyId, ctx.ownerUserId, orderedIds);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_sidebar_preferences_updated",
        entityType: "company",
        entityId: ctx.companyId,
        details: { tool: "update_company_sidebar_preferences", orderedIds: preferences.orderedIds },
      });
      return {
        content: `Updated company sidebar preferences with ${preferences.orderedIds.length} project ID${preferences.orderedIds.length === 1 ? "" : "s"}.`,
        data: preferences,
      };
    },

    list_secret_providers: async () => {
      const rows = secrets.listProviders();
      return {
        content: summarizeRows(rows, "secret provider"),
        data: rows,
      };
    },

    list_secret_metadata: async (ctx) => {
      const rows = await secrets.list(ctx.companyId);
      return {
        content: summarizeRows(rows, "secret metadata item"),
        data: rows.map(redactSecretRow),
      };
    },

    create_company_secret: async (ctx, input) => {
      const name = asString(input.name);
      const value = asString(input.value);
      if (!name) throw badRequest("name is required");
      if (!value) throw badRequest("value is required");
      const provider = asString(input.provider) ?? process.env.PAPERCLIP_SECRETS_PROVIDER ?? "local_encrypted";
      const created = await secrets.create(ctx.companyId, {
        name,
        provider: provider as any,
        value,
        description: asNullableString(input.description) ?? null,
        externalRef: asNullableString(input.externalRef) ?? null,
      }, {
        userId: ctx.ownerUserId,
      });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.secret_created",
        entityType: "secret",
        entityId: created.id,
        details: { tool: "create_company_secret", provider: created.provider },
      });
      return {
        content: `Created company secret ${created.name}.`,
        data: redactSecretRow(created),
      };
    },

    update_company_secret: async (ctx, input) => {
      const secret = await resolveSecretTarget(ctx, input);
      const updated = await secrets.update(secret.id, {
        name: input.name === undefined ? undefined : asOptionalString(input.name) ?? secret.name,
        description: input.description === undefined ? undefined : asNullableString(input.description),
        externalRef: input.externalRef === undefined ? undefined : asNullableString(input.externalRef),
      });
      if (!updated) throw notFound("Secret not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.secret_updated",
        entityType: "secret",
        entityId: updated.id,
        details: { tool: "update_company_secret" },
      });
      return {
        content: `Updated company secret ${updated.name}.`,
        data: redactSecretRow(updated),
      };
    },

    rotate_company_secret: async (ctx, input) => {
      const secret = await resolveSecretTarget(ctx, input);
      const value = asString(input.value);
      if (!value) throw badRequest("value is required");
      const rotated = await secrets.rotate(secret.id, {
        value,
        externalRef: asNullableString(input.externalRef) ?? secret.externalRef ?? null,
      }, {
        userId: ctx.ownerUserId,
      });
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.secret_rotated",
        entityType: "secret",
        entityId: rotated.id,
        details: { tool: "rotate_company_secret", latestVersion: rotated.latestVersion },
      });
      return {
        content: `Rotated company secret ${rotated.name}.`,
        data: redactSecretRow(rotated),
      };
    },

    delete_company_secret: async (ctx, input) => {
      const secret = await resolveSecretTarget(ctx, input);
      const removed = await secrets.remove(secret.id);
      if (!removed) throw notFound("Secret not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.secret_deleted",
        entityType: "secret",
        entityId: removed.id,
        details: { tool: "delete_company_secret" },
      });
      return {
        content: `Deleted company secret ${removed.name}.`,
        data: { ok: true, secretId: removed.id },
      };
    },

    update_budget: async (ctx, input) => {
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

    resolve_budget_incident: async (ctx, input) => {
      const incidentId = asString(input.incidentId);
      if (!incidentId) throw badRequest("incidentId is required");
      const incident = await budgets.resolveIncident(ctx.companyId, incidentId, {
        action: asString(input.action) as any,
        amount: input.amount === undefined ? undefined : Math.max(0, Math.floor(asNumber(input.amount, 0))),
        decisionNote: asNullableString(input.decisionNote) ?? null,
      }, ctx.ownerUserId);
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.budget_incident_resolved",
        entityType: "budget_incident",
        entityId: incident.id,
        details: { tool: "resolve_budget_incident", action: input.action },
      });
      return {
        content: `Resolved budget incident ${incident.id}.`,
        data: incident,
      };
    },

    list_company_invites: async (ctx, input) => {
      const limit = Math.max(1, Math.min(100, Math.floor(asNumber(input.limit, 20))));
      const offset = Math.max(0, Math.floor(asNumber(input.offset, 0)));
      const state = asString(input.state) as "active" | "accepted" | "expired" | "revoked" | null;
      const rows = await loadCompanyInviteRecords(ctx.companyId, {
        state: state ?? undefined,
        limit,
        offset,
      });
      return {
        content: summarizeRows(rows.invites, "company invite"),
        data: rows,
      };
    },

    create_company_invite: async (ctx, input) => {
      const allowedJoinTypes = (asString(input.allowedJoinTypes) ?? "both") as "human" | "agent" | "both";
      const humanRole = allowedJoinTypes === "agent"
        ? null
        : ((asString(input.humanRole) ?? "operator") as "owner" | "admin" | "operator" | "viewer");
      const defaultsPayload = input.defaultsPayload === undefined
        ? null
        : asOptionalRecordInput(input.defaultsPayload, "defaultsPayload");
      const normalizedAgentMessage = asNullableString(input.agentMessage) ?? null;
      const insertValues = {
        companyId: ctx.companyId,
        inviteType: "company_join" as const,
        allowedJoinTypes,
        defaultsPayload: mergeInviteDefaults(defaultsPayload, normalizedAgentMessage, humanRole),
        expiresAt: companyInviteExpiresAt(),
        invitedByUserId: ctx.ownerUserId,
      };

      let token: string | null = null;
      let created: typeof invites.$inferSelect | null = null;
      for (let attempt = 0; attempt < INVITE_TOKEN_MAX_RETRIES; attempt += 1) {
        const candidateToken = createInviteToken();
        try {
          const row = await db
            .insert(invites)
            .values({
              ...insertValues,
              tokenHash: hashToken(candidateToken),
            })
            .returning()
            .then((rows) => rows[0] ?? null);
          token = candidateToken;
          created = row;
          break;
        } catch (error) {
          if (!isInviteTokenHashCollisionError(error)) throw error;
        }
      }

      if (!token || !created) {
        throw conflict("Failed to generate a unique invite token. Please retry.");
      }

      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_invite_created",
        entityType: "invite",
        entityId: created.id,
        details: {
          tool: "create_company_invite",
          allowedJoinTypes: created.allowedJoinTypes,
          humanRole: extractInviteHumanRole(created),
        },
      });

      return {
        content: "Created company invite.",
        data: {
          ...created,
          token,
          state: inviteState(created),
          humanRole: extractInviteHumanRole(created),
          inviteMessage: extractInviteMessage(created),
          invitePath: `/invite/${token}`,
          inviteUrl: `/invite/${token}`,
          onboardingPath: `/api/invites/${token}/onboarding`,
          onboardingUrl: `/api/invites/${token}/onboarding`,
          onboardingTextPath: `/api/invites/${token}/onboarding.txt`,
          onboardingTextUrl: `/api/invites/${token}/onboarding.txt`,
          skillIndexPath: `/api/invites/${token}/skills/index`,
          skillIndexUrl: `/api/invites/${token}/skills/index`,
        },
      };
    },

    revoke_company_invite: async (ctx, input) => {
      const invite = await resolveInviteTarget(ctx, input);
      if (invite.acceptedAt) throw conflict("Invite already consumed");
      if (invite.revokedAt) {
        return {
          content: `Invite ${invite.id} was already revoked.`,
          data: invite,
        };
      }
      const revoked = await db
        .update(invites)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(invites.id, invite.id))
        .returning()
        .then((rows) => rows[0] ?? null);
      if (!revoked) throw notFound("Invite not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_invite_revoked",
        entityType: "invite",
        entityId: invite.id,
        details: { tool: "revoke_company_invite" },
      });
      return {
        content: `Revoked invite ${invite.id}.`,
        data: {
          ...revoked,
          humanRole: extractInviteHumanRole(revoked),
          inviteMessage: extractInviteMessage(revoked),
          state: inviteState(revoked),
        },
      };
    },

    list_join_requests: async (ctx, input) => {
      const status = asString(input.status);
      const requestType = asString(input.requestType);
      const all = await loadJoinRequestRecords(ctx.companyId);
      const filtered = all.filter((row) => {
        if (status && row.status !== status) return false;
        if (requestType && row.requestType !== requestType) return false;
        return true;
      });
      return {
        content: summarizeRows(filtered, "join request"),
        data: filtered,
      };
    },

    approve_join_request: async (ctx, input) => {
      const joinRequest = await resolveJoinRequestTarget(ctx, input);
      if (joinRequest.status !== "pending_approval") {
        throw conflict("Join request is not pending");
      }
      const invite = await db
        .select()
        .from(invites)
        .where(eq(invites.id, joinRequest.inviteId))
        .then((rows) => rows[0] ?? null);
      if (!invite) throw notFound("Invite not found");

      let createdAgentId: string | null = joinRequest.createdAgentId ?? null;
      if (joinRequest.requestType === "human") {
        if (!joinRequest.requestingUserId) {
          throw conflict("Join request missing user identity");
        }
        const membershipRole = resolveHumanInviteRole(
          invite.defaultsPayload as Record<string, unknown> | null,
        );
        await access.ensureMembership(
          ctx.companyId,
          "user",
          joinRequest.requestingUserId,
          membershipRole,
          "active",
        );
        await access.setPrincipalGrants(
          ctx.companyId,
          "user",
          joinRequest.requestingUserId,
          humanJoinGrantsFromDefaults(
            invite.defaultsPayload as Record<string, unknown> | null,
            membershipRole,
          ),
          ctx.ownerUserId,
        );
      } else {
        const existingAgents = await agentSvc.list(ctx.companyId);
        const managerId = resolveJoinRequestAgentManagerId(existingAgents);
        if (!managerId) {
          throw conflict("Join request cannot be approved because this company has no active CEO");
        }
        const agentName = deduplicateAgentName(
          joinRequest.agentName ?? "New Agent",
          existingAgents.map((agent) => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
          })),
        );
        const created = await agentSvc.create(ctx.companyId, {
          name: agentName,
          role: "general",
          title: null,
          status: "idle",
          reportsTo: managerId,
          capabilities: joinRequest.capabilities ?? null,
          adapterType: joinRequest.adapterType ?? "process",
          adapterConfig:
            joinRequest.agentDefaultsPayload && typeof joinRequest.agentDefaultsPayload === "object"
              ? joinRequest.agentDefaultsPayload as Record<string, unknown>
              : {},
          runtimeConfig: {},
          budgetMonthlyCents: 0,
          spentMonthlyCents: 0,
          permissions: {},
          lastHeartbeatAt: null,
          metadata: null,
        });
        createdAgentId = created.id;
        await access.ensureMembership(ctx.companyId, "agent", created.id, "member", "active");
        await access.setPrincipalGrants(
          ctx.companyId,
          "agent",
          created.id,
          agentJoinGrantsFromDefaults(invite.defaultsPayload as Record<string, unknown> | null),
          ctx.ownerUserId,
        );
        void notifyHireApproved(db, {
          companyId: ctx.companyId,
          agentId: created.id,
          source: "join_request",
          sourceId: joinRequest.id,
          approvedAt: new Date(),
        }).catch(() => {});
      }

      const approved = await db
        .update(joinRequests)
        .set({
          status: "approved",
          approvedByUserId: ctx.ownerUserId,
          approvedAt: new Date(),
          createdAgentId,
          updatedAt: new Date(),
        })
        .where(eq(joinRequests.id, joinRequest.id))
        .returning()
        .then((rows) => rows[0] ?? null);
      if (!approved) throw notFound("Join request not found");

      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.join_request_approved",
        entityType: "join_request",
        entityId: joinRequest.id,
        details: {
          tool: "approve_join_request",
          requestType: joinRequest.requestType,
          createdAgentId,
        },
      });

      return {
        content: `Approved join request ${joinRequest.id}.`,
        data: (await loadJoinRequestRecords(ctx.companyId)).find((row) => row.id === joinRequest.id) ?? approved,
      };
    },

    reject_join_request: async (ctx, input) => {
      const joinRequest = await resolveJoinRequestTarget(ctx, input);
      if (joinRequest.status !== "pending_approval") {
        throw conflict("Join request is not pending");
      }
      const rejected = await db
        .update(joinRequests)
        .set({
          status: "rejected",
          rejectedByUserId: ctx.ownerUserId,
          rejectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(joinRequests.id, joinRequest.id))
        .returning()
        .then((rows) => rows[0] ?? null);
      if (!rejected) throw notFound("Join request not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.join_request_rejected",
        entityType: "join_request",
        entityId: joinRequest.id,
        details: { tool: "reject_join_request", requestType: joinRequest.requestType },
      });
      return {
        content: `Rejected join request ${joinRequest.id}.`,
        data: (await loadJoinRequestRecords(ctx.companyId)).find((row) => row.id === joinRequest.id) ?? rejected,
      };
    },

    list_company_members: async (ctx) => {
      const [members, membership, canManageMembers, canInviteUsers, canApproveJoinRequests] = await Promise.all([
        loadCompanyMemberRecords(ctx.companyId),
        access.getMembership(ctx.companyId, "user", ctx.ownerUserId),
        access.canUser(ctx.companyId, ctx.ownerUserId, "users:manage_permissions"),
        access.canUser(ctx.companyId, ctx.ownerUserId, "users:invite"),
        access.canUser(ctx.companyId, ctx.ownerUserId, "joins:approve"),
      ]);
      return {
        content: summarizeRows(members, "company member"),
        data: {
          members,
          access: {
            currentUserRole:
              membership?.status === "active" && membership.membershipRole
                ? resolveHumanInviteRole({ human: { role: membership.membershipRole } })
                : null,
            canManageMembers,
            canInviteUsers,
            canApproveJoinRequests,
          },
        },
      };
    },

    update_company_member: async (ctx, input) => {
      const member = await resolveMemberTarget(ctx, input);
      const allowedRoles = new Set(["owner", "admin", "operator", "viewer"]);
      const nextMembershipRole = input.membershipRole === undefined
        ? undefined
        : asNullableString(input.membershipRole);
      if (nextMembershipRole !== undefined && nextMembershipRole !== null && !allowedRoles.has(nextMembershipRole)) {
        throw badRequest("membershipRole must be owner, admin, operator, viewer, or null");
      }
      const nextStatus = input.status === undefined ? undefined : asOptionalString(input.status);
      if (nextStatus && !["pending", "active", "suspended"].includes(nextStatus)) {
        throw badRequest("status must be pending, active, or suspended");
      }
      const grants = input.grants === undefined
        ? member.grants.map((grant) => ({
          permissionKey: grant.permissionKey as PermissionKey,
          scope: grant.scope ?? null,
        }))
        : (Array.isArray(input.grants)
          ? input.grants.map((grant) => {
            const record = asRecord(grant);
            const permissionKey = asString(record.permissionKey);
            if (!permissionKey) throw badRequest("Each grant needs a permissionKey");
            return {
              permissionKey: permissionKey as PermissionKey,
              scope: record.scope && typeof record.scope === "object" && !Array.isArray(record.scope)
                ? record.scope as Record<string, unknown>
                : null,
            };
          })
          : (() => {
            throw badRequest("grants must be an array when provided");
          })());

      if (nextMembershipRole === undefined && nextStatus === undefined && input.grants === undefined) {
        throw badRequest("membershipRole, status, or grants is required");
      }

      const updated = await access.updateMemberAndPermissions(
        ctx.companyId,
        member.id,
        {
          membershipRole: nextMembershipRole,
          status: nextStatus as "pending" | "active" | "suspended" | undefined,
          grants,
        },
        ctx.ownerUserId,
      );
      if (!updated) throw notFound("Member not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_member_updated",
        entityType: "company_membership",
        entityId: member.id,
        details: {
          tool: "update_company_member",
          membershipRole: nextMembershipRole ?? member.membershipRole ?? null,
          status: nextStatus ?? member.status,
          grantCount: grants.length,
        },
      });
      const refreshed = (await loadCompanyMemberRecords(ctx.companyId, { includeArchived: true }))
        .find((entry) => entry.id === member.id);
      return {
        content: `Updated company member ${refreshed?.user?.email ?? refreshed?.user?.name ?? member.id}.`,
        data: refreshed ?? updated,
      };
    },

    archive_company_member: async (ctx, input) => {
      const member = await resolveMemberTarget(ctx, input, { includeArchived: true });
      const reassignmentMember = asString(input.assigneeMemberId) || asString(input.assigneeMemberRef)
        ? await resolveMemberTarget(ctx, input, {
          idField: "assigneeMemberId",
          refField: "assigneeMemberRef",
          requiredMessage: "assigneeMemberId or assigneeMemberRef is required when reassigning to a member",
          includeArchived: false,
        })
        : null;
      const reassignmentAgent = asString(input.assigneeAgentId) || asString(input.assigneeAgentRef)
        ? await resolveAgentTarget(ctx, input, {
          idField: "assigneeAgentId",
          refField: "assigneeAgentRef",
          requiredMessage: "assigneeAgentId or assigneeAgentRef is required when reassigning to an agent",
        })
        : null;
      const result = await access.archiveMember(ctx.companyId, member.id, {
        reassignment: {
          assigneeUserId: reassignmentMember?.principalId ?? asNullableString(input.assigneeUserId) ?? null,
          assigneeAgentId: reassignmentAgent?.id ?? null,
        },
      });
      if (!result) throw notFound("Member not found");
      await logActivity(db, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.ownerUserId,
        agentId: null,
        runId: null,
        action: "home_tool.company_member_archived",
        entityType: "company_membership",
        entityId: member.id,
        details: {
          tool: "archive_company_member",
          reassignedIssueCount: result.reassignedIssueCount,
        },
      });
      const refreshed = (await loadCompanyMemberRecords(ctx.companyId, { includeArchived: true }))
        .find((entry) => entry.id === member.id);
      return {
        content: `Archived company member ${refreshed?.user?.email ?? refreshed?.user?.name ?? member.id}.`,
        data: {
          member: refreshed ?? result.member,
          reassignedIssueCount: result.reassignedIssueCount,
        },
      };
    },

    list_company_user_directory: async (ctx) => {
      const users = await loadCompanyUserDirectory(ctx.companyId);
      return {
        content: summarizeRows(users, "company user"),
        data: { users },
      };
    },
  };

  const definitions: HomeToolDefinition[] = HOME_ACTION_CATALOG
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      ...entry,
      handler: toolHandlers[entry.name],
    }));

  const byName = new Map(definitions.map((tool) => [tool.name, tool]));
  const byRegistryKey = new Map<string, HomeToolDefinition>(
    definitions.map((tool) => [tool.registryKey, tool]),
  );

  function publicDescriptor(tool: HomeToolDefinition): HomeToolDescriptor {
    const { handler: _handler, ...descriptor } = tool;
    return descriptor;
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
      sourceId: HOME_CAPABILITY_SOURCE_ID,
      listEntries: () => definitions.map((tool) => ({
        item: createInventoryItem("internal", HOME_CAPABILITY_SOURCE_ID, tool),
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

  function buildCapabilitySelection(category?: string | null, limit = CAPABILITY_TOOL_SELECTION_LIMIT) {
    const buckets = new Map<string, HomeToolDescriptor[]>();
    for (const entry of listInventoryEntries(category)) {
      const tool = byName.get(entry.item.name);
      if (!tool) continue;
      const descriptor = publicDescriptor(tool);
      const familyKey = descriptor.family || descriptor.category;
      const bucket = buckets.get(familyKey) ?? [];
      bucket.push(descriptor);
      buckets.set(familyKey, bucket);
    }

    const bucketList = Array.from(buckets.values());
    const diversified: HomeToolDescriptor[] = [];
    for (let index = 0; diversified.length < limit; index += 1) {
      let advanced = false;
      for (const bucket of bucketList) {
        const tool = bucket[index];
        if (!tool) continue;
        diversified.push(tool);
        advanced = true;
        if (diversified.length >= limit) break;
      }
      if (!advanced) break;
    }
    return diversified;
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
      for (const companionName of tool.companionNames) {
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

    if (capabilityMode) {
      return {
        query,
        isCapabilityQuery: true,
        limit,
        tools: buildCapabilitySelection(options.category, limit),
      };
    }

    const ranked = normalized.length === 0
      ? []
      : rankInventoryEntries(normalized, options.category).filter((entry) => entry.score > 0);

    const fallbackEntries = ranked.length === 0
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


