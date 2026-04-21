import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { encryptToken } from "@/lib/token-crypto"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

function errorRedirect(code: string, detail?: unknown) {
  if (detail) {
    console.error(`Google OAuth callback error [${code}]`, detail)
  }
  return NextResponse.redirect(`${APP_URL}/settings?error=${encodeURIComponent(code)}`)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  if (error) {
    return errorRedirect("google_rejected", { error })
  }

  if (!code) return errorRedirect("missing_code")
  if (!state) return errorRedirect("missing_state")

  const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID!
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET!

  if (!googleClientId || !googleClientSecret) {
    return errorRedirect("server_misconfigured")
  }

  const supabase = createServiceClient()

  // Validate CSRF state
  const { data: stateRow } = await supabase
    .from("oauth_states")
    .select("*")
    .eq("state", state)
    .eq("provider", "google")
    .maybeSingle()

  if (!stateRow) return errorRedirect("invalid_state")

  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    await supabase.from("oauth_states").delete().eq("state", state)
    return errorRedirect("expired_state")
  }

  await supabase.from("oauth_states").delete().eq("state", state)

  const appClientId = stateRow.client_id as string
  const redirectUri = `${APP_URL}/api/auth/google/callback`

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  const tokenData = await tokenRes.json()

  if (!tokenRes.ok) {
    return errorRedirect("token_exchange_failed", tokenData)
  }

  const { access_token, refresh_token, expires_in } = tokenData

  // Fetch user info
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const userData = await userRes.json()

  if (!userRes.ok) {
    return errorRedirect("user_fetch_failed", userData)
  }

  const email = userData.email || ""
  const accountId = userData.id || email

  const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000).toISOString()

  const { error: upsertError } = await supabase
    .from("connections")
    .upsert(
      {
        client_id: appClientId,
        provider: "google",
        account_email: email,
        account_id: accountId,
        access_token: encryptToken(access_token),
        refresh_token: refresh_token ? encryptToken(refresh_token) : null,
        expires_at: expiresAt,
        metadata: {
          display_name: userData.name || null,
          picture: userData.picture || null,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,provider,account_id" }
    )

  if (upsertError) {
    return errorRedirect("save_failed", upsertError)
  }

  return NextResponse.redirect(`${APP_URL}/settings?connected=google`)
}
