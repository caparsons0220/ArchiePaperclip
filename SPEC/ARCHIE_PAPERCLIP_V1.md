# Archie Paperclip V1

_Created: 2026-04-22_  
_Status: Canonical implementation direction for Archie Bravo on top of Paperclip_

This document is the active source of truth for **Archie Bravo v1** in this repo.

Use this document for build decisions about:

- product shell
- repo structure
- Paperclip reuse
- Archie/Paperclip mapping
- v1 user flow
- what gets rebuilt vs reused

Keep these as companion documents:

- [`ARCHIE_BRAVO.md`](./ARCHIE_BRAVO.md) = broader product vision
- [`paperclip-archie-build-plan.md`](./paperclip-archie-build-plan.md) = earlier Paperclip-on-Hostinger implementation plan

If those docs conflict with this one for v1 implementation, **this document wins**.

---

## 1. Core Decision

Archie Bravo v1 will **keep Paperclip as the engine** and **replace Paperclip's product shell**.

That means:

- Paperclip stays responsible for the 24/7 worker engine
- Paperclip stays responsible for heartbeats, issues, routines, activity, approvals, workspaces, and agent execution
- Archie Bravo is built by **reshaping the existing app UI in place**
- the current dashboard-first Paperclip surfaces are demoted into **admin/settings/secondary views**

We are **not** rewriting the runtime.

We are **not** building a second orchestrator.

We are **moving orchestration UX out of the dashboard and into the AI product experience**.

We are **not** making a separate frontend app the default path for v1.

---

## 2. Product Direction

Archie Bravo is not supposed to feel like a control-plane dashboard.

It should feel like:

- a living VP on the home screen
- a lovable-style chat-first product
- a workspace experience with **left chat** and **right preview**
- an always-on operator that plans through Agenda and reports through Journal

The product model is:

- **Home** = the user talks to Archie
- **Archie** = the product-facing orchestrator
- **Paperclip** = the backend engine Archie drives
- **Agenda** = the visible plan/work queue
- **Journal** = the visible activity stream
- **Admin** = where the old dashboard/control-plane surfaces get pushed

The user should not land in raw dashboard furniture first.

---

## 3. Repo Direction

V1 stays in this repo.

We are not splitting to a new repo first.

The default v1 direction is:

- keep using `ui/` as the main frontend codebase
- reshape `ui/` into the Archie Bravo product shell
- keep `server/` as the backend/runtime/API
- demote old dashboard-heavy pages into admin/settings/secondary views inside the same app

### Working repo shape

```txt
server/          <- Paperclip backend/API/runtime control plane
ui/              <- Archie Bravo v1 product shell + buried native/admin surfaces
packages/
  shared/
  db/
  adapters/
  plugins/
```

### Optional later split

If the frontend eventually gets too tangled, we can split later.

That is not the default move for v1.

### Exact codebase rule for v1

All primary v1 product work happens in:

- `ui/src/App.tsx`
- `ui/src/components/Sidebar.tsx`
- `ui/src/pages/*`
- `ui/src/components/*`
- `ui/src/api/*`

The backend stays in:

- `server/src/routes/*`
- `server/src/services/*`

But the initial Archie Bravo transformation is primarily a **`ui/` job**.

---

## 4. What Paperclip Is Good For

Paperclip is valuable because it already gives Archie the hard backend pieces:

- companies/workspace containers
- agents
- heartbeats / scheduled wakes
- issues / task queue
- routines / recurring automation
- approvals
- activity log
- run transcripts
- project workspaces and execution workspaces
- runtime services and preview URLs
- skill system and skill file injection
- adapter execution for Codex / Claude / Gemini / OpenClaw-style tooling

So the backend value is real.

Paperclip is **not** the Archie product by itself.

It is the engine and control plane we are standing on.

---

## 5. Canonical Mapping (Paperclip -> Archie)

These are the v1 mappings we should build around.

| Paperclip | Archie Bravo v1 | Notes |
|---|---|---|
| `Company` | `Workspace` | Main customer-facing container. User sees "workspace," not "company." |
| `Agent` | `Coordinator` or `Worker` | `CEO` is reinterpreted as Archie's coordinator role. Other agents become role-based workers/specialists. |
| `Issue` | `Agenda item` | The visible work queue for what Archie is planning and what workers are doing. |
| `Routine` | `Recurring run / cron behavior` | Powers recurring automations and scheduled work. |
| `Activity` + run logs + comments | `Journal` | Main feed of what Archie did, saw, decided, and ran. |
| workspace runtime services | `Preview source` | Existing runtime URL becomes the embedded preview on the right side. |
| `Skill` / `SKILL.md` | `Role` and `Skill` prompt assets | This is where Archie roles/skills should live in v1. |
| current dashboard/native-heavy `ui/` pages | `Admin / native view` | Still useful, just not front-and-center. |

### Goals in v1

For v1, we will pragmatically reuse **Goals** as the first Business Manual / business-plan path.

That means:

- Archie brainstorms with the user
- Archie gathers the business sections the user wants
- Archie generates the business document
- the user reviews it
- Archie saves that structure into Goals as the first durable strategic/manual layer

This is a practical v1 reuse decision, not a claim that Goals are the perfect long-term manual model.

In v1:

- root/company goal = top-level business manual / operating doc anchor
- child goals = major manual sections, plans, or strategic tracks
- issues = executable agenda derived from that plan

This lets us move fast without inventing a brand-new document backend first.

---

## 6. Product Shell V1

This section is the real implementation target.

### 6.1 Global left nav

The Archie Bravo shell should move to this model:

```txt
Home
Workspaces
Agent
Agenda
Journal
Memory
Integrations
Settings
Admin   <- hidden or secondary
```

Notes:

- `Home` is the main entry point
- `Agent` is the user-facing home for Roles, Skills, and manual setup flows
- `Agenda` and `Journal` are first-class
- `Admin` exists, but should be buried
- the old dashboard/navigation surfaces move behind this, not stay front-and-center

### 6.1.1 Current nav to new nav mapping

This is the exact v1 remap of what exists today.

| Current nav/page | Archie v1 surface | Action |
|---|---|---|
| `Dashboard` | `Home` | Replace as the default landing screen. |
| `Issues` | `Agenda` | Rebrand and keep as a first-class surface. |
| `Goals` | `Manual` / plan builder path | Rebrand and reuse. |
| `Activity` | `Journal` | Rebrand and keep as a first-class surface. |
| `Approvals` | `Questions` | Rebrand and surface inside workspace + global queue. |
| `Skills` | `Agent` | Reuse as the seed Prompt Store / Roles / Skills management surface. |
| `Workspaces` | `Workspaces` | Keep, but make it more user-facing. |
| `Projects`, `Execution Workspaces`, raw runtime config | `Admin` / `Cloud` / `Sandbox` backing | Keep, but bury from the main path. |
| `Costs`, `Org`, company settings | `Admin` or `Settings` | Keep, but secondary. |

### 6.2 Home screen

Home is Archie's VP/orchestrator chat.

It should:

- let the user brainstorm
- understand what the user wants to build/run
- help define the business/manual
- know the available tools
- know what the Paperclip engine can do
- know how to set up a workspace correctly
- create plans and route work into the engine

The home screen is **not** the engine itself.

It is the **control surface for the engine**.

### 6.2.1 Exact current route change

Today, the company root redirects to:

- `/:companyPrefix/dashboard`

For Archie v1, the default company route should become:

- `/:companyPrefix/home`

And `dashboard` should stop being the default landing experience.

### 6.2.2 Exact v1 home behavior

The new Home screen should do these things in order:

1. User talks to Archie in a large composer/chat surface.
2. Archie helps the user brainstorm what they want to build/run.
3. Archie gathers the business/manual sections the user wants.
4. Archie drafts the initial business plan/manual.
5. User reviews and approves it.
6. Archie saves that plan into the Paperclip structures we are reusing.
7. Archie suggests or creates the coordinator + workers.
8. Archie creates the first Agenda items.
9. Archie routes the user into the workspace shell.

This is the entry flow.

### 6.3 Workspace shell

The default workspace experience should be:

- **left pane** = Archie chat / live coordinator surface
- **right pane** = embedded preview
- secondary tabs around the preview for:
  - Manual
  - Agenda
  - Journal
  - Questions
  - Cloud/Admin/Settings

This is preview-first, not editor-first.

We do **not** need a Monaco/IDE requirement for v1.

### 6.3.1 What existing screen we reuse first

The first reusable conversation surface is:

- `ui/src/pages/IssueDetail.tsx`

That page already has:

- chat
- activity
- related work
- run-aware context

So the v1 move is not "invent chat from nothing."

The v1 move is:

- make the issue/run/chat experience the main left-pane shell pattern
- stop burying it as a detail page under dashboard-first navigation

### 6.3.2 What existing preview/runtime surfaces we reuse first

The first reusable preview/runtime surfaces are:

- `ui/src/pages/ProjectWorkspaceDetail.tsx`
- `ui/src/pages/ExecutionWorkspaceDetail.tsx`
- `ui/src/components/WorkspaceRuntimeControls.tsx`

These already give us:

- runtime service URLs
- runtime command controls
- workspace runtime state

So v1 preview work is:

- embed the existing preview URL
- add a first-class preview pane
- keep open-in-new-tab and runtime controls as secondary actions

### 6.3.3 Exact workspace shell target

The v1 workspace shell should be:

- left: Archie conversation
- right: Preview
- secondary right-side tabs:
  - Manual
  - Agenda
  - Journal
  - Questions
  - Cloud

This should be implemented as a new workspace shell inside `ui/`, not as another app.

### 6.4 Admin view

The current Paperclip-heavy dashboard surfaces move here inside the same app:

- raw dashboard pages
- low-level agent configuration
- deep runtime control-plane controls
- plugin/system/admin views
- advanced workspace and project internals

These remain useful, but they stop being the main product.

This is a demotion, not a deletion.

### 6.4.1 Exact current routes that become admin/secondary

These should stop being main-nav-first screens:

- `/dashboard`
- `/projects`
- `/projects/:projectId`
- `/projects/:projectId/workspaces`
- `/projects/:projectId/workspaces/:workspaceId`
- `/execution-workspaces/:workspaceId`
- `/company/settings`
- `/org`
- `/costs`
- `/instance/settings/*`

They stay alive, but they are no longer the face of the product.

---

## 7. What We Reuse Directly

These existing Paperclip primitives should be reused instead of rewritten.

### 7.1 Roles and skills

Paperclip already has a real skill system.

That means Archie Roles and Skills should be built as:

- `SKILL.md`-style prompt assets
- company-level skills
- agent-assigned skills
- injected adapter runtime skills where needed

This is the right v1 storage and execution path for:

- coordinator roles
- specialist roles
- expert lenses
- prompt-store style assets
- the "soul" / role identity you called out

### 7.2 Goals

Goals are reusable as the first manual/business-plan layer.

That means the current Goals surface can become:

- manual sections
- template-based strategy scaffolding
- business setup review/edit path

This can be rebranded rather than thrown away.

The important v1 flow is:

- Archie brainstorms the business with the user
- Archie gathers the sections/templates the user wants
- Archie drafts the business operating document
- the user reviews it
- Archie calls the goal/manual tools to save the approved structure
- Archie then suggests or creates the coordinator/workers and agenda items from that plan

### 7.2.1 Why Goals are acceptable for v1

The current Goal model already gives us:

- title
- description
- parent-child hierarchy
- owner agent
- status

That is enough for a first manual/business-plan tree.

Relevant current files:

- `ui/src/pages/Goals.tsx`
- `ui/src/pages/GoalDetail.tsx`
- `ui/src/api/goals.ts`
- `server/src/routes/goals.ts`

So the v1 move is:

- relabel Goals in Archie-facing UI
- use the root goal as the top business manual anchor
- use child goals as sections/tracks/subplans
- let Archie write/update them through tools

### 7.3 Issues

Issues already fit Agenda well.

We should reuse them as:

- open work
- blocked work
- in-progress work
- completed work
- decomposed subtasks

This is the main queue the coordinator writes into and workers execute from.

Relevant current files:

- `ui/src/pages/Issues.tsx`
- `ui/src/pages/IssueDetail.tsx`
- `ui/src/api/issues.ts`
- `server/src/routes/issues.ts`

### 7.4 Activity

Activity already fits Journal well.

We should reuse it as:

- run feed
- decisions and observations
- pulse summaries
- execution history
- proof of work

Relevant current files:

- `ui/src/pages/Activity.tsx`
- `ui/src/api/activity.ts`
- `server/src/routes/activity.ts`

### 7.5 Runtime preview plumbing

Paperclip already has runtime-service URLs and workspace runtime controls.

That means we do **not** need to invent preview infrastructure first.

We need to:

- embed the preview URL
- make it first-class in the Archie shell
- stop treating it like a tucked-away link

Relevant current files:

- `ui/src/pages/ProjectWorkspaceDetail.tsx`
- `ui/src/pages/ExecutionWorkspaceDetail.tsx`
- `ui/src/components/WorkspaceRuntimeControls.tsx`
- `ui/src/api/projects.ts`
- `ui/src/api/execution-workspaces.ts`
- `server/src/routes/projects.ts`
- `server/src/routes/execution-workspaces.ts` (route handlers surfaced through route index)

---

## 8. The Home AI Must Know The System

This is a hard requirement for v1.

The Archie home/orchestrator chat cannot act dumb about the product.

It needs:

- tool descriptions
- system knowledge of the Archie/Paperclip architecture
- awareness of available roles/skills
- awareness of how workspaces, agenda, journal, goals/manuals, and heartbeats work
- awareness of what preview/runtime capabilities exist
- awareness of the user's own workspace state
- documentation about how the engine works and what each tool is for

If a user says:

- "help me set up my business"
- "build the business plan"
- "create the agents"
- "set the recurring work"
- "show me what Archie is doing"

the AI should know which tools to use and why.

### Scope rule

The AI should know **the user's world**, not the whole platform's private world.

It should be scoped to:

- the signed-in user
- that user's workspaces
- that user's plans, memory, journal, agenda, and configuration

It should not behave like:

- "let me search Archie Bravo's whole database for your thread"

It should behave like:

- "I know your workspace, your plan, your roles, your recent activity, and your pending decisions"

The AI has to know:

- what the repo/app can do
- how Paperclip works
- what tools exist
- which tool should be used for which user request
- how to guide the user through setup and usage without guessing

### 8.1 Required AI knowledge packs for v1

The home AI needs at least these internal knowledge sources:

1. Archie/Paperclip product map
2. Tool catalog with plain-English descriptions
3. Workspace lifecycle explanation
4. Goals/manual flow explanation
5. Agenda/issues flow explanation
6. Journal/activity explanation
7. Roles/skills explanation
8. Preview/runtime explanation

If this knowledge is missing, the Home AI will feel fake and lost.

---

## 9. Home AI Tool Layer

The Archie home/orchestrator chat should call tools that drive the Paperclip engine.

Initial tool groups:

### Workspace tools

- list workspaces
- create workspace
- open workspace
- get workspace status

### Manual / plan tools

- list goals/manual sections
- create goal/manual section
- update goal/manual section
- generate suggested sections
- review draft manual before save

### Agenda tools

- list agenda items
- create issue
- update issue
- decompose issue into subtasks

### Agent tools

- list agents
- create coordinator/worker
- assign role/skill
- pause/resume agent

### Run tools

- run heartbeat
- list recent runs
- get run status

### Journal tools

- list recent activity
- summarize recent activity

### Preview tools

- get active preview URL
- refresh/restart preview service

### Approval tools

- list approvals/questions
- surface gated decisions to the user

These tools are how Archie becomes the product-facing orchestrator without replacing the Paperclip engine.

### 9.1 First backend APIs the Home AI should drive

These existing API groups should be the first tool backends:

- `companies`
- `agents`
- `issues`
- `goals`
- `activity`
- `approvals`
- `heartbeats`
- `projects`
- `execution-workspaces`
- `company-skills`

This is enough to deliver the first believable Archie orchestrator.

---

## 10. Canonical User Flow

This is the v1 flow we should build toward.

### Phase A: Home / brainstorm

The user lands on Home and talks to Archie.

Archie helps them:

- clarify what they are building or running
- shape the business/manual
- pick useful sections/templates
- understand what Archie can handle

### Phase B: Manual / business plan generation

Archie generates the initial business plan/manual structure.

The user reviews it before it becomes durable.

### Phase C: Save to Paperclip structures

Archie then:

- writes the approved manual/plan into Goals
- suggests or creates the coordinator/worker agents
- installs the right roles/skills
- creates starting agenda items

### Phase D: Workspace handoff

The user enters the workspace shell:

- left chat
- right preview
- agenda / journal / manual around it

### Phase E: 24/7 loop

Paperclip continues doing what it already does:

- heartbeats
- runs
- task claiming
- recurring work
- approvals
- activity logging

Archie stays the user-facing shell and coordinator experience.

---

## 11. Reuse, Not Rewrite

This is the biggest implementation rule.

### We are adding:

- a new Archie shell inside the existing `ui/`
- a VP-style home/orchestrator experience
- embedded preview
- Archie naming and navigation
- tool-driven AI control surface
- user-friendly manual/agenda/journal flows

### We are not rewriting:

- the worker loop
- the heartbeat engine
- the issue system
- the runtime/workspace model
- the activity log
- the approval system
- the agent runner

### We are demoting:

- the dashboard-first IA
- the science-dashboard feel
- the old Paperclip UI as the default product
- raw control-plane pages into admin/settings/secondary surfaces

### 11.1 What we are explicitly NOT doing in v1

We are not:

- building a separate frontend as the default path
- rebuilding auth
- rebuilding the scheduler
- rebuilding chat infrastructure from zero
- rebuilding the issue system
- rebuilding the goal system
- rebuilding preview/runtime plumbing

We are reshaping and reordering.

---

## 12. V1 Implementation Phases

### Phase 1: Archie identity + shell

- rebrand user-facing Paperclip language
- reshape `ui/` into the Archie shell
- establish global Archie nav
- make old dashboard secondary

#### Exact files to touch first

- `ui/src/App.tsx`
- `ui/src/components/Sidebar.tsx`
- `ui/src/lib/branding.ts`
- auth/user-facing branding files under `ui/`

#### Exact deliverables

- default route no longer lands on Dashboard first
- sidebar no longer says Dashboard/Issues/Goals/Activity in raw Paperclip language
- Archie naming appears in the main shell
- old admin-heavy routes remain reachable

### Phase 2: New Home screen over Dashboard

- create Archie Home as the new default landing page
- replace dashboard-first cards/charts with VP/orchestrator chat and starter actions
- keep dashboard metrics accessible as a secondary/admin view, not the default

#### Reuse target

- `ui/src/pages/Dashboard.tsx` is the page to replace or heavily repurpose first

#### Exact deliverables

- large Archie composer
- starter actions / quick templates
- recent workspace access
- manual/business-plan kickoff flow
- AI tool-calling entrypoint to the existing backend

### Phase 2: Home VP/orchestrator

- build the Archie home chat
- add the first tool layer
- teach the AI the system and product capabilities
- support brainstorm -> manual generation -> workspace creation

### Phase 3: Workspace shell

- left chat
- right embedded preview
- top/right tabs for Manual, Agenda, Journal, Questions, Cloud

#### Reuse targets

- chat base: `ui/src/pages/IssueDetail.tsx`
- manual base: `ui/src/pages/GoalDetail.tsx`
- journal base: `ui/src/pages/Activity.tsx`
- preview/runtime base:
  - `ui/src/pages/ProjectWorkspaceDetail.tsx`
  - `ui/src/pages/ExecutionWorkspaceDetail.tsx`

#### Exact deliverables

- one shell page that combines these concepts
- embedded preview iframe or equivalent surface
- secondary action to open preview in a new tab
- visible run state
- visible questions/approvals state

### Phase 4: Reuse existing backend surfaces

- rebrand Goals into the manual/business-plan path
- rebrand Issues into Agenda
- rebrand Activity into Journal
- reuse company skills for the Prompt Store / roles / skills

#### Exact deliverables

- Goals UI reads like Manual / Plan, not Goal management
- Issues UI reads like Agenda
- Activity reads like Journal
- Skills reads like Agent / Roles / Skills management

### Phase 5: Admin demotion

- move raw dashboard/control-plane screens behind `/admin` or equivalent
- keep them accessible, not primary

#### Exact deliverables

- admin entry point exists
- project/runtime/org/costs/instance pages are reachable there
- normal users are not dropped into those views first

### Phase 6: Backend ownership hardening

- continue toward Supabase Postgres + Better Auth
- improve operator visibility and control
- do not block the shell build on a full auth rewrite

---

## 13. Concrete First Sprint

This is the actual first build order.

1. Change the default route away from Dashboard.
2. Rewrite the sidebar labels and hierarchy.
3. Build/repurpose the new Home screen.
4. Rebrand Goals -> Manual.
5. Rebrand Issues -> Agenda.
6. Rebrand Activity -> Journal.
7. Build the first combined workspace shell with embedded preview.
8. Push old dashboard/runtime/admin pages behind secondary access.

---

## 14. Non-Goals For V1

Do not bloat v1 into these:

- rewriting the Paperclip engine
- replacing the issue/heartbeat model
- introducing a second orchestration platform
- adding another OSS control plane as a co-equal backend
- making IDE/code-editor UX a hard requirement
- splitting the frontend into a separate repo before the product shape is proven
- doing a full Supabase Auth rewrite at the same time

---

## 15. Source Of Truth Summary

For Archie Bravo v1:

- **Paperclip is the engine**
- **Archie is the product**
- **Home is the VP/orchestrator**
- **Agenda is the work queue**
- **Journal is the activity stream**
- **Goals are reused as the first manual/business-plan layer**
- **Roles and Skills live in Paperclip's skill system**
- **Preview becomes first-class**
- **The old dashboard becomes admin**
- **The real build happens by reshaping `ui/` in place**
- **This is a UI/flow transformation, not a backend rewrite**

That is the v1 direction.
