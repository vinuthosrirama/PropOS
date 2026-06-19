/**
 * Prompt Optimisation Loop
 *
 * Stores versioned prompts in the DB and continuously improves them based on
 * quality signals (approved/rejected drafts, demo bookings). No redeployment needed.
 *
 * Architecture:
 *   - prompt_versions table: one active row per context at any time
 *   - prompt_evaluations table: every quality signal linked to a version
 *   - getActivePrompt(): serves the live prompt with 5-min in-memory cache
 *   - recordSignal(): inserts a quality signal
 *   - runOptimisationCycle(): weekly + threshold-triggered self-rewrite via OpenAI
 *
 * Triggers (both active):
 *   - Weekly cron (Sunday 2am Melbourne) — if ≥10 new signals exist
 *   - Signal threshold — immediately when 15 new signals accumulate
 */

import OpenAI from "openai"
import { query, execute, isDbConnected } from "./db.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromptSignal = "approved" | "rejected" | "edited" | "replied" | "demo_booked"

const SIGNAL_WEIGHTS: Record<PromptSignal, number> = {
  approved:    1,
  rejected:   -1,
  edited:      0,
  replied:     1,
  demo_booked: 2,
}

// ── In-memory cache (5-min TTL per context) ───────────────────────────────────

interface CacheEntry { text: string; versionId: number; cachedAt: number }
const _cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1_000

// ── OpenAI client (lazy) ──────────────────────────────────────────────────────

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "not-set" })
  return _client
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the active prompt text for a context.
 * Falls back to the hardcoded string if DB is unavailable or no version exists yet.
 * Seeds the initial version from the fallback if the context has never been stored.
 */
export async function getActivePrompt(context: string, fallback: string): Promise<string> {
  const cached = _cache.get(context)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.text
  }

  if (!isDbConnected()) return fallback

  try {
    const rows = await query<{ id: number; prompt_text: string }>(
      `SELECT id, prompt_text FROM prompt_versions WHERE context = $1 AND is_active = TRUE
       ORDER BY created_at DESC LIMIT 1`,
      [context],
    )

    if (rows.length === 0) {
      // First run — seed the fallback as version 1
      const inserted = await query<{ id: number }>(
        `INSERT INTO prompt_versions (context, prompt_text, is_active) VALUES ($1, $2, TRUE) RETURNING id`,
        [context, fallback],
      )
      const id = inserted[0]?.id ?? 0
      _cache.set(context, { text: fallback, versionId: id, cachedAt: Date.now() })
      console.log(`[promptOptimiser] seeded initial version ${id} for context "${context}"`)
      return fallback
    }

    const { id, prompt_text } = rows[0]
    _cache.set(context, { text: prompt_text, versionId: id, cachedAt: Date.now() })
    return prompt_text
  } catch {
    return fallback
  }
}

/** Returns the active version ID for a context (used when creating drafts). */
export async function getActiveVersionId(context: string): Promise<number | null> {
  const cached = _cache.get(context)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.versionId
  }
  if (!isDbConnected()) return null
  try {
    const rows = await query<{ id: number }>(
      `SELECT id FROM prompt_versions WHERE context = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
      [context],
    )
    return rows[0]?.id ?? null
  } catch {
    return null
  }
}

/**
 * Records a quality signal for a specific prompt version.
 * After recording, checks the threshold trigger (15 signals = immediate optimisation).
 */
export async function recordSignal(
  versionId: number,
  signal: PromptSignal,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!isDbConnected() || !versionId) return
  try {
    await execute(
      `INSERT INTO prompt_evaluations (version_id, signal, signal_weight, metadata)
       VALUES ($1, $2, $3, $4)`,
      [versionId, signal, SIGNAL_WEIGHTS[signal], JSON.stringify(metadata ?? {})],
    )

    // Threshold trigger: if 15 new signals since last cycle, optimise immediately
    void checkThresholdTrigger(versionId)
  } catch (err) {
    console.warn("[promptOptimiser] recordSignal failed:", (err as Error).message)
  }
}

/**
 * Main optimisation cycle. Called weekly (cron) or on threshold.
 * Fetches recent approved/rejected examples, asks OpenAI to rewrite the prompt,
 * activates the new version if it scores higher.
 */
export async function runOptimisationCycle(context: string): Promise<void> {
  if (!isDbConnected() || !process.env.OPENAI_API_KEY) return

  try {
    // Require ≥10 new signals since last cycle
    const newSignalCount = await countNewSignals(context)
    if (newSignalCount < 10) {
      console.log(`[promptOptimiser] context "${context}" skipped — only ${newSignalCount} new signals (need 10)`)
      return
    }

    const activeRows = await query<{ id: number; prompt_text: string }>(
      `SELECT id, prompt_text FROM prompt_versions WHERE context = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
      [context],
    )
    if (!activeRows[0]) return

    const { id: activeId, prompt_text: activePrompt } = activeRows[0]

    // Gather approved and rejected examples — two sources:
    // 1. outreach_drafts (VendorOS bulk outreach flow)
    // 2. prompt_evaluations.metadata->>'smsBody' (BuyerOS generate/send flow)
    const [draftApproved, metaApproved, draftRejected, metaRejected] = await Promise.all([
      query<{ draft_body: string; edited_body: string | null }>(
        `SELECT d.draft_body, d.edited_body
         FROM outreach_drafts d
         JOIN prompt_evaluations pe ON pe.version_id = d.version_id
         WHERE d.version_id = $1 AND pe.signal IN ('approved','edited') AND d.status IN ('approved','sent')
         ORDER BY d.created_at DESC LIMIT 10`,
        [activeId],
      ),
      query<{ sms_body: string }>(
        `SELECT metadata->>'smsBody' AS sms_body
         FROM prompt_evaluations
         WHERE version_id = $1 AND signal = 'approved' AND metadata->>'smsBody' IS NOT NULL
         ORDER BY created_at DESC LIMIT 10`,
        [activeId],
      ),
      query<{ draft_body: string }>(
        `SELECT d.draft_body
         FROM outreach_drafts d
         JOIN prompt_evaluations pe ON pe.version_id = d.version_id
         WHERE d.version_id = $1 AND pe.signal = 'rejected' AND d.status = 'rejected'
         ORDER BY d.created_at DESC LIMIT 10`,
        [activeId],
      ),
      query<{ sms_body: string }>(
        `SELECT metadata->>'smsBody' AS sms_body
         FROM prompt_evaluations
         WHERE version_id = $1 AND signal = 'rejected' AND metadata->>'smsBody' IS NOT NULL
         ORDER BY created_at DESC LIMIT 10`,
        [activeId],
      ),
    ])

    const approvedExamples = [
      ...draftApproved.map(r => r.edited_body ?? r.draft_body),
      ...metaApproved.map(r => r.sms_body),
    ].slice(0, 15)
    const rejectedExamples = [
      ...draftRejected.map(r => r.draft_body),
      ...metaRejected.map(r => r.sms_body),
    ].slice(0, 15)

    if (approvedExamples.length + rejectedExamples.length < 5) {
      console.log(`[promptOptimiser] not enough example data yet (${approvedExamples.length} approved, ${rejectedExamples.length} rejected)`)
      return
    }

    const approvedBlock = approvedExamples.map((t, i) => `${i + 1}. ${t}`).join("\n")
    const rejectedBlock = rejectedExamples.map((t, i) => `${i + 1}. ${t}`).join("\n")

    const metaPrompt = `You are improving the SMS style rules for PropOS, an Australian real estate outreach tool.

CURRENT STYLE RULES (what the agent is currently told about writing SMS):
${activePrompt || "(no rules stored yet — infer from examples)"}

APPROVED SMS messages (the agent sent these — they were good):
${approvedBlock || "(none yet)"}

REJECTED/NOT SENT SMS messages (the agent discarded these):
${rejectedBlock || "(none yet)"}

Write CONCISE style refinements (bullet points only, max 8 bullets, under 400 tokens) that capture what makes the approved examples better.
Focus on: tone, structure, sign-off style, how they reference the property, phrasing patterns.
Do NOT repeat the hard rules (no em-dashes, under 160 chars) — those are enforced elsewhere.
Return ONLY the bullet-point style refinements, no preamble, no explanation.`

    const completion = await getClient().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 700,
      temperature: 0.3,
      messages: [{ role: "user", content: metaPrompt }],
    })

    const newPromptText = completion.choices[0]?.message?.content?.trim()
    if (!newPromptText || newPromptText.length < 100) {
      console.warn("[promptOptimiser] generated prompt too short or empty — skipping")
      return
    }

    // Compute scores for comparison
    const oldScore = await getVersionScore(activeId)

    // Save new version (inactive first)
    const newRows = await query<{ id: number }>(
      `INSERT INTO prompt_versions (context, prompt_text, is_active, perf_snapshot)
       VALUES ($1, $2, FALSE, $3) RETURNING id`,
      [context, newPromptText, JSON.stringify({ generated_from_version: activeId, approved_count: approvedExamples.length, rejected_count: rejectedExamples.length })],
    )
    const newId = newRows[0]?.id
    if (!newId) return

    // Activate new version only if its projected score would be better
    // Heuristic: if approval ratio > old version's, activate
    const approvalRatio = approvedExamples.length / Math.max(approvedExamples.length + rejectedExamples.length, 1)
    const shouldActivate = approvalRatio >= 0.6 || oldScore < 0

    if (shouldActivate) {
      await execute(
        `UPDATE prompt_versions SET is_active = FALSE WHERE context = $1 AND id != $2`,
        [context, newId],
      )
      await execute(
        `UPDATE prompt_versions SET is_active = TRUE WHERE id = $1`,
        [newId],
      )
      // Invalidate cache
      _cache.delete(context)
      console.log(`[promptOptimiser] context "${context}" — version ${newId} activated (replaced ${activeId}). Approval ratio: ${Math.round(approvalRatio * 100)}% (${approvedExamples.length}/${approvedExamples.length + rejectedExamples.length}), old score: ${oldScore}`)
    } else {
      console.log(`[promptOptimiser] context "${context}" — new version ${newId} generated but not activated (approval ratio ${Math.round(approvalRatio * 100)}% < threshold). Keeping version ${activeId}.`)
    }
  } catch (err) {
    console.error("[promptOptimiser] cycle failed:", (err as Error).message)
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Count new signals since the last optimisation cycle (last version creation). */
async function countNewSignals(context: string): Promise<number> {
  try {
    const rows = await query<{ cnt: string }>(
      `SELECT COUNT(pe.id) AS cnt
       FROM prompt_evaluations pe
       JOIN prompt_versions pv ON pv.id = pe.version_id
       WHERE pv.context = $1
         AND pe.created_at > (
           SELECT COALESCE(MAX(created_at), '1970-01-01') FROM prompt_versions WHERE context = $1
         )`,
      [context],
    )
    return parseInt(rows[0]?.cnt ?? "0", 10)
  } catch {
    return 0
  }
}

/** Get the weighted score for a version (sum of signal_weights). */
async function getVersionScore(versionId: number): Promise<number> {
  try {
    const rows = await query<{ score: string }>(
      `SELECT COALESCE(SUM(signal_weight), 0) AS score FROM prompt_evaluations WHERE version_id = $1`,
      [versionId],
    )
    return parseInt(rows[0]?.score ?? "0", 10)
  } catch {
    return 0
  }
}

/** Threshold trigger: fire optimisation cycle if ≥15 new signals. Non-blocking. */
async function checkThresholdTrigger(versionId: number): Promise<void> {
  try {
    const contextRows = await query<{ context: string }>(
      `SELECT context FROM prompt_versions WHERE id = $1`,
      [versionId],
    )
    const context = contextRows[0]?.context
    if (!context) return

    const count = await countNewSignals(context)
    if (count >= 15) {
      console.log(`[promptOptimiser] threshold reached (${count} signals) for context "${context}" — triggering cycle`)
      void runOptimisationCycle(context)
    }
  } catch { /* non-fatal */ }
}
