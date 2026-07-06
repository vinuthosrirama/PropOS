import { getSetting, setSetting } from "./appSettings.js"

let _cached = false
let _cachedAt = 0
const CACHE_TTL_MS = 60_000

export async function isAIEnabled(): Promise<boolean> {
  if (Date.now() - _cachedAt < CACHE_TTL_MS) return _cached
  try {
    const val = await getSetting("ai_features_enabled")
    _cached = val === "true"
  } catch {
    _cached = false
  }
  _cachedAt = Date.now()
  return _cached
}

export async function setAIEnabled(on: boolean): Promise<void> {
  await setSetting("ai_features_enabled", on ? "true" : "false")
  _cached = on
  _cachedAt = Date.now()
}
