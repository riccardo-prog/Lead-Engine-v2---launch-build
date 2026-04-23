import { NextRequest, NextResponse } from "next/server"
import { getClientIdFromSession, getConfig } from "@/lib/config"
import { rescoreProspects } from "@/engine/outbound/prospects"
import { getCampaign } from "@/engine/outbound/campaigns"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await params
    const clientId = await getClientIdFromSession()
    const config = await getConfig(clientId)

    const campaign = await getCampaign(campaignId)
    if (!campaign || campaign.client_id !== clientId) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const result = await rescoreProspects({
      campaignId,
      clientId,
      businessName: config.businessName,
      icpDescription: config.outbound?.icpDescription || config.businessName,
      icpCriteria: campaign.icp_criteria,
      icpThreshold: campaign.icp_threshold,
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error("Rescore prospects error", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
