import { NextRequest, NextResponse } from "next/server"
import { getClientIdFromSession } from "@/lib/config"
import { requireSession } from "@/lib/api-auth"
import { regenerateBriefs } from "@/engine/outbound/prospects"
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

    const result = await regenerateBriefs({ campaignId, clientId })
    return NextResponse.json(result)
  } catch (e) {
    console.error("Regenerate briefs error", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
