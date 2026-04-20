-- Track lead type (seller/buyer/investor) as determined by the AI during conversation.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON leads (client_id, lead_type);
