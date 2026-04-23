import { NextRequest, NextResponse } from "next/server"
import { executeAction } from "@/engine/nurture/execute-action"
import { requireSession } from "@/lib/api-auth"
import { createServiceClient } from "@/lib/supabase-server"
import { getClientIdFromSession } from "@/lib/config"

export async function POST(request: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  try {
    const { actionId, contentOverride } = (await request.json()) as {
      actionId: string
      contentOverride?: string
    }
    if (!actionId) {
      return NextResponse.json({ error: "actionId required" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const clientId = await getClientIdFromSession()

    // Atomically approve (and optionally override content) server-side.
    // The client never touches the ai_actions table.
    const updates: Record<string, unknown> = { status: "approved" }
    if (typeof contentOverride === "string") {
      updates.proposed_content = contentOverride
    }

    const { data: updated, error: updateError } = await supabase
      .from("ai_actions")
      .update(updates)
      .eq("id", actionId)
      .eq("client_id", clientId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle()

    if (updateError) {
      console.error("Failed to approve action", updateError)
      return NextResponse.json({ error: "approval_failed" }, { status: 500 })
    }

    if (!updated) {
      return NextResponse.json({ error: "Action not found or already processed" }, { status: 409 })
    }

    const result = await executeAction(actionId)
    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      scheduled: result.scheduled,
      scheduledFor: result.scheduledFor,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    console.error("Execute route exception", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}