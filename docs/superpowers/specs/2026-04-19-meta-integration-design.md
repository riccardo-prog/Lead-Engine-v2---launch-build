# Meta Integration Design

Date: 2026-04-19
Status: Approved (rev 2 — added 24h window, webhook latency, IG token validation)

## Overview

Add Meta (Facebook + Instagram) integration to Lead Engine v2. Two capabilities:

1. **Lead Ads** — Facebook/Instagram ad form submissions arrive via webhook, get parsed, and feed into the existing intake pipeline. Replies go via email (no conversation thread in Lead Ads).
2. **DM Conversations** — Facebook Messenger and Instagram DM messages arrive via webhook, create/update leads, and the AI replies directly inside the same thread via the Meta Send API.

First client: Joseph Pavone Real Estate.

## Workflows

### Lead Ad Submission
1. User fills out a Lead Ad form on Facebook or Instagram
2. Meta sends a `leadgen` webhook event (contains only the lead ID)
3. Webhook handler fetches full lead data from `GET /{lead_id}` using the Page Access Token
4. `meta-lead-parser.ts` maps form fields to `IntakePayload` (name, email, phone, custom fields)
5. `processIntake` runs with `sourceId: "facebook-ad"`
6. AI decides next action (typically `send_message` via email)
7. Operator approves, action executes via Outlook

### Facebook Messenger DM
1. Someone sends a DM to Joseph's Facebook Page
2. Meta sends a `messages` webhook event with the sender's Page-Scoped ID (PSID) and message text
3. Webhook handler calls `processIntake` with `sourceId: "facebook-dm"`, `channel: "facebook_dm"`, stores PSID on the lead
4. AI decides next action, picks `channel: "facebook_dm"` (if 24h window is open, otherwise email)
5. Operator approves, `executeAction` sends reply via Messenger Send API using stored PSID

### Instagram DM
Same as Messenger, but sender is identified by Instagram-Scoped ID (IGSID), `sourceId: "instagram-dm"`, `channel: "instagram_dm"`.

### Returning Conversation
Someone who already DM'd sends another message. Dedup by PSID/IGSID finds existing lead. Message appended to conversation history. AI re-evaluates with full history and replies in same thread.

### Cross-Channel
A Lead Ad submitter later DMs on Instagram. Dedup by email match finds existing lead. Lead now has both email and IGSID. AI can choose channel based on context.

## Messenger 24-Hour Messaging Window

Meta's standard messaging policy only allows sending to a user within 24 hours of their last inbound message. After that window closes, delivery fails (or requires an approved HUMAN_AGENT message tag, which requires separate permission approval).

### Behavior

**At send time** (in `dispatchMessage` for `facebook_dm` / `instagram_dm`):
1. Query the most recent inbound message from the lead on that channel.
2. Compute hours since that message.
3. If within 24h → send normally via Meta Send API.
4. If > 24h and lead has email → fail the DM send with reason `outside_messaging_window`. The AI will fall back to email on the next decision pass.
5. If > 24h and no email → mark the action as `flag_human` for operator attention. The operator can manually reach out or wait for the lead to re-engage.

**In the AI prompt** (in `buildDecisionPrompt`):
Expose the window status so the AI picks the right channel upfront:
```
- Facebook Messenger: open (last reply 3h ago) / closed (last reply 47h ago) / not available
- Instagram DM: open (last reply 1h ago) / closed (last reply 2d ago) / not available
```

This prevents the AI from choosing DM when the window is closed, avoiding a failed send → retry cycle.

### Future
If HUMAN_AGENT message tag permission is approved for the Meta App, add a config flag to allow sending outside the 24h window with that tag. For now, fall back to email.

## OAuth + Connection Flow

Same pattern as Microsoft.

### Start (`/api/auth/meta/start`)
- Session auth required
- Generate CSRF state, store in `oauth_states`
- Redirect to `https://www.facebook.com/v22.0/dialog/oauth` with:
  - `client_id`: META_APP_ID
  - `redirect_uri`: `{APP_URL}/api/auth/meta/callback`
  - `scope`: `pages_manage_metadata,pages_messaging,pages_read_engagement,leads_retrieval,instagram_basic,instagram_manage_messages`
  - `state`: the CSRF token

### Callback (`/api/auth/meta/callback`)
1. Validate state against `oauth_states`
2. Exchange code for short-lived user token
3. Exchange short-lived token for long-lived user token (60 days)
4. Fetch user's Pages via `GET /me/accounts`
5. Use the first Page's access token (already long-lived when derived from a long-lived user token)
6. Fetch Instagram Business Account ID via `GET /{page_id}?fields=instagram_business_account`
7. If `instagram_business_account` is null, store `instagram_business_account_id: null` in metadata and log a warning. Instagram DM sending will be unavailable — `sendInstagramDM` will return a clear error (`instagram_not_configured`).
8. Store connection in `connections` table:
   - `provider: "meta"`
   - `access_token`: encrypted Page Access Token
   - `metadata`: `{ page_id, instagram_business_account_id (nullable), page_name }`
9. Subscribe Page to webhooks via `POST /{page_id}/subscribed_apps` with fields `messages,messaging_postbacks,leadgen`
10. Redirect to `/settings?connected=meta`

## Webhook Receiver (`/api/webhooks/meta`)

### GET — Verification
Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`. Verify token against `META_WEBHOOK_VERIFY_TOKEN` env var. Return `hub.challenge` as plain text.

### POST — Events

**Critical: respond 200 before processing.** Meta's webhook timeout is 10 seconds. `processIntake` calls Claude (3-8s). Exceeding the timeout causes Meta to retry, creating duplicate work.

Flow:
1. Read the raw request body (needed for HMAC).
2. Validate `X-Hub-Signature-256` header using HMAC-SHA256 with `META_APP_SECRET`. Use `crypto.timingSafeEqual` — not string equality. Reject 401 if invalid.
3. Parse the event body.
4. **Return `NextResponse.json({ ok: true })` immediately.**
5. Fire-and-forget: kick off `processWebhookEvents(events, config)` without awaiting. Log errors from the promise via `.catch()`.
6. The existing `external_id` dedup in `processIntake` and the messages table unique constraint handle any retries safely.

Event routing (inside `processWebhookEvents`):
- `leadgen` change → fetch lead data → `meta-lead-parser` → `processIntake`
- `messages` from Messenger (entry has `messaging` array with `sender.id` as PSID) → `processIntake` with `sourceId: "facebook-dm"`
- `messages` from Instagram (identified by recipient matching IG account ID from connection metadata) → `processIntake` with `sourceId: "instagram-dm"`

Future: if scale issues arise, move to a proper queue (Vercel Queues or Upstash). Note this as a TODO in BUILD_LOG.md.

### Security
- No session/bearer auth (public endpoint)
- HMAC-SHA256 signature validation using `crypto.timingSafeEqual` serves as authentication
- Webhook verify token for the initial handshake

## Data Model Changes

### `leads` table
```sql
ALTER TABLE leads ADD COLUMN meta_psid text;
ALTER TABLE leads ADD COLUMN meta_igsid text;
CREATE UNIQUE INDEX idx_leads_client_psid ON leads (client_id, meta_psid) WHERE meta_psid IS NOT NULL;
CREATE UNIQUE INDEX idx_leads_client_igsid ON leads (client_id, meta_igsid) WHERE meta_igsid IS NOT NULL;
```

### `connections` table
`metadata jsonb` column already exists (used by Microsoft callback). No migration needed.

### `Lead` type
Add `meta_psid: string | null` and `meta_igsid: string | null`.

### Dedup in `findExistingLead`
Extend to check PSID and IGSID after email and phone:
```
if payload.meta_psid → query by (client_id, meta_psid)
if payload.meta_igsid → query by (client_id, meta_igsid)
```

## Message Sending

### New: `src/engine/messaging/meta-graph.ts`
- `getMetaConnection(clientId)` — fetch Meta connection, decrypt token
- `refreshMetaTokenIfNeeded(connection)` — refresh long-lived token if near 60-day expiry
- `sendFacebookDM({ clientId, recipientPsid, message })` — POST to `graph.facebook.com/v22.0/me/messages`. Checks 24h window first.
- `sendInstagramDM({ clientId, recipientIgsid, message })` — same API. Returns `{ success: false, error: "instagram_not_configured" }` if `instagram_business_account_id` is null in connection metadata.
- `fetchLeadAdData({ leadId, accessToken })` — GET `/{lead_id}` for full form data
- `getMessagingWindowStatus({ leadId, channel, clientId })` — queries last inbound message on the channel, returns `{ open: boolean, hoursSinceLastInbound: number | null }`

### Extend `send.ts`
Add `facebook_dm` and `instagram_dm` branches in `dispatchMessage`:
- Check 24h messaging window first
- If window closed + email available → return `{ success: false, reason: "outside_messaging_window" }`
- If window closed + no email → return `{ success: false, reason: "outside_messaging_window_no_fallback" }`
- If window open → `sendFacebookDM` / `sendInstagramDM` with the lead's PSID/IGSID
- If lead lacks the required ID → fall back to email if available, otherwise fail with reason

### Smarter `inferChannel` in `execute-action.ts`
Priority order:
1. `meta_igsid` + source is `instagram-dm` → `instagram_dm`
2. `meta_psid` + source is `facebook-dm` → `facebook_dm`
3. `email` → `email`
4. `phone` → `sms`

### DM Limitations
Plain text only (no subject lines, no HTML). The AI already outputs plain text in `message` field. No changes needed.

## Config + Compliance

### Joseph's config additions
New messaging rules:
```ts
{ channel: "facebook_dm", maxPerDay: 3, allowedHoursStart: 8, allowedHoursEnd: 21, timezone: "America/Toronto", requireOptIn: false }
{ channel: "instagram_dm", maxPerDay: 3, allowedHoursStart: 8, allowedHoursEnd: 21, timezone: "America/Toronto", requireOptIn: false }
```

New lead source:
```ts
{ id: "facebook-dm", type: "meta_ad", label: "Facebook Messenger", funnelStageOnEntry: "new" }
```

`requireOptIn: false` because DM initiation is implicit consent. `maxPerDay: 3` since DM conversations are faster-paced than email.

### AI prompt
Add to `buildDecisionPrompt`:
```
- Facebook Messenger: ${windowStatus} (e.g., "open (last reply 3h ago)" / "closed (last reply 47h ago)" / "not available")
- Instagram DM: ${windowStatus}
```

### Compliance
Existing `checkCompliance` reads `messagingRules` by channel. DM channels will be enforced automatically with zero code changes.

## Settings UI

Change the existing Meta `IntegrationRow` from `comingSoon` to a functional connect/disconnect row. Shows "Connected as {page_name}" when connected.

## Environment Variables

New:
- `META_APP_ID` — Meta App ID from Developer portal
- `META_APP_SECRET` — Meta App Secret (also used for HMAC webhook signature validation)
- `META_WEBHOOK_VERIFY_TOKEN` — random string for webhook handshake

## Meta App Setup (manual)

1. Create a Business App at developers.facebook.com
2. Add products: Facebook Login, Webhooks, Messenger, Instagram
3. Facebook Login: add `{APP_URL}/api/auth/meta/callback` as valid redirect URI
4. Webhooks: subscribe to `Page` object, fields: `messages`, `messaging_postbacks`, `leadgen`. Callback URL: `{APP_URL}/api/webhooks/meta`. Verify token: `META_WEBHOOK_VERIFY_TOKEN` value.
5. Messenger: link Facebook Page
6. Instagram: connect the Instagram Business account (must be a Business account, not Personal) linked to that Page. Instagram DM sending requires the IG account be a Business account linked to the Page.

## New Files

| File | Purpose |
|------|---------|
| `src/app/api/auth/meta/start/route.ts` | OAuth start |
| `src/app/api/auth/meta/callback/route.ts` | OAuth callback + IG validation + webhook subscription |
| `src/app/api/webhooks/meta/route.ts` | Webhook receiver (verify + events, fire-and-forget processing) |
| `src/engine/messaging/meta-graph.ts` | Meta Graph API: send DMs, fetch leads, token refresh, 24h window check |
| `src/engine/intake/meta-lead-parser.ts` | Parse Lead Ad form fields into IntakePayload |
| `sql/002_meta_integration.sql` | Add meta_psid, meta_igsid to leads |

## Modified Files

| File | Change |
|------|--------|
| `src/engine/messaging/send.ts` | Add facebook_dm + instagram_dm dispatch with 24h window check |
| `src/engine/nurture/execute-action.ts` | Smarter inferChannel |
| `src/engine/nurture/decide-action.ts` | Show available DM channels + window status in prompt |
| `src/engine/intake/process-lead.ts` | Extend findExistingLead + IntakePayload for PSID/IGSID |
| `src/types/database.ts` | Add meta fields to Lead type |
| `src/config/joseph.config.ts` | Add DM messaging rules + facebook-dm source |
| `src/components/settings/settings-view.tsx` | Wire up Meta integration row |
| `BUILD_LOG.md` | Document everything |
