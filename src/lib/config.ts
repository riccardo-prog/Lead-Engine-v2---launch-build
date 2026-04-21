import { ClientConfig } from "@/config/schema"
import { josephConfig } from "@/config/joseph.config"
import { operateaiConfig } from "@/config/operateai.config"
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase-server"

const configs: Record<string, ClientConfig> = {
  "joseph-real-estate": josephConfig,
  "operate-ai": operateaiConfig,
}

type ConfigOverrides = {
  businessName?: string
  aiPersona?: {
    name?: string
    tone?: "professional" | "friendly" | "casual" | "formal"
    voice?: string
    doNotSay?: string[]
    alwaysSay?: string[]
  }
  humanApprovalRequired?: boolean
}

/**
 * Load a client's config by ID, merging any DB-stored overrides on top of the static config.
 */
export async function getConfig(clientId: string): Promise<ClientConfig> {
  if (!configs[clientId]) {
    throw new Error(`No config found for client_id: ${clientId}`)
  }

  const base = configs[clientId]

  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from("client_settings")
      .select("overrides")
      .eq("client_id", clientId)
      .maybeSingle()

    if (!data?.overrides) return base

    const overrides = data.overrides as ConfigOverrides

    return {
      ...base,
      ...(overrides.businessName !== undefined && { businessName: overrides.businessName }),
      ...(overrides.humanApprovalRequired !== undefined && { humanApprovalRequired: overrides.humanApprovalRequired }),
      aiPersona: {
        ...base.aiPersona,
        ...(overrides.aiPersona?.name !== undefined && { name: overrides.aiPersona.name }),
        ...(overrides.aiPersona?.tone !== undefined && { tone: overrides.aiPersona.tone }),
        ...(overrides.aiPersona?.voice !== undefined && { voice: overrides.aiPersona.voice }),
        ...(overrides.aiPersona?.doNotSay !== undefined && { doNotSay: overrides.aiPersona.doNotSay }),
        ...(overrides.aiPersona?.alwaysSay !== undefined && { alwaysSay: overrides.aiPersona.alwaysSay }),
      },
    }
  } catch (e) {
    // If DB is unreachable, fall back to static config rather than crashing.
    console.error("Failed to fetch config overrides, using static config", e)
    return base
  }
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
export function getAllClientIds(): string[] {
  return Object.keys(configs)
}
