# Cold Outbound Email Engine — Design Spec

**Date:** 2026-04-22
**Status:** Approved
**Client:** OperateAI (operate-ai)
**Sending domain:** operateai.ca (Google Workspace, Gmail API)

---

## 1. Goal

Replace Instantly with a built-in cold outbound email system in the Lead Engine. Prospects are imported via CSV, scored for ICP fit, enrolled in AI-personalized email sequences, and handed off to the Lead Engine nurture system when they reply. All sending goes through the existing Gmail API integration on operateai.ca.

This is a single-tenant feature for OperateAI initially, but built on the same multi-tenant `client_id` pattern as the rest of the engine.

---

## 2. Architecture Overview

```
CSV Import → ICP Scoring (Haiku) → Campaign Enrollment
                                         ↓
                              Send Cron (every 15 min)
                                         ↓
                        Research Brief (Haiku) → Personalization (Sonnet)
                                         ↓
                                   Gmail API Send
                                         ↓
                              Gmail Poller detects reply
                                         ↓
                           Sentiment Classification (Haiku)
                                         ↓
                    ┌──────────────┬──────────────────┐
                    │              │                  │
              reply_to_continue  reply_to_pause   reply_to_stop
                    │              │                  │
              Handoff to        Handoff to         Suppress +
              Lead Engine       Lead Engine        stop all
              (cold-reply)      (with paused_      outreach
                                until on lead)
```

**Key principle:** Outbound's job ends when a prospect replies. All post-reply relationship management is handled by the Lead Engine nurture system (Ari).

---

## 3. Data Model (7 tables)

### 3.1 `outbound_campaigns`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| client_id | TEXT NOT NULL | |
| name | TEXT NOT NULL | |
| status | TEXT NOT NULL | `draft` / `active` / `paused` / `completed` |
| sequence_id | UUID FK | References `outbound_sequences.id` |
| sending_account_id | UUID FK | References `outbound_sending_accounts.id` |
| icp_criteria | JSONB | Stored ICP prompt context for this campaign |
| icp_threshold | INTEGER DEFAULT 40 | Minimum ICP score to enroll prospect |
| social_proof | TEXT[] | Array of social proof statements for step 2 emails |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### 3.2 `outbound_sequences`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| client_id | TEXT NOT NULL | |
| name | TEXT NOT NULL | |
| steps | JSONB NOT NULL | Array of `SequenceStep` objects (see §4) |
| created_at | TIMESTAMPTZ | |

### 3.3 `outbound_prospects`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| client_id | TEXT NOT NULL | |
| campaign_id | UUID FK | |
| email | TEXT NOT NULL | |
| first_name | TEXT | |
| last_name | TEXT | |
| company | TEXT | |
| title | TEXT | |
| linkedin_url | TEXT | |
| website_url | TEXT | |
| company_description | TEXT | |
| custom_fields | JSONB | Any extra CSV columns |
| icp_score | INTEGER | 0-100, set by ICP scoring |
| icp_factors | JSONB | Factor breakdown from scoring |
| research_brief | TEXT | Cached Haiku output |
| research_confidence | TEXT | `HIGH` / `MEDIUM` / `LOW` |
| status | TEXT NOT NULL | See §3.3.1 |
| current_step | INTEGER DEFAULT 0 | Which sequence step they're on |
| paused_until | TIMESTAMPTZ | For reply_to_pause prospects |
| lead_id | UUID | FK to `leads.id` after handoff |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| UNIQUE | (campaign_id, email) | No duplicate emails per campaign |

#### 3.3.1 Prospect Status Enum

- `pending` — imported, awaiting first send
- `sending` — currently in sequence
- `replied` — replied, being handed off or already handed off
- `paused` — soft no, handed off to Lead Engine with `paused_until`
- `opted_out` — hard no or unsubscribe, added to suppression list
- `completed` — all sequence steps sent, no reply
- `bounced` — hard bounce, email invalid, added to suppression list
- `failed` — soft failure (Gmail API error), will retry on next cron cycle
- `suppressed` — already on suppression list at import time

### 3.4 `outbound_emails`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| client_id | TEXT NOT NULL | |
| prospect_id | UUID FK | |
| campaign_id | UUID FK | |
| step_order | INTEGER NOT NULL | Which sequence step |
| subject | TEXT NOT NULL | Generated subject line |
| body | TEXT NOT NULL | Generated email body |
| gmail_message_id | TEXT | From Gmail API response |
| gmail_thread_id | TEXT | For threading subsequent emails |
| status | TEXT NOT NULL | `pending` / `sent` / `failed` / `bounced` |
| sent_at | TIMESTAMPTZ | |
| send_after | TIMESTAMPTZ NOT NULL | Calculated from day_offset + jitter |
| failure_reason | TEXT | |
| word_count | INTEGER | For soft retry tracking |
| created_at | TIMESTAMPTZ | |

### 3.5 `outbound_replies`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| client_id | TEXT NOT NULL | |
| prospect_id | UUID FK | |
| campaign_id | UUID FK | |
| email_id | UUID FK | Which outbound email they replied to |
| gmail_message_id | TEXT | |
| gmail_thread_id | TEXT | |
| content | TEXT NOT NULL | Extracted reply text |
| subject | TEXT | |
| sentiment | TEXT NOT NULL | `reply_to_continue` / `reply_to_pause` / `reply_to_stop` |
| lead_id | UUID | FK to `leads.id` after handoff |
| handed_off | BOOLEAN DEFAULT FALSE | |
| created_at | TIMESTAMPTZ | |

### 3.6 `outbound_sending_accounts`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| client_id | TEXT NOT NULL | |
| connection_id | UUID FK | FK to `connections.id` (existing Google OAuth) |
| from_name | TEXT NOT NULL | Display name for From header |
| from_email | TEXT NOT NULL | Must match connected Google account |
| daily_limit | INTEGER NOT NULL | Max sends per day (starts at 5, ramp manually) |
| sends_today | INTEGER DEFAULT 0 | Reset when `last_reset_date` changes |
| sends_failed_today | INTEGER DEFAULT 0 | Bounces + API errors today |
| last_reset_date | DATE | The date `sends_today` was last reset |
| paused_until | TIMESTAMPTZ | Auto-pause timestamp, null = active |
| pause_reason | TEXT | `bounce_rate_exceeded` / `gmail_api_error` / `rate_limited` / `manual` |
| warmup_week | INTEGER DEFAULT 1 | Current warmup week (affects effective limit) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Warmup ramp schedule:**
- Week 1: 5/day
- Week 2: 10/day
- Week 3: 20/day
- Week 4+: `daily_limit` (max 30 for Google Workspace)

Effective daily limit = `min(daily_limit, warmup_limit_for_week)`.

**Auto-pause rules:**
- `sends_failed_today / sends_today > 0.10` (10%+ failure rate) → pause 24h, reason `bounce_rate_exceeded`
- Gmail API returns 429 → pause 1h, reason `rate_limited`
- Gmail API returns 403 (sending quota exceeded) → pause until midnight ET, reason `gmail_api_error`

**Daily reset logic:** The send cron checks `last_reset_date` against today's date (ET). If different, set `sends_today = 0`, `sends_failed_today = 0`, `last_reset_date = today`. No separate cron job needed.

### 3.7 `suppression_list`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| client_id | TEXT NOT NULL | |
| email | TEXT NOT NULL | Lowercased |
| reason | TEXT NOT NULL | `opted_out` / `bounced` / `complained` / `manual` |
| source | TEXT NOT NULL | `outbound_reply` / `lead_engine` / `manual_import` |
| created_at | TIMESTAMPTZ | |
| UNIQUE | (client_id, email) | |

**Cross-system suppression:** Both the outbound send pipeline and the Lead Engine nurture send pipeline check this table before sending any email. A lead who opts out via Lead Engine is also suppressed from cold outbound, and vice versa.

**Lead Engine integration:** The existing send path in `src/engine/messaging/send.ts` currently only checks `lead.opted_out`. This must be extended to also query `suppression_list` by `(client_id, email)` before sending. Without this, a prospect who opts out of outbound could get handed off to Ari and emailed again. The suppression check is a pre-send gate, not a post-send audit.

**Auto-add triggers:**
- `reply_to_stop` sentiment → reason `opted_out`, source `outbound_reply`
- Gmail bounce notification → reason `bounced`, source `outbound_reply`
- Lead sets `opted_out = true` in Lead Engine → reason `opted_out`, source `lead_engine`
- Manual import via UI → reason `manual`, source `manual_import`

**Prospect import check:** Suppressed emails are rejected at import time with status `suppressed`.

---

## 4. Sequence Structure

Each sequence has an ordered array of `SequenceStep` objects:

```typescript
type SequenceStep = {
  stepOrder: number      // 0, 1, 2, 3
  dayOffset: number      // days after enrollment (0, 3, 7, 14)
  stance: string         // internal label for tracking
  prompt: string         // exact instruction Sonnet receives for this step
  maxWords: number       // soft limit, retry if exceeded by >20%
}
```

### Default Sequence (4 steps)

**Step 0 — `opening-cold` (day 0, max 80 words)**
```
First touch. You know nothing about them beyond the research brief. Lead with ONE specific observation from their business. Ask a genuine question. No pitch. No "I noticed you..." clichés. Under 80 words.
```

**Step 1 — `follow-up-value` (day 3, max 60 words)**
```
They didn't reply to step 0. Don't reference the previous email. Share ONE concrete thing relevant to their situation — a trend, a metric, a pattern you've seen. Frame it as useful whether or not they reply. Under 60 words.
```

**Step 2 — `social-proof-nudge` (day 7, max 70 words)**
```
Third touch. Reference a specific result or pattern from similar businesses. Use the social proof provided in the campaign config if available — quote it directly, don't fabricate details. If no social proof is configured, speak generally about the problem space. One sentence max on the result, then a soft question. Under 70 words.
```

**Step 3 — `clean-break` (day 14, max 50 words)**
```
Final email. Assume they're not interested and that's fine. Give them an easy out ("If this isn't relevant, no need to reply"). But leave one clear reason to re-engage if timing changes. Under 50 words. No guilt. No "just checking in."
```

### Word Count Enforcement

After Sonnet generates an email, count words. If word count exceeds `maxWords * 1.2`, regenerate once with an appended instruction: `"IMPORTANT: Your previous draft was {count} words. The limit is {maxWords}. Be more concise."` If the second attempt still exceeds the limit, use it anyway (don't loop).

---

## 5. Two-Phase AI Pipeline

### Phase 1: Research Brief (Haiku)

Runs once per prospect at import time. Cached on `outbound_prospects.research_brief`.

**Model:** claude-haiku-4-5 (fast, cheap, good enough for summarization)

**Prompt:**

```
You are a research assistant preparing a brief for a cold email writer.

AVAILABLE DATA (use ONLY this):
- Prospect name: {first_name} {last_name}
- Prospect company: {company}
- Prospect title: {title}
- Prospect LinkedIn URL: {linkedin_url}
- Prospect website: {website_url}
- Company description: {company_description}
- Custom fields: {custom_fields}

RULES:
1. ONLY reference facts present in the data above. If a field is empty or null, say "not available."
2. DO NOT invent company metrics, revenue numbers, team sizes, or funding amounts.
3. DO NOT fabricate quotes, case studies, or specific achievements.
4. DO NOT assume industry-specific details not present in the data.
5. If the data is thin, say so: "Limited data available. Suggest generic approach."
6. Flag confidence level: HIGH (3+ meaningful data points), MEDIUM (1-2 data points beyond name/email), LOW (name and email only).

OUTPUT FORMAT:
- One paragraph (3-5 sentences) summarizing what we know
- Key talking points (1-3 bullets, only from available data)
- Confidence: HIGH/MEDIUM/LOW
- Suggested angle (based on what data supports)
```

**Confidence level criteria:**
- **HIGH:** Has company, title, AND at least one of (LinkedIn, website, description)
- **MEDIUM:** Has company OR title, but not both, or missing supporting URLs
- **LOW:** Name and email only, no company/title/context

### Phase 2: Personalization (Sonnet)

Runs per email send, just before sending. Uses the cached research brief + step prompt.

**Model:** claude-sonnet-4-5 (better writing, worth the cost for outbound)

**Prompt:**

```
You are writing a cold email on behalf of {from_name} at {business_name}.

GROUNDING RULE: The research brief below is your ONLY source of prospect information.
Do not add details, metrics, or claims not present in the brief. If the brief says
"Limited data available," write a shorter, more generic email. Never fabricate specifics
to fill space.

RESEARCH BRIEF:
{research_brief}

PROSPECT:
- Name: {first_name}
- Company: {company}

STEP INSTRUCTION:
{step_prompt}

COLD EMAIL RULES (from operator):
1. No fluff, no filler. Every sentence earns its place or gets cut.
2. Research first. Reference something specific about their business — not generic.
   If research brief confidence is LOW, skip specific references entirely.
3. One idea per email. Don't stack pitches.
4. Sound like a person, not a campaign. No templates, no "I hope this finds you well."
5. Handle silence with grace. Never guilt-trip. Never say "just following up" or "bumping this."
6. End on a question, not a pitch. Make replying easy and low-commitment.
7. Keep it short. If it takes longer than 15 seconds to read, it's too long.

SOCIAL PROOF (if available):
{social_proof_or_none}

Write the email. Subject line first (one line), then a blank line, then the body.
Sign as {from_name}.
Do not include any preamble or commentary — just the subject and body.
```

---

## 6. ICP Scoring

Runs at import time, before sequence enrollment. Determines whether a prospect is worth emailing.

**Model:** claude-haiku-4-5

**Prompt:**

```
You are scoring a sales prospect for ICP (Ideal Customer Profile) fit.

BUSINESS: {business_name}
WHAT WE SELL: {business_description}
ICP CRITERIA: {icp_criteria_from_campaign}

PROSPECT:
- Name: {name}
- Company: {company}
- Title: {title}
- Industry: {industry_if_available}
- Custom fields: {custom_fields}

Score this prospect 0-100 for ICP fit. Consider:
- Company type/size alignment with what we sell
- Title/role alignment (are they a decision maker?)
- Industry relevance

Respond with JSON:
{
  "score": <0-100>,
  "factors": {
    "company_fit": { "score": <0-100>, "reason": "<one sentence>" },
    "role_fit": { "score": <0-100>, "reason": "<one sentence>" },
    "industry_fit": { "score": <0-100>, "reason": "<one sentence>" }
  },
  "summary": "<one sentence overall assessment>"
}
```

**Enrollment threshold is server-side, not in the prompt.** After Claude returns the score, the server checks `score >= campaign.icp_threshold`. Prospects below the threshold get status `suppressed` (not worth emailing, not a suppression-list entry).

**Add to `outbound_campaigns` table:**
| Column | Type | Notes |
|--------|------|-------|
| icp_threshold | INTEGER DEFAULT 40 | Minimum ICP score to enroll. Configurable per campaign. |

This keeps the threshold tunable without re-prompting or re-scoring — just lower the threshold and re-run enrollment on existing scored prospects.

---

## 7. Send Pipeline

### 7.1 Send Cron

Runs every 15 minutes via Vercel Cron (`/api/cron/outbound-send`).

**Flow:**

1. **Daily reset check:** For each sending account, if `last_reset_date !== today (ET)`, reset `sends_today = 0`, `sends_failed_today = 0`, `last_reset_date = today`.

2. **Pause check:** Skip accounts where `paused_until > now()`.

3. **Capacity check:** For each active account, calculate `remaining = effective_daily_limit - sends_today`. If `remaining <= 0`, skip.

4. **Query eligible emails:**
   ```sql
   SELECT e.* FROM outbound_emails e
   JOIN outbound_prospects p ON e.prospect_id = p.id
   JOIN outbound_campaigns c ON p.campaign_id = c.id
   WHERE e.status = 'pending'
     AND e.send_after <= NOW()
     AND c.status = 'active'
     AND c.sending_account_id = :account_id
     AND p.status IN ('pending', 'sending')
   ORDER BY e.send_after ASC
   LIMIT :remaining
   ```

5. **Pre-send checks** (per email):
   - Check `suppression_list` for prospect email → if suppressed, mark prospect `suppressed`, skip
   - Check sending hours (9-17 ET) → if outside window, skip (will be picked up next cron in window)

6. **Generate email content** (Phase 2 AI pipeline):
   - Use cached research brief from prospect
   - Generate with Sonnet using step prompt
   - Word count check: if > `maxWords * 1.2`, regenerate once
   - Store generated subject + body on `outbound_emails` row

7. **Send via Gmail API:**
   - Use existing `sendEmailViaGmail` (extended for threading, see §8)
   - On success: update email status to `sent`, store `gmail_message_id` and `gmail_thread_id`, increment `sends_today`, update prospect to `sending` if still `pending`
   - On failure:
     - 429 → pause account 1h, stop processing this account
     - 403 → pause account until midnight ET, stop processing
     - Other error → mark email `failed`, increment `sends_failed_today`, mark prospect `failed`
   - After each send: check failure rate threshold (10%), auto-pause if exceeded

8. **Advance prospects:** After sending, if this was the last step in the sequence and no reply, mark prospect `completed`.

### 7.2 Send Scheduling

When a prospect is enrolled in a campaign:

1. Create `outbound_emails` row for step 0 only, with `send_after` = enrollment time (next available send window) + random jitter (0-60 minutes)
2. Steps 1+ are NOT scheduled at enrollment — they are scheduled when step 0 actually sends

**When step 0 sends successfully:**
1. Record `sent_at` on the step 0 email row
2. Create `outbound_emails` rows for steps 1, 2, 3 with:
   - `send_after` = step 0 `sent_at` + step's `dayOffset` days + random jitter (0-120 minutes)
3. This ensures day offsets are relative to when the prospect actually received step 0, not when they were imported

**Why:** If step 0 is enrolled at 4:55pm, it won't send until 9am next day. Computing step 1 from enrollment time would make the gap between step 0 and step 1 only ~2 days instead of the intended 3. Computing from `sent_at` keeps the spacing correct.

**Jitter bounds:** Jitter is clamped to the 9-17 ET window. If `send_after + jitter` falls outside the window, the cron simply picks it up at the next in-window run — no rescheduling needed.

### 7.3 Human Approval Mode

Outbound supports the same `humanApprovalRequired` pattern as Lead Engine nurture.

**Config addition:**
```typescript
// Add to outbound config in schema.ts
outbound?: {
  socialProof?: string[]
  icpDescription?: string
  requireApproval?: boolean  // NEW: default true
}
```

**When `requireApproval` is true (default):**

1. The send cron generates the email (Phase 2 AI pipeline) and stores it on the `outbound_emails` row
2. Instead of sending immediately, it creates an `ai_actions` row with:
   - `action_type: "send_outbound"`
   - `proposed_content`: the generated email body
   - `status: "pending"`
   - Reference to the `outbound_emails.id` in metadata
3. The email appears in the operator's inbox/approval queue alongside nurture messages
4. Operator can: **Approve** (sends as-is), **Edit** (modify then send), **Regenerate** (re-run Sonnet with same inputs), **Reject** (skip this email, mark prospect as paused)
5. On approval, the email is sent via Gmail API and the `outbound_emails` row is updated

**When `requireApproval` is false:**
- Send cron generates and sends in one step, same as current spec flow

**Recommendation:** Ship with `requireApproval: true` for OperateAI. After 50-100 approved sends with consistent quality, flip to `false`. This catches hallucinations and voice mismatches that grounding rules alone won't prevent on a brand-new outbound domain.

**Add `"send_outbound"` to the `AIAction.action_type` union** in `src/types/database.ts`.

### 7.4 Sending Hours

All sends constrained to 9:00-17:00 ET (America/Toronto). If a `send_after` falls outside this window, the send cron simply skips it until the next cron run within the window. No rescheduling needed — the cron runs every 15 minutes and will pick it up.

---

## 8. Gmail Integration Extensions

The existing `sendEmailViaGmail` function in `src/engine/messaging/gmail.ts` needs two additions:

### 8.1 Threading Support

Add optional `threadId` and `inReplyTo` parameters to `sendEmailViaGmail`:

```typescript
export async function sendEmailViaGmail({
  clientId,
  toEmail,
  toName,
  subject,
  body,
  threadId,    // NEW: for replying in existing thread
  inReplyTo,   // NEW: Message-ID for In-Reply-To header
}: {
  clientId: string
  toEmail: string
  toName?: string
  subject: string
  body: string
  threadId?: string
  inReplyTo?: string
})
```

When `threadId` is provided, include it in the Gmail API request body. When `inReplyTo` is provided, add `In-Reply-To` and `References` headers to the MIME message.

### 8.2 Outbound Email Threading

Step 0 creates a new thread. Steps 1-3 reply in the same thread:

- Step 0: Send normally, store returned `gmail_thread_id` and `gmail_message_id` on the `outbound_emails` row
- Steps 1+: Look up the step 0 email's `gmail_thread_id` and `gmail_message_id`, pass them to `sendEmailViaGmail` as `threadId` and `inReplyTo`. Use `Re: {original_subject}` as subject.

---

## 9. Reply Detection & Sentiment

### 9.1 Detection

The existing Gmail poller (`src/engine/intake/gmail-poller.ts`) already handles reply detection via `In-Reply-To` / `References` headers. For cold outbound, the flow is:

1. Gmail poller finds an unread email from a known prospect (matched by email against `outbound_prospects`)
2. The `outbound_emails` table is checked for a matching `gmail_thread_id`
3. If found → this is a cold outbound reply

**New check in Gmail poller:** Before checking the `leads` table for known leads, check `outbound_prospects` for a matching sender email with an active campaign. If found, route to outbound reply handling instead of the existing lead reply flow.

### 9.2 Sentiment Classification

**Model:** claude-haiku-4-5

**Prompt:**

```
Classify this email reply into exactly one category.

CONTEXT: This is a reply to a cold outbound email from {business_name}.
The original email was about {one_line_campaign_description}.

REPLY:
{reply_content}

Categories:
- reply_to_continue: Interested, asking questions, wants to learn more, neutral/ambiguous ("tell me more", "who is this?"), out-of-office with return date, auto-replies
- reply_to_pause: Soft no with door open ("not right now", "maybe later", "busy this quarter", "reach out next month")
- reply_to_stop: Hard no, unsubscribe request, hostile, "remove me", "stop emailing me", compliance trigger, legal threat

When in doubt between continue and pause, choose continue.
When in doubt between pause and stop, choose pause.

Respond with JSON:
{
  "sentiment": "reply_to_continue" | "reply_to_pause" | "reply_to_stop",
  "reasoning": "<one sentence>"
}
```

### 9.3 Post-Classification Actions

**`reply_to_continue`:**
1. Mark prospect status `replied`
2. Stop remaining sequence emails (delete pending `outbound_emails` rows)
3. Hand off to Lead Engine (see §10)

**`reply_to_pause`:**
1. Mark prospect status `paused`
2. Stop remaining sequence emails
3. Hand off to Lead Engine with `paused_until` set to 30 days from now on the created lead (see §9.4)

**`reply_to_stop`:**
1. Mark prospect status `opted_out`
2. Stop remaining sequence emails
3. Add email to `suppression_list` (reason: `opted_out`, source: `outbound_reply`)
4. Do NOT create a lead — they don't want to hear from us

### 9.4 Paused Lead Re-Engagement

`paused_until` is a real column on the `leads` table (not hidden in `custom_fields`). This requires a schema change:

**Add to `leads` table:**
| Column | Type | Notes |
|--------|------|-------|
| paused_until | TIMESTAMPTZ | Null = not paused. Set by outbound handoff or manually. |

**Add to `Lead` type in `src/types/database.ts`:**
```typescript
paused_until: string | null
```

**Waking mechanism:** A daily cron (`/api/cron/wake-paused-leads`) runs once per day at 9:00 ET. It queries:

```sql
SELECT * FROM leads
WHERE paused_until IS NOT NULL
  AND paused_until <= NOW()
  AND disqualified = FALSE
  AND opted_out = FALSE
```

For each matched lead, it:
1. Sets `paused_until = NULL`
2. Triggers `decideNextAction` for the lead — Ari sees the conversation history (cold emails + their "not right now" reply) and decides how to re-engage

**`decide-action.ts` integration:** When `paused_until` is not null and in the future, `decideNextAction` returns `{ action: "wait", waitUntil: lead.paused_until }`. The lead doesn't appear in the approval queue until the pause expires.

**File:** `src/app/api/cron/wake-paused-leads/route.ts`

---

## 10. Handoff Bridge (Outbound → Lead Engine)

When a prospect replies with `reply_to_continue` or `reply_to_pause`:

### 10.1 Create Lead

Call `processIntake` with:

```typescript
await processIntake({
  config,
  payload: {
    sourceId: "cold-email-reply",
    email: prospect.email,
    clientId: config.clientId,
    firstName: prospect.first_name,
    lastName: prospect.last_name,
    initialMessage: {
      channel: "email",
      content: replyContent,
      subject: replySubject,
      threadId: gmailThreadId,     // for in-thread replies
      inReplyTo: gmailMessageId,   // for proper threading
    },
    customFields: {
      outbound_campaign_id: campaign.id,
      outbound_campaign_name: campaign.name,
      outbound_icp_score: prospect.icp_score,
    },
  },
})
```

**If `reply_to_pause`:** After lead creation, set `paused_until` directly on the lead row:
```typescript
if (sentiment === "reply_to_pause") {
  await supabase.from("leads")
    .update({ paused_until: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() })
    .eq("id", newLeadId)
}
```

### 10.2 Import Conversation History

After the lead is created, insert all prior outbound emails as `messages` rows:

```typescript
for (const email of sentOutboundEmails) {
  await supabase.from("messages").insert({
    client_id: config.clientId,
    lead_id: newLeadId,
    channel: "email",
    direction: "outbound",
    content: email.body,
    subject: email.subject,
    external_id: email.gmail_message_id,
    sent: true,
    sent_at: email.sent_at,
    ai_generated: true,
  })
}
```

This gives Ari full conversation context. When `decide-action.ts` runs for this lead, it sees:
- The cold emails we sent (outbound messages)
- The prospect's reply (inbound message)
- Source: `cold-email-reply` → triggers the `cold-reply` conversation script

### 10.3 Thread Continuity

Ari's reply goes into the same Gmail thread because:
- The lead's initial message has `threadId` stored
- When the Lead Engine sends Ari's reply via `sendEmailViaGmail`, it passes `threadId` and `inReplyTo`
- The prospect sees one continuous email thread, same sender (operateai.ca), same display name
- From the prospect's perspective, they're talking to the same person who cold emailed them

### 10.4 Link Back

After handoff, store the `lead_id` on both:
- `outbound_prospects.lead_id`
- `outbound_replies.lead_id`

This allows the campaign detail view to link directly to the lead in the pipeline.

---

## 11. Config Schema Changes

### 11.1 New Optional Fields on `ClientConfig`

```typescript
// Add to ClientConfig type in src/config/schema.ts
outbound?: {
  socialProof?: string[]    // Social proof statements for sequence step 2
  icpDescription?: string   // What the business sells, for ICP scoring context
  requireApproval?: boolean // Human approval before sending (default true)
}
```

### 11.2 OperateAI Config Addition

```typescript
// Add to operateai.config.ts
outbound: {
  socialProof: [
    "One client reduced their lead response time from 4 hours to under 2 minutes",
    "Businesses using automated follow-up see 3-5x more booked calls from the same lead volume",
  ],
  icpDescription: "AI-powered lead management and automated follow-up for service businesses, agencies, and consultants",
  requireApproval: true, // flip to false after first 50-100 sends
},
```

---

## 12. Prospect Import

### 12.1 CSV Import Flow

1. **Upload CSV** via campaign creation UI
2. **Parse & validate:** Required columns: `email`. Optional: `first_name`, `last_name`, `company`, `title`, `linkedin_url`, `website_url`, `company_description`. Extra columns → `custom_fields` JSONB.
3. **Suppression check:** For each email, check `suppression_list`. Suppressed emails get status `suppressed` and are excluded from the campaign with a visible count.
4. **Dedup:** Check for duplicate emails within the campaign (same `campaign_id`). Also check across active campaigns for the same client — flag duplicates but allow override.
5. **ICP scoring:** Run Haiku ICP scoring for each prospect. Store `icp_score`, `icp_factors` on the prospect row. Server-side: if `icp_score < campaign.icp_threshold`, set status `suppressed`.
6. **Research briefs:** Run Haiku research brief for each enrolled prospect. Store `research_brief` and `research_confidence` on the prospect row.
7. **Schedule emails:** For enrolled prospects, create `outbound_emails` rows for all sequence steps with calculated `send_after` timestamps.

### 12.2 Import UI Feedback

The import UI shows:
- Total rows in CSV
- Suppressed (on suppression list): count
- Below ICP threshold: count
- Duplicates (cross-campaign): count with override option
- Enrolled: count
- Per-field coverage: how many prospects have each optional field (company: 180/200, title: 150/200, etc.)

Field coverage matters because it directly affects research brief quality — prospects with only name+email will get LOW confidence briefs and more generic emails.

---

## 13. Campaign Management UI

### 13.1 Campaign List (`/pipeline/outbound`)

Table view:

| Column | Content |
|--------|---------|
| Name | Campaign name, click to open detail |
| Status | Badge: draft/active/paused/completed |
| Prospects | Total enrolled count |
| Sent | Total emails sent |
| Reply Rate | `(replied / sent) * 100%` |
| Positive Rate | `(reply_to_continue / total_replies) * 100%` |
| Created | Date |

Actions: Create Campaign, Pause/Resume, Delete (draft only).

### 13.2 Campaign Detail (`/pipeline/outbound/[campaignId]`)

**Header:**
- Campaign name, status badge, created date
- Stats bar: total prospects, sent count, reply rate, positive reply rate
- Actions: Pause/Resume, Edit (draft only)

**Prospect table** (paginated, 50 per page):

| Column | Content |
|--------|---------|
| Name | Prospect name |
| Company | Company name |
| Status | Badge with color coding (see §3.3.1) |
| Current Step | `Step {n}/{total}` |
| Last Sent | Timestamp of last sent email |
| Reply | Truncated reply text, click to expand |
| Sentiment | Badge: continue (green) / pause (yellow) / stop (red) |

**Filters:** Status dropdown (all statuses including bounced/failed/suppressed), sentiment dropdown, text search by name/email/company.

**Bulk actions:** Pause selected, remove selected.

**Prospect detail** (slide-out panel on click):
- Full sequence timeline: each step with sent timestamp, generated email content, delivery status
- Reply content (full text) with sentiment badge
- Research brief + confidence level
- ICP score with factor breakdown
- Link to lead in pipeline (if handed off)

### 13.3 Campaign Creation

**Step 1:** Name, select or create sequence
**Step 2:** Upload CSV, see import results (coverage, suppressions, ICP scores)
**Step 3:** Configure ICP criteria and social proof
**Step 4:** Select sending account
**Step 5:** Review and activate (or save as draft)

---

## 14. File Structure

```
src/engine/outbound/
├── campaigns.ts          # Campaign CRUD, status management
├── prospects.ts          # Prospect import, CSV parsing, dedup
├── icp-scoring.ts        # Haiku ICP scoring
├── research-brief.ts     # Haiku research brief generation
├── personalize.ts        # Sonnet email personalization + word count retry
├── send-cron.ts          # Send pipeline (the cron handler)
├── reply-handler.ts      # Sentiment classification + post-classification actions
├── handoff.ts            # Outbound → Lead Engine bridge
├── suppression.ts        # Suppression list queries and writes
└── types.ts              # Outbound-specific TypeScript types

src/app/api/cron/
├── outbound-send/
│   └── route.ts           # Vercel Cron endpoint, calls send-cron.ts (every 15 min)
└── wake-paused-leads/
    └── route.ts           # Daily 9am ET cron, re-engages paused leads (§9.4)

src/app/(dashboard)/pipeline/outbound/
├── page.tsx               # Campaign list
└── [campaignId]/
    └── page.tsx           # Campaign detail

src/components/outbound/
├── campaign-list.tsx      # Campaign list table
├── campaign-detail.tsx    # Campaign detail with prospect table
├── prospect-table.tsx     # Paginated prospect table with filters
├── prospect-detail.tsx    # Slide-out prospect detail panel
├── campaign-create.tsx    # Multi-step campaign creation wizard
└── csv-upload.tsx         # CSV upload + import feedback
```

### Modified Existing Files

- `src/config/schema.ts` — Add `outbound?: { socialProof?: string[], icpDescription?: string, requireApproval?: boolean }` to `ClientConfig`
- `src/config/operateai.config.ts` — Add `outbound` config block
- `src/engine/messaging/gmail.ts` — Add `threadId` and `inReplyTo` params to `sendEmailViaGmail`, add headers to `buildMimeMessage`
- `src/engine/intake/gmail-poller.ts` — Add outbound prospect check before lead lookup
- `src/engine/intake/process-lead.ts` — Support `priorMessages` in payload for conversation history import
- `src/engine/ai/claude.ts` — Add `askHaikuJSON` and `askSonnet` helpers that use explicit model IDs (`claude-haiku-4-5-20251001` for research/scoring/sentiment, `claude-sonnet-4-5-20241022` for personalization) instead of the global `MODEL` env var. The outbound pipeline needs specific models regardless of the default. Verify exact model ID strings against the Anthropic API at implementation time — use the latest available dated version for each model family.
- `src/engine/messaging/send.ts` — Add pre-send `suppression_list` check alongside existing `lead.opted_out` check. Both outbound and nurture sends must be gated.
- `src/engine/nurture/decide-action.ts` — Handle `paused_until` on lead: if set and in the future, return `{ action: "wait" }`
- `src/types/database.ts` — Add outbound types (Prospect, Campaign, etc.), add `paused_until: string | null` to `Lead`, add `"send_outbound"` to `AIAction.action_type`
- `src/components/sidebar.tsx` — Add outbound nav item under pipeline

---

## 15. Deliverability Strategy

### 15.1 Domain Setup (operateai.ca)

Required DNS records (user responsibility):
- SPF: `v=spf1 include:_spf.google.com ~all`
- DKIM: Configured via Google Workspace admin
- DMARC: `v=DMARC1; p=none; rua=mailto:dmarc@operateai.ca`

### 15.2 Warmup Approach

No automated warmup. Manual ramp via `warmup_week` on the sending account:
- Week 1: max 5 sends/day
- Week 2: max 10 sends/day
- Week 3: max 20 sends/day
- Week 4+: max 30 sends/day

The operator increments `warmup_week` manually in the UI when ready. This is intentionally manual — automated warmup with fake conversations is a deliverability risk on Google Workspace.

### 15.3 Rate Limiting

- One email at a time (no parallel sends from same account)
- 2-5 second delay between sends (random within range)
- All sends within 9-17 ET window
- Random jitter on `send_after` times (0-60 minutes for step 0, 0-120 minutes for steps 1+) prevents clustered sending

### 15.4 Content Best Practices (Enforced by Design)

- Plain text only (no HTML, no images, no tracking pixels)
- Short emails (word count limits per step)
- No link shorteners
- Personalized content (not template-identical across prospects)
- Each email generated fresh by Sonnet — no two prospects get the same email

---

## 16. CASL Compliance

OperateAI operates under CASL (Canadian Anti-Spam Legislation):

- **B2B implied consent:** Cold outreach to business emails is permitted when there's a clear business purpose and the recipient's role is relevant. The ICP scoring step validates business relevance.
- **Sender identification:** Every email includes sender name + business name in the From header and sign-off.
- **Unsubscribe mechanism:** Every email body ends with: `"If this isn't relevant, just let me know and I won't reach out again."` (This is baked into the step 3 prompt and should be present implicitly in earlier steps via the cold email rules.)
- **Opt-out honoring:** `reply_to_stop` → immediate suppression, never contacted again.
- **Record keeping:** All sends, replies, and opt-outs are logged with timestamps.

---

## 17. What This Does NOT Include (v1 Scope)

- **No automated domain warmup** — manual ramp only
- **No A/B testing of sequences** — single sequence per campaign
- **No multi-account sending** — one sending account per campaign
- **No prospect enrichment from external APIs** — only uses data from CSV import
- **No open/click tracking** — no tracking pixels, no link wrapping (intentional for deliverability)
- **No bounce webhook processing** — bounces detected via Gmail API errors on send, not via SNS/webhook
- **No campaign analytics dashboard** — basic stats in campaign list/detail views, no charts
- **No sequence editor UI** — sequences defined in code/config for v1, UI editor is v2
- **No automated prospect sourcing** — CSV import only

---

## 18. Iteration Plan

After the first 100 sends:
- Review actual Gmail API failure rates, adjust auto-pause thresholds
- Review research brief quality at each confidence level
- Review Sonnet email quality, tune step prompts
- Review sentiment classification accuracy
- Adjust warmup ramp based on deliverability signals
- Evaluate whether to flip `requireApproval` to `false` based on email quality consistency
