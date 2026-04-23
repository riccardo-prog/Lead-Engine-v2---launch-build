import { NextRequest, NextResponse } from "next/server"
import { getClientIdFromSession, getConfig } from "@/lib/config"
import { requireSession } from "@/lib/api-auth"
import { parseCSV, importProspects } from "@/engine/outbound/prospects"
import { getCampaign } from "@/engine/outbound/campaigns"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  try {
    const { campaignId } = await params
    const clientId = await getClientIdFromSession()
    const config = await getConfig(clientId)

    const campaign = await getCampaign(campaignId)
    if (!campaign || campaign.client_id !== clientId) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const { csv } = await request.json()
    if (!csv) {
      return NextResponse.json({ error: "CSV data is required" }, { status: 400 })
    }

    const rows = parseCSV(csv)
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows in CSV" }, { status: 400 })
    }

    const result = await importProspects({
      campaignId,
      clientId,
      rows,
      icpThreshold: campaign.icp_threshold,
      businessName: config.businessName,
      icpDescription: config.outbound?.icpDescription || config.businessName,
      icpCriteria: campaign.icp_criteria,
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error("Import prospects error", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
