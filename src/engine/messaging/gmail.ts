import { createServiceClient } from "@/lib/supabase-server"
import { encryptToken, decryptToken } from "@/lib/token-crypto"

export type GoogleConnection = {
  id: string
  client_id: string
  account_email: string | null
  account_id: string | null
  access_token: string
  refresh_token: string | null
  expires_at: string | null
}

export async function getGoogleConnection(
  clientId: string
): Promise<GoogleConnection | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("provider", "google")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    ...data,
    access_token: decryptToken(data.access_token),
    refresh_token: data.refresh_token ? decryptToken(data.refresh_token) : null,
  } as GoogleConnection
}

async function refreshAccessToken(
  connection: GoogleConnection
): Promise<GoogleConnection> {
  if (!connection.refresh_token) {
    throw new Error("No refresh token available — reconnect Google account")
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(
      `Failed to refresh Google token: ${data.error_description || data.error}`
    )
  }

  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString()

  const supabase = createServiceClient()
  await supabase
    .from("connections")
    .update({
      access_token: encryptToken(data.access_token),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)

  return {
    ...connection,
    access_token: data.access_token,
    expires_at: expiresAt,
  }
}

export async function getValidGoogleToken(connection: GoogleConnection): Promise<string> {
  const expiresAt = connection.expires_at ? new Date(connection.expires_at) : null
  const stillValid = expiresAt && expiresAt.getTime() > Date.now() + 60 * 1000

  if (stillValid) {
    return connection.access_token
  }

  const refreshed = await refreshAccessToken(connection)
  return refreshed.access_token
}

/**
 * Build a RFC 2822 MIME message and base64url-encode it for the Gmail API.
 */
function buildMimeMessage({
  from,
  to,
  toName,
  subject,
  body,
  inReplyTo,
}: {
  from: string
  to: string
  toName?: string
  subject: string
  body: string
  inReplyTo?: string
}): string {
  const toHeader = toName ? `"${toName}" <${to}>` : to
  const lines = [
    `From: ${from}`,
    `To: ${toHeader}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
  ]
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`)
    lines.push(`References: ${inReplyTo}`)
  }
  lines.push("", body)
  const raw = lines.join("\r\n")
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export async function sendEmailViaGmail({
  clientId,
  toEmail,
  toName,
  subject,
  body,
  threadId,
  inReplyTo,
}: {
  clientId: string
  toEmail: string
  toName?: string
  subject: string
  body: string
  threadId?: string
  inReplyTo?: string
}): Promise<{ success: boolean; messageId?: string; threadId?: string; error?: string }> {
  const connection = await getGoogleConnection(clientId)
  if (!connection) {
    return { success: false, error: "No Google connection found for this client" }
  }

  try {
    const token = await getValidGoogleToken(connection)
    const from = connection.account_email || ""

    const raw = buildMimeMessage({ from, to: toEmail, toName, subject, body, inReplyTo })

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
      }
    )

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      return {
        success: false,
        error: (errorData as Record<string, unknown>)?.error?.toString() || `Gmail API returned ${res.status}`,
      }
    }

    const data = await res.json()
    return { success: true, messageId: data.id, threadId: data.threadId }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return { success: false, error: message }
  }
}
