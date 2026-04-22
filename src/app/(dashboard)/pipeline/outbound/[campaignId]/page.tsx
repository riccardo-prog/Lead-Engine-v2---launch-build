import { getClientIdFromSession } from "@/lib/config"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { CampaignDetail } from "@/components/outbound/campaign-detail"
import type { OutboundCampaign, OutboundProspect, OutboundReply } from "@/engine/outbound/types"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const clientId = await getClientIdFromSession()
  const supabase = await createServerSupabaseClient()

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
    .order("created_at", { ascending: false })
    .limit(50)

  const prospectList = (prospects as OutboundProspect[]) || []

  const prospectIds = prospectList.map((p) => p.id)
  const { data: replies } = await supabase
    .from("outbound_replies")
    .select("*")
    .in("prospect_id", prospectIds.length > 0 ? prospectIds : ["__none__"])

  const replyMap = new Map<string, OutboundReply>()
  if (replies) {
    for (const r of replies as OutboundReply[]) {
      replyMap.set(r.prospect_id, r)
    }
  }

  const prospectsWithReplies = prospectList.map((p) => ({
    ...p,
    reply: replyMap.get(p.id) || null,
  }))

  const { count: prospectCount } = await supabase
    .from("outbound_prospects")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)

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
    sent,
    replyRate: sent > 0 ? ((rCount / sent) * 100).toFixed(1) : "0",
    positiveRate: rCount > 0 ? ((pCount / rCount) * 100).toFixed(1) : "0",
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <CampaignDetail
        campaign={c}
        prospects={prospectsWithReplies}
        totalSteps={totalSteps}
        stats={stats}
      />
    </div>
  )
}
