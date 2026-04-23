import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { createServiceClient } from "@/lib/supabase-server"
import { getConfig } from "@/lib/config"
import { notify, leadName } from "@/engine/notifications/notify"
import type { Lead } from "@/types/database"
import type { ClientConfig } from "@/config/schema"

export async function POST(request: NextRequest) {
  const secret = process.env.CAL_WEBHOOK_SECRET
  if (!secret) {
    console.error("CAL_WEBHOOK_SECRET not set")
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get("x-cal-signature-256")

  if (!signature || !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 })
  }

  let body: CalWebhookPayload
  try {
    body = JSON.parse(rawBody) as CalWebhookPayload
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  // Process fire-and-forget so we respond quickly
  void processCalEvent(body).catch((err) =>
    console.error("Cal.com webhook processing error", err)
  )

  return NextResponse.json({ ok: true })
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSig = createHmac("sha256", secret).update(payload).digest("hex")
  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSig)

  if (sigBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(sigBuffer, expectedBuffer)
}

type CalWebhookPayload = {
  triggerEvent: string
  payload: {
    uid: string
    startTime: string
    endTime: string
    meetingUrl?: string
    attendees: Array<{
      name: string
      email: string
      timeZone: string
    }>
    status?: string
  }
}

function formatTime(iso: string, config: ClientConfig): string {
  const tz = config.messagingRules[0]?.timezone || "America/Toronto"
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  })
}

async function processCalEvent(body: CalWebhookPayload) {
  const supabase = createServiceClient()

  // Find the lead by attendee email to determine which client this booking belongs to
  const attendee = body.payload.attendees?.[0]
  if (!attendee?.email) {
    console.error("Cal.com webhook has no attendee email")
    return
  }

  // Find all leads matching this email across tenants, then pick the one
  // whose client actually uses Cal.com as their booking provider.
  const { data: leadRows } = await supabase
    .from("leads")
    .select("client_id")
    .ilike("email", attendee.email)

  if (!leadRows || leadRows.length === 0) {
    console.log("Cal.com booking for unknown lead", { email: attendee.email })
    return
  }

  let matchedClientId: string | null = null
  for (const row of leadRows) {
    try {
      const cfg = await getConfig(row.client_id)
      if (cfg.booking?.provider === "cal.com") {
        matchedClientId = row.client_id
        break
      }
    } catch {
      // config not found for this client, skip
    }
  }

  if (!matchedClientId) {
    console.log("Cal.com booking — no matching client with cal.com provider", { email: attendee.email })
    return
  }

  const config = await getConfig(matchedClientId)

  if (body.triggerEvent === "BOOKING_CREATED") {
    await handleBookingCreated(body, config, supabase)
  } else if (body.triggerEvent === "BOOKING_CANCELLED") {
    await handleBookingCancelled(body, config, supabase)
  }
}

async function handleBookingCreated(body: CalWebhookPayload, config: ClientConfig, supabase: ReturnType<typeof createServiceClient>) {
  const attendee = body.payload.attendees?.[0]
  if (!attendee?.email) {
    console.error("Cal.com booking webhook has no attendee email")
    return
  }

  // Find lead by email, scoped to client
  const { data: leadRow } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", config.clientId)
    .ilike("email", attendee.email)
    .single()

  if (!leadRow) {
    console.log("Cal.com booking for unknown lead", { email: attendee.email })
    return
  }

  const lead = leadRow as Lead

  const duration = body.payload.startTime && body.payload.endTime
    ? Math.round(
        (new Date(body.payload.endTime).getTime() - new Date(body.payload.startTime).getTime()) / 60_000
      )
    : 30

  // Check if appointment already exists (dedup by booking UID in booking_url)
  const { data: existing } = await supabase
    .from("appointments")
    .select("id")
    .eq("client_id", config.clientId)
    .eq("lead_id", lead.id)
    .eq("booking_url", body.payload.meetingUrl || body.payload.uid)
    .maybeSingle()

  if (existing) {
    console.log("Duplicate Cal.com booking webhook, skipping", { uid: body.payload.uid })
    return
  }

  await supabase.from("appointments").insert({
    client_id: config.clientId,
    lead_id: lead.id,
    scheduled_at: body.payload.startTime,
    duration_minutes: duration,
    meeting_type: config.booking.meetingType,
    status: "scheduled",
    booking_url: body.payload.meetingUrl || body.payload.uid,
  })

  // Advance lead to booked
  await supabase
    .from("leads")
    .update({ stage_id: "booked", updated_at: new Date().toISOString() })
    .eq("id", lead.id)
    .eq("client_id", config.clientId)

  const name = leadName(lead)
  await notify({
    clientId: config.clientId,
    type: "booking_confirmed",
    title: `${config.booking.meetingType} booked with ${name}`,
    body: `Scheduled for ${formatTime(body.payload.startTime, config)}`,
    leadId: lead.id,
  })
}

async function handleBookingCancelled(body: CalWebhookPayload, config: ClientConfig, supabase: ReturnType<typeof createServiceClient>) {
  const attendee = body.payload.attendees?.[0]
  if (!attendee?.email) return

  // Find lead
  const { data: leadRow } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", config.clientId)
    .ilike("email", attendee.email)
    .single()

  if (!leadRow) return
  const lead = leadRow as Lead

  // Match by booking URL/UID first, fall back to most recent scheduled
  const bookingRef = body.payload.meetingUrl || body.payload.uid
  let appointment = null

  if (bookingRef) {
    const { data } = await supabase
      .from("appointments")
      .select("id")
      .eq("client_id", config.clientId)
      .eq("lead_id", lead.id)
      .eq("booking_url", bookingRef)
      .eq("status", "scheduled")
      .maybeSingle()
    appointment = data
  }

  if (!appointment) {
    const { data } = await supabase
      .from("appointments")
      .select("id")
      .eq("client_id", config.clientId)
      .eq("lead_id", lead.id)
      .eq("status", "scheduled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    appointment = data
  }

  if (appointment) {
    await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointment.id)
      .eq("client_id", config.clientId)
  }

  const name = leadName(lead)
  await notify({
    clientId: config.clientId,
    type: "booking_cancelled",
    title: `Booking with ${name} cancelled`,
    leadId: lead.id,
  })
}
