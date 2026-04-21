import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { decideNextAction } from "@/engine/nurture/decide-action"
import { getConfig, getClientIdFromSession } from "@/lib/config"
import { requireSession } from "@/lib/api-auth"
import { notify, leadName } from "@/engine/notifications/notify"
import type { Lead, Message, AIAction } from "@/types/database"

export async function POST(request: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response

  try {
    const { actionId, feedback } = (await request.json()) as {
      actionId: string
      feedback: string
    }

    if (!actionId || !feedback) {
      return NextResponse.json(
        { error: "actionId and feedback are required" },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const clientId = await getClientIdFromSession()
    const config = await getConfig(clientId)

    const { data: actionRow } = await supabase
      .from("ai_actions")
      .select("*")
      .eq("id", actionId)
      .eq("client_id", config.clientId)
      .single()

    if (!actionRow) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 })
    }

    const action = actionRow as AIAction

    const { data: leadRow } = await supabase
      .from("leads")
      .select("*")
      .eq("id", action.lead_id)
      .eq("client_id", config.clientId)
      .single()

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    const lead = leadRow as Lead

    const { data: messagesData } = await supabase
      .from("messages")
      .select("*")
      .eq("client_id", config.clientId)
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: true })

    const messages = (messagesData as Message[]) || []

    await supabase
      .from("ai_actions")
      .update({ status: "rejected" })
      .eq("id", actionId)
      .eq("client_id", config.clientId)

    const decision = await decideNextAction({
      lead,
      messages,
      config,
      operatorFeedback: {
        previousProposal: action.proposed_content,
        feedback,
      },
    })

    const { data: newAction } = await supabase
      .from("ai_actions")
      .insert({
        client_id: config.clientId,
        lead_id: lead.id,
        action_type: decision.action,
        reasoning: `[Regenerated from feedback: "${feedback}"] ${decision.reasoning}`,
        proposed_content: decision.action === "book_appointment"
          ? JSON.stringify({
              bookingMode: decision.bookingMode,
              requestedTime: decision.requestedTime,
              message: decision.message,
              subject: decision.subject,
            })
          : decision.message || null,
        status: "pending",
      })
      .select()
      .single()

    await notify({
      clientId: config.clientId,
      type: "action_pending",
      title: `AI wants to ${decision.action.replace(/_/g, " ")} for ${leadName(lead)}`,
      body: decision.reasoning,
      leadId: lead.id,
      actionId: newAction?.id,
    })

    return NextResponse.json({
      actionId: newAction?.id,
      action: decision.action,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}