# Paperclip Manual

Reference for rebuilding Paperclip: **HTTP APIs** (exact paths and verbs as implemented in `server/src`) and **UI navigation** (routes, sidebars, and in-page tabs). Unless noted, JSON APIs are mounted under the **`/api`** prefix (see `server/src/app.ts`).

**URL prefix**

- Most REST handlers: `/api/...`
- Paperclip session helpers: `/api/auth/...` (see [Session & profile](#session--profile))
- Better Auth (sign-in, OAuth, etc.): also under `/api/auth/*` via a catch-all handler after the Paperclip auth router
- LLM-facing plaintext docs: `/llms/...` (mounted at app root, **not** under `/api`)
- Plugin UI static bundles: `/_plugins/:pluginId/ui/...` (app root; see `server/src/routes/plugin-ui-static.ts`)

**Company routing in the UI**

- Logged-in board experience for a company uses paths like `/{companyPrefix}/dashboard`, where `companyPrefix` is the company’s issue prefix (e.g. `ACME`). Some legacy unprefixed paths redirect into the prefixed company shell (`ui/src/App.tsx`).

---

## HTTP API reference

### Health

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health/` | Liveness: DB probe when DB is wired; returns deployment/bootstrap flags; optionally dev-server status (with auth or `x-paperclip-dev-server-status-token`). Redacts detail for unauthenticated callers in `authenticated` deployment mode. |

### Session & profile (`/api/auth`)

Mounted at `/api/auth` from `server/src/routes/auth.ts` (before Better Auth’s catch-all).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/get-session` | Board session summary + user profile for the signed-in board user. |
| GET | `/api/auth/profile` | Current board user profile. |
| PATCH | `/api/auth/profile` | Update current user name/image. |

Additional Better Auth endpoints live under `/api/auth/*` (handled outside this list).

### LLM plaintext docs (app root, not `/api`)

From `server/src/routes/llms.ts`, mounted at app root.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/llms/agent-configuration.txt` | Plaintext index of adapter configuration docs and related API hints (board or agents with create permission). |
| GET | `/llms/agent-icons.txt` | Allowed agent icon names for hire/create payloads. |
| GET | `/llms/agent-configuration/:adapterType.txt` | Adapter-specific agent configuration documentation. |

### Companies

Base mount: `/api/companies` (`server/src/routes/companies.ts`).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/` | List companies visible to the board actor (filtered by membership unless instance admin / local implicit). |
| GET | `/api/companies/stats` | Per-company stats map, filtered to allowed companies for non-admins. |
| GET | `/api/companies/issues` | **400 helper** — reminds callers to use `/api/companies/:companyId/issues`. |
| GET | `/api/companies/:companyId` | Single company record. |
| GET | `/api/companies/:companyId/feedback-traces` | List feedback traces for the company (query filters for target type, status, votes, dates, pagination). |
| POST | `/api/companies/:companyId/export` | Start or run company portability export (CEO/board rules apply). |
| POST | `/api/companies/import/preview` | Preview portable company import (instance admin for new company; company access for existing target). |
| POST | `/api/companies/import` | Apply portable company import. |
| POST | `/api/companies/:companyId/exports/preview` | Preview export for one company. |
| POST | `/api/companies/:companyId/exports` | Create/run export for one company. |
| POST | `/api/companies/:companyId/imports/preview` | Preview import into an existing company. |
| POST | `/api/companies/:companyId/imports/apply` | Apply import into an existing company. |
| POST | `/api/companies/` | Create company (validated body). |
| PATCH | `/api/companies/:companyId` | Update company fields. |
| PATCH | `/api/companies/:companyId/branding` | Update branding (board or CEO agent). |
| POST | `/api/companies/:companyId/archive` | Archive company. |
| DELETE | `/api/companies/:companyId` | Delete company (when enabled by deployment). |

### Dashboard

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/dashboard` | Aggregated dashboard summary for the company. |

### Activity & runs (cross-entity)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/activity` | Company activity feed. |
| POST | `/api/companies/:companyId/activity` | Record a manual activity event. |
| GET | `/api/issues/:id/activity` | Activity for one issue. |
| GET | `/api/issues/:id/runs` | Historical heartbeat runs associated with the issue. |
| GET | `/api/heartbeat-runs/:runId/issues` | Issues touched by a heartbeat run. |

### Agents & heartbeats

Base: `server/src/routes/agents.ts` (single router on `/api`).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/adapters/:type/models` | List models for an adapter type (configuration discovery). |
| GET | `/api/companies/:companyId/adapters/:type/detect-model` | Detect default model for adapter type. |
| POST | `/api/companies/:companyId/adapters/:type/test-environment` | Run adapter environment test with resolved/normalized config. |
| GET | `/api/agents/:id/skills` | Skill snapshot for the agent’s adapter (or fallback when adapter has no `listSkills`). |
| POST | `/api/agents/:id/skills/sync` | Sync desired skills into agent adapter config. |
| GET | `/api/companies/:companyId/agents` | List agents in the company. |
| GET | `/api/instance/scheduler-heartbeats` | Scheduler / heartbeat plumbing status for the instance (board). |
| GET | `/api/companies/:companyId/org` | Org chart JSON for reporting structure. |
| GET | `/api/companies/:companyId/org.svg` | Org chart as SVG. |
| GET | `/api/companies/:companyId/org.png` | Org chart as PNG. |
| GET | `/api/companies/:companyId/agent-configurations` | Adapter configuration blueprints / hire templates for the company. |
| GET | `/api/agents/me` | Agent “who am I” for API key auth. |
| GET | `/api/agents/me/inbox-lite` | Lightweight inbox payload for the authenticated agent. |
| GET | `/api/agents/me/inbox/mine` | Agent inbox issues (mine). |
| GET | `/api/agents/:id` | Agent detail. |
| GET | `/api/agents/:id/configuration` | Full configuration (secrets redacted). |
| GET | `/api/agents/:id/config-revisions` | List configuration revisions. |
| GET | `/api/agents/:id/config-revisions/:revisionId` | One revision. |
| POST | `/api/agents/:id/config-revisions/:revisionId/rollback` | Roll agent config back to a revision. |
| GET | `/api/agents/:id/runtime-state` | Runtime/session state for UI. |
| GET | `/api/agents/:id/task-sessions` | Task session records. |
| POST | `/api/agents/:id/runtime-state/reset-session` | Reset runtime session state. |
| POST | `/api/companies/:companyId/agent-hires` | Create a pending hire / hire request (governance-aware). |
| POST | `/api/companies/:companyId/agents` | Create agent directly (validated). |
| PATCH | `/api/agents/:id/permissions` | Update agent permission map. |
| PATCH | `/api/agents/:id/instructions-path` | Update instructions file path reference. |
| GET | `/api/agents/:id/instructions-bundle` | Read bundled instructions metadata/content. |
| PATCH | `/api/agents/:id/instructions-bundle` | Patch instructions bundle. |
| GET | `/api/agents/:id/instructions-bundle/file` | Read single file from bundle. |
| PUT | `/api/agents/:id/instructions-bundle/file` | Upsert single file in bundle. |
| DELETE | `/api/agents/:id/instructions-bundle/file` | Delete file from bundle. |
| PATCH | `/api/agents/:id` | Update agent fields (status, adapter config, runtime, etc.). |
| POST | `/api/agents/:id/pause` | Pause agent. |
| POST | `/api/agents/:id/resume` | Resume agent. |
| POST | `/api/agents/:id/approve` | Approve pending agent. |
| POST | `/api/agents/:id/terminate` | Terminate agent. |
| DELETE | `/api/agents/:id` | Delete agent. |
| GET | `/api/agents/:id/keys` | List API keys for agent. |
| POST | `/api/agents/:id/keys` | Create API key. |
| DELETE | `/api/agents/:id/keys/:keyId` | Revoke key. |
| POST | `/api/agents/:id/wakeup` | Wake agent (validated payload). |
| POST | `/api/agents/:id/heartbeat/invoke` | Invoke heartbeat run for agent. |
| POST | `/api/agents/:id/claude-login` | Claude login helper flow for adapter. |
| GET | `/api/companies/:companyId/heartbeat-runs` | List heartbeat runs for company. |
| GET | `/api/companies/:companyId/live-runs` | Currently active runs for company. |
| GET | `/api/heartbeat-runs/:runId` | Heartbeat run detail. |
| POST | `/api/heartbeat-runs/:runId/cancel` | Cancel run. |
| GET | `/api/heartbeat-runs/:runId/events` | Run event stream payload. |
| GET | `/api/heartbeat-runs/:runId/log` | Run log. |
| GET | `/api/heartbeat-runs/:runId/workspace-operations` | Workspace operations for run. |
| GET | `/api/workspace-operations/:operationId/log` | Log for a workspace operation. |
| GET | `/api/issues/:issueId/live-runs` | Live runs for an issue. |
| GET | `/api/issues/:issueId/active-run` | Active run for an issue (if any). |

### Projects & project workspaces

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/projects` | List projects. |
| GET | `/api/projects/:id` | Project detail. |
| POST | `/api/companies/:companyId/projects` | Create project. |
| PATCH | `/api/projects/:id` | Update project. |
| GET | `/api/projects/:id/workspaces` | List workspaces attached to project. |
| POST | `/api/projects/:id/workspaces` | Create project workspace. |
| PATCH | `/api/projects/:id/workspaces/:workspaceId` | Update workspace (cwd, runtime, etc.). |
| POST | `/api/projects/:id/workspaces/:workspaceId/runtime-services/:action` | Workspace runtime control (`action`: `start` \| `stop` \| `restart` \| `run`). |
| POST | `/api/projects/:id/workspaces/:workspaceId/runtime-commands/:action` | Alias path for the same runtime handler. |
| DELETE | `/api/projects/:id/workspaces/:workspaceId` | Delete workspace. |
| DELETE | `/api/projects/:id` | Delete project. |

### Execution workspaces

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/execution-workspaces` | List execution workspaces (optional filters: `projectId`, `projectWorkspaceId`, `issueId`, `status`, `reuseEligible`; `summary=true` for summaries). |
| GET | `/api/execution-workspaces/:id` | Execution workspace detail. |
| GET | `/api/execution-workspaces/:id/close-readiness` | Whether workspace can be closed/archived (blocking reasons). |
| GET | `/api/execution-workspaces/:id/workspace-operations` | Operations log entries for the workspace. |
| POST | `/api/execution-workspaces/:id/runtime-services/:action` | Runtime control for execution workspace (`start` \| `stop` \| `restart` \| `run`). |
| POST | `/api/execution-workspaces/:id/runtime-commands/:action` | Alias for same handler. |
| PATCH | `/api/execution-workspaces/:id` | Update workspace; setting `status` to `archived` runs close + cleanup pipeline. |

### Issues, labels, documents, comments, attachments

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/issues` | **400 helper** — use company-scoped issues listing. |
| GET | `/api/companies/:companyId/issues` | List/filter issues for company. |
| GET | `/api/companies/:companyId/labels` | Issue labels for company. |
| POST | `/api/companies/:companyId/labels` | Create label. |
| DELETE | `/api/labels/:labelId` | Delete label. |
| GET | `/api/issues/:id/heartbeat-context` | Context payload for heartbeat about issue. |
| GET | `/api/issues/:id` | Issue detail. |
| GET | `/api/issues/:id/work-products` | Work products on issue. |
| GET | `/api/issues/:id/documents` | List structured documents on issue. |
| GET | `/api/issues/:id/documents/:key` | Get one document (latest). |
| PUT | `/api/issues/:id/documents/:key` | Upsert document. |
| GET | `/api/issues/:id/documents/:key/revisions` | Revision list for document key. |
| POST | `/api/issues/:id/documents/:key/revisions/:revisionId/restore` | Restore document to a prior revision. |
| DELETE | `/api/issues/:id/documents/:key` | Delete document (board only). |
| POST | `/api/issues/:id/work-products` | Add work product. |
| PATCH | `/api/work-products/:id` | Update work product. |
| DELETE | `/api/work-products/:id` | Delete work product. |
| POST | `/api/issues/:id/read` | Mark issue read for current board user inbox semantics. |
| DELETE | `/api/issues/:id/read` | Unmark read. |
| POST | `/api/issues/:id/inbox-archive` | Archive in inbox. |
| DELETE | `/api/issues/:id/inbox-archive` | Remove inbox archive. |
| GET | `/api/issues/:id/approvals` | Approvals linked to issue. |
| POST | `/api/issues/:id/approvals` | Link an approval to issue. |
| DELETE | `/api/issues/:id/approvals/:approvalId` | Unlink approval. |
| POST | `/api/companies/:companyId/issues` | Create issue. |
| POST | `/api/issues/:id/children` | Create child issue. |
| PATCH | `/api/issues/:id` | Update issue (large surface: status, assignee, deps, etc.). |
| DELETE | `/api/issues/:id` | Delete issue. |
| POST | `/api/issues/:id/checkout` | Check out issue to an agent (starts work session semantics). |
| POST | `/api/issues/:id/release` | Release check-out. |
| GET | `/api/issues/:id/comments` | List comments. |
| GET | `/api/issues/:id/comments/:commentId` | Single comment. |
| DELETE | `/api/issues/:id/comments/:commentId` | Delete comment (permissions enforced in handler). |
| GET | `/api/issues/:id/feedback-votes` | Feedback votes on issue. |
| GET | `/api/issues/:id/feedback-traces` | Feedback traces for issue. |
| GET | `/api/feedback-traces/:traceId` | Single trace. |
| GET | `/api/feedback-traces/:traceId/bundle` | Trace bundle for export/debug. |
| POST | `/api/issues/:id/comments` | Add comment / thread message. |
| POST | `/api/issues/:id/feedback-votes` | Upsert feedback vote. |
| GET | `/api/issues/:id/attachments` | List attachments. |
| POST | `/api/companies/:companyId/issues/:issueId/attachments` | Upload attachment (multipart). |
| GET | `/api/attachments/:attachmentId/content` | Download attachment bytes. |
| DELETE | `/api/attachments/:attachmentId` | Delete attachment. |

### Routines

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/routines` | List routines. |
| POST | `/api/companies/:companyId/routines` | Create routine. |
| GET | `/api/routines/:id` | Routine detail. |
| PATCH | `/api/routines/:id` | Update routine. |
| GET | `/api/routines/:id/runs` | List routine runs. |
| POST | `/api/routines/:id/triggers` | Add trigger. |
| PATCH | `/api/routine-triggers/:id` | Update trigger. |
| DELETE | `/api/routine-triggers/:id` | Delete trigger. |
| POST | `/api/routine-triggers/:id/rotate-secret` | Rotate trigger secret (webhook/cron secrets). |
| POST | `/api/routines/:id/run` | Manually enqueue/run routine (`202` response). |
| POST | `/api/routine-triggers/public/:publicId/fire` | Public/webhook trigger ingress (auth via headers/body; idempotent). |

### Goals

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/goals` | List goals. |
| GET | `/api/goals/:id` | Goal detail. |
| POST | `/api/companies/:companyId/goals` | Create goal. |
| PATCH | `/api/goals/:id` | Update goal. |
| DELETE | `/api/goals/:id` | Delete goal. |

### Approvals (governance)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/approvals` | List approvals (optional status filter). |
| GET | `/api/approvals/:id` | Approval detail. |
| POST | `/api/companies/:companyId/approvals` | Create approval. |
| GET | `/api/approvals/:id/issues` | Issues linked to approval. |
| POST | `/api/approvals/:id/approve` | Approve (board). |
| POST | `/api/approvals/:id/reject` | Reject. |
| POST | `/api/approvals/:id/request-revision` | Request revision (board). |
| POST | `/api/approvals/:id/resubmit` | Resubmit after revision. |
| GET | `/api/approvals/:id/comments` | List approval comments. |
| POST | `/api/approvals/:id/comments` | Add approval comment. |

### Secrets

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/secret-providers` | Available secret provider types. |
| GET | `/api/companies/:companyId/secrets` | List secret metadata for company. |
| POST | `/api/companies/:companyId/secrets` | Create secret. |
| POST | `/api/secrets/:id/rotate` | Rotate secret. |
| PATCH | `/api/secrets/:id` | Update secret metadata/value. |
| DELETE | `/api/secrets/:id` | Delete secret. |

### Costs & budgets

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/companies/:companyId/cost-events` | Ingest LLM cost event. |
| POST | `/api/companies/:companyId/finance-events` | Ingest finance event. |
| GET | `/api/companies/:companyId/costs/summary` | Cost summary. |
| GET | `/api/companies/:companyId/costs/by-agent` | Costs grouped by agent. |
| GET | `/api/companies/:companyId/costs/by-agent-model` | By agent + model. |
| GET | `/api/companies/:companyId/costs/by-provider` | By provider. |
| GET | `/api/companies/:companyId/costs/by-biller` | By biller. |
| GET | `/api/companies/:companyId/costs/finance-summary` | Finance summary. |
| GET | `/api/companies/:companyId/costs/finance-by-biller` | Finance by biller. |
| GET | `/api/companies/:companyId/costs/finance-by-kind` | Finance by kind. |
| GET | `/api/companies/:companyId/costs/finance-events` | Finance event list. |
| GET | `/api/companies/:companyId/costs/window-spend` | Rolling window spend. |
| GET | `/api/companies/:companyId/costs/quota-windows` | Quota windows. |
| GET | `/api/companies/:companyId/budgets/overview` | Budget overview. |
| POST | `/api/companies/:companyId/budgets/policies` | Upsert budget policy (board). |
| POST | `/api/companies/:companyId/budget-incidents/:incidentId/resolve` | Resolve a budget incident (board). |
| GET | `/api/companies/:companyId/costs/by-project` | Costs by project. |
| PATCH | `/api/companies/:companyId/budgets` | Update company budget knobs. |
| PATCH | `/api/agents/:agentId/budgets` | Update per-agent budget knobs. |

### Assets

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/companies/:companyId/assets/images` | Upload generic image asset. |
| POST | `/api/companies/:companyId/logo` | Upload company logo. |
| GET | `/api/assets/:assetId/content` | Stream asset bytes. |

### Company skills

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/skills` | List company skills. |
| GET | `/api/companies/:companyId/skills/:skillId` | Skill detail. |
| GET | `/api/companies/:companyId/skills/:skillId/update-status` | Remote update availability. |
| GET | `/api/companies/:companyId/skills/:skillId/files` | Read skill file (`?path=` relative path, default `SKILL.md`). |
| POST | `/api/companies/:companyId/skills` | Create local skill. |
| PATCH | `/api/companies/:companyId/skills/:skillId/files` | Update skill file content. |
| POST | `/api/companies/:companyId/skills/import` | Import skills from a source descriptor. |
| POST | `/api/companies/:companyId/skills/scan-projects` | Scan project workspaces for skills. |
| DELETE | `/api/companies/:companyId/skills/:skillId` | Delete skill. |
| POST | `/api/companies/:companyId/skills/:skillId/install-update` | Install pending update for skill. |

### User profiles (company directory)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/users/:userSlug/profile` | Rich profile card: stats windows, daily activity, recent issues, top agents/providers. |

### Sidebar & inbox dismissals

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/sidebar-badges` | Counts for sidebar badges (e.g. join requests). |
| GET | `/api/sidebar-preferences/me` | Board user’s global sidebar company order. |
| PUT | `/api/sidebar-preferences/me` | Persist company order. |
| GET | `/api/companies/:companyId/sidebar-preferences/me` | Project order within company for user. |
| PUT | `/api/companies/:companyId/sidebar-preferences/me` | Persist project order. |
| GET | `/api/companies/:companyId/inbox-dismissals` | List dismissed inbox keys for user. |
| POST | `/api/companies/:companyId/inbox-dismissals` | Dismiss inbox item (`itemKey` like `approval:…`, `join:…`, `run:…`). |

### Instance settings & backups

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/instance/settings/general` | Read general instance settings (keyboard shortcuts, etc.). |
| PATCH | `/api/instance/settings/general` | Update general settings (instance admin). |
| GET | `/api/instance/settings/experimental` | Read experimental flags. |
| PATCH | `/api/instance/settings/experimental` | Update experimental flags (instance admin). |
| POST | `/api/instance/database-backups` | Trigger manual DB backup (instance admin; only mounted when backup service is configured). |

### Adapters (host packages)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/adapters` | List installed adapter packages. |
| POST | `/api/adapters/install` | Install adapter from npm tarball/spec. |
| PATCH | `/api/adapters/:type` | Update adapter pinned version / metadata. |
| PATCH | `/api/adapters/:type/override` | Set local path override for adapter dev. |
| DELETE | `/api/adapters/:type` | Remove adapter. |
| POST | `/api/adapters/:type/reload` | Reload adapter module. |
| POST | `/api/adapters/:type/reinstall` | Reinstall adapter package. |
| GET | `/api/adapters/:type/config-schema` | JSON Schema for adapter config. |
| GET | `/api/adapters/:type/ui-parser.js` | Serve UI parser bundle for adapter config forms. |

### Access, invites, members, admin (`server/src/routes/access.ts`)

All paths below are under **`/api`**.

**Board claim (local / bootstrap flows)**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/board-claim/:token` | Inspect board-ownership claim challenge. |
| POST | `/api/board-claim/:token/claim` | Complete claim with code (signed-in board user). |

**CLI ↔ board API key pairing**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/cli-auth/challenges` | Create CLI auth challenge + pending board token + approval URLs. |
| GET | `/api/cli-auth/challenges/:id` | Poll challenge status (`?token=` secret required). |
| POST | `/api/cli-auth/challenges/:id/approve` | Board user approves challenge → issues board API key. |
| POST | `/api/cli-auth/challenges/:id/cancel` | Cancel challenge with token. |
| GET | `/api/cli-auth/me` | Board user’s access snapshot (companies, instance admin). |
| POST | `/api/cli-auth/revoke-current` | Revoke the board API key used for this request. |

**Built-in skills for authenticated users**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/skills/available` | List built-in skill names. |
| GET | `/api/skills/index` | Index entries with paths to each skill markdown. |
| GET | `/api/skills/:skillName` | Return skill markdown body. |

**Invites (token in path is raw invite token)**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/companies/:companyId/invites` | Create company invite (`users:invite`). |
| POST | `/api/companies/:companyId/openclaw/invite-prompt` | Create agent-only invite tailored for OpenClaw-style prompts. |
| GET | `/api/invites/:token` | Public invite summary + join-request status. |
| GET | `/api/invites/:token/logo` | Stream company logo for invite landing. |
| GET | `/api/invites/:token/onboarding` | JSON onboarding manifest for invitee tooling. |
| GET | `/api/invites/:token/onboarding.txt` | Plaintext onboarding doc. |
| GET | `/api/invites/:token/skills/index` | Skills index scoped to invite. |
| GET | `/api/invites/:token/skills/:skillName` | Markdown skill via invite (currently `paperclip` only). |
| GET | `/api/invites/:token/test-resolution` | Probe arbitrary `http(s)` URL reachability (`?url=`, optional `timeoutMs`). |
| POST | `/api/invites/:token/accept` | Accept invite (human/agent/bootstrap variants; returns join request / bootstrap state). |
| POST | `/api/invites/:inviteId/revoke` | Revoke invite by **database id** (`inviteId`). |

**Join requests & membership**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/companies/:companyId/invites` | List invites for company. |
| GET | `/api/companies/:companyId/join-requests` | List join requests (filter via query). |
| POST | `/api/companies/:companyId/join-requests/:requestId/approve` | Approve join (creates agent or grants user access per request). |
| POST | `/api/companies/:companyId/join-requests/:requestId/reject` | Reject join request. |
| POST | `/api/join-requests/:requestId/claim-api-key` | Agent claims initial API key with `claimSecret` after approval. |
| GET | `/api/companies/:companyId/members` | Members + access summary (`users:manage_permissions`). |
| GET | `/api/companies/:companyId/user-directory` | Directory of users for mentions / UI. |
| PATCH | `/api/companies/:companyId/members/:memberId` | Update membership role/status. |
| PATCH | `/api/companies/:companyId/members/:memberId/role-and-grants` | Update role, status, and permission grants atomically. |
| POST | `/api/companies/:companyId/members/:memberId/archive` | Archive member with optional reassignment. |
| PATCH | `/api/companies/:companyId/members/:memberId/permissions` | Replace permission grants for principal. |

**Instance admin directory**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/users/:userId/promote-instance-admin` | Promote user to instance admin. |
| GET | `/api/admin/users` | Search/list users (trimmed to 50; includes admin flags and membership counts). |
| POST | `/api/admin/users/:userId/demote-instance-admin` | Remove instance admin role. |
| GET | `/api/admin/users/:userId/company-access` | Companies the user can access + admin metadata. |
| PUT | `/api/admin/users/:userId/company-access` | Set allowed company list for user. |

### Plugin host API (`server/src/routes/plugins.ts`)

All under **`/api`**. These power plugin installation, worker bridge, jobs, config, and webhooks.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/plugins` | List plugins (registry + state). |
| GET | `/api/plugins/examples` | Example plugin manifests / scaffold hints. |
| GET | `/api/plugins/ui-contributions` | Aggregate UI slot contributions from enabled plugins. |
| GET | `/api/plugins/tools` | List exposed plugin tools. |
| POST | `/api/plugins/tools/execute` | Execute a plugin tool by id (host dispatches to worker). |
| POST | `/api/plugins/install` | Install plugin package. |
| POST | `/api/plugins/:pluginId/bridge/data` | Worker→host data bridge RPC. |
| POST | `/api/plugins/:pluginId/bridge/action` | Worker→host action bridge RPC. |
| POST | `/api/plugins/:pluginId/data/:key` | Typed plugin data channel write. |
| POST | `/api/plugins/:pluginId/actions/:key` | Fire host-handled plugin action. |
| GET | `/api/plugins/:pluginId/bridge/stream/:channel` | Long-lived SSE/stream channel for worker events. |
| GET | `/api/plugins/:pluginId` | Plugin detail + manifest. |
| DELETE | `/api/plugins/:pluginId` | Uninstall plugin. |
| POST | `/api/plugins/:pluginId/enable` | Enable plugin for instance. |
| POST | `/api/plugins/:pluginId/disable` | Disable plugin. |
| GET | `/api/plugins/:pluginId/health` | Health check worker / lifecycle state. |
| GET | `/api/plugins/:pluginId/logs` | Fetch plugin logs (query pagination). |
| POST | `/api/plugins/:pluginId/upgrade` | Upgrade plugin package version. |
| GET | `/api/plugins/:pluginId/config` | Read saved plugin config (redacted). |
| POST | `/api/plugins/:pluginId/config` | Save plugin config. |
| POST | `/api/plugins/:pluginId/config/test` | Validate/test plugin config. |
| GET | `/api/plugins/:pluginId/jobs` | List scheduled jobs declared by plugin. |
| GET | `/api/plugins/:pluginId/jobs/:jobId/runs` | Job run history. |
| POST | `/api/plugins/:pluginId/jobs/:jobId/trigger` | Manually trigger job. |
| POST | `/api/plugins/:pluginId/webhooks/:endpointKey` | Inbound webhook endpoint for plugin. |
| GET | `/api/plugins/:pluginId/dashboard` | Plugin dashboard payload for UI embedding. |

### Plugin UI static

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/_plugins/:pluginId/ui/*filePath` | Serve hashed ESM UI bundles from plugin package `dist/ui` with traversal protection and cache headers. |

---

## UI: global routes (no company prefix)

From `ui/src/App.tsx` (inside `CloudAccessGate` unless noted).

| Path | Screen / behavior |
|------|-------------------|
| `/` | Redirect to `/{selected-or-first-company}/dashboard`, onboarding if no companies (non-authenticated cloud mode skips auto wizard per health). |
| `/auth` | `AuthPage` — sign-in. |
| `/board-claim/:token` | Claim board ownership flow. |
| `/cli-auth/:id` | Approve CLI auth challenge in browser. |
| `/invite/:token` | Invite landing (join / agent onboarding). |
| `/onboarding` | Onboarding route page (wizard launcher). |
| `/instance` | Redirect → `/instance/settings/general`. |
| `/instance/settings/...` | `Layout` with `InstanceSidebar`: **Profile**, **General**, **Access**, **Heartbeats**, **Experimental**, **Plugins** (+ per-plugin links), **Adapters**. |
| `/companies`, `/issues`, `/projects`, … (various) | Unprefixed redirects into `/{companyPrefix}/…` when a company exists. |
| `/*` | Not found (global). |

## UI: company board shell (`/{companyPrefix}/...`)

Child routes from `boardRoutes()` in `ui/src/App.tsx`.

### Main sidebar (`ui/src/components/Sidebar.tsx`)

**Header:** company switcher, search (command palette).

**Primary**

- **New Issue** (dialog)
- **Dashboard** → `/{prefix}/dashboard`
- **Inbox** → `/{prefix}/inbox` (badge)
- Plugin `sidebar` slot outlets (dynamic)

**Work**

- **Issues** → `/{prefix}/issues`
- **Routines** → `/{prefix}/routines`
- **Goals** → `/{prefix}/goals`
- **Workspaces** → `/{prefix}/workspaces` (only if instance experimental `enableIsolatedWorkspaces`)

**Projects** — dynamic list (`SidebarProjects`).

**Agents** — hierarchical list (`SidebarAgents`).

**Company**

- **Org** → `/{prefix}/org`
- **Skills** → `/{prefix}/skills/...`
- **Costs** → `/{prefix}/costs`
- **Activity** → `/{prefix}/activity`
- **Settings** → `/{prefix}/company/settings`

**Footer region:** plugin `sidebarPanel` slot outlets.

### Company settings sidebar (`CompanySettingsSidebar.tsx`)

- Back to **Dashboard**
- **General** → `/company/settings`
- **Access** → `/company/settings/access` (join-request badge)
- **Invites** → `/company/settings/invites`

(Paths are relative inside the company URL prefix.)

### Mobile bottom nav (`MobileBottomNav.tsx`)

**Home** (`/dashboard`), **Issues**, **Create** (new issue dialog), **Agents** (`/agents/all`), **Inbox**.

### Other notable company routes (not all in sidebar)

| Route pattern | Page |
|---------------|------|
| `/companies` | Company list / picker |
| `/company/export/*`, `/company/import` | Export / import wizards |
| `/skills/*` | Company skills browser/editor |
| `/plugins/:pluginId` | Plugin-contributed board page |
| `/:pluginRoutePath` | Dynamic per-plugin route from manifest |
| `/agents/all` \| `/active` \| `/paused` \| `/error` | Agent list filters (same `Agents` page) |
| `/agents/new` | New agent |
| `/agents/:agentId`, `/agents/:agentId/:tab`, `/agents/:agentId/runs/:runId` | Agent detail (tabs below) |
| `/projects`, `/projects/:projectId/...` | Projects + detail (tabs below) |
| `/issues`, `/issues/:issueId` | Global issue list / issue detail |
| `/routines`, `/routines/:routineId` | Routines |
| `/execution-workspaces/:workspaceId`, `.../configuration`, `.../runtime-logs`, `.../issues` | Execution workspace detail |
| `/goals`, `/goals/:goalId` | Goals |
| `/approvals`, `/approvals/pending`, `/approvals/all`, `/approvals/:approvalId` | Approvals queue + detail |
| `/costs` | Costs |
| `/activity` | Activity log |
| `/inbox/...` | Inbox (tabs below) |
| `/inbox/requests` | Join request queue |
| `/u/:userSlug` | User profile within company |
| `/design-guide` | Internal design gallery |
| `/org` | Org chart page |

### Agent detail tabs (`AgentDetail.tsx`)

Shown when **not** viewing a specific run URL. Tab values are URL segments under `/agents/:agentId/:tab`:

| Tab slug | Label |
|------------|--------|
| `dashboard` | Dashboard |
| `instructions` | Instructions |
| `skills` | Skills |
| `configuration` | Configuration |
| `runs` | Runs |
| `budget` | Budget |

Run deep-link: `/agents/:agentId/runs/:runId` replaces the tab bar with run viewer navigation.

### Project detail tabs (`ProjectDetail.tsx`)

Routes: `/projects/:id/overview`, `/issues`, `/issues/:filter`, `/workspaces`, `/workspaces/:workspaceId`, `/configuration`, `/budget`, or `?tab=plugin:...` for plugin tabs.

| Tab key | Label | Notes |
|---------|--------|------|
| `list` | Issues | Default issue list tab |
| `overview` | Overview | |
| `workspaces` | Workspaces | Only when isolated workspaces experimental + project has workspaces |
| `configuration` | Configuration | |
| `budget` | Budget | |
| `plugin:…` | Plugin-provided | From `detailTab` plugin slots |

### Issue detail tabs (`IssueDetail.tsx`)

| Tab value | Label |
|-----------|--------|
| `chat` | Chat |
| `activity` | Activity |
| `related-work` | Related work |
| *(dynamic)* | Plugin `detailTab` slots |

### Execution workspace detail tabs (`ExecutionWorkspaceDetail.tsx`)

URL segments: `configuration`, `runtime-logs`, `issues`.

| Internal tab | Label |
|--------------|--------|
| `configuration` | Configuration |
| `runtime_logs` | Runtime logs |
| `issues` | Issues |

### Inbox tabs (`Inbox.tsx`)

Paths: `/inbox/mine`, `/inbox/recent`, `/inbox/unread`, `/inbox/all` (root `/inbox` redirects to last-used tab).

| Tab | Label |
|-----|--------|
| `mine` | Mine |
| `recent` | Recent |
| `unread` | Unread |
| `all` | All |

### Approvals list tabs (`Approvals.tsx`)

`/approvals` redirects to `/approvals/pending`.

| Path suffix | Label |
|---------------|--------|
| `pending` | Pending (count badge) |
| `all` | All |

---

## Implementation map

| Concern | Primary server files |
|---------|----------------------|
| App mount order, `/api`, auth, static UI | `server/src/app.ts` |
| Route barrels | `server/src/routes/index.ts` (partial; `app.ts` imports many directly) |
| Large domains | `issues.ts`, `agents.ts`, `access.ts`, `plugins.ts`, `projects.ts`, `execution-workspaces.ts` |
| UI router | `ui/src/App.tsx` |
| Sidebars | `ui/src/components/Sidebar.tsx`, `InstanceSidebar.tsx`, `CompanySettingsSidebar.tsx` |

This document was generated from the repository layout as of the workspace snapshot; if you add routes, keep this file in sync or regenerate from `router.(get|post|patch|put|delete)` patterns under `server/src/routes/`.
