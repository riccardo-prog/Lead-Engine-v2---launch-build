import { NextRequest, NextResponse } from "next/server"
import { processIntake } from "@/engine/intake/process-lead"
import { getConfig } from "@/lib/config"
import { createServiceClient } from "@/lib/supabase-server"

const INSTANTLY_SECRET = process.env.INSTANTLY_WEBHOOK_SECRET

/**
 * Instantly webhook — receives reply_received events from cold outbound campaigns.
 * Maps the Instantly payload to our intake format and processes as cold-email-reply.
 *
 * Resolves tenant by looking up which client owns the prospect email.
 */
export async function POST(request: NextRequest) {
  if (INSTANTLY_SECRET) {
    const secret = request.headers.get("x-instantly-secret")
    if (secret !== INSTANTLY_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  } else {
    console.warn("INSTANTLY_WEBHOOK_SECRET not set — accepting all requests")
  }

  try {
    const body = await request.json()

    if (body.event_type !== "reply_received") {
      return NextResponse.json({ skipped: true, reason: "not_a_reply" })
    }

    const email = body.lead_email
    if (!email) {
      return NextResponse.json({ error: "no_lead_email" }, { status: 400 })
    }

    // Resolve client by finding which tenant has this prospect
    const supabase = createServiceClient()
    const { data: prospect } = await supabase
      .from("outbound_prospects")
      .select("client_id")
      .eq("email", email.toLowerCase())
      .limit(1)
      .maybeSingle()

    const clientId = prospect?.client_id
    if (!clientId) {
      return NextResponse.json({ error: "no_matching_prospect" }, { status: 404 })
    }

    const config = await getConfig(clientId)

    const replyContent = body.reply_text || body.reply_text_snippet || ""
    const subject = body.reply_subject || ""

    const result = await processIntake({
      config,
      payload: {
        sourceId: "cold-email-reply",
        email,
        clientId,
        initialMessage: {
          channel: "email",
          content: replyContent,
          subject: subject || undefined,
        },
        customFields: {
          instantly_campaign_id: body.campaign_id || null,
          instantly_campaign_name: body.campaign_name || null,
        },
      },
    })

    return NextResponse.json({
      leadId: result.leadId,
      isNew: result.isNew,
      decisionQueued: result.decisionQueued,
    })
  } catch (e) {
    console.error("Instantly webhook error", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
