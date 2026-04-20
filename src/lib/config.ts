import { ClientConfig } from "@/config/schema"
import { josephConfig } from "@/config/joseph.config"
import { createServiceClient } from "@/lib/supabase-server"

const configs: Record<string, ClientConfig> = {
  "joseph-real-estate": josephConfig,
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

export async function getConfig(): Promise<ClientConfig> {
  const clientId = process.env.CLIENT_ID
  if (!clientId) {
    throw new Error(
      "CLIENT_ID env var is required (rename from NEXT_PUBLIC_CLIENT_ID if migrating)"
    )
  }
  if (!configs[clientId]) {
    throw new Error(`No config found for CLIENT_ID: ${clientId}`)
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

// Server-only. For client components, pass the value down as a prop from a server component.
export function getClientIdServerOnly(): string {
  return process.env.CLIENT_ID || ""
}
