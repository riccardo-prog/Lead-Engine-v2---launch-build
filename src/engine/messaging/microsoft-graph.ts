import { createServiceClient } from "@/lib/supabase-server"
import { encryptToken, decryptToken } from "@/lib/token-crypto"

export type MicrosoftConnection = {
  id: string
  client_id: string
  account_email: string | null
  account_id: string | null
  access_token: string
  refresh_token: string | null
  expires_at: string | null
}

export async function getMicrosoftConnection(
  clientId: string
): Promise<MicrosoftConnection | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("provider", "microsoft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  // Decrypt tokens as we read them.
  return {
    ...data,
    access_token: decryptToken(data.access_token),
    refresh_token: data.refresh_token ? decryptToken(data.refresh_token) : null,
  } as MicrosoftConnection
}

async function refreshAccessToken(
  connection: MicrosoftConnection
): Promise<MicrosoftConnection> {
  if (!connection.refresh_token) {
    throw new Error("No refresh token available — reconnect Microsoft account")
  }

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID!
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common"

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: connection.refresh_token,
        grant_type: "refresh_token",
      }),
    }
  )

  const data = await res.json()

  if (!res.ok) {
    throw new Error(
      `Failed to refresh token: ${data.error_description || data.error}`
    )
  }

  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString()
  const newRefreshToken = data.refresh_token || connection.refresh_token

  const supabase = createServiceClient()
  await supabase
    .from("connections")
    .update({
      access_token: encryptToken(data.access_token),
      refresh_token: newRefreshToken ? encryptToken(newRefreshToken) : null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)

  return {
    ...connection,
    access_token: data.access_token,
    refresh_token: newRefreshToken,
    expires_at: expiresAt,
  }
}

// Single source of truth for token validity.
// A token is VALID if it exists AND expires more than 60 seconds from now.
export async function getValidToken(connection: MicrosoftConnection): Promise<string> {
  const expiresAt = connection.expires_at ? new Date(connection.expires_at) : null
  const stillValid = expiresAt && expiresAt.getTime() > Date.now() + 60 * 1000

  if (stillValid) {
    return connection.access_token
  }

  const refreshed = await refreshAccessToken(connection)
  return refreshed.access_token
}

export async function sendEmailViaOutlook({
  clientId,
  toEmail,
  toName,
  subject,
  body,
}: {
  clientId: string
  toEmail: string
  toName?: string
  subject: string
  body: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const connection = await getMicrosoftConnection(clientId)
  if (!connection) {
    return { success: false, error: "No Microsoft connection found for this client" }
  }

  try {
    const token = await getValidToken(connection)

    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: "Text",
            content: body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: toEmail,
                name: toName || toEmail,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.error?.message || `Graph API returned ${res.status}`,
      }
    }

    return { success: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return { success: false, error: message }
  }
}