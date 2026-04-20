import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { requireSession } from "@/lib/api-auth"
import { getConfig } from "@/lib/config"
import { randomBytes } from "crypto"

export async function GET() {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID!
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common"
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/microsoft/callback`
  const ttl = parseInt(process.env.OAUTH_STATE_TTL_SECONDS || "600", 10)

  const scopes = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "User.Read",
    "Mail.Read",
    "Mail.Send",
  ].join(" ")

  // CSRF protection: generate a random state, store it server-side tied to this user,
  // then verify it in the callback.
  const state = randomBytes(32).toString("hex")
  const supabase = createServiceClient()
  const config = await getConfig()
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()

  await supabase.from("oauth_states").insert({
    state,
    client_id: config.clientId,
    provider: "microsoft",
    user_id: auth.userId,
    expires_at: expiresAt,
  })

  const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`)
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("response_mode", "query")
  authUrl.searchParams.set("scope", scopes)
  authUrl.searchParams.set("prompt", "select_account")
  authUrl.searchParams.set("state", state)

  return NextResponse.redirect(authUrl.toString())
}