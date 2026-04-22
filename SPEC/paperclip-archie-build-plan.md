# Archie Build Plan — Paperclip Backend + Archie UI On Top

> Note:
> `SPEC/ARCHIE_PAPERCLIP_V1.md` is now the canonical v1 source of truth for Archie Bravo on top of Paperclip.
> Use this file as historical/supporting context unless a specific section is intentionally being carried forward.

_Last updated: 2026-04-22_

This is the canonical build plan. Paperclip is the backend control plane. Archie is the product experience we build on top of it. They communicate via Paperclip's REST API.

---

## The Decision

Paperclip (self-hosted on Hostinger VPS) is the **24/7 control plane** — companies, agents, goals, issues, heartbeats, adapters, skills, budgets, approvals, activity, audit trail. Everything the "living agent" backend needs.

Paperclip's built-in dashboard is an **operator/admin console**, not our end-user product. Users never see it (except maybe as a power-user admin view later).

Archie is a **separate Next.js product** with its own UI that talks to Paperclip via the REST API. The UI is Lovable / Manus / Claude Code style — chat on the left, tabbed workspace on the right, draggable divider, full-screen either side.

We do **not** rebuild anything Paperclip already does. We focus entirely on:
- The product UI (chat, Canvas, Journal, Agenda, Sandbox, Prompt Store)
- The adapter that runs inside Paperclip's heartbeat (probably `claude_local` or a lightly customized fork)
- The Mem0 helper (thin memory layer pre/post each heartbeat)
- Seed Roles + Skills as markdown files authored for Paperclip's skill system
- The Business Manual Builder feature (generates Manual, saves to Mem0 + always-on skills)

## The Stack

| Layer | What It Owns |
|---|---|
| **Archie UI (Next.js)** | Product shell — chat, split view, tabs, Prompt Store browser, workspace management |
| **Paperclip** (self-hosted) | Companies, Agents, Goals, Issues, Heartbeats, Adapters, Skills, Budgets, Approvals, Activity |
| **Adapter** (Claude Code CLI / Codex CLI / custom) | Spawns the agent runtime per heartbeat, session persistence across wakes |
| **Mem0 OSS** (sidecar) | Long-term memory — scoped per workspace (per Paperclip company + agent) |
| **Working directory** (per-workspace folder on VPS) | Where the adapter runs — repo, files, notes, code |
| **E2B** (optional, later) | Harder-isolated sandbox for coding work — invoked by the adapter |
| **OpenAI + Claude APIs** | The underlying models (called by the adapter's CLI) |

Deployed on: one Hostinger Linux VPS for V1. Later: multi-VPS or Docker-per-workspace when isolation matters.

## Concept Mapping (Paperclip → Archie)

| Paperclip term | Archie product term | Notes |
|---|---|---|
| **Company** | **Workspace** | One Paperclip Company per Archie workspace. User sees "workspace," never "company" unless we expose the admin view. |
| **Agent** | The living agent inside a workspace | Start with one primary Agent per Company. Multi-agent hierarchy unlocks later. |
| **Goal** | North Star metric | Lives in the Business Manual (Mem0); optionally mirrored as the Company's Paperclip Goal for native tracking. |
| **Issue** | Agenda item | Paperclip's issue tree IS the workspace's work queue. |
| **Parent Issue** | Nested agenda work | Paperclip tree = Archie's decomposition. |
| **Skill** (`SKILL.md` markdown) | Skill from the Prompt Store | Exact same format. We author markdown, drop into Paperclip's skill directory. |
| **Adapter config** | The "engine" powering this workspace's agent | Usually `claude_local` or `codex_local` — selectable per workspace. |
| **Heartbeat** | Wake | Schedule, event, assignment, mention, approval-resolution, manual invoke. |
| **Approval** | "Archie needs your call" card | Surfaces in Archie UI as a gated action requiring user click. |
| **Board** | The user | The human operator. One per workspace typically (multi-user boards = later). |
| **Budget** | Workspace spend brake | Paperclip enforces at company + agent level. We surface in Cloud tab and as alerts. |
| **Activity** | Journal entries + run records | Streamed into Archie's Journal tab. |
| **Working directory** | Per-workspace project folder | Lives on the VPS. Shown in Archie's Sandbox tab. |
| **Session state** (adapter-owned) | The agent's continuity across wakes | Claude Code CLI / Codex CLI persist their own; we don't rebuild this. |

## What We Do NOT Build

Stuff Paperclip already handles — do not reinvent:
- Heartbeat scheduler / cron
- Agent runtime spawning
- Session persistence across wakes
- Issue tree CRUD + status workflow
- Budget enforcement + cost tracking
- Approval gating
- Activity log / audit trail
- Agent + company data model
- REST API + auth
- Adapter framework (Claude Code, Codex, OpenClaw, Hermes, shell, HTTP all ship built-in)

## What We DO Build

1. **Archie UI (Next.js)** — the product-facing shell (detailed spec below)
2. **Mem0 helper service** — thin pre/post heartbeat memory layer
3. **Seed Role + Skill markdown files** — authored as Paperclip-compatible `SKILL.md` files
4. **Business Manual Builder** — a feature in Archie UI that generates a Manual, writes it to Mem0 + as always-on skills
5. **Adapter config templates** — one per Role, pre-wired with the right skills + working directory setup
6. **Optional custom adapter** — if `claude_local` / `codex_local` don't give us enough control over prompt construction / tool registry

---

## Archie UI Spec

The product experience. Not Paperclip's dashboard. Next.js app, Lovable-style.

### Global Left Rail (Persistent)

```
🏠  Home             ← landing, new-workspace composer
📂  Workspaces       ← user's running workspaces
🛒  Prompt Store     ← Roles, Skills, Business Manual Builder
📅  Agenda           ← cross-workspace view; filterable per workspace
📓  Journal          ← cross-workspace view; filterable per workspace
🧠  Memory           ← global memory (user-level, cross-workspace)
🔌  Integrations     ← MCP connectors, OAuth
⚙️  Settings         ← account, billing, help
```

Additionally: an "Admin" tab (hidden, power-user / us only) that links directly to Paperclip's native dashboard for infra-level operations.

### Home Screen

Minimalist. Lovable-style landing.

**Top — hero composer:**
- Big prompt box: "What do you want Archie to run for you?"
- Freeform text, URL paste, file attach, voice input
- Below the composer:
  - **Browse Prompt Store** button — opens the store inline to pre-pick Roles/Skills before submitting
  - Optional quick-pick row of verb buttons: **Build / Run / Hire / Clone·Compete** (each maps to a Role in the store, applied to the new workspace)

**Scroll-down dock — tabbed:**

| Tab | Shows |
|---|---|
| **Workspaces** | User's running workspaces (list). Click to open. |
| **Saved** | Bookmarked Roles/Skills, half-finished Manual drafts. |
| **Prompts** | Featured Roles + Skills from the store. |
| **Browse all →** | Jump to full Prompt Store. |

**Submit behavior:** submitting the composer creates a new Paperclip Company + a primary Agent, spins up the working directory, applies any pre-picked Role/Skills, opens the split-view UI with the first message sent. No separate setup wizard.

### Workspaces Tab

Grid/list of the user's workspaces. Each card shows:
- Workspace name + Role assigned
- Live status badge (running / idle / sleeping until X / paused / needs approval / error)
- Today's Journal pulse summary (one line)
- Open agenda count
- Pending approvals count (if any, highlighted)
- Last activity timestamp
- Month-to-date spend vs. budget bar

Click a card → opens the **Split-View UI** for that workspace.

Bulk actions: pause all / resume all / export memory. Cross-workspace search bar.

### Split-View UI (The Main Workspace Surface)

This is where users spend their time. Lovable/Manus/Claude-Code style.

**Layout:**
- **Left pane** — Chat
- **Middle** — Draggable divider (resize both sides)
- **Right pane** — Tabbed workspace (icon tabs at top)
- Both panes can **expand to full screen** on click (like Lovable)
- **Top bar** — workspace name, status indicator, role chip, approval alert count, spend indicator, "Admin →" dropdown (links to Paperclip native admin for that Company)

**Left pane — Chat:**
- Standard streaming chat (OpenAI / Claude via the adapter)
- User types → routes through our API → adapter manual-invoke on Paperclip → streams response back
- Tool calls visible inline
- Attachments, voice input supported
- After the first message, the chat input slides down, conversation history fills the pane
- "Archie is working…" indicator appears when a heartbeat is running in background

**Right pane — Tabbed Workspace:**

| Icon tab | What It Shows | How It's Wired |
|---|---|---|
| 🎨 **Canvas** | Live-rendered generations, UI previews, drafted documents, the Business Manual Builder form | Reads latest artifacts from the working directory; re-renders on file change |
| 📓 **Journal** | Streamed entries — morning reflections, pulses, observations, decisions, end-of-day summaries | Reads Paperclip Activity API + custom journal entries written by the adapter |
| 📅 **Agenda** | Work queue — open / in-progress / blocked / done Issues with Paperclip run status per item | Reads Paperclip Issues API + heartbeat run status |
| 💻 **Sandbox** | E2B or working-directory view — file tree, terminal, dev server, logs | Reads the working dir / invokes E2B session API |
| 📖 **Manual** | The Business Operating Manual — sections list, full text view, Upgrade Manual button | Reads from Mem0 (primary) + always-on skill files |
| ❓ **Questions** | "Archie needs your call" queue — open approvals, clarifying questions | Reads Paperclip Approvals API + custom question records |
| ☁️  **Cloud** | Settings stack — overview / secrets / database / users / domains / AI config / cron | Reads Paperclip + provider APIs; writes updates via Paperclip's agent config |

**Tab switching:** icon-based top row (like VS Code activity bar but horizontal). Click swaps the right-pane content. State of each tab preserved on switch.

**Draggable divider:** full-height vertical handle between panes. Drag to resize. Double-click to snap to 50/50 or to expand one side full. Click the arrow/expand icon on either pane's top-right to blow it to full-screen.

### Prompt Store Tab

Three sub-sections accessible via tabs inside:

**1. Roles** — what the agent's job is.
- Card grid of Roles. Each card: title, one-line description, "what Archie does" bullets, "what's still on you" (requirements), suggested Skills that pair well.
- Click **Add to Workspace** → pick workspace from modal → applies. Under the hood: writes the Role's markdown as an always-on skill on the Paperclip Agent + updates Agent config / system prompt.
- Seed catalog: Business Runner, Practice Ops Operator, Developer, Designer, Support Agent, No-Show Specialist, Lead Qualifier, Bookkeeper, Competitor Cloner, Competitor Slayer, Brainstormer.

**2. Skills** — expert-lens mindsets.
- Grid/list filterable by function: Product+Design, Engineering, Marketing+Growth, Content+Media, Sales+Pipeline, Customer-Facing Craft, Ops+Systems, Commerce+Inventory, Universal.
- Click **Add to Workspace** → writes the Skill's markdown into the workspace Agent's skill directory. Paperclip loads on-demand per heartbeat.

**3. Business Manual Builder** — a feature, not a prompt.
- User picks a workspace (or creates a new one)
- Types the business: "What is it?"
- Picks sections from the library ([`MANUAL_SECTIONS.md`](../MANUAL_SECTIONS.md)) — suggested defaults based on the business description, user can add/remove
- For each section: fill manually or let Archie generate a first draft
- Save → writes Manual to Mem0 (scoped to this workspace) + writes the Core subset as always-on skills on the Agent
- Post-launch, user can return to Upgrade the Manual any time

### Agenda / Journal / Memory Tabs (Global)

Cross-workspace views:
- **Agenda** (global): all Issues across all workspaces, filterable. Click an item to open it in its workspace's Split-View.
- **Journal** (global): combined activity feed. Filter by workspace, entry type, date.
- **Memory** (global): user-level memory — preferences, taught corrections, anything promoted cross-workspace. Stored in Mem0 at the user scope.

### Integrations Tab

- MCP connector UX — browse available servers (Stripe, Gmail, Slack, etc.), click Connect, OAuth flow, tool appears in the workspace's tool registry
- Per-workspace toggle of which integrations this agent can reach
- Credential management (read-only surface; actual secrets live in Paperclip's secrets store)

### Settings Tab

Account, billing, plan, help, export, destroy account.

---

## Data Flow

### New workspace creation

```
User types prompt → Archie API route →
  1. Paperclip: create Company + primary Agent
     (adapter = claude_local by default, with working dir)
  2. Provision working directory on VPS
  3. Mem0: create scope for this workspace
  4. If Role pre-picked: write Role skill + set Agent system prompt
  5. If Skills pre-picked: write skill markdown files to Agent skill dir
  6. Optional: run Business Manual Builder flow, save Manual
  7. Open Split-View UI, send first message
```

### User types in chat

```
User message → Archie API route →
  Chat Archie runs (our code, direct SDK call — not via Paperclip heartbeat) →
    reads workspace context from Paperclip + Mem0 →
    streams response to UI →
    if heavy work needed: Paperclip manual-invoke API → fires a heartbeat →
      adapter runs → does the work → writes back via Paperclip API →
      streams updates to UI via Paperclip Activity API or our own SSE/websocket
```

### Scheduled heartbeat

```
Paperclip scheduler fires → adapter spawns (Claude Code CLI / Codex CLI) →
  pre-heartbeat: adapter calls Mem0 helper → fetch relevant memory for context →
  agent runs: claims Issues via Paperclip API, does work in working dir, writes Journal →
  post-heartbeat: adapter calls Mem0 helper → writes new memories back →
  Paperclip stores run record, updates Issue state, calculates cost →
  UI picks up changes via subscription / polling on Paperclip APIs
```

### Memory helper (Mem0 sidecar)

Thin service living on the same VPS. Two endpoints:
- `POST /memory/context` → `{ workspaceId, taskContext }` → returns relevant memory snippets for the run
- `POST /memory/write` → `{ workspaceId, entries }` → writes back durable facts after the run

Adapter wraps the agent invocation to call these before/after. Business Manual sections, Journal patterns, user preferences, task outcomes, decisions — all stored here.

---

## Role + Skill + Manual Implementation On Paperclip

### Roles

Implemented as always-on skills with a naming convention: `role-business-runner/SKILL.md`, `role-developer/SKILL.md`, etc.

Skill frontmatter:
```yaml
---
name: role-business-runner
description: Always load when agent is running a business end-to-end. Defines operator identity, authority, wake priorities.
always_load: true  # custom flag we read in our adapter
---
```

Content: the Role prompt body (what we drafted in `ENTRY_PATH_PROMPTS.md` — Coordinator-addendum content).

When user adds a Role from the Prompt Store, Archie UI writes this file to the Agent's skill directory via Paperclip's skill API, and sets the Agent's config to auto-load it.

### Skills

Normal Paperclip skills — on-demand loaded, markdown + YAML. Our Prompt Store Skills catalog authored in this format.

```yaml
---
name: upsell-and-expansion-artist
description: Use when identifying upsell / expansion opportunities. Mindset for turning one-off work into retainers.
---
```

Added to a workspace = written to that Agent's skill directory. Paperclip's skill routing (description-based) picks it up when relevant tasks fire.

### Business Manual

Two-tier storage:
- **Core sections** — always-on, loaded as always-load skills on the Agent. One skill per Core section (or consolidated into a few bigger always-load skills for efficiency). Written when the Manual is built/updated.
- **Reference sections (searchable)** — stored in Mem0 under the workspace scope, tagged as `manual:<cluster>:<section>`. Retrieved via Mem0 search when the task needs them.

Business Manual Builder writes to both when the user saves.

---

## Adapter Strategy

**V1:** use `claude_local` (Paperclip's built-in Claude Code CLI adapter) or `codex_local`. Customize via:
- Working directory setup (we control what's in the project folder)
- Skills installed (we control what markdown files are there)
- Agent system prompt (set via Paperclip Agent config)
- Pre/post hooks (Mem0 helper invocation)

If the built-in adapter doesn't give us enough control (e.g., we want a specific tool registry, MCP preload, custom prompt injection per heartbeat type), we fork or write a thin custom adapter.

**V2 (later):** Custom Archie adapter that:
- Invokes Claude Code CLI inside E2B sandbox (not local working dir)
- Preloads specific MCP servers for the workspace
- Injects the Coordinator / Chat Archie / Worker prompts based on heartbeat type
- Streams richer events to our UI (not just what Paperclip's native stdout parser captures)

---

## What To Modify In Paperclip

Goal: **modify nothing.** Everything we need sits in:
- Paperclip's REST API (consume it)
- Paperclip's skill directory convention (write markdown files to it)
- Adapter framework (use built-in adapter or write a custom one as a plugin)
- Agent config (set system prompt, adapter type, working dir, budget via API)

If something forces us to modify Paperclip core, that's a signal to push upstream or use a fork — not to deeply customize our own copy.

---

## Build Phases

### Phase 1 — Stand up Paperclip + prove the loop
- Deploy Paperclip to Hostinger VPS ✅ (done)
- Create one Company + one Agent manually via Paperclip UI
- Write a trivial `SKILL.md` — agent uses it
- Fire a heartbeat — agent wakes, claims a task, runs, records
- Prove session persistence across heartbeats

### Phase 2 — Build Mem0 sidecar + adapter wiring
- Deploy Mem0 OSS on the same VPS
- Write the memory helper service (two endpoints)
- Wire the adapter to call memory helper pre/post heartbeat
- Write one test Role + one test Skill
- Prove the agent actually uses Mem0 context during runs

### Phase 3 — Archie UI scaffold
- New Next.js repo, auth, basic routing
- Connect to Paperclip REST API (auth, companies, agents, issues, activity)
- Build Workspaces tab (list of Companies)
- Build Split-View UI shell (left chat + right tabs, draggable)
- Wire chat to a direct Claude/OpenAI SDK call (not heartbeats) + manual-invoke for heavy work

### Phase 4 — Core right-pane tabs
- Journal tab (reads Paperclip Activity)
- Agenda tab (reads Paperclip Issues, shows heartbeat run status)
- Sandbox tab (working directory view — file tree + terminal)
- Questions tab (Paperclip Approvals)

### Phase 5 — Prompt Store
- Roles browser + Add to Workspace flow
- Skills browser + Add to Workspace flow
- Skill markdown write to Paperclip skill directory
- Seed first catalog: 10 Roles + 30 Skills

### Phase 6 — Business Manual Builder
- Section picker flow using [`MANUAL_SECTIONS.md`](../MANUAL_SECTIONS.md) as source
- Per-section fill-or-generate
- Save to Mem0 (searchable) + write Core sections as always-on skills

### Phase 7 — Canvas + Manual tab + Cloud tab
- Canvas renders generated artifacts (UI previews, drafted docs)
- Manual tab shows the Manual + Upgrade flow
- Cloud tab — stacked settings

### Phase 8 — Living Behaviors + scheduled wakes
- Dream cycle (scheduled Paperclip heartbeat running consolidation)
- Morning/evening briefings
- Focus awareness (in-app vs. away)
- Adaptive sleep logic in the adapter

### Phase 9 — Hardening (later)
- Docker per-workspace working directories
- E2B sandbox for coding work
- Custom adapter with MCP preload + richer streaming
- Multi-user / multi-board
- Archie Cloud managed hosting offering

---

## Mental Model (Keep It Simple)

- **Paperclip = orchestration + durability + control plane** (we don't touch it; we call its API)
- **Adapter = how the agent actually runs** (Claude Code CLI inside Paperclip heartbeats)
- **Mem0 = memory** (adapter calls a helper; nothing else has to know)
- **Working directory = where work happens** (repo, notes, files, scripts)
- **Archie UI = the product** (Next.js, talks to Paperclip via REST, is what users see)
- **Roles + Skills = markdown files in Paperclip's skill system** (Prompt Store is a UI for authoring/browsing these)
- **Business Manual = Mem0 contents + a few always-on skills**

## The Real Shift From Prior Plans

- **Trigger.dev is out.** Paperclip already does heartbeats, retries, scheduling, runs. Trigger would be duplicate infrastructure.
- **Custom memory plumbing is out.** Mem0 handles it. Our adapter just calls a helper.
- **OpenClaw as code reference is out.** Paperclip has a built-in OpenClaw adapter if we want that style; otherwise we pick `claude_local` or `codex_local`.
- **"North Stars" terminology is out.** Workspaces (one Paperclip Company = one Archie workspace).
- **Template tiers are out.** Roles in the Prompt Store replace them.
- **Entry paths are out.** Composer input + selected Role = implicit entry path. No hardcoded flow machinery.

## Open Questions (Resolve At Implementation)

1. Does `claude_local` / `codex_local` give us enough control, or do we need a custom adapter early?
2. Where does streaming chat for end users live? (Likely: direct SDK call in our API route, outside Paperclip heartbeat.)
3. How much of Paperclip's native dashboard do we expose as a power-user admin view?
4. When does the working directory become E2B? (Start: local folder. Later: E2B when isolation matters.)
5. Does Archie's UI use Paperclip's Activity stream directly for Journal, or do we write our own Journal entries in addition?
6. Multi-user — one Paperclip instance shared across all Archie users (one Company per user's workspace), or per-user Paperclip instance? (Start: shared instance, one Company per workspace. Revisit if scale demands.)

## References

- [Paperclip: What is Paperclip](https://docs.paperclip.ing/start/what-is-paperclip)
- [Paperclip: Core Concepts](https://docs.paperclip.ing/start/core-concepts)
- [Paperclip: Architecture](https://docs.paperclip.ing/start/architecture)
- [Paperclip: Adapters Overview](https://docs.paperclip.ing/adapters/overview)
- [Paperclip: Claude Local Adapter](https://docs.paperclip.ing/adapters/claude-local)
- [Paperclip: Codex Local Adapter](https://docs.paperclip.ing/adapters/codex-local)
- [Paperclip: Writing a Skill](https://docs.paperclip.ing/guides/agent-developer/writing-a-skill)
- [Paperclip: Heartbeat Protocol](https://docs.paperclip.ing/guides/agent-developer/heartbeat-protocol)
- [Paperclip: Task Workflow](https://docs.paperclip.ing/guides/agent-developer/task-workflow)
- [Paperclip: OpenAPI Spec](https://docs.paperclip.ing/api-reference/openapi.json)
- [Mem0 OSS Overview](https://docs.mem0.ai/open-source/overview)
- [Mem0 OSS Features](https://docs.mem0.ai/open-source/features/overview)

Companion Archie specs (still valid, re-interpret under this architecture):
- [`ARCHIE_BRAVO.md`](../ARCHIE_BRAVO.md) — platform spec (update: Trigger.dev references → Paperclip)
- [`PROMPT_STORE.md`](../PROMPT_STORE.md) — Roles + Skills + Business Manual Builder
- [`MANUAL_SECTIONS.md`](../MANUAL_SECTIONS.md) — section library used by Manual Builder
- [`COORDINATOR_PROMPT.md`](../COORDINATOR_PROMPT.md) — prompt content for the Role; gets written as a Paperclip skill
- [`CHAT_ARCHIE_PROMPT.md`](../CHAT_ARCHIE_PROMPT.md) — Chat Archie (runs in our API route, not via Paperclip)
- [`WORKER_PROMPT.md`](../WORKER_PROMPT.md) — worker execution pattern (maps to Paperclip Issue-claim flow)
- [`ARCHIE_SKILLS.md`](../ARCHIE_SKILLS.md) — Skill catalog (to be authored as Paperclip `SKILL.md` files)

Deprecated / replaced:
- `TRIGGER_DEV_ARCHITECTURE.md` — Paperclip replaces this
- `ENTRY_PATH_PROMPTS.md` — entry paths killed; replaced by Prompt Store Roles
