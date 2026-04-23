import { NextRequest, NextResponse } from "next/server"
import { getClientIdFromSession } from "@/lib/config"
import { requireSession } from "@/lib/api-auth"
import { createServiceClient } from "@/lib/supabase-server"
import { getCampaign } from "@/engine/outbound/campaigns"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  try {
    const { campaignId } = await params
    const clientId = await getClientIdFromSession()

    const campaign = await getCampaign(campaignId)
    if (!campaign || campaign.client_id !== clientId) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const supabase = createServiceClient()

    // Reset awaiting_approval emails: clear content so cron regenerates them
    const { data: reset } = await supabase
      .from("outbound_emails")
      .update({
        subject: "",
        body: "",
        word_count: null,
        ai_reasoning: null,
        status: "pending",
      })
      .eq("campaign_id", campaignId)
      .eq("client_id", clientId)
      .in("status", ["awaiting_approval", "pending", "sending"])
      .select("id")

    // Also delete the old ai_actions for these emails
    if (reset && reset.length > 0) {
      await supabase
        .from("ai_actions")
        .delete()
        .eq("client_id", clientId)
        .eq("action_type", "send_outbound")
        .eq("status", "pending")
    }

    return NextResponse.json({ reset: reset?.length || 0 })
  } catch (e) {
    console.error("Reset emails error", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
