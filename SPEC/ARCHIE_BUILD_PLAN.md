# Archie Bravo Build Plan

_Last updated: 2026-04-19_
_Purpose: verified handoff doc for continuing the Archie Bravo runtime migration in fresh threads without losing context._

## 1. Executive Summary

This repo already has the right runtime primitives:

- one persistent session per North Star
- canonical Business Manual storage on the North Star row
- derived heartbeat runtime context
- generic searchable memory
- open questions
- project-scoped cron / heartbeat / wake loop
- Fly-hosted 24/7 worker model backed by Supabase

The main mismatch is not infrastructure. It is the shape of the product model:

- current code still thinks in `Tier 1 / Tier 2`
- current code still infers runtime behavior from `Platform / Business / Service / Role`
- current code still assembles one live prompt path
- current code does not yet have entry paths, setup phases, template loadouts, section-library UI, or Clone / Compete validation

Minimal-change migration means:

- keep the existing North Star row, session isolation, memory store, heartbeat store, open-question table, and wake loop
- keep `north_stars.business_manual_md` as the canonical editable document for now
- replace the old manual model with the new `CORE + searchable memory` model
- introduce entry-path-aware prompt composition
- add setup phases, section loadouts, and reusable section-library UI
- let Archie draft with recommended defaults instead of over-blocking setup
- let launch happen with assumptions unless there is a true hard blocker
- let missing sections and missing answers resolve over time through open questions and chat
- defer larger rewrites like full multi-bundle runtime orchestration, Canvas expansion, and template CMS storage unless required later

## 2. Source Of Truth Docs

These are the current source-of-truth specs for this plan:

- `spec/ARCHIE_BRAVO.md`
- `spec/MANUAL_SECTIONS.md`
- `spec/ARCHIE_MVP_TEMPLATES.md`
- `spec/ENTRY_PATH_PROMPTS.md`
- `spec/COORDINATOR_PROMPT.md`
- `spec/CHAT_ARCHIE_PROMPT.md`
- `spec/WORKER_PROMPT.md`

## 3. Verified Current Repo State

### 3.1 Manual storage

Current state:

- The canonical manual lives in `north_stars.business_manual_md`.
- There are not separate storage tables for Business Manual vs Role Brief vs Service Ops Manual.
- The canonical manual is projected into:
  - `heartbeat_docs.content` for always-loaded runtime context
  - `memory_items` rows with `kind="manual_section"` for searchable operating knowledge

Minimal-change conclusion:

- Keep `north_stars.business_manual_md` as the canonical editable document.
- Treat `memory_items` as the searchable North Star memory bank.
- Treat `heartbeat_docs` as the derived runtime artifact.

### 3.2 Current runtime loading model

Current state:

- The code explicitly uses `Tier 1 / Tier 2`.
- `Tier 1` is assembled in `agent-worker/src/north-stars/manual.ts`, projected into heartbeat, and injected every wake through the agent runner.
- `Tier 2` is written to memory and only retrieved when Archie calls `memory_search`.
- `agent-worker/src/context/assemble.ts` does not auto-retrieve business knowledge. It only trims old history and reminds Archie to search memory.

Minimal-change conclusion:

- Replace `Tier 1 / Tier 2` language with `CORE / searchable memory`.
- Keep the same mechanics:
  - always-loaded excerpt goes to heartbeat
  - long-tail operating knowledge stays in generic memory
- Do not add a manual-specific retrieval tool.

### 3.3 Current North Star model

Current state:

- A North Star is a top-level project entity.
- A North Star owns:
  - canonical manual on `north_stars`
  - searchable memory in `memory_items`
  - heartbeat runtime state in `heartbeat_docs`
  - chat transcript in `agent_sessions`
  - events / runs / cron rows
  - open questions in `north_star_open_questions`

Minimal-change conclusion:

- Keep the North Star as the top-level entity.
- Reframe the memory model conceptually as one NS memory bank:
  - manual sections
  - skills
  - decisions
  - journal summaries
  - reusable patterns

### 3.4 Current prompt assembly

Current state:

- The spec has three prompt docs, but the live runtime still effectively builds one system prompt in `agent-worker/src/agent/system.ts`.
- User chat and background wakes both pass through the same worker turn path.
- Tools are registered correctly in the provider surfaces.
- Retrieval only happens via tool calls, which is good.

Minimal-change conclusion:

- Introduce a real prompt composition layer:
  - `buildCoordinatorPrompt`
  - `buildChatPrompt`
  - `buildWorkerPrompt`
- Do not rewrite the whole wake loop to get there.
- Use different prompt builders for different wake types inside the current runtime skeleton.

### 3.5 Current UI surfaces

Current state:

- Home create surface exists.
- Projects list exists.
- Project detail exists with chat, activity, Start, and open questions.

Missing today:

- section-library browser
- template detail screen with preselected sections
- setup-phase right pane
- manual review screen
- Upgrade Manual flow
- Team View dashboard
- Clone / Compete upload validation flow

### 3.6 Current per-tier branching

Current state:

- The runtime still infers `Platform / Business / Service / Role` heuristically from the initial prompt.
- Skill seeding and starter manual seeds branch by inferred tier.
- Some UI copy still describes projects using `Tier 1 / Tier 2` language.

Minimal-change conclusion:

- Template tier should remain gallery metadata.
- Runtime behavior should move to:
  - entry path
  - selected section loadout
  - actual manual content
- Remove tier inference from runtime behavior as part of the migration.

### 3.7 Current North Star creation flow

Current state:

1. Home submits a seed prompt.
2. Server creates `north_stars` + `agent_sessions`.
3. Server seeds:
   - skill memory
   - starter manual memory
   - a launch heartbeat
4. UI routes into the new project thread and auto-sends the prompt.
5. Archie asks launch questions in chat.
6. Archie emits a `<business_manual>` artifact.
7. Server applies projection into canonical manual, heartbeat, memory, and open questions.
8. Start upserts the cron row and begins the 24/7 loop.

Minimal-change conclusion:

- Keep the immediate project/session creation model.
- Replace opportunistic manual generation with an explicit Phase 3 manual-generation action.

### 3.8 Current entry-path support

Current state:

- No `entry_path` column
- No Build / Run / Hire / Clone / Compete picker
- No path inference storage
- No path-specific prompts in runtime

Minimal-change conclusion:

- Add `entry_path` to the North Star row and use it to drive:
  - setup flow
  - Manual-generation prompt selection
  - Coordinator addendum selection

### 3.9 Current Team View support

Current state:

- `/projects` is a flat list
- no portfolio cockpit
- no grouped Role bundles
- no filters, search, or bulk actions

Minimal-change conclusion:

- Reuse `/projects` as the Team View route instead of creating a new one.

### 3.10 Current Clone / Compete support

Current state:

- no upload surface
- no URL validation
- no competitor artifact store
- no CLONE / COMPETE choice gate

Minimal-change conclusion:

- This requires new setup infrastructure and should be a dedicated later phase.

## 4. New Design Decisions To Preserve

These are the design commitments this build plan is protecting:

- one persistent session per North Star
- one canonical Business Operating Manual per North Star
- `CORE` sections load into the prompt
- non-CORE sections live in searchable memory
- Manual sections, Skills, Decisions, Journal, and Patterns all live in one generic NS memory system
- templates declare recommended section loadouts
- entry path is how Archie is being brought in
- template tier is what kind of North Star it is
- entry path and template tier compose; they are not the same thing
- Chat Archie and Worker prompts stay stable across entry paths
- only the Coordinator gets path addendums
- Manual generation is path-specific
- section library is a reusable UI surface used before and after launch
- adding a section triggers clarifying questions
- Archie can recommend defaults when the user skips or does not know an answer
- launch is approval-driven, not wizard-gated
- missing manual detail is resolved over time, not all up front
- Projects becomes the multi-NS Team View

## 4.1 OpenClaw Non-Drift Rules

This migration must stay faithful to the working OpenClaw model already reflected in:

- `openclaw-main/archiebravomain`
- `agent-worker/README.md`
- `agent-worker/src/heartbeat/runner.ts`
- `agent-worker/src/cron/store.ts`

The safest rule is:

> If a feature can be expressed as metadata, prompt composition, section projection, or UI flow, do that first. Do not turn it into a new engine concept unless OpenClaw already has an equivalent concept.

Non-drift rules:

- A North Star is thin metadata around an existing session-backed runtime, not a brand-new runtime primitive.
- The Manual section library is static spec data plus projection rules, not a new persistence subsystem.
- Chat / Coordinator / Worker are prompt builders inside one engine, not three separate services.
- Required integrations are UI/setup metadata first. Do not make them core engine logic until there are real validation checks behind them.
- Templates are a static registry module in this pass, not a database-backed template CMS.
- Clone / Compete is the only truly new setup subsystem in this migration.
- `HEARTBEAT.md` stays small and operational, like OpenClaw. Do not turn it into a full manual dump.
- `memory_search` stays generic. Do not introduce manual-specific retrieval tools if generic memory already covers the use case.
- Keep one worker process, one wake path, one heartbeat turn model.

Do not drift into:

- a new manual service
- a new manual-specific tool surface
- a global persisted store of all 287 library sections as first-class runtime state
- loading too much of the manual directly into prompt context
- conflating entry path with tier
- implementing full multi-bundle orchestration before the single-NS setup model is stable
- operationalizing all template loadouts perfectly before the runtime contract is stable
- wiring all 17 prompt artifacts as first-class runtime modes on day one

## 5. Prompt Inventory

### 5.1 Prompt artifacts explicitly defined in the repo today

Base prompts:

1. `COORDINATOR_PROMPT.md`
2. `CHAT_ARCHIE_PROMPT.md`
3. `WORKER_PROMPT.md`

Path-specific Manual-generation prompts:

4. Build Manual-generation Prompt
5. Run Manual-generation Prompt
6. Hire Manual-generation Prompt
7. Clone Manual-generation Prompt
8. Compete Manual-generation Prompt

Path-specific Coordinator addendums:

9. Build Coordinator Addendum
10. Run Coordinator Addendum
11. Hire Coordinator Addendum
12. Clone / Compete Coordinator Addendum

That is **12 explicit prompt artifacts** currently reflected in spec.

### 5.2 Recommended helper prompts to operationalize the full setup model

If you want the runtime to feel complete and not stitched together, add five helper prompt artifacts:

13. Entry-path inference prompt
- Used during Explore / Clarify when the user did not explicitly pick Build / Run / Hire / Clone / Compete.
- Output should be a proposed entry path plus confidence and rationale.

14. Explore research synthesis prompt
- Used to turn Phase 1 research into a compact structured research summary before Phase 3 manual generation.
- Especially important for Build and Clone / Compete.

15. Section-add clarification prompt
- Used when a user adds one or more sections from the library.
- Generates 2-5 clarifying questions for each added section.

16. Open-question regeneration prompt
- Used to convert missing or weak manual sections into post-launch Questions-tab prompts.
- Useful after manual generation and after section upgrades.

17. Manual review / rewrite prompt
- Used in Phase 4 Review when the user asks Archie to tighten, simplify, re-angle, or rewrite the draft before launch.

Recommended total prompt inventory: **17 prompt artifacts**

Important note:

- The helper prompts do not need to be top-level user-visible docs on day one.
- They can start as internal prompt constants while the 12 spec-backed prompt artifacts remain the primary source of truth.

## 6. Core Architecture Shift

### Old model

- Tier 1 / Tier 2
- heuristic tier inference shapes runtime
- one live prompt path
- manual generation emerges from ambient chat

### New model

- `CORE + searchable memory`
- entry path shapes setup and coordinator behavior
- template loadout shapes which sections are selected
- explicit Phase 3 manual generation
- three prompt builders in runtime
- draft-first, approve-first launch flow with Archie defaults when needed

### Product simplification rule

The user should not feel the internal architecture.

The product flow should feel like this:

1. user types an idea or picks a template
2. user optionally chooses an entry path
3. Archie asks clarifying questions
4. every question is skippable
5. when skipped, Archie uses a recommended default and marks it as Archie-proposed
6. once Archie has enough signal, he drafts a manual
7. user sees the manual on the right and can approve, edit, or add sections
8. user launches
9. Archie keeps filling in missing detail over time through open questions and section suggestions

### Critical implementation rule

`CORE` does **not** mean "load every CORE section from the whole library."

It means:

- load only the North Star's selected sections that are marked `CORE`
- keep the rest searchable in memory

This matters because `MANUAL_SECTIONS.md` contains many CORE-tagged sections across many applicability contexts. The runtime must load the selected CORE subset for the active NS, not the entire universal library.

## 6.1 Must Decide Before Coding

These decisions should be locked before implementation begins, because they affect multiple phases:

### A. CORE loading rule

Lock this rule:

- load only the active North Star's selected CORE sections into heartbeat
- never load every CORE section from `MANUAL_SECTIONS.md`

### B. Heartbeat projection rule

Lock this rule:

- heartbeat contains a compact operating contract
- it is not a raw full-manual dump
- it should stay OpenClaw-like: small, stable, operational

### C. Entry-path precedence

Lock this precedence order:

1. explicit user-selected entry path
2. template-suggested entry path
3. Archie inference during Explore / Clarify

And lock this timing rule:

- entry path must be locked before Phase 3 Generate

### D. Launch blocker rule

Lock this rule:

- manual drafting never blocks on missing answers
- questions are skippable and Archie can use recommended defaults
- launch should rarely block
- unresolved searchable sections become Questions-tab items, not launch blockers
- only true hard blockers should stop launch

### E. Template loadout mapping

Lock this scope:

- `ARCHIE_MVP_TEMPLATES.md` is the source for the static registry
- `recommendedSectionSlugs` still need to be authored per template
- do not block implementation on having perfect loadouts for all templates

Recommendation:

- start with the templates most likely to be used in MVP flows
- support partial loadouts first

### F. Hire-path parent context rule

Lock the MVP behavior:

- parent business context can come from user input or a selected parent North Star
- do not build deep cross-NS inheritance in the first pass

### G. Required integrations rule

Lock this rule:

- in Phases 1-3, required integrations are surfaced in UI and used as setup guidance
- they only hard-block launch once there is a real validation/checking path behind them

### I. Archie defaulting rule

Lock this rule:

- if the user skips a clarifying question, Archie can fill it with a recommended default
- Archie-proposed defaults should be visible in the manual or review state
- defaults should become open questions later if they matter operationally

### J. Section suggestion rule

Lock this rule:

- if Archie needs information during runtime and cannot find it in the current manual or memory, he should search the section registry for a suitable section
- Archie can then propose adding that section through open questions or chat
- once clarified, that section is added to the manual and projected normally

### H. Runtime identity rule

These must remain fixed:

- `sessionKey` is the real thread identity
- `north_stars` wraps that session, it does not replace it
- `heartbeat_docs` remains the always-loaded operating layer
- `memory_search` remains the generic retrieval capability
- `HEARTBEAT_OK`, wake semantics, cron semantics, and one-turn-per-wake behavior stay intact

## 7. Required Data Model Changes

### 7.1 `north_stars`

Keep:

- `id`
- `name`
- `template_id`
- `status`
- `primary_session_key`
- `business_manual_md`
- `seed_prompt`
- timestamps

Add:

- `entry_path text null`
- `setup_phase text not null default 'explore'`
- `selected_section_slugs text[] not null default '{}'`
- optional `industry text null`
- optional `clone_source_mode text null`

Allowed `entry_path` values:

- `build`
- `run`
- `hire`
- `clone`
- `compete`

Suggested `setup_phase` values:

- `explore`
- `clarify`
- `generate`
- `review`
- `launched`

Post-launch questions remain handled in the existing open-questions system rather than a separate persisted setup phase.

### 7.2 `north_star_setup_assets`

Add a new table for Clone / Compete setup materials:

- `id`
- `north_star_id`
- `kind` (`url | screenshot | pdf`)
- `source_ref`
- `validation_status`
- `validation_notes`
- `extracted_text`
- `reachable_url`
- timestamps

Purpose:

- keep competitor setup uploads and URL validation out of the canonical manual table
- support the "only show CLONE / COMPETE buttons after validation" rule

### 7.3 Keep existing stores

Do not replace:

- `memory_items`
- `heartbeat_docs`
- `agent_sessions`
- `north_star_open_questions`
- `cron_jobs`

These are already aligned with the minimal-change path.

## 8. Required Runtime Changes

### 8.1 Section registry

Build a code-side unified section registry from `MANUAL_SECTIONS.md`.

Each section record must include:

- `slug`
- `title`
- `description`
- `core: boolean`
- applicability tags such as:
  - `universal`
  - `platform`
  - `business`
  - `service`
  - `role`

Important:

- applicability tags are for filtering, template loadouts, and recommendations
- they must not become hardcoded runtime branches the way old tier inference did
- Archie should be able to use the registry as a reference source when deciding:
  - which sections to include in an initial manual draft
  - which sections to suggest later when he discovers a gap during runtime

### 8.2 Manual projection

Keep the current projection pipeline shape, but change the semantics:

- canonical manual on `north_stars.business_manual_md`
- selected CORE sections from that manual project into heartbeat
- selected non-CORE sections project into searchable memory

Heartbeat output should stop talking about `Tier 1 / Tier 2` and instead say:

- `CORE operating contract`
- `search memory for long-tail operating details`

Manual projection should remain an internal implementation detail.

The user experience should not force people to reason about:

- `CORE`
- `non-CORE`
- heartbeat vs memory

Those concepts are runtime mechanics, not product concepts.

### 8.3 Prompt composition layer

Add three prompt builders:

- `buildCoordinatorPrompt`
- `buildChatPrompt`
- `buildWorkerPrompt`

Coordinator prompt must compose:

- base Coordinator prompt
- entry-path addendum
- selected CORE manual excerpt
- live operational state

Chat prompt must compose:

- base Chat prompt
- setup phase context
- selected CORE excerpt
- path / template context when relevant

Worker prompt must compose:

- base Worker prompt
- job payload
- relevant CORE excerpt only when needed

Important:

- this is a prompt composition refactor, not a full runtime rewrite
- keep the current session / wake / worker skeleton
- just choose the correct prompt builder by context

### 8.4 Explicit manual generation

Move manual generation out of ambient chat and into an explicit server-side action in Phase 3.

Input should include:

- original user prompt
- exploration summary
- clarifying answers
- selected sections
- template defaults
- entry path
- connected integration signals where available
- Archie-recommended defaults for any skipped questions

The prompt used should be:

- one of the path-specific Manual-generation prompts from `ENTRY_PATH_PROMPTS.md`

Output should be:

- full anchored markdown manual written to `north_stars.business_manual_md`
- any Archie-proposed defaults clearly marked or traceable for later review

After write:

- project CORE into heartbeat
- project searchable sections into memory
- sync open questions for unresolved or thin sections

Important:

- Archie should not need a perfect section loadout before drafting
- Archie can choose a reasonable initial section set using:
  - entry path
  - template defaults
  - user prompt
  - research
  - section registry lookup

### 8.5 Generic memory behavior

Keep the generic memory tools and RPC.

Use memory for:

- manual sections
- skills
- decisions
- journal summaries
- patterns
- competitor intel

Do not introduce:

- `manual.lookup`
- `manual_doc_tool`
- path-specific storage tools

## 9. Required UI Changes

### 9.1 Home

Add:

- entry-path picker row near the composer
- `Browse Manual Sections` button below or near the composer
- ability to create a North Star with:
  - prompt only
  - template + prompt
  - prompt + explicit path
  - prompt + preselected sections

If the user does not pick a path:

- Archie should infer it during Explore / Clarify
- the value must be locked before Generate

Questions asked during setup should be skippable, with Archie falling back to recommended defaults.

### 9.2 Template gallery

Use `ARCHIE_MVP_TEMPLATES.md` as a static source-of-truth registry for now.

Each template must surface:

- title
- tier
- description
- requirements
- integrations
- revenue model
- recommended section loadout

Do not move templates into a DB-backed CMS in this pass.

### 9.3 Setup flow

Preserve the current "create NS immediately" behavior, but add visible setup state:

1. Explore
2. Clarify
3. Generate
4. Review
5. Launch
6. Post-Launch Questions

Phase behavior:

- Explore: research only, no launch decisions locked yet
- Clarify: targeted questions in chat and/or question cards; all skippable
- Generate: Archie drafts the manual using user input, research, and defaults where needed
- Review: user sees the manual on the right, can approve, edit, add, or replace sections
- Launch: cron + runtime activation after approval, with defaults allowed unless there is a true hard blocker
- Post-Launch Questions: unresolved, missing, or newly discovered operating details

### 9.4 Section-library UI

Build one reusable section-library component and use it in four places:

- Home composer
- template detail screen
- setup right pane
- post-launch Upgrade Manual flow

It must support:

- search
- filter by applicability
- plain-English section title and description
- click-to-add behavior

### 9.5 Questions UI

Keep the existing Questions panel concept and expand it.

Use it for:

- unresolved manual sections after Generate
- clarifying questions triggered by user-added sections
- post-launch manual upgrades
- runtime-discovered missing sections Archie wants to add

When a user adds a section:

- Archie generates 2-5 questions
- answers update the canonical manual
- memory projection refreshes
- heartbeat only changes if a selected CORE section changed

When Archie discovers he needs a missing section during runtime:

- Archie searches the current manual and memory first
- if missing, Archie looks up a suitable section from the registry
- Archie proposes that section through open questions or chat
- after clarification, the section is added to the manual and projected normally

### 9.6 Projects / Team View

Reuse `/projects` and upgrade it into the portfolio cockpit.

Add:

- card or dashboard layout
- search across North Stars
- filter by tier
- filter by industry
- filter by status
- grouped Role bundles
- bulk pause / resume hooks

Keep:

- `/projects/[id]` as the single-project detail route

### 9.7 North Star detail

Current project detail should evolve toward:

- Overview
- Document
- Questions
- Agents
- Journal

For this pass, the minimum requirement is:

- add a Manual surface
- add an Upgrade Manual entry point
- keep chat and activity intact

## 10. Detailed Phased Build Plan

## Phase 1 - Foundation: terminology, schema, and prompt composition

Goal:

- remove the conceptual mismatch without breaking the running engine

Deliverables:

- unified section registry sourced from `MANUAL_SECTIONS.md`
- `CORE / searchable memory` terminology in code and UI
- new `north_stars` fields:
  - `entry_path`
  - `setup_phase`
  - `selected_section_slugs`
- prompt composition layer:
  - Coordinator
  - Chat
  - Worker

Implementation notes:

- Keep `north_stars.business_manual_md`.
- Keep `heartbeat_docs` and `memory_items`.
- Stop using runtime tier inference to shape memory/heartbeat behavior.
- Start selecting prompts by wake type instead of one system prompt for all paths.
- Do not expose `CORE` vs searchable memory as product jargon.

Acceptance:

- no live runtime copy still says `Tier 1 / Tier 2`
- chat wakes use Chat prompt builder
- cron and system wakes use Coordinator prompt builder
- worker execution path can accept a Worker prompt builder even if bundle orchestration is not fully built yet

## Phase 2 - Setup state and explicit manual generation

Goal:

- turn setup into an explicit product flow instead of an emergent chat artifact flow

Deliverables:

- visible setup phases on the North Star
- Home entry-path picker
- entry-path persistence and locking
- explicit `generateManualDraft` server action
- skippable setup questions with Archie-recommended defaults

Implementation notes:

- Keep the current "create project immediately" behavior to avoid route churn.
- Use `ENTRY_PATH_PROMPTS.md` for Phase 3 draft generation.
- Manual generation should write the full anchored markdown into `north_stars.business_manual_md`.
- After generation, immediately run projection into heartbeat + memory.
- Archie should be able to draft once he has enough signal, not only when everything is answered.

Acceptance:

- a new North Star can be created with or without an explicit path
- if no path is chosen, path can be inferred during Explore / Clarify
- Generate no longer depends on Archie emitting a special artifact inside regular chat
- skipped answers still allow Generate because Archie can use recommended defaults

## Phase 3 - Section library and template loadouts

Goal:

- make the section library and template registry real product inputs

Deliverables:

- reusable section-library component
- static template registry module sourced from `ARCHIE_MVP_TEMPLATES.md`
- template-recommended section loadouts
- add-section -> clarifying-question flow
- runtime-discovered section suggestion flow

Implementation notes:

- template tier stays descriptive; it should not directly control runtime behavior
- template choice should prefill:
  - recommended section slugs
  - any starter skill seeds
  - a suggested entry path if obvious
- user must be able to modify the section loadout before or after launch
- template loadouts do not need to be perfect on day one; partial curated loadouts are acceptable

Acceptance:

- section library is available from Home, setup, template detail, and post-launch
- selecting or adding sections changes the loadout
- adding a section produces clarifying questions
- answering those questions updates the manual and memory correctly
- Archie can suggest a missing section during runtime when he discovers an operating gap

## Phase 4 - Review and launch refinement

Goal:

- make the setup flow feel deliberate instead of abrupt

Deliverables:

- Review phase UI
- Archie-assisted manual rewrite / tightening
- lightweight approval and launch flow

Implementation notes:

- launch should block only on missing required selected CORE sections
- in the common path, launch should not block just because info is incomplete
- unfilled searchable sections should become Questions-tab items, not launch blockers
- this phase is where the helper Manual review / rewrite prompt becomes useful

Acceptance:

- user can review the generated manual before launch
- launch works with Archie defaults unless there is a true hard blocker
- post-launch open questions are populated for unresolved sections

## Phase 5 - Team View on Projects

Goal:

- convert `/projects` from a list into the portfolio manager cockpit

Deliverables:

- multi-NS dashboard view
- search
- tier / industry / status filters
- grouped roles / bundles
- bulk action hooks

Implementation notes:

- keep route stability by upgrading `/projects`
- do not create a parallel new dashboard route unless absolutely necessary

Acceptance:

- users can see all North Stars at once
- users can filter and search across them
- detail pages remain unchanged in routing

## Phase 6 - Clone / Compete flow

Goal:

- add the only truly new setup infrastructure required by the spec

Deliverables:

- `north_star_setup_assets` table
- upload / URL submission surface
- validation pipeline
- locked `clone` vs `compete` path choice

Validation rules:

- require at least one reachable website
- require at least one readable screenshot or PDF
- only reveal CLONE / COMPETE buttons after validation passes

After lock-in:

- use Clone or Compete Manual-generation prompt
- use Clone / Compete Coordinator addendum
- store competitor intel in memory for later watch / compare behavior

Acceptance:

- invalid uploads do not reveal clone/compete CTAs
- valid sources unlock the two-button choice
- selected path persists and drives generation + runtime

## Phase 7 - Later work after this migration

These are real spec items, but they are not required to complete the minimal-change migration:

- full multi-bundle coordinator + worker orchestration
- richer Overview dashboard metrics
- full three-panel document editor
- Canvas / webbuilder integration
- per-bundle tool permissions UI
- cross-NS Journal and Brain UX

These should not block the manual/setup/runtime migration.

## 11. What Must Stay As-Is

Do not rewrite these unless absolutely necessary:

- one persistent session per North Star
- `north_stars` as the top-level entity
- `north_stars.business_manual_md` as canonical manual storage for this pass
- `heartbeat_docs` as derived runtime artifact storage
- `memory_items` + `memory_search` as generic searchable memory
- global Brain namespace / fallback memory search
- existing open-questions table and answer/dismiss flow
- current cron / wake / session isolation model
- Fly-hosted worker + Supabase-backed state model
- `/projects/[id]` route

## 12. Risks And Known Friction

### 12.1 `Tier 1 / Tier 2` is deep in the code

It appears in:

- projection logic
- prompt text
- seed heartbeat
- open-question sync
- start messages
- UI copy

This is mostly a refactor risk, not a data-model risk.

### 12.2 Per-tier branching must be unwound carefully

Current code still uses tier heuristics to shape:

- skill seeds
- starter manual seeds
- heartbeat text

That logic needs to move to:

- entry path
- selected section loadout
- template defaults

### 12.3 Prompt composition needs a real injection point

The new per-path Coordinator addendums do not fit cleanly into the old one-prompt runtime.

The correct minimal-change answer is:

- add a prompt composition layer
- keep the existing wake loop
- do not try to implement the full future bundle model just to support the prompt split

### 12.4 `CORE` prompt size must be controlled

Because `MANUAL_SECTIONS.md` contains many CORE-tagged sections, the runtime must:

- load only selected CORE sections for the active NS
- not blindly load every CORE section from the global library

### 12.5 Over-blocking setup would be a product regression

If setup becomes too rigid, the product drifts away from the Lovable-style behavior you want.

Avoid:

- requiring too many answers before Archie can draft
- treating every unknown as a launch blocker
- forcing the user to understand the section architecture before they can start

Preferred behavior:

- ask focused questions
- allow skips
- use Archie-recommended defaults
- draft fast
- let the user approve and launch
- resolve remaining detail over time

### 12.6 Template registry should stay static in this pass

`ARCHIE_MVP_TEMPLATES.md` is now present and is enough to drive a static registry module.

Do not expand scope into:

- template admin UI
- DB-managed template CMS
- live template editing

## 13. Acceptance Checklist

Use this as the verification target for the migration:

- Create a North Star from Home without explicitly choosing a path; Archie infers and locks the path before Generate.
- Create a North Star from a template; the template's recommended section loadout is visible and editable before launch.
- Generate a manual explicitly in Phase 3 using the correct path prompt.
- Skip some setup questions and confirm Archie uses recommended defaults instead of blocking progress.
- Confirm the canonical manual is saved on the North Star row.
- Confirm only selected CORE sections project into heartbeat.
- Confirm selected non-CORE sections project into generic memory.
- Confirm Archie uses memory search for long-tail business knowledge, not a manual-specific tool.
- Confirm the user can approve and launch without filling every detail manually.
- Add a section after launch and verify it creates clarifying questions instead of silently editing the manual.
- Let Archie run, discover a missing operating gap, and verify he can suggest a section from the registry via open questions or chat.
- Answer those questions and verify:
  - canonical manual updates
  - memory updates
  - heartbeat changes only when a selected CORE section changed
- Confirm `/projects` shows all NSes in a Team View without breaking project detail navigation.
- Confirm Clone / Compete buttons only appear after upload + URL validation succeeds.

## 14. Recommended Execution Order For New Threads

If you are using new execution threads, use this order:

1. Phase 1 only
2. Phase 2 only
3. Phase 3 only
4. Smoke test setup flow end to end
5. Phase 4
6. Phase 5
7. Phase 6

Reason:

- Phases 1-3 establish the real product model
- Phase 4 improves setup usability
- Phase 5 is a projects/dashboard upgrade
- Phase 6 is the only phase with truly new ingestion/validation infrastructure

## 15. Final Recommendation

Approve and execute Phases 1-3 first.

That gives Archie Bravo the new mental model:

- unified manual library
- `CORE + searchable memory`
- entry-path-aware setup
- explicit manual generation
- template-driven section loadouts
- fast draft-first launch with Archie defaults
- ongoing section suggestion and open-question refinement

Once that is stable, implement:

- Review / launch polish
- Team View
- Clone / Compete validation

This preserves what already works, keeps Fly + Supabase + the 24/7 engine intact, and gets the product closer to the spec without a destructive rewrite.
