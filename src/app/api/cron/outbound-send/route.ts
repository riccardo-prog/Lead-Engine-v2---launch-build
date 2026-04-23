import { NextRequest, NextResponse } from "next/server"
import { runOutboundSendCron } from "@/engine/outbound/send-cron"
import { getAllClientIds } from "@/lib/config"
import { requireBearerToken } from "@/lib/api-auth"

export async function GET(request: NextRequest) {
  const auth = requireBearerToken(request)
  if (!auth.ok) return auth.response

  const results: Record<string, unknown> = {}

  for (const clientId of await getAllClientIds()) {
    try {
      results[clientId] = await runOutboundSendCron(clientId)
    } catch (e) {
      console.error(`Outbound send cron error for ${clientId}`, e)
      results[clientId] = { error: "server_error" }
    }
  }

  return NextResponse.json(results)
}
