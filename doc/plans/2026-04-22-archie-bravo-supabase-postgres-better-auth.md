# Archie Bravo Supabase Postgres + Better Auth Plan

Date: 2026-04-22
Related docs:
- `doc/plans/2026-04-22-archie-bravo-ownership-phase-1.md`
- `doc/DATABASE.md`
- `server/src/auth/better-auth.ts`
- `packages/db/src/client.ts`

## Purpose

Move Archie Bravo to a backend that feels owned and inspectable without taking on a full auth rewrite.

This plan chooses the low-risk path:

- move the app database from the Hostinger Postgres container to **Supabase Postgres**
- keep **Better Auth** as the app's login/session engine for now
- keep Hostinger as the runtime that serves the app
- do not switch to Supabase Auth in this phase

This plan supersedes the database/auth direction in `2026-04-22-archie-bravo-ownership-phase-1.md`.

## Decision Summary

The following decisions are locked for this phase:

1. **Database host:** Supabase Postgres
2. **Auth engine:** Better Auth stays
3. **Runtime host:** Hostinger stays
4. **Current validation data:** disposable unless a later migration is explicitly requested
5. **Operator control plane for data:** Supabase dashboard
6. **Operator control plane for runtime:** Hostinger
7. **Supabase Auth:** explicitly out of scope for this phase

## What This Actually Means

After this cutover:

- users still sign into Archie Bravo through the app
- Better Auth still creates and validates sessions
- Better Auth still writes to the app's auth tables
- those auth tables now live in **Supabase Postgres**
- the rest of the app tables also live in **Supabase Postgres**
- Hostinger only runs the app containers

This is not "Supabase Auth."

This is:

- **Supabase as managed Postgres**
- **Better Auth as the login/session layer**

## Why This Path

This is the best middle ground because:

- it gives the operator a real backend dashboard immediately
- it preserves the current working auth implementation
- it avoids rewriting login/session plumbing while the product is still being reshaped
- the repo is already built around PostgreSQL and Drizzle
- the codebase already documents Supabase as a supported hosted Postgres target

## Target Architecture

### Before

- Hostinger VPS
- Archie Bravo app container
- Postgres container on the same VPS
- Better Auth writing into the VPS database

### After

- Hostinger VPS
- Archie Bravo app container
- Supabase Postgres as the system of record
- Better Auth writing into Supabase Postgres

## Important Operator Clarification

With this plan, you will manage data in two different places:

### Hostinger manages

- containers
- runtime environment variables
- reverse proxy / domain / SSL
- server restarts and deployment

### Supabase manages

- the Postgres database
- table browsing
- SQL editor
- row inspection
- backups / project-level database operations

### The Archie Bravo app itself still manages

- sign up and sign in flow
- session cookies
- workspace creation
- memberships
- app logic

## What You Will See In Supabase

Because this plan keeps Better Auth, user and session data will exist as normal application tables.

Examples:

- `user`
- `session`
- `account`
- `verification`
- `company_memberships`
- the rest of the Archie Bravo application tables

Important:

- you will **not** manage users through the Supabase Auth dashboard in this phase
- you will manage them through the **database tables** in Supabase
- that is expected because Better Auth remains the auth engine

## Risks

### Low-risk items

- changing the database host from VPS Postgres to Supabase Postgres
- keeping the same Drizzle schema
- keeping Better Auth
- keeping the same app session model

### Main technical risks

- Supabase pooled runtime connections may require disabling prepared statements
- runtime and migration URLs must be configured correctly
- SSL / connection-string mistakes can break startup
- if current validation data matters, migration work adds complexity
- network dependency increases because the app and DB are now on separate hosts

### Explicitly avoided risk

This plan avoids the highest-risk move:

- replacing Better Auth with Supabase Auth during the same phase

That rewrite would affect:

- login flow
- session issuance
- callback handling
- principal/user mapping
- existing auth tables and session expectations

## Success Criteria

This phase is successful when:

- the live Archie Bravo app runs against Supabase Postgres
- Better Auth sign-in still works
- session persistence still works
- app data and auth data are visible in Supabase
- the Hostinger Postgres container is no longer the primary system of record
- agent creation and heartbeat still work after the cutover

## Non-Goals

Do not include these in this phase:

- Supabase Auth migration
- Google OAuth rollout unless explicitly added as a Better Auth provider later
- layout redesign
- billing
- invites/collaboration redesign
- deep internal renaming of package names or env prefixes

## Build Plan

### Phase 0: Lock the architecture decision

Confirm the backend split:

- Hostinger is runtime only
- Supabase is database only
- Better Auth stays

Exit criteria:

- the project treats Supabase as managed Postgres, not as the auth provider
- no work in this phase assumes a Supabase Auth rewrite

### Phase 1: Create the Archie Bravo Supabase project

Provision a new clean Supabase project for Archie Bravo:

- create the project
- store the direct database connection URL
- store the pooled runtime connection URL
- store project references and passwords securely

Exit criteria:

- Supabase project exists
- the runtime URL and migration URL are available

### Phase 2: Make the DB client Supabase-safe

Patch the runtime DB client so it works correctly with Supabase pooling.

The repo already notes the likely requirement:

- pooled runtime URL for app traffic
- direct URL for migrations
- disable prepared statements where Supabase pooled runtime requires it

Work in this phase:

- update the DB client behavior for Supabase pooled runtime
- keep migration code compatible with the direct connection URL
- avoid changing the schema model itself

Exit criteria:

- the app can connect reliably to Supabase in development or staging config

### Phase 3: Provision the schema in Supabase

Initialize the new Supabase database using the existing Drizzle schema/migration path.

Work in this phase:

- run migrations against the direct connection URL
- validate that auth tables and app tables are created correctly
- verify the migration journal exists and is consistent

Exit criteria:

- Supabase contains the full Archie Bravo schema
- schema setup is repeatable from repo commands

### Phase 4: Point the app at Supabase

Change the runtime environment so the app uses Supabase Postgres:

- `DATABASE_URL` becomes the Supabase pooled runtime URL
- `DATABASE_MIGRATION_URL` becomes the Supabase direct connection URL
- keep `BETTER_AUTH_SECRET`
- keep existing app/auth runtime settings

Exit criteria:

- local and/or staging app starts successfully against Supabase
- sign-in works against Supabase-backed tables

### Phase 5: Verify Better Auth on Supabase

Prove that Better Auth still works when its tables live in Supabase.

Test:

- sign up
- sign in
- sign out
- session refresh
- session persistence across reloads

Operator verification:

- inspect the `user`, `session`, `account`, and `verification` tables in Supabase
- confirm the app is writing there instead of the VPS Postgres container

Exit criteria:

- Better Auth works unchanged from the user's point of view
- the operator can see the auth data in Supabase

### Phase 6: Cut over the live Hostinger runtime

Deploy the production Archie Bravo app with Supabase-backed Postgres.

Work in this phase:

- update Hostinger env vars
- redeploy the app
- verify app health
- verify sign-in
- verify workspace creation
- verify agent heartbeat

Exit criteria:

- production Hostinger runtime uses Supabase Postgres successfully
- old VPS Postgres container is no longer the primary DB

### Phase 7: Decommission or retain the VPS Postgres container intentionally

Do not leave the old VPS database in an ambiguous state.

Choose one:

- remove it from the production stack after confidence is high
- or keep it temporarily as rollback infrastructure with clear labeling

Exit criteria:

- there is no confusion about which database is canonical

## Environment Model

### Runtime variables

- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `BETTER_AUTH_SECRET`
- existing public URL and deployment env vars

### Expected Supabase usage

- runtime app traffic uses the pooled URL
- migrations and one-off schema work use the direct URL

## Operator Experience After This Phase

After this cutover, the operator workflow should feel like this:

1. deploy Archie Bravo from Hostinger
2. open Supabase to inspect users, sessions, memberships, and app rows
3. use Hostinger only for deployment/runtime concerns
4. stop thinking of the database as hidden inside the VPS

This does not yet give you a polished Archie Bravo admin UI, but it does give you a clear backend source of truth you can see.

## Test Plan

### Database

- the app starts with Supabase runtime env vars
- migrations apply cleanly with the direct connection URL
- the schema matches the expected Drizzle tables

### Auth

- email/password sign-up works if enabled
- sign-in works
- sign-out works
- sessions survive reload
- Better Auth rows appear in Supabase tables

### App behavior

- workspace/company creation still works
- memberships still work
- issues/projects still read and write
- agent creation still works
- heartbeat still works

### Production sanity

- `/api/health` stays healthy after cutover
- no mixed-origin or cookie breakage appears
- no old runtime path is still writing to the VPS Postgres container by mistake

## Recommended Order Relative To The UI Rebrand

Implement in this order:

1. Archie Bravo branding pass in the UI
2. Supabase project creation
3. Supabase-safe DB client patch
4. schema setup in Supabase
5. runtime env cutover
6. verification

Reasoning:

- the rebrand can begin immediately and does not block the backend move
- the backend move should happen before any big auth rewrite ideas appear
- once Supabase is in place, backend ownership anxiety drops without destabilizing login
