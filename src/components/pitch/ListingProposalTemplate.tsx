import { getAgencyTheme, FONT, DEFAULT_THEME } from "../../data"
import type { PitchAgentInfo } from "./PriceUpdateTemplate"
import TrackedSection from "./TrackedSection"

export interface ProposalComparableSale {
  address: string
  price: number
  date: string
  beds: number
  baths?: number
  land?: number
  result?: "auction" | "private" | "sold_prior"
}

export interface ProposalTimeline {
  label: string
  week: number
  description: string
}

export interface ProposalTestimonial {
  quote: string
  author: string
  suburb?: string
}

export interface ProposalMarketingItem {
  channel: string
  detail: string
}

export interface ListingProposalPayload {
  agentCard: PitchAgentInfo
  vendorName?: string
  propertyAddress: string
  suburb: string
  beds?: number
  baths?: number
  land?: number
  propertyType?: string
  methodOfSale: "auction" | "private_sale" | "expressions_of_interest"
  estimatedRange?: { low: number; high: number }
  comparableSales?: ProposalComparableSale[]
  agencyStats?: {
    salesCount: number
    avgDaysOnMarket: number
    clearanceRate?: number
    avgAboveGuidePct?: number
    yearsInMarket?: number
  }
  marketingPlan?: ProposalMarketingItem[]
  timeline?: ProposalTimeline[]
  testimonials?: ProposalTestimonial[]
  personalNote?: string
}

const METHOD_COPY: Record<ListingProposalPayload["methodOfSale"], { title: string; description: string; icon: string }> = {
  auction: {
    title: "Auction",
    icon: "🔨",
    description: "Auction creates transparent, competitive bidding between motivated buyers — driving the highest possible price in the shortest timeframe. With strong current buyer demand, this is the recommended method for your property.",
  },
  private_sale: {
    title: "Private Sale",
    icon: "📋",
    description: "Private sale allows flexible negotiation and a set price range, giving you control over the process. Buyers can make offers any time, and you decide when to accept — ideal when you want certainty and a predictable timeline.",
  },
  expressions_of_interest: {
    title: "Expressions of Interest",
    icon: "📬",
    description: "EOI campaigns run for a fixed period, inviting serious buyers to submit their best offer confidentially. This method suits premium or unique properties where a price guide alone may undersell — buyers compete without the pressure of a live auction.",
  },
}

function fmtPrice(n: number): string {
  return "$" + n.toLocaleString("en-AU")
}

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString("en-AU", { month: "short", year: "numeric" }) } catch { return d }
}

const DEFAULT_TIMELINE: ProposalTimeline[] = [
  { week: 1, label: "Pre-launch", description: "Photography, floor plan, staging advice, copy signed off." },
  { week: 2, label: "Live on market", description: "Domain, REA, social launch. Open homes begin." },
  { week: 3, label: "Open homes", description: "Mid-campaign buyer follow-up, feedback report sent to you." },
  { week: 4, label: "Auction / Close", description: "Final buyer inspections, auction day (or offer review for private sale)." },
]

const DEFAULT_MARKETING: ProposalMarketingItem[] = [
  { channel: "realestate.com.au", detail: "Premier listing with feature photography" },
  { channel: "domain.com.au", detail: "Highlighted listing + suburb email" },
  { channel: "Social media", detail: "Facebook & Instagram targeted to active buyers in your suburb" },
  { channel: "Agent database", detail: "Direct outreach to matched buyers already in the system" },
  { channel: "Letterbox drop", detail: "Targeted 500-home radius campaign" },
]

export default function ListingProposalTemplate({ payload }: { payload: ListingProposalPayload }) {
  const theme = getAgencyTheme(payload.agentCard?.agency ?? "") ?? DEFAULT_THEME
  const agent = payload.agentCard
  const initials = agent.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const method = METHOD_COPY[payload.methodOfSale] ?? METHOD_COPY.auction
  const timeline = payload.timeline ?? DEFAULT_TIMELINE
  const marketing = payload.marketingPlan ?? DEFAULT_MARKETING

  const bg = "#04070D"
  const bg2 = "#10131C"
  const border = "#1E2433"
  const text = "#D5DBE6"
  const muted = "#6B7280"

  const Section = ({ label }: { label: string }) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: muted, marginBottom: 14, marginTop: 32 }}>
      {label}
    </div>
  )

  return (
    <div style={{
      minHeight: "100vh", background: bg, fontFamily: FONT, color: text,
      maxWidth: 720, margin: "0 auto", padding: "0 0 80px",
    }}>

      {/* Hero */}
      <TrackedSection id="cover">
      <div style={{
        background: `linear-gradient(160deg, ${theme.primary}28 0%, ${bg} 55%)`,
        borderBottom: `1px solid ${border}`,
        padding: "48px 32px 40px",
      }}>
        {/* Agency badge */}
        <div style={{
          display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
          color: theme.primary, background: theme.dim, borderRadius: 20, padding: "4px 12px", marginBottom: 20,
        }}>
          {agent.agency}
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Listing Proposal
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, color: text, margin: "0 0 6px", lineHeight: 1.2 }}>
          {payload.propertyAddress}
        </h1>
        <div style={{ fontSize: 14, color: muted, marginBottom: 20 }}>
          Prepared for {payload.vendorName ?? "the vendor"} · {new Date().toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
        </div>

        {/* Estimate range */}
        {payload.estimatedRange && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 12,
            background: `${theme.primary}18`, border: `1px solid ${theme.primary}44`,
            borderRadius: 12, padding: "14px 20px",
          }}>
            <div>
              <div style={{ fontSize: 11, color: muted, marginBottom: 4, fontWeight: 600 }}>ESTIMATED VALUE RANGE</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: theme.primary, fontFamily: "'Instrument Serif', serif" }}>
                {fmtPrice(payload.estimatedRange.low)} – {fmtPrice(payload.estimatedRange.high)}
              </div>
            </div>
          </div>
        )}
      </div>
      </TrackedSection>

      <div style={{ padding: "0 24px" }}>

        {/* Personal note */}
        {payload.personalNote && (
          <TrackedSection id="market-context">
            <Section label="A NOTE FROM YOUR AGENT" />
            <div style={{
              background: bg2, border: `1px solid ${theme.primary}33`,
              borderLeft: `3px solid ${theme.primary}`,
              borderRadius: 12, padding: "18px 20px",
            }}>
              <div style={{ fontSize: 14, color: text, lineHeight: 1.7 }}>{payload.personalNote}</div>
              {/* Agent sig */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                {agent.photoUrl ? (
                  <img src={agent.photoUrl} alt={agent.name} style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${theme.primary}` }} />
                ) : (
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: theme.dim, border: `2px solid ${theme.primary}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: theme.primary,
                  }}>{initials}</div>
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{agent.name}</div>
                  <div style={{ fontSize: 11, color: muted }}>{agent.agency} · {agent.suburb}</div>
                </div>
              </div>
            </div>
          </TrackedSection>
        )}

        {/* Method of sale */}
        <TrackedSection id="market-context">
        <Section label="RECOMMENDED METHOD OF SALE" />
        <div style={{
          background: bg2, border: `1px solid ${theme.primary}33`,
          borderRadius: 14, padding: "22px 22px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: `${theme.primary}22`, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>{method.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.primary }}>{method.title}</div>
          </div>
          <div style={{ fontSize: 14, color: text, lineHeight: 1.7 }}>{method.description}</div>
        </div>
        </TrackedSection>

        {/* Comparable sales */}
        {payload.comparableSales && payload.comparableSales.length > 0 && (
          <TrackedSection id="comparable-sales">
            <Section label="COMPARABLE SALES" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {payload.comparableSales.map((s, i) => (
                <div key={i} style={{
                  background: bg2, border: `1px solid ${border}`, borderRadius: 10,
                  padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{s.address}</div>
                    <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>
                      {[s.beds && `${s.beds}bd`, s.baths && `${s.baths}ba`, s.land && `${s.land}m²`].filter(Boolean).join(" · ")}
                      {" · "}{fmtDate(s.date)}
                      {s.result === "auction" ? " · Auction" : s.result === "sold_prior" ? " · Sold Prior" : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: theme.primary, whiteSpace: "nowrap" }}>{fmtPrice(s.price)}</div>
                </div>
              ))}
            </div>
          </TrackedSection>
        )}

        {/* Agency stats */}
        {payload.agencyStats && (
          <TrackedSection id="agency-profile">
            <Section label="AGENCY PERFORMANCE" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {([
                { label: "Properties sold", value: String(payload.agencyStats.salesCount) },
                { label: "Avg. days on market", value: `${payload.agencyStats.avgDaysOnMarket}d` },
                payload.agencyStats.clearanceRate != null && { label: "Auction clearance", value: `${payload.agencyStats.clearanceRate}%` },
                payload.agencyStats.avgAboveGuidePct != null && { label: "Avg. above guide", value: `+${payload.agencyStats.avgAboveGuidePct}%` },
              ].filter(Boolean) as { label: string; value: string }[]).map(({ label, value }) => (
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
          </TrackedSection>
        )}

        {/* Marketing plan */}
        <TrackedSection id="marketing-plan">
        <Section label="MARKETING PLAN" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {marketing.map((item, i) => (
            <div key={i} style={{
              background: bg2, border: `1px solid ${border}`, borderRadius: 10,
              padding: "12px 16px", display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: theme.primary, flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{item.channel}</div>
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
        </TrackedSection>

        {/* Campaign timeline */}
        <TrackedSection id="timeline">
        <Section label="CAMPAIGN TIMELINE" />
        <div style={{ position: "relative", paddingLeft: 32 }}>
          <div style={{
            position: "absolute", left: 10, top: 8, bottom: 8, width: 2,
            background: `linear-gradient(to bottom, ${theme.primary}, ${theme.primary}22)`,
          }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {timeline.map((step, i) => (
              <div key={i} style={{ position: "relative" }}>
                <div style={{
                  position: "absolute", left: -26, top: 2,
                  width: 14, height: 14, borderRadius: "50%",
                  background: i === 0 ? theme.primary : bg2,
                  border: `2px solid ${theme.primary}`,
                }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.primary, marginBottom: 3 }}>
                  WEEK {step.week} · {step.label.toUpperCase()}
                </div>
                <div style={{ fontSize: 13, color: text }}>{step.description}</div>
              </div>
            ))}
          </div>
        </div>
        </TrackedSection>

        {/* Testimonials */}
        {payload.testimonials && payload.testimonials.length > 0 && (
          <TrackedSection id="testimonials">
            <Section label="CLIENT REVIEWS" />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {payload.testimonials.map((t, i) => (
                <div key={i} style={{
                  background: bg2, border: `1px solid ${border}`, borderRadius: 12,
                  padding: "18px 20px",
                }}>
                  <div style={{ fontSize: 20, color: theme.primary, marginBottom: 8, lineHeight: 1 }}>"</div>
                  <div style={{ fontSize: 14, color: text, lineHeight: 1.65, fontStyle: "italic", marginBottom: 12 }}>
                    {t.quote}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: muted }}>
                    — {t.author}{t.suburb ? `, ${t.suburb}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </TrackedSection>
        )}

        {/* CTA */}
        <TrackedSection id="next-steps">
        <div style={{
          margin: "32px 0 0",
          background: `linear-gradient(135deg, ${theme.primary}18, ${theme.primary}08)`,
          border: `1px solid ${theme.primary}44`,
          borderRadius: 16, padding: "28px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: text, marginBottom: 6 }}>
            Ready to take the next step?
          </div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 24 }}>
            Let's lock in a time to discuss your options — no obligation, just a straight conversation about what's right for you.
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
        </TrackedSection>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 40, fontSize: 11, color: muted }}>
          Sent via PropOS by AddVantage
        </div>
      </div>
    </div>
  )
}
