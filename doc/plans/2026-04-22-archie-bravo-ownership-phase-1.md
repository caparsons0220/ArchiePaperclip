# Archie Bravo Ownership Phase 1 Plan

Date: 2026-04-22
Related docs:
- `SPEC/ARCHIE_BRAVO.md`
- `SPEC/paperclip-archie-build-plan.md`

Superseded in part:
- Database/auth direction is superseded by `doc/plans/2026-04-22-archie-bravo-supabase-postgres-better-auth.md`
- This file should still be treated as the product-ownership and branding plan

## Goal

Turn the current Hostinger validation instance into a real Archie Bravo public app.

This phase is about **ownership**, not layout polish:

- Archie Bravo must stop feeling like a forked Paperclip install
- users must sign into **Archie Bravo**, not a Paperclip-branded app
- auth and app data must move to a backend the operator can inspect and manage directly
- new users must be able to sign up publicly and get their own workspace immediately

## Decision Summary

The following decisions are locked for this phase:

1. **Backend source of truth:** Supabase
2. **Public auth methods:** Google OAuth + email/password
3. **Public entry model:** open self-serve signup
4. **Default post-signup behavior:** automatically create one personal Archie Bravo workspace
5. **Collaboration scope:** single-owner workspace only for phase 1
6. **Existing Hostinger/Paperclip data:** disposable validation data, no migration
7. **Hostinger role:** app runtime only, not the long-term operator control plane for auth/data

## What Exists Today

The current system is already real software, but it still presents itself as Paperclip.

### What is already real

- a public app runtime on Hostinger
- a real Postgres database
- real user rows
- real session rows
- real company membership rows
- real invite flows
- real agent execution

### Why it still feels wrong

- the product branding is still Paperclip in the browser, auth page, menus, copy, docs links, and empty states
- the app still feels like an operator-first or invite-first control plane
- auth is implemented with Better Auth, which is functional but not the operator-facing backend the product owner expects
- the current database lives behind the app runtime instead of in a dashboard-first platform like Supabase

### Important clarification

The current production deployment is **not** using Paperclip's hosted backend.
It is using your own VPS containers.

But the current customer experience is still too visibly upstream, which is the actual product problem.

## Success Condition

This phase is successful when:

- a new user can visit Archie Bravo on the public web
- they see only Archie Bravo branding
- they can sign up with Google or email/password
- their account is clearly visible in the product
- a personal workspace is created automatically
- they land inside that workspace without needing an invite
- all auth and app data live in Supabase
- the Hostinger deployment runs against Supabase-backed auth/data successfully

## Non-Goals

Do not include these in this phase:

- full Archie Bravo layout redesign
- teammate invites or multi-human collaboration inside one workspace
- Stripe or Stripe Connect
- multi-tenant pricing/billing system
- migration of the current Hostinger validation data
- deeper internal renaming of every `paperclip` symbol/package/table

## Build Plan

### Phase 0: Establish Archie Bravo as the owned platform

Create the new operator-controlled backend foundation:

- create a clean Supabase project for Archie Bravo
- treat the current Hostinger instance as validation-only
- define Supabase as the new source of truth for:
  - users
  - auth sessions
  - app database
  - storage-backed profile/assets where applicable
- keep Hostinger as the runtime that serves the app and workers

Exit criteria:

- Supabase project exists and is designated as the Archie Bravo backend
- Hostinger runtime can be configured to point at Supabase URLs/secrets

### Phase 1: Remove all customer-visible Paperclip identity

Replace upstream product identity everywhere a user can see it:

- browser title
- manifest/app name
- auth page name and copy
- account menu labels
- docs/help links
- empty states
- onboarding language
- any public product wording that says Paperclip

This phase must make the app *feel* like Archie Bravo even before deeper product redesign.

Exit criteria:

- no user-facing `Paperclip` branding remains in primary production flows
- the app reads as Archie Bravo from first load through sign-in and signed-in navigation

### Phase 2: Move the database from VPS-managed Postgres to Supabase Postgres

Replace the current VPS Postgres container as the app database source of truth:

- configure the runtime to use Supabase Postgres
- keep migration/runtime connection separation where needed
- validate schema creation against the new Supabase project
- preserve company/workspace-scoped behavior

This phase changes **where the data lives**, not the product model.

Exit criteria:

- the app reads and writes successfully against Supabase Postgres
- the Hostinger Postgres container is no longer the primary app database for Archie Bravo

### Phase 3: Replace Better Auth with Supabase Auth

Move human login/session management to the backend you actually want to operate:

- add Supabase Auth as the public auth provider
- support:
  - Google OAuth
  - email/password
- make Supabase user ID the canonical human principal ID
- update session resolution so the app trusts Supabase-authenticated users
- keep the existing account/profile/company membership model conceptually intact where possible

This phase changes **who authenticates the user**, not yet the whole product shell.

Exit criteria:

- new users can sign in via Supabase Auth
- session lifecycle works correctly on the Archie Bravo domain
- signed-in identity is visible and reliable in-app

### Phase 4: Replace the bootstrap/invite-first public entry model

Remove the feeling that the app is a private operator instance.

Public behavior should become:

1. User lands on Archie Bravo
2. User signs up
3. App creates one personal workspace automatically
4. User enters that workspace directly

Implications:

- first-use should not depend on invite flows
- bootstrap/admin-only setup must stay an operator concern, not a customer concern
- invite-based flows can remain internally for future collaboration, but not as the main public path

Exit criteria:

- random new public users can create accounts without admin intervention
- they do not need an invite to start using the product

### Phase 5: Add clear identity and workspace visibility

Make the app understandable to the operator and the user:

- show who is signed in
- show what workspace/company they are in
- make ownership obvious
- make the account/workspace relationship inspectable

This phase is important because the current panic comes partly from not being able to see who owns what.

Exit criteria:

- the signed-in user is obvious
- the current workspace is obvious
- owner/workspace creation is inspectable from both the app and Supabase

### Phase 6: Cut over the Archie Bravo runtime

Once branding, Supabase DB, Supabase Auth, and public signup all work:

- update the production runtime env to use the Archie Bravo Supabase backend
- deploy the new Archie Bravo-owned build to Hostinger
- verify the live app against a clean Archie Bravo signup

Exit criteria:

- Hostinger serves the Archie Bravo app
- Supabase is the system of record
- new user signup works end to end in production

## Product Behavior After Phase 1

After this phase, the product should behave like this:

- user goes to Archie Bravo
- user sees Archie Bravo branding only
- user signs in with Google or email/password
- Archie Bravo creates one workspace for them automatically
- user lands in their own workspace
- user does not need an invite
- operator can inspect auth/users/data inside Supabase

## Test Plan

### Branding

- no Paperclip wording appears in production auth, menus, browser metadata, or primary landing/signed-in flows
- Archie Bravo logo/name appear consistently

### Auth

- Google sign-up works
- email/password sign-up works
- sign-in/out works
- sessions persist correctly on refresh

### Workspace creation

- a brand-new signup automatically creates one workspace
- the new user is the owner/member of that workspace
- the user lands inside that workspace immediately

### Isolation

- user A cannot access user B's workspace data
- separate signups create separate workspaces

### Data/backend

- app reads and writes correctly against Supabase Postgres
- operator can see users, auth records, and app data through Supabase
- Hostinger runtime no longer depends on local-only or VPS-only DB ownership for Archie Bravo

### Runtime compatibility

- agent creation still works
- heartbeat still works
- Codex/OpenAI execution still works after the backend cutover

## Implementation Defaults

Use these defaults unless a later decision explicitly changes them:

- one signup creates one personal workspace automatically
- no teammate invites in phase 1
- no migration of the current validation data
- no attempt to redesign the whole UI shell before ownership is fixed
- internal `paperclip` symbols may stay temporarily if they are not customer-visible

## Recommended Order

Implement in this order:

1. Supabase project creation and backend ownership setup
2. branding removal and Archie Bravo identity pass
3. database cutover to Supabase Postgres
4. auth cutover to Supabase Auth
5. public self-serve signup + auto-workspace creation
6. identity/workspace visibility improvements
7. production cutover and verification

Reasoning:

- branding alone will make the product feel better, but not solve backend ownership anxiety
- backend migration alone will not solve the customer-visible Paperclip problem
- the first phase must solve both: **what the user sees** and **what the operator can manage**
