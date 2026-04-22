# Business Operating Manual — Section Brainstorm

_Created: 2026-04-18. Last updated: 2026-04-19._
_Companion to `ARCHIE_BRAVO.md`. Brainstorm of candidate sections for the Business Operating Manual — the persistent, per-NS memory + operating contract Archie reads at every wake._

The Manual is to Archie what a GEICO employee handbook is to a new hire — but richer, because Archie never sleeps, never forgets, and starts with no prior context beyond this document.

**The sections below are EXAMPLES.** Not final. Operator will cut, merge, rename, and add as the real schema is authored. The point of this doc is the shape — clusters, what we're trying to cover, and the runtime architecture that consumes them.

## Candidate Section Examples

### 1. Identity & Brand

1. Business legal name + entity type (LLC, S-Corp, etc.)
2. DBA / trade name / primary domain
3. Elevator pitches (30s / 2-min / 10-min variants)
4. Mission, vision, 3-5yr ambition
5. Core values + operating principles
6. Brand voice adjectives + reading level
7. Voice examples — do-say / don't-say pairs
8. Do-not-say list + off-limits topics (politics, competitor bashing, medical claims, etc.)
9. Visual identity (colors, fonts, logo paths, asset locations)
10. Origin story / founding context

### 2. What We Sell

11. Product / service catalog (canonical SKUs)
12. Long + short descriptions per offering
13. Current price list (with price-change history)
14. Bundles / tiers / subscription plans
15. Discount authority + rules (who can discount how much)
16. Refund / cancellation / chargeback policy
17. What we don't sell — scope boundaries
18. Custom-work policy (what we'll build vs. won't)
19. Product roadmap (shipped / in-flight / planned / icebox)
20. Upsell + cross-sell map

### 3. Customer

21. ICP definition (firmographic + behavioral)
22. Customer personas (2-5, with decision criteria)
23. Pain points + desired outcomes
24. Buyer journey stages (aware → considering → trialing → paying)
25. Geographic scope (countries/states served and not served)
26. Language support
27. Disqualifiers — who we reject and why
28. Customer segments (VIP / standard / at-risk / churned)
29. Churn predictors + health signals
30. Voice-of-customer sources (where feedback lives)

### 4. Archie's Role & Authority

31. Canonical responsibilities list (what Archie owns end-to-end)
32. Hard "never does" list (legal, brand, ethical, craft-reserved)
33. Human-delivered work — the craft line (shoot / call / session / file)
34. Decision thresholds ($X auto / $Y ask / $Z escalate)
35. Trust level + operating intensity per time window
36. Auto-publish vs. draft-for-review rules (per surface)
37. Escalation tree — who Archie calls when, for what
38. Quiet hours + time zone
39. Load budget (max active items, max daily spend, max outreach/day)
40. Voice + persona when representing the business (vs. talking to owner)

### 5. Customer Communication

41. Tone with customers (scripted examples)
42. Response SLAs per channel (email / chat / SMS / voice)
43. Greetings, signatures, signoff conventions
44. Voicemail + out-of-hours + holiday auto-reply scripts
45. Apology + bad-news playbook
46. Objection-handling library (canonical)
47. FAQ / canonical answers ("how much?", "how long?", "do you offer X?")
48. AI disclosure rules (must say "this is AI"? When? Where?)
49. Two-party consent states (call recording / SMS logging)
50. Human-handoff language (what Archie says when escalating)

### 6. Sales & Marketing

51. Sales funnel stages + entry/exit criteria
52. Lead qualification model (BANT / MEDDIC / custom)
53. Discovery / demo / close scripts
54. Follow-up cadence rules (email / SMS / call sequences)
55. Active marketing channels + budget per channel
56. Content calendar + cadence per platform
57. SEO keyword strategy + current rankings
58. Email / SMS send windows + throttle limits (TCPA, A2P 10DLC)
59. Attribution model + UTM conventions
60. Campaign playbook library (launch, seasonal, reactivation)

### 7. Operations & Daily Rhythm

61. Business hours per channel
62. Daily / weekly / monthly / quarterly rituals (what Archie does when)
63. Holiday calendar + seasonal playbooks (BF, EOY, tax season, industry peaks)
64. Integration + tool stack (tool-of-record for each function)
65. Credential / secret ownership (who controls which API keys)
66. Tech infrastructure (hosting, DB, domain, DNS, CDN)
67. Deploy process + rollback policy + staging→prod rules
68. Inventory / fulfillment rules (if physical)
69. Supplier / vendor list + renewal dates
70. Dependencies + API rate limits to respect

### 8. Money

71. Revenue sources + unit economics (CAC, LTV, margin)
72. North Star metric + guardrail metrics
73. Target MRR / ARR + fiscal year
74. Budget by category
75. Invoice / payment terms (NET 30, deposit rules)
76. Collection + late-payment process
77. Sales tax / VAT jurisdictions
78. Bank + bookkeeping tool of record
79. Expense categorization rules
80. Cash runway + burn visibility

### 9. Legal, Compliance & Risk

81. TOS / privacy / refund URLs + last-updated dates
82. Licenses held (professional + business) + renewal dates
83. Regulatory constraints (HIPAA, GDPR, CCPA, A2P 10DLC, DNC, FCC)
84. Prohibited claims by domain (FTC / FDA / SEC / state bar)
85. Data collected + retention + access rules + breach response
86. Known risks + mitigation plans (key-person, regulatory, competitive)
87. Crisis / incident response playbook + customer comms template
88. Insurance coverage + claim procedure + broker contact
89. IP held (trademarks, copyrights, domain portfolio, social handles)
90. Confidentiality obligations per client + cross-client info rules

### 10. Quality, Learning & Meta

91. Definition of Done per deliverable type (feature, content, email, deal)
92. Quality bar (copy, code, design, CX baseline)
93. Review + approval flow — what needs human sign-off
94. Experiment / A/B test queue + stat bar for calling results
95. KPI reporting cadence + dashboard ownership
96. Feedback triage process (feature requests, complaints, reviews)
97. Testimonials / case study library + consent log
98. Competitive landscape + battlecards (per competitor)
99. Glossary / industry jargon / internal acronyms
100. Manual meta — last reviewed, section owners, change log, review cadence

## Tier Differentiation (Pre-Cut Thinking)

Not every North Star needs all 100. Likely split after cut:

- **Core (all tiers, target ~30–40 sections)** — Identity, brand, voice, quiet hours, Archie's role & authority, escalation tree, money basics, legal disclosures, manual meta.
- **Platform extension** — marketplace rules, take-rate, two-sided moderation, platform abuse policy, fraud playbook.
- **Business extension** — full marketing stack, content calendar, SEO, email lists, revenue ops.
- **Service extension** — booking rules, craft delivery handoff, client-facing comms, SOW templates.
- **Role extension** — narrow scope: Archie's slot, the parent business's rules Archie must obey, hand-off rules, logging format.

## Gemini Pressure-Test Prompt

Paste this to Gemini (or another LLM) to pressure-test before locking the schema:

> I'm building **Archie Bravo** — a platform where users pick a business template and an autonomous AI ("Archie") builds and runs that business 24/7. Archie reads a **Business Operating Manual** as his persistent memory + operating contract. Think: the Manual is to Archie what a GEICO employee handbook is to a new hire — but richer, because Archie never sleeps, never forgets, and starts with no prior context beyond this document.
>
> Help me pressure-test a canonical Manual schema across four template tiers:
> - **Platforms** — multi-sided SaaS / marketplaces (other users pay to use the product)
> - **Businesses** — full digital business, one operator (agencies, newsletters, POD stores)
> - **Services** — operator delivers a craft, Archie owns all ops (coaching, design, tax prep)
> - **Roles** — Archie plugs into an existing business as one specialized employee
>
> My draft is 100 sections in 10 clusters (pasted below). For each section, tell me:
> 1. Is it load-bearing (Archie literally cannot function without it) or nice-to-have?
> 2. Which tier(s) actually need it?
> 3. What fails — concretely — if it's missing or wrong?
> 4. Minimal viable field set inside the section
> 5. Should Archie auto-fill this from the template defaults + onboarding Q&A, or ask the user?
>
> Then:
> - Cut sections that don't pay for themselves
> - Flag duplicates and overlaps
> - Identify sections I missed that an autonomous operator genuinely needs
> - Propose a final split: **Core (all tiers)** vs. **Tier Extensions (Platform / Business / Service / Role)**
> - Aim for the minimum complete schema to run any of ~83 template variants
>
> Be ruthless. Call out bullshit, missing pieces, and anything I'm conflating.
>
> [paste the 100 sections here]

## Next Steps

1. Run the Gemini prompt (or my own cut) against the 100
2. Mark each section: **Core / Platform / Business / Service / Role / Cut**
3. Fill in minimum viable field set per surviving section
4. Decide auto-fill-on-launch vs. ask-user per section
5. Promote the final schema into `ARCHIE_BRAVO.md` as the canonical Business Operating Manual structure
