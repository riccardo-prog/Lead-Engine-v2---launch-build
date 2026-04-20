import { NextRequest, NextResponse } from "next/server"
import { pollOutlookForLeads } from "@/engine/intake/outlook-poller"
import { requireBearerToken } from "@/lib/api-auth"

async function handler(request: NextRequest) {
  const auth = requireBearerToken(request)
  if (!auth.ok) return auth.response

  try {
    const result = await pollOutlookForLeads()
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = handler
export const GET = handler