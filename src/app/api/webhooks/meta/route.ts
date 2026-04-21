import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { processIntake } from "@/engine/intake/process-lead"
import { parseLeadAdFields } from "@/engine/intake/meta-lead-parser"
import { getMetaConnection, getValidMetaToken, fetchLeadAdData } from "@/engine/messaging/meta-graph"
import { getConfig } from "@/lib/config"
import { createServiceClient } from "@/lib/supabase-server"

/**
 * GET — Webhook verification handshake.
 * Meta sends hub.mode, hub.verify_token, hub.challenge on setup.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN
  if (!expected) {
    return new NextResponse("Server misconfigured", { status: 500 })
  }

  if (mode === "subscribe" && token && safeCompare(token, expected)) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
  }

  return new NextResponse("Forbidden", { status: 403 })
}

/**
 * POST — Incoming webhook events.
 * Validates HMAC signature, responds 200 immediately, processes events fire-and-forget.
 */
export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.error("META_APP_SECRET not set")
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }

  // Read raw body for HMAC validation
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")

  if (!signature || !verifySignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 })
  }

  const body = JSON.parse(rawBody)

  // Respond 200 immediately — Meta's timeout is 10s, processIntake calls Claude (3-8s).
  // Fire-and-forget processing. Dedup via external_id handles any retries.
  void processWebhookEvents(body).catch((err) =>
    console.error("Meta webhook processing error", err)
  )

  return NextResponse.json({ ok: true })
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSig = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex")

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSig)

  if (sigBuffer.length !== expectedBuffer.length) return false

  return timingSafeEqual(sigBuffer, expectedBuffer)
}

type WebhookBody = {
  object: string
  entry: WebhookEntry[]
}

type WebhookEntry = {
  id: string
  time: number
  messaging?: MessagingEvent[]
  changes?: ChangeEvent[]
}

type MessagingEvent = {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: {
    mid: string
    text: string
  }
}

type ChangeEvent = {
  field: string
  value: {
    leadgen_id: string
    page_id: string
    form_id: string
    created_time: number
  }
}

async function processWebhookEvents(body: WebhookBody) {
  if (body.object !== "page") return

  for (const entry of body.entry) {
    // Look up which client owns this page by querying connections
    const supabase = createServiceClient()
    const { data: connRow } = await supabase
      .from("connections")
      .select("client_id, metadata")
      .eq("provider", "meta")
      .eq("account_id", entry.id)
      .maybeSingle()

    if (!connRow) {
      console.error("Meta webhook received for unknown page_id", entry.id)
      continue
    }

    const clientId = connRow.client_id as string
    const config = await getConfig(clientId)
    const connection = await getMetaConnection(config.clientId)
    if (!connection) {
      console.error("Meta webhook: no connection found for client", clientId)
      continue
    }

    const igAccountId = connection.metadata.instagram_business_account_id

    await processEntryForClient(entry, config, connection, igAccountId)
  }
}

async function processEntryForClient(
  entry: WebhookEntry,
  config: Awaited<ReturnType<typeof getConfig>>,
  connection: Awaited<ReturnType<typeof getMetaConnection>>,
  igAccountId: string | null,
) {
  if (!connection) return

  // Handle DM events (Messenger + Instagram)
  if (entry.messaging) {
    for (const event of entry.messaging) {
      if (!event.message?.text) continue

      const isInstagram = igAccountId && entry.id === igAccountId
      const sourceId = isInstagram ? "instagram-dm" : "facebook-dm"
      const channel = isInstagram ? "instagram_dm" : "facebook_dm"

      try {
        await processIntake({
          config,
          payload: {
            sourceId,
            ...(isInstagram
              ? { metaIgsid: event.sender.id }
              : { metaPsid: event.sender.id }),
            initialMessage: {
              channel: channel as "facebook_dm" | "instagram_dm",
              content: event.message.text,
              externalId: event.message.mid,
            },
          },
        })
      } catch (e) {
        console.error("Meta DM intake failed", { sourceId, senderId: event.sender.id, error: e })
      }
    }
  }

  // Handle Lead Ad events
  if (entry.changes) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen") continue

      try {
        const token = await getValidMetaToken(connection)
        const leadData = await fetchLeadAdData({
          leadId: change.value.leadgen_id,
          accessToken: token,
        })

        if (!leadData.success || !leadData.fields) {
          console.error("Failed to fetch lead ad data", {
            leadgenId: change.value.leadgen_id,
            error: leadData.error,
          })
          continue
        }

        const parsed = parseLeadAdFields(leadData.fields)

        if (!parsed.email && !parsed.phone) {
          console.error("Lead ad has no contact info", {
            leadgenId: change.value.leadgen_id,
          })
          continue
        }

        await processIntake({
          config,
          payload: {
            sourceId: "facebook-ad",
            ...parsed,
            initialMessage: parsed.email || parsed.phone
              ? {
                  channel: "email",
                  content: `Lead Ad form submission (Form: ${change.value.form_id})`,
                  externalId: change.value.leadgen_id,
                }
              : undefined,
          },
        })
      } catch (e) {
        console.error("Meta lead ad intake failed", {
          leadgenId: change.value.leadgen_id,
          error: e,
        })
      }
    }
  }
}
