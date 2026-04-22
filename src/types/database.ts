export type Lead = {
  id: string
  client_id: string
  created_at: string
  updated_at: string

  // Identity
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null

  // Funnel
  stage_id: string
  source_id: string
  score: number
  lead_type: "seller" | "buyer" | "investor" | null

  // Qualification
  qualified: boolean
  disqualified: boolean
  disqualify_reason: string | null

  // AI summary (cached)
  summary: {
    temperature?: "hot" | "warm" | "cold"
    [key: string]: unknown
  } | null

  // Metadata
  custom_fields: Record<string, unknown>
  tags: string[]
  opted_in_sms: boolean
  opted_in_email: boolean
  opted_out: boolean
  opted_out_at: string | null

  // Pause (outbound handoff or manual)
  paused_until: string | null

  // Meta DM routing
  meta_psid: string | null
  meta_igsid: string | null
}

export type Message = {
  id: string
  client_id: string
  lead_id: string
  created_at: string

  channel: "email" | "sms" | "instagram_dm" | "facebook_dm" | "whatsapp"
  direction: "inbound" | "outbound"
  content: string
  subject: string | null

  // AI
  ai_generated: boolean
  ai_reasoning: string | null
  approved: boolean
  approved_at: string | null
  approved_by: string | null

  // Delivery
  sent: boolean
  sent_at: string | null
  delivered: boolean
  opened: boolean
  replied: boolean

  external_id: string | null
  thread_id: string | null
  in_reply_to: string | null
  scheduled_for: string | null
  scheduled_reason: string | null
  send_attempts: number
  send_failed: boolean
  send_failure_reason: string | null
}

export type Appointment = {
  id: string
  client_id: string
  lead_id: string
  created_at: string

  scheduled_at: string
  duration_minutes: number
  meeting_type: string
  status: "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show"
  booking_url: string | null
  notes: string | null
  reminder_sent: boolean
}

export type Notification = {
  id: string
  client_id: string
  type: "message_sent" | "message_failed" | "ai_failed" | "action_pending" | "booking_confirmed" | "booking_cancelled"
  title: string
  body: string | null
  lead_id: string | null
  action_id: string | null
  read_at: string | null
  created_at: string
}

export type AIAction = {
  id: string
  client_id: string
  lead_id: string
  created_at: string

  action_type: "send_message" | "send_outbound" | "advance_stage" | "book_appointment" | "disqualify" | "flag_human"
  reasoning: string
  proposed_content: string | null
  new_stage_id: string | null
  status: "pending" | "approved" | "rejected" | "executed"
  executed_at: string | null
}