import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { requireSession } from "@/lib/api-auth"
import { getClientIdFromSession } from "@/lib/config"
import { randomBytes } from "crypto"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

// Core scopes available without App Review
const DEV_SCOPES = [
  "pages_manage_metadata",
  "pages_messaging",
  "pages_read_engagement",
]

// These require App Review — add after approval
const REVIEWED_SCOPES = [
  "leads_retrieval",
  "instagram_basic",
  "instagram_manage_messages",
]

const SCOPES = (process.env.META_APP_REVIEWED === "true"
  ? [...DEV_SCOPES, ...REVIEWED_SCOPES]
  : DEV_SCOPES
).join(",")

export async function GET() {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  const appId = process.env.META_APP_ID
  if (!appId) {
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
    provider: "meta",
    user_id: auth.userId,
    expires_at: expiresAt,
  })

  const redirectUri = `${APP_URL}/api/auth/meta/callback`

  const authUrl = new URL("https://www.facebook.com/v22.0/dialog/oauth")
  authUrl.searchParams.set("client_id", appId)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("scope", SCOPES)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("state", state)

  return NextResponse.redirect(authUrl.toString())
}
