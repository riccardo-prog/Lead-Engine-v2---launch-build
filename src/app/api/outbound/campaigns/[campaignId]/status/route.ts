import { NextRequest, NextResponse } from "next/server"
import { getClientIdFromSession } from "@/lib/config"
import { requireSession } from "@/lib/api-auth"
import { getCampaign, updateCampaignStatus } from "@/engine/outbound/campaigns"
import type { CampaignStatus } from "@/engine/outbound/types"

const VALID_TRANSITIONS: Record<string, CampaignStatus[]> = {
  draft: ["active"],
  active: ["paused"],
  paused: ["active"],
  completed: [],
}

export async function PATCH(
  request: NextRequest,
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

    const { status } = await request.json()
    if (typeof status !== "string" || !["draft", "active", "paused", "completed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }
    const allowed = VALID_TRANSITIONS[campaign.status] || []
    if (!allowed.includes(status as CampaignStatus)) {
      return NextResponse.json({ error: `Cannot transition from ${campaign.status} to ${status}` }, { status: 400 })
    }

    await updateCampaignStatus(campaignId, status as CampaignStatus)
    return NextResponse.json({ status })
  } catch (e) {
    console.error("Campaign status update error", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
