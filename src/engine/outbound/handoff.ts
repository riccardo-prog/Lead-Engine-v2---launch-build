import { createServiceClient } from "@/lib/supabase-server"
import { processIntake } from "@/engine/intake/process-lead"
import { getConfig } from "@/lib/config"
import type { SentimentResult } from "./types"

export async function handoffToLeadEngine({
  clientId,
  prospectId,
  campaignId,
  replyContent,
  replySubject,
  gmailThreadId,
  gmailMessageId,
  sentiment,
}: {
  clientId: string
  prospectId: string
  campaignId: string
  replyContent: string
  replySubject: string | null
  gmailThreadId: string | null
  gmailMessageId: string | null
  sentiment: SentimentResult
}): Promise<{ leadId: string }> {
  const supabase = createServiceClient()
  const config = await getConfig(clientId)

  const { data: prospect } = await supabase
    .from("outbound_prospects")
    .select("*")
    .eq("id", prospectId)
    .single()

  if (!prospect) throw new Error("Prospect not found")

  const { data: campaign } = await supabase
    .from("outbound_campaigns")
    .select("name")
    .eq("id", campaignId)
    .single()

  const result = await processIntake({
    config,
    payload: {
      sourceId: "cold-email-reply",
      email: prospect.email,
      clientId,
      firstName: prospect.first_name || undefined,
      lastName: prospect.last_name || undefined,
      initialMessage: {
        channel: "email",
        content: replyContent,
        subject: replySubject || undefined,
        threadId: gmailThreadId || undefined,
        inReplyTo: gmailMessageId || undefined,
      },
      customFields: {
        outbound_campaign_id: campaignId,
        outbound_campaign_name: campaign?.name || null,
        outbound_icp_score: prospect.icp_score,
      },
    },
  })

  if (!result.leadId) {
    throw new Error(result.error || "Failed to create lead from outbound handoff")
  }

  // Import conversation history
  const { data: sentEmails } = await supabase
    .from("outbound_emails")
    .select("*")
    .eq("prospect_id", prospectId)
    .eq("status", "sent")
    .order("step_order", { ascending: true })

  if (sentEmails) {
    for (const email of sentEmails) {
      await supabase.from("messages").insert({
        client_id: clientId,
        lead_id: result.leadId,
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
  }

  // Set paused_until if reply_to_pause
  if (sentiment === "reply_to_pause") {
    const pausedUntil = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    await supabase
      .from("leads")
      .update({ paused_until: pausedUntil })
      .eq("id", result.leadId)
  }

  // Link back
  await supabase
    .from("outbound_prospects")
    .update({ lead_id: result.leadId, updated_at: new Date().toISOString() })
    .eq("id", prospectId)

  await supabase
    .from("outbound_replies")
    .update({ lead_id: result.leadId, handed_off: true })
    .eq("prospect_id", prospectId)
    .is("lead_id", null)

  return { leadId: result.leadId }
}
