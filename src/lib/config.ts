import type { ClientConfig } from "@/config/schema"
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase-server"

/**
 * Load a client's full config from the database.
 */
export async function getConfig(clientId: string): Promise<ClientConfig> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("client_settings")
    .select("config")
    .eq("client_id", clientId)
    .maybeSingle()

  if (error) {
    console.error("Failed to fetch client config", { clientId, error })
    throw new Error(`Failed to load config for client_id: ${clientId}`)
  }

  if (!data?.config) {
    throw new Error(`No config found for client_id: ${clientId}`)
  }

  return data.config as ClientConfig
}

/**
 * Extract client_id from the authenticated user's JWT app_metadata.
 * Use in server components and session-auth API routes.
 */
export async function getClientIdFromSession(): Promise<string> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const clientId = user?.app_metadata?.client_id as string | undefined
  if (!clientId) {
    throw new Error("No client_id in user app_metadata")
  }
  return clientId
}

/**
 * Return all registered client IDs. Used by cron jobs to iterate over all tenants.
 */
export async function getAllClientIds(): Promise<string[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("client_settings")
    .select("client_id")
    .not("config", "is", null)

  return (data || []).map((r) => r.client_id)
}
