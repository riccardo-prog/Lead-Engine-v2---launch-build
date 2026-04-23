import { getClientIdFromSession } from "@/lib/config"
import { createServiceClient } from "@/lib/supabase-server"
import { CampaignDetail } from "@/components/outbound/campaign-detail"
import type { OutboundCampaign, OutboundProspect, OutboundReply, OutboundEmail } from "@/engine/outbound/types"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const clientId = await getClientIdFromSession()
  const supabase = createServiceClient()

  const { data: campaign } = await supabase
    .from("outbound_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("client_id", clientId)
    .single()

  if (!campaign) {
    return <div className="p-6">Campaign not found.</div>
  }

  const c = campaign as OutboundCampaign

  const { data: sequence } = await supabase
    .from("outbound_sequences")
    .select("steps")
    .eq("id", c.sequence_id)
    .single()

  const totalSteps = sequence ? (sequence.steps as unknown[]).length : 4

  const { data: prospects } = await supabase
    .from("outbound_prospects")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("icp_score", { ascending: false, nullsFirst: false })

  const prospectList = (prospects as OutboundProspect[]) || []

  const prospectIds = prospectList.map((p) => p.id)
  const safeIds = prospectIds.length > 0 ? prospectIds : ["__none__"]

  const [{ data: replies }, { data: emails }] = await Promise.all([
    supabase
      .from("outbound_replies")
      .select("*")
      .in("prospect_id", safeIds),
    supabase
      .from("outbound_emails")
      .select("*")
      .in("prospect_id", safeIds)
      .order("step_order", { ascending: true }),
  ])

  const replyMap = new Map<string, OutboundReply>()
  if (replies) {
    for (const r of replies as OutboundReply[]) {
      replyMap.set(r.prospect_id, r)
    }
  }

  const emailMap = new Map<string, OutboundEmail[]>()
  if (emails) {
    for (const e of emails as OutboundEmail[]) {
      const list = emailMap.get(e.prospect_id) || []
      list.push(e)
      emailMap.set(e.prospect_id, list)
    }
  }

  const prospectsWithData = prospectList.map((p) => ({
    ...p,
    reply: replyMap.get(p.id) || null,
    emails: emailMap.get(p.id) || [],
  }))

  const { count: prospectCount } = await supabase
    .from("outbound_prospects")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)

  const { count: enrolledCount } = await supabase
    .from("outbound_prospects")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .neq("status", "suppressed")

  const { count: sentCount } = await supabase
    .from("outbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "sent")

  const { count: replyCount } = await supabase
    .from("outbound_replies")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)

  const { count: positiveCount } = await supabase
    .from("outbound_replies")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("sentiment", "reply_to_continue")

  const sent = sentCount || 0
  const rCount = replyCount || 0
  const pCount = positiveCount || 0

  const stats = {
    prospects: prospectCount || 0,
    enrolled: enrolledCount || 0,
    sent,
    replyRate: sent > 0 ? ((rCount / sent) * 100).toFixed(1) : "0",
    positiveRate: rCount > 0 ? ((pCount / rCount) * 100).toFixed(1) : "0",
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <CampaignDetail
        campaign={c}
        prospects={prospectsWithData}
        totalSteps={totalSteps}
        stats={stats}
      />
    </div>
  )
}
