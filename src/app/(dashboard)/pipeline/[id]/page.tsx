import { getConfig } from "@/lib/config"
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase-server"
import { summarizeLead, type LeadSummary } from "@/engine/nurture/summarize-lead"
import { LeadDetailView } from "@/components/pipeline/lead-detail-view"
import { notFound } from "next/navigation"
import type { Lead, Message, AIAction } from "@/types/database"

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const config = await getConfig()
  const supabase = await createServerSupabaseClient()

  const { data: leadData } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("client_id", config.clientId)
    .single()

  if (!leadData) notFound()

  const lead = leadData as Lead & {
    summary: LeadSummary | null
    summary_updated_at: string | null
  }

  const { data: messagesData } = await supabase
    .from("messages")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: true })

  const { data: actionsData } = await supabase
    .from("ai_actions")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })

  const messages = (messagesData as Message[]) || []
  const actions = (actionsData as AIAction[]) || []

  const summary = await getOrGenerateSummary({
    lead,
    messages,
    actions,
    config,
  })

  return (
    <LeadDetailView
      lead={lead}
      messages={messages}
      actions={actions}
      summary={summary}
      stages={config.funnelStages}
      sources={config.leadSources}
    />
  )
}

async function getOrGenerateSummary({
  lead,
  messages,
  actions,
  config,
}: {
  lead: Lead & { summary: LeadSummary | null; summary_updated_at: string | null }
  messages: Message[]
  actions: AIAction[]
  config: Awaited<ReturnType<typeof getConfig>>
}): Promise<LeadSummary | null> {
  const cachedAt = lead.summary_updated_at ? new Date(lead.summary_updated_at).getTime() : 0
  const latestMessageAt = messages.length
    ? new Date(messages[messages.length - 1].created_at).getTime()
    : 0
  const latestActionAt = actions.length
    ? new Date(actions[0].created_at).getTime()
    : 0
  const latestActivity = Math.max(latestMessageAt, latestActionAt)

  // Cache hit: summary exists AND nothing has happened since it was generated.
  if (lead.summary && cachedAt >= latestActivity) {
    return lead.summary
  }

  try {
    const fresh = await summarizeLead({ lead, messages, actions, config })
    const service = createServiceClient()
    await service
      .from("leads")
      .update({
        summary: fresh,
        summary_updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
    return fresh
  } catch (e) {
    console.error("Failed to generate lead summary", { leadId: lead.id, error: e })
    // Fall back to stale cache if we have it, otherwise null
    return lead.summary || null
  }
}