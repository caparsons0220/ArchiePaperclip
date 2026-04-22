# Archie Workspace / Webbuilder

_Created: 2026-04-18_
_Companion to `ARCHIE_BRAVO.md`. Captures the architecture for Canvas, the code workspace, and how E2B plugs into Archie's OpenClaw-style runtime._

## Goal

Build the Lovable/Manus-style builder surface inside Archie Bravo without changing the core Archie mechanics:

- Keep the OpenClaw-style 24/7 runtime
- Keep cron, heartbeat, memory, context discipline, and scoped tool loading
- Keep the coordinator + worker model
- Add a real code workspace Archie can resume while the user is away
- Show the app preview in Canvas and also surface the latest preview on the North Star Overview

## Bottom Line

**E2B is the workspace layer, not the Archie runtime.**

Archie still lives in the always-on worker on Fly. The coordinator still plans. The worker still executes. Memory still lives in Supabase. Cron still wakes Archie on schedule.

E2B is just the place where code work happens.

That means:

- The whole North Star is **not** an E2B session
- The whole dashboard is **not** a code editor
- Only code-related work needs the workspace
- Archie can still code while the user is away by resuming the workspace during a normal cron-driven worker wake

## What Stays The Same

These mechanics stay exactly in the Archie/OpenClaw shape:

- **Heartbeat loop**: one agent turn per wake
- **Cron service**: jobs persisted in Postgres and fired by the worker
- **Memory**: long-term memory in Supabase with retrieval during context assembly
- **Context discipline**: budget-aware assembly + auto-RAG
- **Noop tokens**: silent wakes do not clutter the chat
- **Coordinator + worker split**: coordinator writes plans and agenda, worker executes bound items
- **Scoped tool loading**: workers only get the tools they need for the task

Current repo pieces that already match this:

- `agent-worker/src/cron/`
- `agent-worker/src/heartbeat/`
- `agent-worker/src/memory/`
- `agent-worker/src/context/assemble.ts`
- `agent-worker/src/agent/runner.ts`
- `agent-worker/src/agent/providers/openai.ts`

## What E2B Adds

E2B adds one missing execution surface:

- persistent code workspace per North Star
- file read/write
- command execution
- package install / test / build
- optional live dev preview while Canvas is open
- resumable coding environment for Archie and the user

E2B does **not** replace:

- Fly worker
- Supabase memory
- cron
- coordinator logic
- agenda
- journal
- North Star overview
- integrations model

## The Core Mental Model

There are 5 separate things here:

1. **North Star**
   - the business record in Archie Bravo
   - owns document, agenda, journal, memory, integrations, settings

2. **Agent Sessions**
   - coordinator and worker conversation state
   - examples: `ns:<id>:coord`, `ns:<id>:worker:dev`, `ns:<id>:worker:auto`

3. **Workspace**
   - the codebase for that North Star
   - usually one per North Star environment for MVP
   - backed by E2B

4. **Sandbox Runtime**
   - the live E2B machine when the workspace is awake
   - paused when idle, resumed when needed

5. **Canvas Session**
   - the browser UI attached to the workspace
   - chat + file tree + code + preview

The important distinction:

**One North Star can outlive many browser sessions, but keep the same workspace.**

For MVP, the right default is:

- **one persistent workspace per North Star**
- not one sandbox per browser tab
- not one sandbox per single prompt

## UI Shape

Archie is not an IDE-only product. Canvas is one tab inside a larger North Star operating system.

### Home

Home can be the Lovable-like landing surface:

- chat input
- template marketplace
- quick "Create North Star"
- starter template browsing with live demo previews

### North Star Detail

The North Star opens into a Manus-like dashboard with multiple surfaces:

- **Overview**
  - business status
  - preview card
  - recent Archie activity
  - quick actions
- **Document**
  - business manual / operating doc
- **Canvas**
  - code workspace
  - chat with Archie
  - file tree
  - code editor
  - preview
- **Agenda**
  - scoped tasks
- **Journal**
  - activity and decisions
- **Memory**
  - scoped memory browser
- **Settings / panels**
  - integrations
  - secrets
  - customers / analytics / products / orders / subscriptions
  - any business-specific admin surfaces

### Preview Strategy

Do not make the North Star Overview depend on a live E2B dev server.

Use two preview modes:

- **Canvas preview**
  - live dev preview from E2B when the workspace is awake
  - or latest Vercel preview if you want to keep it simpler
- **Overview preview**
  - latest deployed Vercel preview URL
  - or a screenshot/card + "Open Canvas" / "Open Preview" action

This keeps Overview fast and durable even when the sandbox is asleep.

## Runtime Architecture

### The Worker Stays In Charge

The always-on worker on Fly remains the control plane:

- receives user events
- receives cron wakes
- assembles context
- loads the right tools
- runs the provider turn
- writes journal/activity/session rows

When code work is needed, the worker uses E2B through tools.

### Coordinator Flow

The coordinator does not code. It:

- reads the document, agenda, journal, memory
- decides if code work is needed
- writes an agenda item for the developer worker
- sets timing / cron / next wake
- may request human approval for risky actions

### Worker Flow

The developer worker handles a bound code task:

1. wakes on agenda item
2. loads narrow context for that task
3. gets E2B tools because `tool_scope = code`
4. resumes or creates the North Star workspace
5. edits files, runs commands, tests, build
6. commits/pushes when appropriate
7. triggers or records a Vercel preview
8. writes updates to journal/activity
9. exits

This is still just a normal Archie wake. The only difference is the worker has code tools available.

## User Away / 24-7 Behavior

Yes, Archie can code while the user is away.

That flow looks like this:

1. User is offline
2. Cron fires on the coordinator bundle
3. Coordinator sees a code task is due or needed
4. Coordinator writes or updates an agenda item for the developer worker
5. Developer worker wakes
6. Developer worker resumes the E2B workspace
7. Archie edits code, runs tests, and updates preview/deploy state
8. Archie writes journal/activity notes
9. Workspace pauses again after inactivity

Nothing about this breaks the OpenClaw-style model. E2B is just resumed during the worker's execution window.

## Tool Loading Model

The tool list should stop being one static global bundle.

Instead, load tools by role and task scope.

### Coordinator Tools

- `agenda_read`
- `agenda_write`
- `cron_manage`
- `memory_search`
- `memory_get`
- `save_memory`
- `heartbeat_doc`
- `journal_note`
- integration metadata / status tools

### Developer Worker Tools

- all core task tools needed for bounded execution
- `memory_search`
- `heartbeat_doc`
- `journal_note`
- workspace tools

### Workspace Tools

These are the E2B-backed tools Archie actually needs:

- `workspace_ensure`
  - create or resume the North Star workspace
- `workspace_read_file`
- `workspace_write_file`
- `workspace_list_files`
- `workspace_search_files`
- `workspace_exec`
  - run tests, install deps, build, lint, etc.
- `workspace_start_dev`
  - start dev server when needed
- `workspace_get_preview`
  - return dev preview URL if running
- `workspace_git_status`
- `workspace_git_commit`
- `workspace_git_push`
- `workspace_snapshot_state`
  - optional for v2 if needed

The worker should only receive these when the agenda item's tool scope says it is allowed to touch code.

## Data Model

Minimal tables or records needed beyond the current worker schema:

### `north_stars`

- `id`
- `user_id`
- `name`
- `template_id`
- `status`
- `document_id`

### `north_star_bundles`

- `id`
- `north_star_id`
- `focus`
- `coordinator_session_key`
- `worker_session_key`
- `default_model_coordinator`
- `default_model_worker`
- `default_tool_scope`

### `agenda_items`

- `id`
- `north_star_id`
- `bundle_id`
- `title`
- `plan_json`
- `success_criteria`
- `tool_scope`
- `scheduled_time`
- `status`

### `north_star_workspaces`

- `id`
- `north_star_id`
- `provider` (`e2b`)
- `sandbox_id`
- `template_id`
- `git_repo_url`
- `git_branch`
- `status`
- `dev_preview_url`
- `last_active_at`
- `metadata_json`

### `north_star_deployments`

- `id`
- `north_star_id`
- `provider` (`vercel`)
- `environment`
- `deployment_url`
- `commit_sha`
- `status`
- `created_at`

### `north_star_integrations`

- `id`
- `north_star_id`
- `kind` (`github`, `vercel`, `supabase`, `stripe`, etc.)
- `connection_mode` (`archie-cloud` or `byo`)
- `credential_ref`
- `status`

## Create Flow

When a user creates a North Star:

1. create the `north_stars` record
2. create the default bundle(s)
3. create the document / business manual
4. provision GitHub / Vercel / Supabase metadata as needed
5. create the E2B workspace from a starter shell template
6. store the workspace id in `north_star_workspaces`
7. optionally run initial scaffold and first preview build

The starter shell should be what makes the experience feel instant.

## Canvas Open Flow

When the user opens Canvas:

1. load the North Star
2. load `north_star_workspaces`
3. call `workspace_ensure`
4. show file tree + code + preview
5. attach chat to the developer worker session or a Canvas-scoped conversation view

If the sandbox is paused, E2B resumes it.

## Overview Preview Flow

When the user opens the North Star Overview:

1. load latest deployment from `north_star_deployments`
2. show:
   - latest preview URL
   - last deploy status
   - last Archie code task result
   - action to open Canvas

This keeps the main dashboard useful even if the live workspace is not awake.

## Current Repo Reality

The current codebase already has the foundation:

- cron and heartbeat are in place
- memory and context assembly are in place
- OpenAI and Claude providers already exist

Two important gaps remain:

1. **Per-bundle isolated sessions are not wired yet**
   - current cron path still routes through the main session
   - see `agent-worker/src/index.ts`

2. **Tool loading is still static**
   - current provider setup loads a fixed tool list
   - this needs to become role-aware and scope-aware

Those two changes matter more than the actual E2B SDK wiring.

## MVP Implementation Order

### Phase 1 - Preserve OpenClaw shape

- add per-North-Star / per-bundle session keys
- wire isolated session execution for cron-fired jobs
- keep coordinator and worker as same runtime, different prompt contracts

### Phase 2 - Add workspace service

- add an `E2BWorkspaceService`
- create `north_star_workspaces`
- implement `workspace_ensure`, file ops, exec, preview lookup

### Phase 3 - Add developer tool scope

- load E2B tools only for developer worker tasks
- keep coordinator clean and planning-only

### Phase 4 - Add Canvas UI

- file tree
- code editor
- Archie chat
- preview pane
- resume workspace on open

### Phase 5 - Add Overview preview

- show latest Vercel preview/deploy card on the North Star dashboard
- link out to Canvas or preview URL

## Why E2B Fits This Shape

E2B is a good fit because:

- the workspace can pause and resume
- Archie can resume it during background worker wakes
- the user can open Canvas later and attach to the same workspace
- the code workspace is only one subsystem, not the entire product

This matches the actual Archie shape better than treating the entire North Star like a permanent IDE tab.

## Non-Goals

This doc does **not** mean:

- every bundle gets its own always-running machine
- Archie Overview depends on a live dev server
- Canvas is the whole product
- E2B becomes the memory store
- E2B replaces cron or the heartbeat runner
- the user must sit in the code editor for Archie to keep working

## Recommended Working Sentence

Use this internally:

**Archie Bravo is the operating system. E2B is the workshop.**

That is the cleanest mental model for the build.

## Companion Docs

- [ARCHIE_BRAVO.md](./ARCHIE_BRAVO.md)
- [ARCHIE_SKILLS.md](./ARCHIE_SKILLS.md)
- [ARCHIE_BRAVO_TEMPLATE_EXAMPLES.md](./ARCHIE_BRAVO_TEMPLATE_EXAMPLES.md)
