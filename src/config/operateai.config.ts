import { ClientConfig } from "./schema"

export const operateaiConfig: ClientConfig = {
  clientId: "operate-ai",
  businessName: "OperateAI",
  industry: "ai_automation",
  jurisdiction: "CASL",
  humanApprovalRequired: true,
  operatorEmail: process.env.OPERATEAI_OPERATOR_EMAIL || "",
  operatorName: "Riccardo",

  funnelStages: [
    { id: "new", label: "New Lead", description: "Just came in, no engagement yet", order: 1, autoAdvance: false },
    { id: "engaged", label: "Engaged", description: "Replied, chatted with Ora, or showed intent", order: 2, autoAdvance: false },
    { id: "qualified", label: "Qualified", description: "Fit confirmed, ready to book", order: 3, autoAdvance: false },
    { id: "booked", label: "Booked", description: "Audit call scheduled", order: 4, autoAdvance: false },
    { id: "closed", label: "Closed", description: "Deal closed or lost", order: 5, autoAdvance: false },
  ],

  leadSources: [
    { id: "website-ora", type: "web_form", label: "Ora (Website Chat)", funnelStageOnEntry: "new" },
    { id: "cold-email-reply", type: "email_parse", label: "Cold Email Reply", funnelStageOnEntry: "new" },
    { id: "email-inbound", type: "email_parse", label: "Inbound Email", funnelStageOnEntry: "new" },
    { id: "manual", type: "manual", label: "Manual Entry", funnelStageOnEntry: "new" },
  ],

  channels: ["email"],

  aiPersona: {
    name: "Ari",
    role: "AI business development assistant for OperateAI",
    tone: "professional",
    voice: "Direct and confident without being salesy. Talks like someone who builds this stuff, not someone who sells it. Short sentences. No fluff. Asks questions that show you understand their business before pitching anything.",
    doNotSay: ["guaranteed", "best price", "act now", "limited time", "—", "in just X minutes", "in just X days", "we integrate with", "powered by GPT", "powered by AI"],
    alwaysSay: [],
  },

  messagingRules: [
    {
      channel: "email",
      maxPerDay: 1,
      allowedHoursStart: 9,
      allowedHoursEnd: 17,
      timezone: "America/Toronto",
      requireOptIn: false,
    },
  ],

  qualification: {
    requiredFields: ["name", "email"],
    disqualifyIf: ["competitor", "student_project"],
    scoreThresholdToBook: 30,
  },

  booking: {
    provider: "cal.com",
    url: process.env.OPERATEAI_BOOKING_URL || "",
    meetingType: "Free Audit Call",
    reminderHours: [24, 1],
  },

  conversationScripts: [
    {
      leadType: "cold-reply",
      label: "Cold Email Reply",
      detection: "Lead source is cold email reply, or first message contains skepticism signals (asking 'is this real?', 'how did you get my email?', 'what is this?', or general wariness about the outreach).",
      channelPreference: "Email only.",
      steps: [
        "Acknowledge the outreach honestly. Don't dodge that it was a cold email. Be direct about why you reached out, tied to their business type.",
        "One-line value prop grounded in their world. What does their day look like when leads fall through the cracks? Describe the outcome, not the features.",
        "Ask what they're currently doing for lead follow-up. Get them talking about their pain, not your product.",
        "If pain is real, connect it to what the Lead Engine solves. Still outcomes, not features. No jargon.",
        "Offer the audit call as a no-pressure look at their current lead flow. Frame it as 'we look at what you have and tell you where the gaps are.' Drop the booking link. If not interested, respect it and leave the door open.",
      ],
    },
    {
      leadType: "ora-engaged",
      label: "Ora Website Chat",
      detection: "Lead source is website-ora, or lead has had a multi-turn chat via the Ora widget on operateai.ca. They've already experienced the product.",
      channelPreference: "Email only.",
      steps: [
        "Reference the Ora conversation. They were just chatting with the AI on the site, so acknowledge that. 'You were just talking to our AI' is the natural opener.",
        "Ask what caught their attention or what problem they're trying to solve. They came to the site for a reason.",
        "Confirm business type and rough lead volume. Keep it lightweight, not an interrogation.",
        "Frame the audit call. 'We'll look at your current lead flow and show you exactly where this plugs in.' Drop the booking link.",
        "If they're a student, competitor, or just exploring AI generally, give a friendly close and don't push.",
      ],
    },
    {
      leadType: "inbound-inquiry",
      label: "Inbound Email Inquiry",
      detection: "Lead source is email-inbound or manual entry. No prior Ora conversation, no cold email context. Could be referral, organic, or someone who found OperateAI on their own.",
      channelPreference: "Email only.",
      steps: [
        "Thank them for reaching out. Ask what prompted the inquiry. You know nothing about them yet.",
        "What kind of business do they run? This determines whether they're a fit.",
        "How are they handling leads today? This surfaces pain and gives you context for the call.",
        "If it's a fit, frame the audit call and send the booking link. If unclear fit, ask one more qualifying question before offering the call.",
        "If they're asking about something OperateAI doesn't do (website design, social media management, etc.), let them know honestly and close gracefully.",
      ],
    },
  ],
}
