import { getConfig } from "@/lib/config"
import { NewLeadForm } from "@/components/pipeline/new-lead-form"

export default async function NewLeadPage() {
  const config = getConfig()
  return <NewLeadForm sources={config.leadSources} />
}