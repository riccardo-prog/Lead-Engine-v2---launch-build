# OperateAI Sales Process Configuration

**Date:** 2026-04-21
**Status:** Approved

## Overview

Configure `operateai.config.ts` to accurately reflect how OperateAI sells: cold outbound → website/Ora or email reply → intent-based nurture → audit call booking.

## Context

- OperateAI sells a done-for-you AI lead management system to service businesses (trades, fitness, dental, legal, salons, coaching, home services)
- Primary lead source is cold email outbound — recipients are skeptical by default
- Secondary sources: Ora chatbot on operateai.ca, inbound email, referrals
- Domain is new and needs warmup — deliverability is a constraint
- Founder needs reps on sales calls — qualification bar should be low
- Booking provider is cal.com (webhook integration already exists)

## Approach: Intent-Based Routing

Scripts keyed to **how the lead arrived and what they want**, not demographics. Three scripts that converge on the same action: book the audit call. The difference is tone and pace.

## Funnel Stages

| ID | Label | Description | Order |
|---|---|---|---|
| `new` | New Lead | Just came in, no engagement yet | 1 |
| `engaged` | Engaged | Replied, chatted with Ora, or showed intent | 2 |
| `qualified` | Qualified | Fit confirmed, ready to book | 3 |
| `booked` | Booked | Audit call scheduled | 4 |
| `closed` | Closed | Deal closed or lost | 5 |

All stages `autoAdvance: false` — human oversight on everything for now.

## Conversation Scripts

### `cold-reply`

**Detection:** Lead source is cold email reply, or first message contains skepticism signals ("is this real?", "how did you get my email?", "what is this?").

**Tone:** Disarming, credible, zero pressure. Acknowledge the cold email upfront.

**Steps:**
1. Acknowledge the outreach honestly — "Yeah, we reached out because [reason related to their business type]. Fair question."
2. One-line value prop grounded in their world, not yours
3. Ask what they're currently doing for lead follow-up — get them talking about their pain
4. If pain is real, connect it to what the Lead Engine solves — describe the outcome, not features
5. Offer the audit call as a no-pressure look at their current flow — drop the cal.com link

**Exit early if:** They say they're not interested. Respect it, leave the door open.

### `ora-engaged`

**Detection:** Lead source is `website-ora`, or lead has had a multi-turn chat via the website widget.

**Tone:** Warm, confident. They already experienced the product — lean into that.

**Steps:**
1. Reference the Ora conversation — "You were just chatting with our AI on the site"
2. Ask what caught their attention or what they're trying to solve
3. Confirm business type and rough lead volume (lightweight qualifying)
4. Frame the audit call — "We'll look at your current lead flow and show you exactly where this plugs in"
5. Drop the cal.com link

**Exit early if:** They're a student, competitor, or just exploring AI generally. Friendly close, no push.

### `inbound-inquiry`

**Detection:** Lead source is `email-inbound` or `manual`, no prior Ora conversation, no cold email context.

**Tone:** Professional, curious. You know nothing about them yet — qualify first.

**Steps:**
1. Thank them for reaching out, ask what prompted the inquiry
2. What kind of business do they run?
3. How are they handling leads today?
4. If it's a fit, frame the audit call and send the link
5. If unclear fit, ask one more qualifying question before offering the call

**Exit early if:** They're asking about something OperateAI doesn't do.

## AI Persona

- **Name:** Ari
- **Role:** AI business development assistant for OperateAI
- **Tone:** Professional
- **Voice:** "Direct and confident without being salesy. Talks like someone who builds this stuff, not someone who sells it. Short sentences. No fluff. Asks questions that show you understand their business before pitching anything."
- **doNotSay:** `["guaranteed", "best price", "act now", "limited time", "—", "in just X minutes", "in just X days", "we integrate with", "powered by GPT", "powered by AI"]`
- **alwaysSay:** `[]`

## Qualification

Low bar by design — founder needs reps on calls, founding partners get waived setup.

- **requiredFields:** `["name", "email"]`
- **disqualifyIf:** `["competitor", "student_project"]`
- **scoreThresholdToBook:** 30

## Booking

- **provider:** cal.com
- **url:** via `OPERATEAI_BOOKING_URL` env var
- **meetingType:** "Free Audit Call"
- **reminderHours:** [24, 1]

## Messaging Rules (Domain Warmup)

- **maxPerDay:** 1 (ramp to 2-3 once deliverability is established, ~2-4 weeks)
- **allowedHoursStart:** 9
- **allowedHoursEnd:** 17
- **timezone:** America/Toronto
- **requireOptIn:** false

## Lead Sources

- `website-ora` — Ora chatbot on operateai.ca (web_form)
- `cold-email-reply` — Replies to cold outbound emails (email_parse)
- `email-inbound` — Direct email inquiries (email_parse)
- `manual` — Manual entry (manual)

## What's NOT in scope

- Vertical-specific scripts (add later once data shows which industries convert)
- Multi-channel (Meta DMs, SMS) — email only for now
- Automated stage advancement — manual oversight for now
- Warmup automation — manual config bump when ready
