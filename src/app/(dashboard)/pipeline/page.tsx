import { getConfig, getClientIdFromSession } from "@/lib/config"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { PipelineView } from "@/components/pipeline/pipeline-view"
import type { Lead } from "@/types/database"

export default async function PipelinePage() {
  const clientId = await getClientIdFromSession()
  const config = await getConfig(clientId)
  const supabase = await createServerSupabaseClient()

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", config.clientId)
    .order("updated_at", { ascending: false })

  const leadTypes = config.conversationScripts.map(s => s.leadType)

  return (
    <PipelineView
      stages={config.funnelStages}
      sources={config.leadSources}
      leads={(leads as Lead[]) || []}
      leadTypes={leadTypes}
    />
  )
}