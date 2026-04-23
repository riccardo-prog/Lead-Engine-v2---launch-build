import { getGoogleConnection, getValidGoogleToken } from "@/engine/messaging/gmail"
import { processIntake } from "@/engine/intake/process-lead"
import { notify, leadName } from "@/engine/notifications/notify"
import { handleOutboundReply } from "@/engine/outbound/reply-handler"
import { handoffToLeadEngine } from "@/engine/outbound/handoff"
import { createServiceClient } from "@/lib/supabase-server"
import { getConfig } from "@/lib/config"
import { stripHtml } from "@/lib/html"
import type { Lead } from "@/types/database"

const HANDOFF_STAGES = new Set(["booked", "disqualified"])

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"

type GmailMessage = {
  id: string
  threadId: string
  payload: {
    headers: Array<{ name: string; value: string }>
    mimeType: string
    body?: { data?: string }
    parts?: Array<{
      mimeType: string
      body?: { data?: string }
    }>
  }
  internalDate: string
}

export async function pollGmailForLeads(clientId: string): Promise<{
  scanned: number
  processed: number
  skipped: number
  errors: string[]
}> {
  const config = await getConfig(clientId)
  const connection = await getGoogleConnection(config.clientId)

  if (!connection) {
    return { scanned: 0, processed: 0, skipped: 0, errors: ["no_connection"] }
  }

  const token = await getValidGoogleToken(connection)

  // List unread messages in inbox
  const listRes = await fetch(
    `${GMAIL_API}/messages?q=is:unread+in:inbox&maxResults=25`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!listRes.ok) {
    const errorData = await listRes.json().catch(() => ({}))
    console.error("Gmail API list failed", { status: listRes.status, errorData })
    return { scanned: 0, processed: 0, skipped: 0, errors: [`gmail_list_failed:${listRes.status}`] }
  }

  const listData = await listRes.json()
  const messageRefs: Array<{ id: string }> = listData.messages || []

  if (messageRefs.length === 0) {
    return { scanned: 0, processed: 0, skipped: 0, errors: [] }
  }

  const supabase = createServiceClient()
  const errors: string[] = []
  let processed = 0
  let skipped = 0

  // Check which message IDs we've already processed
  const { data: existingRows } = await supabase
    .from("messages")
    .select("external_id")
    .eq("client_id", config.clientId)
    .in("external_id", messageRefs.map((m) => m.id))

  const existingIds = new Set((existingRows || []).map((r) => r.external_id))

  for (const ref of messageRefs) {
    if (existingIds.has(ref.id)) {
      skipped++
      await markRead(token, ref.id)
      continue
    }

    // Fetch full message
    const msgRes = await fetch(
      `${GMAIL_API}/messages/${ref.id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!msgRes.ok) {
      errors.push("fetch_message_failed")
      continue
    }

    const message = (await msgRes.json()) as GmailMessage

    const from = getHeader(message, "From") || ""
    const subject = getHeader(message, "Subject") || ""
    const senderEmail = extractEmail(from).toLowerCase()
    const body = extractBody(message)

    if (!senderEmail) {
      skipped++
      await markRead(token, ref.id)
      continue
    }

    // Check if this is from an outbound prospect (cold outbound reply)
    const { data: outboundProspect } = await supabase
      .from("outbound_prospects")
      .select("id, campaign_id, status")
      .eq("client_id", config.clientId)
      .eq("email", senderEmail)
      .in("status", ["pending", "sending"])
      .maybeSingle()

    if (outboundProspect) {
      try {
        const replyResult = await handleOutboundReply({
          clientId: config.clientId,
          prospectId: outboundProspect.id,
          campaignId: outboundProspect.campaign_id,
          replyContent: body,
          replySubject: subject,
          gmailMessageId: ref.id,
          gmailThreadId: message.threadId,
        })

        // Hand off to Lead Engine if not opted out
        if (replyResult.sentiment !== "reply_to_stop") {
          await handoffToLeadEngine({
            clientId: config.clientId,
            prospectId: outboundProspect.id,
            campaignId: outboundProspect.campaign_id,
            replyContent: body,
            replySubject: subject,
            gmailThreadId: message.threadId,
            gmailMessageId: ref.id,
            sentiment: replyResult.sentiment as "reply_to_continue" | "reply_to_pause",
          })
        }

        processed++
        await markRead(token, ref.id)
        continue
      } catch (e) {
        errors.push("outbound_reply_processing_failed")
        console.error("Outbound reply processing failed", { id: ref.id, error: e })
        continue
      }
    }

    // Check if from a known lead
    const { data: leadRow } = await supabase
      .from("leads")
      .select("*")
      .eq("client_id", config.clientId)
      .eq("email", senderEmail)
      .maybeSingle()

    if (!leadRow) {
      // Not from a known lead — could be a new inbound email lead
      // For now, skip non-lead emails (personal mail)
      skipped++
      await markRead(token, ref.id)
      continue
    }

    const lead = leadRow as Lead

    // Detect cold email replies: if this lead has outbound messages, the
    // inbound email is a reply to our outreach → source = "cold-email-reply".
    const isReply = !!(getHeader(message, "In-Reply-To") || getHeader(message, "References"))
    let resolvedSource = lead.source_id

    if (isReply) {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id)
        .eq("direction", "outbound")

      if (count && count > 0) {
        resolvedSource = "cold-email-reply"
      }
    }

    try {
      if (HANDOFF_STAGES.has(lead.stage_id) || lead.disqualified) {
        await supabase.from("messages").insert({
          client_id: config.clientId,
          lead_id: lead.id,
          channel: "email",
          direction: "inbound",
          content: body,
          subject: subject || null,
          external_id: ref.id,
        })

        await supabase
          .from("leads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", lead.id)

        await notify({
          clientId: config.clientId,
          type: "action_pending",
          title: `${leadName(lead)} replied — needs your attention`,
          body: body.slice(0, 200),
          leadId: lead.id,
        })
      } else {
        await processIntake({
          config,
          payload: {
            sourceId: resolvedSource,
            email: lead.email || undefined,
            initialMessage: {
              channel: "email",
              content: body,
              subject: subject || undefined,
              externalId: ref.id,
            },
          },
        })
      }

      processed++
      await markRead(token, ref.id)
    } catch (e) {
      errors.push("reply_processing_failed")
      console.error("Gmail reply processing failed", { id: ref.id, leadId: lead.id, error: e })
    }
  }

  return { scanned: messageRefs.length, processed, skipped, errors }
}

function getHeader(message: GmailMessage, name: string): string | undefined {
  return message.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  )?.value
}

function extractEmail(fromHeader: string): string {
  const match = fromHeader.match(/<(.+?)>/)
  return match ? match[1] : fromHeader.trim()
}

function extractBody(message: GmailMessage): string {
  // Try plain text part first
  if (message.payload.parts) {
    const textPart = message.payload.parts.find((p) => p.mimeType === "text/plain")
    if (textPart?.body?.data) {
      return base64UrlDecode(textPart.body.data)
    }
    // Fall back to HTML part
    const htmlPart = message.payload.parts.find((p) => p.mimeType === "text/html")
    if (htmlPart?.body?.data) {
      return stripHtml(base64UrlDecode(htmlPart.body.data))
    }
  }

  // Single-part message
  if (message.payload.body?.data) {
    if (message.payload.mimeType === "text/html") {
      return stripHtml(base64UrlDecode(message.payload.body.data))
    }
    return base64UrlDecode(message.payload.body.data)
  }

  return ""
}

function base64UrlDecode(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(base64, "base64").toString("utf-8")
}


async function markRead(token: string, messageId: string): Promise<void> {
  try {
    await fetch(`${GMAIL_API}/messages/${messageId}/modify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    })
  } catch (e) {
    console.error("Failed to mark Gmail message as read", { messageId, error: e })
  }
}
