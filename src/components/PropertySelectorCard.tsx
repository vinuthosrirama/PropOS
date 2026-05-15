import { FONT, type AgencyTheme, type PortfolioProperty } from "../data"

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  if (color.startsWith("rgb(")) return color.replace("rgb(", "rgba(").replace(")", `,${alpha})`)
  if (color.startsWith("rgba(")) return color.replace(/,[\d.]+\)$/, `,${alpha})`)
  return color
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`

export function PropertySelectorCard({ property, theme, onSelect }: {
  property: PortfolioProperty
  theme: AgencyTheme
  onSelect: () => void
}) {
  const priceLabel = property.priceMin && property.priceMax
    ? `${fmt(property.priceMin)} – ${fmt(property.priceMax)}`
    : fmt(property.price)

  const dateLabel = property.soldDate
    ? `Sold ${property.soldDate}`
    : property.openDate ?? null

  const specs = [
    `${property.beds} bd`,
    `${property.baths} ba`,
    `${property.cars} car`,
    property.land ? `${property.land} m²` : null,
  ].filter(Boolean) as string[]

  return (
    <div
      onClick={onSelect}
      style={{
        borderRadius: 16,
        border: `1px solid ${withAlpha(theme.primary, 0.25)}`,
        overflow: "hidden",
        position: "relative",
        height: 280,
        cursor: "pointer",
        transition: "border 0.15s, box-shadow 0.15s, transform 0.15s",
        fontFamily: FONT,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = withAlpha(theme.primary, 0.7)
        el.style.boxShadow = `0 0 28px ${theme.glow}`
        el.style.transform = "translateY(-2px)"
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = withAlpha(theme.primary, 0.25)
        el.style.boxShadow = "none"
        el.style.transform = "translateY(0)"
      }}
    >
      {/* Layer 1 — full-bleed photo */}
      <img
        src={property.image}
        alt={property.address}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />

      {/* Layer 2 — agency colour gradient: transparent at top → solid at bottom */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(180deg, ${withAlpha(theme.primary, 0)} 0%, ${withAlpha(theme.primary, 0)} 28%, ${withAlpha(theme.primary, 0.75)} 62%, ${withAlpha(theme.primary, 1)} 100%)`,
      }} />

      {/* Layer 3 — text content */}
      <div style={{ position: "absolute", bottom: 16, left: 14, right: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.25, marginBottom: 3 }}>
          {property.address}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginBottom: 7 }}>
          {property.suburb} {property.state}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 5 }}>
          {priceLabel}
        </div>
        {dateLabel && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.70)", marginBottom: 5 }}>
            {dateLabel}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          {specs.map(s => (
            <span key={s} style={{ fontSize: 10, color: "rgba(255,255,255,0.70)" }}>{s}</span>
          ))}
        </div>
      </div>

    </div>
  )
}
