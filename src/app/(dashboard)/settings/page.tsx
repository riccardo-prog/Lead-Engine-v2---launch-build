import { getConfig, getClientIdFromSession } from "@/lib/config"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { SettingsView } from "@/components/settings/settings-view"

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const clientId = await getClientIdFromSession()
  const config = await getConfig(clientId)
  const params = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: connections } = await supabase
    .from("connections")
    .select("id, provider, account_email, metadata, connected_at, updated_at")
    .eq("client_id", config.clientId)

  return (
    <SettingsView
      config={config}
      connections={connections || []}
      justConnected={params.connected}
      errorMessage={params.error}
    />
  )
}