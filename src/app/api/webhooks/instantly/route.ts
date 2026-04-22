import { NextRequest, NextResponse } from "next/server"
import { processIntake } from "@/engine/intake/process-lead"
import { getConfig } from "@/lib/config"

const INSTANTLY_SECRET = process.env.INSTANTLY_WEBHOOK_SECRET

/**
 * Instantly webhook — receives reply_received events from cold outbound campaigns.
 * Maps the Instantly payload to our intake format and processes as cold-email-reply.
 *
 * Setup in Instantly:
 * 1. Go to Settings → Webhooks
 * 2. Add webhook URL: https://your-domain/api/webhooks/instantly
 * 3. Event: reply_received
 * 4. Add header: x-instantly-secret = <your INSTANTLY_WEBHOOK_SECRET>
 */
export async function POST(request: NextRequest) {
  // Verify webhook authenticity
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

    // Only process reply events
    if (body.event_type !== "reply_received") {
      return NextResponse.json({ skipped: true, reason: "not_a_reply" })
    }

    const email = body.lead_email
    if (!email) {
      return NextResponse.json({ error: "no_lead_email" }, { status: 400 })
    }

    // Extract name from email if available (Instantly doesn't always send name)
    const replyContent = body.reply_text || body.reply_text_snippet || ""
    const subject = body.reply_subject || ""

    const config = await getConfig("operate-ai")

    const result = await processIntake({
      config,
      payload: {
        sourceId: "cold-email-reply",
        email,
        clientId: "operate-ai",
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
