import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { decideNextAction } from "@/engine/nurture/decide-action"
import { getConfig } from "@/lib/config"
import type { Lead, Message } from "@/types/database"

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const supabase = createServiceClient()

    const { data: pausedLeads } = await supabase
      .from("leads")
      .select("*")
      .not("paused_until", "is", null)
      .lte("paused_until", new Date().toISOString())
      .eq("disqualified", false)
      .eq("opted_out", false)

    if (!pausedLeads || pausedLeads.length === 0) {
      return NextResponse.json({ woken: 0 })
    }

    let woken = 0

    for (const leadRow of pausedLeads) {
      const lead = leadRow as Lead

      await supabase
        .from("leads")
        .update({ paused_until: null, updated_at: new Date().toISOString() })
        .eq("id", lead.id)

      try {
        const config = await getConfig(lead.client_id)
        const { data: messages } = await supabase
          .from("messages")
          .select("*")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: true })

        const decision = await decideNextAction({
          lead: { ...lead, paused_until: null },
          messages: (messages as Message[]) || [],
          config,
        })

        await supabase.from("ai_actions").insert({
          client_id: lead.client_id,
          lead_id: lead.id,
          action_type: decision.action,
          reasoning: `[Woken from pause] ${decision.reasoning}`,
          proposed_content: decision.message || null,
          status: config.humanApprovalRequired ? "pending" : "approved",
        })

        woken++
      } catch (e) {
        console.error("Failed to wake paused lead", { leadId: lead.id, error: e })
      }
    }

    return NextResponse.json({ woken })
  } catch (e) {
    console.error("Wake paused leads cron error", e)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
