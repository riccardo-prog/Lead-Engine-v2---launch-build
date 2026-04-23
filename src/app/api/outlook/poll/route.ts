import { NextRequest, NextResponse } from "next/server"
import { pollOutlookForLeads } from "@/engine/intake/outlook-poller"
import { pollGmailForLeads } from "@/engine/intake/gmail-poller"
import { getMicrosoftConnection } from "@/engine/messaging/microsoft-graph"
import { getGoogleConnection } from "@/engine/messaging/gmail"
import { getAllClientIds } from "@/lib/config"
import { requireBearerToken } from "@/lib/api-auth"

async function handler(request: NextRequest) {
  const auth = requireBearerToken(request)
  if (!auth.ok) return auth.response

  const results: Record<string, { scanned: number; processed: number; skipped: number; errors: string[] }> = {}

  for (const clientId of await getAllClientIds()) {
    try {
      // Poll whichever email provider the client has connected
      const msConn = await getMicrosoftConnection(clientId)
      if (msConn) {
        results[clientId] = await pollOutlookForLeads(clientId)
        continue
      }

      const googleConn = await getGoogleConnection(clientId)
      if (googleConn) {
        results[clientId] = await pollGmailForLeads(clientId)
        continue
      }

      results[clientId] = { scanned: 0, processed: 0, skipped: 0, errors: ["no_email_connection"] }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error"
      results[clientId] = { scanned: 0, processed: 0, skipped: 0, errors: [message] }
    }
  }

  return NextResponse.json(results)
}

export const POST = handler
export const GET = handler