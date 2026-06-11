import { getAgencyTheme, FONT, DEFAULT_THEME } from "../../data"
import type { PitchAgentInfo } from "./PriceUpdateTemplate"

export interface IntroStats {
  salesCount: number
  avgDaysOnMarket: number
  avgAboveGuidePct: number
  yearsExperience: number
}

export interface IntroTestimonial {
  quote: string
  author: string
  suburb?: string
}

export interface IntroRecentSale {
  address: string
  price: number
  date: string
}

export interface DigitalIntroductionPayload {
  agentCard: PitchAgentInfo
  recipientName?: string
  personalNote?: string
  bio?: string
  stats?: IntroStats
  recentSales?: IntroRecentSale[]
  testimonials?: IntroTestimonial[]
  leadName?: string
  vendorName?: string
}

function fmtPrice(n: number): string {
  return "$" + n.toLocaleString("en-AU")
}

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString("en-AU", { month: "short", year: "numeric" }) } catch { return d }
}

export default function DigitalIntroductionTemplate({ payload }: { payload: DigitalIntroductionPayload }) {
  const theme = getAgencyTheme(payload.agentCard?.agency ?? "") ?? DEFAULT_THEME
  const agent = payload.agentCard
  const initials = agent.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()

  const bg = "#04070D"
  const bg2 = "#10131C"
  const border = "#1E2433"
  const text = "#D5DBE6"
  const muted = "#6B7280"

  return (
    <div style={{
      minHeight: "100vh", background: bg, fontFamily: FONT, color: text,
      maxWidth: 680, margin: "0 auto", padding: "0 0 80px",
    }}>
      {/* Hero */}
      <div style={{
        background: `linear-gradient(160deg, ${theme.primary}22 0%, ${bg} 60%)`,
        borderBottom: `1px solid ${border}`,
        padding: "48px 32px 40px",
        textAlign: "center",
      }}>
        {/* Agency badge */}
        <div style={{
          display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
          color: theme.primary, background: theme.dim, borderRadius: 20, padding: "4px 12px",
          marginBottom: 24,
        }}>
          {agent.agency}
        </div>

        {/* Avatar */}
        {agent.photoUrl ? (
          <img src={agent.photoUrl} alt={agent.name} style={{
            width: 96, height: 96, borderRadius: "50%", display: "block", margin: "0 auto 16px",
            border: `3px solid ${theme.primary}`,
          }} />
        ) : (
          <div style={{
            width: 96, height: 96, borderRadius: "50%", display: "flex",
            alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
            background: theme.dim, border: `3px solid ${theme.primary}`,
            fontSize: 32, fontWeight: 700, color: theme.primary,
          }}>
            {initials}
          </div>
        )}

        <h1 style={{ fontSize: 28, fontWeight: 700, color: text, margin: "0 0 6px" }}>{agent.name}</h1>
        {agent.suburb && (
          <div style={{ fontSize: 14, color: muted, marginBottom: 8 }}>
            {agent.agency} · {agent.suburb}
          </div>
        )}
        {agent.tagline && (
          <div style={{ fontSize: 15, color: text, opacity: 0.7, fontStyle: "italic" }}>{agent.tagline}</div>
        )}
      </div>

      <div style={{ padding: "0 24px" }}>

        {/* Personal note */}
        {payload.personalNote && (
          <div style={{
            margin: "28px 0 0",
            background: bg2, border: `1px solid ${theme.primary}33`,
            borderLeft: `3px solid ${theme.primary}`,
            borderRadius: 12, padding: "18px 20px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.primary, marginBottom: 8, letterSpacing: "0.06em" }}>
              A NOTE FOR {(payload.recipientName ?? payload.leadName ?? "YOU").toUpperCase()}
            </div>
            <div style={{ fontSize: 14, color: text, lineHeight: 1.65 }}>{payload.personalNote}</div>
          </div>
        )}

        {/* Stats */}
        {payload.stats && (
          <div style={{ margin: "28px 0 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: muted, marginBottom: 14 }}>
              TRACK RECORD
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "Properties sold", value: String(payload.stats.salesCount) },
                { label: "Years in market", value: String(payload.stats.yearsExperience) },
                { label: "Avg. days on market", value: `${payload.stats.avgDaysOnMarket}d` },
                { label: "Avg. above guide", value: `+${payload.stats.avgAboveGuidePct}%` },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: bg2, border: `1px solid ${border}`, borderRadius: 12,
                  padding: "18px 16px", textAlign: "center",
                }}>
                  <div style={{
                    fontSize: 26, fontWeight: 800, color: theme.primary,
                    fontFamily: "'Instrument Serif', serif", lineHeight: 1,
                  }}>{value}</div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 6 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bio */}
        {payload.bio && (
          <div style={{ margin: "28px 0 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: muted, marginBottom: 12 }}>
              ABOUT {agent.name.split(" ")[0].toUpperCase()}
            </div>
            <div style={{
              background: bg2, border: `1px solid ${border}`, borderRadius: 12,
              padding: "20px", fontSize: 14, color: text, lineHeight: 1.7,
            }}>
              {payload.bio}
            </div>
          </div>
        )}

        {/* Recent Sales */}
        {payload.recentSales && payload.recentSales.length > 0 && (
          <div style={{ margin: "28px 0 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: muted, marginBottom: 12 }}>
              RECENT SALES
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {payload.recentSales.map((s, i) => (
                <div key={i} style={{
                  background: bg2, border: `1px solid ${border}`, borderRadius: 10,
                  padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{s.address}</div>
                    <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{fmtDate(s.date)}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.primary }}>{fmtPrice(s.price)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Testimonials */}
        {payload.testimonials && payload.testimonials.length > 0 && (
          <div style={{ margin: "28px 0 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: muted, marginBottom: 12 }}>
              CLIENT REVIEWS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {payload.testimonials.map((t, i) => (
                <div key={i} style={{
                  background: bg2, border: `1px solid ${border}`, borderRadius: 12,
                  padding: "18px 20px",
                }}>
                  <div style={{ fontSize: 18, color: theme.primary, marginBottom: 8, lineHeight: 1 }}>"</div>
                  <div style={{ fontSize: 14, color: text, lineHeight: 1.65, fontStyle: "italic", marginBottom: 12 }}>
                    {t.quote}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: muted }}>
                    — {t.author}{t.suburb ? `, ${t.suburb}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact CTA */}
        <div style={{
          margin: "32px 0 0",
          background: `linear-gradient(135deg, ${theme.primary}18, ${theme.primary}08)`,
          border: `1px solid ${theme.primary}33`,
          borderRadius: 16, padding: "28px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: text, marginBottom: 6 }}>
            Let's have a chat
          </div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 24 }}>
            No pressure — just a quick conversation about what matters most to you.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {agent.phone && (
              <a href={`tel:${agent.phone}`} style={{
                display: "block", padding: "13px 0",
                background: theme.primary, borderRadius: 10,
                color: "#fff", fontWeight: 700, fontSize: 15,
                textDecoration: "none",
              }}>
                Call {agent.name.split(" ")[0]} · {agent.phone}
              </a>
            )}
            {agent.email && (
              <a href={`mailto:${agent.email}`} style={{
                display: "block", padding: "13px 0",
                background: "transparent", border: `1px solid ${border}`,
                borderRadius: 10, color: text, fontWeight: 600, fontSize: 14,
                textDecoration: "none",
              }}>
                {agent.email}
              </a>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 40, fontSize: 11, color: muted }}>
          Sent via PropOS by AddVantage
        </div>
      </div>
    </div>
  )
}
