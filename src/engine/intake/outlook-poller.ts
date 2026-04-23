import { getMicrosoftConnection, getValidToken } from "@/engine/messaging/microsoft-graph"
import { parseRealtorEmail, isRealtorLeadEmail } from "@/engine/intake/realtor-parser"
import { processIntake } from "@/engine/intake/process-lead"
import { notify, leadName } from "@/engine/notifications/notify"
import { createServiceClient } from "@/lib/supabase-server"
import { getConfig } from "@/lib/config"
import { stripHtml } from "@/lib/html"
import type { Lead } from "@/types/database"

/** Stages where the AI should no longer auto-respond — hand off to the human operator. */
const HANDOFF_STAGES = new Set(["booked", "disqualified"])

type GraphMessage = {
  id: string
  subject: string
  bodyPreview: string
  body: {
    contentType: string
    content: string
  }
  from: {
    emailAddress: {
      name: string
      address: string
    }
  }
  receivedDateTime: string
  isRead: boolean
}

export async function pollOutlookForLeads(clientId: string): Promise<{
  scanned: number
  processed: number
  skipped: number
  errors: string[]
}> {
  const config = await getConfig(clientId)
  const connection = await getMicrosoftConnection(config.clientId)

  if (!connection) {
    return { scanned: 0, processed: 0, skipped: 0, errors: ["no_connection"] }
  }

  const token = await getValidToken(connection)

  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$top=25&$filter=isRead eq false&$select=id,subject,bodyPreview,body,from,receivedDateTime,isRead&$orderby=receivedDateTime desc",
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    const errorCode = (errorData as Record<string, unknown>)?.error
    console.error("Graph API inbox fetch failed", {
      status: res.status,
      errorCode,
      errorData,
      hint: res.status === 400
        ? "The $filter + $orderby combination may not be supported on this mailbox type. Try removing $orderby or $filter."
        : undefined,
    })
    return { scanned: 0, processed: 0, skipped: 0, errors: [`graph_fetch_failed:${res.status}`] }
  }

  const data = await res.json()
  const messages: GraphMessage[] = data.value || []

  if (messages.length === 0) {
    return { scanned: 0, processed: 0, skipped: 0, errors: [] }
  }

  const supabase = createServiceClient()
  const errors: string[] = []
  let processed = 0
  let skipped = 0

  const { data: existingRows } = await supabase
    .from("messages")
    .select("external_id")
    .eq("client_id", config.clientId)
    .in("external_id", messages.map((m) => m.id))

  const existingIds = new Set((existingRows || []).map((r) => r.external_id))

  for (const message of messages) {
    const from = message.from?.emailAddress?.address || ""
    const subject = message.subject || ""

    // Already processed this email — skip.
    if (existingIds.has(message.id)) {
      skipped++
      await markRead(token, message.id)
      continue
    }

    // --- Path 1: Realtor.ca lead notification ---
    if (isRealtorLeadEmail({ from, subject })) {
      const rawBody = message.body?.content || message.bodyPreview || ""
      const cleanBody = message.body?.contentType === "html"
        ? stripHtml(rawBody)
        : rawBody

      const parsed = parseRealtorEmail({ subject, body: cleanBody })

      if (!parsed) {
        skipped++
        errors.push("parse_failed")
        console.error("Realtor parse failed", { id: message.id, subject })
        continue
      }

      if (!parsed.email && !parsed.phone) {
        skipped++
        errors.push("no_contact_info")
        console.error("No contact info in parsed lead", { id: message.id })
        continue
      }

      try {
        await processIntake({
          config,
          payload: {
            sourceId: "realtor-email",
            firstName: parsed.firstName || undefined,
            lastName: parsed.lastName || undefined,
            email: parsed.email || undefined,
            phone: parsed.phone || undefined,
            customFields: {
              property_address: parsed.propertyAddress,
              listing_number: parsed.listingNumber,
              realtor_raw_message: parsed.rawMessage,
            },
            initialMessage: {
              channel: "email",
              content: parsed.rawMessage || `Inquired about ${parsed.propertyAddress || "a property"}`,
              subject,
              externalId: message.id,
            },
          },
        })
        processed++
        await markRead(token, message.id)
      } catch (e) {
        errors.push("intake_failed")
        console.error("Intake failed", { id: message.id, error: e })
      }
      continue
    }

    // --- Path 2: Reply from a known lead ---
    const senderEmail = from.toLowerCase()
    if (!senderEmail) {
      skipped++
      continue
    }

    const { data: leadRow } = await supabase
      .from("leads")
      .select("*")
      .eq("client_id", config.clientId)
      .eq("email", senderEmail)
      .maybeSingle()

    if (!leadRow) {
      // Not from a known lead — leave it alone, it's personal mail.
      skipped++
      continue
    }

    const lead = leadRow as Lead
    const rawBody = message.body?.content || message.bodyPreview || ""
    const cleanBody = message.body?.contentType === "html"
      ? stripHtml(rawBody)
      : rawBody

    try {
      if (HANDOFF_STAGES.has(lead.stage_id) || lead.disqualified) {
        // Store the message but don't trigger AI — notify the operator.
        await supabase.from("messages").insert({
          client_id: config.clientId,
          lead_id: lead.id,
          channel: "email",
          direction: "inbound",
          content: cleanBody,
          subject: subject || null,
          external_id: message.id,
        })

        await supabase
          .from("leads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", lead.id)

        await notify({
          clientId: config.clientId,
          type: "action_pending",
          title: `${leadName(lead)} replied — needs your attention`,
          body: cleanBody.slice(0, 200),
          leadId: lead.id,
        })
      } else {
        // Active funnel lead — route through processIntake for AI decision.
        await processIntake({
          config,
          payload: {
            sourceId: lead.source_id,
            email: lead.email || undefined,
            initialMessage: {
              channel: "email",
              content: cleanBody,
              subject: subject || undefined,
              externalId: message.id,
            },
          },
        })
      }

      processed++
      await markRead(token, message.id)
    } catch (e) {
      errors.push("reply_processing_failed")
      console.error("Reply processing failed", { id: message.id, leadId: lead.id, error: e })
    }
  }

  return { scanned: messages.length, processed, skipped, errors }
}

async function markRead(token: string, messageId: string): Promise<void> {
  try {
    await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isRead: true }),
    })
  } catch (e) {
    console.error("Failed to mark message as read", { messageId, error: e })
  }
}

