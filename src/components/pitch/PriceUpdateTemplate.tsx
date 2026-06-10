import { getAgencyTheme, FONT, DEFAULT_THEME } from "../../data"

export interface PitchAgentInfo {
  name: string
  agency: string
  email?: string
  phone?: string
  suburb: string
  tagline?: string
  photoUrl?: string
}

export interface PitchCompSale {
  address: string
  price: number
  date: string
  beds: number
}

export interface PitchMarketStats {
  medianPrice?: number
  daysOnMarket?: number
  clearanceRate?: number
  annualGrowthPct?: number
}

export interface PitchRecipientInfo {
  name: string
  propertyAddress: string
  suburb: string
}

export interface PriceUpdatePayload {
  recipient?: PitchRecipientInfo
  coverNote?: string
  comparableSales?: PitchCompSale[]
  agentCard?: PitchAgentInfo
  marketStats?: PitchMarketStats
}

function fmtPrice(n: number): string {
  return "$" + n.toLocaleString("en-AU")
}

export default function PriceUpdateTemplate({ payload }: { payload: PriceUpdatePayload }) {
  const theme = payload.agentCard ? getAgencyTheme(payload.agentCard.agency) : DEFAULT_THEME
  const recipientName = payload.recipient?.name
  const propertyAddress = payload.recipient?.propertyAddress
  const suburb = payload.recipient?.suburb
  const initials = payload.agentCard
    ? payload.agentCard.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "AV"

  return (
    <div style={{ minHeight: "100vh", background: "#04070D", fontFamily: FONT, color: "#F5F7FA" }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
        padding: "48px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", opacity: 0.85, marginBottom: 12 }}>
          Price Update
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
          {propertyAddress || "Your Property"}
        </div>
        {suburb && <div style={{ fontSize: 15, opacity: 0.85 }}>{suburb}</div>}
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px 64px" }}>

        {/* Cover note */}
        {payload.coverNote && (
          <div style={{
            background: "rgba(255,255,255,0.05)", backdropFilter: "blur(8px)",
            borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
            padding: 24, marginBottom: 24,
          }}>
            {recipientName && (
              <div style={{ fontSize: 13, color: "#A6DAFF", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                Prepared for {recipientName}
              </div>
            )}
            {payload.coverNote.split("\n\n").map((para, i) => (
              <p key={i} style={{ fontSize: 15, lineHeight: 1.7, color: "#D6DCE5", margin: i === 0 ? "0 0 12px" : "12px 0" }}>
                {para}
              </p>
            ))}
          </div>
        )}

        {/* Market stats */}
        {payload.marketStats && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: "#A6DAFF", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              Market Snapshot
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
              {payload.marketStats.medianPrice !== undefined && (
                <StatCard label="Median Price" value={fmtPrice(payload.marketStats.medianPrice)} />
              )}
              {payload.marketStats.daysOnMarket !== undefined && (
                <StatCard label="Days on Market" value={String(payload.marketStats.daysOnMarket)} />
              )}
              {payload.marketStats.clearanceRate !== undefined && (
                <StatCard label="Clearance Rate" value={`${payload.marketStats.clearanceRate}%`} />
              )}
              {payload.marketStats.annualGrowthPct !== undefined && (
                <StatCard label="Annual Growth" value={`${payload.marketStats.annualGrowthPct}%`} />
              )}
            </div>
          </div>
        )}

        {/* Comparable sales */}
        {payload.comparableSales && payload.comparableSales.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: "#A6DAFF", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              Comparable Sales
            </div>
            <div style={{
              background: "rgba(255,255,255,0.05)", backdropFilter: "blur(8px)",
              borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}>
              {payload.comparableSales.map((c, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 20px",
                  borderBottom: i < payload.comparableSales!.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{c.address}</div>
                    <div style={{ fontSize: 12, color: "#9AA4B2", marginTop: 2 }}>{c.beds}bd &middot; {c.date}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#A6DAFF" }}>{fmtPrice(c.price)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agent card */}
        {payload.agentCard && (
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            background: "rgba(255,255,255,0.05)", backdropFilter: "blur(8px)",
            borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
            padding: 20,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
              background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{payload.agentCard.name}</div>
              <div style={{ fontSize: 13, color: "#9AA4B2" }}>
                {payload.agentCard.agency}{payload.agentCard.suburb ? ` · ${payload.agentCard.suburb}` : ""}
              </div>
              {payload.agentCard.tagline && (
                <div style={{ fontSize: 12, color: "#7C8896", marginTop: 4 }}>{payload.agentCard.tagline}</div>
              )}
            </div>
            <div style={{ textAlign: "right", fontSize: 13, color: "#D6DCE5" }}>
              {payload.agentCard.phone && <div>{payload.agentCard.phone}</div>}
              {payload.agentCard.email && <div style={{ color: "#9AA4B2" }}>{payload.agentCard.email}</div>}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)", backdropFilter: "blur(8px)",
      borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)",
      padding: "14px 16px", textAlign: "center",
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#A6DAFF", textShadow: "0 0 20px rgba(166,218,255,0.4)" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#9AA4B2", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
  )
}
