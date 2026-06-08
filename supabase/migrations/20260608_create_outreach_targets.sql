-- PropOS Outreach Targets
-- Stores real estate agents we want to pitch PropOS to.
-- Used by the self-demo campaign: PropOS sends personalised SMS to these agents
-- to demonstrate exactly the product they'd be buying.

CREATE TABLE IF NOT EXISTS outreach_targets (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  agency              TEXT NOT NULL,
  phone               TEXT,
  email               TEXT,
  suburb              TEXT,
  state               TEXT DEFAULT 'VIC',
  recent_sale_address TEXT,        -- a real recent sale for personalisation
  years_in_area       INTEGER,
  agency_size_est     INTEGER,     -- estimated agent headcount
  personal_note       TEXT,        -- AI-generated personalisation hook
  source              TEXT DEFAULT 'manual',  -- manual | scraped | referral
  status              TEXT DEFAULT 'new',     -- new | contacted | replied | demo_booked | won | not_interested
  last_contact_date   TIMESTAMPTZ,
  last_message        TEXT,
  reply_body          TEXT,        -- most recent inbound reply
  demo_booked_at      TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Unique on phone so upserts are idempotent
CREATE UNIQUE INDEX IF NOT EXISTS outreach_targets_phone_idx
  ON outreach_targets (phone)
  WHERE phone IS NOT NULL;

-- Unique on email as secondary key
CREATE UNIQUE INDEX IF NOT EXISTS outreach_targets_email_idx
  ON outreach_targets (email)
  WHERE email IS NOT NULL;

-- Index for status-based queries (pipeline view)
CREATE INDEX IF NOT EXISTS outreach_targets_status_idx
  ON outreach_targets (status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_outreach_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS outreach_targets_updated_at ON outreach_targets;
CREATE TRIGGER outreach_targets_updated_at
  BEFORE UPDATE ON outreach_targets
  FOR EACH ROW EXECUTE FUNCTION update_outreach_targets_updated_at();
