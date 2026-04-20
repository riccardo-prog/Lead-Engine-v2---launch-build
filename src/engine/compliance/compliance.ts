import type { Lead } from "@/types/database"
import type { ClientConfig, ChannelType } from "@/config/schema"
import { createServiceClient } from "@/lib/supabase-server"
import { getHourInTimezone, startOfDayInTimezone } from "@/lib/timezone"

export type ComplianceCheck = {
  allowed: boolean
  reason?: string
}

export async function checkCompliance({
  lead,
  channel,
  config,
}: {
  lead: Lead
  channel: ChannelType
  config: ClientConfig
}): Promise<ComplianceCheck> {
  if (lead.opted_out) {
    return { allowed: false, reason: "Lead has opted out of all communication" }
  }

  if (!config.channels.includes(channel)) {
    return { allowed: false, reason: `Channel ${channel} is not enabled for this client` }
  }

  const rule = config.messagingRules.find((r) => r.channel === channel)
  if (!rule) {
    return { allowed: false, reason: `No messaging rule defined for ${channel}` }
  }

  if (rule.requireOptIn) {
    if (channel === "sms" && !lead.opted_in_sms) {
      return { allowed: false, reason: "SMS requires opt-in, lead has not opted in" }
    }
    if (channel === "email" && !lead.opted_in_email) {
      return { allowed: false, reason: "Email requires opt-in, lead has not opted in" }
    }
  }

  const now = new Date()
  const clientHour = getHourInTimezone(now, rule.timezone)
  if (clientHour < rule.allowedHoursStart || clientHour >= rule.allowedHoursEnd) {
    return {
      allowed: false,
      reason: `Outside allowed hours (${rule.allowedHoursStart}:00-${rule.allowedHoursEnd}:00 ${rule.timezone}). Current: ${clientHour}:00`,
    }
  }

  // Enforce maxPerDay — count outbound messages sent to THIS lead on THIS channel
  // since the start of the current day in the rule's timezone.
  if (rule.maxPerDay > 0) {
    const dayStart = startOfDayInTimezone(now, rule.timezone).toISOString()
    const supabase = createServiceClient()
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("client_id", config.clientId)
      .eq("lead_id", lead.id)
      .eq("channel", channel)
      .eq("direction", "outbound")
      .eq("sent", true)
      .gte("sent_at", dayStart)

    if ((count || 0) >= rule.maxPerDay) {
      return {
        allowed: false,
        reason: `Daily cap of ${rule.maxPerDay} ${channel} message(s) reached for this lead`,
      }
    }
  }

  const jurisdictionCheck = checkJurisdiction(lead, channel, config)
  if (!jurisdictionCheck.allowed) return jurisdictionCheck

  return { allowed: true }
}

function checkJurisdiction(
  lead: Lead,
  channel: ChannelType,
  config: ClientConfig
): ComplianceCheck {
  if (config.jurisdiction === "CASL") {
    if (channel === "sms" && !lead.opted_in_sms) {
      return { allowed: false, reason: "CASL requires express consent for SMS" }
    }
  }

  if (config.jurisdiction === "TCPA") {
    if (channel === "sms" && !lead.opted_in_sms) {
      return { allowed: false, reason: "TCPA requires prior express written consent for SMS" }
    }
  }

  if (config.jurisdiction === "GDPR") {
    if (channel === "email" && !lead.opted_in_email) {
      return { allowed: false, reason: "GDPR requires opt-in for marketing email" }
    }
    if (channel === "sms" && !lead.opted_in_sms) {
      return { allowed: false, reason: "GDPR requires opt-in for SMS" }
    }
  }

  return { allowed: true }
}

export function addUnsubscribeFooter(
  content: string,
  channel: ChannelType,
  config: ClientConfig,
  unsubscribeUrl: string
): string {
  if (channel === "email") {
    return `${content}\n\n---\n${config.businessName}\nTo unsubscribe, visit: ${unsubscribeUrl}`
  }
  if (channel === "sms") {
    return `${content}\n\nReply STOP to opt out.`
  }
  return content
}