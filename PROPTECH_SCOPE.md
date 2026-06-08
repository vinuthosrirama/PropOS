# PropOS — Product Scope and Architecture
_Last updated: 8 June 2026_

---

## What PropOS Is

PropOS is an AI-powered CRM tool for boutique real estate agents. It reactivates dormant buyer and vendor leads by sending personalised, timely SMS and email messages — written in the agent's own voice — from their own real phone number.

**Core promise:** The agent does nothing manually. PropOS identifies the right contacts, generates the right message, and sends it at the right time. The agent just responds to the replies.

---

## The Two Modes

### Mode 1: Agent Outreach (Main Product)

Vinuth onboards a real estate agent (e.g. Cameron Knoll at Peake Real Estate). PropOS accesses their contact database and:

1. Scores every buyer against every active/upcoming listing using the SLM (Smart Lead Matcher)
2. Generates a personalised SMS in Cameron's voice (trained from his voice corpus)
3. Sends it from Cameron's real iPhone number via BlueBubbles or TextingBlue
4. Manages all replies in the PropOS inbox — Claude drafts a response, Cameron approves
5. Auto-follows up at Day 7, 14, 30 if no reply

**Pipeline types:**
- BuyerOS: past open home attendees who missed out, matched to new listings
- VendorOS: property owners who haven't sold, prompted with market timing triggers
- InvestorOS: investors with CGT or EOFY timing

### Mode 2: Self-Outreach (Founder Pitching PropOS)

Vinuth uses PropOS to pitch PropOS to boutique real estate agents. The same AI/SMS infrastructure is used — but in this mode, Vinuth is the "agent" and the RE agents are the "leads".

1. 16 boutique agents seeded into `outreach_targets` CRM
2. At 10am each weekday, PropOS sends personalised texts to new targets
3. When a target replies, PropOS generates a draft reply in Vinuth's voice
4. Vinuth reviews drafts at `GET /api/outreach-targets/drafts`, approves/edits, sends
5. CRM tracks each agent's status: new → contacted → replied → demo_booked → won

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PropOS Server (Railway)                   │
│                                                               │
│  ┌─────────────────┐   ┌─────────────────────────────────┐  │
│  │  Nurture Sched.  │   │  Outreach Scheduler (new)        │  │
│  │  (scheduler.ts) │   │  (outreachScheduler.ts)          │  │
│  │  5-min tick      │   │  9am brief, 10am sends (AEST)    │  │
│  └────────┬─────────┘   └────────────────┬────────────────┘  │
│           │                              │                    │
│  ┌────────▼─────────────────────────────▼────────────────┐  │
│  │              SMS Transport Layer (sms.ts)               │  │
│  │  BlueBubbles | TextingBlue | imsg | TeleLink |          │  │
│  │  AndroidGateway | Twilio + auto-fallback chain          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Inbound Webhook Router                       │  │
│  │  /api/webhook/{bluebubbles,telelink,textingblue,         │  │
│  │                android-gateway,sms}                       │  │
│  │                                                           │  │
│  │  handleIncomingReply(from, body)                          │  │
│  │    ├── addReplyToThread()      → conversations table      │  │
│  │    ├── cancelNurtureJobs()     → nurture_queue            │  │
│  │    └── handleOutreachInbound() → outreach_targets CRM     │  │
│  │                                 + outreach_drafts table   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────┐  ┌──────────────────────────┐   │
│  │  AI Reply Agent         │  │  Outreach Agent (new)     │   │
│  │  (reply-agent route)    │  │  (outreachAgent.ts)       │   │
│  │  For: buyer/vendor leads│  │  For: RE agent pitching   │   │
│  │  Model: claude-haiku    │  │  Model: claude-haiku      │   │
│  │  Returns: intent+draft  │  │  Returns: SMS draft ≤160c │   │
│  └────────────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

Database (Supabase PostgreSQL):
  conversations      — SMS threads (buyer/vendor leads)
  outreach_targets   — CRM for RE agents Vinuth is pitching
  outreach_drafts    — AI-generated reply drafts (status: pending/approved/sent)
  nurture_queue      — Scheduled follow-up jobs for buyer/vendor leads
  outreach_log       — All sent messages audit log
  opt_outs           — SPAM Act opt-out registry
  contacts           — Past buyer CRM records
  agents             — PropOS agent accounts
```

---

## Self-Outreach Agent — Daily Flow

```
WEEKDAY SCHEDULE (Melbourne time)
─────────────────────────────────
09:00am  Morning Brief
         ├── Log overnight replies to console
         ├── Generate follow-up drafts for targets unreplied 3+ days
         └── Print: pending drafts count, total replied, demo booked

10:00am  Outreach Window (±12 min random jitter)
         ├── Pick up to 5 targets with status='new'
         ├── Send sms_script via active transport
         └── Update CRM: status → 'contacted'

ALWAYS ON  Inbound Reply Handler
         ├── Phone number matched to outreach_targets
         ├── CRM status → 'replied' (or higher if already replied)
         ├── Claude generates draft reply in Vinuth's voice
         └── Draft saved to outreach_drafts (status='pending')
```

### Morning Review Commands (from Railway logs or curl)

```bash
# Check pending drafts
curl https://propos.addvantage.site/api/outreach-targets/drafts

# See morning brief
curl https://propos.addvantage.site/api/outreach-targets/brief

# Approve and send a draft (ID from drafts list)
curl -X POST https://propos.addvantage.site/api/outreach-targets/approve-draft/7

# Approve with edited text
curl -X POST https://propos.addvantage.site/api/outreach-targets/approve-draft/7 \
  -H "Content-Type: application/json" \
  -d '{"editedBody": "Thanks Brad. 5 min Zoom Thursday? I can show you live. Vinuth"}'

# Reject a draft
curl -X POST https://propos.addvantage.site/api/outreach-targets/reject-draft/7

# See full conversation thread for a target
curl https://propos.addvantage.site/api/outreach-targets/3/thread

# Manually send a custom reply
curl -X POST https://propos.addvantage.site/api/outreach-targets/3/reply \
  -H "Content-Type: application/json" \
  -d '{"message": "Great, Thursday 2pm works. Zoom link: ..."}'

# Test: manually trigger one send (TEST_RECIPIENT_PHONE must be set)
curl -X POST https://propos.addvantage.site/api/outreach-targets/trigger-now \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}'
```

---

## SMS Transport Decision Tree

```
Agent device?
├── Mac in office (always-on)    → SMS_TRANSPORT=bluebubbles (iMessage, real number, best)
├── iPhone only (no Mac)         → SMS_TRANSPORT=textingblue (iMessage via iOS shortcut)
├── Android phone                → SMS_TRANSPORT=android-gateway (real SIM SMS)
├── Windows PC + Phone Link      → SMS_TRANSPORT=telelink (~12s/msg)
└── No device / cloud only       → SMS_TRANSPORT=twilio (cloud, generic number)

Always set: SMS_TRANSPORT_FALLBACK=twilio
```

---

## Environment Variables

```env
# server/.env

# AI
ANTHROPIC_API_KEY=sk-ant-...         # Required for reply agent + message generation
OPENAI_API_KEY=sk-...                # Optional — OpenAI fallback

# Database
DATABASE_URL=postgresql://...        # Supabase connection string (required for CRM)

# SMS — choose primary + fallback
SMS_TRANSPORT=bluebubbles
SMS_TRANSPORT_FALLBACK=twilio
BLUEBUBBLES_URL=https://xxxx.trycloudflare.com
BLUEBUBBLES_PASSWORD=your_password
TEXTINGBLUE_API_KEY=tb_live_xxxx
ANDROID_GW_URL=https://xxxx.trycloudflare.com
ANDROID_GW_USER=user
ANDROID_GW_PASS=pass
TELELINK_URL=http://localhost:5000
TELELINK_TOKEN=your_token
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_FROM_NUMBER=+61xxxxx

# Outreach scheduler tuning
OUTREACH_DAILY_CAP=5              # Max initial messages per day (default: 5)
OUTREACH_FOLLOWUP_DAYS=3          # Days before follow-up (default: 3)

# Testing (CRITICAL — redirect all sends to your own number before going live)
TEST_RECIPIENT_PHONE=+61XXXXXXXXX  # Remove this line when ready for live sends

# Server
BASE_URL=https://propos.addvantage.site
PORT=3001
```

---

## Outreach CRM Status Flow

```
new  →  contacted  →  replied  →  demo_booked  →  won
                              ↘  not_interested
```

| Status | Meaning |
|--------|---------|
| `new` | In seed list, not yet contacted |
| `contacted` | Initial SMS sent, waiting for reply |
| `replied` | Agent replied to our outreach |
| `demo_booked` | Demo call scheduled |
| `won` | Agent signed up for PropOS |
| `not_interested` | Opted out or firmly declined |

---

## Key GitHub Repos Referenced

| Tool | Repo | Used for |
|------|------|---------|
| BlueBubbles | https://github.com/BlueBubblesApp/bluebubbles-server | iMessage from Mac |
| TextingBlue | https://github.com/textingblue/imessage-api | iMessage from iPhone shortcut |
| Android SMS Gateway | https://github.com/capcom6/android-sms-gateway | Real SIM SMS from Android |
| TeleLink | https://github.com/nicholasxdavis/telelink | SMS via Windows Phone Link |
| SalesGPT pattern | https://github.com/filip-michalsky/SalesGPT | Conversation stage awareness |
| Boop Agent pattern | https://github.com/raroque/boop-agent | Daily memory consolidation, per-conversation history |

---

## Roadmap

### P0 — Now (launch outreach campaign)
- [x] 16 boutique agent seed list (Berwick/Ferntree Gully/Berwick area)
- [x] SMS transport layer (6 transports, fallback chain)
- [x] Outreach CRM (outreach_targets table + full CRUD API)
- [x] AI reply agent (Claude generates drafts in Vinuth's voice)
- [x] Daily scheduler (10am outreach, 9am morning brief)
- [x] Draft approval flow (review at /api/outreach-targets/drafts)
- [x] Complete conversation thread per target
- [ ] Set SMS_TRANSPORT + TEST_RECIPIENT_PHONE + test on personal number
- [ ] Seed DB: POST /api/outreach-targets/seed
- [ ] Test trigger: POST /api/outreach-targets/trigger-now with limit=1
- [ ] Remove TEST_RECIPIENT_PHONE and go live

### P1 — Product improvements (after first 5 demos booked)
- [ ] Sleeping GCI hero stat on portfolio screen
- [ ] AI Reply Agent status badge in Nav ("AI Replies: Active")
- [ ] Mass send scale counter ("Sending to 34 contacts / Est. GCI: $68k+")
- [ ] Voice confidence badge after generation ("91% style match")
- [ ] Appraisal booking milestone in demo flow
- [ ] Settings view consolidation

### P2 — Growth (after first paying customer)
- [ ] Self-serve onboarding (<10 min)
- [ ] Stripe subscription billing
- [ ] Multi-agent team support
- [ ] Boxdice CRM integration (real buyer database sync)
- [ ] Domain AVM integration (live property estimates)
- [ ] Response rate analytics dashboard
- [ ] A/B message testing (track which scripts get most replies)

---

## Competitor Context

**Ociate.ai**
- Bulk SMS blast to 3,000+ contacts, AI learns agent style, 24/7 auto-replies
- Claim: 6x response rates, <10 min setup
- Weakness: sends to everyone regardless of match quality

**PropOS differentiator**
- SLM-scored matching: right buyer to right listing (not bulk blast)
- Real phone number: messages from the agent's actual iPhone (not a platform number)
- BuyerOS/VendorOS split: separate pipelines with appropriate context
- "Ociate sends 3,000 generic messages. PropOS sends 40 perfectly matched messages that convert."
