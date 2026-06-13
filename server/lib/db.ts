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
//
// Each step runs in its own pool.query() so one failure never blocks the rest.
// Every step logs [migrate] OK <label> or [migrate] FAIL <label>: <error>
// — paste Railway logs into the issue tracker to see exactly what broke.

async function migrate(): Promise<void> {
  if (!pool) return

  const steps: Array<[string, string]> = [

    // ── Phase 1: Create tables (IF NOT EXISTS — safe on fresh and live installs)

    ["CREATE conversations", `
      CREATE TABLE IF NOT EXISTS conversations (
        phone            TEXT PRIMARY KEY,
        lead_id          TEXT NOT NULL DEFAULT '',
        lead_name        TEXT NOT NULL DEFAULT '',
        property_address TEXT NOT NULL DEFAULT '',
        email            TEXT NOT NULL DEFAULT '',
        messages         JSONB NOT NULL DEFAULT '[]',
        last_reply_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        unread           BOOLEAN NOT NULL DEFAULT FALSE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE opt_outs", `
      CREATE TABLE IF NOT EXISTS opt_outs (
        identifier TEXT PRIMARY KEY,
        type       TEXT NOT NULL CHECK (type IN ('sms', 'email', 'all')),
        source     TEXT NOT NULL CHECK (source IN ('reply', 'link', 'manual')),
        timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE outreach_log", `
      CREATE TABLE IF NOT EXISTS outreach_log (
        id               SERIAL PRIMARY KEY,
        agent_id         TEXT NOT NULL DEFAULT 'default',
        contact_phone    TEXT,
        contact_email    TEXT,
        contact_name     TEXT NOT NULL DEFAULT '',
        channel          TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'both')),
        sms_body         TEXT,
        email_subject    TEXT,
        email_body       TEXT,
        status           TEXT NOT NULL DEFAULT 'sent'
                         CHECK (status IN ('sent','delivered','failed','opened','clicked','replied')),
        pipeline         TEXT,
        property_address TEXT,
        sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        opened_at        TIMESTAMPTZ,
        replied_at       TIMESTAMPTZ,
        metadata         JSONB DEFAULT '{}'
      )`],

    ["CREATE nurture_queue", `
      CREATE TABLE IF NOT EXISTS nurture_queue (
        id               SERIAL PRIMARY KEY,
        agent_id         TEXT NOT NULL DEFAULT 'default',
        contact_phone    TEXT NOT NULL,
        contact_name     TEXT NOT NULL DEFAULT '',
        contact_email    TEXT NOT NULL DEFAULT '',
        property_address TEXT NOT NULL DEFAULT '',
        pipeline         TEXT,
        step             INTEGER NOT NULL DEFAULT 0,
        scheduled_at     TIMESTAMPTZ NOT NULL,
        status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','sending','sent','cancelled','failed')),
        attempts         INTEGER NOT NULL DEFAULT 0,
        last_error       TEXT,
        context          JSONB DEFAULT '{}',
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE contacts", `
      CREATE TABLE IF NOT EXISTS contacts (
        id                SERIAL PRIMARY KEY,
        agent_id          TEXT NOT NULL DEFAULT 'default',
        name              TEXT NOT NULL,
        phone             TEXT,
        email             TEXT,
        purchase_address  TEXT,
        purchase_date     DATE,
        purchase_price    NUMERIC,
        deposit           NUMERIC,
        property_type     TEXT,
        beds              INTEGER,
        baths             INTEGER,
        land              NUMERIC,
        status            TEXT DEFAULT 'unknown',
        notes             TEXT,
        last_contact_date DATE,
        pipeline          TEXT,
        priority_score    INTEGER,
        current_estimate  NUMERIC,
        source            TEXT DEFAULT 'manual',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE agents", `
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
      )`],

    ["CREATE milestones", `
      CREATE TABLE IF NOT EXISTS milestones (
        id               SERIAL PRIMARY KEY,
        agent_id         INTEGER NOT NULL,
        contact_phone    TEXT NOT NULL,
        contact_name     TEXT NOT NULL DEFAULT '',
        type             TEXT NOT NULL CHECK (type IN ('appraisal_booked','listing_won')),
        property_address TEXT,
        listing_price    INTEGER,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE outreach_targets", `
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
      )`],

    ["CREATE outreach_drafts", `
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
      )`],

    ["CREATE shortcut_devices", `
      CREATE TABLE IF NOT EXISTS shortcut_devices (
        device_id  TEXT PRIMARY KEY,
        phone      TEXT NOT NULL,
        label      TEXT,
        last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE agent_state", `
      CREATE TABLE IF NOT EXISTS agent_state (
        agent_id   TEXT NOT NULL,
        key        TEXT NOT NULL,
        value      JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (agent_id, key)
      )`],

    ["CREATE shortcut_queue", `
      CREATE TABLE IF NOT EXISTS shortcut_queue (
        id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        device_id  TEXT NOT NULL,
        to_phone   TEXT NOT NULL,
        body       TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','claimed','sent','failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        claimed_at TIMESTAMPTZ,
        sent_at    TIMESTAMPTZ
      )`],

    // ── Phase 2: Add columns missing from pre-existing tables
    //    Each is a separate query so one missing column doesn't block the rest.
    //    All idempotent — ADD COLUMN IF NOT EXISTS is a no-op if column exists.

    ["ALTER contacts: agent_id",          `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS agent_id          TEXT NOT NULL DEFAULT 'default'`],
    ["ALTER contacts: pipeline",          `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pipeline          TEXT`],
    ["ALTER contacts: priority_score",    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority_score    INTEGER`],
    ["ALTER contacts: current_estimate",  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS current_estimate  NUMERIC`],
    ["ALTER contacts: source",            `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source            TEXT DEFAULT 'manual'`],
    ["ALTER contacts: notes",             `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes             TEXT`],
    ["ALTER contacts: last_contact_date", `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contact_date DATE`],
    ["ALTER contacts: status",            `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'unknown'`],
    ["ALTER contacts: updated_at",        `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()`],
    ["ALTER contacts: purchase_address",  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS purchase_address  TEXT`],
    ["ALTER contacts: purchase_date",     `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS purchase_date     DATE`],
    ["ALTER contacts: purchase_price",    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS purchase_price    NUMERIC`],
    ["ALTER contacts: deposit",           `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS deposit           NUMERIC`],
    ["ALTER contacts: property_type",     `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS property_type     TEXT`],
    ["ALTER contacts: beds",              `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS beds              INTEGER`],
    ["ALTER contacts: baths",             `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS baths             INTEGER`],
    ["ALTER contacts: land",              `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS land              NUMERIC`],

    ["ALTER conversations: lead_id",          `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_id          TEXT NOT NULL DEFAULT ''`],
    ["ALTER conversations: lead_name",        `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_name        TEXT NOT NULL DEFAULT ''`],
    ["ALTER conversations: property_address", `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS property_address TEXT NOT NULL DEFAULT ''`],
    ["ALTER conversations: email",            `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS email            TEXT NOT NULL DEFAULT ''`],
    ["ALTER conversations: unread",           `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread           BOOLEAN NOT NULL DEFAULT FALSE`],
    ["ALTER conversations: updated_at",       `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()`],

    ["ALTER nurture_queue: contact_name",     `ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS contact_name     TEXT NOT NULL DEFAULT ''`],
    ["ALTER nurture_queue: contact_email",    `ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS contact_email    TEXT NOT NULL DEFAULT ''`],
    ["ALTER nurture_queue: property_address", `ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS property_address TEXT NOT NULL DEFAULT ''`],
    ["ALTER nurture_queue: pipeline",         `ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS pipeline         TEXT`],
    ["ALTER nurture_queue: attempts",         `ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS attempts         INTEGER NOT NULL DEFAULT 0`],
    ["ALTER nurture_queue: last_error",       `ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS last_error       TEXT`],
    ["ALTER nurture_queue: context",          `ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS context          JSONB DEFAULT '{}'`],
    ["ALTER nurture_queue: updated_at",       `ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()`],
    ["ALTER nurture_queue: agent_id",         `ALTER TABLE nurture_queue ADD COLUMN IF NOT EXISTS agent_id         TEXT NOT NULL DEFAULT 'default'`],

    ["ALTER outreach_log: agent_id",          `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS agent_id         TEXT NOT NULL DEFAULT 'default'`],
    ["ALTER outreach_log: contact_phone",     `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS contact_phone    TEXT`],
    ["ALTER outreach_log: contact_email",     `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS contact_email    TEXT`],
    ["ALTER outreach_log: contact_name",      `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS contact_name     TEXT NOT NULL DEFAULT ''`],
    ["ALTER outreach_log: sms_body",          `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS sms_body         TEXT`],
    ["ALTER outreach_log: email_subject",     `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS email_subject    TEXT`],
    ["ALTER outreach_log: email_body",        `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS email_body       TEXT`],
    ["ALTER outreach_log: status",            `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'sent'`],
    ["ALTER outreach_log: pipeline",          `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS pipeline         TEXT`],
    ["ALTER outreach_log: property_address",  `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS property_address TEXT`],
    ["ALTER outreach_log: metadata",          `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS metadata         JSONB DEFAULT '{}'`],
    ["ALTER outreach_log: opened_at",         `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS opened_at        TIMESTAMPTZ`],
    ["ALTER outreach_log: replied_at",        `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS replied_at       TIMESTAMPTZ`],

    ["ALTER agents: token_version",           `ALTER TABLE agents ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`],

    ["ALTER milestones: agent_id",            `ALTER TABLE milestones ADD COLUMN IF NOT EXISTS agent_id INTEGER`],

    // ── Phase 3: Constraints (wrapped in DO $$ EXCEPTION — safe to re-run)

    ["CONSTRAINT contacts_agent_address_unique", `
      DO $$ BEGIN
        ALTER TABLE contacts ADD CONSTRAINT contacts_agent_address_unique UNIQUE (agent_id, purchase_address);
      EXCEPTION WHEN others THEN NULL;
      END $$`],

    ["CONSTRAINT nurture_queue_status_check", `
      DO $$ BEGIN
        ALTER TABLE nurture_queue DROP CONSTRAINT IF EXISTS nurture_queue_status_check;
        ALTER TABLE nurture_queue ADD CONSTRAINT nurture_queue_status_check
          CHECK (status IN ('pending','sending','sent','cancelled','failed'));
      EXCEPTION WHEN others THEN NULL;
      END $$`],

    ["CONSTRAINT pitches_status_check", `
      DO $$ BEGIN
        ALTER TABLE pitches DROP CONSTRAINT IF EXISTS pitches_status_check;
        ALTER TABLE pitches ADD CONSTRAINT pitches_status_check
          CHECK (status IN ('draft','sent','viewed','accepted'));
      EXCEPTION WHEN others THEN NULL;
      END $$`],

    ["CONSTRAINT pitches_type_check", `
      DO $$ BEGIN
        ALTER TABLE pitches DROP CONSTRAINT IF EXISTS pitches_type_check;
        ALTER TABLE pitches ADD CONSTRAINT pitches_type_check
          CHECK (type IN ('price_update','digital_intro','listing_proposal','appraisal','vendor_report'));
      EXCEPTION WHEN others THEN NULL;
      END $$`],

    // ── Phase 4: Indexes (IF NOT EXISTS — safe to re-run)

    ["INDEX idx_outreach_agent",       `CREATE INDEX IF NOT EXISTS idx_outreach_agent       ON outreach_log(agent_id)`],
    ["INDEX idx_outreach_phone",       `CREATE INDEX IF NOT EXISTS idx_outreach_phone       ON outreach_log(contact_phone)`],
    ["INDEX idx_outreach_sent_at",     `CREATE INDEX IF NOT EXISTS idx_outreach_sent_at     ON outreach_log(sent_at)`],
    ["INDEX idx_nurture_status",       `CREATE INDEX IF NOT EXISTS idx_nurture_status       ON nurture_queue(status, scheduled_at)`],
    ["INDEX idx_nurture_phone",        `CREATE INDEX IF NOT EXISTS idx_nurture_phone        ON nurture_queue(contact_phone)`],
    ["INDEX idx_contacts_agent",       `CREATE INDEX IF NOT EXISTS idx_contacts_agent       ON contacts(agent_id)`],
    ["INDEX idx_contacts_pipeline",    `CREATE INDEX IF NOT EXISTS idx_contacts_pipeline    ON contacts(agent_id, pipeline)`],
    ["INDEX idx_milestones_agent",     `CREATE INDEX IF NOT EXISTS idx_milestones_agent     ON milestones(agent_id)`],
    ["INDEX idx_conversations_unread", `CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(unread) WHERE unread = true`],
    ["INDEX idx_conversations_ts",     `CREATE INDEX IF NOT EXISTS idx_conversations_ts     ON conversations(last_reply_at DESC)`],
    ["INDEX outreach_targets_phone",   `CREATE UNIQUE INDEX IF NOT EXISTS outreach_targets_phone_idx ON outreach_targets(phone) WHERE phone IS NOT NULL`],
    ["INDEX outreach_targets_email",   `CREATE UNIQUE INDEX IF NOT EXISTS outreach_targets_email_idx ON outreach_targets(email) WHERE email IS NOT NULL`],
    ["INDEX outreach_targets_status",  `CREATE INDEX        IF NOT EXISTS outreach_targets_status_idx ON outreach_targets(status)`],
    ["INDEX outreach_drafts_target",   `CREATE INDEX IF NOT EXISTS outreach_drafts_target_idx ON outreach_drafts(target_id)`],
    ["INDEX outreach_drafts_status",   `CREATE INDEX IF NOT EXISTS outreach_drafts_status_idx ON outreach_drafts(status)`],
    ["INDEX shortcut_queue_device",    `CREATE INDEX IF NOT EXISTS shortcut_queue_device ON shortcut_queue(device_id, status, created_at)`],

    // ── Phase 5a: Prompt optimisation tables (medallion architecture — silver layer)

    ["CREATE prompt_versions", `
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id             SERIAL PRIMARY KEY,
        context        TEXT NOT NULL,
        prompt_text    TEXT NOT NULL,
        is_active      BOOLEAN NOT NULL DEFAULT TRUE,
        perf_snapshot  JSONB DEFAULT '{}',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE prompt_evaluations", `
      CREATE TABLE IF NOT EXISTS prompt_evaluations (
        id             SERIAL PRIMARY KEY,
        version_id     INTEGER NOT NULL,
        signal         TEXT NOT NULL CHECK (signal IN ('approved','rejected','edited','replied','demo_booked')),
        signal_weight  INTEGER NOT NULL DEFAULT 1,
        metadata       JSONB DEFAULT '{}',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["ALTER outreach_drafts: version_id", `ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS version_id INTEGER`],

    ["INDEX prompt_versions_context", `CREATE INDEX IF NOT EXISTS prompt_versions_context ON prompt_versions(context, is_active)`],
    ["INDEX prompt_evals_version",    `CREATE INDEX IF NOT EXISTS prompt_evals_version    ON prompt_evaluations(version_id, created_at)`],

    // ── Phase 5b: Gold layer views (auto-refresh on every query — no REFRESH needed)

    ["VIEW v_outreach_funnel", `
      CREATE OR REPLACE VIEW v_outreach_funnel AS
      SELECT
        COUNT(*) FILTER (WHERE status = 'new')                                      AS total_new,
        COUNT(*) FILTER (WHERE status = 'contacted')                                AS total_contacted,
        COUNT(*) FILTER (WHERE status = 'replied')                                  AS total_replied,
        COUNT(*) FILTER (WHERE status = 'demo_booked')                              AS total_demo_booked,
        COUNT(*) FILTER (WHERE status = 'won')                                      AS total_won,
        COUNT(*) FILTER (WHERE status = 'not_interested')                           AS total_not_interested,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE status IN ('replied','demo_booked','won'))
          / NULLIF(COUNT(*) FILTER (WHERE status != 'new'), 0),
        1) AS reply_rate_pct
      FROM outreach_targets`],

    ["VIEW v_prompt_performance", `
      CREATE OR REPLACE VIEW v_prompt_performance AS
      SELECT
        pv.id,
        pv.context,
        pv.is_active,
        pv.created_at,
        COUNT(pe.id)                                        AS eval_count,
        COALESCE(SUM(pe.signal_weight), 0)                 AS weighted_score,
        ROUND(AVG(pe.signal_weight::numeric), 2)           AS avg_signal,
        COUNT(*) FILTER (WHERE pe.signal = 'approved')     AS approvals,
        COUNT(*) FILTER (WHERE pe.signal = 'rejected')     AS rejections,
        COUNT(*) FILTER (WHERE pe.signal = 'edited')       AS edits,
        COUNT(*) FILTER (WHERE pe.signal = 'demo_booked')  AS demos
      FROM prompt_versions pv
      LEFT JOIN prompt_evaluations pe ON pe.version_id = pv.id
      GROUP BY pv.id, pv.context, pv.is_active, pv.created_at`],

    // ── Phase 5c: Pitch Suite (price updates, digital intros, listing proposals)

    ["CREATE pitches", `
      CREATE TABLE IF NOT EXISTS pitches (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type             TEXT NOT NULL CHECK (type IN ('price_update','digital_intro','listing_proposal')),
        slug             TEXT NOT NULL UNIQUE,
        agent_id         TEXT NOT NULL,
        lead_id          TEXT,
        property_ref     TEXT,
        payload_json     JSONB NOT NULL DEFAULT '{}',
        status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed')),
        view_count       INTEGER NOT NULL DEFAULT 0,
        first_viewed_at  TIMESTAMPTZ,
        last_viewed_at   TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        regenerated_at   TIMESTAMPTZ
      )`],

    ["INDEX pitches_slug",     `CREATE UNIQUE INDEX IF NOT EXISTS pitches_slug_idx     ON pitches(slug)`],
    ["INDEX pitches_agent",    `CREATE INDEX        IF NOT EXISTS pitches_agent_idx    ON pitches(agent_id, created_at DESC)`],
    ["INDEX pitches_lead",     `CREATE INDEX        IF NOT EXISTS pitches_lead_idx     ON pitches(lead_id)`],

    ["VIEW v_pitch_views", `
      CREATE OR REPLACE VIEW v_pitch_views AS
      SELECT
        agent_id,
        COUNT(*)                                              AS total_pitches,
        COUNT(*) FILTER (WHERE status = 'sent')               AS total_sent,
        COUNT(*) FILTER (WHERE status = 'viewed')             AS total_viewed,
        COUNT(*) FILTER (WHERE first_viewed_at >= NOW() - INTERVAL '24 hours') AS viewed_last_24h,
        COALESCE(SUM(view_count), 0)                          AS total_views
      FROM pitches
      GROUP BY agent_id`],

    ["CREATE vendor_reports", `
      CREATE TABLE IF NOT EXISTS vendor_reports (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pitch_id     UUID REFERENCES pitches(id) ON DELETE CASCADE,
        agent_id     TEXT NOT NULL,
        week_number  INTEGER NOT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}',
        html_body    TEXT,
        status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','failed')),
        sent_at      TIMESTAMPTZ,
        error_msg    TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(pitch_id, week_number)
      )`],

    ["INDEX idx_vendor_reports_agent", `CREATE INDEX IF NOT EXISTS idx_vendor_reports_agent ON vendor_reports(agent_id)`],
    ["INDEX idx_vendor_reports_pitch", `CREATE INDEX IF NOT EXISTS idx_vendor_reports_pitch ON vendor_reports(pitch_id)`],

    // ── Phase 6: System key-value store (gmail inbound watermark, misc state)

    ["CREATE system_kv", `
      CREATE TABLE IF NOT EXISTS system_kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["ALTER outreach_log: transport", `ALTER TABLE outreach_log ADD COLUMN IF NOT EXISTS transport TEXT`],

    // ── Pitches suite additions (acceptance + vendor/appraisal columns)
    ["ALTER pitches: accepted_at",      `ALTER TABLE pitches ADD COLUMN IF NOT EXISTS accepted_at      TIMESTAMPTZ`],
    ["ALTER pitches: accepted_by",      `ALTER TABLE pitches ADD COLUMN IF NOT EXISTS accepted_by      TEXT`],
    ["ALTER pitches: accepted_ip",      `ALTER TABLE pitches ADD COLUMN IF NOT EXISTS accepted_ip      TEXT`],
    ["ALTER pitches: acceptance_token", `ALTER TABLE pitches ADD COLUMN IF NOT EXISTS acceptance_token TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT`],
    ["ALTER pitches: vendor_email",     `ALTER TABLE pitches ADD COLUMN IF NOT EXISTS vendor_email     TEXT`],
    ["ALTER pitches: vendor_name",      `ALTER TABLE pitches ADD COLUMN IF NOT EXISTS vendor_name      TEXT`],

    // ── Phase 7: Data maintenance (retention / pruning — safe, idempotent)

    ["PRUNE outreach_log PII >90d", `
      UPDATE outreach_log
        SET sms_body = '[redacted]', email_body = '[redacted]', email_subject = '[redacted]'
        WHERE sent_at < NOW() - INTERVAL '90 days'
          AND sms_body IS DISTINCT FROM '[redacted]'`],

    ["PRUNE conversations >365d", `
      DELETE FROM conversations WHERE last_reply_at < NOW() - INTERVAL '365 days'`],

    ["PRUNE nurture_queue >90d", `
      DELETE FROM nurture_queue
        WHERE status IN ('sent','cancelled','failed')
          AND updated_at < NOW() - INTERVAL '90 days'`],

    ["PRUNE shortcut_queue >7d", `
      DELETE FROM shortcut_queue
        WHERE status IN ('sent','failed')
          AND created_at < NOW() - INTERVAL '7 days'`],

    // ── Phase 8: Conversational SMS Agent (Stages 1-4 — see docs/SMS_AGENT.md)

    ["CREATE voice_profiles", `
      CREATE TABLE IF NOT EXISTS voice_profiles (
        voice_id         TEXT PRIMARY KEY,
        profile          JSONB NOT NULL DEFAULT '{}',
        confidence       NUMERIC NOT NULL DEFAULT 0,
        samples_analysed INTEGER NOT NULL DEFAULT 0,
        calibration_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE sms_contacts", `
      CREATE TABLE IF NOT EXISTS sms_contacts (
        id                     SERIAL PRIMARY KEY,
        name                   TEXT NOT NULL,
        phone                  TEXT NOT NULL UNIQUE,
        relationship           TEXT NOT NULL DEFAULT 'agent_prospect'
                               CHECK (relationship IN ('business_partner','close_friend','family','agent_prospect')),
        stage                  INTEGER NOT NULL DEFAULT 1,
        personalisation        JSONB NOT NULL DEFAULT '{}',
        voice_override         JSONB NOT NULL DEFAULT '{}',
        conversation_objective TEXT,
        last_contact           TIMESTAMPTZ,
        status                 TEXT NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','paused','completed','opted_out','backlog','booked')),
        auto_reply             BOOLEAN NOT NULL DEFAULT FALSE,
        follow_up_at           TIMESTAMPTZ,
        attempts               INTEGER NOT NULL DEFAULT 0,
        source                 TEXT NOT NULL DEFAULT 'manual',
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE sms_agent_drafts", `
      CREATE TABLE IF NOT EXISTS sms_agent_drafts (
        id              SERIAL PRIMARY KEY,
        contact_id      INTEGER NOT NULL REFERENCES sms_contacts(id) ON DELETE CASCADE,
        inbound_body    TEXT NOT NULL DEFAULT '',
        draft_body      TEXT NOT NULL,
        reasoning       TEXT,
        voice_confidence NUMERIC NOT NULL DEFAULT 0,
        auto_send       BOOLEAN NOT NULL DEFAULT FALSE,
        send_at         TIMESTAMPTZ,
        channel         TEXT NOT NULL DEFAULT 'sms',
        kind            TEXT NOT NULL DEFAULT 'reply'
                        CHECK (kind IN ('opener','reply','followup','schedule')),
        status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','sent')),
        edited_body     TEXT,
        sent_at         TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE voice_signals", `
      CREATE TABLE IF NOT EXISTS voice_signals (
        id           SERIAL PRIMARY KEY,
        draft_body   TEXT NOT NULL,
        action       TEXT NOT NULL CHECK (action IN ('approved_as_is','edited','rejected')),
        edited_body  TEXT,
        edit_diff    TEXT,
        contact_id   INTEGER REFERENCES sms_contacts(id) ON DELETE SET NULL,
        relationship TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["CREATE calendar_slots", `
      CREATE TABLE IF NOT EXISTS calendar_slots (
        id            SERIAL PRIMARY KEY,
        contact_id    INTEGER REFERENCES sms_contacts(id) ON DELETE CASCADE,
        proposed_time TIMESTAMPTZ NOT NULL,
        status        TEXT NOT NULL DEFAULT 'proposed'
                      CHECK (status IN ('proposed','accepted','declined','rescheduled','blocked')),
        location      TEXT,
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`],

    ["ALTER sms_contacts last_agent_message_at", `
      ALTER TABLE sms_contacts ADD COLUMN IF NOT EXISTS last_agent_message_at TIMESTAMPTZ`],

    ["INDEX sms_contacts_status",   `CREATE INDEX IF NOT EXISTS sms_contacts_status_idx   ON sms_contacts(status, stage)`],
    ["INDEX sms_contacts_followup", `CREATE INDEX IF NOT EXISTS sms_contacts_followup_idx ON sms_contacts(follow_up_at) WHERE follow_up_at IS NOT NULL`],
    ["INDEX sms_agent_drafts_status", `CREATE INDEX IF NOT EXISTS sms_agent_drafts_status_idx ON sms_agent_drafts(status, created_at)`],
    ["INDEX sms_agent_drafts_contact", `CREATE INDEX IF NOT EXISTS sms_agent_drafts_contact_idx ON sms_agent_drafts(contact_id)`],
    ["INDEX voice_signals_contact",  `CREATE INDEX IF NOT EXISTS voice_signals_contact_idx ON voice_signals(contact_id, created_at)`],
    ["INDEX calendar_slots_contact", `CREATE INDEX IF NOT EXISTS calendar_slots_contact_idx ON calendar_slots(contact_id, proposed_time)`],
  ]

  let failed = 0
  for (const [label, sql] of steps) {
    try {
      await pool.query(sql)
    } catch (err) {
      failed++
      console.error(`  [migrate] FAIL ${label}: ${(err as Error).message}`)
    }
  }

  if (failed > 0) {
    console.warn(`  [migrate] ${failed}/${steps.length} step(s) failed — see FAIL lines above`)
  } else {
    console.log(`  [migrate] all ${steps.length} steps ok`)
  }
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
