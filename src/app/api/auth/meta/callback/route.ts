import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { getConfig } from "@/lib/config"
import { encryptToken } from "@/lib/token-crypto"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
const GRAPH_BASE = "https://graph.facebook.com/v22.0"

function errorRedirect(code: string, detail?: unknown) {
  if (detail) {
    console.error(`Meta OAuth callback error [${code}]`, detail)
  }
  return NextResponse.redirect(`${APP_URL}/settings?error=${encodeURIComponent(code)}`)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorReason = url.searchParams.get("error_reason")

  if (error) {
    return errorRedirect("meta_rejected", { error, errorReason })
  }

  if (!code) return errorRedirect("missing_code")
  if (!state) return errorRedirect("missing_state")

  const appId = process.env.META_APP_ID!
  const appSecret = process.env.META_APP_SECRET!

  if (!appId || !appSecret) {
    return errorRedirect("server_misconfigured")
  }

  const supabase = createServiceClient()
  const config = await getConfig()

  // Validate CSRF state
  const { data: stateRow } = await supabase
    .from("oauth_states")
    .select("*")
    .eq("state", state)
    .eq("client_id", config.clientId)
    .eq("provider", "meta")
    .maybeSingle()

  if (!stateRow) return errorRedirect("invalid_state")

  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    await supabase.from("oauth_states").delete().eq("state", state)
    return errorRedirect("expired_state")
  }

  await supabase.from("oauth_states").delete().eq("state", state)

  const redirectUri = `${APP_URL}/api/auth/meta/callback`

  // Step 1: Exchange code for short-lived user token
  const tokenRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?` +
    new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    })
  )

  const tokenData = await tokenRes.json()
  if (!tokenRes.ok) {
    return errorRedirect("token_exchange_failed", tokenData)
  }

  const shortLivedToken = tokenData.access_token

  // Step 2: Exchange for long-lived user token (60 days)
  const longLivedRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?` +
    new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    })
  )

  const longLivedData = await longLivedRes.json()
  if (!longLivedRes.ok) {
    return errorRedirect("token_exchange_failed", longLivedData)
  }

  const longLivedUserToken = longLivedData.access_token

  // Step 3: Fetch user's Pages
  const pagesRes = await fetch(`${GRAPH_BASE}/me/accounts?access_token=${longLivedUserToken}`)
  const pagesData = await pagesRes.json()

  if (!pagesRes.ok || !pagesData.data?.length) {
    return errorRedirect("no_pages_found", pagesData)
  }

  // Use the first Page. The Page token derived from a long-lived user token is already long-lived.
  const page = pagesData.data[0]
  const pageAccessToken = page.access_token
  const pageId = page.id
  const pageName = page.name || null

  // Step 4: Fetch Instagram Business Account ID
  const igRes = await fetch(
    `${GRAPH_BASE}/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
  )
  const igData = await igRes.json()
  const igAccountId = igData.instagram_business_account?.id || null

  if (!igAccountId) {
    console.warn(
      "No Instagram Business account linked to Page. Instagram DM sending will be unavailable.",
      { pageId, pageName }
    )
  }

  // Step 5: Compute token expiry (long-lived Page tokens last ~60 days)
  const expiresAt = new Date(
    Date.now() + (longLivedData.expires_in || 5184000) * 1000
  ).toISOString()

  // Step 6: Store connection
  const { error: upsertError } = await supabase
    .from("connections")
    .upsert(
      {
        client_id: config.clientId,
        provider: "meta",
        account_email: null,
        account_id: pageId,
        access_token: encryptToken(pageAccessToken),
        refresh_token: null,
        expires_at: expiresAt,
        metadata: {
          page_id: pageId,
          instagram_business_account_id: igAccountId,
          page_name: pageName,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,provider,account_id" }
    )

  if (upsertError) {
    return errorRedirect("save_failed", upsertError)
  }

  // Step 7: Subscribe Page to webhooks
  try {
    const subscribeRes = await fetch(
      `${GRAPH_BASE}/${pageId}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: pageAccessToken,
          subscribed_fields: ["messages", "messaging_postbacks", "leadgen"],
        }),
      }
    )

    if (!subscribeRes.ok) {
      const subscribeData = await subscribeRes.json().catch(() => ({}))
      console.error("Failed to subscribe Page to webhooks", subscribeData)
      // Non-fatal: connection is saved, webhooks can be set up manually
    }
  } catch (e) {
    console.error("Webhook subscription request failed", e)
  }

  return NextResponse.redirect(`${APP_URL}/settings?connected=meta`)
}
