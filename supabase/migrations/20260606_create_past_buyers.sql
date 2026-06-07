-- PropOS: Past Buyers table
-- Run this ONCE in Supabase Dashboard → SQL Editor → New Query → Paste → Run

CREATE TABLE IF NOT EXISTS past_buyers (
  id                        bigint       PRIMARY KEY,
  agent_name                text         NOT NULL,
  name                      text         NOT NULL,
  phone                     text,
  email                     text,
  purchase_address          text,
  suburb                    text,
  purchase_date             text,
  purchase_price            bigint,
  deposit                   bigint,
  property_type             text         DEFAULT 'House',
  beds                      int          DEFAULT 0,
  baths                     int          DEFAULT 0,
  land                      int,
  status                    text         DEFAULT 'unknown',
  notes                     text         DEFAULT '',
  last_contact_date         text,
  last_message              text,
  personalisation_hook      text,
  current_estimate_override bigint,
  created_at                timestamptz  DEFAULT now(),
  updated_at                timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_past_buyers_agent ON past_buyers(agent_name);

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_past_buyers_updated_at ON past_buyers;
CREATE TRIGGER trg_past_buyers_updated_at
  BEFORE UPDATE ON past_buyers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE past_buyers ENABLE ROW LEVEL SECURITY;

-- Public read access (PropOS frontend)
DROP POLICY IF EXISTS "past_buyers_public_read" ON past_buyers;
CREATE POLICY "past_buyers_public_read"
  ON past_buyers FOR SELECT USING (true);

-- Service role can write (server-side operations)
DROP POLICY IF EXISTS "past_buyers_service_write" ON past_buyers;
CREATE POLICY "past_buyers_service_write"
  ON past_buyers FOR ALL USING (auth.role() = 'service_role');
