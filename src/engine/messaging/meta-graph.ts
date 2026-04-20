import { createServiceClient } from "@/lib/supabase-server"
import { encryptToken, decryptToken } from "@/lib/token-crypto"

const GRAPH_BASE = "https://graph.facebook.com/v22.0"

export type MetaConnection = {
  id: string
  client_id: string
  access_token: string
  expires_at: string | null
  metadata: {
    page_id: string
    instagram_business_account_id: string | null
    page_name: string | null
  }
}

export async function getMetaConnection(
  clientId: string
): Promise<MetaConnection | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("provider", "meta")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    ...data,
    access_token: decryptToken(data.access_token),
    metadata: data.metadata || {},
  } as MetaConnection
}

/**
 * Long-lived Page tokens last ~60 days. Refresh when within 7 days of expiry.
 * Exchange via GET /oauth/access_token with grant_type=fb_exchange_token.
 */
export async function getValidMetaToken(connection: MetaConnection): Promise<string> {
  const expiresAt = connection.expires_at ? new Date(connection.expires_at) : null
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const needsRefresh = expiresAt && expiresAt.getTime() < Date.now() + sevenDays

  if (!needsRefresh) {
    return connection.access_token
  }

  const appId = process.env.META_APP_ID!
  const appSecret = process.env.META_APP_SECRET!

  const res = await fetch(
    `${GRAPH_BASE}/oauth/access_token?` +
    new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: connection.access_token,
    })
  )

  const data = await res.json()

  if (!res.ok) {
    console.error("Meta token refresh failed", data)
    // Return existing token — it may still be valid even if refresh failed
    return connection.access_token
  }

  const newExpiresAt = new Date(Date.now() + (data.expires_in || 5184000) * 1000).toISOString()

  const supabase = createServiceClient()
  await supabase
    .from("connections")
    .update({
      access_token: encryptToken(data.access_token),
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)

  return data.access_token
}

export async function sendFacebookDM({
  clientId,
  recipientPsid,
  message,
}: {
  clientId: string
  recipientPsid: string
  message: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const connection = await getMetaConnection(clientId)
  if (!connection) {
    return { success: false, error: "No Meta connection found for this client" }
  }

  const token = await getValidMetaToken(connection)

  return sendMetaDM({ token, pageId: connection.metadata.page_id, recipientId: recipientPsid, message })
}

export async function sendInstagramDM({
  clientId,
  recipientIgsid,
  message,
}: {
  clientId: string
  recipientIgsid: string
  message: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const connection = await getMetaConnection(clientId)
  if (!connection) {
    return { success: false, error: "No Meta connection found for this client" }
  }

  if (!connection.metadata.instagram_business_account_id) {
    return {
      success: false,
      error: "instagram_not_configured: Instagram Business account is not linked to the Page. Connect an Instagram Business account in Meta Business settings.",
    }
  }

  const token = await getValidMetaToken(connection)

  return sendMetaDM({ token, pageId: connection.metadata.page_id, recipientId: recipientIgsid, message })
}

async function sendMetaDM({
  token,
  pageId,
  recipientId,
  message,
}: {
  token: string
  pageId: string
  recipientId: string
  message: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${pageId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
        messaging_type: "RESPONSE",
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return {
        success: false,
        error: data.error?.message || `Meta API returned ${res.status}`,
      }
    }

    return { success: true, messageId: data.message_id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return { success: false, error: msg }
  }
}

export async function fetchLeadAdData({
  leadId,
  accessToken,
}: {
  leadId: string
  accessToken: string
}): Promise<{ success: boolean; fields?: Record<string, string>; error?: string }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${leadId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const data = await res.json()

    if (!res.ok) {
      return { success: false, error: data.error?.message || `Graph API returned ${res.status}` }
    }

    // Lead Ad data comes as { field_data: [{ name, values }] }
    const fields: Record<string, string> = {}
    if (Array.isArray(data.field_data)) {
      for (const field of data.field_data) {
        fields[field.name] = field.values?.[0] || ""
      }
    }

    return { success: true, fields }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return { success: false, error: msg }
  }
}

/**
 * Check the 24-hour messaging window for a DM channel.
 * Meta only allows sending within 24h of the lead's last inbound message.
 */
export async function getMessagingWindowStatus({
  leadId,
  channel,
  clientId,
}: {
  leadId: string
  channel: "facebook_dm" | "instagram_dm"
  clientId: string
}): Promise<{ open: boolean; hoursSinceLastInbound: number | null }> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from("messages")
    .select("created_at")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .eq("channel", channel)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) {
    return { open: false, hoursSinceLastInbound: null }
  }

  const hoursSince = (Date.now() - new Date(data.created_at).getTime()) / (1000 * 3600)
  return {
    open: hoursSince <= 24,
    hoursSinceLastInbound: Math.round(hoursSince * 10) / 10,
  }
}
