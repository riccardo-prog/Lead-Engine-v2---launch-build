import { getConfig, getClientIdFromSession } from "@/lib/config"
import { NewLeadForm } from "@/components/pipeline/new-lead-form"

export default async function NewLeadPage() {
  const clientId = await getClientIdFromSession()
  const config = await getConfig(clientId)
  return <NewLeadForm sources={config.leadSources} />
}