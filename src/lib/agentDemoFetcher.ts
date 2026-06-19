import { apiUrl } from "./api"
import { authFetch } from "./authFetch"
import type { PortfolioProperty, AgencyTheme } from "../data"

const SESSION_KEY_PORTFOLIO = "agentDemo_portfolio"
const SESSION_KEY_THEME     = "agentDemo_theme"

// ── Portfolio ─────────────────────────────────────────────────────────────────

export async function fetchAgentPortfolio(): Promise<{ sold: PortfolioProperty[]; active: PortfolioProperty[] } | null> {
  const cached = sessionStorage.getItem(SESSION_KEY_PORTFOLIO)
  if (cached) {
    try { return JSON.parse(cached) } catch { /* ignore */ }
  }

  try {
    const res = await authFetch(apiUrl("/api/agent-demo/portfolio"))
    if (res.status === 204) return null
    if (!res.ok) return null
    const data = await res.json() as { sold: PortfolioProperty[]; active: PortfolioProperty[] }
    sessionStorage.setItem(SESSION_KEY_PORTFOLIO, JSON.stringify(data))
    return data
  } catch {
    return null
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

interface RawTheme {
  primary: string; accent: string; logo: string; gradient: [string, string]
}

export async function fetchAgentTheme(): Promise<AgencyTheme | null> {
  const cached = sessionStorage.getItem(SESSION_KEY_THEME)
  if (cached) {
    try { return JSON.parse(cached) } catch { /* ignore */ }
  }

  try {
    const res = await authFetch(apiUrl("/api/agent-demo/theme"))
    if (res.status === 204) return null
    if (!res.ok) return null
    const raw = await res.json() as RawTheme
    const theme: AgencyTheme = {
      name:     "db",
      primary:  raw.primary,
      accent:   raw.accent,
      dim:      hexToRgba(raw.primary, 0.12),
      glow:     hexToRgba(raw.primary, 0.07),
      logo:     raw.logo,
      gradient: raw.gradient,
    }
    sessionStorage.setItem(SESSION_KEY_THEME, JSON.stringify(theme))
    return theme
  } catch {
    return null
  }
}

// ── Cache invalidation ────────────────────────────────────────────────────────

export function clearAgentDemoCache() {
  sessionStorage.removeItem(SESSION_KEY_PORTFOLIO)
  sessionStorage.removeItem(SESSION_KEY_THEME)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return `rgba(0,0,0,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
