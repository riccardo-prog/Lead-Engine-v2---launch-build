import { NextRequest, NextResponse } from "next/server"
import { runOutboundSendCron } from "@/engine/outbound/send-cron"
import { getAllClientIds } from "@/lib/config"

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  for (const clientId of getAllClientIds()) {
    try {
      results[clientId] = await runOutboundSendCron(clientId)
    } catch (e) {
      console.error(`Outbound send cron error for ${clientId}`, e)
      results[clientId] = { error: "server_error" }
    }
  }

  return NextResponse.json(results)
}
