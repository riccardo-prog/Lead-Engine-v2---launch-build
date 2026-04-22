import { createServiceClient } from "@/lib/supabase-server"
import { askHaikuJSON } from "@/engine/ai/claude"
import { addToSuppressionList } from "./suppression"
import type { SentimentClassification, OutboundProspect, OutboundCampaign } from "./types"

export async function handleOutboundReply({
  clientId,
  prospectId,
  campaignId,
  replyContent,
  replySubject,
  gmailMessageId,
  gmailThreadId,
}: {
  clientId: string
  prospectId: string
  campaignId: string
  replyContent: string
  replySubject: string | null
  gmailMessageId: string | null
  gmailThreadId: string | null
}): Promise<{ sentiment: string; leadId?: string }> {
  const supabase = createServiceClient()

  const { data: prospect } = await supabase
    .from("outbound_prospects")
    .select("*")
    .eq("id", prospectId)
    .single()

  const { data: campaign } = await supabase
    .from("outbound_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single()

  if (!prospect || !campaign) {
    throw new Error("Prospect or campaign not found")
  }

  const p = prospect as OutboundProspect
  const c = campaign as OutboundCampaign

  const { data: repliedToEmail } = await supabase
    .from("outbound_emails")
    .select("id")
    .eq("prospect_id", prospectId)
    .eq("gmail_thread_id", gmailThreadId)
    .eq("status", "sent")
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const classification = await classifySentiment({
    replyContent,
    businessName: c.name,
    campaignDescription: c.icp_criteria ? JSON.stringify(c.icp_criteria) : "cold outbound outreach",
  })

  await supabase.from("outbound_replies").insert({
    client_id: clientId,
    prospect_id: prospectId,
    campaign_id: campaignId,
    email_id: repliedToEmail?.id || null,
    gmail_message_id: gmailMessageId,
    gmail_thread_id: gmailThreadId,
    content: replyContent,
    subject: replySubject,
    sentiment: classification.sentiment,
  })

  // Stop remaining sequence emails
  await supabase
    .from("outbound_emails")
    .delete()
    .eq("prospect_id", prospectId)
    .eq("status", "pending")

  if (classification.sentiment === "reply_to_stop") {
    await supabase
      .from("outbound_prospects")
      .update({ status: "opted_out", updated_at: new Date().toISOString() })
      .eq("id", prospectId)

    await addToSuppressionList({
      clientId,
      email: p.email,
      reason: "opted_out",
      source: "outbound_reply",
    })

    return { sentiment: classification.sentiment }
  }

  await supabase
    .from("outbound_prospects")
    .update({
      status: classification.sentiment === "reply_to_pause" ? "paused" : "replied",
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospectId)

  return { sentiment: classification.sentiment }
}

async function classifySentiment({
  replyContent,
  businessName,
  campaignDescription,
}: {
  replyContent: string
  businessName: string
  campaignDescription: string
}): Promise<SentimentClassification> {
  const system = `Classify this email reply into exactly one category.

CONTEXT: This is a reply to a cold outbound email from ${businessName}.
The original email was about ${campaignDescription}.

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
}`

  const prompt = `REPLY:\n${replyContent}`

  return askHaikuJSON<SentimentClassification>({ system, prompt })
}
