-- Meta integration: add PSID/IGSID to leads for DM routing.
-- Run this in Supabase SQL editor.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_psid text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_igsid text;

-- Partial unique indexes for dedup by PSID/IGSID (only when non-null).
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_client_psid
  ON leads (client_id, meta_psid) WHERE meta_psid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_client_igsid
  ON leads (client_id, meta_igsid) WHERE meta_igsid IS NOT NULL;
