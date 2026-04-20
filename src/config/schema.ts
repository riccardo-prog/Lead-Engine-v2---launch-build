export type ComplianceJurisdiction = "CASL" | "TCPA" | "GDPR"

export type ChannelType = "email" | "sms" | "instagram_dm" | "facebook_dm" | "whatsapp"

export type FunnelStage = {
  id: string
  label: string
  description: string
  order: number
  autoAdvance: boolean
}

export type LeadSource = {
  id: string
  type: "web_form" | "meta_ad" | "csv_import" | "email_parse" | "manual" | "api"
  label: string
  funnelStageOnEntry: string
}

export type AIPersona = {
  name: string
  role: string
  tone: "professional" | "friendly" | "casual" | "formal"
  voice: string
  doNotSay: string[]
  alwaysSay: string[]
}

export type MessagingRule = {
  channel: ChannelType
  maxPerDay: number
  allowedHoursStart: number
  allowedHoursEnd: number
  timezone: string
  requireOptIn: boolean
}

export type QualificationCriteria = {
  requiredFields: string[]
  disqualifyIf: string[]
  scoreThresholdToBook: number
}

export type BookingConfig = {
  provider: "cal.com" | "calendly" | "manual"
  url: string
  meetingType: string
  reminderHours: number[]
}

export type ConversationScript = {
  leadType: string
  label: string
  /** How the AI should detect this lead type from context (source, messages, custom fields). */
  detection: string
  /** Preferred communication mode + fallback behavior. */
  channelPreference: string
  /** Ordered list of questions/steps with branching instructions. */
  steps: string[]
}

export type ClientConfig = {
  clientId: string
  businessName: string
  industry: string
  jurisdiction: ComplianceJurisdiction
  funnelStages: FunnelStage[]
  leadSources: LeadSource[]
  channels: ChannelType[]
  aiPersona: AIPersona
  messagingRules: MessagingRule[]
  qualification: QualificationCriteria
  booking: BookingConfig
  conversationScripts: ConversationScript[]
  humanApprovalRequired: boolean
  operatorEmail: string
}