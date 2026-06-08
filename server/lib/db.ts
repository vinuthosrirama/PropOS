/**
 * PropOS Database Layer
 *
 * PostgreSQL via `pg` when DATABASE_URL is set.
 * Graceful in-memory fallback when it's not (demo/dev mode).
 *
 * Tables:
 *   conversations  — SMS thread history (replaces in-memory Map)
 *   opt_outs        — SPAM Act 2003 opt-out registry
 *   outreach_log    — every SMS/email sent (for analytics + audit)
 *   nurture_queue   — scheduled follow-up jobs
 *   contacts        — past buyer records (CRM mirror)
 */

import pg from "pg"

const { Pool } = pg

// ── Connection ──────────────────────────────────────────────────────────────

let pool: pg.Pool | null = null

export function getPool(): pg.Pool | null {
  return pool
}

export function isDbConnected(): boolean {
  return pool !== null
}

/**
 * Initialise database connection and run migrations.
 * Call once at server startup. If DATABASE_URL is missing, silently skips
 * and the app falls back to in-memory + Sheets persistence.
 */
export async function initDb(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.log("  Database: not configured (in-memory mode)")
    return
  }

  try {
    pool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis:  5_000,
      statement_timeout:       15_000,  // kill runaway queries — prevents pool starvation
    })

    // Verify connection
    const client = await pool.connect()
    client.release()

    // Run migrations
    await migrate()

    console.log("  Database: connected (PostgreSQL)")
  } catch (err) {
    console.warn("  Database: connection failed, falling back to in-memory", (err as Error).message)
    pool = null
  }
}

// ── Schema Migration ────────────────────────────────────────────────────────

async function migrate(): Promise<void> {
  if (!pool) return

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      phone           TEXT PRIMARY KEY,
      lead_id         TEXT NOT NULL DEFAULT '',
      lead_name       TEXT NOT NULL DEFAULT '',
      property_address TEXT NOT NULL DEFAULT '',
      email           TEXT NOT NULL DEFAULT '',
      messages        JSONB NOT NULL DEFAULT '[]',
      last_reply_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      unread          BOOLEAN NOT NULL DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS opt_outs (
      identifier      TEXT PRIMARY KEY,
      type            TEXT NOT NULL CHECK (type IN ('sms', 'email', 'all')),
      source          TEXT NOT NULL CHECK (source IN ('reply', 'link', 'manual')),
      timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS outreach_log (
      id              SERIAL PRIMARY KEY,
      agent_id        TEXT NOT NULL DEFAULT 'default',
      contact_phone   TEXT,
      contact_email   TEXT,
      contact_name    TEXT NOT NULL DEFAULT '',
      channel         TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'both')),
      sms_body        TEXT,
      email_subject   TEXT,
      email_body      TEXT,
      status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'opened', 'clicked', 'replied')),
      pipeline        TEXT,
      property_address TEXT,
      sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      opened_at       TIMESTAMPTZ,
      replied_at      TIMESTAMPTZ,
      metadata        JSONB DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS nurture_queue (
      id              SERIAL PRIMARY KEY,
      agent_id        TEXT NOT NULL DEFAULT 'default',
      contact_phone   TEXT NOT NULL,
      contact_name    TEXT NOT NULL DEFAULT '',
      contact_email   TEXT NOT NULL DEFAULT '',
      property_address TEXT NOT NULL DEFAULT '',
      pipeline        TEXT,
      step            INTEGER NOT NULL DEFAULT 0,
      scheduled_at    TIMESTAMPTZ NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'cancelled', 'failed')),
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_error      TEXT,
      context         JSONB DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id              SERIAL PRIMARY KEY,
      agent_id        TEXT NOT NULL DEFAULT 'default',
      name            TEXT NOT NULL,
      phone           TEXT,
      email           TEXT,
      purchase_address TEXT,
      purchase_date   DATE,
      purchase_price  NUMERIC,
      deposit         NUMERIC,
      property_type   TEXT,
      beds            INTEGER,
      baths           INTEGER,
      land            NUMERIC,
      status          TEXT DEFAULT 'unknown',
      notes           TEXT,
      last_contact_date DATE,
      pipeline        TEXT,
      priority_score  INTEGER,
      current_estimate NUMERIC,
      source          TEXT DEFAULT 'manual',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agents (
      id                  SERIAL PRIMARY KEY,
      email               TEXT UNIQUE NOT NULL,
      name                TEXT NOT NULL DEFAULT '',
      agency              TEXT NOT NULL DEFAULT '',
      phone               TEXT,
      tagline             TEXT,
      suburb              TEXT,
      role                TEXT NOT NULL DEFAULT 'agent',
      office_id           INTEGER,
      password_hash       TEXT,
      stripe_customer_id  TEXT,
      subscription_status TEXT NOT NULL DEFAULT 'trialing',
      trial_ends_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id               SERIAL PRIMARY KEY,
      agent_id         INTEGER NOT NULL,
      contact_phone    TEXT NOT NULL,
      contact_name     TEXT NOT NULL DEFAULT '',
      type             TEXT NOT NULL CHECK (type IN ('appraisal_booked','listing_won')),
      property_address TEXT,
      listing_price    INTEGER,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Live installs: add columns that may be missing from older schema versions
    -- MUST run before the UNIQUE constraint below (which references agent_id)
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS agent_id          TEXT NOT NULL DEFAULT 'default';
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pipeline          TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority_score    INTEGER;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS current_estimate  NUMERIC;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source            TEXT DEFAULT 'manual';
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes             TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contact_date DATE;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'unknown';
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS purchase_address  TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS purchase_date     DATE;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS purchase_price    NUMERIC;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS deposit           NUMERIC;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS property_type     TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS beds              INTEGER;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS baths             INTEGER;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS land              NUMERIC;

    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_id          TEXT NOT NULL DEFAULT '';
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_name        TEXT NOT NULL DEFAULT '';
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS property_address TEXT NOT NULL DEFAULT '';
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS email            TEXT NOT NULL DEFAULT '';
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread           BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS contact_name    TEXT NOT NULL DEFAULT '';
    ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS contact_email   TEXT NOT NULL DEFAULT '';
    ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS property_address TEXT NOT NULL DEFAULT '';
    ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS pipeline        TEXT;
    ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS attempts        INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS last_error      TEXT;
    ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS context         JSONB DEFAULT '{}';
    ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS pipeline         TEXT;
    ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS property_address TEXT;
    ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS metadata         JSONB DEFAULT '{}';
    ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS opened_at        TIMESTAMPTZ;
    ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS replied_at       TIMESTAMPTZ;

    -- Unique constraint so CSV re-import is idempotent
    DO $$ BEGIN
      BEGIN
        ALTER TABLE contacts ADD CONSTRAINT contacts_agent_address_unique UNIQUE (agent_id, purchase_address);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END $$;

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_outreach_agent       ON outreach_log(agent_id);
    CREATE INDEX IF NOT EXISTS idx_outreach_phone       ON outreach_log(contact_phone);
    CREATE INDEX IF NOT EXISTS idx_outreach_sent_at     ON outreach_log(sent_at);
    CREATE INDEX IF NOT EXISTS idx_nurture_status       ON nurture_queue(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_nurture_phone        ON nurture_queue(contact_phone);
    CREATE INDEX IF NOT EXISTS idx_contacts_agent       ON contacts(agent_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_pipeline    ON contacts(agent_id, pipeline);
    CREATE INDEX IF NOT EXISTS idx_milestones_agent     ON milestones(agent_id);
    -- Inbox badge: fast unread count
    CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(unread) WHERE unread = true;
    -- Inbox list: fast sort by recency
    CREATE INDEX IF NOT EXISTS idx_conversations_ts     ON conversations(last_reply_at DESC);

    -- PT-H3: token_version counter — increment on logout to invalidate outstanding refresh tokens
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

    -- Live installs: widen nurture_queue status constraint to include 'sending'.
    -- The scheduler sets status='sending' to lock jobs; without this the check fails.
    DO $$ BEGIN
      ALTER TABLE nurture_queue DROP CONSTRAINT IF EXISTS nurture_queue_status_check;
      ALTER TABLE nurture_queue ADD CONSTRAINT nurture_queue_status_check
        CHECK (status IN ('pending', 'sending', 'sent', 'cancelled', 'failed'));
    EXCEPTION WHEN others THEN NULL;
    END $$;

    -- ── Data retention (Privacy Act APP 11 / GDPR Art. 5(1)(e)) ──────────────
    -- outreach_log: message bodies contain PII — keep 90 days for analytics,
    -- then redact bodies (keep metadata for funnel counts).
    -- conversations: full SMS threads kept 12 months from last reply.
    -- nurture_queue: completed jobs pruned after 90 days.
    -- These are idempotent — safe to re-run on every startup.
    UPDATE outreach_log
      SET sms_body = '[redacted]', email_body = '[redacted]', email_subject = '[redacted]'
      WHERE sent_at < NOW() - INTERVAL '90 days'
        AND sms_body IS DISTINCT FROM '[redacted]';
    DELETE FROM conversations
      WHERE last_reply_at < NOW() - INTERVAL '365 days';
    DELETE FROM nurture_queue
      WHERE status IN ('sent', 'cancelled', 'failed')
        AND updated_at < NOW() - INTERVAL '90 days';

    -- ── PropOS self-demo outreach targets (boutique RE agents we are pitching) ──
    CREATE TABLE IF NOT EXISTS outreach_targets (
      id                  SERIAL PRIMARY KEY,
      name                TEXT NOT NULL,
      agency              TEXT NOT NULL,
      phone               TEXT,
      email               TEXT,
      suburb              TEXT,
      state               TEXT DEFAULT 'VIC',
      recent_sale_address TEXT,
      years_in_area       INTEGER,
      agency_size_est     INTEGER,
      personal_note       TEXT,
      sms_script          TEXT,
      source              TEXT DEFAULT 'manual',
      status              TEXT NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new','contacted','replied','demo_booked','won','not_interested')),
      last_contact_date   TIMESTAMPTZ,
      last_message        TEXT,
      reply_body          TEXT,
      demo_booked_at      TIMESTAMPTZ,
      notes               TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS outreach_targets_phone_idx ON outreach_targets(phone) WHERE phone IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS outreach_targets_email_idx ON outreach_targets(email) WHERE email IS NOT NULL;
    CREATE INDEX        IF NOT EXISTS outreach_targets_status_idx ON outreach_targets(status);

    -- AI-generated reply drafts awaiting Vinuth's approval before sending
    CREATE TABLE IF NOT EXISTS outreach_drafts (
      id           SERIAL PRIMARY KEY,
      target_id    INTEGER NOT NULL,
      inbound_body TEXT NOT NULL DEFAULT '',
      draft_body   TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','sent')),
      sent_at      TIMESTAMPTZ,
      edited_body  TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS outreach_drafts_target_idx ON outreach_drafts(target_id);
    CREATE INDEX IF NOT EXISTS outreach_drafts_status_idx ON outreach_drafts(status);

    -- ── Self-hosted iOS Shortcut relay (Method 2 — free TextingBlue replacement) ──
    -- shortcut_devices: one row per registered iPhone
    CREATE TABLE IF NOT EXISTS shortcut_devices (
      device_id   TEXT PRIMARY KEY,
      phone       TEXT NOT NULL,
      label       TEXT,
      last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- shortcut_queue: outbound messages waiting for the Shortcut to pick up
    CREATE TABLE IF NOT EXISTS shortcut_queue (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      device_id   TEXT NOT NULL,
      to_phone    TEXT NOT NULL,
      body        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','claimed','sent','failed')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      claimed_at  TIMESTAMPTZ,
      sent_at     TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS shortcut_queue_device ON shortcut_queue(device_id, status, created_at);

    -- Prune sent/failed shortcut queue entries older than 7 days
    DELETE FROM shortcut_queue
      WHERE status IN ('sent','failed')
        AND created_at < NOW() - INTERVAL '7 days';
  `)
}

// ── Query helpers ───────────────────────────────────────────────────────────

/** Run a parameterised query. Returns rows or empty array if DB not connected. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  if (!pool) return []
  const result = await pool.query(sql, params)
  return result.rows as T[]
}

/** Run a parameterised query and return the first row, or null. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

/** Run an INSERT/UPDATE/DELETE and return the number of affected rows. */
export async function execute(sql: string, params?: unknown[]): Promise<number> {
  if (!pool) return 0
  const result = await pool.query(sql, params)
  return result.rowCount ?? 0
}

// ── Outreach logging ────────────────────────────────────────────────────────

export interface OutreachLogEntry {
  agentId?: string
  contactPhone?: string
  contactEmail?: string
  contactName: string
  channel: "sms" | "email" | "both"
  smsBody?: string
  emailSubject?: string
  emailBody?: string
  status?: string
  pipeline?: string
  propertyAddress?: string
  metadata?: Record<string, unknown>
}

export async function logOutreach(entry: OutreachLogEntry): Promise<number> {
  if (!pool) return 0
  const rows = await query<{ id: number }>(
    `INSERT INTO outreach_log (agent_id, contact_phone, contact_email, contact_name, channel, sms_body, email_subject, email_body, status, pipeline, property_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      entry.agentId ?? "default",
      entry.contactPhone,
      entry.contactEmail,
      entry.contactName,
      entry.channel,
      entry.smsBody,
      entry.emailSubject,
      entry.emailBody,
      entry.status ?? "sent",
      entry.pipeline,
      entry.propertyAddress,
      JSON.stringify(entry.metadata ?? {}),
    ],
  )
  return rows[0]?.id ?? 0
}

export async function updateOutreachStatus(
  id: number,
  status: string,
  timestamp?: string,
): Promise<void> {
  if (!pool) return
  const col = status === "opened" ? "opened_at" : status === "replied" ? "replied_at" : null
  if (col) {
    await execute(
      `UPDATE outreach_log SET status = $1, ${col} = $2 WHERE id = $3`,
      [status, timestamp ?? new Date().toISOString(), id],
    )
  } else {
    await execute(`UPDATE outreach_log SET status = $1 WHERE id = $2`, [status, id])
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
