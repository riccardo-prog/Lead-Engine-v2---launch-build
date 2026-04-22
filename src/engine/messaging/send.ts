import { createServiceClient } from "@/lib/supabase-server"
import { checkCompliance } from "@/engine/compliance/compliance"
import { isSuppressed } from "@/engine/outbound/suppression"
import { sendEmailViaOutlook, getMicrosoftConnection } from "@/engine/messaging/microsoft-graph"
import { sendEmailViaGmail, getGoogleConnection } from "@/engine/messaging/gmail"
import { sendFacebookDM, sendInstagramDM, getMessagingWindowStatus } from "@/engine/messaging/meta-graph"
import { getNextAllowedTime } from "@/lib/timezone"
import type { Lead } from "@/types/database"
import type { ClientConfig, ChannelType } from "@/config/schema"

export type SendResult = {
  success: boolean
  messageId?: string
  scheduled?: boolean
  scheduledFor?: string
  reason?: string
}

export async function sendMessage({
  lead,
  channel,
  content,
  subject,
  config,
  aiGenerated,
  aiReasoning,
}: {
  lead: Lead
  channel: ChannelType
  content: string
  subject?: string
  config: ClientConfig
  aiGenerated: boolean
  aiReasoning?: string
}): Promise<SendResult> {
  // Cross-system suppression check
  if (lead.email) {
    const suppressed = await isSuppressed(config.clientId, lead.email)
    if (suppressed) {
      return { success: false, reason: "Email is on the suppression list" }
    }
  }

  const compliance = await checkCompliance({ lead, channel, config })

  if (!compliance.allowed) {
    const isHoursBlock = compliance.reason?.startsWith("Outside allowed hours")

    if (isHoursBlock) {
      const rule = config.messagingRules.find((r) => r.channel === channel)
      if (rule) {
        const scheduledFor = getNextAllowedTime(rule.allowedHoursStart, rule.timezone)
        return scheduleMessage({
          lead, channel, content, subject, config,
          aiGenerated, aiReasoning, scheduledFor,
          scheduledReason: compliance.reason || "Outside allowed hours",
        })
      }
    }

    return { success: false, reason: compliance.reason }
  }

  return dispatchMessage({ lead, channel, content, subject, config, aiGenerated, aiReasoning })
}

async function dispatchMessage({
  lead, channel, content, subject, config, aiGenerated, aiReasoning,
}: {
  lead: Lead
  channel: ChannelType
  content: string
  subject?: string
  config: ClientConfig
  aiGenerated: boolean
  aiReasoning?: string
}): Promise<SendResult> {
  const supabase = createServiceClient()

  if (channel === "email") {
    if (!lead.email) {
      return { success: false, reason: "Lead has no email address" }
    }

    // Try Outlook first, then Gmail
    const msConnection = await getMicrosoftConnection(config.clientId)
    const googleConn = !msConnection ? await getGoogleConnection(config.clientId) : null

    if (!msConnection && !googleConn) {
      return {
        success: false,
        reason: "No email account connected. Go to Settings and connect Outlook or Gmail.",
      }
    }

    const toName = [lead.first_name, lead.last_name].filter(Boolean).join(" ")

    const result = msConnection
      ? await sendEmailViaOutlook({
          clientId: config.clientId,
          toEmail: lead.email,
          toName,
          subject: subject || "Following up",
          body: content,
        })
      : await sendEmailViaGmail({
          clientId: config.clientId,
          toEmail: lead.email,
          toName,
          subject: subject || "Following up",
          body: content,
        })

    if (!result.success) {
      return { success: false, reason: result.error || "Failed to send email" }
    }
  } else if (channel === "facebook_dm" || channel === "instagram_dm") {
    const recipientId = channel === "facebook_dm" ? lead.meta_psid : lead.meta_igsid
    if (!recipientId) {
      if (lead.email) {
        return { success: false, reason: `Lead has no ${channel === "facebook_dm" ? "Messenger PSID" : "Instagram IGSID"} — use email instead` }
      }
      return { success: false, reason: `Lead has no ${channel === "facebook_dm" ? "Messenger PSID" : "Instagram IGSID"} and no email fallback` }
    }

    // Check 24h messaging window
    const window = await getMessagingWindowStatus({
      leadId: lead.id,
      channel,
      clientId: config.clientId,
    })

    if (!window.open) {
      if (lead.email) {
        return { success: false, reason: "outside_messaging_window" }
      }
      return { success: false, reason: "outside_messaging_window_no_fallback" }
    }

    const result = channel === "facebook_dm"
      ? await sendFacebookDM({ clientId: config.clientId, recipientPsid: recipientId, message: content })
      : await sendInstagramDM({ clientId: config.clientId, recipientIgsid: recipientId, message: content })

    if (!result.success) {
      return { success: false, reason: result.error || `Failed to send ${channel}` }
    }
  } else {
    return { success: false, reason: `Channel ${channel} is not supported yet` }
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      client_id: config.clientId,
      lead_id: lead.id,
      channel,
      direction: "outbound",
      content,
      subject: subject || null,
      ai_generated: aiGenerated,
      ai_reasoning: aiReasoning || null,
      approved: true,
      approved_at: new Date().toISOString(),
      sent: true,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !data) {
    return { success: false, reason: error?.message || "Failed to log message" }
  }

  await supabase
    .from("leads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", lead.id)

  return { success: true, messageId: data.id }
}

async function scheduleMessage({
  lead, channel, content, subject, config, aiGenerated, aiReasoning,
  scheduledFor, scheduledReason,
}: {
  lead: Lead
  channel: ChannelType
  content: string
  subject?: string
  config: ClientConfig
  aiGenerated: boolean
  aiReasoning?: string
  scheduledFor: string
  scheduledReason: string
}): Promise<SendResult> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from("messages")
    .insert({
      client_id: config.clientId,
      lead_id: lead.id,
      channel,
      direction: "outbound",
      content,
      subject: subject || null,
      ai_generated: aiGenerated,
      ai_reasoning: aiReasoning || null,
      approved: true,
      approved_at: new Date().toISOString(),
      sent: false,
      scheduled_for: scheduledFor,
      scheduled_reason: scheduledReason,
    })
    .select()
    .single()

  if (error || !data) {
    return { success: false, reason: error?.message || "Failed to schedule message" }
  }

  return {
    success: true,
    messageId: data.id,
    scheduled: true,
    scheduledFor,
  }
}