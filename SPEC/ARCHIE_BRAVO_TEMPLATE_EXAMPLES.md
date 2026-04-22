# Archie Bravo — Template Examples

_Created: 2026-04-17_
_Companion to `ARCHIE_BRAVO.md`. This file contains every launch template, fully built out in the canonical card format (Tier, Description, Demo Preview, What Archie Handles, Key Features, Requirements, Integrations, Revenue Model, Business Operating Manual)._

**Canonical card format reminder:**
- **Tier** — Platform / Business / Service / Role
- **Description** — one-line hook
- **Demo Preview** — what the live interactive scaffold shows before user commits
- **What Archie Handles** — end-to-end ownership bullets
- **Key Features** — product capabilities
- **Requirements** — the trust line (what the user must provide/do)
- **Integrations** — Required / Recommended / Helpful if approved
- **Revenue Model** — how the business actually makes money
- **Business Operating Manual** — auto-filled by Archie on launch, editable in UI

---

## Table of Contents

- [Platform Templates (Tier 1)](#platform-templates-tier-1) — 30 templates
- [Business Templates (Tier 2)](#business-templates-tier-2) — 30 templates
- [Service Templates (Tier 3)](#service-templates-tier-3) — 30 templates
- [Role Templates (Tier 4)](#role-templates-tier-4) — 30 templates

---

# Platform Templates (Tier 1)

_Archie builds AND operates entire multi-sided SaaS platforms, marketplaces, or tools where other users pay to use the product._

## Productivity & Workflow Platforms

### 1. FlowForge — AI Workflow Automation Platform

**Tier:** Platform

**Description:** Archie builds and runs a no-code automation platform where users create custom agents and workflows — complete with dashboard, marketplace, and recurring billing.

**Demo Preview:** Interactive scaffold dashboard showing a drag-and-drop workflow builder, live agent gallery, and real-time execution log. Users can click around the no-code canvas in the preview.

**What Archie Handles:**
- Builds the full webapp (frontend, backend, database, auth, payments)
- Deploys and hosts the live platform 24/7
- Manages user sign-ups, onboarding, and billing
- Runs the agent marketplace and handles all support tickets

**Key Features:**
- Drag-and-drop workflow builder with 100+ pre-built components
- Public agent marketplace with one-click install
- Usage-based + subscription billing engine
- Real-time execution monitoring and logs

**Requirements:** None (Archie runs end-to-end). Domain name optional — Archie provisions one if needed.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe
- Recommended: Zapier MCP, Sentry, Postmark (transactional email)
- Helpful if approved: Twilio (user notifications via SMS)

**Revenue Model:** Freemium + paid tiers ($19–$99/mo) + 15–20% marketplace commission.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 2. TaskPulse — AI Project Management Platform

**Tier:** Platform

**Description:** Archie launches and operates a full-featured task + team management SaaS with AI assistants, Gantt charts, and client portals.

**Demo Preview:** Clean project dashboard with Gantt view, AI task assistant sidebar, team calendar, and client portal tab. Clickable in the preview.

**What Archie Handles:**
- Full platform build and deployment
- Daily operations, user support, feature updates
- Automated task suggestions and progress reporting
- Billing and subscription management

**Key Features:**
- AI-powered task breakdown and deadline prediction
- Real-time Gantt + Kanban views
- Client-facing portals with white-label option
- Built-in time tracking and invoicing

**Requirements:** None (Archie owns end-to-end after template load).

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe
- Recommended: Google Calendar MCP, Slack MCP, Postmark
- Helpful if approved: Notion / Linear sync for power users

**Revenue Model:** Tiered SaaS ($15/user/mo – $79/team/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 3. DocForge — AI Document Collaboration Platform

**Tier:** Platform

**Description:** Archie builds and runs a secure doc editor + AI co-pilot platform with real-time collaboration and version history.

**Demo Preview:** Real-time document editor preview with AI co-pilot chat, version history sidebar, and multi-user cursor indicators.

**What Archie Handles:**
- Complete webapp build and hosting
- Real-time sync infrastructure
- AI co-pilot training and updates
- User support and security monitoring

**Key Features:**
- Google-Docs-style real-time editing
- AI writing assistant + summarizer
- Granular permissions and audit log
- Export to PDF/Word with one click

**Requirements:** None.

**Integrations:**
- Required: Supabase (RLS for permissions), Vercel, GitHub, Stripe
- Recommended: Y-Sockets / Liveblocks for realtime, Postmark
- Helpful if approved: SSO (Okta, Google Workspace)

**Revenue Model:** $12–$49/user/mo + enterprise plans.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 4. InboxZero — AI Email & Calendar Manager Platform

**Tier:** Platform

**Description:** Archie creates and operates a smart inbox + scheduling platform that auto-responds, books meetings, and summarizes threads.

**Demo Preview:** Unified inbox + calendar dashboard with AI summary cards and auto-scheduling demo buttons.

**What Archie Handles:**
- Builds and deploys the full platform
- Connects to Gmail/Outlook/Calendly via user OAuth
- Runs 24/7 email and meeting automation
- Handles all user onboarding and support

**Key Features:**
- AI email triage and smart replies
- One-click meeting booking
- Daily digest summaries
- Conflict-free calendar optimization

**Requirements:** Users connect their own email/calendar accounts (Archie handles the OAuth flow).

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Google OAuth
- Recommended: Microsoft Graph API, Cal.com
- Helpful if approved: Gmail API (currently gated — unlocks deeper features)

**Revenue Model:** $9–$29/mo per user.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Marketplace & E-commerce Platforms

### 5. NicheMart — AI-Powered Micro-Marketplace Platform

**Tier:** Platform

**Description:** Archie builds and runs a vertical marketplace (users pick niche at signup) with AI product matching, payments, and shipping integrations.

**Demo Preview:** Marketplace homepage with niche selector dropdown and live product grid. Preview lets users "pick a niche" and see dynamic results.

**What Archie Handles:**
- Full marketplace build and launch
- AI matching engine and recommendation system
- Seller onboarding and payment processing
- Order fulfillment coordination and dispute resolution

**Key Features:**
- Niche-specific storefronts
- AI-powered buyer-seller matching
- Stripe Connect + shipping API automation
- Built-in escrow and reviews

**Requirements:** None (100% autonomous after launch).

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe Connect
- Recommended: Shippo or EasyPost, Postmark, Medusa.js (commerce engine)
- Helpful if approved: Shopify App Bridge if sellers come from Shopify

**Revenue Model:** Transaction fees (8–15%) + premium seller subscriptions.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 6. GigVault — AI Freelance Marketplace Platform

**Tier:** Platform

**Description:** Archie launches and manages a specialized freelance gig platform with AI matching, escrow, and automated contracts.

**Demo Preview:** Gig discovery page with AI matching wizard and escrow demo flow.

**What Archie Handles:**
- Platform build and continuous operation
- AI gig-to-client matching engine
- Contract generation and escrow management
- Dispute handling and payouts

**Key Features:**
- AI skill-based matching
- Instant contract templates
- Secure escrow payments
- Built-in portfolio and review system

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe Connect
- Recommended: DocuSign (contracts), Postmark
- Helpful if approved: LinkedIn API for profile import

**Revenue Model:** 10–20% platform fee per gig.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 7. PrintForge — AI Print-on-Demand Marketplace Platform

**Tier:** Platform

**Description:** Archie builds and operates a full POD platform where creators upload ideas and Archie auto-generates designs, fulfills orders, and handles stores.

**Demo Preview:** Creator upload area + live mockup generator for t-shirts, mugs, etc.

**What Archie Handles:**
- Complete POD platform build
- AI design generation from text prompts
- Order processing and print fulfillment integrations
- Storefront management for every creator

**Key Features:**
- Instant AI mockup generator
- Direct-to-printer fulfillment
- Creator storefronts with custom domains
- Automated royalty payouts

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe Connect, Printful/Printify API
- Recommended: Replicate or Stability for image gen, Postmark
- Helpful if approved: Etsy API for cross-listing

**Revenue Model:** Markup on print cost + 15% commission.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 8. ServiceSwap — AI Local Service Marketplace Platform

**Tier:** Platform

**Description:** Archie runs a hyper-local service booking platform (cleaning, repairs, etc.) with AI matching and instant booking.

**Demo Preview:** Hyper-local service search with map view and instant booking flow.

**What Archie Handles:**
- Full platform development and hosting
- AI provider-buyer matching
- Real-time availability and booking engine
- Review and payment processing

**Key Features:**
- Geo-targeted search
- Instant booking + calendar sync
- AI vetting and background checks
- Automated review requests

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe Connect, Cal.com (or in-house scheduling), Mapbox
- Recommended: Postmark, Checkr (background checks)
- Helpful if approved: Twilio for SMS reminders

**Revenue Model:** 12–18% booking fee.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## AI-Powered Tool Platforms

### 9. AgentHub — AI Agent Marketplace Platform

**Tier:** Platform

**Description:** Archie builds and runs a marketplace where users buy/sell/rent ready-made AI agents with one-click deployment.

**Demo Preview:** Agent store with "Try in 1-click" buttons and deployment wizard preview.

**What Archie Handles:**
- Marketplace build and live operation
- Agent upload/review/approval workflow
- One-click deployment to user accounts
- Usage tracking and payouts to creators

**Key Features:**
- One-click agent install
- Usage-based rental pricing
- Built-in agent testing sandbox
- Creator revenue dashboard

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe Connect, OpenAI / Anthropic APIs
- Recommended: MCP protocol support, Sentry, Postmark
- Helpful if approved: OAuth for major tool platforms (Slack, Notion, etc.)

**Revenue Model:** 15% commission on sales + rental fees.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 10. VoiceForge — AI Voice Agent Platform

**Tier:** Platform

**Description:** Archie launches and operates a full agentic voice AI SaaS — users build custom voice agents for calls, support, and sales.

**Demo Preview:** Voice agent builder interface with live voice demo player and test call button.

**What Archie Handles:**
- Entire platform build and scaling
- Voice agent creation and training pipeline
- Twilio/SIP integration and call routing
- Billing and usage analytics

**Key Features:**
- No-code voice agent builder
- Real-time call transcription + analytics
- Multi-language support
- Seamless handoff to human when needed

**Requirements:** Users connect their own Twilio / SIP accounts; Archie manages the rest.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Twilio Realtime, OpenAI Realtime
- Recommended: ElevenLabs, Retell, Sentry
- Helpful if approved: Twilio A2P 10DLC (unlocks SMS companions)

**Revenue Model:** Per-minute usage + tiered plans ($29–$199/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 11. ContentEmpire — AI Content Creation Platform

**Tier:** Platform

**Description:** Archie builds and runs a platform that generates, repurposes, and distributes content across every channel with built-in analytics.

**Demo Preview:** Content pipeline dashboard: one source post in, 20+ repurposed outputs across channels out, with performance graphs.

**What Archie Handles:**
- Full platform build and ops
- AI content generation + repurposing engine
- Channel distribution and scheduling
- Analytics and A/B testing

**Key Features:**
- 1-to-many content repurposing
- Auto-scheduling across social channels
- Performance analytics per channel
- Brand voice persistence

**Requirements:** Users connect their own social channels via OAuth.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, OpenAI/Anthropic
- Recommended: Postmark, Buffer/Hootsuite APIs if available
- Helpful if approved: LinkedIn/X/Instagram APIs (gated, unlock direct posting)

**Revenue Model:** Tiered SaaS ($29–$199/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 12. VideoVault — AI Video Generation Platform

**Tier:** Platform

**Description:** Archie creates and operates an on-demand AI video studio platform for avatars, ads, and explainer videos.

**Demo Preview:** Video builder with avatar selector, script input, and real-time render preview.

**What Archie Handles:**
- Platform build and hosting
- Avatar + voiceover generation pipeline
- Render queue and delivery
- Billing and user management

**Key Features:**
- AI avatar library
- Script-to-video generation
- Custom branding per user
- Cloud render queue with notifications

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, HeyGen or D-ID, ElevenLabs
- Recommended: Mux for video hosting, Postmark
- Helpful if approved: YouTube API for direct uploads

**Revenue Model:** Credit-based + subscription tiers ($19–$149/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Community & Social Platforms

### 13. CircleForge — AI Community Platform

**Tier:** Platform

**Description:** Archie builds and runs a paid community platform with AI moderators, event hosting, and member engagement tools.

**Demo Preview:** Community feed with AI moderator action panel, live event calendar, and member engagement heatmap.

**What Archie Handles:**
- Full community platform build
- AI moderation and engagement
- Event scheduling and reminders
- Subscription billing for members

**Key Features:**
- AI moderator that enforces community rules
- Built-in event hosting + recordings
- Member engagement scoring
- Paid membership tiers

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: LiveKit (for events), Mux (recordings)
- Helpful if approved: Discord API for cross-posting

**Revenue Model:** Subscription tiers ($9–$49/mo) + cut of member fees (5–10%).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 14. ForumPulse — AI Niche Forum Platform

**Tier:** Platform

**Description:** Archie launches and manages a high-engagement forum SaaS with AI summaries, moderation, and monetization.

**Demo Preview:** Threaded forum view with AI-generated thread summaries at the top of each post and moderation action log.

**What Archie Handles:**
- Forum platform build and operation
- AI thread summarization + moderation
- Spam detection and removal
- Monetization (ads, paid tiers, tips)

**Key Features:**
- AI thread digests for skim-readers
- Auto-moderation with configurable rules
- Reputation and badge system
- Tip jars + paid membership

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: OpenAI for summaries, Sentry
- Helpful if approved: reCAPTCHA Enterprise for spam

**Revenue Model:** Freemium + paid member tiers + optional ad revenue share.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 15. CreatorHub — AI Creator Economy Platform

**Tier:** Platform

**Description:** Archie operates a full creator platform with fan subscriptions, digital products, and AI-assisted content tools.

**Demo Preview:** Creator profile with fan subscription tiers, digital storefront, and AI content generator panel.

**What Archie Handles:**
- Full platform build and ops
- Creator onboarding and payouts
- AI content assistance for creators
- Fan subscription + digital product delivery

**Key Features:**
- Creator profile + subscription tiers
- Digital product storefront
- AI content generation tools for creators
- Fan messaging + engagement

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe Connect, Postmark
- Recommended: Mux (video), ElevenLabs, HeyGen
- Helpful if approved: Patreon or Substack migration APIs

**Revenue Model:** 5–10% platform fee on creator revenue + premium creator tools tier.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Education & Learning Platforms

### 16. SkillForge — AI Skill-Learning Platform

**Tier:** Platform

**Description:** Archie builds and runs an interactive course platform that auto-generates personalized lessons and certifications.

**Demo Preview:** Lesson player with adaptive difficulty slider, progress tracker, and certificate preview.

**What Archie Handles:**
- Platform build and operation
- AI lesson generation personalized per learner
- Progress tracking and certification
- Billing and instructor payouts

**Key Features:**
- Personalized adaptive lessons
- Auto-generated quizzes + assessments
- Verifiable certifications
- Marketplace for instructors

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Mux (video lessons), OpenAI for lesson generation
- Helpful if approved: LinkedIn Learning API for cert sharing

**Revenue Model:** Subscription ($19–$49/mo) + cert fees + instructor commission (20–30%).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 17. TutorMatch — AI Tutoring Marketplace Platform

**Tier:** Platform

**Description:** Archie launches and operates a 1:1 AI + human tutoring platform with scheduling and progress tracking.

**Demo Preview:** Tutor discovery page with AI filter, live video session preview, and progress dashboard.

**What Archie Handles:**
- Marketplace platform build and ops
- Tutor-student matching
- Scheduling + video session hosting
- Payment processing and payouts

**Key Features:**
- AI-powered tutor matching
- Integrated video sessions with recording
- Progress reports per student
- Automated billing + tutor payouts

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe Connect, Cal.com, LiveKit or Daily.co
- Recommended: Postmark, Mux
- Helpful if approved: Google Classroom API for integrations

**Revenue Model:** 15–25% platform fee + premium student subscriptions.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 18. AcademyVault — AI Online School Platform

**Tier:** Platform

**Description:** Archie creates and manages a complete LMS where users can instantly launch their own branded online academies.

**Demo Preview:** Academy dashboard with course builder, student portal, and branding customizer.

**What Archie Handles:**
- LMS platform build and ongoing operations
- Instant academy provisioning for users
- Student enrollment and billing
- Course analytics and reporting

**Key Features:**
- White-label academy creation
- Drag-and-drop course builder
- Student portal with progress tracking
- Automated email sequences to students

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe Connect, Postmark
- Recommended: Mux for video, custom domains support
- Helpful if approved: Zapier MCP for course automation

**Revenue Model:** Tiered SaaS ($29–$299/mo) + transaction fees on course sales (5%).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Finance & Management Platforms

### 19. WealthForge — AI Personal Finance Platform

**Tier:** Platform

**Description:** Archie builds and runs a budgeting + investment insights platform with AI coaching and bank integrations.

**Demo Preview:** Net-worth dashboard with AI coach chat, budget categories, and investment insights.

**What Archie Handles:**
- Full fintech platform build and ops
- AI financial coaching for users
- Bank data aggregation
- Subscription management

**Key Features:**
- Plaid-powered account aggregation
- AI budget coach + spending insights
- Investment portfolio analysis
- Goal tracking and projections

**Requirements:** None (users connect their own financial accounts via Plaid).

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Plaid
- Recommended: Postmark, Sentry
- Helpful if approved: Alpaca or Drivewealth for embedded investing

**Revenue Model:** Tiered subscriptions ($9–$29/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 20. BankPulse — AI Small Business Banking Dashboard Platform

**Tier:** Platform

**Description:** Archie launches and operates a smart banking management platform with expense tracking, invoicing, and forecasts.

**Demo Preview:** SMB financial dashboard with cash flow forecast, invoice tracker, and AI recommendations panel.

**What Archie Handles:**
- Full SMB fintech platform build and ops
- AI-powered forecasting and recommendations
- Invoice generation and payment tracking
- User support and subscription billing

**Key Features:**
- Bank + credit card aggregation via Plaid
- Cash flow forecasting
- Invoice sending + payment tracking
- Expense categorization via AI

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Plaid
- Recommended: QuickBooks API, Xero API, Postmark
- Helpful if approved: Open Banking APIs for international users

**Revenue Model:** Tiered SaaS ($19–$99/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 21. ContractVault — AI Contract Management Platform

**Tier:** Platform

**Description:** Archie builds and runs a legal tech platform for generating, signing, and tracking contracts automatically.

**Demo Preview:** Contract template gallery, AI drafting assistant, and signature tracking dashboard.

**What Archie Handles:**
- Platform build and ongoing operation
- AI contract drafting and review
- E-signature flow
- Contract lifecycle tracking + reminders

**Key Features:**
- AI contract generator from plain English
- Clause library + red-flag detection
- DocuSign-style e-signatures
- Auto-reminders for renewals

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, DocuSign SDK (or embedded e-sign)
- Recommended: Postmark, Sentry
- Helpful if approved: SSO providers for enterprise

**Revenue Model:** Tiered SaaS ($15–$99/user/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Health, Wellness & Niche Platforms

### 22. VitalForge — AI Health & Fitness Platform

**Tier:** Platform

**Description:** Archie creates and operates a personalized coaching platform with workout plans, nutrition tracking, and community.

**Demo Preview:** Workout + meal plan dashboard with AI coach chat and progress graphs.

**What Archie Handles:**
- Full health platform build and ops
- AI-generated workout + nutrition plans
- Progress tracking and coaching
- Community features + support

**Key Features:**
- Personalized workout + meal plans
- Photo-based meal logging
- Body metric tracking
- Opt-in community + challenges

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Apple HealthKit / Google Fit, OpenAI for plan gen
- Helpful if approved: Whoop / Oura APIs

**Revenue Model:** Subscription tiers ($19–$49/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 23. MindPulse — AI Mental Wellness Platform

**Tier:** Platform

**Description:** Archie launches and runs an AI journaling + therapy support platform with daily prompts and progress insights.

**Demo Preview:** Journal interface with AI reflection prompts, mood tracker, and progress timeline.

**What Archie Handles:**
- Full platform build and ongoing operation
- AI journaling prompts + reflections
- Mood tracking and insight generation
- Subscription management

**Key Features:**
- Daily AI journaling prompts
- Mood + habit tracking
- Private, encrypted entries
- Insights dashboard

**Requirements:** None. Note: not a replacement for licensed therapy — Archie surfaces disclaimers in the app.

**Integrations:**
- Required: Supabase (with encryption), Vercel, GitHub, Stripe, Postmark
- Recommended: OpenAI/Anthropic for prompts, Sentry
- Helpful if approved: HIPAA-compliant hosting tier when relevant

**Revenue Model:** Subscription ($9–$29/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 24. PlateForge — AI Meal Planning Platform

**Tier:** Platform

**Description:** Archie builds and operates a full recipe + grocery platform with AI personalization and delivery integrations.

**Demo Preview:** Weekly meal plan with recipe cards, auto-generated shopping list, and delivery-service hand-off.

**What Archie Handles:**
- Platform build and ops
- AI meal plan generation per user preferences
- Shopping list creation and delivery hand-off
- Subscription billing

**Key Features:**
- Personalized weekly meal plans
- Auto-generated grocery lists
- Instacart/Amazon Fresh integration
- Dietary restriction management

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Spoonacular API, OpenAI for personalization
- Helpful if approved: Instacart Developer Platform, Amazon Fresh

**Revenue Model:** Subscription ($9–$19/mo) + affiliate revenue on grocery referrals.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Creative & Media Platforms

### 25. StoryForge — AI Interactive Storytelling Platform

**Tier:** Platform

**Description:** Archie launches and manages a subscription platform for endless AI-generated stories, games, and adventures.

**Demo Preview:** Interactive story player with branching choices, character art, and session save/resume.

**What Archie Handles:**
- Full platform build and ops
- AI story generation with branching logic
- User session management
- Subscription billing

**Key Features:**
- Infinite branching narratives
- User-created characters
- Saved game sessions
- Family-friendly mode

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, OpenAI/Anthropic
- Recommended: Image generation API (Replicate, DALL-E), Sentry
- Helpful if approved: ElevenLabs for narration

**Revenue Model:** Subscription ($9–$19/mo) + premium story packs.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 26. CastForge — AI Podcast Hosting Platform

**Tier:** Platform

**Description:** Archie builds and runs a complete podcast creation + distribution platform with AI editing and monetization.

**Demo Preview:** Podcast dashboard with AI editor, distribution channels, and listener analytics.

**What Archie Handles:**
- Podcast hosting platform build and ops
- AI-powered audio editing + noise removal
- Distribution to Apple / Spotify / Google
- Ad insertion and monetization

**Key Features:**
- One-click audio cleanup
- Auto-generated show notes + chapters
- Multi-platform distribution
- Dynamic ad insertion

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Mux / Cloudflare Stream for audio, Whisper for transcription
- Helpful if approved: Apple Podcasts Connect, Spotify for Podcasters APIs

**Revenue Model:** Tiered SaaS ($12–$49/mo) + ad revenue share.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 27. CanvasVault — AI Digital Art Marketplace Platform

**Tier:** Platform

**Description:** Archie operates a generative art platform with NFT minting, print sales, and creator tools.

**Demo Preview:** Art gallery with AI generation studio, minting flow, and print-on-demand checkout.

**What Archie Handles:**
- Art marketplace build and ops
- AI generation tool for creators
- NFT minting + print-on-demand fulfillment
- Payouts to artists

**Key Features:**
- AI art generation studio
- NFT minting on low-fee chains
- Print-on-demand sales
- Artist profile + portfolio

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Replicate/Stability, Printful, Alchemy or QuickNode for chain
- Helpful if approved: OpenSea API for cross-marketplace listing

**Revenue Model:** 10% commission on sales + optional minting fees.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Advanced & Specialized Platforms

### 28. LeadForge (Platform) — AI Lead Generation Platform

**Tier:** Platform

**Description:** Archie builds and runs a self-serve lead-gen platform that auto-creates campaigns and books meetings.

**Demo Preview:** Campaign builder with ICP selector, outreach cadence preview, and meeting calendar fills.

**What Archie Handles:**
- Full lead-gen platform build and ops
- ICP targeting + prospect research
- Multi-channel outreach sequences
- Meeting booking + CRM sync

**Key Features:**
- AI-generated prospect lists
- Cold email + LinkedIn sequences
- Auto-booking calendar sync
- Deliverability + warm-up management

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Apollo/Clay API
- Recommended: Cal.com, Sentry
- Helpful if approved: LinkedIn Sales Navigator API, Gmail API

**Revenue Model:** Tiered SaaS ($99–$499/mo) + per-lead pricing.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 29. SEOEmpire — AI SEO Management Platform

**Tier:** Platform

**Description:** Archie launches and operates a full-site SEO tool with auto-audits, content generation, and ranking reports.

**Demo Preview:** Site audit dashboard with issue list, AI content generator, and keyword rank tracker.

**What Archie Handles:**
- Full SEO platform build and ops
- Automated site audits
- AI content generation for client sites
- Rank tracking + reporting

**Key Features:**
- Weekly site audit reports
- AI-powered content drafts
- Keyword rank tracking
- Backlink monitoring

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Google Search Console API
- Recommended: Ahrefs / DataForSEO / Serpstat APIs
- Helpful if approved: Screaming Frog, Semrush APIs

**Revenue Model:** Tiered SaaS ($29–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 30. EventForge — AI Virtual Event Platform

**Tier:** Platform

**Description:** Archie creates and manages a complete webinar + virtual conference platform with AI hosts and attendee tracking.

**Demo Preview:** Virtual event lobby with AI host avatar, session schedule, and attendee engagement heatmap.

**What Archie Handles:**
- Full event platform build and ongoing ops
- AI host generation + event facilitation
- Registration + reminder sequences
- Analytics + post-event follow-ups

**Key Features:**
- AI host avatars for sessions
- Multi-track event support
- Registration + ticketing
- Engagement analytics + recordings

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, LiveKit
- Recommended: HeyGen for avatars, Mux for recordings
- Helpful if approved: Zoom SDK for hybrid events

**Revenue Model:** Tiered SaaS ($49–$499/mo) + ticketing fee on paid events.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

# Business Templates (Tier 2)

_Archie owns end-to-end running of a full digital business. One operator — no external paying users of a platform._

## AI Agency & Service Businesses

### 1. Apex — AI Automation Agency

**Tier:** Business

**Description:** Launch and run a full-service AI automation agency — custom agents, workflows, and automations for SMBs (proposals → delivery → client portals → recurring revenue).

**Demo Preview:** Agency dashboard with prospect pipeline, proposal generator, active client portals, and delivery tracker.

**What Archie Handles:**
- Prospect research + outbound outreach
- Proposal generation + client contracts
- Automation delivery + client portal management
- Recurring retainer billing + status reports

**Key Features:**
- Pipeline from lead to signed contract
- Delivery dashboard per client
- Automation template library
- Recurring revenue tracker

**Requirements:** None — Archie runs the agency end-to-end (user reviews proposals before send if in Always-Ask trust mode).

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, DocuSign, Cal.com
- Recommended: Apollo for prospects, Linear for delivery tasks, Zapier MCP
- Helpful if approved: LinkedIn Sales Navigator

**Revenue Model:** Project fees ($2k–$25k) + monthly retainers ($500–$5k/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 2. EchoSupport — 24/7 AI Customer Service Agency

**Tier:** Business

**Description:** Run a white-label AI support agency that handles chat, email, tickets, and phone for e-commerce and SaaS companies around the clock.

**Demo Preview:** Multi-client support dashboard with ticket queues, response templates, and SLA tracking.

**What Archie Handles:**
- Prospecting + onboarding new client brands
- Multi-channel support (chat, email, tickets, phone)
- Per-client knowledge base training
- SLA tracking + monthly client reports

**Key Features:**
- Per-client brand voice
- 24/7 multi-channel coverage
- Auto-escalation to client's human team
- Monthly performance reports

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Intercom or Zendesk APIs, Twilio Realtime
- Recommended: ElevenLabs, Sentry
- Helpful if approved: Gmail/Outlook delegation for shared inboxes

**Revenue Model:** Monthly retainers ($1.5k–$10k/mo per client).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 3. VibeEdit — Autonomous Video Production Studio

**Tier:** Business

**Description:** Build and operate an on-demand AI video editing & creation agency — raw footage in, polished branded videos out, with client dashboard and delivery.

**Demo Preview:** Upload → edit pipeline → delivery portal with revision tracker and branded export presets.

**What Archie Handles:**
- Client onboarding + brand kit setup
- AI-assisted video editing
- Revision management
- Delivery portal + payment collection

**Key Features:**
- Raw-to-finished pipeline
- Brand preset library per client
- Revision round tracking
- Auto-generated captions + B-roll

**Requirements:** None — Archie uses AI video tools for the actual editing.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Mux
- Recommended: Descript API, ElevenLabs for voiceovers
- Helpful if approved: Frame.io for pro review workflows

**Revenue Model:** Per-video ($150–$2k) or monthly retainers ($1k–$5k/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 4. BotDeploy — AI Chatbot-as-a-Service Agency

**Tier:** Business

**Description:** Launch and manage a chatbot agency that builds, deploys, and maintains custom AI support/sales bots for other businesses.

**Demo Preview:** Bot builder dashboard with client list, deployment status, and conversation analytics.

**What Archie Handles:**
- Client prospecting + onboarding
- Custom bot design + deployment
- Continuous training + optimization
- Monthly retainer billing

**Key Features:**
- Custom bots per client
- Knowledge base ingestion
- Multi-channel deployment
- Performance reports

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Intercom/Drift/Crisp APIs, OpenAI/Anthropic
- Helpful if approved: WhatsApp Business API

**Revenue Model:** Setup fee ($1k–$5k) + monthly retainer ($300–$2k/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 5. CampaignForge — Full-Service AI Marketing Agency

**Tier:** Business

**Description:** Run a complete AI-powered marketing agency — full campaigns, ads, emails, landing pages, A/B testing, and performance reports.

**Demo Preview:** Multi-client campaign dashboard with ad spend tracker, email sequences, and A/B test results.

**What Archie Handles:**
- Campaign strategy + creative generation
- Ad placement + spend management
- Email sequence writing + sending
- Landing page creation + A/B testing
- Monthly performance reports

**Key Features:**
- Full-stack campaign execution
- Cross-channel A/B testing
- Attribution + ROI reporting
- Creative asset library

**Requirements:** User provides ad spend budget + authorizations. Archie handles creative, placement, optimization.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Meta Ads API, Google Ads API (paid access), Vercel deploy for landers
- Helpful if approved: TikTok Business API, LinkedIn Campaign Manager

**Revenue Model:** Management fee (10–20% of ad spend) + monthly retainer ($2k–$10k/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 6. TalentForge — AI Recruitment & Headhunting Agency

**Tier:** Business

**Description:** Operate an end-to-end AI recruiting platform — resume screening, candidate matching, outreach, and interview scheduling.

**Demo Preview:** Client role dashboard with candidate pipeline, screening scores, and interview schedule.

**What Archie Handles:**
- Client intake + role briefing
- Candidate sourcing + screening
- Outreach sequences to passive candidates
- Interview scheduling + coordination
- Placement tracking + billing

**Key Features:**
- AI resume screening
- Multi-channel candidate outreach
- Interview scheduling automation
- Placement + billing tracking

**Requirements:** User defines roles + makes final hire decisions.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Cal.com
- Recommended: Apollo, Hunter.io, Greenhouse API
- Helpful if approved: LinkedIn Recruiter, Indeed Partner API

**Revenue Model:** Placement fee (15–25% of salary) or monthly retainer ($3k–$8k/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 7. RepurposeAI — Content Repurposing Agency

**Tier:** Business

**Description:** Turn one piece of content into 100+ assets across every platform — fully automated agency for creators and brands.

**Demo Preview:** Source content uploader with fan-out preview showing 20+ generated assets across channels.

**What Archie Handles:**
- Client content ingestion
- 1-to-many asset generation
- Scheduling + distribution across channels
- Performance reporting per client

**Key Features:**
- Single source → 100+ assets
- Auto-scheduling across social channels
- Brand voice persistence
- Performance dashboard

**Requirements:** Client provides source content. Archie repurposes and distributes.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Buffer/Hootsuite APIs, Descript, OpenAI
- Helpful if approved: LinkedIn / X / Instagram / TikTok APIs

**Revenue Model:** Monthly retainer ($500–$3k/mo per client).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 8. AvatarSpeak — AI Video Spokesperson Agency

**Tier:** Business

**Description:** Build and run a custom AI avatar video marketing service for explainer videos, ads, and sales funnels.

**Demo Preview:** Avatar studio with script input, style selector, and rendered video preview.

**What Archie Handles:**
- Client intake + avatar customization
- Script writing + video generation
- Revision cycles + delivery
- Payment processing

**Key Features:**
- Custom AI avatars
- Script-to-video rendering
- Multi-language versions
- White-label delivery

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, HeyGen or D-ID
- Recommended: ElevenLabs for voice, Mux
- Helpful if approved: YouTube Data API

**Revenue Model:** Per-video ($200–$2k) or monthly subscription ($500–$2k/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 9. LeadForge (Business) — AI Lead Generation & Outreach Agency

**Tier:** Business

**Description:** Run a cold-email/LinkedIn/Ads lead-gen agency that books meetings automatically for clients.

**Demo Preview:** Multi-client pipeline with outreach campaign performance and booked meeting calendar.

**What Archie Handles:**
- Per-client ICP + campaign creation
- Prospect list sourcing + enrichment
- Multi-channel outreach sequences
- Meeting booking into client calendars
- Monthly performance reports

**Key Features:**
- Multi-client campaign management
- AI-personalized outreach
- Deliverability management
- Booked-meeting billing

**Requirements:** Client provides ICP + sales calendar.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Apollo or Clay
- Recommended: Cal.com, Instantly/Smartlead APIs
- Helpful if approved: LinkedIn Sales Navigator, Gmail API

**Revenue Model:** Per-meeting ($100–$500) or retainer ($2k–$8k/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Content & Media Businesses

### 10. Pulse — Niche Content Empire

**Tier:** Business

**Description:** Build and monetize a network of SEO-optimized niche blogs, newsletters, and social channels with ads + affiliate income.

**Demo Preview:** Multi-site dashboard with traffic per property, publishing schedule, and revenue attribution.

**What Archie Handles:**
- Niche research + site launches
- Content production + publishing
- SEO optimization + backlink building
- Ad placement + affiliate management
- Social distribution

**Key Features:**
- Multi-site management from one dashboard
- AI content production at scale
- SEO + ranking tracking
- Revenue attribution per site

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Google Search Console, DataForSEO, Mediavine or AdThrive (ads)
- Helpful if approved: Amazon Associates, major affiliate networks

**Revenue Model:** Ad revenue + affiliate commissions + eventual sponsored content.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 11. ViralPulse — Social Media Content Agency

**Tier:** Business

**Description:** Operate an autonomous meme, short-form, and viral content creation & scheduling business.

**Demo Preview:** Trend radar + content calendar + per-platform scheduling dashboard.

**What Archie Handles:**
- Trend spotting + content ideation
- Short-form video + meme generation
- Scheduling + posting across channels
- Engagement + performance analytics

**Key Features:**
- Daily trend-based content
- Multi-format generation (images, videos, memes)
- Auto-scheduling per platform
- Performance reports

**Requirements:** Client provides brand voice + accounts.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Replicate, ElevenLabs, Buffer/Hootsuite APIs
- Helpful if approved: TikTok, IG, X APIs for direct posting

**Revenue Model:** Monthly retainer ($500–$3k/mo) + viral performance bonuses.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 12. CastForge (Business) — Automated Podcast Production Studio

**Tier:** Business

**Description:** Run a full podcast agency — script, voice, edit, distribute, and promote episodes for clients or your own network.

**Demo Preview:** Production pipeline from script to published episode with promo asset gallery.

**What Archie Handles:**
- Script writing + voice synthesis (or client recordings)
- Audio editing + mastering
- Show notes + chapters
- Distribution to major platforms
- Social + newsletter promotion

**Key Features:**
- End-to-end episode production
- Auto-generated show notes
- Multi-platform distribution
- Promo asset creation (clips, quotes, videos)

**Requirements:** Client provides topic direction or raw recordings (optional — Archie can synthesize entirely AI).

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: ElevenLabs, Descript API, Mux
- Helpful if approved: Apple Podcasts Connect, Spotify APIs

**Revenue Model:** Per-episode ($150–$500) or monthly retainer ($1.5k–$5k/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 13. Canvas — AI Art & Design Marketplace

**Tier:** Business

**Description:** Run a generative art studio + marketplace selling custom art, NFTs, stock images, and print-on-demand designs.

**Demo Preview:** Art catalog with commission form, POD mockups, and creator storefront.

**What Archie Handles:**
- Art generation on demand
- Commission intake + delivery
- POD product creation + listing
- Payment processing + payouts

**Key Features:**
- AI art generation studio
- Custom commission workflow
- POD catalog + fulfillment
- Stock library + licensing

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Replicate/Stability
- Recommended: Printful/Printify, Shopify Storefront API
- Helpful if approved: Society6 / Redbubble APIs

**Revenue Model:** Commission fees + POD markup + stock licensing.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 14. AcademyForge — On-Demand AI Course Creator

**Tier:** Business

**Description:** Build and sell complete online courses, complete with lessons, quizzes, certificates, and student portals.

**Demo Preview:** Course catalog with enrollment flow, lesson player, and student progress dashboard.

**What Archie Handles:**
- Course topic research + outline creation
- Lesson content + quiz generation
- Student enrollment + support
- Certificate issuance + marketing

**Key Features:**
- Multi-course catalog
- Quiz + certificate engine
- Student progress tracking
- Drip content delivery

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Mux
- Recommended: OpenAI/Anthropic, HeyGen (avatar-led lessons)
- Helpful if approved: Thinkific/Teachable migration APIs

**Revenue Model:** Per-course sales ($49–$499) + bundle tiers.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 15. InsightForge — AI Financial Newsletter & Analysis Service

**Tier:** Business

**Description:** Launch a subscription-based daily/weekly AI market insights newsletter (stocks, crypto, macro).

**Demo Preview:** Newsletter archive with today's edition, subscriber dashboard, and performance tracker.

**What Archie Handles:**
- Daily market data ingestion + analysis
- Newsletter writing + sending
- Subscriber management + tier upgrades
- Archive + search

**Key Features:**
- Daily/weekly editions
- Paid premium tier with deeper analysis
- Portfolio tracking for premium
- Archive search

**Requirements:** None. Disclaimers on financial content handled automatically.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Alpha Vantage, Polygon.io, CoinGecko
- Helpful if approved: Bloomberg Terminal, Refinitiv

**Revenue Model:** Subscription ($9–$49/mo) + sponsorship slots.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Consumer & Lifestyle Businesses

### 16. VitalAI — Personalized Fitness & Nutrition Coach

**Tier:** Business

**Description:** Run a complete virtual coaching business with custom workouts, meal plans, progress tracking, and community.

**Demo Preview:** Client-facing coaching dashboard with today's workout, meal plan, and coach chat.

**What Archie Handles:**
- Client intake + goal setting
- Workout + meal plan generation
- Daily check-ins + adjustments
- Billing + community management

**Key Features:**
- Personalized plans per client
- Daily AI coaching via chat
- Progress photos + metrics
- Community + challenges

**Requirements:** None. Disclaimers on health content auto-injected.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Apple HealthKit / Google Fit, OpenAI
- Helpful if approved: Whoop / Oura APIs

**Revenue Model:** Subscription ($49–$149/mo per client).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 17. Lingua — AI Language Learning Academy

**Tier:** Business

**Description:** Operate an interactive AI language tutor with lessons, conversation practice, and progress reports.

**Demo Preview:** Lesson interface with AI conversation partner, pronunciation scorer, and progress chart.

**What Archie Handles:**
- Learner onboarding + placement test
- Personalized lesson generation
- Voice conversation practice
- Progress tracking + billing

**Key Features:**
- Adaptive lesson difficulty
- AI conversation partner with voice
- Pronunciation scoring
- Certification at levels

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, OpenAI Realtime
- Recommended: ElevenLabs, Whisper for transcription
- Helpful if approved: Duolingo-like certification partnerships

**Revenue Model:** Subscription ($9–$29/mo) + premium tutor add-on.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 18. PlateAI — Personalized Recipe & Meal Planning Service

**Tier:** Business

**Description:** Deliver custom recipes, shopping lists, nutritional tracking, and grocery integrations via subscription.

**Demo Preview:** Weekly meal plan with shopping list, grocery delivery hand-off, and nutrition tracker.

**What Archie Handles:**
- Subscriber onboarding + preferences
- Weekly meal plan generation
- Shopping list creation + delivery hand-off
- Subscription billing

**Key Features:**
- Weekly personalized meal plans
- Dietary restriction management
- Auto-generated shopping lists
- Grocery delivery integration

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Spoonacular
- Recommended: Instacart Developer Platform, OpenAI
- Helpful if approved: Amazon Fresh APIs

**Revenue Model:** Subscription ($9–$19/mo) + grocery affiliate revenue.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 19. NestAI — Virtual Interior Design Studio

**Tier:** Business

**Description:** Run a photo-based AI interior design business — full room redesigns, layouts, and direct product purchase links.

**Demo Preview:** Upload room photo → AI redesign options → shop-the-look product grid.

**What Archie Handles:**
- Client photo intake
- AI redesign generation
- Product sourcing + affiliate links
- Payment processing + delivery

**Key Features:**
- Multi-style redesigns from photos
- Shoppable product lists
- Revision rounds
- Virtual staging for realtors

**Requirements:** Client uploads room photos.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Replicate or Stability
- Recommended: Wayfair / IKEA / Amazon affiliate APIs
- Helpful if approved: Matterport API for 3D rooms

**Revenue Model:** Per-room ($49–$199) + affiliate commissions.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 20. OccasionAI — Custom Greeting Cards & Messages Platform

**Tier:** Business

**Description:** Instant on-demand personalized cards, videos, and messages (digital + print fulfillment).

**Demo Preview:** Occasion picker → customization flow → print/digital delivery preview.

**What Archie Handles:**
- Customer order intake
- AI card/video generation
- Print fulfillment via Lob or POD partners
- Digital delivery + billing

**Key Features:**
- AI-personalized cards
- Video greetings with AI avatars
- Print + digital delivery
- Occasion reminders

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Lob
- Recommended: HeyGen, ElevenLabs
- Helpful if approved: Moonpig / Minted partnerships

**Revenue Model:** Per-card/video ($5–$49) + subscription for frequent users.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 21. WanderForge — AI Travel Itinerary & Booking Agency

**Tier:** Business

**Description:** Build and run a full travel planning service that creates custom trips, real-time bookings, and live support.

**Demo Preview:** Trip planner with destination carousel, day-by-day itinerary, and booking buttons.

**What Archie Handles:**
- Traveler intake + preferences
- Custom itinerary creation
- Flight/hotel/activity bookings
- 24/7 travel support during trip

**Key Features:**
- Multi-day custom itineraries
- Real-time booking + rebooking
- Live AI travel concierge
- Group trip coordination

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Amadeus or Duffel API
- Recommended: Booking.com, Skyscanner APIs
- Helpful if approved: Airbnb API, Viator

**Revenue Model:** Planning fee + booking commissions.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 22. WealthAI — Personal Finance & Budget Coach

**Tier:** Business

**Description:** Operate an autonomous personal finance advisor — budgeting, expense tracking, and basic investment guidance.

**Demo Preview:** Subscriber dashboard with budget categories, AI coach chat, and goal tracker.

**What Archie Handles:**
- Subscriber onboarding
- Budget setup + expense categorization
- AI coaching + goal tracking
- Billing + insights delivery

**Key Features:**
- Automatic budget categorization
- AI coach chat
- Goal tracker with projections
- Monthly financial reports

**Requirements:** None. Investment advice disclaimers auto-handled.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Plaid
- Recommended: OpenAI/Anthropic
- Helpful if approved: Alpaca or similar for light investment features

**Revenue Model:** Subscription ($9–$19/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## E-commerce & SaaS-Style Businesses

### 23. MerchForge — Print-on-Demand Brand Empire

**Tier:** Business

**Description:** Launch and run multiple trending niche print-on-demand stores with AI-generated designs and automated fulfillment.

**Demo Preview:** Multi-store dashboard with trending niches, design generator, and sales leaderboard.

**What Archie Handles:**
- Niche research + store launches
- AI design generation at volume
- Product listing + storefront ops
- Ad campaigns + fulfillment
- Profit analysis per store

**Key Features:**
- Multi-store management
- Trend-driven design generation
- Auto-listing across stores
- Integrated ad campaigns

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Printful/Printify
- Recommended: Shopify Admin API, Replicate/Stability
- Helpful if approved: Meta Ads, TikTok Business

**Revenue Model:** Margin on product sales across stores.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 24. ContractAI — Legal Document Generator

**Tier:** Business

**Description:** Run a fast, on-demand legal template and contract creation service (with disclaimers and upsells).

**Demo Preview:** Template gallery → customization form → instant PDF + e-sign option.

**What Archie Handles:**
- Customer intake + template selection
- AI contract customization
- E-signature flow
- Upsell to attorney review (partner network)

**Key Features:**
- 100+ template library
- AI customization
- Integrated e-sign
- Attorney review upsell

**Requirements:** None. Legal disclaimers auto-injected; not a substitute for licensed counsel.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, DocuSign SDK
- Recommended: OpenAI/Anthropic
- Helpful if approved: Attorney partner networks

**Revenue Model:** Per-contract ($29–$149) + subscription ($29–$99/mo) + attorney review commission.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 25. ShopSmart — AI Personal Shopping Assistant

**Tier:** Business

**Description:** Operate a virtual personal shopper that analyzes preferences and handles recommendations + purchases across stores.

**Demo Preview:** Style profile quiz → curated shop feed → one-click purchase across retailers.

**What Archie Handles:**
- Subscriber style profiling
- Personalized product curation
- Cross-retailer purchase handling
- Returns + exchanges coordination

**Key Features:**
- Personal style quiz
- Multi-retailer shopping
- Price drop alerts
- Returns coordination

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Shopify Admin API, Amazon Associates, affiliate networks
- Helpful if approved: Klarna, Afterpay for buy-now-pay-later

**Revenue Model:** Subscription ($19–$49/mo) + affiliate commissions.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 26. CareerForge — AI Resume & Job Placement Service

**Tier:** Business

**Description:** Run a complete career coaching business — resumes, cover letters, applications, and interview prep on autopilot.

**Demo Preview:** Client dashboard with resume builder, application tracker, and interview prep sessions.

**What Archie Handles:**
- Client intake + job targeting
- Resume + cover letter writing
- Application submission + tracking
- Interview prep + follow-ups

**Key Features:**
- AI resume + cover letter generation
- Multi-job application automation
- Interview prep with practice
- Follow-up sequences

**Requirements:** Client handles final decisions on job targeting.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, OpenAI
- Recommended: Indeed API, Glassdoor, Greenhouse
- Helpful if approved: LinkedIn Easy Apply, Gmail API

**Revenue Model:** Packages ($99–$999 per client) or monthly ($49/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 27. BankForge — AI Banking & Finance Management App

**Tier:** Business

**Description:** Launch and operate a personal or small-business banking management dashboard with AI insights, automation, and reporting.

**Demo Preview:** Unified finance dashboard with accounts, cash flow forecasts, and AI automation rules.

**What Archie Handles:**
- User onboarding + account aggregation
- AI categorization + forecasting
- Automated bill pay + transfers
- Subscription billing

**Key Features:**
- Multi-account view via Plaid
- Cash flow forecasting
- AI automation rules ("if balance > X, move to savings")
- Financial reports

**Requirements:** None.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Plaid
- Recommended: QuickBooks API for SMB users
- Helpful if approved: Open Banking APIs for international

**Revenue Model:** Subscription ($9–$39/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 28. LegalPulse — AI Legal Intake Business

**Tier:** Business

**Description:** Operate an after-hours legal intake service for small law firms — captures leads, qualifies cases, and books consultations.

**Demo Preview:** Intake dashboard with active cases, qualification scores, and consultation calendar.

**What Archie Handles:**
- 24/7 lead intake (voice + chat)
- Case qualification + scoring
- Consultation booking
- Client file creation in firm's CRM

**Key Features:**
- Voice + chat intake
- Case qualification engine
- Conflict check lookup
- Consultation scheduling

**Requirements:** Firm provides case criteria + calendar access.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Twilio Realtime, Cal.com
- Recommended: Clio API, Lawmatics
- Helpful if approved: Twilio A2P for client SMS follow-ups

**Revenue Model:** Monthly retainer ($500–$2k per firm) or per-qualified-lead fee.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 29. PitchPulse — AI Pitch Deck & Investor Outreach Business

**Tier:** Business

**Description:** Run a service that creates investor-grade pitch decks and runs outreach to relevant VCs/angels for founders.

**Demo Preview:** Deck builder + investor list with outreach tracker and meeting dashboard.

**What Archie Handles:**
- Founder intake + company brief
- Pitch deck design + copy
- Investor list research
- Outreach sequences + meeting booking

**Key Features:**
- AI-generated pitch decks
- Targeted investor lists by stage/sector
- Personalized outreach at scale
- Meeting pipeline tracker

**Requirements:** Founder handles actual investor meetings.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Cal.com
- Recommended: Crunchbase, PitchBook APIs, Apollo
- Helpful if approved: LinkedIn Sales Navigator

**Revenue Model:** Packages ($1.5k–$10k) + success fee on meetings.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 30. GhostNewsletter — Ghostwritten Newsletter for Busy Professionals

**Tier:** Business

**Description:** Archie runs a newsletter under the client's name — research, writing, sending, subscriber growth — all ghostwritten.

**Demo Preview:** Newsletter dashboard with upcoming editions, subscriber growth chart, and client approval queue.

**What Archie Handles:**
- Topic research for client's niche
- Newsletter writing in client's voice
- Sending + subscriber management
- Growth experiments + analytics

**Key Features:**
- Per-client brand voice
- Weekly/daily editions
- Subscriber growth tools
- Monthly performance reports

**Requirements:** Client approves drafts (optional per trust mode) and provides initial audience seed.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Beehiiv / Substack APIs, OpenAI
- Helpful if approved: LinkedIn for cross-promotion

**Revenue Model:** Monthly retainer per client ($500–$3k/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

# Service Templates (Tier 3)

_Archie handles all ops (intake, booking, invoicing, CRM, follow-ups). User delivers the actual craft — coaching call, design work, the shoot. Split labor._

## Coaching & Consulting

### 1. Life Coaching Practice

**Tier:** Service

**Description:** Archie handles all discovery calls, qualifies clients, books sessions, collects payments, sends onboarding materials, and runs follow-up sequences.

**Demo Preview:** Client dashboard with booking calendar, upcoming sessions, progress tracker, and one-click "Start Session" button.

**What Archie Handles:**
- 24/7 call/text intake and lead qualification
- Booking + payment processing
- Onboarding packet delivery
- Session reminders + follow-up sequences
- Client progress dashboard

**Key Features:**
- Voice + chat intake system
- Personalized onboarding packet generator
- Session reminders + recaps
- Client progress view

**Requirements:** You deliver the actual coaching sessions.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, Twilio Realtime
- Recommended: ElevenLabs, OpenAI for onboarding prompts
- Helpful if approved: Twilio A2P for SMS reminders

**Revenue Model:** $97–$297 per client package.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 2. Business Coaching Service

**Tier:** Service

**Description:** Archie manages lead intake, schedules strategy calls, sends contracts and invoices, and tracks client progress in your CRM.

**Demo Preview:** Strategy session dashboard with lead pipeline, contract templates, invoice generator, and client progress timeline.

**What Archie Handles:**
- Lead qualification + scoring
- Strategy call booking
- Contract + invoice automation
- Client progress tracking + milestone check-ins

**Key Features:**
- Smart lead scoring
- One-click contract + payment
- Milestone check-ins
- Full CRM dashboard

**Requirements:** You run the actual strategy/coaching calls.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, DocuSign
- Recommended: HubSpot CRM, OpenAI
- Helpful if approved: Twilio A2P

**Revenue Model:** $1,500–$5,000 per coaching package.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 3. Career Coaching Agency

**Tier:** Service

**Description:** Archie qualifies job-seekers, books 1:1 sessions, creates custom resume packages, and sends automated interview prep materials.

**Demo Preview:** Job-seeker portal with resume builder, interview prep calendar, and application tracker.

**What Archie Handles:**
- Inbound inquiry qualification
- Session booking
- Resume package delivery
- Interview prep material automation
- Application follow-up tracking

**Key Features:**
- Instant resume/cover letter generator
- Mock interview scheduling
- Application follow-up sequences
- Client success dashboard

**Requirements:** You deliver 1:1 coaching and final resume feedback.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark
- Recommended: OpenAI for resume gen, Indeed API
- Helpful if approved: LinkedIn Easy Apply

**Revenue Model:** $197–$997 per package.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 4. Relationship Coaching Practice

**Tier:** Service

**Description:** Archie takes all inbound calls/texts, books sessions, processes payments, and sends daily check-in prompts to clients.

**Demo Preview:** Couple/session booking screen with daily check-in prompt builder and progress journal view.

**What Archie Handles:**
- 24/7 call/text intake and booking
- Payment processing
- Daily relationship check-in sequences
- Client journaling portal

**Key Features:**
- Voice + SMS booking
- Automated daily prompts + mood check-ins
- Secure client journal
- Payment + reschedule automation

**Requirements:** You lead the actual coaching sessions.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, Twilio Realtime
- Recommended: ElevenLabs
- Helpful if approved: Twilio A2P for check-in SMS

**Revenue Model:** $147–$397 per month per couple.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 5. Health & Wellness Coaching Business

**Tier:** Service

**Description:** Archie handles intake forms, schedules weekly calls, sends meal/workout reminders, and tracks client progress reports.

**Demo Preview:** Client wellness dashboard with meal/workout plan viewer, progress graphs, and reminder settings.

**What Archie Handles:**
- Intake form collection + scheduling
- Weekly reminder sequences
- Progress tracking + report generation
- All client communication outside of calls

**Key Features:**
- Meal & workout plan delivery
- Progress dashboard with graphs
- Habit reminders
- Payment + reschedule automation

**Requirements:** You deliver live coaching calls and plan customization.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark
- Recommended: OpenAI, HealthKit / Google Fit
- Helpful if approved: Whoop / Oura

**Revenue Model:** $97–$297 per month per client.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Creative & Freelance Services

### 6. Freelance Graphic Design Studio

**Tier:** Service

**Description:** Archie manages client inquiries, sends quotes, tracks project deadlines, and delivers final files with automated feedback loops.

**Demo Preview:** Client project dashboard with brief intake, deadline tracker, and file delivery portal.

**What Archie Handles:**
- Inquiry + quote automation
- Deadline tracking + client comms
- File delivery + feedback collection
- Invoicing + follow-ups

**Key Features:**
- Quote & contract generator
- Real-time project timeline
- Client feedback loop
- File delivery portal

**Requirements:** You create the actual designs.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, DocuSign
- Recommended: Figma API, Linear for task tracking
- Helpful if approved: Dropbox / Google Drive for file handoff

**Revenue Model:** $500–$3,000 per project.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 7. Freelance Video Editing Service

**Tier:** Service

**Description:** Archie takes raw footage uploads, schedules revisions, delivers polished videos, and handles all client communication.

**Demo Preview:** Raw footage upload area + revision tracker with delivery timeline.

**What Archie Handles:**
- Footage intake + revision scheduling
- Client communication + feedback loops
- Final delivery + invoicing
- Project status updates

**Key Features:**
- Drag-and-drop uploader
- Automated revision requests
- Branded delivery portal
- Payment automation

**Requirements:** You edit the actual video.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Mux
- Recommended: Frame.io, Dropbox
- Helpful if approved: Descript API

**Revenue Model:** $300–$2,500 per project.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 8. Freelance Copywriting Agency

**Tier:** Service

**Description:** Archie qualifies new clients, collects project briefs, sends drafts for your review, and manages invoicing and revisions.

**Demo Preview:** Project brief dashboard with draft review area and revision counter.

**What Archie Handles:**
- Lead qualification + brief collection
- Draft delivery + revision workflow
- Invoicing + follow-up

**Key Features:**
- Smart brief form
- Revision workflow
- Automated invoicing
- Client comms hub

**Requirements:** You write the actual copy.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: OpenAI for brief analysis, Linear
- Helpful if approved: Google Docs API for collaborative editing

**Revenue Model:** $250–$1,500 per project.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 9. Freelance Social Media Management Service

**Tier:** Service

**Description:** Archie creates content calendars, schedules posts, replies to comments/DMs, and sends weekly performance reports to you.

**Demo Preview:** Content calendar dashboard with auto-post scheduler and engagement metrics preview.

**What Archie Handles:**
- Content calendar creation + posting
- Comment/DM replies in brand voice
- Weekly performance reporting
- All client communication

**Key Features:**
- AI-assisted calendar
- Auto-reply rules
- Performance dashboard
- Client approval workflow

**Requirements:** You approve final calendar.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Buffer / Hootsuite APIs
- Helpful if approved: LinkedIn / X / IG APIs

**Revenue Model:** $750–$3,000 per month per client.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 10. Freelance Photography Booking Service

**Tier:** Service

**Description:** Archie handles all inquiry calls, books shoots, sends contracts and deposits, and coordinates client prep materials.

**Demo Preview:** Booking calendar with inquiry form, contract preview, and shoot prep checklist.

**What Archie Handles:**
- Inbound calls + booking
- Contract + deposit processing
- Prep material delivery
- Post-shoot follow-ups

**Key Features:**
- 24/7 voice + text booking
- Automated contracts + deposits
- Prep checklist + reminders
- Client portal for proofs

**Requirements:** You shoot.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, DocuSign, Twilio Realtime
- Recommended: Pic-Time / Pixieset APIs
- Helpful if approved: Twilio A2P

**Revenue Model:** $400–$2,000 per booking.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Personal Service & Lifestyle

### 11. Salon / Spa Booking & Reminder System

**Tier:** Service

**Description:** Archie handles all appointment calls, no-shows, rescheduling, upselling services, and sends confirmation/reminder texts.

**Demo Preview:** Chair schedule with AI-booked appointments, no-show handler, and service upsell triggers.

**What Archie Handles:**
- Voice + text appointment booking
- No-show detection + reschedule
- Service upselling during booking
- Confirmation + reminder sequences

**Key Features:**
- 24/7 voice booking
- No-show recovery
- AI-driven upsell prompts
- Chair-level scheduling

**Requirements:** You provide the services.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, Twilio Realtime
- Recommended: Square POS
- Helpful if approved: Twilio A2P (SMS confirmations)

**Revenue Model:** Booking fee (e.g., $5/appt) or monthly SaaS ($79–$199/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 12. Personal Training & Fitness Coaching Business

**Tier:** Service

**Description:** Archie books training sessions, sends workout reminders, collects payments, and tracks client attendance and progress.

**Demo Preview:** Coach dashboard with session schedule, client attendance, and progress tracker.

**What Archie Handles:**
- Session booking + reminders
- Payment collection
- Attendance + progress tracking
- Client plan delivery

**Key Features:**
- Booking calendar
- Plan + reminder delivery
- Payment automation
- Progress dashboard

**Requirements:** You train the clients.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark
- Recommended: HealthKit / Google Fit
- Helpful if approved: Whoop / Oura

**Revenue Model:** Per-session ($50–$150) or package ($200–$800/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 13. Virtual Assistant Freelance Service

**Tier:** Service

**Description:** Archie manages your own client inbox, calendar, invoicing, and follow-ups while you focus on high-value work.

**Demo Preview:** VA dashboard with inbox triage, calendar, and invoice status.

**What Archie Handles:**
- Inbox triage + responses
- Calendar management
- Invoicing + follow-ups
- Task coordination

**Key Features:**
- Email triage
- Calendar management
- Invoice generator
- Task tracker

**Requirements:** You handle client-facing strategic work.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Google Calendar API
- Recommended: HubSpot, Notion API
- Helpful if approved: Gmail / Outlook delegation

**Revenue Model:** Monthly retainer ($500–$2k/mo per client).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 14. Pet Sitting & Dog Walking Booking Service

**Tier:** Service

**Description:** Archie takes booking calls, coordinates schedules, sends reminders, and handles client payments and reviews.

**Demo Preview:** Multi-sitter schedule with booking flow, client profiles, and review collection.

**What Archie Handles:**
- Booking intake + assignment
- Schedule coordination
- Reminders + payment
- Post-visit review requests

**Key Features:**
- Multi-sitter scheduling
- Client pet profile database
- Payment automation
- Review collection

**Requirements:** You (and any staff) do the walks/sits.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, Twilio Realtime
- Recommended: Mapbox for route planning
- Helpful if approved: Twilio A2P

**Revenue Model:** Per-visit ($20–$75) or monthly packages.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 15. House Cleaning & Organizing Service

**Tier:** Service

**Description:** Archie books jobs, sends quotes, dispatches your team, and runs automated follow-up and review requests.

**Demo Preview:** Job dispatch board with quote flow, team schedule, and follow-up automation.

**What Archie Handles:**
- Job intake + quoting
- Team dispatch + scheduling
- Payment + follow-up sequences
- Review collection

**Key Features:**
- Quote generator
- Team dispatch board
- Follow-up automation
- Review request engine

**Requirements:** You (and/or team) do the cleaning.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, Twilio Realtime, Mapbox
- Recommended: Jobber / Housecall Pro APIs
- Helpful if approved: Twilio A2P

**Revenue Model:** Per-job ($100–$500) or recurring plans ($200–$800/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Education & Skill-Based

### 16. Online Tutoring Service

**Tier:** Service

**Description:** Archie qualifies students, books tutoring sessions, sends lesson materials, and tracks progress and payments.

**Demo Preview:** Tutor dashboard with student roster, lesson calendar, and progress graphs.

**What Archie Handles:**
- Student onboarding + placement
- Session booking
- Lesson material delivery
- Progress tracking + billing

**Key Features:**
- Student CRM
- Lesson scheduler
- Material auto-delivery
- Progress dashboard

**Requirements:** You tutor.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, LiveKit (video)
- Recommended: Google Classroom API
- Helpful if approved: School district SSO for B2B

**Revenue Model:** Per-session ($30–$100) or monthly packages.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 17. Language Teaching Practice

**Tier:** Service

**Description:** Archie handles all trial lesson bookings, sends practice materials, and runs automated conversation reminder sequences.

**Demo Preview:** Language class schedule, student practice log, and conversation reminder preview.

**What Archie Handles:**
- Trial lesson booking
- Practice material delivery
- Conversation reminders
- Billing + scheduling

**Key Features:**
- Trial flow + conversion
- Practice resource library
- Reminder sequences
- Progress tracking

**Requirements:** You teach the lessons.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, LiveKit
- Recommended: ElevenLabs for pronunciation examples
- Helpful if approved: SSO for schools

**Revenue Model:** Per-session ($25–$60) or packages.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 18. Music Lesson Studio

**Tier:** Service

**Description:** Archie books lessons, sends sheet music and practice reminders, collects tuition, and manages rescheduling.

**Demo Preview:** Studio schedule with student roster, sheet music library, and tuition tracker.

**What Archie Handles:**
- Lesson booking + reschedules
- Sheet music delivery
- Practice reminders
- Tuition collection

**Key Features:**
- Multi-student scheduler
- Sheet music library
- Practice reminder engine
- Tuition automation

**Requirements:** You teach.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark
- Recommended: Sheet music storage (Dropbox), LiveKit for remote lessons
- Helpful if approved: Noteflight / Flat.io integration

**Revenue Model:** Per-lesson ($30–$80) or monthly tuition.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 19. Public Speaking Coaching Business

**Tier:** Service

**Description:** Archie qualifies clients, books practice sessions, sends recording feedback forms, and follows up on goals.

**Demo Preview:** Coaching dashboard with practice sessions, recording reviews, and goal tracker.

**What Archie Handles:**
- Client qualification
- Session booking
- Recording feedback form delivery
- Goal check-ins

**Key Features:**
- Session scheduler
- Recording review workflow
- Goal tracking
- Client portal

**Requirements:** You coach.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, LiveKit + Mux
- Recommended: Descript for transcription
- Helpful if approved: Toastmasters API

**Revenue Model:** Packages ($500–$3k per client).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 20. Cooking Class & Recipe Coaching Service

**Tier:** Service

**Description:** Archie manages class sign-ups, sends ingredient lists and prep reminders, and processes payments automatically.

**Demo Preview:** Class calendar with sign-ups, ingredient lists, and recipe delivery portal.

**What Archie Handles:**
- Class sign-up management
- Ingredient list generation
- Prep reminder sequences
- Payment processing

**Key Features:**
- Class scheduler
- Auto-generated ingredient lists
- Prep reminders
- Recipe library

**Requirements:** You teach the classes.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, LiveKit
- Recommended: Spoonacular API for recipes, Instacart for ingredient delivery
- Helpful if approved: Amazon Fresh

**Revenue Model:** Per-class ($30–$100) or subscription.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Sales & Client-Facing Services

### 21. Real Estate Agent Support System

**Tier:** Service

**Description:** Archie handles all lead calls, books property showings, sends listing previews, and nurtures follow-ups for you.

**Demo Preview:** Agent dashboard with lead pipeline, showing calendar, and listing preview sender.

**What Archie Handles:**
- Lead intake + qualification
- Showing scheduling
- Listing preview delivery
- Follow-up sequences

**Key Features:**
- 24/7 lead intake
- Showing scheduler
- Listing blast engine
- Follow-up pipeline

**Requirements:** You show properties and close deals (compliance-dependent).

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, Twilio Realtime
- Recommended: FUB/HubSpot CRM, Attom, BatchData
- Helpful if approved: MLS access (market-dependent), Twilio A2P

**Revenue Model:** Monthly subscription from agent ($99–$499/mo) or per-lead fee.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 22. Mortgage Broker Intake Service

**Tier:** Service

**Description:** Archie qualifies borrowers, collects documents, books consultation calls, and sends status updates.

**Demo Preview:** Broker dashboard with borrower pipeline, doc collection checklist, and status update log.

**What Archie Handles:**
- Borrower intake + pre-qual
- Document collection
- Consultation booking
- Status update sequences

**Key Features:**
- Borrower CRM
- Doc upload + verification
- Consultation scheduler
- Compliance-aware comms

**Requirements:** You handle the actual mortgage brokering.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, DocuSign
- Recommended: Plaid for income verification, Encompass/Arive APIs
- Helpful if approved: Credit bureau integrations

**Revenue Model:** Monthly SaaS ($199–$999/mo) from broker.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 23. Insurance Agency Client Service Desk

**Tier:** Service

**Description:** Archie takes quote requests, books policy reviews, sends renewal reminders, and handles basic claims intake.

**Demo Preview:** Agency service desk with quote queue, renewal calendar, and claims intake flow.

**What Archie Handles:**
- Quote request intake
- Policy review scheduling
- Renewal reminder sequences
- Basic claims intake + handoff

**Key Features:**
- Quote form + triage
- Renewal calendar
- Claims intake flow
- Client portal

**Requirements:** You bind policies and handle complex claims.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, Twilio Realtime
- Recommended: AMS360, Applied Epic APIs
- Helpful if approved: Twilio A2P

**Revenue Model:** Monthly SaaS from agency ($199–$999/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 24. Tax Prep & Accounting Service

**Tier:** Service

**Description:** Archie gathers client documents, books review calls with you, sends preliminary forms, and tracks deadlines.

**Demo Preview:** Tax season dashboard with client doc checklists, review calendar, and deadline tracker.

**What Archie Handles:**
- Document gathering + checklist
- Review call booking
- Preliminary form delivery
- Deadline tracking

**Key Features:**
- Doc checklist + upload portal
- Review scheduler
- Deadline dashboard
- Client comms

**Requirements:** You prepare the returns.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, DocuSign
- Recommended: QuickBooks, Xero, Plaid
- Helpful if approved: IRS e-File Partner APIs

**Revenue Model:** Per-return ($200–$2k) or subscription ($49–$199/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 25. Consulting Intake & Proposal System

**Tier:** Service

**Description:** Archie qualifies leads, books discovery calls, generates proposals for your review, and follows up on signed contracts.

**Demo Preview:** Consulting dashboard with lead scoring, discovery calendar, and proposal generator.

**What Archie Handles:**
- Lead qualification + routing
- Discovery call booking
- Proposal generation
- Contract follow-ups

**Key Features:**
- Lead scoring engine
- Discovery call scheduler
- Proposal template library
- Contract pipeline

**Requirements:** You consult.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, DocuSign
- Recommended: HubSpot CRM, OpenAI for proposal drafting
- Helpful if approved: LinkedIn Sales Navigator

**Revenue Model:** Consulting project fees ($2k–$50k+).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Niche Services

### 26. Event Planning Freelance Service

**Tier:** Service

**Description:** Archie books vendor calls, creates timelines, sends client questionnaires, and manages RSVPs and payments.

**Demo Preview:** Event dashboard with timeline, vendor roster, RSVP list, and payment tracker.

**What Archie Handles:**
- Vendor coordination
- Timeline creation
- Client questionnaires
- RSVP + payment management

**Key Features:**
- Event timeline generator
- Vendor CRM
- RSVP manager
- Budget tracker

**Requirements:** You plan the events.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark
- Recommended: Zapier MCP for vendor variety, Lob for physical invites
- Helpful if approved: Eventbrite / Rsvpify APIs

**Revenue Model:** Planning fee ($1k–$25k) + vendor commissions.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 27. Resume Writing & Career Services Business

**Tier:** Service

**Description:** Archie collects client info, books review calls, delivers polished resumes/cover letters, and follows up on job applications.

**Demo Preview:** Client dashboard with resume builder, review calendar, and application tracker.

**What Archie Handles:**
- Client info collection
- Review call scheduling
- Resume/cover letter drafting
- Application follow-up

**Key Features:**
- Resume builder
- Review scheduler
- Application tracker
- Follow-up sequences

**Requirements:** You review final drafts and run live coaching.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, OpenAI
- Recommended: Indeed API
- Helpful if approved: LinkedIn Easy Apply

**Revenue Model:** Packages ($99–$999 per client).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 28. Podcast Guest Booking Service

**Tier:** Service

**Description:** Archie finds and qualifies guests, books recording slots, sends prep materials, and handles all follow-up emails.

**Demo Preview:** Guest pipeline with source list, booking calendar, and prep packet delivery.

**What Archie Handles:**
- Guest research + outreach
- Booking + prep materials
- Follow-up emails
- Episode scheduling

**Key Features:**
- Guest pipeline
- Prep packet generator
- Booking calendar
- Follow-up automation

**Requirements:** You record the interviews.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark
- Recommended: Apollo for guest research
- Helpful if approved: LinkedIn for outreach

**Revenue Model:** Monthly retainer ($1k–$5k/mo per podcast).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 29. Virtual Event Hosting & Webinar Service

**Tier:** Service

**Description:** Archie manages registrations, sends reminders, runs attendee check-ins, and sends post-event surveys and recordings.

**Demo Preview:** Event ops dashboard with registration count, reminder queue, and post-event survey results.

**What Archie Handles:**
- Registration management
- Reminder sequences
- Attendee check-ins
- Post-event surveys + recording delivery

**Key Features:**
- Registration flow
- Reminder engine
- Check-in dashboard
- Post-event automation

**Requirements:** You host the actual event.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, LiveKit + Mux
- Recommended: Zoom SDK for hybrid, Twilio Realtime
- Helpful if approved: Zoom Events, Hopin APIs

**Revenue Model:** Per-event ($500–$5k) or monthly SaaS ($99–$499/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 30. Personal Branding & Influencer Support Service

**Tier:** Service

**Description:** Archie handles DMs/comments, books brand collab calls, schedules content, and tracks engagement metrics for you.

**Demo Preview:** Creator ops dashboard with DM queue, brand collab pipeline, content scheduler, and metrics dashboard.

**What Archie Handles:**
- DM + comment engagement
- Brand collab intake + scheduling
- Content scheduling
- Metrics + reporting

**Key Features:**
- DM triage in brand voice
- Collab pipeline
- Content scheduler
- Metrics dashboard

**Requirements:** You create the content and attend collab calls.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark
- Recommended: Buffer / Hootsuite APIs
- Helpful if approved: Instagram, X, TikTok APIs

**Revenue Model:** Monthly retainer ($1k–$5k/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

# Role Templates (Tier 4)

_Archie plugs into an existing business as one specialized AI employee. Narrowest scope. Fastest time-to-value._

## Voice & Call Handling Roles

### 1. Archie as 24/7 Inbound Voice Call Handler

**Tier:** Role

**Description:** Answers every phone call live via Twilio, qualifies the caller, books appointments, and logs everything into your CRM.

**Demo Preview:** Call-center dashboard with live incoming call simulation, real-time qualification script, CRM lookup panel, and instant booking calendar.

**What Archie Handles:**
- Answering all inbound calls 24/7 with natural voice
- Qualifying callers using your criteria
- Booking appointments
- Logging + CRM sync + follow-up triggers

**Key Features:**
- Twilio voice integration
- Qualification script
- Calendar booking
- Call transcripts + summaries

**Requirements:** Your existing phone number connected to Twilio.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe (for Archie Bravo billing), Twilio Realtime, OpenAI Realtime, Cal.com
- Recommended: ElevenLabs, HubSpot / FUB CRM
- Helpful if approved: Twilio A2P for SMS follow-ups

**Revenue Model (your business):** Captures revenue from all inbound leads. Archie Bravo charges you a flat monthly ($99–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 2. Archie as Outbound Appointment Setter

**Tier:** Role

**Description:** Runs cold calls or SMS sequences, books qualified meetings, and syncs them straight to your calendar.

**Demo Preview:** Outbound campaign dashboard showing contact list, SMS/voice sequence builder, live booking calendar sync, and performance metrics.

**What Archie Handles:**
- Outbound calling or SMS campaigns
- Real-time prospect qualification
- Meeting booking
- Calendar sync

**Key Features:**
- Multi-channel outreach
- Personalized messaging at scale
- Calendar integration
- Performance dashboard

**Requirements:** Contact list + basic outreach script from you.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Twilio Realtime, Cal.com
- Recommended: Apollo/Clay for list enrichment, OpenAI
- Helpful if approved: Twilio A2P

**Revenue Model:** Monthly subscription ($149–$499/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 3. Archie as No-Show & Reschedule Specialist

**Tier:** Role

**Description:** Detects missed appointments, calls/texts to reschedule, and fills the slot automatically.

**Demo Preview:** Appointment dashboard with missed-call alerts, reschedule flow, and auto-fill calendar slots.

**What Archie Handles:**
- No-show monitoring
- Reschedule call/text
- Auto-fill from waitlist
- Calendar + CRM sync

**Key Features:**
- Real-time no-show detection
- Reschedule script engine
- Waitlist auto-fill
- Audit log

**Requirements:** Calendar + CRM access.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Twilio Realtime, Postmark
- Recommended: CRM of choice
- Helpful if approved: Twilio A2P

**Revenue Model:** Monthly subscription ($49–$149/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 4. Archie as Live Chat + Voice Escalation Agent

**Tier:** Role

**Description:** Handles website chat first, then jumps to voice call if needed — seamless handoff.

**Demo Preview:** Website chat window with live escalation button, seamless voice handoff simulation, and CRM sync.

**What Archie Handles:**
- Website chat ownership
- Escalation to voice call when needed
- Context persistence across handoff
- CRM logging

**Key Features:**
- Chat-to-voice escalation
- Consistent brand voice
- Context retention
- Transcript capture

**Requirements:** Website chat widget deployment.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Twilio Realtime, OpenAI Realtime
- Recommended: Intercom, Crisp, Drift APIs
- Helpful if approved: Twilio A2P

**Revenue Model:** Monthly subscription ($99–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Sales & Lead Generation Roles

### 5. Archie as Lead Qualifier & Nurturer

**Tier:** Role

**Description:** Scores every new lead, sends personalized sequences, and only hands hot ones to you.

**Demo Preview:** Lead pipeline dashboard with scoring, personalized nurture sequences, and hot-lead handoff alerts.

**What Archie Handles:**
- Lead scoring + tagging
- Automated nurture sequences
- Hot-lead alerts
- Activity history in CRM

**Key Features:**
- Smart lead-scoring engine
- Multi-channel nurture
- One-click hot-lead handoff
- CRM activity log

**Requirements:** Access to lead sources + CRM.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: HubSpot / FUB / Pipedrive, Twilio Realtime
- Helpful if approved: LinkedIn outreach

**Revenue Model:** Monthly subscription ($149–$499/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 6. Archie as Proposal & Quote Generator

**Tier:** Role

**Description:** Takes client details, builds custom proposals/quotes, and sends them for your one-click approval.

**Demo Preview:** Proposal builder dashboard with client data pull, custom template, and one-click approval/send flow.

**What Archie Handles:**
- Client data pull from CRM
- Proposal generation
- Approval workflow
- Delivery + tracking

**Key Features:**
- Instant proposal generation
- One-click approval
- Follow-up reminders
- Conversion tracking

**Requirements:** Existing proposal templates.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, DocuSign, Postmark
- Recommended: PandaDoc API alternative, HubSpot
- Helpful if approved: SSO for enterprise

**Revenue Model:** Monthly subscription ($79–$249/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 7. Archie as Follow-Up & Closing Assistant

**Tier:** Role

**Description:** Sends automated reminders, handles objections via chat/voice, and collects signatures.

**Demo Preview:** Follow-up dashboard showing open deals, objection-handling scripts, and signature collection flow.

**What Archie Handles:**
- Multi-touch follow-up sequences
- Objection handling
- Signature collection
- Deal status updates

**Key Features:**
- Follow-up automation
- Objection response library
- E-signature integration
- Deal velocity tracking

**Requirements:** Access to open deals in CRM.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, DocuSign, Twilio Realtime
- Recommended: HubSpot / FUB
- Helpful if approved: Twilio A2P

**Revenue Model:** Monthly subscription ($99–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 8. Archie as Upsell & Cross-Sell Specialist

**Tier:** Role

**Description:** Analyzes past purchases and proactively offers upgrades or add-ons at the perfect moment.

**Demo Preview:** Customer history dashboard with timing triggers, upsell scripts, and offer delivery.

**What Archie Handles:**
- Purchase history analysis
- Trigger-based offer creation
- Personalized offer delivery
- Processing add-on sales

**Key Features:**
- Timing-based offer engine
- Personalized scripts
- Seamless checkout
- Revenue impact reporting

**Requirements:** Access to customer purchase data.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Shopify, WooCommerce APIs
- Helpful if approved: SMS delivery via Twilio A2P

**Revenue Model:** Monthly subscription ($99–$299/mo) + % of upsell revenue.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Customer Support & Retention Roles

### 9. Archie as Ticket Resolution Agent

**Tier:** Role

**Description:** Owns your helpdesk — responds, resolves common issues, and escalates only the complex ones.

**Demo Preview:** Helpdesk dashboard with ticket queue, auto-response rules, and escalation button.

**What Archie Handles:**
- Support ticket responses
- Common issue resolution
- Escalation of complex tickets
- Resolution logging

**Key Features:**
- Auto-categorization
- Knowledge-base replies
- One-click escalation
- CSAT tracking

**Requirements:** Existing helpdesk or email.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Zendesk, Intercom, Help Scout APIs
- Helpful if approved: Slack for internal escalations

**Revenue Model:** Monthly subscription ($149–$499/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 10. Archie as Review & Testimonial Collector

**Tier:** Role

**Description:** Automatically asks for reviews after every job, sends thank-yous, and posts them to your site.

**Demo Preview:** Post-job dashboard with automated review request flow, testimonial video prompt, and posting preview.

**What Archie Handles:**
- Review request timing
- Written + video testimonial collection
- Thank-you messaging
- Publishing to site

**Key Features:**
- Timing-optimized prompts
- Video testimonial recorder
- Auto-publish to site/Google
- Analytics dashboard

**Requirements:** Access to customer list after jobs.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Google Business Profile API, Trustpilot / Yelp APIs
- Helpful if approved: Twilio A2P

**Revenue Model:** Monthly subscription ($49–$149/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 11. Archie as Loyalty & Retention Manager

**Tier:** Role

**Description:** Runs re-engagement campaigns, sends win-back offers, and tracks churn risk.

**Demo Preview:** Retention dashboard with churn-risk scores, campaign library, and win-back performance.

**What Archie Handles:**
- Churn-risk scoring
- Re-engagement campaigns
- Win-back offer delivery
- Retention reporting

**Key Features:**
- Churn prediction model
- Campaign library
- Offer personalization
- Retention dashboard

**Requirements:** Customer usage data.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Segment / Rudderstack, Mixpanel
- Helpful if approved: Twilio A2P

**Revenue Model:** Monthly subscription ($149–$499/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Content & Marketing Roles

### 12. Archie as Social Media Reply & Engagement Bot

**Tier:** Role

**Description:** Monitors all comments and DMs across platforms and responds in your brand voice 24/7.

**Demo Preview:** Unified social inbox with AI-drafted replies and sentiment tagging.

**What Archie Handles:**
- Comment + DM monitoring
- Brand-voice responses
- Sentiment + escalation tagging
- Daily engagement summary

**Key Features:**
- Unified social inbox
- Brand voice training
- Escalation flagging
- Engagement analytics

**Requirements:** Connect social accounts.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Buffer / Hootsuite, Sprout APIs
- Helpful if approved: IG / X / LinkedIn APIs for direct replies

**Revenue Model:** Monthly subscription ($99–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 13. Archie as Email Sequence & Newsletter Writer

**Tier:** Role

**Description:** Writes, designs, and sends your weekly emails or nurture sequences from your brief.

**Demo Preview:** Email builder with AI drafts, sequence flow, and deliverability dashboard.

**What Archie Handles:**
- Email copywriting
- Sequence building + sending
- List management
- Performance reporting

**Key Features:**
- AI email drafts in brand voice
- Sequence builder
- Deliverability management
- Performance dashboard

**Requirements:** Email list + brand voice brief.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Beehiiv / Substack / ConvertKit APIs
- Helpful if approved: Gmail API (gated)

**Revenue Model:** Monthly subscription ($99–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 14. Archie as Ad Copy & Landing Page Optimizer

**Tier:** Role

**Description:** Tests new ad variations and landing pages, pauses losers, and scales winners automatically.

**Demo Preview:** Ad performance dashboard with A/B test results, auto-pause triggers, and winner scaling.

**What Archie Handles:**
- Ad variation generation
- Landing page A/B tests
- Auto-pause losers
- Scale winners + report

**Key Features:**
- Ad creative + copy generator
- Landing page variant deployment
- Auto-optimization rules
- ROI reports

**Requirements:** Ad account access.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Meta Ads API, Google Ads API
- Helpful if approved: TikTok Business, LinkedIn Campaign Manager

**Revenue Model:** Monthly subscription ($199–$999/mo) + % of ad spend.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 15. Archie as Content Repurposer

**Tier:** Role

**Description:** Takes one piece of your content and turns it into 20+ assets (clips, posts, threads, emails).

**Demo Preview:** Source content uploader with fan-out preview showing 20+ generated assets.

**What Archie Handles:**
- Source ingestion
- Fan-out generation (video clips, social posts, emails, threads)
- Scheduling per channel
- Performance analytics

**Key Features:**
- 1-to-many asset generation
- Multi-format outputs
- Per-channel scheduling
- Performance dashboard

**Requirements:** Source content (video, podcast, article, etc.).

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Descript, Buffer / Hootsuite, OpenAI
- Helpful if approved: Platform APIs for direct posting

**Revenue Model:** Monthly subscription ($99–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Scheduling & Operations Roles

### 16. Archie as Calendar & Availability Manager

**Tier:** Role

**Description:** Syncs all your calendars, handles double-bookings, and books client slots instantly.

**Demo Preview:** Unified calendar with availability detection, double-book resolver, and instant booking link.

**What Archie Handles:**
- Multi-calendar sync
- Availability detection
- Double-book resolution
- Instant booking

**Key Features:**
- Unified calendar
- Conflict resolver
- Smart scheduling
- Booking link + embed

**Requirements:** Calendar access (Google / Outlook).

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Cal.com
- Recommended: Google Calendar, Microsoft Graph
- Helpful if approved: Enterprise SSO

**Revenue Model:** Monthly subscription ($49–$149/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 17. Archie as Invoice & Payment Chaser

**Tier:** Role

**Description:** Sends invoices, reminds late payers, processes payments, and updates your books.

**Demo Preview:** Invoice dashboard with aging report, reminder queue, and payment tracking.

**What Archie Handles:**
- Invoice generation + sending
- Late-payer reminder sequences
- Payment processing
- Books updates

**Key Features:**
- Invoice generator
- Aging dashboard
- Smart reminder cadence
- Accounting sync

**Requirements:** Accounting tool access.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: QuickBooks, Xero, FreshBooks APIs
- Helpful if approved: Plaid for ACH

**Revenue Model:** Monthly subscription ($49–$149/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 18. Archie as Document & Contract Manager

**Tier:** Role

**Description:** Generates, sends, and tracks e-signatures on all your agreements.

**Demo Preview:** Contract dashboard with template picker, send flow, and signature tracking.

**What Archie Handles:**
- Contract template generation
- Send + e-signature flow
- Status tracking
- Archive + renewals

**Key Features:**
- Template library
- E-signature
- Renewal alerts
- Searchable archive

**Requirements:** Existing contract templates.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, DocuSign
- Recommended: PandaDoc alternative
- Helpful if approved: SSO for enterprise

**Revenue Model:** Monthly subscription ($79–$249/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Creative & Production Roles

### 19. Archie as Video Editor & Asset Producer

**Tier:** Role

**Description:** Takes raw files, edits them to your style, adds captions/voiceover, and delivers ready-to-post.

**Demo Preview:** Raw-to-finished pipeline with style preset selector and delivery portal.

**What Archie Handles:**
- Raw footage ingestion
- Style-based editing
- Captions + voiceover
- Delivery

**Key Features:**
- Style preset library
- Auto-captions
- AI voiceover
- Delivery portal

**Requirements:** Raw footage + style brief.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Mux
- Recommended: Descript, ElevenLabs
- Helpful if approved: Frame.io

**Revenue Model:** Monthly subscription ($199–$699/mo) or per-video.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 20. Archie as Graphic Design Asset Creator

**Tier:** Role

**Description:** Generates social graphics, thumbnails, flyers — whatever you brief him on.

**Demo Preview:** Asset request form with brand kit + instant preview grid.

**What Archie Handles:**
- Asset brief intake
- Generation per brand kit
- Revision cycles
- Export + delivery

**Key Features:**
- Brand kit
- Multi-format generation
- Revision flow
- Asset library

**Requirements:** Brand kit (logo, colors, fonts).

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Replicate / Stability, Figma API
- Helpful if approved: Canva API

**Revenue Model:** Monthly subscription ($99–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 21. Archie as Podcast Episode Producer

**Tier:** Role

**Description:** Edits audio, writes show notes, creates chapters, and schedules distribution.

**Demo Preview:** Episode workflow with audio editor, show notes draft, and distribution queue.

**What Archie Handles:**
- Audio cleanup + editing
- Show notes + chapters
- Distribution scheduling
- Analytics

**Key Features:**
- Auto audio cleanup
- Show notes generator
- Chapter + transcript creation
- Multi-platform distribution

**Requirements:** Recorded episodes.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Mux
- Recommended: Descript, Whisper, ElevenLabs
- Helpful if approved: Apple Podcasts Connect, Spotify APIs

**Revenue Model:** Per-episode ($49–$199) or monthly subscription.

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Data & Analytics Roles

### 22. Archie as Performance Dashboard Monitor

**Tier:** Role

**Description:** Watches your ads, website, and CRM 24/7 and sends daily/weekly insight reports with action items.

**Demo Preview:** Unified metrics dashboard with anomaly alerts and recommended actions.

**What Archie Handles:**
- Metrics aggregation
- Anomaly detection
- Daily/weekly reports
- Action recommendations

**Key Features:**
- Unified dashboard
- Anomaly engine
- Report generation
- Recommendation library

**Requirements:** Access to relevant platforms.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: GA4, Mixpanel, Meta / Google Ads APIs
- Helpful if approved: Looker / Tableau embeds

**Revenue Model:** Monthly subscription ($99–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 23. Archie as SEO Audit & Fix Runner

**Tier:** Role

**Description:** Scans your site weekly, flags issues, and implements basic fixes.

**Demo Preview:** SEO audit dashboard with issue list, fix preview, and ranking tracker.

**What Archie Handles:**
- Weekly site audits
- Issue prioritization
- Basic fix implementation
- Ranking tracking

**Key Features:**
- Audit engine
- Issue prioritization
- Auto-fix for common issues
- Rank tracker

**Requirements:** Site access + GSC connection.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Google Search Console
- Recommended: Ahrefs / DataForSEO, Screaming Frog
- Helpful if approved: Semrush API

**Revenue Model:** Monthly subscription ($99–$399/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 24. Archie as Inventory & Stock Alert System

**Tier:** Role

**Description:** Tracks product levels across stores and auto-reorders before you run out.

**Demo Preview:** Multi-store inventory view with reorder triggers and supplier dispatch.

**What Archie Handles:**
- Inventory monitoring
- Reorder triggers
- Supplier orders
- Alerts + reports

**Key Features:**
- Multi-store view
- Reorder automation
- Supplier integration
- Forecast reports

**Requirements:** Store / POS access.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Shopify, Square, WooCommerce
- Helpful if approved: Supplier EDI integrations

**Revenue Model:** Monthly subscription ($99–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

## Niche Specialized Roles

### 25. Archie as Discovery Call Booker

**Tier:** Role

**Description:** Qualifies every inbound lead and gets them on your calendar for a sales call.

**Demo Preview:** Lead pipeline with qualification flow and discovery call schedule.

**What Archie Handles:**
- Inbound lead qualification
- Calendar booking
- Prep material delivery
- Follow-up on no-shows

**Key Features:**
- Qualification script
- Instant booking
- Prep email
- No-show recovery

**Requirements:** Sales process + calendar.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark, Twilio Realtime
- Recommended: HubSpot, Salesforce
- Helpful if approved: LinkedIn outreach

**Revenue Model:** Monthly subscription ($79–$249/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 26. Archie as Client Onboarding & Welcome Specialist

**Tier:** Role

**Description:** Sends welcome packets, schedules kickoff calls, and walks new clients through setup.

**Demo Preview:** New-client onboarding flow with welcome packet, kickoff calendar, and setup wizard.

**What Archie Handles:**
- Welcome packet delivery
- Kickoff scheduling
- Setup walkthrough
- Onboarding completion tracking

**Key Features:**
- Welcome packet builder
- Kickoff scheduler
- Setup walkthrough wizard
- Completion dashboard

**Requirements:** Existing onboarding materials.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Cal.com, Postmark
- Recommended: Intercom, Loom
- Helpful if approved: Notion API for templates

**Revenue Model:** Monthly subscription ($49–$199/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 27. Archie as Refund & Cancellation Handler

**Tier:** Role

**Description:** Processes refund requests per your rules while trying to save the customer first.

**Demo Preview:** Refund queue with save-attempt flow and policy-compliant processing.

**What Archie Handles:**
- Refund request intake
- Save-attempt conversations
- Policy-compliant processing
- Log + report

**Key Features:**
- Save-attempt flow
- Policy engine
- Processing + refund issuance
- Analytics

**Requirements:** Refund policy + payment platform.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Shopify, Zendesk
- Helpful if approved: SMS / voice

**Revenue Model:** Monthly subscription ($79–$249/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 28. Archie as Referral Program Manager

**Tier:** Role

**Description:** Tracks referrals, sends rewards, and automates the entire loop.

**Demo Preview:** Referral dashboard with per-user links, conversion tracking, and reward dispatch.

**What Archie Handles:**
- Referral link generation
- Conversion tracking
- Reward dispatch
- Program analytics

**Key Features:**
- Unique referral links
- Attribution + tracking
- Automated reward payout
- Leaderboard

**Requirements:** Customer list + reward budget.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark
- Recommended: Rewardful / FirstPromoter alternative, Shopify
- Helpful if approved: Gift card APIs (Tango, Giftbit)

**Revenue Model:** Monthly subscription ($79–$249/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 29. Archie as Testimonial Video Collector

**Tier:** Role

**Description:** Prompts happy clients, records short video testimonials via link, and edits them.

**Demo Preview:** Testimonial request flow with in-browser recording, editing, and gallery.

**What Archie Handles:**
- Client prompts for testimonials
- Browser-based recording
- Light editing + captions
- Publishing to site

**Key Features:**
- Browser recorder
- Auto captions
- Gallery + embed
- Post-record thank you

**Requirements:** Happy client list.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Mux
- Recommended: Descript for captions
- Helpful if approved: Video Ask, Testimonial.to APIs

**Revenue Model:** Monthly subscription ($49–$149/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

### 30. Archie as Competitor & Market Watcher

**Tier:** Role

**Description:** Monitors competitor pricing/moves and sends you weekly intelligence briefings.

**Demo Preview:** Competitor radar with pricing diff, new product alerts, and weekly brief preview.

**What Archie Handles:**
- Competitor monitoring via web scraping
- Pricing + product diffs
- Weekly brief generation
- Alert on significant moves

**Key Features:**
- Multi-competitor tracking
- Pricing diff engine
- Weekly briefing
- Alert rules

**Requirements:** Competitor list.

**Integrations:**
- Required: Supabase, Vercel, GitHub, Stripe, Postmark, Browserbase + Stagehand
- Recommended: DataForSEO, SimilarWeb APIs
- Helpful if approved: Specialized industry data providers

**Revenue Model:** Monthly subscription ($99–$299/mo).

**Business Operating Manual:** Auto-filled by Archie on launch.

---

# End of Template Examples

This file contains ~120 launch-ready template cards across the four tiers. Each follows the canonical format defined in `ARCHIE_BRAVO.md`:

- Title, Tier, Description
- Demo Preview (interactive scaffold description)
- What Archie Handles
- Key Features
- Requirements (the honest trust line)
- Integrations (Required / Recommended / Helpful if approved)
- Revenue Model
- Business Operating Manual (auto-filled on launch)

These are starting points — the Business Operating Manual per template gets expanded by Archie with the user's clarifying answers on launch.

**When to edit this file:** whenever a new template concept is validated. Add new cards in the right tier section.

**When to reference this file:** when building the North Stars gallery UI, when writing template-specific clarifying-question prompts, when authoring the Business Operating Manual defaults per template.
