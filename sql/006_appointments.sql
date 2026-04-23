CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  lead_id UUID NOT NULL REFERENCES leads(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  meeting_type TEXT NOT NULL DEFAULT 'Free Audit Call',
  status TEXT NOT NULL DEFAULT 'scheduled',
  booking_url TEXT,
  cal_booking_uid TEXT,
  notes TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_appointments_client_id ON appointments(client_id);
CREATE INDEX idx_appointments_lead_id ON appointments(lead_id);
CREATE INDEX idx_appointments_cal_uid ON appointments(cal_booking_uid);
