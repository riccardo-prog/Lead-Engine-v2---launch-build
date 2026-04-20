import { getConfig } from "@/lib/config"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { PipelineView } from "@/components/pipeline/pipeline-view"
import type { Lead } from "@/types/database"

export default async function PipelinePage() {
  const config = await getConfig()
  const supabase = await createServerSupabaseClient()

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", config.clientId)
    .order("updated_at", { ascending: false })

  return (
    <PipelineView
      stages={config.funnelStages}
      sources={config.leadSources}
      leads={(leads as Lead[]) || []}
    />
  )
}