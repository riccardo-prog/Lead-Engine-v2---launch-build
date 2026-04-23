-- Seed client configs into the database.
-- Run this ONCE after running 007_full_client_config.sql.
-- After this, configs are managed via the Settings page — no more code changes needed.

INSERT INTO client_settings (client_id, config, overrides)
VALUES (
  'operate-ai',
  '{
    "clientId": "operate-ai",
    "businessName": "OperateAI",
    "industry": "ai_automation",
    "jurisdiction": "CASL",
    "humanApprovalRequired": true,
    "operatorEmail": "riccardo@operateaihq.com",
    "operatorName": "Riccardo",
    "funnelStages": [
      {"id": "new", "label": "New Lead", "description": "Just came in, no engagement yet", "order": 1, "autoAdvance": false},
      {"id": "engaged", "label": "Engaged", "description": "Replied, chatted with Ora, or showed intent", "order": 2, "autoAdvance": false},
      {"id": "qualified", "label": "Qualified", "description": "Fit confirmed, ready to book", "order": 3, "autoAdvance": false},
      {"id": "booked", "label": "Booked", "description": "Audit call scheduled", "order": 4, "autoAdvance": false},
      {"id": "closed", "label": "Closed", "description": "Deal closed or lost", "order": 5, "autoAdvance": false}
    ],
    "leadSources": [
      {"id": "website-ora", "type": "web_form", "label": "Ora (Website Chat)", "funnelStageOnEntry": "new"},
      {"id": "cold-email-reply", "type": "email_parse", "label": "Cold Email Reply", "funnelStageOnEntry": "new"},
      {"id": "email-inbound", "type": "email_parse", "label": "Inbound Email", "funnelStageOnEntry": "new"},
      {"id": "manual", "type": "manual", "label": "Manual Entry", "funnelStageOnEntry": "new"}
    ],
    "channels": ["email"],
    "emailProvider": "gmail",
    "aiPersona": {
      "name": "Ari",
      "role": "AI business development assistant for OperateAI",
      "tone": "professional",
      "voice": "Direct and confident without being salesy. Talks like someone who builds this stuff, not someone who sells it. Short sentences. No fluff. Asks questions that show you understand their business before pitching anything.",
      "doNotSay": ["guaranteed", "best price", "act now", "limited time", "—", "in just X minutes", "in just X days", "we integrate with", "powered by GPT", "powered by AI"],
      "alwaysSay": []
    },
    "messagingRules": [
      {
        "channel": "email",
        "maxPerDay": 1,
        "allowedHoursStart": 9,
        "allowedHoursEnd": 17,
        "timezone": "America/Toronto",
        "requireOptIn": false
      }
    ],
    "qualification": {
      "requiredFields": ["name", "email"],
      "disqualifyIf": ["competitor", "student_project"],
      "scoreThresholdToBook": 30
    },
    "booking": {
      "provider": "cal.com",
      "url": "https://cal.com/riccardocelebre/free-audit",
      "meetingType": "Free Audit Call",
      "reminderHours": [24, 1]
    },
    "outbound": {
      "socialProof": [
        "One client reduced their lead response time from 4 hours to under 2 minutes",
        "Businesses using automated follow-up see 3-5x more booked calls from the same lead volume"
      ],
      "icpDescription": "AI-powered lead management and automated follow-up for service businesses, agencies, and consultants",
      "requireApproval": true
    },
    "conversationScripts": [
      {
        "leadType": "cold-reply",
        "label": "Cold Email Reply",
        "detection": "Lead source is cold email reply, or first message contains skepticism signals.",
        "channelPreference": "Email only.",
        "steps": [
          "Acknowledge the outreach honestly. Don''t dodge that it was a cold email. Be direct about why you reached out.",
          "One-line value prop grounded in their world. Describe the outcome, not the features.",
          "Ask what they''re currently doing for lead follow-up. Get them talking about their pain.",
          "If pain is real, connect it to what the Lead Engine solves. Still outcomes, not features.",
          "Offer the audit call as a no-pressure look at their current lead flow. Drop the booking link."
        ]
      },
      {
        "leadType": "ora-engaged",
        "label": "Ora Website Chat",
        "detection": "Lead source is website-ora, or lead has had a multi-turn chat via the Ora widget.",
        "channelPreference": "Email only.",
        "steps": [
          "Reference the Ora conversation. Acknowledge they were chatting with the AI on the site.",
          "Ask what caught their attention or what problem they''re trying to solve.",
          "Confirm business type and rough lead volume. Keep it lightweight.",
          "Frame the audit call and drop the booking link.",
          "If they''re a student, competitor, or just exploring, give a friendly close."
        ]
      },
      {
        "leadType": "inbound-inquiry",
        "label": "Inbound Email Inquiry",
        "detection": "Lead source is email-inbound or manual entry. No prior context.",
        "channelPreference": "Email only.",
        "steps": [
          "Thank them for reaching out. Ask what prompted the inquiry.",
          "What kind of business do they run?",
          "How are they handling leads today?",
          "If it''s a fit, frame the audit call and send the booking link.",
          "If they''re asking about something OperateAI doesn''t do, let them know honestly."
        ]
      }
    ]
  }'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (client_id) DO UPDATE SET config = EXCLUDED.config;

INSERT INTO client_settings (client_id, config, overrides)
VALUES (
  'joseph-real-estate',
  '{
    "clientId": "joseph-real-estate",
    "businessName": "Joseph Pavone Real Estate",
    "industry": "real_estate",
    "jurisdiction": "CASL",
    "humanApprovalRequired": true,
    "operatorEmail": "",
    "operatorName": "Joseph",
    "formSourceIds": ["realtor-email"],
    "funnelStages": [
      {"id": "new", "label": "New Lead", "description": "Just came in", "order": 1, "autoAdvance": false},
      {"id": "contacted", "label": "Contacted", "description": "First message sent", "order": 2, "autoAdvance": false},
      {"id": "nurturing", "label": "Nurturing", "description": "Actively in conversation", "order": 3, "autoAdvance": false},
      {"id": "qualified", "label": "Qualified", "description": "Ready to book", "order": 4, "autoAdvance": false},
      {"id": "booked", "label": "Booked", "description": "Appointment set", "order": 5, "autoAdvance": false},
      {"id": "closed", "label": "Closed", "description": "Deal done", "order": 6, "autoAdvance": false}
    ],
    "leadSources": [
      {"id": "realtor-email", "type": "email_parse", "label": "Realtor.ca Email", "funnelStageOnEntry": "new"},
      {"id": "facebook-ad", "type": "meta_ad", "label": "Facebook Ads", "funnelStageOnEntry": "new"},
      {"id": "instagram-dm", "type": "meta_ad", "label": "Instagram DMs", "funnelStageOnEntry": "new"},
      {"id": "facebook-dm", "type": "meta_ad", "label": "Facebook Messenger", "funnelStageOnEntry": "new"},
      {"id": "manual", "type": "manual", "label": "Manual Entry", "funnelStageOnEntry": "new"},
      {"id": "csv", "type": "csv_import", "label": "CSV Import", "funnelStageOnEntry": "new"}
    ],
    "channels": ["email", "sms", "instagram_dm", "facebook_dm"],
    "emailProvider": "outlook",
    "aiPersona": {
      "name": "Alex",
      "role": "Real estate assistant for Joseph Pavone",
      "tone": "friendly",
      "voice": "Warm, knowledgeable, never pushy. Speaks like a trusted advisor not a salesperson.",
      "doNotSay": ["guaranteed", "guaranteed sale", "best price", "act now", "limited time", "no risk", "property values will", "prices will", "return on investment", "ROI of", "you will make", "—"],
      "alwaysSay": []
    },
    "messagingRules": [
      {"channel": "email", "maxPerDay": 1, "allowedHoursStart": 8, "allowedHoursEnd": 20, "timezone": "America/Toronto", "requireOptIn": false},
      {"channel": "sms", "maxPerDay": 1, "allowedHoursStart": 9, "allowedHoursEnd": 20, "timezone": "America/Toronto", "requireOptIn": true},
      {"channel": "facebook_dm", "maxPerDay": 3, "allowedHoursStart": 8, "allowedHoursEnd": 21, "timezone": "America/Toronto", "requireOptIn": false},
      {"channel": "instagram_dm", "maxPerDay": 3, "allowedHoursStart": 8, "allowedHoursEnd": 21, "timezone": "America/Toronto", "requireOptIn": false}
    ],
    "qualification": {
      "requiredFields": ["name", "email", "buying_or_selling", "timeline"],
      "disqualifyIf": ["no_budget", "just_browsing_no_timeline"],
      "scoreThresholdToBook": 70
    },
    "booking": {
      "provider": "cal.com",
      "url": "https://cal.com/joseph",
      "meetingType": "Discovery Call",
      "reminderHours": [24, 1]
    },
    "conversationScripts": [
      {
        "leadType": "seller",
        "label": "Seller",
        "detection": "Lead mentions selling their home, getting a valuation, listing their property.",
        "channelPreference": "Prefer to prompt the lead to call Joseph directly. If resistance, continue over message.",
        "steps": [
          "What is the property address?",
          "How long have you owned the home?",
          "Are you looking to sell or just curious about current market value?",
          "If you did sell, where would you be headed next?",
          "What is your ideal timeline?",
          "On a scale of 1 to 10, how would you rate the condition of the home?",
          "Are there any defects or issues that could prevent the home from selling?",
          "Are you planning on interviewing more than 1 agent?",
          "Are there any properties nearby that you felt were comparable to yours?",
          "Based on those sales, what price were you hoping to achieve?",
          "Any renovations or repairs before listing, or is the property ready to hit the market?",
          "What would be the best day for me to come and take a look at the property? Book via calendar."
        ]
      },
      {
        "leadType": "buyer",
        "label": "Buyer",
        "detection": "Lead mentions buying a home, looking for properties, first-time buyer, house hunting.",
        "channelPreference": "Prefer to prompt the lead to call Joseph directly. If resistance, continue over message.",
        "steps": [
          "Are you a first time home buyer, looking to buy and sell, or invest?",
          "Are you just starting your search or have you been looking for a while?",
          "Are you currently working with an agent? Do you have a signed agreement?",
          "Have you spoken with a mortgage specialist to get pre-approved?",
          "What is encouraging your decision to buy now?",
          "Any properties that have sold recently that you really liked?",
          "What areas are you most interested in? Any areas you would not consider?",
          "Besides price and location, what must the house have?",
          "If we found the perfect house this weekend, are you in a position to move on it?",
          "Would you like me to share some similar and exclusive off-market properties?",
          "Would a 1-on-1 workshop to discuss the buying process be of interest? Book via calendar."
        ]
      },
      {
        "leadType": "investor",
        "label": "Investor",
        "detection": "Lead mentions investment property, rental property, cap rate, ROI, portfolio.",
        "channelPreference": "Prefer to prompt the lead to call Joseph directly. If resistance, continue over message.",
        "steps": [
          "Are you just starting your search or have you been looking for a while?",
          "Are you currently working with an agent? Do you have a signed agreement?",
          "Have you spoken with a mortgage specialist to get pre-approved?",
          "What is encouraging your decision to buy now?",
          "Any properties that have sold recently that you really liked?",
          "What areas are you most interested in? Any areas you would not consider?",
          "Besides price and location, what must the property have?",
          "If we found the perfect property this weekend, are you in a position to move on it?",
          "Would you like me to share some similar and exclusive off-market properties?",
          "I have an investors presentation breaking down best investment locations by cap rate. Interested? Book via calendar."
        ]
      }
    ]
  }'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (client_id) DO UPDATE SET config = EXCLUDED.config;
