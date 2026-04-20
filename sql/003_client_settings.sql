-- Editable config overrides per client.
-- Stores only the fields the operator has changed; the rest fall through to the static config file.

CREATE TABLE IF NOT EXISTS client_settings (
  client_id TEXT PRIMARY KEY,
  overrides JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_settings ENABLE ROW LEVEL SECURITY;

-- Scope to user's client_id from app_metadata.
-- Set client_id on the user via: supabase auth admin updateUserById(uid, { app_metadata: { client_id: '...' } })
CREATE POLICY "Users can read own client_settings"
  ON client_settings FOR SELECT
  TO authenticated
  USING (client_id = (auth.jwt() -> 'app_metadata' ->> 'client_id'));

CREATE POLICY "Users can insert own client_settings"
  ON client_settings FOR INSERT
  TO authenticated
  WITH CHECK (client_id = (auth.jwt() -> 'app_metadata' ->> 'client_id'));

CREATE POLICY "Users can update own client_settings"
  ON client_settings FOR UPDATE
  TO authenticated
  USING (client_id = (auth.jwt() -> 'app_metadata' ->> 'client_id'));
