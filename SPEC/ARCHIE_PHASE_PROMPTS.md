# Archie Bravo Phase Prompts

_Last updated: 2026-04-20_
_Purpose: copy-paste implementation and verification prompts for executing the phases in `ARCHIE_BUILD_PLAN.md` without drifting from the OpenClaw-shaped runtime._

## 1. Shared Header

Paste this at the top of every implementation thread.

```text
You are implementing one phase of Archie Bravo in this repo:

C:\Users\capar\Downloads\ArchieBravo

Read first:
- spec/ARCHIE_BUILD_PLAN.md
- spec/ARCHIE_BRAVO.md
- spec/MANUAL_SECTIONS.md
- spec/ARCHIE_MVP_TEMPLATES.md
- spec/ENTRY_PATH_PROMPTS.md
- spec/COORDINATOR_PROMPT.md
- spec/CHAT_ARCHIE_PROMPT.md
- spec/WORKER_PROMPT.md

Non-Drift Checklist for Archie Bravo

- Do not rewrite the OpenClaw-style engine.
- Do not invent new runtime primitives if metadata, prompt composition, projection, or UI flow can solve it.
- `sessionKey` remains the real thread identity.
- `north_stars` stays a thin wrapper around the existing session-backed runtime.
- `north_stars.business_manual_md` stays the canonical manual for this pass.
- `heartbeat_docs` stays derived, compact, and operational.
- `memory_items` + `memory_search` stay generic.
- No manual-specific retrieval or write tool.
- No giant prompt dumps. Load only the selected compact operating subset into heartbeat.
- Do not expose internal `CORE` / searchable-memory mechanics as product jargon.
- Entry path shapes prompts and setup flow; tier stays gallery metadata.
- Questions are skippable; Archie can use recommended defaults.
- Launch should be low-friction; only true hard blockers should stop it.
- Missing detail should resolve over time through open questions and section suggestions.
- Section registry is a reference source, not a new persistence subsystem.
- Templates are a static registry in this pass, not a CMS.
- Required integrations are setup/UI guidance first, hard gates later only if real checks exist.
- Clone/Compete is the only truly new setup subsystem.
- Do not build multi-bundle orchestration, Canvas expansion, or heavy dashboarding early if the current phase does not require it.

General instructions:
- Implement only the requested phase.
- Do not “helpfully” do later phases.
- Prefer the smallest viable code changes that satisfy the build plan.
- If something is ambiguous, choose the minimal-change option that preserves the OpenClaw model.
- After implementation, run relevant verification and summarize:
  1. what changed
  2. what was intentionally deferred
  3. any risks or follow-ups
```

## 2. Phase 1 Prompt

```text
Implement Phase 1 only from `spec/ARCHIE_BUILD_PLAN.md`.

Phase 1 - Foundation: terminology, schema, and prompt composition

Goal:
- remove the conceptual mismatch without breaking the running engine

Deliverables:
- unified section registry sourced from `MANUAL_SECTIONS.md`
- internal `CORE / searchable memory` terminology in code
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
- Do not expose `CORE` vs searchable memory as product jargon in the UI.
- Keep the current worker, wake, cron, session, and memory model intact.

What to inspect first:
- current North Star schema and APIs
- current prompt assembly path
- current heartbeat injection path
- current manual projection code
- current model/provider adapters

Required implementation behavior:
1. Build a code-side section registry from `spec/MANUAL_SECTIONS.md`.
2. Add the Phase 1 schema fields to `north_stars` with a migration.
3. Introduce prompt builders for:
   - coordinator wakes
   - chat turns
   - worker execution
4. Route chat turns through Chat prompt composition.
5. Route cron/system wakes through Coordinator prompt composition.
6. Prepare Worker prompt composition even if worker bundle orchestration is not fully used yet.
7. Remove live user-facing `Tier 1 / Tier 2` language where it appears in current runtime/UI copy.
8. Do not add manual-specific tools or services.
9. Do not implement setup UI, section browser UI, explicit manual generation flow, Team View, or Clone/Compete upload flow in this phase.

Acceptance criteria:
- no live runtime copy still says `Tier 1 / Tier 2`
- chat wakes use Chat prompt builder
- cron and system wakes use Coordinator prompt builder
- worker execution path can accept a Worker prompt builder
- the runtime still behaves like one OpenClaw-style engine

After implementation:
- run typecheck/build
- summarize exact changes
- list what remains for Phase 2
```

## 3. Phase 2 Prompt

```text
Implement Phase 2 only from `spec/ARCHIE_BUILD_PLAN.md`.

Phase 2 - Setup state and explicit manual generation

Goal:
- turn setup into an explicit product flow instead of an emergent chat artifact flow

Deliverables:
- visible setup phases on the North Star
- Home entry-path picker
- entry-path persistence and locking
- explicit `generateManualDraft` server action
- skippable setup questions with Archie-recommended defaults

Important product rules:
- questions must be skippable
- Archie can use recommended defaults
- Archie should draft once he has enough signal
- do not over-block setup
- launch friction should stay low
- this should feel closer to Lovable than a rigid wizard

Implementation notes:
- Keep the current “create project immediately” behavior.
- Use entry path to select the Phase 3 manual-generation prompt from `ENTRY_PATH_PROMPTS.md`.
- Manual generation should write the full anchored markdown into `north_stars.business_manual_md`.
- After generation, immediately project into heartbeat + memory.
- Do not require perfect section selection before drafting.
- Archie can determine a reasonable initial section set using:
  - entry path
  - template defaults if available
  - user prompt
  - research summary
  - section registry lookup

Scope for this phase:
1. Persist and expose setup phases on the North Star.
2. Add Home entry-path selection UI and API support.
3. Support path inference fallback if the user did not explicitly choose one.
4. Lock the entry path before Generate.
5. Add a server-side manual generation action using the path-specific prompt.
6. Support Archie-recommended defaults for skipped clarifying questions.
7. Show or persist enough metadata so Archie-proposed defaults can be reviewed later.
8. Replace reliance on ambient `<business_manual>` artifact generation for the primary setup path.

Do not implement yet:
- full section-library browser everywhere
- template detail loadout UX
- runtime section suggestion flow
- Team View
- Clone/Compete uploads/validation

Acceptance criteria:
- a new North Star can be created with or without an explicit path
- questions can be skipped
- Archie can still generate a manual using defaults
- the canonical manual is written by explicit generation flow
- projection to heartbeat and memory still works
- setup does not become a rigid blocker flow

After implementation:
- run verification
- summarize exact changes
- list what remains for Phase 3
```

## 4. Phase 3 Prompt

```text
Implement Phase 3 only from `spec/ARCHIE_BUILD_PLAN.md`.

Phase 3 - Section library and template loadouts

Goal:
- make the section library and template registry real product inputs

Deliverables:
- reusable section-library component
- static template registry module sourced from `ARCHIE_MVP_TEMPLATES.md`
- template-recommended section loadouts
- add-section -> clarifying-question flow
- runtime-discovered section suggestion flow

Important architectural constraints:
- the section registry is a reference source, not a new persistence subsystem
- do not persist all 287 library sections as runtime state
- do not build a template CMS
- template tier is descriptive, not a runtime behavior driver
- template loadouts do not need to be perfect for all templates on day one

Scope for this phase:
1. Create a static template registry module from `spec/ARCHIE_MVP_TEMPLATES.md`.
2. Add support for `recommendedSectionSlugs` in that static registry.
3. Build a reusable section-library UI component driven by `MANUAL_SECTIONS.md`.
4. Use it in the surfaces already called for by the plan, at least where needed for this phase.
5. Let users add/remove/modify selected sections before launch.
6. When a user adds a section:
   - generate 2-5 clarifying questions
   - route them into the Questions/open-questions experience
   - update the canonical manual after answers
   - update memory projection
   - update heartbeat only if a selected CORE section changed
7. Add the runtime section suggestion behavior:
   - Archie searches current manual/memory first
   - if missing, Archie can identify a suitable section from the registry
   - Archie proposes it through open questions or chat
   - once clarified, it gets added to the manual and projected normally

Implementation notes:
- Start with partial curated loadouts for the most important templates if needed.
- Do not stall on hand-authoring perfect loadouts for 113 templates.
- Keep the registry and template handling static/spec-backed.

Do not implement yet:
- Team View
- Clone/Compete upload/validation
- full multi-bundle orchestration
- Canvas/webbuilder work

Acceptance criteria:
- section library is usable
- template registry is real and static
- loadouts are editable
- adding sections creates clarifying questions
- answering those questions updates manual + memory correctly
- Archie can suggest missing sections during runtime without introducing new engine concepts

After implementation:
- run verification
- summarize exact changes
- list what remains for Phase 4
```

## 5. Phase 4 Prompt

```text
Implement Phase 4 only from `spec/ARCHIE_BUILD_PLAN.md`.

Phase 4 - Review and launch refinement

Goal:
- make the setup flow feel deliberate instead of abrupt
- preserve a low-friction launch model

Deliverables:
- Review phase UI
- Archie-assisted manual rewrite / tightening
- lightweight approval and launch flow

Important product rules:
- launch should not be blocked just because the manual is incomplete
- questions are skippable
- Archie defaults are allowed
- only true hard blockers should stop launch
- unresolved detail should become open questions, not pre-launch bureaucracy

Scope for this phase:
1. Add the Review phase to setup UI/flow.
2. Let users see the drafted manual clearly on the right side.
3. Let users:
   - approve
   - ask Archie to revise
   - add sections
   - replace sections
4. Add approval-state handling if needed to distinguish:
   - drafted
   - approved
   - running
5. Ensure launch works with Archie-proposed defaults unless a true hard blocker exists.
6. Keep post-launch open questions populated for unresolved details.

True hard blockers should be rare and concrete, for example:
- Clone/Compete chosen but no valid source exists
- a template/integration path absolutely cannot function and there is no graceful fallback

Do not implement yet:
- Team View
- Clone/Compete upload infrastructure itself
- multi-bundle orchestration
- Canvas expansion

Acceptance criteria:
- user can review the draft before launch
- Archie can revise the manual during review
- launch works without requiring every detail to be answered manually
- unresolved issues become Questions-tab items
- the product feels draft-first and approval-first, not wizard-gated

After implementation:
- run verification
- summarize exact changes
- list what remains for Phase 5
```

## 6. Phase 5 Prompt

```text
Implement Phase 5 only from `spec/ARCHIE_BUILD_PLAN.md`.

Phase 5 - Team View on Projects

Goal:
- convert `/projects` from a list into the portfolio manager cockpit

Deliverables:
- multi-NS dashboard view
- search
- tier / industry / status filters
- grouped roles / bundles
- bulk action hooks

Important non-drift rule:
- this is a UI/product surface upgrade
- do not change the underlying runtime model to achieve it
- keep `/projects/[id]` and per-NS session identity intact

Scope for this phase:
1. Upgrade the existing `/projects` route instead of creating a new route unless absolutely necessary.
2. Add dashboard/card presentation for all North Stars.
3. Add filters:
   - tier
   - industry
   - status
4. Add cross-NS search.
5. Add grouped Role bundles presentation if enough data exists to show it meaningfully.
6. Add bulk action hooks or scaffolding for pause/resume behaviors if the backend supports them or if UI placeholders are appropriate.
7. Preserve existing navigation into single-project detail.

Do not implement yet:
- Clone/Compete upload/validation
- multi-bundle orchestration beyond what is needed for presentation
- Canvas/webbuilder work

Acceptance criteria:
- `/projects` behaves like a real Team View
- users can search and filter across North Stars
- project detail routing remains stable
- no runtime drift was introduced just to power the dashboard

After implementation:
- run verification
- summarize exact changes
- list what remains for Phase 6
```

## 7. Phase 6 Prompt

```text
Implement Phase 6 only from `spec/ARCHIE_BUILD_PLAN.md`.

Phase 6 - Clone / Compete flow

Goal:
- add the only truly new setup infrastructure required by the spec

Deliverables:
- `north_star_setup_assets` table
- upload / URL submission surface
- validation pipeline
- locked `clone` vs `compete` path choice

Important constraints:
- keep this as a setup subsystem, not a runtime rewrite
- once the path is chosen, the rest should still use the same Archie runtime skeleton
- competitor intel should flow into prompts and memory, not a bespoke parallel engine

Scope for this phase:
1. Add the setup asset storage table/model for Clone/Compete.
2. Add upload / URL submission UI in the setup flow.
3. Add validation rules:
   - at least one reachable website
   - at least one readable screenshot or PDF
4. Only reveal CLONE / COMPETE buttons after validation passes.
5. Once chosen, persist the path as `clone` or `compete`.
6. Feed competitor context into:
   - path-specific manual generation
   - coordinator addendum behavior
   - generic memory for later monitoring/comparison

Implementation notes:
- keep competitor intel in generic memory where possible
- do not create a whole new competitor-analysis service unless absolutely required
- validation can be modest in MVP, but must be real enough to justify the path gating

Acceptance criteria:
- invalid inputs do not unlock clone/compete actions
- valid inputs do unlock them
- selected path persists
- generation and runtime behavior use the correct path prompt/addendum
- the rest of the runtime remains OpenClaw-shaped

After implementation:
- run verification
- summarize exact changes
- list any remaining deferred work
```

## 8. Verifier Prompt

Use this in a read-only verification thread after any phase.

```text
Read-only verification pass.

Repo:
C:\Users\capar\Downloads\ArchieBravo

Read first:
- spec/ARCHIE_BUILD_PLAN.md

Audit the repo against the completed phase and report:

1. What was implemented
2. What is missing
3. Any drift from the OpenClaw model
4. Any overengineering introduced
5. Any regressions or bugs
6. Accept or reject this phase

Be strict about:
- one runtime, not multiple new engines
- sessionKey still being the true identity
- heartbeat remaining compact
- memory remaining generic
- no manual-specific tool/service
- launch not becoming rigidly gated
- the section registry not becoming a heavy subsystem

Output:
- findings first, highest severity first
- then pass/fail
- then short summary of accepted vs deferred work
```

## 9. Recommended Usage

Use the prompts in this order:

1. Shared Header
2. Phase prompt
3. Verifier Prompt in a second thread

Recommended execution sequence:

1. Phase 1
2. Phase 2
3. Phase 3
4. smoke / verification pass
5. Phase 4
6. Phase 5
7. Phase 6

Keep the phases isolated. Do not let an implementation thread pull later phases forward unless the current phase is literally blocked without it.
