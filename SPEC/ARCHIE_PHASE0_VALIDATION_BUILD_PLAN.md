# Archie Bravo Phase 0 Validation Build Plan

_Created: 2026-04-20_
_Purpose: define the smallest build plan that proves Archie can keep coding after the app is closed._

## 1. Validation Target

The only thing this phase is trying to prove is:

> I can talk with Archie, agree on a build plan, approve it, close the app, and Archie keeps coding against that plan overnight. When I come back, there is real progress.

If that does not work, the rest of the Archie Bravo product plan is premature.

This is a **Phase 0 validation plan**, not the full product migration.

## 2. Bottom Line

The current repo already proves:

- one persistent session per North Star
- durable manual storage
- heartbeat projection
- memory projection and generic retrieval
- cron-backed waking
- model selection persistence
- visible activity feed

The current repo does **not** yet prove:

- remote coding workspace persistence
- durable coding task execution
- preview/deploy feedback from code work
- explicit approval handoff from "we agreed on a plan" to "Archie is now executing overnight"

So Phase 0 should add only:

1. a **Build-first manual generation and approval flow**
2. a **persistent E2B workspace per North Star**
3. a **tiny durable code-task queue**
4. a **worker execution path that resumes the workspace and performs code work**
5. a **small progress surface in the existing project view**

Everything else is deferred.

## 3. Non-Drift Rules

These rules stay fixed for Phase 0:

- Do not rewrite the OpenClaw-style runtime.
- `sessionKey` remains the real thread identity.
- A North Star remains thin metadata around the existing session-backed runtime.
- `north_stars.business_manual_md` remains the canonical editable document.
- `heartbeat_docs` remains derived and compact.
- `memory_search` remains generic.
- Keep one worker process, one wake path, and the current cron model.
- Do not block this phase on the section registry, section-library UI, or template loadouts.
- Do not build multi-bundle orchestration for this phase.
- Do not build a full Canvas IDE for this phase.

## 3A. Source Of Truth Docs For Phase 0

Every fresh thread working on this Phase 0 plan should read these first:

- `spec/ARCHIE_PHASE0_VALIDATION_BUILD_PLAN.md`
- `spec/ARCHIE_BUILD_PLAN.md`
- `spec/ARCHIE_BRAVO.md`
- `spec/ARCHIE_WORKSPACE_WEBBUILDER.md`

Read these as well whenever the work touches manual generation, prompt behavior, or wake behavior:

- `spec/ENTRY_PATH_PROMPTS.md`
- `spec/COORDINATOR_PROMPT.md`
- `spec/CHAT_ARCHIE_PROMPT.md`
- `spec/WORKER_PROMPT.md`

Reference-only for Phase 0 unless the task explicitly needs them:

- `spec/MANUAL_SECTIONS.md`
- `spec/ARCHIE_MVP_TEMPLATES.md`

Important:

- For Phase 0, `ARCHIE_MVP_TEMPLATES.md` and `MANUAL_SECTIONS.md` are context docs, not implementation blockers.
- The primary authority is this doc plus the existing runtime constraints in `ARCHIE_BUILD_PLAN.md`.

## 3B. Prompt Artifacts Active In Phase 0

Phase 0 only needs a small prompt inventory.

### Base prompts to use

- `spec/COORDINATOR_PROMPT.md`
- `spec/CHAT_ARCHIE_PROMPT.md`
- `spec/WORKER_PROMPT.md`

### Entry-path prompt artifacts to use

From `spec/ENTRY_PATH_PROMPTS.md`, Phase 0 uses only the **Build** path artifacts:

- **Build Manual-Generation Prompt**
- **Build Coordinator Addendum**

### Prompting rule for Phase 0

- chat keeps using the base chat prompt
- worker keeps using the base worker prompt
- coordinator uses the base coordinator prompt plus the **Build** addendum
- explicit build-manual generation uses the **Build Manual-Generation Prompt**

Do not block Phase 0 on wiring every other path.

The `run`, `hire`, `clone`, and `compete` prompt artifacts are out of scope for this validation pass unless a later thread is explicitly extending the Phase 0 work.

## 3C. Fresh Thread Execution Packets

Use the packets below to start clean new threads without having to restate the context from scratch.

### Phase 0A thread packet - Build Manual Path

Read first:

- `spec/ARCHIE_PHASE0_VALIDATION_BUILD_PLAN.md`
- `spec/ARCHIE_BUILD_PLAN.md`
- `spec/ARCHIE_BRAVO.md`
- `spec/ENTRY_PATH_PROMPTS.md` - Build section only
- `spec/COORDINATOR_PROMPT.md`
- `spec/CHAT_ARCHIE_PROMPT.md`
- `spec/WORKER_PROMPT.md`

Inspect these code paths first:

- `lib/northStars.ts`
- `lib/northStarRuntime.ts`
- `app/api/chat/route.ts`
- `app/api/north-stars/*`
- `agent-worker/src/north-stars/manual.ts`
- `agent-worker/src/north-stars/store.ts`
- `agent-worker/src/heartbeat/runner.ts`
- `agent-worker/src/agent/prompt-builders.ts`

Deliver only:

- default validation flow to `entry_path = build`
- explicit build manual generation action
- persistent canonical manual in `north_stars.business_manual_md`
- projection into heartbeat + memory after generation
- reviewable manual state before Start

Do not implement in this thread:

- E2B workspace
- code-task queue
- full section registry flow
- clone / compete

Definition of done:

- user can create a North Star
- generate a build manual
- refresh the page
- still see the same canonical manual state
- Start is available once the manual is ready enough

### Phase 0B thread packet - Persistent Workspace

Read first:

- `spec/ARCHIE_PHASE0_VALIDATION_BUILD_PLAN.md`
- `spec/ARCHIE_WORKSPACE_WEBBUILDER.md`
- `spec/ARCHIE_BUILD_PLAN.md`
- `spec/WORKER_PROMPT.md`

Inspect these code paths first:

- `agent-worker/package.json`
- `agent-worker/src/agent/providers/*`
- `agent-worker/src/agent/tool-ops.ts`
- `agent-worker/src/agent/runner.ts`
- `agent-worker/src/heartbeat/*`
- `agent-worker/src/cron/*`

Deliver only:

- `north_star_workspaces`
- E2B workspace service
- workspace tools for file ops, exec, git, and preview lookup

Do not implement in this thread:

- full Canvas
- full deploy subsystem
- multi-bundle logic
- broad provisioning flows

Definition of done:

- a North Star can create or resume the same remote workspace across multiple wakes

### Phase 0C thread packet - Durable Code Task Queue

Read first:

- `spec/ARCHIE_PHASE0_VALIDATION_BUILD_PLAN.md`
- `spec/ARCHIE_BUILD_PLAN.md`
- `spec/COORDINATOR_PROMPT.md`
- `spec/WORKER_PROMPT.md`

Inspect these code paths first:

- `agent-worker/src/heartbeat/wake.ts`
- `agent-worker/src/heartbeat/runner.ts`
- `agent-worker/src/cron/service.ts`
- `agent-worker/src/cron/store.ts`
- `agent-worker/src/agent/runner.ts`
- `agent-worker/src/agent/prompt-builders.ts`

Deliver only:

- `north_star_code_tasks`
- enqueue / claim / complete / block helpers
- worker execution path that consumes one code task
- coordinator path that creates code tasks when needed

Do not implement in this thread:

- full agenda system
- multi-worker orchestration
- generalized task framework for every future Archie feature

Definition of done:

- code tasks persist across refreshes and cron wakes
- one queued task can be claimed, executed, and completed or blocked durably

### Phase 0D thread packet - Overnight Progress Surface

Read first:

- `spec/ARCHIE_PHASE0_VALIDATION_BUILD_PLAN.md`
- `spec/ARCHIE_BUILD_PLAN.md`
- `spec/ARCHIE_WORKSPACE_WEBBUILDER.md`

Inspect these code paths first:

- `components/north-stars/ProjectView.tsx`
- `components/north-stars/OpenQuestionsPanel.tsx`
- `components/shell/ActivityFeed.tsx`
- `app/api/north-stars/[id]/route.ts`
- any new workspace/task helpers added in prior phases

Deliver only:

- workspace status card
- last code task
- last result summary
- preview URL or build state

Do not implement in this thread:

- full document editor
- full Canvas
- Team View
- broader dashboard redesign

Definition of done:

- user can return the next day and tell whether Archie made real coding progress without reading raw logs

## 3D. Generic New-Thread Kickoff Template

Use this prompt shape when starting a fresh implementation thread:

```text
You are implementing Phase 0X from `spec/ARCHIE_PHASE0_VALIDATION_BUILD_PLAN.md`.

Read these first:
- [list the packet docs]

Inspect these code paths first:
- [list the packet code paths]

Non-drift rules:
- Preserve the current OpenClaw-style runtime
- `sessionKey` remains the true thread identity
- `north_stars.business_manual_md` remains canonical
- `heartbeat_docs` stays derived and compact
- `memory_search` stays generic
- No large new subsystems beyond the phase scope

Implement only the deliverables for this phase.
Do not implement the deferred items.
After changes, verify the phase definition of done.
```

## 4. Existing Repo Pieces This Plan Relies On

These are already real and should be preserved:

- `north_stars.primary_session_key` gives each North Star a durable thread.
- `agent_sessions` persists the conversation history.
- `heartbeat_docs` stores the always-loaded operating excerpt.
- `memory_items` plus `memory_search` store durable searchable memory.
- `north_star_open_questions` already supports follow-up questions without blocking launch.
- `cron_jobs` already drives scheduled wakes and survives app closure.
- `agent_runs` already gives us visible activity and outcome logs.
- prompt builders for coordinator/chat/worker already exist.

This means Phase 0 is not an engine rewrite. It is an execution-surface and workflow addition.

## 5. What Is In Scope

### In Scope

- **Build path only** for the first validation pass
- minimal use of `entry_path` with `build` persisted on the North Star
- one explicit "generate build manual" action
- persistent canonical build manual in `north_stars.business_manual_md`
- projection from canonical manual into heartbeat and searchable memory
- one explicit approval/start handoff
- one persistent E2B workspace per North Star
- one minimal durable code-task queue
- worker tools for workspace file ops, command exec, git, and preview lookup
- background code execution during cron-driven wakes
- a small UI surface showing build progress

### Out Of Scope

- section registry driven generation
- section add / upgrade flows
- template loadout system
- clone / compete ingestion and validation
- multi-bundle coordinator/worker orchestration
- full Canvas IDE
- Archie Cloud / BYO infra provisioning
- full deploy dashboard
- portfolio / Team View work

## 6. Product Shape For Phase 0

The product flow for this validation should be:

1. User creates a North Star from Home.
2. For Phase 0, the North Star is treated as `entry_path = build`.
3. User chats with Archie about the app or business to build.
4. Archie generates a persistent **build operating document**.
5. User reviews that document in the project and clicks **Start 24/7**.
6. Start means: "this document is approved enough for autonomous build execution."
7. The cron loop wakes Archie in the background.
8. Archie resumes the remote workspace, executes queued code tasks, and logs progress.
9. User returns later and sees:
   - last task
   - last result
   - changed code / commit metadata
   - build/test output
   - preview URL or failure state

If the UI picker for entry path is not ready yet, default new validation North Stars to `build` internally and defer the UI picker.

## 7. Manual Strategy For Phase 0

Phase 0 does **not** need the full section-registry system.

Instead, Archie should generate one end-to-end operating document that is specific to build work and stored in the existing canonical manual field.

### Phase 0 Manual Rule

Use the existing canonical manual pipeline, but make the generated document include enough coding-specific operating detail for overnight execution.

Minimum required build-oriented content:

- what is being built
- target user / customer
- core app scope
- current build goal
- definition of done
- quality bar
- repo / workspace intent
- stack assumptions
- test / build commands
- preview / deploy target
- approval limits and red lines

This can be expressed either:

- by extending the current 16-section manual content with build-specific detail, or
- by generating those details into the existing sections where they fit

Do **not** block Phase 0 on a new manual architecture.

### Approval Rule

Do not build a new approval subsystem for this phase.

For Phase 0, approval is:

- the canonical manual exists
- the user has reviewed it enough
- the user clicks **Start 24/7**

That click is the approval handoff.

## 8. Data Model Changes

### 8.1 Reuse Existing North Star Fields

Use the fields already added to `north_stars`:

- `entry_path`
- `setup_phase`
- `selected_section_slugs`

Phase 0 behavior:

- default `entry_path = 'build'`
- use `setup_phase` only for a light flow:
  - `explore`
  - `review`
  - `launched`
- `selected_section_slugs` can remain empty for Phase 0

### 8.2 Add `north_star_workspaces`

Add one workspace row per North Star.

Suggested columns:

- `id`
- `north_star_id`
- `provider` (`e2b`)
- `sandbox_id`
- `status`
- `template_ref`
- `repo_url`
- `git_branch`
- `last_commit_sha`
- `preview_url`
- `last_active_at`
- `metadata_json`
- timestamps

Purpose:

- store the persistent coding workspace identity
- let Archie resume the same workspace overnight
- surface the latest preview and git state back into the product

### 8.3 Add `north_star_code_tasks`

Add a very small durable task queue.

Suggested columns:

- `id`
- `north_star_id`
- `session_key`
- `status` (`queued | running | done | blocked`)
- `tool_scope` (`code`)
- `title`
- `instructions_md`
- `success_criteria_md`
- `result_summary`
- `error_text`
- `attempt_count`
- `claimed_at`
- `completed_at`
- timestamps

Purpose:

- persist execution work between wakes
- keep Archie from replanning the same work every turn
- make overnight coding progress visible and inspectable

### 8.4 Do Not Add Yet

Do not add in Phase 0:

- `north_star_deployments`
- `north_star_bundles`
- section registry persistence tables
- clone / compete asset tables

## 9. Runtime Changes

### 9.1 Explicit Build Manual Generation

Add one explicit server action that generates the canonical build manual draft.

Suggested shape:

- input:
  - seed prompt
  - recent chat context
  - `entry_path = build`
  - any user-provided constraints
- output:
  - full canonical manual markdown
- write target:
  - `north_stars.business_manual_md`
- after write:
  - project into `heartbeat_docs`
  - project into `memory_items`
  - sync open questions where needed

This should use the existing manual persistence and projection pipeline.

Important:

- stop relying on ambient chat artifact emission as the only path
- keep `<business_manual>` artifact support as a compatible path, but the product flow should have an explicit generate action

### 9.2 Build Path Prompting

For Phase 0, wire `entry_path = build` through the prompt builders.

Minimum requirement:

- chat prompt knows setup is build-oriented
- coordinator prompt knows the North Star is a build-path business/app
- worker prompt can receive bounded coding tasks

Do not block Phase 0 on the full prompt inventory.

### 9.3 E2B Workspace Service

Add an E2B-backed workspace service used by the existing Fly worker.

Minimum tool surface:

- `workspace_ensure`
- `workspace_list_files`
- `workspace_search_files`
- `workspace_read_file`
- `workspace_write_file`
- `workspace_exec`
- `workspace_git_status`
- `workspace_git_commit`
- `workspace_get_preview`

Optional for Phase 0 if quick to add:

- `workspace_git_push`
- `workspace_start_dev`

Important:

- E2B is the execution substrate, not the runtime
- the Fly worker remains the control plane
- the same North Star session and cron loop remain in charge

### 9.4 Minimal Code Task Execution Contract

Add a tiny execution contract:

- coordinator can create queued code tasks
- runtime can claim one queued code task
- worker runs against that task only
- worker marks the task `done` or `blocked`

This is enough to prove overnight execution.

Do not add a full agenda system in Phase 0.

### 9.5 Wake Behavior

The background loop for launched build-path North Stars should be:

1. cron wake fires
2. if there is a queued code task:
   - claim it
   - run worker prompt with that task
   - resume E2B workspace
   - execute code work
   - store result
3. if there is no queued code task:
   - run coordinator prompt
   - either enqueue the next code task or return `HEARTBEAT_OK`

This preserves the current one-engine runtime shape while introducing durable execution.

### 9.6 Preview / Feedback Rule

Phase 0 only needs one lightweight preview/result signal:

- latest preview URL if available, or
- latest build/test output summary if preview is not available yet

Do not build a deployment subsystem before validating the loop.

## 10. UI Changes

### 10.1 Home

Minimum change:

- allow creation of a validation North Star as `build`

If time is tight:

- do not add a path picker yet
- default this validation flow to `build`

### 10.2 Project Detail

Keep the current project page shape and add only a small build-status surface.

Add:

- manual generation / regenerate action
- visible approval state through the existing Start button
- workspace status card
- last code task
- last result summary
- latest preview URL or build status

Keep:

- chat
- open questions
- activity feed

Do not build a full document editor or Canvas tab in Phase 0.

## 11. Recommended Build Order

### Phase 0A - Build Manual Path

Goal:

- make the build operating document explicit and persistent

Deliverables:

- default North Star validation flow to `build`
- explicit build manual generation action
- manual persisted to `north_stars.business_manual_md`
- heartbeat + memory projection after generation
- user can review and click Start

Acceptance:

- user can create a North Star, generate a build manual, refresh, and still see the same canonical manual state

### Phase 0B - Persistent Workspace

Goal:

- give Archie a real remote place to code while the app is closed

Deliverables:

- `north_star_workspaces`
- E2B workspace service
- workspace tools for file ops and command execution

Acceptance:

- a North Star can create or resume the same workspace across multiple wakes

### Phase 0C - Durable Code Task Queue

Goal:

- give the worker bounded coding work that survives app closure

Deliverables:

- `north_star_code_tasks`
- enqueue / claim / complete / block helpers
- worker run path that consumes a single code task

Acceptance:

- code tasks survive reloads and overnight cron wakes
- completed tasks show visible outcomes

### Phase 0D - Overnight Progress Surface

Goal:

- make overnight work legible when the user returns

Deliverables:

- project card or panel for:
  - workspace status
  - last task
  - last result
  - preview URL or build state

Acceptance:

- user can tell whether Archie made real coding progress without reading raw logs

## 12. Acceptance Checklist

The Phase 0 validation passes only if all of this is true:

- user creates a new North Star for a build-oriented app idea
- the North Star gets a persistent `sessionKey`
- Archie generates and persists a canonical build manual
- the manual projects into heartbeat and searchable memory
- user clicks **Start 24/7**
- a workspace exists and can be resumed after the app is closed
- at least one durable code task is created and executed in the background
- Archie changes real files in the workspace
- Archie runs at least one build, test, or command relevant to the task
- the project view shows real progress the next day
- Archie can explain progress using persisted task/workspace state, not only narrative memory

Strong validation signal:

- there is a preview URL or verifiable build output
- there is git metadata or commit metadata showing code movement

## 13. Risks And Constraints

### E2B Access

If E2B credentials or environment setup are missing, the architecture can be wired but the validation cannot be fully proven.

### Long-Running Execution

The worker currently runs with `maxConcurrentRuns = 1`.

Implication:

- one long code task can monopolize the worker

Mitigation:

- keep tasks small and bounded
- cap command duration
- return blocked or partial progress instead of letting one run sprawl forever

### Planning vs Execution Thrash

Without durable code tasks, Archie will keep replanning.

Mitigation:

- add the smallest possible durable code-task queue before trying to prove overnight coding

### Context Bloat

The session transcript is durable and grows over time.

Mitigation:

- keep relying on heartbeat + memory projection
- avoid putting long build logs into the chat transcript
- store result summaries and task outputs in structured rows instead of raw transcript dumps

### Preview Reliability

Preview generation may lag behind code changes.

Mitigation:

- treat build/test output as the minimum proof
- preview URL is a strong positive signal, not the only proof signal

## 14. Explicit Deferrals

These should not block Phase 0:

- section registry wiring
- section-library UI
- manual upgrade flow
- template loadouts
- template CMS work
- Team View
- Clone / Compete
- multi-bundle runtime
- Canvas IDE
- Archie Cloud provisioning
- BYO infra connection flows

## 15. Final Recommendation

Approve this as the new immediate build plan:

- **Build path first**
- **manual persistence first**
- **workspace persistence second**
- **durable code-task execution third**
- **progress visibility fourth**

Do not spend the next cycle on section architecture or full setup polish.

If Archie can:

- persist a build operating document
- wake overnight
- resume a remote coding workspace
- perform real code work
- and show visible progress the next day

then the core engine is validated and the rest of the roadmap becomes additive.
