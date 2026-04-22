# Archie Bravo Preview-First Shell Plan

Date: 2026-04-22
Related docs:
- `SPEC/ARCHIE_BRAVO.md`
- `SPEC/paperclip-archie-build-plan.md`
- `doc/plans/2026-04-22-archie-bravo-ownership-phase-1.md`
- `doc/plans/2026-04-22-archie-bravo-supabase-postgres-better-auth.md`

## Purpose

Turn the current Paperclip UI into the first real Archie Bravo product shell.

This plan is intentionally narrow:

- left side: living agent chat
- right side: embedded live preview
- secondary tabs: manual, agenda, journal, settings
- hide or demote the current control-plane-heavy dashboard feel

This is not an IDE plan.

This is not a Monaco plan.

This is not a backend runtime rewrite.

It is a product-shell plan on top of the existing Paperclip runtime.

## Core Decision

Archie Bravo v1 should be **preview-first**, not editor-first.

The main experience is:

1. user talks to Archie on the left
2. user watches the live app or output on the right
3. user opens Manual, Agenda, Journal, or Settings as needed

The current Paperclip backend already provides the hard part:

- agents
- runs
- heartbeats
- issues
- routines
- workspaces
- runtime services
- preview URLs
- logs and transcripts

The missing layer is the Archie-facing shell.

## What We Keep From Paperclip

Keep these as the backend and control-plane primitives:

- `companies` as the main per-business container
- `agents` as Archie/coordinator and supporting workers
- `issues` as agenda/work items
- `routines` as cron and recurring automation
- `heartbeat runs` as live run execution
- `project workspaces` and `execution workspaces` as runtime/codebase backing
- workspace runtime services and jobs as the source of preview URLs
- comments, documents, attachments, and activity as the basis for journal/manual/history surfaces

These are the parts we are buying from Paperclip instead of rebuilding.

## What We Change

### Product language

Replace or demote Paperclip-oriented language in primary flows:

- dashboard
- board
- company
- issue
- routines
- settings copy that feels operator-only

Use Archie Bravo product language where it is user-facing.

Internal table/package names can stay for now.

### Information architecture

Stop making the dashboard/control-plane layout the main experience.

The Archie shell should become:

- primary: conversation + preview
- secondary: manual + agenda + journal + settings
- hidden/de-emphasized: deep operator/admin/config pages unless needed

### Preview behavior

Stop treating the preview as just an external link.

The preview URL exposed by workspace runtime services should become:

- an embedded preview pane in the main app shell
- with fallback open-in-new-tab behavior when embedding is not possible

## What Exists Already

The repo already has the backend pieces needed for the first Archie shell:

- issue/run chat surfaces
- live run transcripts
- workspace runtime controls
- preview URLs emitted by runtime services
- project and execution workspace models
- issue documents and attachments
- routines and scheduled work

The missing piece is not "can it run the app?"

The missing piece is "is the app preview embedded and centered in the product?"

## What Does Not Exist Yet

These are still missing or incomplete:

- a dedicated Archie left-pane coordinator chat shell
- an embedded preview pane as a first-class right-side surface
- a simplified Archie-first navigation model
- a clean Manual surface that feels like a business operating doc instead of scattered issue/project content
- an Archie-branded Journal surface centered on recent work, decisions, and activity
- a user-friendly Settings surface that absorbs the current science-dashboard clutter

## Product Shell Target

## Main layout

The default Archie Bravo signed-in layout should be a split view:

- **Left pane**
  - Archie coordinator chat
  - live run state
  - recent transcript snippets
  - quick actions

- **Right pane**
  - embedded preview
  - fallback empty state when no preview is running yet
  - open-in-new-tab button
  - restart/refresh controls when needed

### Secondary views

The right side or lower panel should expose tabs like:

- `Preview`
- `Manual`
- `Agenda`
- `Journal`
- `Settings`

This keeps the product centered on "talk to Archie, watch the output" instead of "browse admin tables."

## Entity Mapping

Use the existing backend, but remap the product meaning carefully.

### Good mappings

- `Company` -> Archie business / North Star container
- `Agent` -> coordinator or specialist role
- `Issue` -> agenda item / work item
- `Routine` -> cron / recurring automation
- `Activity + runs + comments` -> journal/history
- `Project workspace / execution workspace runtime services` -> preview source

### Avoid bad mappings

Do not force:

- `Goal` -> Business Manual

Goals are better used as objectives, outcomes, or strategic targets.

The Business Manual should be treated as its own Archie surface, even if we temporarily back it with existing document infrastructure.

## Build Phases

### Phase 1: Archie identity pass

Before the shell lands, remove obvious Paperclip identity from:

- browser title
- auth copy
- account menus
- default nav labels
- docs/help links
- empty states

Exit criteria:

- the app feels like Archie Bravo from first load

### Phase 2: Promote the living agent surface

Take the current run/chat capability and make it the primary left pane.

Work in this phase:

- identify the best current issue/run chat surface to reuse
- mount it in a persistent left-side Archie panel
- make the coordinator experience feel like the default, not a tucked-away detail page

Exit criteria:

- the first thing the user sees after entering a business is Archie, not a dashboard grid

### Phase 3: Embed preview instead of linking out

Use the existing workspace runtime URL as the source for an embedded preview.

Work in this phase:

- resolve the active preview URL from the current runtime service model
- render that URL in an embedded preview panel
- preserve open-in-new-tab fallback
- handle loading, missing preview, and crashed preview states

Exit criteria:

- the user can watch the running app inside Archie Bravo

### Phase 4: Reorganize the shell

Move the current control-plane-heavy pages behind secondary navigation.

Work in this phase:

- demote dashboard-style landing pages
- move advanced project/workspace/runtime controls under settings or secondary tabs
- keep the power features accessible without making them the default experience

Exit criteria:

- the signed-in experience no longer feels like a science dashboard

### Phase 5: Manual, Agenda, Journal tabs

Expose the key Archie surfaces around the preview-first core.

Work in this phase:

- `Manual`: business manual / operating doc surface
- `Agenda`: current and upcoming work
- `Journal`: recent actions, runs, decisions, evidence
- `Settings`: cron, runtime controls, agents, integrations, and advanced configuration

Exit criteria:

- the user can understand and manage the business without needing the old IA

## Preview Rules

The preview-first shell should follow these rules:

1. Preview is first-class.
2. If a preview URL exists, embed it by default.
3. If no preview URL exists, show a clear Archie state explaining why.
4. If the preview cannot be embedded, offer open-in-new-tab fallback.
5. Preview controls should be lightweight and user-facing, not raw control-plane noise.

## Non-Goals

Do not expand this phase into:

- a Monaco editor
- a full IDE
- code file editing UI
- Supabase Auth migration
- billing
- marketplace provisioning
- multi-business collaboration redesign
- deep backend runtime rewrites

Those may happen later, but they are not required for the first Archie shell.

## Test Plan

### Branding

- no Paperclip branding remains in primary signed-in flows
- the shell reads as Archie Bravo

### Layout

- the default signed-in view is left-chat / right-preview
- the app no longer lands users in a dashboard-first shell

### Preview

- a running workspace preview URL is embedded in-app
- missing previews show a useful fallback state
- preview can still be opened externally if needed

### Agent surface

- the coordinator chat is visible and usable in the primary shell
- live run output is understandable without opening old detail pages

### Navigation

- Manual, Agenda, Journal, and Settings are reachable and coherent
- admin-heavy Paperclip pages are demoted from the primary path

## Recommended Order

Implement in this order:

1. Archie branding pass
2. left-pane Archie chat shell
3. embedded right-side preview
4. tabbed Manual / Agenda / Journal / Settings shell
5. hide/demote old dashboard-heavy flows

Reasoning:

- branding fixes the immediate "this is still Paperclip" problem
- left chat + right preview creates the real Archie feel fastest
- tabs/settings cleanup can happen after the main shell exists

## Bottom Line

Paperclip already gives Archie Bravo the hard runtime pieces:

- autonomous workers
- coordinator-like execution
- workspace runtime
- preview URLs
- logs, transcripts, and control-plane data

Archie Bravo now needs the missing product shell:

- living agent left
- live preview right
- everything else organized around that

That is the shortest path from "working engine" to "real Archie product."
