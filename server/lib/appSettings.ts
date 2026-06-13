/**
 * Tiny key/value settings store (`app_settings` table) for runtime toggles
 * that shouldn't require a redeploy to flip — e.g. the SMS agent auto-send
 * master switch (see docs/SMS_AGENT.md item 6/8.6).
 */

import { query, isDbConnected } from "./db.js"

export async function getSetting(key: string): Promise<string | null> {
  if (!isDbConnected()) return null
  const rows = await query<{ value: string }>(`SELECT value FROM app_settings WHERE key = $1`, [key])
  return rows[0]?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (!isDbConnected()) return
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value],
  )
}
