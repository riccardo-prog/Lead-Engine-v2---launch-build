-- Move client configs from static TypeScript files into the database.
-- The `config` column stores the full ClientConfig JSON for each tenant.

ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS config JSONB;
