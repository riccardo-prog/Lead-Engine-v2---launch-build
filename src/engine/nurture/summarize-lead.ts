import { askClaudeJSON } from "@/engine/ai/claude"
import { createServiceClient } from "@/lib/supabase-server"
import type { Lead, Message, AIAction } from "@/types/database"
import type { ClientConfig } from "@/config/schema"

export type LeadSummary = {
  headline: string
  status: string
  nextAction: string
  temperature: "hot" | "warm" | "cold"
  attentionNeeded: boolean
  attentionReason?: string
  keyMoments: Array<{
    when: string
    what: string
  }>
}

export async function summarizeLead({
  lead,
  messages,
  actions,
  config,
}: {
  lead: Lead
  messages: Message[]
  actions: AIAction[]
  config: ClientConfig
}): Promise<LeadSummary> {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "this lead"
  const stage = config.funnelStages.find((s) => s.id === lead.stage_id)
  const source = config.leadSources.find((s) => s.id === lead.source_id)

  const conversation = messages.slice(-15).map((m) => {
    const dir = m.direction === "inbound" ? "LEAD" : "AI"
    const time = new Date(m.created_at).toLocaleString()
    return `[${time}] ${dir}: ${m.content.slice(0, 500)}`
  }).join("\n\n")

  const actionLog = actions.slice(-10).map((a) => {
    const time = new Date(a.created_at).toLocaleString()
    return `[${time}] ${a.action_type} (${a.status}) — ${a.reasoning}`
  }).join("\n")

  const system = `You are an executive assistant summarizing a lead for a busy business owner. Your job is to save them time — not to narrate everything, but to pull out what actually matters.

You must separate TWO distinct signals:

1. TEMPERATURE — the quality and buying intent of the lead itself.
   - "hot" = strong buying signals, specific criteria, clear intent, ready to move
   - "warm" = some interest, needs nurturing, could go either way
   - "cold" = low intent, early exploration, unqualified, or unresponsive

2. ATTENTION NEEDED — whether the HUMAN OPERATOR needs to step in right now.
   - true = there's a pending approval, the AI flagged something, the conversation is stuck, or a decision only a human should make is required
   - false = AI is handling it properly, no human input needed at this moment

A lead can be HOT but need no attention (AI is responding well). A lead can be COLD but need attention (needs a decision to disqualify). Don't conflate these.

Respond with a JSON object matching this exact shape:
{
  "headline": "One sentence. Who is this lead and what do they want? No filler.",
  "status": "One sentence. Where are they right now in the funnel and what's happening?",
  "nextAction": "One sentence. What happens next — either what the AI is about to do, or what the operator needs to decide.",
  "temperature": "hot" | "warm" | "cold",
  "attentionNeeded": true | false,
  "attentionReason": "string (only include if attentionNeeded is true — a short reason why)",
  "keyMoments": [
    { "when": "relative time like 'yesterday' or '2 hours ago'", "what": "what happened in one short phrase" }
  ]
}

Keep keyMoments to 3-5 items max. Only include genuinely important moments (lead came in, qualification shifted, booking proposed, human escalation). Skip routine acknowledgments and standard follow-ups.`

  const prompt = `LEAD: ${name}
Email: ${lead.email || "none"}
Phone: ${lead.phone || "none"}
Source: ${source?.label || lead.source_id}
Current stage: ${stage?.label || lead.stage_id}
Score: ${lead.score}
Qualified: ${lead.qualified}
Disqualified: ${lead.disqualified}${lead.disqualify_reason ? ` (${lead.disqualify_reason})` : ""}
Tags: ${lead.tags.join(", ") || "none"}

CONVERSATION:
${conversation || "No messages yet."}

AI ACTION HISTORY:
${actionLog || "No actions yet."}

Summarize this lead for the operator.`

  return askClaudeJSON<LeadSummary>({
    system,
    prompt,
    maxTokens: 1500,
  })
}

/**
 * Generate a summary and cache it on the lead row.
 * Fetches actions internally so callers only need lead + messages + config.
 */
export async function generateAndCacheSummary({
  lead,
  messages,
  config,
}: {
  lead: Lead
  messages: Message[]
  config: ClientConfig
}): Promise<LeadSummary> {
  const supabase = createServiceClient()

  const { data: actionsData } = await supabase
    .from("ai_actions")
    .select("*")
    .eq("lead_id", lead.id)
    .eq("client_id", config.clientId)
    .order("created_at", { ascending: false })

  const actions = (actionsData as AIAction[]) || []

  const summary = await summarizeLead({ lead, messages, actions, config })

  await supabase
    .from("leads")
    .update({
      summary,
      summary_updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id)

  return summary
}

/**
 * Clear the cached summary so it regenerates on next view.
 */
export async function invalidateSummary(leadId: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from("leads")
    .update({ summary_updated_at: null })
    .eq("id", leadId)
}