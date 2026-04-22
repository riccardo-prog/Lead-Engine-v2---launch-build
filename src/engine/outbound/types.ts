// src/engine/outbound/types.ts

export type SequenceStep = {
  stepOrder: number
  dayOffset: number
  stance: string
  prompt: string
  maxWords: number
}

export type ProspectStatus =
  | "pending"
  | "sending"
  | "replied"
  | "paused"
  | "opted_out"
  | "completed"
  | "bounced"
  | "failed"
  | "suppressed"

export type CampaignStatus = "draft" | "active" | "paused" | "completed"

export type OutboundEmailStatus = "pending" | "sent" | "failed" | "bounced"

export type SentimentResult = "reply_to_continue" | "reply_to_pause" | "reply_to_stop"

export type SuppressionReason = "opted_out" | "bounced" | "complained" | "manual"

export type SuppressionSource = "outbound_reply" | "lead_engine" | "manual_import"

export type PauseReason = "bounce_rate_exceeded" | "gmail_api_error" | "rate_limited" | "manual"

export type ResearchConfidence = "HIGH" | "MEDIUM" | "LOW"

export type OutboundCampaign = {
  id: string
  client_id: string
  name: string
  status: CampaignStatus
  sequence_id: string
  sending_account_id: string
  icp_criteria: Record<string, unknown> | null
  icp_threshold: number
  social_proof: string[] | null
  created_at: string
  updated_at: string
}

export type OutboundSequence = {
  id: string
  client_id: string
  name: string
  steps: SequenceStep[]
  created_at: string
}

export type OutboundProspect = {
  id: string
  client_id: string
  campaign_id: string
  email: string
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  linkedin_url: string | null
  website_url: string | null
  company_description: string | null
  custom_fields: Record<string, unknown>
  icp_score: number | null
  icp_factors: Record<string, unknown> | null
  research_brief: string | null
  research_confidence: ResearchConfidence | null
  status: ProspectStatus
  current_step: number
  paused_until: string | null
  lead_id: string | null
  created_at: string
  updated_at: string
}

export type OutboundEmail = {
  id: string
  client_id: string
  prospect_id: string
  campaign_id: string
  step_order: number
  subject: string
  body: string
  gmail_message_id: string | null
  gmail_thread_id: string | null
  status: OutboundEmailStatus
  sent_at: string | null
  send_after: string
  failure_reason: string | null
  word_count: number | null
  created_at: string
}

export type OutboundReply = {
  id: string
  client_id: string
  prospect_id: string
  campaign_id: string
  email_id: string
  gmail_message_id: string | null
  gmail_thread_id: string | null
  content: string
  subject: string | null
  sentiment: SentimentResult
  lead_id: string | null
  handed_off: boolean
  created_at: string
}

export type OutboundSendingAccount = {
  id: string
  client_id: string
  connection_id: string
  from_name: string
  from_email: string
  daily_limit: number
  sends_today: number
  sends_failed_today: number
  last_reset_date: string | null
  paused_until: string | null
  pause_reason: PauseReason | null
  warmup_week: number
  created_at: string
  updated_at: string
}

export type SuppressionEntry = {
  id: string
  client_id: string
  email: string
  reason: SuppressionReason
  source: SuppressionSource
  created_at: string
}

export type IcpScoreResult = {
  score: number
  factors: {
    company_fit: { score: number; reason: string }
    role_fit: { score: number; reason: string }
    industry_fit: { score: number; reason: string }
  }
  summary: string
}

export type SentimentClassification = {
  sentiment: SentimentResult
  reasoning: string
}
