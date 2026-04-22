import { NextRequest, NextResponse } from "next/server"
import { getClientIdFromSession } from "@/lib/config"
import { createCampaign, createSequence, DEFAULT_SEQUENCE_STEPS } from "@/engine/outbound/campaigns"
import { createServiceClient } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
  try {
    const clientId = await getClientIdFromSession()
    const { name } = await request.json()

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const sequence = await createSequence({
      clientId,
      name: `${name} — Default Sequence`,
      steps: DEFAULT_SEQUENCE_STEPS,
    })

    const supabase = createServiceClient()
    const { data: accounts } = await supabase
      .from("outbound_sending_accounts")
      .select("id")
      .eq("client_id", clientId)
      .limit(1)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: "No sending account configured. Set up a sending account first." },
        { status: 400 }
      )
    }

    const campaign = await createCampaign({
      clientId,
      name,
      sequenceId: sequence.id,
      sendingAccountId: accounts[0].id,
    })

    return NextResponse.json({ campaignId: campaign.id })
  } catch (e) {
    console.error("Create campaign error", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
