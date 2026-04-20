import { createServiceClient } from "@/lib/supabase-server"

type NotifyParams = {
  clientId: string
  type: "message_sent" | "message_failed" | "ai_failed" | "action_pending" | "booking_confirmed" | "booking_cancelled"
  title: string
  body?: string
  leadId?: string
  actionId?: string
}

export async function notify({
  clientId,
  type,
  title,
  body,
  leadId,
  actionId,
}: NotifyParams): Promise<void> {
  const supabase = createServiceClient()

  const { error } = await supabase.from("notifications").insert({
    client_id: clientId,
    type,
    title,
    body: body || null,
    lead_id: leadId || null,
    action_id: actionId || null,
  })

  if (error) {
    // Never let a notification failure break the main flow.
    console.error("Failed to insert notification", { type, title, error })
  }
}

export function leadName(lead: { first_name: string | null; last_name: string | null }): string {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  return name || "Unknown"
}
