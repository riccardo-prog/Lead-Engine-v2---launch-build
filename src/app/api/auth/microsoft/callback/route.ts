import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { getConfig } from "@/lib/config"
import { encryptToken } from "@/lib/token-crypto"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

function errorRedirect(code: string, detail?: unknown) {
  if (detail) {
    console.error(`Microsoft OAuth callback error [${code}]`, detail)
  }
  return NextResponse.redirect(`${APP_URL}/settings?error=${encodeURIComponent(code)}`)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  if (error) {
    return errorRedirect("microsoft_rejected", { error, errorDescription })
  }

  if (!code) {
    return errorRedirect("missing_code")
  }

  if (!state) {
    return errorRedirect("missing_state")
  }

  const supabase = createServiceClient()
  const config = await getConfig()

  const { data: stateRow } = await supabase
    .from("oauth_states")
    .select("*")
    .eq("state", state)
    .eq("client_id", config.clientId)
    .eq("provider", "microsoft")
    .maybeSingle()

  if (!stateRow) {
    return errorRedirect("invalid_state")
  }

  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    await supabase.from("oauth_states").delete().eq("state", state)
    return errorRedirect("expired_state")
  }

  await supabase.from("oauth_states").delete().eq("state", state)

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID!
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common"
  const redirectUri = `${APP_URL}/api/auth/microsoft/callback`

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    }
  )

  const tokenData = await tokenRes.json()

  if (!tokenRes.ok) {
    return errorRedirect("token_exchange_failed", tokenData)
  }

  const { access_token, refresh_token, expires_in, scope } = tokenData

  const userRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const userData = await userRes.json()

  if (!userRes.ok) {
    return errorRedirect("user_fetch_failed", userData)
  }

  const email = userData.mail || userData.userPrincipalName || ""
  const accountId = userData.id || email

  const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000).toISOString()

  const { error: upsertError } = await supabase
    .from("connections")
    .upsert(
      {
        client_id: config.clientId,
        provider: "microsoft",
        account_email: email,
        account_id: accountId,
        access_token: encryptToken(access_token),
        refresh_token: refresh_token ? encryptToken(refresh_token) : null,
        expires_at: expiresAt,
        scope,
        metadata: {
          display_name: userData.displayName || null,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,provider,account_id" }
    )

  if (upsertError) {
    return errorRedirect("save_failed", upsertError)
  }

  return NextResponse.redirect(`${APP_URL}/settings?connected=microsoft`)
}