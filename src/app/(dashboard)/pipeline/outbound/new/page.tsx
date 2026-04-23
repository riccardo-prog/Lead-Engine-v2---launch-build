import { getClientIdFromSession, getConfig } from "@/lib/config"
import { redirect } from "next/navigation"
import { CampaignCreate } from "@/components/outbound/campaign-create"

export default async function NewCampaignPage() {
  const clientId = await getClientIdFromSession()
  const config = await getConfig(clientId)
  if (!config.outbound) redirect("/pipeline")
  return (
    <div className="p-6">
      <CampaignCreate />
    </div>
  )
}
