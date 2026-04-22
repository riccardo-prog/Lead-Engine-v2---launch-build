import { NextRequest, NextResponse } from "next/server"
import { runOutboundSendCron } from "@/engine/outbound/send-cron"

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const result = await runOutboundSendCron("operate-ai")
    return NextResponse.json(result)
  } catch (e) {
    console.error("Outbound send cron error", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
