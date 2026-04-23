import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase-server"
import { getAllClientIds, getConfig } from "@/lib/config"
import { requireBearerToken } from "@/lib/api-auth"
import { decideNextAction } from "@/engine/nurture/decide-action"
import { notify, leadName } from "@/engine/notifications/notify"
import { generateAndCacheSummary } from "@/engine/nurture/summarize-lead"
import type { Lead, Message } from "@/types/database"

/** Re-evaluate leads that have gone stale (no activity in STALE_DAYS days)
 *  and whose last AI decision was "wait". */
const STALE_DAYS = 3

async function handler(request: NextRequest) {
  const auth = requireBearerToken(request)
  if (!auth.ok) return auth.response

  const results: Record<string, { processed: number; skipped: number }> = {}

  for (const clientId of await getAllClientIds()) {
    results[clientId] = await followUpForClient(clientId)
  }

  return NextResponse.json(results)
}

async function followUpForClient(clientId: string) {
  const supabase = createServiceClient()
  const config = await getConfig(clientId)

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Find leads with no activity since the cutoff that aren't in terminal stages
  const { data: staleLeads, error } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", config.clientId)
    .lt("updated_at", cutoff)
    .not("stage_id", "in", '("booked","closed")')
    .eq("disqualified", false)
    .eq("opted_out", false)
    .order("updated_at", { ascending: true })
    .limit(20)

  if (error) {
    console.error("Failed to fetch stale leads", { clientId, error })
    return { processed: 0, skipped: 0 }
  }

  if (!staleLeads || staleLeads.length === 0) {
    return { processed: 0, skipped: 0 }
  }

  let processed = 0
  let skipped = 0

  for (const leadRow of staleLeads) {
    const lead = leadRow as Lead

    // Check that the last AI action for this lead was "wait" or has been fully executed
    const { data: lastAction } = await supabase
      .from("ai_actions")
      .select("action_type, status")
      .eq("lead_id", lead.id)
      .eq("client_id", config.clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Skip if there's a pending action waiting for approval
    if (lastAction?.status === "pending") {
      skipped++
      continue
    }

    // Fetch conversation history
    const { data: messagesData } = await supabase
      .from("messages")
      .select("*")
      .eq("lead_id", lead.id)
      .eq("client_id", config.clientId)
      .order("created_at", { ascending: true })

    const messages = (messagesData as Message[]) || []

    try {
      const decision = await decideNextAction({
        lead,
        messages,
        config,
      })

      // If the AI still says wait, just update the lead timestamp so we don't re-check immediately
      if (decision.action === "wait") {
        await supabase
          .from("leads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", lead.id)
        skipped++
        continue
      }

      const status = config.humanApprovalRequired ? "pending" : "approved"

      const { data: actionRow } = await supabase.from("ai_actions").insert({
        client_id: config.clientId,
        lead_id: lead.id,
        action_type: decision.action,
        reasoning: `[Follow-up] ${decision.reasoning}`,
        proposed_content: decision.action === "book_appointment"
          ? JSON.stringify({
              bookingMode: decision.bookingMode,
              requestedTime: decision.requestedTime,
              message: decision.message,
              subject: decision.subject,
            })
          : decision.message || null,
        new_stage_id: decision.newStageId || null,
        status,
      }).select("id").single()

      // Apply score adjustment
      if (decision.scoreAdjustment && decision.scoreAdjustment !== 0) {
        const newScore = Math.max(0, Math.min(100, lead.score + decision.scoreAdjustment))
        await supabase
          .from("leads")
          .update({ score: newScore, updated_at: new Date().toISOString() })
          .eq("id", lead.id)
      }

      if (status === "pending") {
        await notify({
          clientId: config.clientId,
          type: "action_pending",
          title: `Follow-up: AI wants to ${decision.action.replace(/_/g, " ")} for ${leadName(lead)}`,
          body: decision.reasoning,
          leadId: lead.id,
          actionId: actionRow?.id,
        })
      }

      // Refresh summary
      generateAndCacheSummary({ lead, messages, config }).catch((err) => {
        console.error("Background summary generation failed", { leadId: lead.id, error: err })
      })

      processed++
    } catch (e) {
      console.error("Follow-up decision failed", { leadId: lead.id, error: e })
      skipped++
    }
  }

  return { processed, skipped }
}

export { handler as POST }
