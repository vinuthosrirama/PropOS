import { FONT, type AgentProfile } from "../../data"
import type { PropertySLM } from "../../data/propertySlm"

/**
 * Property Pitch — Peake-branded listing showcase.
 * Hero photo + gradient overlay, SLM-driven detail sections, and a
 * "Recently Sold Nearby" comparable as social proof.
 */

const PEAKE_PRIMARY = "#3f0278"
const PEAKE_MID = "#7B35BE"
const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif"

export interface PropertyPitchComparable {
  address: string
  price: number
  date: string
  beds: number
  imageUrl?: string
}

export interface PropertyPitchProps {
  slm: PropertySLM
  agent: AgentProfile
  comparable: PropertyPitchComparable
  heroImageUrl?: string
}

const DEFAULT_HERO = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1600&q=80"
const DEFAULT_COMP_IMG = "https://images.unsplash.com/photo-1605146769289-440113cc3d00?auto=format&fit=crop&w=800&q=80"

function money(n: number): string {
  return "$" + n.toLocaleString("en-AU")
}

function isSet<T>(v: T | "TBD"): v is T {
  return v !== "TBD"
}

function clean(s: string): string {
  return s.replace(/—|–/g, ",")
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
        color: "#D6BBFF", marginBottom: 14,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)", backdropFilter: "blur(8px)",
      border: "1px solid rgba(166,218,255,0.15)", borderRadius: 12,
      padding: "14px 12px", textAlign: "center",
    }}>
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#9AA4B2", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", padding: "8px 16px", borderRadius: 999,
      background: "rgba(123,53,190,0.14)", border: "1px solid rgba(166,218,255,0.15)",
      fontSize: 13, color: "#E8DCFF", marginRight: 8, marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

export default function PropertyPitchTemplate({ slm, agent, comparable, heroImageUrl }: PropertyPitchProps) {
  const initials = agent.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()

  const priceGuide = isSet(slm.priceMin) && isSet(slm.priceMax)
    ? (slm.priceMin === slm.priceMax ? money(slm.priceMin) : `${money(slm.priceMin)} – ${money(slm.priceMax)}`)
    : "Contact agent for price guide"

  const statItems: { value: string; label: string }[] = []
  if (isSet(slm.landSqm)) statItems.push({ value: `${slm.landSqm}m²`, label: "Land" })
  if (isSet(slm.houseSqm)) statItems.push({ value: `${slm.houseSqm}m²`, label: "Living" })
  if (isSet(slm.yearBuilt)) statItems.push({ value: String(slm.yearBuilt), label: "Built" })
  if (isSet(slm.alfrescoSqm) && slm.alfrescoSqm > 0) statItems.push({ value: `${slm.alfrescoSqm}m²`, label: "Alfresco" })

  const lifestyleItems: { label: string; value: string }[] = []
  if (isSet(slm.primarySchool)) lifestyleItems.push({ label: "Primary school", value: clean(slm.primarySchool) })
  if (isSet(slm.trainLine)) lifestyleItems.push({ label: "Train", value: clean(slm.trainLine) })
  if (isSet(slm.distanceToShoppingKm)) lifestyleItems.push({ label: "Shopping", value: `${slm.distanceToShoppingKm}km away` })
  if (isSet(slm.distanceToFreewayKm)) lifestyleItems.push({ label: "Freeway", value: `${slm.distanceToFreewayKm}km away` })
  if (isSet(slm.suburb5yrGrowthPct)) lifestyleItems.push({ label: "5yr growth", value: `${slm.suburb5yrGrowthPct}%` })

  const features: string[] = []
  if (isSet(slm.heatingType)) features.push(clean(slm.heatingType).split(",")[0].split("(")[0].trim())
  if (isSet(slm.airConType)) features.push(clean(slm.airConType).split(",")[0].split("(")[0].trim())
  if (isSet(slm.outdoorFeatures) && /alfresco|entertaining/i.test(slm.outdoorFeatures)) features.push("Alfresco entertaining")
  if (isSet(slm.nbnType)) features.push(slm.nbnType.split("(")[0].trim())
  if (slm.petsAllowed === true) features.push("Pets allowed")
  if (slm.solarKw !== "TBD" && typeof slm.solarKw === "number" && slm.solarKw > 0) features.push(`${slm.solarKw}kW solar`)

  const aboutText = (isSet(slm.neighbourhoodDescription)
    ? slm.neighbourhoodDescription.split(".").slice(0, 2).join(".") + "."
    : `A well-presented ${isSet(slm.beds) ? slm.beds : ""} bedroom ${isSet(slm.propertyType) ? String(slm.propertyType).toLowerCase() : "home"} in ${slm.suburb}.`
  ).replace(/—|–/g, ",")

  const hero = heroImageUrl ?? DEFAULT_HERO
  const compImg = comparable.imageUrl ?? DEFAULT_COMP_IMG

  return (
    <div style={{ background: "#04070D", color: "#F5F7FA", fontFamily: FONT, minHeight: "100vh" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&display=swap');`}</style>

      {/* Hero */}
      <div style={{
        position: "relative", height: 440,
        backgroundImage: `url(${hero})`, backgroundSize: "cover", backgroundPosition: "center",
        backgroundColor: PEAKE_PRIMARY,
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(180deg, rgba(63,2,120,0.30) 0%, rgba(4,7,13,0.55) 55%, #04070D 100%)`,
        }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 24px 32px" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#D6BBFF", marginBottom: 10 }}>
              For Sale · {slm.suburb}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 700, lineHeight: 1.15, marginBottom: 10 }}>
              {slm.address}
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.85)" }}>
              {[
                isSet(slm.beds) ? `${slm.beds} bed` : null,
                isSet(slm.baths) ? `${slm.baths} bath` : null,
                isSet(slm.cars) ? `${slm.cars} car` : null,
                isSet(slm.propertyType) ? String(slm.propertyType) : null,
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 24px 64px" }}>

        {/* Price guide */}
        <div style={{
          background: `linear-gradient(135deg, ${PEAKE_MID}, ${PEAKE_PRIMARY})`,
          borderRadius: 16, padding: "22px 24px", marginBottom: 28, textAlign: "center",
          boxShadow: `0 12px 32px rgba(63,2,120,0.35)`,
        }}>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.85, marginBottom: 6 }}>
            Price Guide
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700 }}>
            {priceGuide}
          </div>
        </div>

        {/* Quick stats */}
        {statItems.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${statItems.length}, 1fr)`, gap: 10, marginBottom: 28 }}>
            {statItems.map(s => <StatCard key={s.label} value={s.value} label={s.label} />)}
          </div>
        )}

        {/* About this home */}
        <Section title="About This Home">
          <div style={{
            background: "rgba(255,255,255,0.05)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(166,218,255,0.15)", borderRadius: 16, padding: 20,
          }}>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "#D6DCE5", margin: 0 }}>
              {aboutText}
            </p>
          </div>
        </Section>

        {/* Lifestyle */}
        {lifestyleItems.length > 0 && (
          <Section title="The Lifestyle">
            <div style={{
              background: "rgba(255,255,255,0.05)", backdropFilter: "blur(8px)",
              border: "1px solid rgba(166,218,255,0.15)", borderRadius: 16, overflow: "hidden",
            }}>
              {lifestyleItems.map((item, i) => (
                <div key={item.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 20px",
                  borderBottom: i < lifestyleItems.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}>
                  <span style={{ fontSize: 13, color: "#9AA4B2" }}>{item.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", textAlign: "right", maxWidth: "60%" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Features */}
        {features.length > 0 && (
          <Section title="Features">
            <div>
              {features.map(f => <Pill key={f}>{f}</Pill>)}
            </div>
          </Section>
        )}

        {/* Recently sold nearby */}
        <Section title="Recently Sold Nearby">
          <div style={{
            background: "rgba(255,255,255,0.05)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(166,218,255,0.15)", borderRadius: 16, padding: 16,
            display: "flex", gap: 16, alignItems: "center",
          }}>
            <img
              src={compImg}
              alt={comparable.address}
              style={{ width: 110, height: 110, borderRadius: 12, objectFit: "cover", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{comparable.address}</div>
              <div style={{ fontSize: 12, color: "#9AA4B2", marginTop: 2 }}>{comparable.beds}bd · {comparable.date}</div>
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: "#D6BBFF", marginTop: 6 }}>
                {money(comparable.price)}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#9AA4B2", marginTop: 10, lineHeight: 1.6 }}>
            A strong recent result nearby, supporting the price guide for {slm.address}.
          </p>
        </Section>

        {/* Agent card */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          background: "rgba(255,255,255,0.05)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(166,218,255,0.15)", borderRadius: 16, padding: 20, marginBottom: 16,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
            background: `linear-gradient(135deg, ${PEAKE_MID}, ${PEAKE_PRIMARY})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{agent.name}</div>
            <div style={{ fontSize: 13, color: "#9AA4B2" }}>{agent.agency} · {agent.suburb}</div>
            {agent.tagline && <div style={{ fontSize: 12, color: "#7C8896", marginTop: 4 }}>{agent.tagline}</div>}
          </div>
          <div style={{ textAlign: "right", fontSize: 13, color: "#D6DCE5" }}>
            <div>{agent.phone}</div>
            <div style={{ color: "#9AA4B2" }}>{agent.email}</div>
          </div>
        </div>

        {/* CTA */}
        <button style={{
          width: "100%", padding: "16px 24px", borderRadius: 12, border: "none", cursor: "pointer",
          background: `linear-gradient(135deg, ${PEAKE_MID}, ${PEAKE_PRIMARY})`,
          color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: FONT,
          boxShadow: `0 8px 24px rgba(63,2,120,0.35)`,
        }}>
          Book a Private Inspection
        </button>
      </div>
    </div>
  )
}
