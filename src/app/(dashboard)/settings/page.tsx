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

  // Cal.com: only show as configured if this client uses cal.com as their booking provider
  const isCalcomClient = config.booking?.provider === "cal.com"
  const calcom = isCalcomClient ? {
    configured: !!(process.env.CAL_API_KEY && process.env.CAL_EVENT_TYPE_ID),
    bookingUrl: config.booking?.url || null,
    eventTypeId: process.env.CAL_EVENT_TYPE_ID || null,
  } : undefined

  // Determine which integrations this client should see based on their channels
  const hasMetaChannels = config.channels?.some((ch: string) =>
    ["instagram_dm", "facebook_dm"].includes(ch)
  )

  return (
    <SettingsView
      config={config}
      connections={connections || []}
      justConnected={params.connected}
      errorMessage={params.error}
      calcom={calcom}
      showMeta={!!hasMetaChannels}
      emailProvider={config.emailProvider || "gmail"}
    />
  )
}