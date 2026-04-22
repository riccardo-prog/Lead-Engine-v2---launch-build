-- Cold outbound engine tables + lead paused_until column.

-- 1. Add paused_until to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ DEFAULT NULL;

-- 1b. Add thread tracking to messages (for Gmail thread continuity)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id TEXT DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS in_reply_to TEXT DEFAULT NULL;

-- 2. Suppression list (shared between outbound and nurture)
CREATE TABLE IF NOT EXISTS suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, email)
);

CREATE INDEX IF NOT EXISTS idx_suppression_client_email ON suppression_list (client_id, email);

-- 3. Sending accounts
CREATE TABLE IF NOT EXISTS outbound_sending_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  connection_id UUID NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 5,
  sends_today INTEGER DEFAULT 0,
  sends_failed_today INTEGER DEFAULT 0,
  last_reset_date DATE,
  paused_until TIMESTAMPTZ,
  pause_reason TEXT,
  warmup_week INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sequences
CREATE TABLE IF NOT EXISTS outbound_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  steps JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Campaigns
CREATE TABLE IF NOT EXISTS outbound_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  sequence_id UUID REFERENCES outbound_sequences(id),
  sending_account_id UUID REFERENCES outbound_sending_accounts(id),
  icp_criteria JSONB,
  icp_threshold INTEGER DEFAULT 40,
  social_proof TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_client_status ON outbound_campaigns (client_id, status);

-- 6. Prospects
CREATE TABLE IF NOT EXISTS outbound_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  campaign_id UUID NOT NULL REFERENCES outbound_campaigns(id),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  title TEXT,
  linkedin_url TEXT,
  website_url TEXT,
  company_description TEXT,
  custom_fields JSONB DEFAULT '{}',
  icp_score INTEGER,
  icp_factors JSONB,
  research_brief TEXT,
  research_confidence TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  current_step INTEGER DEFAULT 0,
  paused_until TIMESTAMPTZ,
  lead_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, email)
);

CREATE INDEX IF NOT EXISTS idx_prospects_campaign ON outbound_prospects (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_prospects_email ON outbound_prospects (client_id, email);

-- 7. Emails
CREATE TABLE IF NOT EXISTS outbound_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id),
  campaign_id UUID NOT NULL REFERENCES outbound_campaigns(id),
  step_order INTEGER NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  send_after TIMESTAMPTZ NOT NULL,
  failure_reason TEXT,
  word_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emails_send_queue ON outbound_emails (status, send_after)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_emails_prospect ON outbound_emails (prospect_id, step_order);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON outbound_emails (gmail_thread_id);

-- 8. Replies
CREATE TABLE IF NOT EXISTS outbound_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  prospect_id UUID NOT NULL REFERENCES outbound_prospects(id),
  campaign_id UUID NOT NULL REFERENCES outbound_campaigns(id),
  email_id UUID REFERENCES outbound_emails(id),
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  content TEXT NOT NULL,
  subject TEXT,
  sentiment TEXT NOT NULL,
  lead_id UUID,
  handed_off BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replies_prospect ON outbound_replies (prospect_id);

-- 9. Index for paused leads wake cron
CREATE INDEX IF NOT EXISTS idx_leads_paused_until ON leads (paused_until)
  WHERE paused_until IS NOT NULL;
