import { askClaudeJSON } from "@/engine/ai/claude"
import { getMessagingWindowStatus } from "@/engine/messaging/meta-graph"
import type { Lead, Message } from "@/types/database"
import type { ClientConfig } from "@/config/schema"

export type NurtureDecision = {
  action: "send_message" | "advance_stage" | "book_appointment" | "disqualify" | "wait" | "flag_human"
  reasoning: string
  channel?: "email" | "sms" | "instagram_dm" | "facebook_dm" | "whatsapp"
  message?: string
  subject?: string
  newStageId?: string
  scoreAdjustment?: number
  leadType?: "seller" | "buyer" | "investor"
  waitUntil?: string
  flagReason?: string
  bookingMode?: "specific_time" | "send_link"
  requestedTime?: string // ISO 8601
}

export type OperatorFeedback = {
  previousProposal: string | null
  feedback: string
}

export async function decideNextAction({
  lead,
  messages,
  config,
  operatorFeedback,
}: {
  lead: Lead
  messages: Message[]
  config: ClientConfig
  operatorFeedback?: OperatorFeedback
}): Promise<NurtureDecision> {
  const system = buildSystemPrompt(config)
  const prompt = await buildDecisionPrompt(lead, messages, config, operatorFeedback)

  return askClaudeJSON<NurtureDecision>({
    system,
    prompt,
    maxTokens: 2000,
  })
}

function buildSystemPrompt(config: ClientConfig): string {
  const { aiPersona, businessName, jurisdiction } = config

  return `You are ${aiPersona.name}, an AI assistant working on behalf of ${businessName}.

IDENTITY RULES (CRITICAL):
- You are ${aiPersona.name}. You are NOT the business owner.
- You speak ON BEHALF OF the business owner, never AS them.
- Use phrases like "I can check with the team" or "let me coordinate the schedule" — never "I'm flexible" or "my availability" as if you were the owner.
- Sign every message as "${aiPersona.name}" — never with the owner's name.
- If asked "who is this", say you're ${aiPersona.name}, assistant to ${businessName}.
- Your role: ${aiPersona.role}

FORM SUBMISSION VS REAL MESSAGE (CRITICAL):
Some leads come from form submissions (like Realtor.ca) where the "message" in the conversation history is actually structured form data or a template message, NOT something the lead personally wrote.
- When source is 'realtor-email' or similar form sources, the first inbound "message" is form data, not a personal message from the lead.
- DO NOT respond as if they wrote to you personally. Instead, craft an initial outreach that references the specific property they inquired about, introduces yourself, and asks relevant questions to qualify them.
- Use any custom fields like property_address, listing_number to make the message feel personal and informed.
- Avoid phrases like "thanks for your message" or "as you mentioned" since they didn't actually message you — they filled out a form.

TONE AND VOICE:
- Tone: ${aiPersona.tone}
- Voice: ${aiPersona.voice}
${aiPersona.doNotSay.length > 0 ? `- Never say: ${aiPersona.doNotSay.join(", ")}` : ""}
${aiPersona.alwaysSay.length > 0 ? `- Always include: ${aiPersona.alwaysSay.join(", ")}` : ""}

COMPLIANCE (${jurisdiction}):
${complianceRules(jurisdiction)}

AVAILABLE ACTIONS:
- send_message: Draft and send a message on an approved channel
- advance_stage: Move the lead to a new funnel stage
- book_appointment: Move lead toward booking (only if qualified). Two modes:
  * "specific_time" — lead asked for a specific time. Set bookingMode to "specific_time" and requestedTime to the ISO 8601 datetime.
  * "send_link" — lead is ready to book but no specific time. Set bookingMode to "send_link". Include {{booking_url}} in the message where the booking link should go.
  Booking URL: ${config.booking.url}
  Meeting type: ${config.booking.meetingType}
- disqualify: Mark lead as not a fit
- wait: No action needed right now, check back later
- flag_human: Escalate to the human operator

FUNNEL STAGES:
${config.funnelStages
  .sort((a, b) => a.order - b.order)
  .map((s) => `- ${s.id}: ${s.label} (${s.description})`)
  .join("\n")}

QUALIFICATION CRITERIA:
- Required fields before booking: ${config.qualification.requiredFields.join(", ")}
- Disqualifiers: ${config.qualification.disqualifyIf.join(", ")}
- Score threshold to book: ${config.qualification.scoreThresholdToBook}

CONVERSATION SCRIPTS:
You must follow these qualification scripts based on the lead type. Determine the lead type from their messages, source, and context, then follow the appropriate script.

IMPORTANT RULES FOR ALL SCRIPTS:
- Ask ONE question at a time. Never dump multiple questions in a single message.
- Track which questions have already been answered from prior messages — don't re-ask.
- The preferred approach is to prompt the lead to call Joseph directly to go through these questions over the phone. If they resist or prefer text/email, continue over message.
- Follow the branching logic in each step (e.g., buyer who wants to buy & sell → switch to seller script).
- When a step says "prompt booking calendar", use the book_appointment action with bookingMode "send_link".

${config.conversationScripts.map((script) => `--- ${script.label} Script ---
Lead type detection: ${script.detection}
Channel preference: ${script.channelPreference}
Steps:
${script.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`).join("\n")}

DECISION PRINCIPLES:
1. Match the lead's energy — don't be pushy with cold leads, don't be slow with hot ones
2. Never send a message that violates compliance rules
3. If you've sent a message recently and they haven't replied, wait longer before following up
4. If a lead is ready to book (qualified + warm), move them to book_appointment
5. If a lead is clearly not a fit, disqualify them rather than wasting cycles
6. When uncertain, flag_human — it's better to escalate than to make a bad call

RESPONSE FORMAT:
Respond with a JSON object matching this shape:
{
  "action": "send_message" | "advance_stage" | "book_appointment" | "disqualify" | "wait" | "flag_human",
  "reasoning": "string - explain your decision clearly, 1-3 sentences",
  "channel": "email" | "sms" | "instagram_dm" | "facebook_dm" | "whatsapp" (only if action is send_message),
  "message": "string - the message body (only if action is send_message)",
  "subject": "string - email subject (only if channel is email)",
  "newStageId": "string - the stage id to advance to (only if action is advance_stage)",
  "scoreAdjustment": number (optional, -30 to +30 — use larger values for clear buying/selling signals),
  "leadType": "seller" | "buyer" | "investor" (optional — set this once you can determine it from context),
  "flagReason": "string (only if action is flag_human)",
  "bookingMode": "specific_time" | "send_link" (only if action is book_appointment),
  "requestedTime": "ISO 8601 datetime (only if bookingMode is specific_time)"
}`
}

function complianceRules(jurisdiction: string): string {
  if (jurisdiction === "CASL") {
    return `- CASL (Canada): Every message must identify the sender, include an unsubscribe option, and respect explicit or implicit consent.
- Never message someone who has opted out.
- Business emails (B2B) are allowed without express consent if there's a clear business purpose.
- SMS requires express written consent.`
  }
  if (jurisdiction === "TCPA") {
    return `- TCPA (US): SMS and autodial calls require prior express written consent.
- Email is governed by CAN-SPAM: include sender info, honor opt-outs, no deceptive subject lines.
- Never message someone who has opted out.`
  }
  if (jurisdiction === "GDPR") {
    return `- GDPR (EU): Marketing messages require opt-in consent.
- Every message must include a clear unsubscribe.
- Never message someone who has opted out or withdrawn consent.`
  }
  return "- Follow general best practices for permission-based marketing."
}

async function buildDecisionPrompt(
  lead: Lead,
  messages: Message[],
  config: ClientConfig,
  operatorFeedback?: OperatorFeedback
): Promise<string> {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown"
  const stage = config.funnelStages.find((s) => s.id === lead.stage_id)
  const source = config.leadSources.find((s) => s.id === lead.source_id)

  const recentMessages = messages.slice(-10).map((m) => {
    const dir = m.direction === "inbound" ? "LEAD" : "US"
    const time = new Date(m.created_at).toISOString()
    return `[${time}] ${dir} (${m.channel}): ${m.content}`
  }).join("\n")

  const lastMessage = messages[messages.length - 1]
  const hoursSinceLastMessage = lastMessage
    ? (Date.now() - new Date(lastMessage.created_at).getTime()) / 1000 / 3600
    : null

  const isFormSubmission = lead.source_id === "realtor-email" && messages.length <= 1

  // Check 24h messaging windows for DM channels
  let fbWindowLabel = "not available"
  let igWindowLabel = "not available"

  if (lead.meta_psid) {
    const fbWindow = await getMessagingWindowStatus({ leadId: lead.id, channel: "facebook_dm", clientId: config.clientId })
    if (fbWindow.hoursSinceLastInbound !== null) {
      const hours = fbWindow.hoursSinceLastInbound
      fbWindowLabel = fbWindow.open
        ? `open (last reply ${formatHours(hours)} ago)`
        : `closed (last reply ${formatHours(hours)} ago)`
    } else {
      fbWindowLabel = "available (no messages yet — window opens on first inbound)"
    }
  }

  if (lead.meta_igsid) {
    const igWindow = await getMessagingWindowStatus({ leadId: lead.id, channel: "instagram_dm", clientId: config.clientId })
    if (igWindow.hoursSinceLastInbound !== null) {
      const hours = igWindow.hoursSinceLastInbound
      igWindowLabel = igWindow.open
        ? `open (last reply ${formatHours(hours)} ago)`
        : `closed (last reply ${formatHours(hours)} ago)`
    } else {
      igWindowLabel = "available (no messages yet — window opens on first inbound)"
    }
  }

  const feedbackBlock = operatorFeedback
    ? (() => {
        const sanitized = (operatorFeedback.feedback || "").slice(0, 1000).replace(/[""]/g, "'")
        const prevProposal = (operatorFeedback.previousProposal || "(no content)").slice(0, 2000)
        return `

⚠️ OPERATOR FEEDBACK ON PREVIOUS ATTEMPT:
Previous proposal: "${prevProposal}"
The operator REJECTED this and provided feedback: "${sanitized}"

You MUST incorporate this feedback. Do not repeat the same mistakes. Adjust the message or action accordingly.`
      })()
    : ""

  return `LEAD PROFILE:
- Name: ${name}
- Email: ${lead.email || "none"}
- Phone: ${lead.phone || "none"}
- Current stage: ${stage?.label || lead.stage_id}
- Source: ${source?.label || lead.source_id}
- Score: ${lead.score}
- Lead type: ${(lead as Record<string, unknown>).lead_type || "unknown — determine from conversation if possible"}
- Qualified: ${lead.qualified}
- Disqualified: ${lead.disqualified}${lead.disqualify_reason ? ` (${lead.disqualify_reason})` : ""}
- Facebook Messenger: ${fbWindowLabel}
- Instagram DM: ${igWindowLabel}
- Opted in to email: ${lead.opted_in_email}
- Opted in to SMS: ${lead.opted_in_sms}
- Opted out entirely: ${lead.opted_out}
- Tags: ${lead.tags.join(", ") || "none"}
- Custom fields: ${JSON.stringify(lead.custom_fields)}

${isFormSubmission ? "⚠️ FORM SUBMISSION: This is a Realtor.ca form inquiry, not a personal message. Craft an initial outreach referencing the specific property in custom_fields. Do NOT respond as if they wrote you a message." : ""}
${feedbackBlock}

CONVERSATION HISTORY (last 10 messages):
${recentMessages || "No messages yet."}

TIMING:
- Hours since last message: ${hoursSinceLastMessage?.toFixed(1) || "N/A (no messages yet)"}

TASK:
Decide the single best next action for this lead. Return your decision as JSON.`
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 24) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}