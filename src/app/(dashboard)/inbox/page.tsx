import { getConfig, getClientIdFromSession } from "@/lib/config"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { InboxView } from "@/components/inbox/inbox-view"
import type { Lead, AIAction, Message } from "@/types/database"

export default async function InboxPage() {
  const clientId = await getClientIdFromSession()
  const config = await getConfig(clientId)
  const supabase = await createServerSupabaseClient()

  const { data: actions } = await supabase
    .from("ai_actions")
    .select("*")
    .eq("client_id", config.clientId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  const leadIds = Array.from(new Set((actions || []).map((a) => a.lead_id).filter(Boolean)))
  const { data: leads } = leadIds.length
    ? await supabase.from("leads").select("*").in("id", leadIds)
    : { data: [] }

  // Fetch recent messages for each lead so the inbox can show conversation context
  const { data: messages } = leadIds.length
    ? await supabase
        .from("messages")
        .select("*")
        .in("lead_id", leadIds)
        .eq("client_id", config.clientId)
        .order("created_at", { ascending: true })
    : { data: [] }

  const leadMap: Record<string, Lead> = {}
  for (const lead of (leads || []) as Lead[]) {
    leadMap[lead.id] = lead
  }

  // Group messages by lead_id, keep last 10 per lead
  const messagesByLead: Record<string, Message[]> = {}
  for (const msg of (messages || []) as Message[]) {
    if (!messagesByLead[msg.lead_id]) messagesByLead[msg.lead_id] = []
    messagesByLead[msg.lead_id].push(msg)
  }
  for (const leadId in messagesByLead) {
    messagesByLead[leadId] = messagesByLead[leadId].slice(-10)
  }

  return (
    <InboxView
      actions={(actions as AIAction[]) || []}
      leadMap={leadMap}
      messagesByLead={messagesByLead}
      stages={config.funnelStages}
    />
  )
}