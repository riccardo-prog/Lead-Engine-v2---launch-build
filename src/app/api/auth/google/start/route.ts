import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { requireSession } from "@/lib/api-auth"
import { getClientIdFromSession } from "@/lib/config"
import { randomBytes } from "crypto"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ")

export async function GET() {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  if (!googleClientId) {
    return NextResponse.redirect(`${APP_URL}/settings?error=server_misconfigured`)
  }

  const ttl = parseInt(process.env.OAUTH_STATE_TTL_SECONDS || "600", 10)
  const state = randomBytes(32).toString("hex")
  const supabase = createServiceClient()
  const clientId = await getClientIdFromSession()
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()

  await supabase.from("oauth_states").insert({
    state,
    client_id: clientId,
    provider: "google",
    user_id: auth.userId,
    expires_at: expiresAt,
  })

  const redirectUri = `${APP_URL}/api/auth/google/callback`

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("client_id", googleClientId)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", SCOPES)
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent")
  authUrl.searchParams.set("state", state)

  return NextResponse.redirect(authUrl.toString())
}
