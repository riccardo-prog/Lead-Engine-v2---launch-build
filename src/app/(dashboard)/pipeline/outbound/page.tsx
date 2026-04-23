import { getClientIdFromSession, getConfig } from "@/lib/config"
import { createServiceClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { CampaignList } from "@/components/outbound/campaign-list"
import type { OutboundCampaign } from "@/engine/outbound/types"

export default async function OutboundPage() {
  const clientId = await getClientIdFromSession()
  const config = await getConfig(clientId)
  if (!config.outbound) redirect("/pipeline")
  const supabase = createServiceClient()

  const { data: campaigns } = await supabase
    .from("outbound_campaigns")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })

  const campaignList = (campaigns as OutboundCampaign[]) || []
  const stats = await Promise.all(
    campaignList.map(async (c) => {
      const { count: prospectCount } = await supabase
        .from("outbound_prospects")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)

      const { count: sentCount } = await supabase
        .from("outbound_emails")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)
        .eq("status", "sent")

      const { count: replyCount } = await supabase
        .from("outbound_replies")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)

      const { count: positiveReplyCount } = await supabase
        .from("outbound_replies")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)
        .eq("sentiment", "reply_to_continue")

      return {
        campaignId: c.id,
        prospectCount: prospectCount || 0,
        sentCount: sentCount || 0,
        replyCount: replyCount || 0,
        positiveReplyCount: positiveReplyCount || 0,
      }
    })
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <CampaignList campaigns={campaignList} stats={stats} />
    </div>
  )
}
