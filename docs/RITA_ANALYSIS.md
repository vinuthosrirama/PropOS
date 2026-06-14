# RiTA (Cotality) — Competitive Analysis vs PropOS
*Researched 2026-06-14. Update as RiTA ships new features.*

---

## What RiTA Is

RiTA is Cotality's (formerly CoreLogic Australia) AI outreach assistant for real estate agents.
6,000+ active users in Australia. Two industry innovation awards. Not a CRM — it bolts onto
existing CRMs (Rex, VaultRE, Agentbox, LockedOn).

**Core value prop:** "Never miss a database touchpoint." RiTA monitors the agent's CRM +
local market activity, decides who to contact and when, and sends two-way SMS conversations
fully automatically — no agent involvement until a lead warms up enough to hand off.

---

## How RiTA's Outreach Works (from screenshot + site research)

**The market report sequence (RiTA's #1 use case):**
1. RiTA identifies property owners in the agent's database who haven't been contacted recently.
2. Sends: *"Hi [Owner], the most recent market report for [Suburb] Houses is available... Would
   you like a copy? If you'd like to stop hearing from me, just let me know. Kind Regards, RiTA,
   on behalf of [Agent Name], CoreLogic"*
3. If owner says yes → RiTA sends the report link automatically.
4. RiTA follows up: *"Would you like me to email an updated sale estimate for your property?"*
5. If owner engages → task flagged as "Due" in the agent's CRM for human follow-up.

**Key observations:**
- Fully automated. No human sees the message before it goes out.
- Generic "RiTA on behalf of" branding — doesn't pretend to be the agent.
- Uses CoreLogic property data for market reports (RP Data backend).
- Escalates to the human agent only when lead warms up.
- Task-based workflow with due dates (shown as "Follow Up" task in CRM).

---

## Feature-by-Feature Comparison

| Dimension | RiTA | PropOS | Edge |
|---|---|---|---|
| Two-way SMS | ✓ Fully automatic | ✓ Human-in-loop | PropOS: agent stays in control |
| Agent voice | ✗ Generic "RiTA" branding | ✓ Calibrated per-agent voice | PropOS wins |
| Voice learning | ✗ Static | ✓ Continuous (every 5 approvals) | PropOS wins |
| Hyper-personalisation | ~ Property data only | ✓ rea_data + conversational notes | PropOS wins |
| Human approval gate | ✗ None | ✓ Default on | PropOS wins |
| CRM dependency | ✗ Required | ✓ Zero-CRM (PropOS is the CRM) | PropOS wins |
| Property owner lookup | ✓ RP Data / CoreLogic | — Not yet | RiTA wins |
| Prospectability scoring | ✓ Built-in | ✓ Built-in (2026-06-14) | Tied |
| Market report outreach | ✓ Core use case | ✓ Built (2026-06-14) | Tied |
| Meeting booking from SMS | ✗ | ✓ Stage 3 | PropOS wins |
| CRM-triggered outreach | ✗ | ✓ ready_to_contact checkbox | PropOS wins |
| Multi-agent team | ✓ | ✓ AgentContext per agent | Tied |
| Mobile app | ✓ iOS/Android | — Web only | RiTA wins |
| Pricing transparency | ✗ Sales-gated | ✓ Tiered public | PropOS wins |
| Sends from agent's number | ✓ | ✓ BlueBubbles | Tied |
| Google Sheets CRM sync | ✗ | ✓ Built (2026-06-14) | PropOS wins |

---

## PropOS Positioning Against RiTA

**Lead with:** "Unlike RiTA, PropOS sounds like *you* — every message is in your voice,
approved by you, and gets smarter every time you send one."

**RiTA's fatal weakness:** Every agent on RiTA sends the same "Kind regards, RiTA on behalf of"
message. Leads recognise it. PropOS messages read like the agent actually texted.

**Three remaining gaps to close to fully beat RiTA:**

1. **Property owner lookup** — RiTA can search "who owns 78 Wilston Rd" using RP Data.
   PropOS can approximate this using SOLD_DB + sms_contacts.rea_data but doesn't have a
   live owner-lookup API. *Build target: Phase 5.*

2. **Mobile app** — RiTA has iOS/Android. PropOS is web-only (mobile-responsive as of
   2026-06-14). *Build target: Phase 6 (React Native or PWA).*

3. **Market activity alerts** — RiTA pushes "a nearby property just sold" to the agent's
   phone. PropOS has the SOLD_DB scraper (runs every 3 days) but no push alert system yet.
   *Build target: wire scraper → sold_properties Supabase table → webhook alert.*

---

## RiTA Pricing (estimated, not public)

Not disclosed on the website — requires a sales call. Estimated $200-400/month per agent
based on comparable AUS proptech SaaS. Tied to CRM partnership deals. No self-serve.

**PropOS advantage:** Transparent tiered pricing, self-serve sign-up.

---

*Source: https://www.cotality.com/au/products/rita, realestatebusiness.com.au, cotality.com/au/press-releases/lockedon, eliteagent.com/ai-digital-assistant-rita-scoops-two-innovation-awards*
