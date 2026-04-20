import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { sendEmailViaOutlook } from "@/engine/messaging/microsoft-graph"
import { getConfig } from "@/lib/config"
import { requireBearerToken } from "@/lib/api-auth"
import { notify, leadName } from "@/engine/notifications/notify"
import type { Message, Lead } from "@/types/database"

const MAX_SEND_ATTEMPTS = 3

async function handler(request: NextRequest) {
  const auth = requireBearerToken(request)
  if (!auth.ok) return auth.response

  const supabase = createServiceClient()
  const config = await getConfig()

  const now = new Date().toISOString()

  const { data: due, error } = await supabase
    .from("messages")
    .select("*")
    .eq("client_id", config.clientId)
    .eq("sent", false)
    .eq("send_failed", false)
    .not("scheduled_for", "is", null)
    .lte("scheduled_for", now)
    .lt("send_attempts", MAX_SEND_ATTEMPTS)

  if (error) {
    console.error("Flush query failed", error)
    return NextResponse.json({ error: "query_failed" }, { status: 500 })
  }

  let sent = 0
  let failed = 0
  let giveUp = 0

  for (const message of (due as Message[]) || []) {
    const attempts = (message.send_attempts || 0) + 1

    // Fetch lead for all channels — needed for notifications and send context.
    const { data: leadData } = await supabase
      .from("leads")
      .select("*")
      .eq("id", message.lead_id)
      .single()

    const lead = leadData as Lead | null

    try {
      if (message.channel === "email") {
        if (!lead || !lead.email) {
          await markSendFailed(supabase, message.id, attempts, "lead_has_no_email")
          await notify({
            clientId: config.clientId,
            type: "message_failed",
            title: `Couldn't send to ${lead ? leadName(lead) : "unknown lead"}`,
            body: "Lead has no email address.",
            leadId: lead?.id,
          })
          failed++
          giveUp++
          continue
        }

        const result = await sendEmailViaOutlook({
          clientId: config.clientId,
          toEmail: lead.email,
          toName: leadName(lead),
          subject: message.subject || "Following up",
          body: message.content,
        })

        if (!result.success) {
          if (attempts >= MAX_SEND_ATTEMPTS) {
            await markSendFailed(supabase, message.id, attempts, result.error || "send_failed")
            await notify({
              clientId: config.clientId,
              type: "message_failed",
              title: `Couldn't send to ${leadName(lead)}`,
              body: `Gave up after ${MAX_SEND_ATTEMPTS} attempts: ${result.error || "send_failed"}`,
              leadId: lead.id,
            })
            giveUp++
          } else {
            await incrementAttempts(supabase, message.id, attempts)
          }
          failed++
          continue
        }
      }

      await supabase
        .from("messages")
        .update({
          sent: true,
          sent_at: new Date().toISOString(),
          send_attempts: attempts,
        })
        .eq("id", message.id)

      await supabase
        .from("leads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", message.lead_id)

      if (lead) {
        await notify({
          clientId: config.clientId,
          type: "message_sent",
          title: `Email to ${leadName(lead)} sent`,
          leadId: lead.id,
        })
      }

      sent++
    } catch (e) {
      console.error("Flush exception", { messageId: message.id, error: e })
      if (attempts >= MAX_SEND_ATTEMPTS) {
        await markSendFailed(supabase, message.id, attempts, "exception")
        if (lead) {
          await notify({
            clientId: config.clientId,
            type: "message_failed",
            title: `Couldn't send to ${leadName(lead)}`,
            body: `Gave up after ${MAX_SEND_ATTEMPTS} attempts: exception`,
            leadId: lead.id,
          })
        }
        giveUp++
      } else {
        await incrementAttempts(supabase, message.id, attempts)
      }
      failed++
    }
  }

  return NextResponse.json({ processed: (due || []).length, sent, failed, giveUp })
}

async function markSendFailed(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  attempts: number,
  reason: string
) {
  await supabase
    .from("messages")
    .update({
      send_failed: true,
      send_failure_reason: reason,
      send_attempts: attempts,
    })
    .eq("id", messageId)
}

async function incrementAttempts(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  attempts: number
) {
  await supabase
    .from("messages")
    .update({ send_attempts: attempts })
    .eq("id", messageId)
}

export const POST = handler
export const GET = handler