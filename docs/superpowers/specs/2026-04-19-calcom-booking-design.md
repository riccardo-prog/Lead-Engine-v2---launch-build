# Cal.com Booking Integration Design

Date: 2026-04-19
Status: Approved

## Overview

Wire up Cal.com booking so the AI can actually create appointments when it decides `book_appointment`. Two modes:

1. **Specific time** — Lead asks for a particular time ("Thursday at 2pm"). AI checks Cal.com availability, books the slot if open, sends confirmation.
2. **Send link** — Lead is ready to book but no time specified. AI sends the Cal.com booking link so the lead picks a time. Cal.com webhook confirms the booking back to us.

Cal.com handles confirmation emails, reminders, and calendar sync natively. We don't build any of that.

First client: Joseph Pavone Real Estate (Discovery Call).

## Workflows

### Specific Time Booking
1. Lead says something like "can we meet Thursday at 2pm?"
2. AI decides `book_appointment` with `bookingMode: "specific_time"` and `requestedTime`
3. Operator approves in inbox
4. `executeAction` calls `checkAvailability` on Cal.com API
5. If available: `createBooking` → send confirmation message to lead → create `appointments` row → advance lead to "booked" → notify operator
6. If unavailable: send fallback message with booking link → advance lead to "qualified" (awaiting self-book)

### Send Link Booking
1. Lead is qualified and ready to book, no specific time mentioned
2. AI decides `book_appointment` with `bookingMode: "send_link"`
3. Operator approves in inbox
4. `executeAction` injects `config.booking.url` into the message → sends via appropriate channel → advance lead to "qualified"
5. Lead self-books via Cal.com
6. Cal.com sends webhook → handler matches lead by email → create `appointments` row → advance lead to "booked" → notify operator

### Booking Cancellation
1. Lead or Joseph cancels via Cal.com
2. Cal.com sends cancellation webhook
3. Handler updates appointment status to "cancelled" → notifies operator

## New Module: `src/engine/booking/calcom.ts`

Three functions:

- **`checkAvailability({ startTime, eventTypeId, apiKey })`** — `GET https://api.cal.com/v2/slots` with `eventTypeId`, `start`, `end` query params. Returns whether the requested slot is open.
- **`createBooking({ name, email, timeZone, startTime, eventTypeId, apiKey })`** — `POST https://api.cal.com/v2/bookings` with body `{ eventTypeId, start, attendee: { name, email, timeZone, language } }`. Returns booking UID, meeting URL, and duration.
- **`cancelBooking({ bookingUid, apiKey })`** — `DELETE https://api.cal.com/v2/bookings/{uid}`. For future use.

Auth: Bearer token in `Authorization` header (`Bearer cal_live_...`). Requires `cal-api-version: 2024-08-13` header on all requests. API key stored in `CAL_API_KEY` env var.

## New Route: `POST /api/webhooks/calcom`

Receives Cal.com webhook events. Validates HMAC-SHA256 signature from the `X-Cal-Signature-256` header using `CAL_WEBHOOK_SECRET`.

**Booking created (`BOOKING_CREATED`):**
1. Extract attendee email from payload
2. Find lead by email (scoped to `client_id`)
3. Create `appointments` row: `scheduled_at`, `duration_minutes`, `meeting_type` (from config), `status: "scheduled"`, `booking_url`
4. Advance lead stage to "booked"
5. Notify operator: "Discovery Call booked with {name} at {time}"

**Booking cancelled (`BOOKING_CANCELLED`):**
1. Match appointment by `booking_url` or attendee email + time
2. Update appointment `status` to "cancelled"
3. Notify operator: "Booking with {name} cancelled"

## Changes to Existing Code

### `NurtureDecision` type (decide-action.ts)
Add fields:
```typescript
bookingMode?: "specific_time" | "send_link"
requestedTime?: string  // ISO 8601
```

### `decide-action.ts` prompt
Add to the system prompt:
- Booking URL: `config.booking.url`
- Meeting type: `config.booking.meetingType`
- When `book_appointment`, must include `bookingMode` and optionally `requestedTime`
- For `send_link` mode, include `{{booking_url}}` in the message — `executeAction` replaces it with the real URL

### `executeAction` (execute-action.ts)
New `book_appointment` handler:
- Parse `bookingMode` from the action (AI stores it in proposed_content as JSON, or we add dedicated columns)
- **`specific_time`:** checkAvailability → createBooking → send confirmation → create appointment → advance to "booked" → notify
- **`send_link`:** replace `{{booking_url}}` in message → send → advance to "qualified"
- Fallback: if specific time unavailable, send link message instead

### `Notification` type (database.ts)
Add to the union: `"booking_confirmed" | "booking_cancelled"`

### Settings view
Cal.com stays as "Coming soon" in the UI. Configuration is env-var based (`CAL_API_KEY`, `CAL_EVENT_TYPE_ID`, `CAL_WEBHOOK_SECRET`). No OAuth flow needed.

## Environment Variables

New:
- `CAL_API_KEY` — Cal.com API key
- `CAL_EVENT_TYPE_ID` — the numeric ID of the event type to book (e.g., Discovery Call)
- `CAL_WEBHOOK_SECRET` — HMAC secret for webhook validation

Existing (already in config):
- `JOSEPH_BOOKING_URL` — the public Cal.com booking page URL

## Data Flow

```
Lead: "Can we meet Thursday at 2pm?"
  → AI: book_appointment, specific_time, requestedTime
  → Operator approves in inbox
  → executeAction:
      → checkAvailability(Thursday 2pm) ✓
      → createBooking(lead.name, lead.email, Thursday 2pm)
      → sendMessage(confirmation to lead)
      → INSERT INTO appointments
      → UPDATE leads SET stage_id = "booked"
      → notify(booking_confirmed)

Lead: "I'd love to set up a call"
  → AI: book_appointment, send_link
  → Operator approves in inbox
  → executeAction:
      → sendMessage(message with booking link)
      → UPDATE leads SET stage_id = "qualified"
  → Lead self-books on Cal.com
  → Cal.com webhook → /api/webhooks/calcom
      → INSERT INTO appointments
      → UPDATE leads SET stage_id = "booked"
      → notify(booking_confirmed)
```

## What We Don't Build

- Confirmation/reminder emails — Cal.com handles this
- Calendar sync — Cal.com handles this
- Settings UI for Cal.com — env vars are sufficient
- Rescheduling logic — out of scope for v1
