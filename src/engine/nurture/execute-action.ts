import { createServiceClient } from "@/lib/supabase-server"
import { sendMessage } from "@/engine/messaging/send"
import { sendEmailViaGmail } from "@/engine/messaging/gmail"
import { checkAvailability, createBooking } from "@/engine/booking/calcom"
import { getConfig } from "@/lib/config"
import { notify, leadName } from "@/engine/notifications/notify"
import { invalidateSummary } from "@/engine/nurture/summarize-lead"
import type { Lead, AIAction } from "@/types/database"
import type { ChannelType } from "@/config/schema"

export type ExecuteResult = {
  success: boolean
  reason?: string
  scheduled?: boolean
  scheduledFor?: string
}

export async function executeAction(actionId: string, clientId?: string): Promise<ExecuteResult> {
  const supabase = createServiceClient()

  // If clientId not provided, look it up from the action row
  let resolvedClientId = clientId
  if (!resolvedClientId) {
    const { data: row } = await supabase
      .from("ai_actions")
      .select("client_id")
      .eq("id", actionId)
      .single()
    if (!row) return { success: false, reason: "Action not found" }
    resolvedClientId = row.client_id as string
  }

  const config = await getConfig(resolvedClientId)

  const { data: actionRow } = await supabase
    .from("ai_actions")
    .select("*")
    .eq("id", actionId)
    .eq("client_id", config.clientId)
    .single()

  if (!actionRow) return { success: false, reason: "Action not found" }
  const action = actionRow as AIAction

  if (action.status !== "approved") {
    return { success: false, reason: `Action status is ${action.status}, not approved` }
  }

  // Handle send_outbound before lead lookup — outbound prospects may not have a lead
  if (action.action_type === "send_outbound") {
    return handleSendOutbound(action, config, supabase)
  }

  const { data: leadRow } = await supabase
    .from("leads")
    .select("*")
    .eq("id", action.lead_id)
    .eq("client_id", config.clientId)
    .single()

  if (!leadRow) return { success: false, reason: "Lead not found" }
  const lead = leadRow as Lead

  if (action.action_type === "send_message") {
    if (!action.proposed_content) {
      return { success: false, reason: "No proposed content" }
    }

    const channel = inferChannel(lead)
    const subject = extractSubject(action.proposed_content)
    const body = stripSubject(action.proposed_content)

    const result = await sendMessage({
      lead,
      channel,
      content: body,
      subject,
      config,
      aiGenerated: true,
      aiReasoning: action.reasoning,
    })

    if (!result.success) {
      return { success: false, reason: result.reason }
    }

    await supabase
      .from("ai_actions")
      .update({
        status: "executed",
        executed_at: new Date().toISOString(),
      })
      .eq("id", actionId)
      .eq("client_id", config.clientId)

    const channelLabel = friendlyChannel(channel)

    if (result.scheduled) {
      await notify({
        clientId: config.clientId,
        type: "message_sent",
        title: `${channelLabel} to ${leadName(lead)} scheduled`,
        body: result.scheduledFor
          ? `Will be sent at ${new Date(result.scheduledFor).toLocaleString()}`
          : "Scheduled for the next allowed window",
        leadId: lead.id,
      })
    } else {
      await notify({
        clientId: config.clientId,
        type: "message_sent",
        title: `${channelLabel} to ${leadName(lead)} sent`,
        leadId: lead.id,
      })
    }

    return {
      success: true,
      scheduled: result.scheduled,
      scheduledFor: result.scheduledFor,
    }
  }

  if (action.action_type === "book_appointment") {
    return handleBookAppointment(action, lead, config, supabase)
  }

  if (action.action_type === "advance_stage") {
    if (!action.new_stage_id) {
      return { success: false, reason: "No target stage specified" }
    }
    const validStage = config.funnelStages.find((s) => s.id === action.new_stage_id)
    if (!validStage) {
      return { success: false, reason: `Invalid stage: ${action.new_stage_id}` }
    }
    await supabase
      .from("leads")
      .update({
        stage_id: action.new_stage_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .eq("client_id", config.clientId)
  }

  if (action.action_type === "disqualify") {
    await supabase
      .from("leads")
      .update({
        disqualified: true,
        disqualify_reason: action.reasoning,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .eq("client_id", config.clientId)
  }

  await supabase
    .from("ai_actions")
    .update({
      status: "executed",
      executed_at: new Date().toISOString(),
    })
    .eq("id", actionId)
    .eq("client_id", config.clientId)

  // Invalidate cached summary so it regenerates on next view
  invalidateSummary(lead.id).catch((err) => {
    console.error("Failed to invalidate summary", { leadId: lead.id, error: err })
  })

  return { success: true }
}

function inferChannel(lead: Lead): ChannelType {
  // Prefer the original DM channel if the lead came from a DM source
  if (lead.meta_igsid && lead.source_id === "instagram-dm") return "instagram_dm"
  if (lead.meta_psid && lead.source_id === "facebook-dm") return "facebook_dm"
  if (lead.email) return "email"
  if (lead.phone) return "sms"
  return "email"
}

function friendlyChannel(channel: ChannelType): string {
  switch (channel) {
    case "email": return "Email"
    case "sms": return "SMS"
    case "facebook_dm": return "Messenger message"
    case "instagram_dm": return "Instagram DM"
    case "whatsapp": return "WhatsApp message"
    default: return "Message"
  }
}

function extractSubject(content: string): string | undefined {
  const match = content.match(/^Subject:\s*(.+)$/im)
  return match?.[1]?.trim()
}

function stripSubject(content: string): string {
  return content.replace(/^Subject:\s*.+\n+/im, "").trim()
}

function formatBookingTime(iso: string, config: Awaited<ReturnType<typeof getConfig>>): string {
  const tz = config.messagingRules[0]?.timezone || "America/Toronto"
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  })
}

type BookingMeta = {
  bookingMode: "specific_time" | "send_link"
  requestedTime?: string
  message?: string
  subject?: string
}

function parseBookingMeta(action: AIAction): BookingMeta | null {
  if (!action.proposed_content) return null
  try {
    return JSON.parse(action.proposed_content) as BookingMeta
  } catch {
    // Fallback: treat proposed_content as a plain message with send_link mode
    return {
      bookingMode: "send_link",
      message: action.proposed_content,
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleBookAppointment(action: AIAction, lead: Lead, config: Awaited<ReturnType<typeof getConfig>>, supabase: any): Promise<ExecuteResult> {
  const meta = parseBookingMeta(action)
  if (!meta) {
    return { success: false, reason: "No booking metadata in proposed_content" }
  }

  const calApiKey = process.env.CAL_API_KEY
  const calEventTypeId = process.env.CAL_EVENT_TYPE_ID
  if (!calApiKey || !calEventTypeId) {
    return { success: false, reason: "Cal.com not configured (missing CAL_API_KEY or CAL_EVENT_TYPE_ID)" }
  }

  const eventTypeId = parseInt(calEventTypeId, 10)
  const channel = inferChannel(lead)
  const name = leadName(lead)

  if (meta.bookingMode === "specific_time" && meta.requestedTime) {
    // Check availability, then book or fall back to link
    const availability = await checkAvailability({
      startTime: meta.requestedTime,
      eventTypeId,
      apiKey: calApiKey,
    })

    if (availability.available) {
      if (!lead.email) {
        return { success: false, reason: "Lead has no email — required for Cal.com booking" }
      }

      const booking = await createBooking({
        name,
        email: lead.email,
        timeZone: config.messagingRules[0]?.timezone || "America/Toronto",
        startTime: meta.requestedTime,
        eventTypeId,
        apiKey: calApiKey,
      })

      if (!booking.success) {
        return { success: false, reason: booking.error || "Cal.com booking failed" }
      }

      // Send confirmation message to lead
      const confirmationMsg = meta.message
        || `Great news! Your ${config.booking.meetingType} is confirmed for ${formatBookingTime(meta.requestedTime, config)}. Looking forward to connecting!`

      await sendMessage({
        lead,
        channel,
        content: confirmationMsg,
        subject: meta.subject,
        config,
        aiGenerated: true,
        aiReasoning: action.reasoning,
      })

      // Create appointment row
      const duration = booking.endTime && booking.startTime
        ? Math.round((new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / 60_000)
        : 30

      await supabase.from("appointments").insert({
        client_id: config.clientId,
        lead_id: lead.id,
        scheduled_at: booking.startTime || meta.requestedTime,
        duration_minutes: duration,
        meeting_type: config.booking.meetingType,
        status: "scheduled",
        booking_url: booking.meetingUrl || null,
      })

      // Advance to booked
      await supabase
        .from("leads")
        .update({ stage_id: "booked", updated_at: new Date().toISOString() })
        .eq("id", lead.id)
        .eq("client_id", config.clientId)

      // Mark action executed
      await supabase
        .from("ai_actions")
        .update({ status: "executed", executed_at: new Date().toISOString() })
        .eq("id", action.id)
        .eq("client_id", config.clientId)

      await notify({
        clientId: config.clientId,
        type: "booking_confirmed",
        title: `${config.booking.meetingType} booked with ${name}`,
        body: `Scheduled for ${formatBookingTime(meta.requestedTime, config)}`,
        leadId: lead.id,
      })

      return { success: true }
    }

    // Slot unavailable — fall back to sending booking link
    console.log("Requested time unavailable, falling back to booking link", {
      leadId: lead.id,
      requestedTime: meta.requestedTime,
    })
  }

  // send_link mode (or fallback from unavailable specific_time)
  const messageBody = (meta.message || `I'd love to set up a ${config.booking.meetingType}! Here's a link to pick a time that works for you: {{booking_url}}`)
    .replace(/\{\{booking_url\}\}/g, config.booking.url)

  const sendResult = await sendMessage({
    lead,
    channel,
    content: messageBody,
    subject: meta.subject,
    config,
    aiGenerated: true,
    aiReasoning: action.reasoning,
  })

  if (!sendResult.success) {
    return { success: false, reason: sendResult.reason }
  }

  // Advance to qualified (awaiting self-book)
  await supabase
    .from("leads")
    .update({ stage_id: "qualified", updated_at: new Date().toISOString() })
    .eq("id", lead.id)
    .eq("client_id", config.clientId)

  // Mark action executed
  await supabase
    .from("ai_actions")
    .update({ status: "executed", executed_at: new Date().toISOString() })
    .eq("id", action.id)
    .eq("client_id", config.clientId)

  const channelLabel = friendlyChannel(channel)
  await notify({
    clientId: config.clientId,
    type: "message_sent",
    title: `Booking link sent to ${name} via ${channelLabel}`,
    leadId: lead.id,
  })

  return {
    success: true,
    scheduled: sendResult.scheduled,
    scheduledFor: sendResult.scheduledFor,
  }
}

type OutboundEmailMeta = {
  emailId: string
  prospectId: string
  campaignId: string
  subject: string
  body: string
  toEmail: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSendOutbound(action: AIAction, config: Awaited<ReturnType<typeof getConfig>>, supabase: any): Promise<ExecuteResult> {
  if (!action.proposed_content) {
    return { success: false, reason: "No outbound email data in proposed_content" }
  }

  let meta: OutboundEmailMeta
  try {
    meta = JSON.parse(action.proposed_content) as OutboundEmailMeta
  } catch {
    return { success: false, reason: "Invalid outbound email data" }
  }

  // Allow content override (user edited in inbox)
  const subject = meta.subject
  const body = meta.body

  // Look up prospect for threading info
  const { data: prospect } = await supabase
    .from("outbound_prospects")
    .select("first_name, last_name, email")
    .eq("id", meta.prospectId)
    .maybeSingle()

  // Check for threading (follow-up emails)
  let threadId: string | undefined
  let inReplyTo: string | undefined

  const { data: step0 } = await supabase
    .from("outbound_emails")
    .select("gmail_thread_id, gmail_message_id")
    .eq("prospect_id", meta.prospectId)
    .eq("step_order", 0)
    .eq("status", "sent")
    .maybeSingle()

  if (step0) {
    threadId = step0.gmail_thread_id || undefined
    inReplyTo = step0.gmail_message_id || undefined
  }

  const toName = prospect
    ? [prospect.first_name, prospect.last_name].filter(Boolean).join(" ") || undefined
    : undefined

  const result = await sendEmailViaGmail({
    clientId: config.clientId,
    toEmail: meta.toEmail,
    toName,
    subject,
    body,
    threadId,
    inReplyTo,
  })

  if (!result.success) {
    // Mark email as failed
    await supabase
      .from("outbound_emails")
      .update({ status: "failed", failure_reason: result.error || "Send failed" })
      .eq("id", meta.emailId)

    return { success: false, reason: result.error || "Gmail send failed" }
  }

  // Update outbound email record
  await supabase
    .from("outbound_emails")
    .update({
      status: "sent",
      subject: meta.subject,
      body: meta.body,
      sent_at: new Date().toISOString(),
      gmail_message_id: result.messageId || null,
      gmail_thread_id: result.threadId || null,
    })
    .eq("id", meta.emailId)

  // Update prospect status
  await supabase
    .from("outbound_prospects")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", meta.prospectId)
    .eq("status", "pending")

  // Update sending account daily count
  const { data: campaign } = await supabase
    .from("outbound_campaigns")
    .select("sending_account_id")
    .eq("id", meta.campaignId)
    .maybeSingle()

  if (campaign?.sending_account_id) {
    const { data: account } = await supabase
      .from("outbound_sending_accounts")
      .select("sends_today")
      .eq("id", campaign.sending_account_id)
      .maybeSingle()

    if (account) {
      await supabase
        .from("outbound_sending_accounts")
        .update({ sends_today: (account.sends_today || 0) + 1 })
        .eq("id", campaign.sending_account_id)
    }
  }

  // Mark action executed
  await supabase
    .from("ai_actions")
    .update({ status: "executed", executed_at: new Date().toISOString() })
    .eq("id", action.id)
    .eq("client_id", config.clientId)

  await notify({
    clientId: config.clientId,
    type: "message_sent",
    title: `Outbound email sent to ${toName || meta.toEmail}`,
    body: subject,
  })

  return { success: true }
}