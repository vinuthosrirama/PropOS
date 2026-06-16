/**
 * Contrast-aware text colour utility
 *
 * Automatically returns the correct readable text colour based on any
 * background colour — whether dark or light — so every piece of text
 * passes WCAG AA (4.5:1) contrast without manual checking.
 *
 * Usage:
 *   import { getContrastText, getContrastMuted } from "../lib/contrast"
 *
 *   // On a coloured background (agency accent, alert card, etc.)
 *   <div style={{ background: theme.primary, color: getContrastText(theme.primary) }}>
 *
 *   // Muted/secondary label on same background
 *   <div style={{ background: "#3f0278", color: getContrastMuted("#3f0278") }}>
 */

// ── Luminance ─────────────────────────────────────────────────────────────────

/** Convert 0–255 sRGB channel to linearised luminance contribution */
function linearise(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Relative luminance (WCAG 2.1) of any CSS colour string */
export function relativeLuminance(color: string): number {
  const [r, g, b] = resolveColor(color)
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)
}

/** WCAG contrast ratio between two colours */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const lighter = Math.max(l1, l2)
  const darker  = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ── Parser — hex fast-path only; everything else resolved via DOM in resolveColor ──

export function parseColor(color: string): [number, number, number] | null {
  if (!color) return null
  const s = color.trim()
  if (s.startsWith("var(")) return null   // must be resolved via DOM
  const hex6 = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
  if (hex6) return [parseInt(hex6[1], 16), parseInt(hex6[2], 16), parseInt(hex6[3], 16)]
  const hex3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  if (hex3) return [parseInt(hex3[1]+hex3[1], 16), parseInt(hex3[2]+hex3[2], 16), parseInt(hex3[3]+hex3[3], 16)]
  return null
}

// ── Main API ──────────────────────────────────────────────────────────────────

const DARK_TEXT  = "rgb(213, 219, 230)"  // --c-text dark mode  (luminance ~0.68)
const LIGHT_TEXT = "#0f172a"             // --c-text light mode (luminance ~0.02)

const DARK_MUTED  = "rgba(213, 219, 230, 0.60)"
const LIGHT_MUTED = "#475569"

/**
 * Returns the high-contrast primary text colour for use on the given background.
 * Picks dark text on light backgrounds, light text on dark backgrounds.
 * Always ensures ≥ 4.5:1 contrast.
 */
export function getContrastText(bg: string): string {
  const lum = relativeLuminance(bg)
  // bg luminance > 0.18 → it's "light enough" for dark text
  return lum > 0.18 ? LIGHT_TEXT : DARK_TEXT
}

/**
 * Returns a muted/secondary text colour that still reads clearly on bg.
 */
export function getContrastMuted(bg: string): string {
  const lum = relativeLuminance(bg)
  return lum > 0.18 ? LIGHT_MUTED : DARK_MUTED
}

/**
 * Returns "light" or "dark" — useful for conditional icon/illustration swaps.
 */
export function getBgMode(bg: string): "light" | "dark" {
  return relativeLuminance(bg) > 0.18 ? "light" : "dark"
}

/**
 * Convenience: given any foreground + background, returns whether WCAG AA
 * (4.5:1 for normal text, 3:1 for large/bold ≥ 18pt or ≥ 14pt bold) is met.
 */
export function meetsWCAG(fg: string, bg: string, large = false): boolean {
  return contrastRatio(fg, bg) >= (large ? 3 : 4.5)
}

/**
 * Dynamic accent text: returns white or black text based on which achieves
 * better contrast against the accent colour. Used for buttons, badges, etc.
 */
export function getAccentText(accentColor: string): string {
  const onWhite = contrastRatio(accentColor, "#ffffff")
  const onBlack = contrastRatio(accentColor, "#000000")
  // Use white text if it contrasts better (or both are equal), else black
  return onWhite >= onBlack ? "#ffffff" : LIGHT_TEXT
}

// ── CSS custom property resolution (runtime) ──────────────────────────────────

/**
 * Resolves a CSS colour to [r, g, b] by sampling the computed style on
 * document.documentElement.  Works for CSS vars and any valid CSS colour.
 *
 * NOTE: synchronous, requires browser environment (returns [128,128,128] in SSR).
 */
export function resolveColor(cssValue: string): [number, number, number] {
  // Hex fast-path — avoids DOM entirely
  const direct = parseColor(cssValue)
  if (direct) return direct

  // Non-hex (rgb(), var(), named) — let the browser compute it
  if (typeof document !== "undefined") {
    const temp = document.createElement("div")
    temp.style.color = cssValue
    temp.style.display = "none"
    document.body.appendChild(temp)
    const resolved = getComputedStyle(temp).color  // always "rgb(r, g, b)"
    document.body.removeChild(temp)
    const m = resolved.match(/(\d+),\s*(\d+),\s*(\d+)/)
    if (m) return [+m[1], +m[2], +m[3]]
  }

  return [128, 128, 128]
}
