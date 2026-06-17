import { FONT } from "../../data"
import type { PitchAgentInfo } from "./PriceUpdateTemplate"
import TrackedSection from "./TrackedSection"

// ── Design tokens (Peake / PropOS dark theme) ─────────────────────────────────

const T = {
  bg:      "#04070d",
  bg2:     "#0a0f1a",
  bg3:     "#0e1525",
  border:  "rgba(166,218,255,0.10)",
  primary: "#4fa3e0",
  green:   "#64d090",
  amber:   "#f59e0b",
  text:    "#d8e7f2",
  muted:   "#7a91a8",
  faint:   "#3f5166",
}

// ── Payload ────────────────────────────────────────────────────────────────────

export interface BuyerBriefComparableSale {
  address: string
  price:   number
  date:    string
  beds:    number
  baths?:  number
  land?:   number
}

export interface BuyerBriefPayload {
  buyerName:        string
  propertyAddress:  string
  suburb:           string
  beds:             number
  baths:            number
  parking?:         number
  propertyType:     string
  landSqm?:         number
  priceGuide?:      { low: number; high: number }
  inspectionTimes?: string[]
  keyFeatures?:     string[]
  comparableSales?: BuyerBriefComparableSale[]
  matchReason?:     string
  agentCard:        PitchAgentInfo
  listingUrl?:      string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  return `$${Math.round(n / 1000)}K`
}

function fmtFull(n: number): string {
  return "$" + n.toLocaleString("en-AU")
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      background: T.bg3, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: "14px 20px", minWidth: 80,
    }}>
      <span style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }}>{value}</span>
      <span style={{ fontSize: 11, color: T.muted, marginTop: 4, fontWeight: 600, letterSpacing: 0.5 }}>{label}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: T.primary,
      marginBottom: 16, marginTop: 36,
    }}>
      {children}
    </div>
  )
}

// ── Main template ─────────────────────────────────────────────────────────────

export default function BuyerBriefTemplate({ payload }: { payload: BuyerBriefPayload }) {
  const {
    buyerName, propertyAddress, suburb, beds, baths, parking,
    propertyType, landSqm, priceGuide, inspectionTimes,
    keyFeatures, comparableSales, matchReason, agentCard, listingUrl,
  } = payload

  const initials = agentCard.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()

  const barRange = priceGuide ? priceGuide.high - priceGuide.low : 0
  const midPrice = priceGuide ? Math.round((priceGuide.low + priceGuide.high) / 2) : 0
  const midPct   = barRange > 0 ? 50 : 50

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      fontFamily: FONT,
      color: T.text,
      WebkitFontSmoothing: "antialiased" as const,
    }}>

      {/* ── Cover ──────────────────────────────────────────────────────────── */}
      <TrackedSection id="cover">
        <div style={{
          background: `linear-gradient(160deg, rgba(79,163,224,0.14) 0%, ${T.bg} 55%)`,
          borderBottom: `1px solid ${T.border}`,
          padding: "56px 40px 48px",
          maxWidth: 840, margin: "0 auto",
        }}>
          {/* Eyebrow */}
          <div style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: T.primary,
            background: `rgba(79,163,224,0.10)`,
            border: `1px solid rgba(79,163,224,0.22)`,
            borderRadius: 20, padding: "4px 14px",
            marginBottom: 24,
          }}>
            BuyerOS · Matched Property Brief
          </div>

          {/* Personalised opener */}
          <div style={{ fontSize: 15, color: T.muted, marginBottom: 12 }}>
            Hi <strong style={{ color: T.text }}>{buyerName}</strong> — based on your search, we found a match.
          </div>

          <h1 style={{
            fontSize: "clamp(22px, 4vw, 36px)",
            fontWeight: 900, letterSpacing: -1, lineHeight: 1.1,
            color: "#fff", marginBottom: 10,
          }}>
            {propertyAddress}
          </h1>

          <div style={{ fontSize: 14, color: T.muted, marginBottom: 32 }}>
            {suburb} · {propertyType}
          </div>

          {/* Match reason chip */}
          {matchReason && (
            <div style={{
              display: "inline-flex", alignItems: "flex-start", gap: 10,
              background: `rgba(100,208,144,0.08)`,
              border: `1px solid rgba(100,208,144,0.20)`,
              borderRadius: 12, padding: "12px 16px", maxWidth: 520,
            }}>
              <span style={{ color: T.green, fontSize: 15, flexShrink: 0, marginTop: 1 }}>✦</span>
              <span style={{ fontSize: 13, color: T.text, lineHeight: 1.55 }}>{matchReason}</span>
            </div>
          )}
        </div>
      </TrackedSection>

      <div style={{ maxWidth: 840, margin: "0 auto", padding: "0 40px 80px" }}>

        {/* ── Property details ─────────────────────────────────────────────── */}
        <TrackedSection id="property-details">
          <SectionLabel>Property Details</SectionLabel>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Pill label="Beds"    value={String(beds)} />
            <Pill label="Baths"   value={String(baths)} />
            {parking != null && <Pill label="Parking" value={String(parking)} />}
            {landSqm  && <Pill label="Land"    value={`${landSqm}m²`} />}
            <Pill label="Type"    value={propertyType} />
          </div>

          {/* Key features */}
          {keyFeatures && keyFeatures.length > 0 && (
            <div style={{
              marginTop: 20,
              background: T.bg2, border: `1px solid ${T.border}`,
              borderRadius: 14, padding: "18px 20px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "10px 24px",
            }}>
              {keyFeatures.map((f, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  fontSize: 13, color: T.text,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: T.primary, flexShrink: 0,
                  }} />
                  {f}
                </div>
              ))}
            </div>
          )}
        </TrackedSection>

        {/* ── Location & lifestyle ─────────────────────────────────────────── */}
        <TrackedSection id="location-lifestyle">
          <SectionLabel>Location & Lifestyle</SectionLabel>
          <div style={{
            background: T.bg2, border: `1px solid ${T.border}`,
            borderRadius: 14, padding: "22px 24px",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `rgba(79,163,224,0.12)`, border: `1px solid rgba(79,163,224,0.20)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}>📍</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{suburb}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>South-East Melbourne</div>
              </div>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10,
            }}>
              {[
                { icon: "🏫", label: "Schools within 2km" },
                { icon: "🛒", label: "Shopping nearby" },
                { icon: "🚆", label: "Train station access" },
                { icon: "🌳", label: "Parks & reserves" },
              ].map(({ icon, label }) => (
                <div key={label} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 12, color: T.muted,
                  background: T.bg3, borderRadius: 8, padding: "8px 12px",
                }}>
                  <span>{icon}</span>{label}
                </div>
              ))}
            </div>
          </div>
        </TrackedSection>

        {/* ── Comparable sales ─────────────────────────────────────────────── */}
        {comparableSales && comparableSales.length > 0 && (
          <TrackedSection id="comparable-sales">
            <SectionLabel>Recent Comparable Sales</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {comparableSales.map((s, i) => (
                <div key={i} style={{
                  background: T.bg2, border: `1px solid ${T.border}`,
                  borderRadius: 10, padding: "14px 18px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{s.address}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
                      {[s.beds && `${s.beds}bd`, s.baths && `${s.baths}ba`, s.land && `${s.land}m²`]
                        .filter(Boolean).join(" · ")}
                      {" · "}{s.date}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 16, fontWeight: 800, color: T.primary, whiteSpace: "nowrap",
                  }}>{fmtFull(s.price)}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: T.faint, marginTop: 8 }}>Source: PropOS market analysis</div>
          </TrackedSection>
        )}

        {/* ── Price guide ──────────────────────────────────────────────────── */}
        {priceGuide && (
          <TrackedSection id="price-guide">
            <SectionLabel>Price Guide</SectionLabel>
            <div style={{
              background: `linear-gradient(135deg, rgba(79,163,224,0.07), rgba(79,163,224,0.03))`,
              border: `1px solid rgba(79,163,224,0.22)`,
              borderRadius: 16, padding: "28px 28px",
            }}>
              {/* Range display */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "flex-end",
                marginBottom: 20,
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, fontWeight: 600 }}>LOW</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{fmt(priceGuide.low)}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, fontWeight: 600 }}>MID ESTIMATE</div>
                  <div style={{
                    fontSize: 36, fontWeight: 900, letterSpacing: -1,
                    color: T.primary,
                  }}>{fmt(midPrice)}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, fontWeight: 600 }}>HIGH</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{fmt(priceGuide.high)}</div>
                </div>
              </div>

              {/* Bar */}
              <div style={{
                position: "relative", height: 8,
                background: `rgba(166,218,255,0.10)`, borderRadius: 4,
              }}>
                <div style={{
                  position: "absolute", height: "100%", borderRadius: 4,
                  background: `linear-gradient(90deg, rgba(79,163,224,0.4), ${T.primary})`,
                  width: `${midPct}%`,
                }} />
                <div style={{
                  position: "absolute", top: -4, left: `calc(${midPct}% - 8px)`,
                  width: 16, height: 16, borderRadius: "50%",
                  background: T.primary, border: "2px solid #fff",
                  boxShadow: `0 0 12px rgba(79,163,224,0.6)`,
                }} />
              </div>

              <div style={{ fontSize: 12, color: T.muted, marginTop: 16 }}>
                Range: {fmtFull(priceGuide.low)} – {fmtFull(priceGuide.high)} · Comparative market analysis
              </div>
            </div>
          </TrackedSection>
        )}

        {/* ── Inspection times ─────────────────────────────────────────────── */}
        {inspectionTimes && inspectionTimes.length > 0 && (
          <TrackedSection id="inspection-times">
            <SectionLabel>Open for Inspection</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {inspectionTimes.map((time, i) => (
                <div key={i} style={{
                  background: T.bg2, border: `1px solid ${T.border}`,
                  borderRadius: 10, padding: "14px 20px",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: `rgba(79,163,224,0.10)`,
                    border: `1px solid rgba(79,163,224,0.18)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                  }}>📅</div>
                  <span style={{ fontSize: 14, color: T.text, fontWeight: 500 }}>{time}</span>
                </div>
              ))}
            </div>
            {listingUrl && (
              <div style={{ marginTop: 14 }}>
                <a
                  href={listingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    fontSize: 13, color: T.primary,
                    textDecoration: "underline", textUnderlineOffset: 3,
                  }}
                >
                  View full listing ↗
                </a>
              </div>
            )}
          </TrackedSection>
        )}

        {/* ── Enquire ──────────────────────────────────────────────────────── */}
        <TrackedSection id="enquire">
          <SectionLabel>Enquire Now</SectionLabel>
          <div style={{
            background: `linear-gradient(135deg, rgba(79,163,224,0.08), rgba(100,208,144,0.05))`,
            border: `1px solid rgba(79,163,224,0.22)`,
            borderRadius: 20, padding: "32px 28px",
          }}>
            {/* Agent row */}
            <div style={{
              display: "flex", alignItems: "center", gap: 16, marginBottom: 24,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                background: `linear-gradient(135deg, ${T.primary}, rgba(79,163,224,0.5))`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 18, fontWeight: 800,
                boxShadow: `0 0 20px rgba(79,163,224,0.3)`,
              }}>
                {agentCard.photoUrl
                  ? <img src={agentCard.photoUrl} alt={agentCard.name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                  : initials}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{agentCard.name}</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
                  {agentCard.agency}{agentCard.suburb ? ` · ${agentCard.suburb}` : ""}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {agentCard.phone && (
                <a
                  href={`tel:${agentCard.phone}`}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 8, padding: "13px 0",
                    background: T.primary,
                    borderRadius: 12, border: "none",
                    color: "#04070d", fontWeight: 800, fontSize: 15,
                    textDecoration: "none",
                    boxShadow: `0 0 24px rgba(79,163,224,0.30)`,
                  }}
                >
                  📞 Call {agentCard.name.split(" ")[0]} · {agentCard.phone}
                </a>
              )}
              {agentCard.email && (
                <a
                  href={`mailto:${agentCard.email}?subject=Enquiry: ${propertyAddress}`}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 8, padding: "13px 0",
                    background: "transparent",
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    color: T.text, fontSize: 14, fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  ✉ {agentCard.email}
                </a>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            textAlign: "center", marginTop: 36,
            fontSize: 11, color: T.faint, letterSpacing: 0.5,
          }}>
            Sent via BuyerOS by PropOS · AddVantage AI
          </div>
        </TrackedSection>

      </div>
    </div>
  )
}
