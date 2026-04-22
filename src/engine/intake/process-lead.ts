import { createServiceClient } from "@/lib/supabase-server"
import { decideNextAction } from "@/engine/nurture/decide-action"
import { normalizePhone } from "@/engine/intake/realtor-parser"
import { notify, leadName } from "@/engine/notifications/notify"
import { generateAndCacheSummary } from "@/engine/nurture/summarize-lead"
import type { ClientConfig } from "@/config/schema"
import type { Lead, Message } from "@/types/database"

export type IntakePayload = {
  sourceId: string
  clientId?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  metaPsid?: string
  metaIgsid?: string
  initialMessage?: {
    channel: "email" | "sms" | "instagram_dm" | "facebook_dm" | "whatsapp"
    content: string
    subject?: string
    externalId?: string
    threadId?: string
    inReplyTo?: string
  }
  customFields?: Record<string, unknown>
  tags?: string[]
}

export type IntakeResult = {
  leadId: string
  isNew: boolean
  decisionQueued: boolean
  error?: string
}

export async function processIntake({
  payload,
  config,
}: {
  payload: IntakePayload
  config: ClientConfig
}): Promise<IntakeResult> {
  const supabase = createServiceClient()

  const source = config.leadSources.find((s) => s.id === payload.sourceId)
  if (!source) {
    return {
      leadId: "",
      isNew: false,
      decisionQueued: false,
      error: `Unknown source: ${payload.sourceId}`,
    }
  }

  const existingLead = await findExistingLead(supabase, config.clientId, payload)

  let lead: Lead
  let isNew = false

  if (existingLead) {
    lead = existingLead
    const updates: Partial<Lead> = {
      updated_at: new Date().toISOString(),
    }
    if (payload.firstName && !lead.first_name) updates.first_name = payload.firstName
    if (payload.lastName && !lead.last_name) updates.last_name = payload.lastName
    if (payload.email && !lead.email) updates.email = payload.email
    if (payload.phone && !lead.phone) updates.phone = payload.phone
    if (payload.metaPsid && !lead.meta_psid) updates.meta_psid = payload.metaPsid
    if (payload.metaIgsid && !lead.meta_igsid) updates.meta_igsid = payload.metaIgsid

    if (Object.keys(updates).length > 1) {
      await supabase.from("leads").update(updates).eq("id", lead.id)
      lead = { ...lead, ...updates } as Lead
    }
  } else {
    const newLead = {
      client_id: config.clientId,
      first_name: payload.firstName || null,
      last_name: payload.lastName || null,
      email: payload.email || null,
      phone: payload.phone ? normalizePhone(payload.phone) : null,
      meta_psid: payload.metaPsid || null,
      meta_igsid: payload.metaIgsid || null,
      source_id: payload.sourceId,
      stage_id: source.funnelStageOnEntry,
      score: computeInitialScore(payload),
      custom_fields: payload.customFields || {},
      tags: payload.tags || [],
    }

    const { data, error } = await supabase
      .from("leads")
      .insert(newLead)
      .select()
      .single()

    if (error) {
      // Race condition: another concurrent intake created this lead between our
      // find and our insert. Retry the find — the unique constraint raised 23505.
      if (error.code === "23505") {
        const retried = await findExistingLead(supabase, config.clientId, payload)
        if (retried) {
          lead = retried
        } else {
          return {
            leadId: "",
            isNew: false,
            decisionQueued: false,
            error: `Conflict but retry failed: ${error.message}`,
          }
        }
      } else {
        return {
          leadId: "",
          isNew: false,
          decisionQueued: false,
          error: error.message,
        }
      }
    } else if (!data) {
      return {
        leadId: "",
        isNew: false,
        decisionQueued: false,
        error: "Failed to create lead",
      }
    } else {
      lead = data as Lead
      isNew = true
    }
  }

  if (payload.initialMessage) {
    // Upsert against the unique (client_id, external_id) index so duplicate
    // polls don't create duplicate messages.
    const insertPayload = {
      client_id: config.clientId,
      lead_id: lead.id,
      channel: payload.initialMessage.channel,
      direction: "inbound",
      content: payload.initialMessage.content,
      subject: payload.initialMessage.subject || null,
      external_id: payload.initialMessage.externalId || null,
    }

    const { error: msgError } = await supabase.from("messages").insert(insertPayload)
    if (msgError && msgError.code !== "23505") {
      // Don't abort intake on a message insert failure — log and continue.
      console.error("Failed to insert inbound message", msgError)
    }
  }

  const { data: messagesData } = await supabase
    .from("messages")
    .select("*")
    .eq("client_id", config.clientId)
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: true })

  const messages = (messagesData as Message[]) || []

  try {
    const decision = await decideNextAction({
      lead,
      messages,
      config,
    })

    const status = config.humanApprovalRequired ? "pending" : "approved"

    const { data: actionRow } = await supabase.from("ai_actions").insert({
      client_id: config.clientId,
      lead_id: lead.id,
      action_type: decision.action,
      reasoning: decision.reasoning,
      proposed_content: decision.action === "book_appointment"
        ? JSON.stringify({
            bookingMode: decision.bookingMode,
            requestedTime: decision.requestedTime,
            message: decision.message,
            subject: decision.subject,
          })
        : decision.message || null,
      status,
    }).select("id").single()

    // Apply score adjustment if the AI suggested one
    if (decision.scoreAdjustment && decision.scoreAdjustment !== 0) {
      const newScore = Math.max(0, Math.min(100, lead.score + decision.scoreAdjustment))
      await supabase
        .from("leads")
        .update({ score: newScore, updated_at: new Date().toISOString() })
        .eq("id", lead.id)
      lead = { ...lead, score: newScore }
    }

    // Store lead type if the AI identified one
    if (decision.leadType) {
      await supabase
        .from("leads")
        .update({ lead_type: decision.leadType, updated_at: new Date().toISOString() })
        .eq("id", lead.id)
    }

    if (status === "pending") {
      await notify({
        clientId: config.clientId,
        type: "action_pending",
        title: `AI wants to ${decision.action.replace(/_/g, " ")} for ${leadName(lead)}`,
        body: decision.reasoning,
        leadId: lead.id,
        actionId: actionRow?.id,
      })
    }

    // Fire-and-forget: generate AI summary so pipeline list has temperature data
    generateAndCacheSummary({ lead, messages, config }).catch((err) => {
      console.error("Background summary generation failed", { leadId: lead.id, error: err })
    })

    return {
      leadId: lead.id,
      isNew,
      decisionQueued: true,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    await supabase.from("ai_actions").insert({
      client_id: config.clientId,
      lead_id: lead.id,
      action_type: "flag_human",
      reasoning: `AI decision failed: ${message}`,
      status: "pending",
    })

    await notify({
      clientId: config.clientId,
      type: "ai_failed",
      title: `AI couldn't process ${leadName(lead)}`,
      body: message,
      leadId: lead.id,
    })

    return {
      leadId: lead.id,
      isNew,
      decisionQueued: false,
      error: message,
    }
  }
}

/** Base score from what we know at intake — so leads don't all start at 0. */
function computeInitialScore(payload: IntakePayload): number {
  let score = 10 // showed up = 10
  if (payload.email) score += 10
  if (payload.phone) score += 10
  if (payload.firstName) score += 5
  if (payload.initialMessage?.content) {
    score += 10 // sent a real message
    const msg = payload.initialMessage.content.toLowerCase()
    // High-intent keywords
    if (/\b(buy|purchase|looking to buy|interested in buying)\b/.test(msg)) score += 10
    if (/\b(sell|selling|list my|what.s .* worth|home value)\b/.test(msg)) score += 10
    if (/\b(invest|rental|cash flow|roi)\b/.test(msg)) score += 5
    if (/\b(urgent|asap|as soon as possible|right away|immediately)\b/.test(msg)) score += 5
    if (/\b(pre.?approv|mortgage|financ)\b/.test(msg)) score += 10
  }
  return Math.min(score, 80) // cap so AI adjustments still matter
}

async function findExistingLead(
  supabase: ReturnType<typeof createServiceClient>,
  clientId: string,
  payload: IntakePayload
): Promise<Lead | null> {
  if (payload.email) {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("client_id", clientId)
      .eq("email", payload.email.toLowerCase())
      .maybeSingle()
    if (data) return data as Lead
  }

  if (payload.phone) {
    const normalizedPhone = normalizePhone(payload.phone)
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("client_id", clientId)
      .eq("phone", normalizedPhone)
      .maybeSingle()
    if (data) return data as Lead
  }

  if (payload.metaPsid) {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("client_id", clientId)
      .eq("meta_psid", payload.metaPsid)
      .maybeSingle()
    if (data) return data as Lead
  }

  if (payload.metaIgsid) {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("client_id", clientId)
      .eq("meta_igsid", payload.metaIgsid)
      .maybeSingle()
    if (data) return data as Lead
  }

  return null
}