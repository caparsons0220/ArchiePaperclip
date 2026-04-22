# Archie Bravo — MVP Spec

_Created: 2026-04-17_
_Clean MVP spec. Supersedes `archie/Archie.md` for the platform vision. Old file is historical reference only._

**Tech stack:** Next.js (React) web app. Supabase (Postgres + pgvector). Fly.io always-on runtime. Web-first.

## What This Is

**Archie Bravo is where you hire an autonomous company.**

Not a business builder. Not a Shopify. Not a CRM with AI. A platform where users pick a company they want to exist — from a single AI employee to an entire SaaS platform or marketplace — and Archie builds it, runs it, and keeps running it 24/7.

The closest analogies:
- **Lovable**, but for running businesses — not just building UIs.
- **Y Combinator**, but the AI is the founder and operator.
- **OpenClaw**, but pointed at businesses and marketplaces instead of dev work.

Users browse templates in the North Stars gallery, pick one at whatever scope they want (from a single Call Handler role all the way up to a full agent marketplace platform), Archie scaffolds + runs it, user watches and iterates.

## The Thesis

**If I can build it, the AI can build it.**

We don't hard-code business logic. We don't hard-code customer dashboards. We don't hard-code error monitoring UIs. We don't hard-code testing frameworks. We don't hard-code security review flows.

Archie does all of that. Because Archie is powerful enough to build the app, Archie is also powerful enough to test it, review it, secure it, debug it, and roll it back when needed. Every "concern" we'd normally build a feature for is really just a **prompting pattern** we bake into Archie's workflow.

Our job:
1. **Runtime** — OpenClaw-style coordinator + worker loop (already have)
2. **Tool access** — Claude plugins, Cursor plugins, MCP servers (Supabase, Vercel, GitHub, Stripe, etc.)
3. **UI surfaces** — places for Archie to write/read state (Canvas, Journal, Agenda, Brain, Decisions)
4. **Prompting patterns** — the Archie-operating-principles that enforce testing, review, security, rollback
5. **Starter shells** — 3-5 working baseline apps so users get instant value

That's the whole product.

## Engine

Built on **OpenClaw architectural patterns** — heartbeat, memory (tool-first), context discipline, cron, same-runtime-different-contract, noop tokens. Adapted onto Supabase + Fly. Detail in [OPENCLAW_SOURCE_OF_TRUTH_BUILD_DOC.md](./OPENCLAW_SOURCE_OF_TRUTH_BUILD_DOC.md).

## What Makes Archie Alive (Not a Chatbot)

This is the story for the landing page, the onboarding, and every pitch. Archie is different because he has behaviors that only make sense for a living employee — not a tool.

### Living Behaviors (Always On)

These are baked into Archie's operating prompts for every North Star. They're not features the user configures — they're the personality contract.

| Behavior | What It Looks Like |
|---|---|
| **Initiative** | Texts the user first. Not notifications — actual messages with context. "Saw the coordinator plan stall on the pricing page. Want me to push it to tomorrow?" |
| **Opinion** | Has actual takes. Can disagree with the user — respectfully, with data. Opinion strength is user-configurable. |
| **Curiosity** | Asks questions to improve itself. Tries to understand the user's thinking so it serves them better next time. |
| **Anticipation** | Learns patterns and has things ready before the user asks. Knows this user hates long reports — gives the 3-line version. |
| **Self-Assessment** | Knows where it's confident and where it's not. The opposite of an AI that confidently bullshits. |
| **Rhythm** | Develops a communication cadence matching the user's life. Learns when they're responsive vs. "don't bother me" mode. |
| **Accountability** | Reports ROI, admits mistakes, tracks goal progress. "I scored that lead at 84 and it went cold — adding title-search as a required step." |
| **Growth** | Tells the user when it's improved. "We've shipped 3 features together. Here's what I've learned about how you ship." |
| **Load Awareness** | Communicates bandwidth. "I'm running 14 active agenda items for this business. If you want me to pick up a new project, something has to drop." |
| **Dream / Consolidation** | During quiet hours, consolidates memories: prunes stale facts, resolves contradictions, strengthens patterns, writes narrative summaries. |

### Adaptive Sleep *HOLD OFF FOR NOW*

Archie decides his own wake times. User-set cron is a default ceiling, not a floor.
- Nothing happening → "Wake me in 2 hours."
- Hot signal (user message, webhook, inbound lead) → "Wake in 5 minutes."
- Behind on a goal → "Wake every 15 minutes until caught up."
- Quiet hours → "Wake at 7am for morning briefing."
- Between agenda items → sleep until next scheduled time.

Cost result: most hours of the day cost ~$0 because Archie is asleep. Only wakes when there's actually work or signal. See "What Keeps It From Spiraling" in the Coordinator + Worker section.

### Memory Consolidation (Dream Cycle) *deferred for now* 

During quiet hours (user-configurable window), Archie runs a 4-phase consolidation:
1. **Orient** — read existing memories
2. **Gather** — scan today's activity for new signal
3. **Consolidate** — merge, update, resolve contradictions, write narrative summaries of what happened
4. **Prune** — deduplicate, archive stale entries, condense verbose ones

Result: the longer a user runs a North Star, the smarter Archie gets about it. He remembers patterns, contacts, preferences, what worked, what didn't. Stored in the Brain (global) and per-NS memory.

### Focus Awareness

Archie notices whether the user is active in-app or away, and adjusts:
- **User in-app** → Archie is collaborative. Asks before acting. Surfaces thoughts in chat.
- **User away** → Archie is autonomous within trust bounds. Batches updates. Sends a single briefing instead of peppering notifications.

### @train — Archie Learns From You

Users can teach Archie via corrections: "@train Don't use the aggressive follow-up template for that zip code." Archie stores the correction, updates the relevant playbook, logs the impact.

Over months, Archie's playbooks evolve to match the user's preferences. Visible in Brain → Memory → Corrections log, so the user can see what they've taught and revert if needed.




Response times, model used, tools called, durations are attached to every entry. Nothing is hidden.

## Archie Cloud — Per-Business Backend (Optional, Opt-In)

We give users a **choice** at template selection time:

1. **Archie Cloud (managed)** — Archie provisions a dedicated Supabase project + Vercel project + GitHub repo for this North Star. We manage the infrastructure. User pays us a monthly fee that covers infra + margin. Same model as Lovable Cloud.
2. **Bring Your Own (BYO)** — User connects their own Supabase + Vercel + GitHub accounts via OAuth. Archie builds into their infra. User pays us for the Archie Bravo platform only, no infra markup.

Both paths work identically from Archie's perspective — same code, same deployment flow, same runtime. The only difference is whose Supabase/Vercel/GitHub credentials Archie uses under the hood. User picks on the template setup screen. Can change later (detach from Archie Cloud → self-manage, or vice versa).

### Why Per-Project (Regardless of Which Path)

Whether managed by us or owned by the user, every North Star still gets **its own Supabase project** (not a shared one):

- **Data isolation** — one business's customers, orders, content are fully isolated from another
- **Portability** — user can detach or take their data and leave at any time
- **Trust** — "this business has its own database" holds up for sensitive verticals (legal, finance, health)
- **Scale** — each business scales independently; no noisy-neighbor risk
- **Clean RLS** — row-level security is simpler when nothing is cross-business

### Archie Cloud Flow (User Picks Managed)

1. User picks a template → chooses **Archie Cloud**.
2. Archie provisions under our Supabase/Vercel/GitHub orgs:
   - A new Supabase project in the user's region (or closest)
   - Default schema + RLS + auth + storage for that template
   - A new Vercel project with env vars wired to Supabase
   - A new GitHub repo for version history + rollback
3. Archie writes Edge Functions for server-side logic.
4. Archie deploys the starter shell; user sees it running in seconds.
5. User is billed monthly through Archie Bravo — includes infra + AI runtime + platform fee.

### BYO Flow (User Picks Own Infra)

1. User picks a template → chooses **BYO**.
2. Prompted to connect via OAuth: their Supabase org, Vercel team, GitHub account.
3. Archie provisions into the user's own orgs (same resources, same scaffolding, just using their credentials).
4. User pays for Archie Bravo platform only. Their Supabase/Vercel/GitHub bills come directly from those providers.

### Ownership + Portability (Both Paths)

Users always own the code and data Archie builds. Explicitly:
- **Archie Cloud path:** on export/cancel, we hand over clean credentials + transfer ownership of the Supabase project, Vercel project, and GitHub repo to the user's own orgs. No lock-in.
- **BYO path:** user already owns everything. We just disconnect.

### Pricing Logic (Rough, To Be Finalized)

**Archie Cloud tier (managed infra included):**
- Starter — 1 North Star, small Supabase → ~$49/mo
- Growth — 3 North Stars, standard Supabase → ~$149/mo
- Scale — 10 North Stars, priority infra → ~$499/mo
- Overage: pay-as-you-go per extra North Star

**BYO tier (platform only, no infra markup):**
- Indie — 1 North Star → ~$19/mo
- Builder — unlimited North Stars → ~$49/mo
- User pays Supabase/Vercel/GitHub directly

Exact numbers settle later. **Archie Cloud is a feature, not a forced default.** Power users and bigger teams often prefer BYO; solo founders and non-technical users prefer Archie Cloud because they never want to see a dashboard on three different providers.

### What Archie Provisions Per Business

| Resource | Archie Cloud Path | BYO Path |
|---|---|---|
| Supabase project | Ours, transferable on export | User's own org from day one |
| Vercel project | Ours, transferable on export | User's own team from day one |
| GitHub repo | Ours, admin granted to user | User's own account from day one |
| Domain (optional) | Archie provisions via Vercel, or user-provided | User-provided |
| Payments (Stripe) | See "Archie Cloud Pay" below | See "BYO Stripe" below |

## Archie Cloud Pay — Optional, Opt-In Managed Payments

Extending the Archie Cloud model to payments. User picks at template setup (or later), same way they pick Archie Cloud vs BYO for infra. Two paths:

### Path 1 — Archie Cloud Pay (Managed via Stripe Connect Express)

Archie provisions a **Stripe Connect Express account** on the user's behalf. Pattern used by Shopify Payments, Uber, DoorDash.

- User clicks "Enable Payments" in their North Star
- ~3-minute Stripe onboarding inside the app (ID, phone, bank)
- Stripe handles KYC / AML / 1099s / chargebacks
- End customers pay through Archie Bravo's platform
- Money routes to user's Stripe Connect account (Stripe holds, not us)
- Stripe pays out to user's bank on normal schedule
- **We take an application fee on every transaction** (e.g., 1–3% on top of Stripe's 2.9% + 30¢)

**What we're NOT:**
- Not a money transmitter (Stripe holds the money)
- Not the Merchant of Record (user's Connect account is)
- Not holding user funds

**What we DO:**
- Sign Stripe's platform agreement
- Potentially register as a Payment Facilitator as volume grows
- Moderate connected accounts for fraud/abuse (standard platform responsibility)

### Path 2 — BYO Stripe

User connects their existing Stripe account via OAuth. Same as today's model.

- Money routes straight to user's own Stripe
- We never touch transactions
- We only charge Archie Bravo platform fees
- User handles their own Stripe relationship, tax filings, etc.

### Which Path For Which User

| User Type | Likely Picks |
|---|---|
| Non-technical solo founder launching first business | Archie Cloud Pay (frictionless) |
| Established business owner already on Stripe | BYO Stripe |
| International user in Connect-supported country | Either |
| High-volume user wanting full Stripe control | BYO Stripe |
| Template where payments are core (SaaS, marketplace, digital product) | Archie Cloud Pay by default, toggle to BYO |
| Template where payments are optional (content site, role-only) | Skip payments entirely or add later |

### Pricing Structure

**Archie Cloud Pay fees:**
- End customer pays: standard Stripe processing (2.9% + 30¢) + our application fee (1–3%)
- User receives: payout minus all platform fees
- We receive: our application fee, minus Stripe's Connect platform fee (0.25% + $2/active account/month)

For a user doing $10k/mo in revenue: we net ~$100–$300/mo per North Star in payment margin. Recurring, scales with their success.

**BYO Stripe fees:**
- User pays Stripe directly (2.9% + 30¢)
- We take nothing on transactions
- User just pays us the Archie Bravo platform subscription

### Transparency Rule

**Archie Bravo never holds customer money in either path.** On Archie Cloud Pay, Stripe holds it and pays out to the user's Connect account. On BYO, money never enters our orbit. Our revenue in the managed case is an application fee Stripe collects and remits to us — clean accounting, no money-transmitter risk.

### Failure Modes To Plan For

1. **User can't pass Stripe KYC** → fallback to BYO path or skip payments
2. **Country not supported by Connect** → BYO or skip
3. **Fraud on connected accounts** → moderation tooling, Stripe risk scoring, pause/review flow
4. **Chargebacks** → Stripe handles, but platform may need to respond to patterns
5. **Tax obligations** → user's own (Stripe handles 1099s to IRS; user handles state/international sales tax)

## Archie's Toolkit (Plugins + MCP)

Archie operates through existing plugins and MCP servers. We do not wrap these. Archie calls them directly.

| Capability | How Archie Does It |
|---|---|
| Database (CRUD, migrations, RLS) | Supabase plugin / MCP |
| Deploy (push, preview, production) | Vercel plugin / MCP |
| Code (commit, branch, PR, diff, rollback) | GitHub plugin / MCP |
| Payments (products, checkout, webhooks) | Stripe plugin / MCP |
| Auth primitives | Supabase Auth / Clerk (plugins) |
| Error monitoring | Sentry plugin when needed |
| Email | Postmark |
| Voice | OpenAI Realtime, Twilio Realtime, ElevenLabs, Retell |
| CRM | FUB, HubSpot plugins |
| Browser automation | Browserbase + Stagehand |
| Long-tail integrations | Zapier MCP + user-brought MCP |

Archie writes tests. Archie runs smoke checks. Archie deploys to preview before production. Archie rolls back via git when something breaks. Archie wires Sentry when he ships something user-facing. **All of this is prompting, not platform features.**

## The 5-Tab MVP Side Menu

```
🏠 Home            ← omni Archie chat (default landing)
★ North Stars      ← create & manage businesses
🧠 Brain           ← global memory
📓 Journal         ← Archie's live activity (all projects)
⚙️ Settings        ← billing, integrations, help, account
```

That's it. Agenda, Decisions, and Canvas all live inside a North Star's detail view because they're per-business. 5 primary tabs.

## Inside a North Star (Detail View)

When a user clicks a North Star, they land on the **Overview** — a dashboard of what Archie is doing. The document editor is behind an Edit button, not the whole screen.

**Sub-views inside a North Star:**

| View | What It Shows |
|---|---|
| **Overview** (default landing) | Dashboard — what Archie did today, status, live metrics, quick actions (pause, start now, edit doc), recent activity. |
| **Document** (Edit button) | The Business Manual / Operations Manual / Mission / Routine / App Spec. Three-panel editor — outline / rich text / Archie chat. |
| **Canvas** | The Lovable-style code editor where the AI-built app lives. Monaco + live Vercel preview + file tree + Archie-controlled edits. Git-backed. Archie builds and iterates the actual app the business needs. |
| **Agents** | Bundle list. Add/edit/pause coordinator+worker bundles. Each bundle = one coordinator + one worker (can't have one without the other). |
| **Agenda** | Scoped agenda items for this North Star. |
| **Journal** | Scoped Archie activity + Decisions sub-view. |

Toggle between Overview (the dashboard) and Canvas (the builder) as the two primary modes.

## The Four Template Tiers

Templates live in the North Stars gallery, browsable by tier. Same runtime underneath — different scope, different ambition. Users pick what matches how big they want to go.

### Tier 1 — Platforms

Archie builds AND operates entire SaaS platforms, marketplaces, or tools that **other users pay to use**. User picks one, Archie scaffolds a multi-sided product, deploys it, manages signups, runs the marketplace flywheel, handles moderation, billing, support — everything.

Examples:
- **AgentHub** — AI agent marketplace where users buy/sell/rent ready-made agents
- **FlowForge** — No-code workflow automation platform (Zapier competitor)
- **NicheMart** — Vertical marketplace (user picks niche at signup)
- **VoiceForge** — Voice-agent-as-a-service SaaS
- **GigVault** — Freelance gig marketplace
- **PrintForge** — Print-on-demand marketplace
- **DocForge** — Doc collab platform with AI copilot
- **CreatorHub** — Creator economy platform with fan subscriptions

The wild tier. Not "AI newsletter" — "Archie builds and runs your Zapier competitor."

### Tier 2 — Businesses

Archie owns end-to-end running of a full digital business. One operator, no external users paying to use a platform — Archie IS the operator.

Examples:
- **Pulse** — Niche content empire (network of SEO blogs + newsletters)
- **RepurposeAI** — Content repurposing agency turning 1 piece into 100+ assets
- **CampaignForge** — Full-service AI marketing agency
- **TalentForge** — AI recruiting & headhunting agency
- **LeadForge** — AI lead gen & outreach agency
- **InsightForge** — Subscription market-analysis newsletter
- **AcademyForge** — On-demand AI course creator + seller
- **Apex** — Full-service AI automation agency for SMBs

### Tier 3 — Services

Archie owns all ops (intake, booking, invoicing, CRM, follow-ups), the **user delivers the actual craft** (coaching calls, design work, the shoot). Split labor with Archie doing all non-craft parts.

Examples:
- **Life Coaching Practice** — Archie handles intake, booking, onboarding, follow-ups; you run sessions
- **Freelance Design Studio** — Archie handles inquiries, quotes, deadlines, delivery; you design
- **Video Editing Service** — Archie handles uploads, revisions, comms, delivery; you edit
- **Photography Booking Service** — Archie books shoots, contracts, deposits; you shoot
- **Salon / Spa Booking System** — Archie handles calls, bookings, reminders, upsells; you provide service
- **Tax Prep Practice** — Archie gathers docs, books calls, tracks deadlines; you file

### Tier 4 — Roles

Archie plugs into an **existing business** as one specialized AI employee. Narrowest scope. Fastest time-to-value for users who aren't ready to onboard an entire business.

Examples:
- **24/7 Inbound Voice Call Handler** — Answers every call via Twilio, qualifies, books, logs to CRM
- **Outbound Appointment Setter** — Runs cold call/SMS sequences, books meetings
- **No-Show & Reschedule Specialist** — Detects missed appointments, calls/texts to reschedule
- **Live Chat + Voice Escalation Agent** — Handles web chat, escalates to voice when needed
- **Lead Qualifier & Nurturer** — Scores leads, runs nurture sequences, hands off hot ones
- **Ticket Resolution Agent** — Owns helpdesk, resolves common issues, escalates the rest
- **Review & Testimonial Collector** — Auto-asks after jobs, posts reviews to your site
- **Content Repurposer** — Takes one piece, makes 20+ assets

### The Tier Ramp

The four tiers are a ramp from **narrow + instant value** to **wide + ambitious outcome**:

```
Roles         (1 employee slot)          → instant value, low risk
Services      (ops + user-delivered craft) → split labor with Archie
Businesses    (full digital business)    → Archie runs it all
Platforms     (multi-sided product)      → Archie builds the whole SaaS
```

Users can mix. A solo realtor might start with a Role (Inbound Call Handler), then add a Service (Listing Description Service), then graduate to a Business (Property Research Empire). Same runtime, same user, growing ambition.

## Template Card Format

Every template in the gallery uses this canonical structure. Each field is load-bearing.

| Field | What It Contains |
|---|---|
| **Title** | The name — branded, memorable (FlowForge, LeadForge, AgentHub, etc.) |
| **Tier** | Platform / Business / Service / Role |
| **Demo Preview** | **Live, interactive scaffold.** Not a screenshot. Users can click around the preview before committing. E.g., click through a sample workflow builder, simulate a booking call, tour the dashboard. This is Lovable-style template browsing. |
| **Description** | One-line hook. What the template does, who it's for. |
| **What Archie Handles** | Concrete bullets of end-to-end ownership. Bullets should be specific actions, not vague claims. |
| **Key Features** | The product capabilities users get when they pick this template. |
| **Requirements** | **The trust line.** What the USER does (vs what Archie owns). "None — Archie runs end-to-end" is a completely different pitch than "You deliver the coaching sessions." Must be honest. |
| **Integrations** | Three tiers: **Required** (template won't work without), **Recommended** (highly useful), **Helpful if approved** (gated things like Twilio SMS / Gmail — unlock more capability if the user can get approved). |
| **Revenue Model** | How the business actually makes money. Freemium tiers, commission %, subscription price, per-unit. |
| **Business Operating Manual** | Auto-filled by Archie on launch using the template's defaults + the user's clarifying-question answers. Editable in the UI (three-panel editor). |

### Why Requirements + Integrations Tiering Matters

- **"Requirements: None"** sells the autonomous pitch. Users pick these when they want a hands-off business.
- **"Requirements: You deliver the shoot"** is honest about the Service tier — sets expectations so users aren't surprised.
- **Required integrations** block launch if missing. We tell the user up front what they need.
- **Recommended integrations** make Archie better but he can work without them (Zapier fallback).
- **Helpful if approved** is the growth path. "If you can get Twilio A2P approved, Archie unlocks SMS outreach." Turns integration friction into an explicit capability upgrade.

## The North Stars Flow

1. User opens **North Stars** tab, browses the gallery (filterable by tier: Platform / Business / Service / Role).
2. User picks a template. Demo Preview opens, they click around the live scaffold.
3. User clicks **Use This Template**.
4. Archie asks clarifying questions specific to that template (name, brand voice, target customer, specific config).
5. Archie generates the **Business Operating Manual** pre-filled with the template's defaults + user answers.
6. Archie scaffolds the Canvas (Lovable-style — real working app in seconds, not 10-minute generation from scratch).
7. User iterates on both the Operating Manual AND the Canvas with Archie.
8. User clicks **Add Agents** → configures coordinator+worker bundles (can start with one Auto bundle).
9. User hits **Start**. Coordinator wakes on cron. 24/7 loop begins.

## Agent Bundles

**Bundle = coordinator + worker together.** Always both — can't have one without the other. Click Add, both are created.

Per-bundle config:

| Control | Details |
|---|---|
| **Pause / Start Now** | Toggle + manual wake |
| **Focus** | North Star (whole doc) / Developer / Customer Service / Business Admin / Researcher / Custom (opens a focus mini-doc builder) |
| **Cron** | Default / Every hour / Daily / Weekly / Custom cron |
| **Coordinator Model** | Provider + model dropdown |
| **Worker Model** | Provider + model dropdown |
| **Trust Level** | Always ask / Auto with limits / Full auto / Smart auto |
| **Voice (optional)** | Phone config if this bundle handles calls |
| **Tool Permissions** | Which plugins/integrations this bundle can use |
| **Bundle Activity** | Recent wakes, outcomes, journal entries — visible on the same screen |

Multiple bundles per North Star, concurrent, different focuses. A newsletter business might have an Auto bundle + a Customer Service bundle + a Developer bundle all running on different crons.

## The Coordinator + Worker Model

### The Mental Model

Think of it like a real business with one manager and specialized employees.

- **Coordinator = the manager.** Plans the work. Assigns it. Reviews what's done. Adjusts the plan when things change. Doesn't actually do the work.
- **Worker = the employee.** Executes one specific task it was assigned. Reports back. Doesn't decide what to work on.

Both use the same runtime engine. The difference is what system prompt they run under and which model they're using. One business can have multiple coordinator+worker bundles running in parallel — one for customer service, one for development, one for marketing — each focused on a different area.

### The Coordinator

**Role:** Plans. Does not execute.

**When it wakes:**
- On cron (whatever cadence the user set — default every 30 min)
- When something interrupts it (user sends a message, webhook fires, worker returns needs-replan, integration signals new data)
- When the user clicks "Run Coordinator Now"

**What it reads:**
- The Business Manual (the user's source-of-truth doc — this is authoritative)
- Current agenda state (what's pending, in-flight, blocked, recently completed)
- Recent journal entries (what workers and prior coordinator wakes said)
- Recent wake outcomes (structured results of last few cycles)
- Memory (tool-first — it searches when it needs to, does not bulk-load)
- Why it woke up (cron vs event vs manual)

**What it decides each cycle:**
1. **Nothing to do right now** → outputs a noop (MISSION_OK), extends sleep, goes quiet. Cheap outcome.
2. **New work needed** → writes agenda items with scheduled times. Each item has a plan (steps, success criteria, risks), a focus, a tool scope, and a worker model assignment.
3. **Existing plan needs adjustment** → updates or cancels pending agenda items (moves a 5pm task to 11am, cancels something no longer relevant).
4. **Strategy shifted** → updates a section of the Business Manual itself (rare, significant).
5. **Needs human input** → writes to Decisions with an open question + its recommendation + a "decide by" timestamp.

**What it writes to:**
- Agenda (creates, updates, cancels items)
- Journal (its own reasoning, narrative)
- Decisions (open questions with recommendations)
- Business Manual (only for strategic shifts)
- Memory (saves new learnings, asks project-scope vs global)

**What it does NOT do:**
- Execute work (no sending emails, no making calls, no shipping code)
- Call business-operation integrations directly (Stripe, Postmark, etc.)
- Touch customer-facing surfaces

**Before it sleeps:** Calls `set_next_wake` to decide when it should wake again. Usually the user's cron cadence, but can be sooner if there's a hot signal or later if the queue is fully planned out for hours.

**Model:** Expensive, rare. Opus 4.6 or GPT-5.4. Runs ~48 times per day per bundle (on 30-min cron). Cost per wake is high (~$0.30-$0.80 for full context + planning).

### The Worker

**Role:** Executes one bound agenda item. Does not plan.

**When it wakes:**
- When an agenda item's `scheduled_time` arrives
- When the coordinator explicitly triggers it
- Never on a bulk cron of its own — always tied to a specific item

**What it reads (narrow, not the firehose):**
- The bound agenda item (title, plan_json, tool scope, success criteria)
- Just enough context to execute that item
- Relevant memory, pulled via tool when needed
- The Business Manual section relevant to this item (not the whole doc — would waste tokens)

**What it does:**
- Executes the plan step by step
- Uses whatever tools/integrations are in its permitted tool scope (Stripe, Postmark, GitHub, Supabase, Browserbase, etc.)
- Writes outcomes to the journal as it goes (radical transparency — prompts, responses, response times, model, tools used)
- Marks the agenda item completed, blocked, or needs_replan when done

**What it outputs:**
- **Done** → item complete, results recorded.
- **Blocked** → item hit a blocker (missing integration, compliance flag, external dependency). Flags for the coordinator's next wake.
- **Needs replan** → item is stale or impossible as planned. Sends signal to wake the coordinator to replan.
- **Noop (BRIEF_OK)** → turns out nothing needed to happen. Silent exit.

**What it does NOT do:**
- Plan new agenda items
- Modify the Business Manual
- Rewrite the overall strategy
- Touch other agenda items

**Model:** Cheap, frequent. Sonnet 4.6, Haiku 4.5, or GPT-5.4-nano depending on task. Runs every time an agenda item fires — maybe 5-30 times per day per bundle. Low cost per wake (~$0.02-$0.05 for narrow context).

### How They Work Together (The Loop)

```
User sets 30-min coordinator cron on a bundle.

T+0 (9:00 AM)    Coordinator wakes
                 → reads Business Manual + agenda + recent outcomes + memory
                 → "Follow up with 3 stale leads, schedule for 2pm.
                    Push yesterday's pricing-page task from 11am to 4pm
                    since the shell deploy isn't stable yet."
                 → writes agenda items with scheduled_time + focus + tool_scope + plan_json
                 → calls set_next_wake(9:30am)
                 → sleeps

T+30 (9:30 AM)   Coordinator wakes again
                 → reviews state, new user message came in
                 → reprioritizes, updates agenda
                 → sleeps

T+2h (2:00 PM)   Worker wakes (agenda item scheduled_time arrives)
                 → loads bound item: "Follow up with 3 stale leads via Postmark"
                 → loads narrow context (leads from CRM, template, relevant memory)
                 → executes: drafts emails, sends via Postmark, logs each send
                 → writes journal entries as it goes
                 → marks item complete
                 → goes silent

T+2.5h (2:30)    Coordinator wakes
                 → sees completed item
                 → "Follow-ups sent. Check response rates tomorrow at 10am
                    before planning next outreach."
                 → writes new agenda item for 10am tomorrow
                 → sleeps

Loop repeats 24/7.
```

OpenClaw "same runtime, different contract" pattern. Coordinator = plan contract. Worker = execute contract.

### Why This Split Exists

**1. Cost.** Planning is rare and high-stakes — worth an expensive model (Opus/GPT-5.4). Execution is frequent and mostly mechanical — cheaper model (Haiku/Sonnet/nano) handles it fine. Running Opus on every execution wake costs ~5x more than coordinator-plans-worker-executes. At user scale, that's the difference between viable and bankrupt.

**2. Role clarity and auditability.** The coordinator has the authority to mutate strategy, agenda, and Business Manual. The worker only has authority to complete the bound item. This separation means agenda is never silently rewritten mid-execution, the plan is always legible, and the user can always trust "what the coordinator planned" as the source of truth for what the AI thinks it should do.

### Multiple Bundles Per Business

A business can have N bundles. Each bundle = one coordinator + one worker with a specific focus.

Example for a newsletter business:
- **Auto bundle** (focus: whole North Star) — general coordinator+worker on 30-min cron
- **Customer Service bundle** (focus: voice + email) — wakes on inbound events primarily
- **Developer bundle** (focus: Canvas / site) — wakes on code-related work

Each bundle's coordinator plans for its focus area. Each bundle's worker executes agenda items assigned to that bundle. They run in parallel, on their own crons, independently, but they all share:
- The same Business Manual
- The same memory
- The same journal (scoped entries)
- The same agenda table (filtered by bundle focus)

### What Keeps It From Spiraling (Cost + Safety Controls)

- **SQL gate** before any coordinator wake — if nothing's due and nothing's changed, skip the expensive LLM call entirely. Free. Required for MVP.
- **Budget caps** — per-business daily/weekly/monthly ceilings. When hit, bundle sleeps.
- **Adaptive sleep** — coordinator sets its own next wake. Nothing planned for 4 hours? Sleep 4 hours. Hot signal? Wake in 5 min. User cron is a default, not a floor.
- **Scoped tool loading** — worker only loads the tools its bound item needs, not all 30 integrations. Saves 5-10k tokens per wake.
- **Prompt caching** — stable prefix (identity, Business Manual, tool schemas) cached at ~10% cost. Only variable suffix costs full rate.
- **Noop tokens** — when there's nothing to do, the wake exits cheaply without spamming the journal.
- **Triage gate** (optional v2) — Haiku check between SQL gate and full coordinator eval for ambiguous cases. Skip for MVP; add when cost data justifies it.

## Prompting Patterns (Not Platform Features)

The things that would normally require us to build dedicated UI/platform features are handled by prompting patterns injected into Archie's workflow. These live in his operating principles and are triggered by context.

| Concern | Prompting Pattern |
|---|---|
| Testing | Before shipping code, Archie runs tests. If failing, fixes. If no tests exist for this code path, writes them. |
| Security review | Before shipping auth or payment flows, Archie runs a self-review prompt with a security checklist. |
| Smoke checks | After deploy, Archie hits key endpoints via Browserbase or direct fetch and confirms they work. |
| Rollback | Every production deploy includes a git tag. If a post-deploy smoke check fails, Archie reverts and logs the incident. |
| Error monitoring | On first user-facing deploy, Archie wires Sentry and subscribes to critical alerts. |
| Destructive operations | Before dropping tables, deleting customers, or canceling subscriptions, Archie escalates to the user via Decisions. |
| Schema migrations | Archie never writes raw SQL against prod. Uses Supabase migration tool, commits the migration, applies staged first. |
| Secret handling | Archie never hardcodes API keys. Uses Vercel environment variables via Vercel plugin. |
| Quality threshold | Before declaring a feature "done," Archie reviews against the Business Manual's Definition of Done section. |
| User experience check | For customer-facing UI, Archie does a self-review pass ("would a first-time user understand this?") before marking shipped. |

**These are prompts, not code we write.** Built once into Archie's operating system prompts + triggered contextually. When Archie encounters a situation matching the pattern, the behavior fires.

## Starter Shells (The Scaffolding Behind Templates)

Templates are the user-facing product. Starter shells are the reusable Next.js codebases underneath them. Multiple templates share the same shell — a shell is an engineering primitive, a template is a product pitch.

Shells we ship at launch:

| Shell | Used By Templates |
|---|---|
| **SaaS Shell** | FlowForge, TaskPulse, DocForge, InboxZero, VoiceForge, micro-SaaS businesses, AI tool wrappers |
| **Marketplace Shell** | AgentHub, NicheMart, GigVault, PrintForge, ServiceSwap |
| **Content / Newsletter Shell** | Pulse, InsightForge, niche newsletter businesses |
| **Agency / Service Shell** | Apex, EchoSupport, VibeEdit, BotDeploy, CampaignForge, LeadForge, and all Service-tier templates |
| **Role Shell** | The Role-tier templates (Call Handler, Appt Setter, etc.) — minimal dashboard, plugs into user's existing business |

Each shell is a real working Next.js codebase deployed to a Vercel preview on template selection. Archie personalizes from there based on the Operating Manual + user's clarifying answers. User sees their app running in seconds, not after a long generation.

Shells are authored once, used by many templates. Quality bar is high — every user sees these.

## What Archie Builds vs What We Build

**We build (the underbelly):**
- Runtime (have it)
- Chat UI (Claude SDK handles 80%)
- Business Manual editor (TipTap + Archie chat)
- Agent Bundle config form (shadcn + model pickers)
- MCP connector UX
- Canvas (Monaco + live Vercel preview + file tree + Archie-controlled edits + git-backed)
- North Star list + Overview dashboard (renders AI output)
- Brain browser (renders memory rows)
- Journal + Decisions viewer (renders AI narrative)
- Agenda viewer (renders rows)
- Starter shells (authored once per shell type)
- Archie's operating prompts (the patterns above)

**Archie builds (per North Star):**
- The actual business app (customer dashboard, admin panel, whatever)
- Landing pages, pricing, signup flows
- Integration wiring (Stripe Checkout, webhook handlers, CRM sync)
- Tests for the app he built
- Deployment configs
- Database schemas
- Email templates
- Customer support flows
- Everything specific to that business

## 4-Week Sprint Plan

**Week 1 — Core loop + Canvas skeleton**
- Auth, Home chat (Claude SDK streaming)
- North Stars list + Create flow with tier-filterable gallery
- Business Manual editor (TipTap + Archie side chat)
- Agent Bundle config (one bundle, Auto focus)
- Agenda + Journal views (shadcn table + rendered AI output)
- Canvas: Monaco + live preview + Archie file edits + Vercel deploy wired
- Runtime wired with OpenClaw patterns (have it)

**Week 2 — Starter shells + Archie Cloud provisioning + plugins**
- 5 starter shells authored and deployable (SaaS / Marketplace / Content / Agency / Role)
- **Archie Cloud provisioning flow** — Supabase project creation via Management API, Vercel project creation, GitHub repo creation, credential handoff
- **BYO OAuth flows** — Supabase, Vercel, GitHub connection UX for users bringing their own
- Plugin access in runtime: Supabase MCP, Vercel MCP, GitHub MCP, Stripe SDK
- MCP connector UX for user-brought MCPs

**Week 3 — Prompting patterns + Archie Cloud Pay + Overview**
- Bake prompting patterns into Archie's operating prompts (testing, security review, smoke check, rollback, destructive-op escalation, schema migrations, secret handling)
- North Star Overview dashboard
- Decisions sub-view in Journal + per-NS
- **Archie Cloud Pay** — Stripe Connect Express account provisioning flow + application fee configuration
- **BYO Stripe OAuth** — direct Stripe connection for users bringing their own
- More agent presets (Developer, Customer Service, Business Admin, Researcher)

**Week 4 — Polish + first user**
- Settings (account, billing, integrations, help)
- Brain UI (memory browser)
- Trust mode + Operating Intensity + Traits UI
- Templates library (author 5–10 starter templates for the doc types)
- Onboarding flow (first day experience)
- Compliance log UI
- Onboard first user (mom, realtor group member, etc.)
- Iterate on what breaks

## Real Risks

Not platform feature count. These:

1. **Archie's operating prompts are load-bearing.** If the testing/review/security patterns aren't tight, Archie will ship buggy or unsafe code. This is where time goes.
2. **Starter shells quality.** If the shells are shit, users won't give the platform a chance to prove itself. Authored once, every user sees them — must be excellent.
3. **Canvas UX.** Monaco + live preview + Archie edits sounds simple. It's not. Iteration loop has to feel fast or users bail.
4. **Context discipline.** OpenClaw-style flush/dedup. Context bloat kills output quality on long-running projects.
5. **Coordinator/worker cron orchestration.** Coordinator dynamically rewriting worker cron on replan is novel + breakable. Test hard.
6. **Archie Cloud provisioning reliability.** Creating Supabase projects + Vercel projects + GitHub repos via APIs fails sometimes. Need retry logic, clean rollback, and honest error surfacing to the user when it breaks mid-flow.
7. **Archie Cloud Pay KYC failures.** Some users won't pass Stripe verification. Need a graceful fallback to BYO Stripe or "skip payments for now" path.
8. **Per-NS data isolation under load.** As users spin up many Supabase projects, managing credentials + quotas + billing across them gets complex. Build operational tooling from day one, not later.
9. **Account transfer on export.** Users leaving Archie Cloud need clean handoff of Supabase / Vercel / GitHub ownership. Test this flow before launch, not after users start asking for it.
10. **Trust mode + compliance edge cases.** "Full Auto" + a destructive op + a misread → damaged customer relationship. The Permission Pipeline has to be bulletproof, especially Layer 1 compliance.

## Re Buddy Is Separate

[Re Buddy](./RE_BUDDY.md) is a vertical product — AI copilot for real estate transactions. Same runtime, separate product. Not merged into Archie Bravo.

## Companion Docs

- [OPENCLAW_SOURCE_OF_TRUTH_BUILD_DOC.md](./OPENCLAW_SOURCE_OF_TRUTH_BUILD_DOC.md) — OpenClaw behavioral mapping and phased build plan
- [ARCHIE_BRAVO_TEMPLATE_EXAMPLES.md](./ARCHIE_BRAVO_TEMPLATE_EXAMPLES.md) — All 120 launch-ready template cards in canonical format (Platform / Business / Service / Role)
- [RE_BUDDY.md](./RE_BUDDY.md) — Real estate vertical spec
- [archie/Archie.md](./archie/Archie.md) — Legacy technical reference (subsystem deep dives). Reference when implementing a specific subsystem; not the product spec.

## Bottom Line

**Archie Bravo is where you hire an autonomous company.** Users browse the North Stars template gallery, pick a scope (Role / Service / Business / Platform), Archie builds and runs it 24/7.

5 primary tabs: **Home, North Stars, Brain, Journal, Settings.** North Star detail view lands on Overview dashboard, has Document (Edit button), Canvas (Lovable-style AI-built app), Agents, scoped Agenda + Journal.

Four template tiers are the browsing structure. Roles plug into existing businesses. Services split labor with Archie. Businesses are Archie-owned end-to-end. Platforms are Archie building entire multi-sided SaaS for you.

Two opt-in Archie Cloud choices at template setup:
- **Archie Cloud (infra)** — we provision & manage per-business Supabase + Vercel + GitHub. User pays infra + margin. Vs. **BYO** where user connects their own.
- **Archie Cloud Pay** — we provision Stripe Connect Express on user's behalf; we take application fees on transactions. Vs. **BYO Stripe** where user connects their own.

Users pick per North Star. Can switch later. Ownership is always transferable — no lock-in.

Every template has a live Demo Preview, honest Requirements, tiered Integrations (required / recommended / helpful-if-approved), and a Business Operating Manual that Archie auto-fills on launch.

Don't build platform features for things the AI can do itself. Testing, security review, rollback, error monitoring, smoke checks — all prompting patterns, not UI features.

Archie uses Claude/Cursor/MCP plugins directly (Supabase, Vercel, GitHub, Stripe, Sentry, etc.). We don't wrap them. We give access.

Starter shells so users get instant value. Archie personalizes from there. Living Behaviors, adaptive sleep, memory consolidation, and radical transparency via Journal + Decisions + Activity make Archie feel alive, not robotic.

The AI builds the company. We build the underbelly.

This is the thing.
