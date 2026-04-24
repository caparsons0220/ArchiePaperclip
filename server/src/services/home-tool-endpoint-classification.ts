export type HomeToolEndpointDecision = "include" | "confirm-required" | "exclude";

export interface HomeToolEndpointClassification {
  decision: HomeToolEndpointDecision;
  reason: string;
}

export interface HomeToolEndpoint {
  method: string;
  path: string;
}

interface ClassificationRule {
  decision: HomeToolEndpointDecision;
  reason: string;
  methods?: string[];
  pattern: RegExp;
}

function methods(...values: string[]) {
  return values.map((value) => value.toUpperCase());
}

const RULES: ClassificationRule[] = [
  // Home chat transport is the caller of tools, not a tool backend.
  { methods: methods("GET", "POST", "PATCH"), pattern: /^\/companies\/:companyId\/home-chat(?:\/|$)/, decision: "exclude", reason: "Home chat transport routes are internal to the copilot UI." },

  // Health, auth, bootstrap, CLI auth, and public onboarding are not company-control tools.
  { methods: methods("GET"), pattern: /^\/health\/?$/, decision: "exclude", reason: "Instance health is operational status, not user company control." },
  { pattern: /^\/(?:get-session|profile)$/, decision: "include", reason: "Current user profile and session context are user-scoped." },
  { pattern: /^\/board-claim(?:\/|$)/, decision: "exclude", reason: "Board ownership bootstrap is platform access control." },
  { pattern: /^\/cli-auth(?:\/|$)/, decision: "exclude", reason: "CLI auth challenge flows mint board credentials and are not Home AI tools." },
  { pattern: /^\/invites\/:token(?:\/|$)/, decision: "exclude", reason: "Public invite-token bootstrap is not scoped to the signed-in user's active company context." },
  { pattern: /^\/join-requests\/:requestId\/claim-api-key$/, decision: "exclude", reason: "Agent API key claim is public bootstrap and should not be model-callable." },
  { pattern: /^\/admin(?:\/|$)/, decision: "exclude", reason: "Admin user and cross-company platform controls are outside user company scope." },
  { methods: methods("GET"), pattern: /^\/skills(?:\/|$)/, decision: "include", reason: "Built-in skill docs are safe user-facing knowledge." },
  { methods: methods("POST"), pattern: /^\/skills(?:\/|$)/, decision: "confirm-required", reason: "Skill installation changes local tool state and should be confirmed." },
  { pattern: /^\/llms(?:\/|$)/, decision: "include", reason: "LLM-facing docs are safe product/tool knowledge." },

  // Company/workspace surface.
  { methods: methods("GET"), pattern: /^\/companies\/?$/, decision: "include", reason: "Lists companies visible to the signed-in user." },
  { methods: methods("GET"), pattern: /^\/companies\/stats$/, decision: "include", reason: "Stats are filtered to companies visible to the user." },
  { methods: methods("GET"), pattern: /^\/companies\/issues$/, decision: "exclude", reason: "Malformed-path helper route; no useful tool capability." },
  { methods: methods("GET", "PATCH"), pattern: /^\/companies\/:companyId(?:\/branding)?$/, decision: "include", reason: "Company profile and branding are company-scoped user controls." },
  { methods: methods("POST"), pattern: /^\/companies\/?$/, decision: "include", reason: "Creating a user workspace/company is a user-scoped action." },
  { methods: methods("POST"), pattern: /^\/companies\/:companyId\/(?:export|exports|exports\/preview|imports\/preview|imports\/apply)$/, decision: "confirm-required", reason: "Company import/export can disclose or mutate broad company state." },
  { methods: methods("POST"), pattern: /^\/companies\/import(?:\/preview)?$/, decision: "confirm-required", reason: "Portable import can create or mutate company state." },
  { methods: methods("POST", "DELETE"), pattern: /^\/companies\/:companyId(?:\/archive)?$/, decision: "confirm-required", reason: "Archive/delete company is destructive." },
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/feedback-traces$/, decision: "include", reason: "Feedback traces are company-scoped diagnostics." },
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/dashboard$/, decision: "include", reason: "Dashboard summary is company-scoped user context." },

  // Activity, journal, and run visibility.
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/activity$/, decision: "include", reason: "Activity feed is the company journal surface." },
  { methods: methods("POST"), pattern: /^\/companies\/:companyId\/activity$/, decision: "include", reason: "Manual activity entries are company-scoped and auditable." },
  { methods: methods("GET"), pattern: /^\/issues\/:id\/activity$/, decision: "include", reason: "Issue activity is company-scoped through the issue." },
  { methods: methods("GET"), pattern: /^\/issues\/:id\/runs$/, decision: "include", reason: "Issue run history is company-scoped through the issue." },
  { methods: methods("GET"), pattern: /^\/heartbeat-runs\/:runId\/issues$/, decision: "include", reason: "Run issue links are company-scoped through the run." },

  // Agents, org, skills, and heartbeats.
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/adapters\/:type\/(?:models|detect-model)$/, decision: "include", reason: "Adapter discovery for configuring company agents is user-facing." },
  { methods: methods("POST"), pattern: /^\/companies\/:companyId\/adapters\/:type\/test-environment$/, decision: "confirm-required", reason: "Adapter environment tests may execute local checks and should be confirmed." },
  { methods: methods("GET"), pattern: /^\/agents\/:id\/skills$/, decision: "include", reason: "Agent skill snapshots are company-scoped through the agent." },
  { methods: methods("POST"), pattern: /^\/agents\/:id\/skills\/sync$/, decision: "confirm-required", reason: "Skill sync mutates agent adapter configuration." },
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/(?:agents|org|org\.svg|org\.png|agent-configurations|heartbeat-runs|live-runs)$/, decision: "include", reason: "Agent/org/run views are company-scoped." },
  { pattern: /^\/instance\/scheduler-heartbeats$/, decision: "exclude", reason: "Scheduler plumbing is instance-level operational state." },
  { pattern: /^\/agents\/me(?:\/|$)?/, decision: "exclude", reason: "Agent-auth self routes are not signed-in user Home tools." },
  { methods: methods("GET"), pattern: /^\/agents\/:id(?:\/configuration|\/config-revisions|\/config-revisions\/:revisionId|\/runtime-state|\/task-sessions|\/instructions-bundle|\/instructions-bundle\/file|\/keys)?$/, decision: "include", reason: "Agent detail/config reads are company-scoped through the agent." },
  { methods: methods("POST"), pattern: /^\/companies\/:companyId\/agent-hires$/, decision: "include", reason: "Hire requests are governed company-scoped operations." },
  { methods: methods("POST"), pattern: /^\/companies\/:companyId\/agents$/, decision: "confirm-required", reason: "Direct agent creation can affect runtime cost and should be confirmed." },
  { methods: methods("PATCH"), pattern: /^\/agents\/:id(?:\/permissions|\/instructions-path|\/instructions-bundle)?$/, decision: "confirm-required", reason: "Agent permission/instruction/config changes affect execution behavior." },
  { methods: methods("PUT", "DELETE"), pattern: /^\/agents\/:id\/instructions-bundle\/file$/, decision: "confirm-required", reason: "Instruction file changes affect execution behavior." },
  { methods: methods("POST"), pattern: /^\/agents\/:id\/(?:pause|resume|approve|wakeup)$/, decision: "include", reason: "Agent lifecycle controls are user company controls and auditable." },
  { methods: methods("POST", "DELETE"), pattern: /^\/agents\/:id(?:\/terminate|\/keys|\/keys\/:keyId)?$/, decision: "confirm-required", reason: "Agent termination/deletion/API key operations are sensitive." },
  { methods: methods("POST"), pattern: /^\/agents\/:id\/(?:heartbeat\/invoke|runtime-state\/reset-session|claude-login)$/, decision: "confirm-required", reason: "Run/session/auth helper operations can have side effects or cost." },
  { methods: methods("POST"), pattern: /^\/agents\/:id\/config-revisions\/:revisionId\/rollback$/, decision: "confirm-required", reason: "Config rollback mutates agent behavior." },
  { methods: methods("GET"), pattern: /^\/heartbeat-runs\/:runId(?:\/events|\/log|\/workspace-operations)?$/, decision: "include", reason: "Run details and logs are company-scoped through the run." },
  { methods: methods("POST"), pattern: /^\/heartbeat-runs\/:runId\/cancel$/, decision: "confirm-required", reason: "Run cancellation interrupts active work." },
  { methods: methods("GET"), pattern: /^\/workspace-operations\/:operationId\/log$/, decision: "include", reason: "Workspace operation logs are company-scoped through the operation." },
  { methods: methods("GET"), pattern: /^\/issues\/:issueId\/(?:live-runs|active-run)$/, decision: "include", reason: "Issue live runs are company-scoped through the issue." },

  // Projects, workspaces, and preview/runtime.
  { methods: methods("GET", "POST"), pattern: /^\/companies\/:companyId\/projects$/, decision: "include", reason: "Projects are company-scoped user workspaces." },
  { methods: methods("GET", "PATCH"), pattern: /^\/projects\/:id$/, decision: "include", reason: "Project reads and ordinary updates are company-scoped." },
  { methods: methods("DELETE"), pattern: /^\/projects\/:id$/, decision: "confirm-required", reason: "Project deletion is destructive." },
  { methods: methods("GET", "POST", "PATCH"), pattern: /^\/projects\/:id\/workspaces(?:\/:workspaceId)?$/, decision: "include", reason: "Project workspaces are user-facing preview/work surfaces." },
  { methods: methods("DELETE"), pattern: /^\/projects\/:id\/workspaces\/:workspaceId$/, decision: "confirm-required", reason: "Workspace deletion is destructive." },
  { methods: methods("POST"), pattern: /^\/projects\/:id\/workspaces\/:workspaceId\/runtime-(?:services|commands)\/:action$/, decision: "confirm-required", reason: "Runtime commands start, stop, restart, or run local services." },
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/execution-workspaces$/, decision: "include", reason: "Execution workspaces are company-scoped runtime surfaces." },
  { methods: methods("GET"), pattern: /^\/execution-workspaces\/:id(?:\/close-readiness|\/workspace-operations)?$/, decision: "include", reason: "Execution workspace reads are company-scoped through the workspace." },
  { methods: methods("PATCH"), pattern: /^\/execution-workspaces\/:id$/, decision: "confirm-required", reason: "Execution workspace updates can archive/cleanup workspaces." },
  { methods: methods("POST"), pattern: /^\/execution-workspaces\/:id\/runtime-(?:services|commands)\/:action$/, decision: "confirm-required", reason: "Runtime commands start, stop, restart, or run local services." },

  // Issues, documents, comments, work products, feedback, and attachments.
  { methods: methods("GET"), pattern: /^\/issues$/, decision: "exclude", reason: "Malformed-path helper route; no useful tool capability." },
  { methods: methods("GET", "POST"), pattern: /^\/companies\/:companyId\/(?:issues|labels)$/, decision: "include", reason: "Issues and labels are company-scoped agenda controls." },
  { methods: methods("DELETE"), pattern: /^\/labels\/:labelId$/, decision: "confirm-required", reason: "Label deletion mutates company organization." },
  { methods: methods("GET"), pattern: /^\/issues\/:id(?:\/heartbeat-context|\/work-products|\/documents|\/documents\/:key|\/documents\/:key\/revisions|\/approvals|\/comments|\/comments\/:commentId|\/feedback-votes|\/feedback-traces|\/attachments)?$/, decision: "include", reason: "Issue reads are company-scoped through the issue." },
  { methods: methods("PUT", "POST", "PATCH"), pattern: /^\/issues\/:id(?:\/documents\/:key|\/documents\/:key\/revisions\/:revisionId\/restore|\/work-products|\/read|\/inbox-archive|\/approvals|\/children|\/checkout|\/release|\/comments|\/feedback-votes)?$/, decision: "include", reason: "Issue work mutations are company-scoped and auditable." },
  { methods: methods("DELETE"), pattern: /^\/issues\/:id(?:\/documents\/:key|\/approvals\/:approvalId|\/comments\/:commentId|\/read|\/inbox-archive)?$/, decision: "confirm-required", reason: "Issue delete/unlink/unarchive operations should be confirmed when model-initiated." },
  { methods: methods("PATCH"), pattern: /^\/work-products\/:id$/, decision: "include", reason: "Work product updates are company-scoped through the work product." },
  { methods: methods("DELETE"), pattern: /^\/work-products\/:id$/, decision: "confirm-required", reason: "Work product deletion is destructive." },
  { methods: methods("PATCH"), pattern: /^\/issues\/:id$/, decision: "include", reason: "Issue updates are the core agenda control surface." },
  { methods: methods("DELETE"), pattern: /^\/issues\/:id$/, decision: "confirm-required", reason: "Issue deletion is destructive." },
  { methods: methods("GET"), pattern: /^\/feedback-traces\/:traceId(?:\/bundle)?$/, decision: "include", reason: "Feedback traces are company-scoped diagnostics through the trace." },
  { methods: methods("POST"), pattern: /^\/companies\/:companyId\/issues\/:issueId\/attachments$/, decision: "include", reason: "Attachment upload supports user-visible work artifacts." },
  { methods: methods("GET"), pattern: /^\/attachments\/:attachmentId\/content$/, decision: "include", reason: "Attachment content is company-scoped through the attachment." },
  { methods: methods("DELETE"), pattern: /^\/attachments\/:attachmentId$/, decision: "confirm-required", reason: "Attachment deletion is destructive." },

  // Routines and recurring work.
  { methods: methods("GET", "POST"), pattern: /^\/companies\/:companyId\/routines$/, decision: "include", reason: "Routines are company-scoped recurring work controls." },
  { methods: methods("GET", "PATCH"), pattern: /^\/routines\/:id(?:\/runs)?$/, decision: "include", reason: "Routine reads and ordinary updates are company-scoped through the routine." },
  { methods: methods("POST"), pattern: /^\/routines\/:id\/(?:triggers|run)$/, decision: "include", reason: "Routine trigger creation/manual run are company-scoped controls." },
  { methods: methods("PATCH"), pattern: /^\/routine-triggers\/:id$/, decision: "include", reason: "Routine trigger updates are company-scoped through the routine." },
  { methods: methods("DELETE"), pattern: /^\/routine-triggers\/:id$/, decision: "confirm-required", reason: "Deleting a routine trigger is destructive." },
  { methods: methods("POST"), pattern: /^\/routine-triggers\/:id\/rotate-secret$/, decision: "confirm-required", reason: "Rotating a trigger secret is sensitive." },
  { methods: methods("POST"), pattern: /^\/routine-triggers\/public\/:publicId\/fire$/, decision: "exclude", reason: "Public webhook ingress is not a signed-in user Home tool." },

  // Goals/manual.
  { methods: methods("GET", "POST"), pattern: /^\/companies\/:companyId\/goals$/, decision: "include", reason: "Goals back the user-facing manual/plan surface." },
  { methods: methods("GET", "PATCH"), pattern: /^\/goals\/:id$/, decision: "include", reason: "Goal reads and updates are company-scoped through the goal." },
  { methods: methods("DELETE"), pattern: /^\/goals\/:id$/, decision: "confirm-required", reason: "Goal deletion mutates the company plan." },

  // Approvals and questions.
  { methods: methods("GET", "POST"), pattern: /^\/companies\/:companyId\/approvals$/, decision: "include", reason: "Approval queue is company-scoped governance." },
  { methods: methods("GET"), pattern: /^\/approvals\/:id(?:\/issues|\/comments)?$/, decision: "include", reason: "Approval reads are company-scoped through the approval." },
  { methods: methods("POST"), pattern: /^\/approvals\/:id\/comments$/, decision: "include", reason: "Approval comments are company-scoped and auditable." },
  { methods: methods("POST"), pattern: /^\/approvals\/:id\/(?:approve|reject|request-revision|resubmit)$/, decision: "confirm-required", reason: "Approval decisions are governed actions." },

  // Secrets, costs, budgets, and assets.
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/(?:secret-providers|secrets)$/, decision: "include", reason: "Secret metadata/provider reads are company-scoped and redacted." },
  { methods: methods("POST", "PATCH", "DELETE"), pattern: /^\/(?:companies\/:companyId\/secrets|secrets\/:id(?:\/rotate)?)$/, decision: "confirm-required", reason: "Secret writes are sensitive and values must never be disclosed." },
  { methods: methods("POST"), pattern: /^\/companies\/:companyId\/(?:cost-events|finance-events)$/, decision: "exclude", reason: "Cost/finance ingestion is an agent/system reporting API, not a Home user control." },
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/(?:costs|budgets)(?:\/|$)/, decision: "include", reason: "Cost and budget reads are company-scoped user context." },
  { methods: methods("POST", "PATCH"), pattern: /^\/(?:companies\/:companyId\/(?:budgets|budget-incidents)|agents\/:agentId\/budgets)(?:\/|$)/, decision: "confirm-required", reason: "Budget changes and incident resolution affect spending controls." },
  { methods: methods("POST"), pattern: /^\/companies\/:companyId\/(?:assets\/images|logo)$/, decision: "include", reason: "Asset uploads support user-visible company branding and artifacts." },
  { methods: methods("GET"), pattern: /^\/assets\/:assetId\/content$/, decision: "include", reason: "Asset content is company-scoped through the asset." },

  // Company skills and user preference/profile surfaces.
  { methods: methods("GET", "POST", "PATCH"), pattern: /^\/companies\/:companyId\/skills(?:\/|$)?/, decision: "include", reason: "Company skills are user-facing company configuration." },
  { methods: methods("DELETE"), pattern: /^\/companies\/:companyId\/skills\/:skillId$/, decision: "confirm-required", reason: "Skill deletion is destructive." },
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/users\/:userSlug\/profile$/, decision: "include", reason: "Company user profile cards are scoped to the company directory." },
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/sidebar-badges$/, decision: "include", reason: "Sidebar badges are user-visible company state." },
  { methods: methods("GET", "PUT"), pattern: /^\/(?:companies\/:companyId\/)?sidebar-preferences\/me$/, decision: "include", reason: "Sidebar preferences are scoped to the current user." },
  { methods: methods("GET", "POST"), pattern: /^\/companies\/:companyId\/inbox-dismissals$/, decision: "include", reason: "Inbox dismissals are scoped to the current user and company." },

  // Company access, members, and invites.
  { methods: methods("GET"), pattern: /^\/companies\/:companyId\/(?:invites|join-requests|members|user-directory)$/, decision: "include", reason: "Company directory/access reads are company-scoped." },
  { methods: methods("POST"), pattern: /^\/companies\/:companyId\/(?:invites|openclaw\/invite-prompt)$/, decision: "confirm-required", reason: "Invites grant or bootstrap access and should be confirmed." },
  { methods: methods("POST"), pattern: /^\/invites\/:inviteId\/revoke$/, decision: "confirm-required", reason: "Invite revocation changes access state." },
  { methods: methods("POST", "PATCH"), pattern: /^\/companies\/:companyId\/(?:join-requests\/:requestId\/(?:approve|reject)|members\/:memberId(?:\/(?:role-and-grants|archive|permissions))?)$/, decision: "confirm-required", reason: "Member and join-request changes affect access permissions." },

  // Adapter host packages and plugin host platform.
  { methods: methods("GET"), pattern: /^\/adapters(?:\/:type\/(?:config-schema|ui-parser\.js))?$/, decision: "include", reason: "Installed adapter metadata/config schemas help users configure company agents." },
  { methods: methods("POST", "PATCH", "DELETE"), pattern: /^\/adapters(?:\/|$)/, decision: "exclude", reason: "Adapter install/remove/reload/override controls server packages." },
  { methods: methods("GET"), pattern: /^\/plugins\/tools$/, decision: "include", reason: "Already-installed plugin tool discovery can be composed through Home tools." },
  { methods: methods("POST"), pattern: /^\/plugins\/tools\/execute$/, decision: "confirm-required", reason: "Plugin execution must be mediated by company-scoped Home tool policy." },
  { methods: methods("GET"), pattern: /^\/plugins(?:\/examples|\/ui-contributions)?$/, decision: "include", reason: "Plugin listing/UI contribution metadata is safe product context." },
  { pattern: /^\/plugins(?:\/|$)/, decision: "exclude", reason: "Plugin install/config/lifecycle/bridge/log/job/webhook routes are platform or plugin-internal controls." },
  { methods: methods("GET"), pattern: /^\/_plugins\/:pluginId\/ui\/\*filePath$/, decision: "exclude", reason: "Plugin static asset serving is UI infrastructure, not a Home tool." },

  // Instance-level settings and backups.
  { pattern: /^\/instance\/settings(?:\/|$)/, decision: "exclude", reason: "Instance settings are platform controls." },
  { pattern: /^\/instance\/database-backups$/, decision: "exclude", reason: "Database backups are platform operations." },
];

export function classifyHomeToolEndpoint(endpoint: HomeToolEndpoint): HomeToolEndpointClassification {
  const method = endpoint.method.toUpperCase();
  const path = endpoint.path.trim();

  for (const rule of RULES) {
    if (rule.methods && !rule.methods.includes(method)) continue;
    if (!rule.pattern.test(path)) continue;
    return { decision: rule.decision, reason: rule.reason };
  }

  return {
    decision: "exclude",
    reason: "Unclassified routes default to excluded until explicitly reviewed for Home AI scope.",
  };
}

export function isHomeToolEndpointExplicitlyClassified(endpoint: HomeToolEndpoint): boolean {
  const method = endpoint.method.toUpperCase();
  const path = endpoint.path.trim();
  return RULES.some((rule) => (!rule.methods || rule.methods.includes(method)) && rule.pattern.test(path));
}

export function listHomeToolEndpointClassificationRules() {
  return RULES.map((rule) => ({
    methods: rule.methods ?? null,
    pattern: rule.pattern.source,
    decision: rule.decision,
    reason: rule.reason,
  }));
}
