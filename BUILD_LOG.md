# Lead Engine v2 — Build Log

Living document. The source of truth for what this codebase is, how it's put together, and where it's going. Update as decisions are made.

---

## What this is

Lead Engine is OperateAI's flagship product: an AI-powered lead intake, nurture, and booking system for service businesses. This is v2 — a ground-up rebuild of v1 with a config-driven, multi-client architecture.

**First client:** Joseph Pavone Real Estate. His instance handles Realtor.ca email leads, Meta ad inquiries, AI-drafted responses with human approval, and appointment booking.

**Model:** Separate deployments per client. One master codebase, one config file per client, one Vercel deployment per client. Not multi-tenant — we deliberately chose per-client instances for customization and simplicity.

---

## Architecture overview

Three layers:

1. **Config layer** — a single TypeScript file per client (e.g. `src/config/joseph.config.ts`) that defines everything about how that client's instance behaves: funnel stages, AI persona, lead sources, compliance jurisdiction, messaging rules, qualification criteria, booking provider.

2. **Core engine** — shared code that reads from the config and executes. Modules:
   - `src/engine/ai/` — Claude wrapper
   - `src/engine/intake/` — lead intake, email parsing, inbox polling
   - `src/engine/nurture/` — AI decision engine, action execution, lead summarization
   - `src/engine/messaging/` — outbound message dispatch, OAuth, compliance
   - `src/engine/compliance/` — gatekeeper every outbound message passes through

3. **UI / API** — Next.js app router. Dashboard routes under `src/app/(dashboard)/`, API routes under `src/app/api/`.

---

## Tech stack

- Next.js 16 (app router, server components)
- TypeScript
- Supabase (Postgres + auth)
- Anthropic SDK (Claude for all AI)
- Microsoft Graph API (Outlook send + inbox read)
- Vercel (deployment target)
- Tailwind + shadcn/ui base (inline styles with CSS variables for custom components)

---

## Key files

### Config
- `src/config/schema.ts` — the `ClientConfig` contract
- `src/config/joseph.config.ts` — Joseph's actual setup

### Engine
- `src/engine/booking/calcom.ts` — Cal.com v2 API client: `checkAvailability`, `createBooking`, `cancelBooking`. Uses Bearer token auth + `cal-api-version: 2024-08-13` header.
- `src/engine/ai/claude.ts` — `askClaude` + `askClaudeJSON`, model read from `ANTHROPIC_MODEL` env var
- `src/engine/nurture/decide-action.ts` — the brain. Every AI decision goes through this. Supports `operatorFeedback` for regenerate-with-feedback flow.
- `src/engine/nurture/execute-action.ts` — takes an approved action and actually does it (sends message, advances stage, disqualifies, books).
- `src/engine/nurture/summarize-lead.ts` — generates hot/warm/cold + status + next action + key moments. Cached per-lead, invalidated on new message/action.
- `src/engine/intake/process-lead.ts` — dedup + create/update + trigger AI decision. Race-safe via unique constraints.
- `src/engine/intake/realtor-parser.ts` — parses Realtor.ca form emails.
- `src/engine/intake/outlook-poller.ts` — polls Outlook inbox for Realtor.ca leads. Only touches emails matching the Realtor.ca sender + subject pattern. Marks Realtor emails as read after processing; leaves everything else alone.
- `src/engine/messaging/send.ts` — outbound message gatekeeper. Checks compliance, schedules if outside hours, dispatches via Outlook or Meta DMs. Checks 24h messaging window for DM channels.
- `src/engine/messaging/microsoft-graph.ts` — OAuth token management (encrypted at rest), refresh logic, email sending.
- `src/engine/messaging/meta-graph.ts` — Meta Graph API v22.0 module: `getMetaConnection`, `getValidMetaToken` (auto-refreshes within 7 days of expiry), `sendFacebookDM`, `sendInstagramDM`, `fetchLeadAdData`, `getMessagingWindowStatus` (24h window check).
- `src/engine/intake/meta-lead-parser.ts` — maps Meta Lead Ad form fields to `IntakePayload`.
- `src/engine/compliance/compliance.ts` — async check including opt-in, allowed hours, `maxPerDay` enforcement via DB count, jurisdiction rules.

### Notifications
- `src/engine/notifications/notify.ts` — `notify()` helper that inserts a notification row. Used by flush route, process-lead, and regenerate route. Never throws — logs on failure so the main flow isn't interrupted.
- `src/components/notifications/notification-bell.tsx` — bell icon with unread badge + dropdown popover. Clicking an item navigates to the linked lead/inbox and marks it read.
- `src/components/notifications/use-notifications.ts` — `useNotifications()` hook. Polls `GET /api/notifications` every 30s. Provides `items`, `unreadCount`, `markRead`, `markAllRead`.

### Shared libs
- `src/lib/api-auth.ts` — session auth + bearer token auth helpers. Uses `crypto.timingSafeEqual` to prevent timing side-channels.
- `src/lib/token-crypto.ts` — AES-256-GCM encryption for OAuth tokens. Key derived from `TOKEN_ENCRYPTION_KEY` (falls back to `INTERNAL_API_SECRET`). No plaintext fallback.
- `src/lib/timezone.ts` — shared `getHourInTimezone`, `startOfDayInTimezone`, `getNextAllowedTime` (DST-safe via fixed-point iteration).
- `src/lib/rate-limit.ts` — in-memory token bucket. **Must replace with Upstash before production (see Pre-production TODOs).**
- `src/lib/config.ts` — loads the right client config based on `CLIENT_ID` env var.
- `src/lib/supabase.ts` — browser Supabase client.
- `src/lib/supabase-server.ts` — server + service role Supabase clients.

### API routes
- `POST /api/intake` — accept a lead (session OR bearer auth; rate limited at 30/min sustained, 60 burst).
- `POST /api/actions/execute` — atomically approves and executes an action (session auth only). Accepts optional `contentOverride` for edits.
- `POST /api/actions/regenerate` — rejects an action and generates a new one from operator feedback (session auth).
- `POST /api/scheduled/flush` — sends due scheduled messages. Tracks `send_attempts`, gives up after `MAX_SEND_ATTEMPTS = 3` (bearer auth, for cron).
- `POST /api/outlook/poll` — scans Outlook for new Realtor.ca leads (bearer auth, for cron).
- `GET /api/auth/microsoft/start` — begins OAuth with CSRF state (session auth required).
- `GET /api/auth/microsoft/callback` — completes OAuth, validates state, encrypts tokens.
- `DELETE /api/connections/[id]` — disconnects an integration (session auth).
- `GET /api/auth/meta/start` — begins Meta OAuth with CSRF state. Requests scopes for Pages, Messenger, Instagram, and Lead Ads (session auth).
- `GET /api/auth/meta/callback` — completes Meta OAuth. Exchanges code → short-lived → long-lived user token → Page Access Token. Fetches Instagram Business Account ID. Encrypts tokens, stores connection with metadata, subscribes Page to webhooks.
- `POST /api/webhooks/meta` — Meta webhook receiver (GET for verification handshake, POST for events). HMAC-SHA256 validated. Fire-and-forget processing: responds 200 immediately, then routes `leadgen`, Messenger DM, and Instagram DM events through the intake pipeline.
- `POST /api/webhooks/calcom` — Cal.com webhook receiver. HMAC-SHA256 validated via `CAL_WEBHOOK_SECRET`. Handles `BOOKING_CREATED` (creates appointment, advances lead to booked, notifies operator) and `BOOKING_CANCELLED` (updates appointment status, notifies operator). Fire-and-forget processing.
- `GET /api/notifications` — returns last 50 notifications with unread count (session auth).
- `POST /api/notifications/[id]/read` — marks a single notification as read, client_id scoped (session auth).
- `POST /api/notifications/read-all` — marks all notifications as read for the current client (session auth).

### UI
- `src/app/(dashboard)/pipeline/` — list view + detail view (with cached AI summary) + new lead form (calls `/api/intake`).
- `src/app/(dashboard)/inbox/` — approval queue with approve / edit / regenerate-with-feedback.
- `src/app/(dashboard)/settings/` — integrations + read-only config display.
- `src/components/` — components organized by domain (pipeline, inbox, settings, sidebar).

---

## Database schema

Supabase Postgres. Tables:

- **`leads`** — name, email, phone, `meta_psid`, `meta_igsid`, stage_id, source_id, score, qualified, opt-in fields, custom_fields JSONB, tags, cached `summary` JSONB + `summary_updated_at`. Unique indexes on `(client_id, lower(email))`, `(client_id, phone)`, `(client_id, meta_psid)`, `(client_id, meta_igsid)` to prevent race-condition duplicates. Migration: `sql/002_meta_integration.sql`.
- **`messages`** — inbound and outbound. Includes `scheduled_for`, `scheduled_reason`, `send_failed`, `send_failure_reason`, `send_attempts` for the flush retry system. Unique index on `(client_id, external_id)` for dedup.
- **`appointments`** — booking records (not yet wired to Cal.com).
- **`ai_actions`** — every AI decision. Statuses: `pending` / `approved` / `rejected` / `executed`. Includes `new_stage_id` for `advance_stage` actions.
- **`connections`** — OAuth connections. `access_token` and `refresh_token` are AES-256-GCM encrypted at rest.
- **`api_tokens`** — for future bearer token issuance (currently unused — we validate against `INTERNAL_API_SECRET` directly).
- **`oauth_states`** — CSRF state tokens for OAuth flows. Single-use, TTL-bounded.
- **`notifications`** — in-app notifications. Fields: `type` (message_sent, message_failed, ai_failed, action_pending), `title`, `body`, nullable `lead_id` + `action_id` FKs, `read_at`. Index on `(client_id, read_at, created_at desc)` for efficient unread queries. Migration: `sql/001_notifications.sql`.

RLS enabled on all tables; permissive policies for authenticated users (server-side service client bypasses RLS for admin operations).

---

## Environment variables

Required:
- `CLIENT_ID` — which config file to load (e.g. `joseph-real-estate`). Server-only, NOT prefixed with `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` — service role key
- `ANTHROPIC_API_KEY`
- `MICROSOFT_OAUTH_CLIENT_ID` — Azure app ID (renamed from the ambiguous `MICROSOFT_CLIENT_ID`)
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT_ID` — usually `common`
- `INTERNAL_API_SECRET` — shared secret for bearer auth
- `TOKEN_ENCRYPTION_KEY` — (optional, recommended) dedicated key for OAuth token encryption. Falls back to `INTERNAL_API_SECRET` if not set
- `NEXT_PUBLIC_APP_URL`
- `OPERATOR_EMAIL`
- `JOSEPH_BOOKING_URL`
- `ANTHROPIC_MODEL` — e.g. `claude-opus-4-5`
- `OAUTH_STATE_TTL_SECONDS` — default 600
- `META_APP_ID` — Facebook App ID
- `META_APP_SECRET` — Facebook App Secret (also used for webhook HMAC validation)
- `META_WEBHOOK_VERIFY_TOKEN` — arbitrary string for webhook verification handshake
- `CAL_API_KEY` — Cal.com API key (`cal_live_...`)
- `CAL_EVENT_TYPE_ID` — numeric ID of the Cal.com event type (e.g., Discovery Call)
- `CAL_WEBHOOK_SECRET` — HMAC secret for Cal.com webhook validation

---

## Security posture

- All API routes authenticated (session OR bearer), except `/api/webhooks/meta` which uses HMAC-SHA256 signature validation.
- OAuth flows protected by CSRF state (server-side, single-use, TTL-bounded).
- OAuth tokens encrypted at rest with AES-256-GCM. No plaintext fallback.
- Bearer token comparison uses constant-time `crypto.timingSafeEqual` to prevent timing attacks.
- Intake rate-limited (30 req/min sustained, 60 burst per caller).
- Payload size capped at 100KB on intake.
- Errors to clients are sanitized codes; full error details log server-side only.
- Multi-tenant scoping enforced server-side — the browser never writes to Supabase directly.
- Service role key only used in server routes.

---

## Compliance model

Jurisdictions supported: **CASL** (Canada — Joseph's), **TCPA** (US), **GDPR** (EU).

Every outbound message passes through `checkCompliance` which verifies:
1. Lead hasn't globally opted out.
2. Channel is enabled in client config.
3. Opt-in satisfied if `rule.requireOptIn` is true.
4. Current time is within the rule's allowed hours for the rule's timezone.
5. Daily cap (`maxPerDay`) not exceeded — counts same-channel outbound messages to the lead since start of day in rule's timezone.
6. Jurisdiction-specific rules (e.g. CASL requires SMS opt-in).

If blocked for time-of-day, message is scheduled for the next allowed window instead of failing. Scheduled messages flushed by `/api/scheduled/flush` (cron hits this).

---

## AI behavior

- Persona comes from `config.aiPersona`. Joseph's persona is "Alex" — friendly, warm, not pushy.
- System prompt enforces AI identity: assistant speaks ON BEHALF OF the business owner, never AS them.
- Form-submission detection: if source is `realtor-email` and it's the first inbound, AI knows to craft first-touch outreach referencing the specific property, not respond as if the lead "wrote" the form template.
- Operator feedback flow: rejecting an action with feedback passes the feedback back into the prompt so the AI explicitly adjusts. Old proposal is shown as what NOT to repeat.
- Human approval required by default (`config.humanApprovalRequired = true`). Future clients can flip this to autonomous.

---

## Review history

Four rounds of code review, all closed:

- **Round 1** — 14 issues. Auth, encryption, client-side writes, token refresh, regenerate feedback, advance_stage no-ops, stray files.
- **Round 2** — 8 issues. Unique constraints, isRead filter, batch dedup, env var renames.
- **Round 3** — 17 issues. Timing attacks, plaintext fallbacks, rate limiting, failed-message tracking, maxPerDay enforcement, hardcoded values.
- **Round 4** — 3 nits. DST edge case in timezone helper, inline handler style (skipped), POST→DELETE semantics.
- **Round 5** — 13 issues. Missing `client_id` scoping in engine queries (Critical), dual-use encryption key, silent disconnect errors, prompt injection via operator feedback, unnormalized phone dedup, serverless rate-limit no-op, dead nav routes, boilerplate root page.

All fixes shipped. No outstanding review items.

---

## Pre-production TODOs

Only one real blocker:

- **Replace in-memory rate limiter with Upstash.** `src/lib/rate-limit.ts` uses a `Map` that resets on cold start and doesn't share across Vercel instances. On production traffic this is effectively no limit. Swap to `@upstash/ratelimit` + `@upstash/redis` during deploy.

Deferred (post-deploy, non-blocking):

- **Lead summary latency.** First page load blocks 3-8s on Claude. Subsequent loads cache-hit. Good enough for launch; stream or background later.
- **Tests.** No test coverage yet. Add a minimal harness for `parseRealtorEmail`, `checkCompliance`, and the race-safe path in `processIntake` once the codebase is frozen.
- **Friendlier timeAgo rendering.** Minor hydration warning from `Date.now()` in client component — harmless.

---

## In-app notifications

Implemented. Four notification types fire automatically:

1. **`message_sent`** — when a message is sent immediately via `executeAction`, scheduled for later (with scheduled time in body), or when `/api/scheduled/flush` delivers a deferred email. Links to the lead.
2. **`message_failed`** — when flush gives up after `MAX_SEND_ATTEMPTS` (3). Includes the failure reason. Links to the lead.
3. **`ai_failed`** — when AI decision throws in `processIntake`. Links to the lead.
4. **`action_pending`** — when a new `ai_actions` row with `status=pending` is created (from `processIntake` or `regenerate` route). Links to inbox.

UI: bell icon in the sidebar footer with an unread count badge. Clicking opens a dropdown with the last 50 notifications (title, body truncated, relative time). Clicking an item navigates to the linked lead or inbox and marks it read. "Mark all read" button at the top. Polls every 30s via `useNotifications()` hook.

All writes go through the server-side `notify()` helper. All reads go through session-auth API routes, scoped by `client_id`.

---

## Meta integration (Facebook + Instagram)

Implemented. Covers Lead Ads (form webhooks) and bidirectional DM conversations (Messenger + Instagram).

**OAuth flow:** Settings page → "Connect" → Facebook OAuth dialog → callback exchanges code for long-lived Page Access Token → stores encrypted connection with metadata (`page_id`, `page_name`, `instagram_business_account_id`). Subscribes Page to `leadgen` and `messages` webhook topics automatically.

**Lead Ads:** When a user fills out a Facebook/Instagram Lead Ad form, Meta sends a `leadgen` webhook. The handler fetches the full lead data from the Graph API, parses fields via `meta-lead-parser.ts`, and feeds them into `processIntake`. The lead enters the standard funnel.

**DM conversations:** Inbound Messenger and Instagram DMs arrive via webhook. The handler identifies the lead by PSID (Messenger) or IGSID (Instagram), creates or deduplicates the lead, stores the message, and triggers the AI decision engine. Outbound replies go through `send.ts` which checks the 24h messaging window before dispatching.

**24h messaging window:** Meta requires a user to have messaged within the last 24 hours before you can send them a DM. `getMessagingWindowStatus` checks the last inbound message timestamp. If the window is closed and the lead has an email, `send.ts` returns `outside_messaging_window` so the AI can fall back to email. The AI prompt also shows window status so it picks the right channel upfront.

**Webhook security:** All incoming webhooks are validated with HMAC-SHA256 using `META_APP_SECRET` and `crypto.timingSafeEqual`. The handler responds 200 immediately (fire-and-forget) to avoid Meta's 10s timeout while Claude processes.

**Instagram scope:** If the connected Page has no linked Instagram Business Account, the connection still succeeds but `instagram_business_account_id` is stored as null. `sendInstagramDM` returns a clear `instagram_not_configured` error. A warning is shown during OAuth callback.

**Channel inference:** `executeAction` infers the best channel from lead source — Instagram DM leads reply via Instagram, Messenger leads via Messenger, email leads via email. The AI prompt also includes window status to inform channel selection.

Design doc: `docs/superpowers/specs/2026-04-19-meta-integration-design.md`
Migration: `sql/002_meta_integration.sql`

---

## Cal.com booking integration

Implemented. Two booking modes, both gated behind human approval.

**Specific time:** Lead requests a time → AI decides `book_appointment` with `bookingMode: "specific_time"` and `requestedTime` → operator approves → `executeAction` checks Cal.com availability → if open, creates booking via Cal.com API, sends confirmation to lead, creates `appointments` row, advances to "booked", notifies operator. If the slot is unavailable, falls back to sending the booking link.

**Send link:** Lead is ready but no specific time → AI decides `book_appointment` with `bookingMode: "send_link"` → operator approves → `executeAction` replaces `{{booking_url}}` in the message with `config.booking.url`, sends via the appropriate channel, advances to "qualified". Lead self-books on Cal.com → webhook fires → handler creates appointment, advances to "booked", notifies operator.

**Cancellation:** Cal.com sends `BOOKING_CANCELLED` webhook → handler finds the appointment, sets status to "cancelled", notifies operator.

**Webhook security:** HMAC-SHA256 validated using `CAL_WEBHOOK_SECRET`. Fire-and-forget processing (responds 200 immediately).

**AI prompt changes:** The system prompt now tells the AI about booking modes, when to use each, and to include `{{booking_url}}` in send_link messages. `NurtureDecision` has `bookingMode` and `requestedTime` fields.

Design doc: `docs/superpowers/specs/2026-04-19-calcom-booking-design.md`

---

## Still to build

In order:

1. **Vercel deploy** — get the app live at a subdomain. Set up Vercel Cron for `/api/outlook/poll` (every 5 min) and `/api/scheduled/flush` (every 5 min).
2. **Upstash swap** — replace in-memory rate limiter at deploy time.
3. **Meta App Review** — submit for review to unlock `leads_retrieval`, `instagram_basic`, `instagram_manage_messages`. Until approved, Lead Ads and Instagram DMs are disabled. Set `META_APP_REVIEWED=true` after approval and reconnect.
4. ~~**Cal.com booking**~~ — **Done.** Two modes: specific_time (check availability → book → confirm) and send_link (send booking URL → Cal.com webhook on self-book). Webhook handles BOOKING_CREATED and BOOKING_CANCELLED.
5. **Outbound module** (OperateAI only for now, `outboundEnabled: false` on Joseph's config) — Apollo prospecting, ICP scoring, sequence builder, Resend delivery, reply webhook → classify → handoff to inbound.

Other future clients and their configs get added as new files under `src/config/` with zero engine changes.

---

## Useful commands

Dev server:
```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run dev
```

Test intake (replace secret):
```bash
curl -X POST http://localhost:3000/api/intake \
  -H "Authorization: Bearer $(grep INTERNAL_API_SECRET .env.local | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"manual","firstName":"Test","lastName":"Lead","email":"test@example.com"}'
```

Trigger Outlook poll:
```bash
curl -X POST http://localhost:3000/api/outlook/poll \
  -H "Authorization: Bearer $(grep INTERNAL_API_SECRET .env.local | cut -d= -f2)"
```

Flush scheduled messages:
```bash
curl -X POST http://localhost:3000/api/scheduled/flush \
  -H "Authorization: Bearer $(grep INTERNAL_API_SECRET .env.local | cut -d= -f2)"
```

Simulate Meta Lead Ad webhook (replace `APP_SECRET` with your `META_APP_SECRET`):
```bash
PAYLOAD='{"object":"page","entry":[{"id":"PAGE_ID","time":1234567890,"changes":[{"field":"leadgen","value":{"form_id":"123","leadgen_id":"456","page_id":"PAGE_ID","created_time":1234567890}}]}]}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$APP_SECRET" | awk '{print $2}')
curl -X POST http://localhost:3000/api/webhooks/meta \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$PAYLOAD"
```

Simulate Meta Messenger DM webhook:
```bash
PAYLOAD='{"object":"page","entry":[{"id":"PAGE_ID","time":1234567890,"messaging":[{"sender":{"id":"SENDER_PSID"},"recipient":{"id":"PAGE_ID"},"timestamp":1234567890,"message":{"mid":"mid.123","text":"Hi, I saw your listing"}}]}]}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$APP_SECRET" | awk '{print $2}')
curl -X POST http://localhost:3000/api/webhooks/meta \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$PAYLOAD"
```

Verify Meta webhook handshake:
```bash
curl "http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
# Should return: test123
```
