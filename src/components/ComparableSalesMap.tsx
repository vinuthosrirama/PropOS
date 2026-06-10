/**
 * ComparableSalesMap
 * Live Leaflet/OpenStreetMap map showing subject property + comparable sales as pins.
 * No API key required — uses free CartoDB tiles.
 */
import { useEffect, useRef, useState } from "react"
import "leaflet/dist/leaflet.css"
import type { Map as LeafletMap } from "leaflet"
import { C } from "../data"

// Approximate suburb centre coordinates for SE Melbourne corridor
const SUBURB_COORDS: Record<string, [number, number]> = {
  "Berwick":          [-38.0354, 145.2901],
  "Officer":          [-38.0636, 145.4046],
  "Pakenham":         [-38.0700, 145.4878],
  "Narre Warren":     [-38.0219, 145.2943],
  "Narre Warren South": [-38.0570, 145.3060],
  "Clyde":            [-38.1189, 145.3554],
  "Clyde North":      [-38.1012, 145.3466],
  "Cranbourne":       [-38.1108, 145.2834],
  "Cranbourne North": [-38.0781, 145.2793],
  "Cranbourne East":  [-38.1073, 145.3155],
  "Cranbourne West":  [-38.1212, 145.2598],
  "Beaconsfield":     [-38.0520, 145.3616],
  "Nar Nar Goon":     [-38.0736, 145.5291],
  "Tynong":           [-38.0946, 145.5633],
  "Hampton Park":     [-38.0295, 145.2645],
  "Hallam":           [-38.0139, 145.2700],
  "Doveton":          [-37.9867, 145.2467],
  "Springvale":       [-37.9501, 145.1532],
  "Endeavour Hills":  [-37.9842, 145.2386],
  "Dandenong":        [-37.9873, 145.2158],
  "Dandenong North":  [-37.9682, 145.2142],
  "Keysborough":      [-37.9960, 145.1810],
  "Lyndhurst":        [-38.0671, 145.2434],
}

function getSuburbCoords(suburb: string): [number, number] {
  const key = Object.keys(SUBURB_COORDS).find(k =>
    suburb.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(suburb.toLowerCase())
  )
  return key ? SUBURB_COORDS[key] : [-38.0354, 145.2901] // default Berwick
}

// Seed-based deterministic offset so same comp always lands at same spot
function seededOffset(seed: number, range: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return ((x - Math.floor(x)) - 0.5) * range
}

export interface CompPin {
  address:    string
  soldPrice:  number
  beds:       number
  land:       number
  matchScore: number
  soldDate:   string
  isSubject?: boolean
}

interface Props {
  suburb:     string
  comps:      CompPin[]
  theme:      { primary: string }
  height?:    number
}

// Static fallback — shows comps as cards when Leaflet fails to render
function StaticCompFallback({ suburb, comps, theme, height }: Props) {
  const fmtK = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`
  return (
    <div style={{
      height, borderRadius: 12, overflow: "hidden",
      background: C.bg3, border: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>
          Comparable Sales · {suburb}
        </div>
        <div style={{ fontSize: 10, color: C.faint, marginLeft: "auto" }}>Map unavailable</div>
      </div>
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        {comps.map((comp, i) => {
          const isSubj = i === 0 || comp.isSubject
          const color = isSubj ? theme.primary : comp.matchScore >= 80 ? C.green : C.blue
          return (
            <div key={i} style={{
              padding: "9px 14px", display: "flex", alignItems: "center", gap: 10,
              borderBottom: `1px solid ${C.border}`,
              background: isSubj ? `${theme.primary}08` : "transparent",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isSubj ? "Subject property" : comp.address}
                </div>
                <div style={{ fontSize: 10, color: C.muted }}>
                  {comp.beds}bd{comp.land > 0 ? ` · ${comp.land}m²` : ""} · {comp.soldDate}
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>{fmtK(comp.soldPrice)}</div>
              {!isSubj && (
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, flexShrink: 0 }}>{comp.matchScore}%</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ComparableSalesMap({ suburb, comps, theme, height = 280 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LeafletMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) { try { mapRef.current.remove() } catch {} mapRef.current = null }

    let cancelled = false
    let recreateTimer: ReturnType<typeof setTimeout> | null = null
    let tileLoadTimer: ReturnType<typeof setTimeout> | null = null

    const createMap = (L: typeof import("leaflet"), lat: number, lng: number): boolean => {
      if (mapRef.current) { try { mapRef.current.remove() } catch {} mapRef.current = null }
      if (!containerRef.current || cancelled) return false

      // Guard: container must have positive dimensions before initialising
      const w = containerRef.current.offsetWidth
      const h = containerRef.current.offsetHeight
      if (w < 10 || h < 10) return false

      let map: LeafletMap
      try {
        map = L.map(containerRef.current, {
          center: [lat, lng],
          zoom: 14,
          zoomControl: true,
          scrollWheelZoom: false,
          attributionControl: false,
        })
      } catch {
        if (!cancelled) setFailed(true)
        return false
      }
      mapRef.current = map

      const isLight = document.documentElement.classList.contains("light-mode")
      const tileUrl = isLight
        ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"

      let tileErrorCount = 0
      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        subdomains: "abcd",
        opacity: 0.95,
      })

      // Fallback: if no tile loads within 8s, show static list
      if (tileLoadTimer) clearTimeout(tileLoadTimer)
      tileLoadTimer = setTimeout(() => {
        if (!cancelled) setFailed(true)
      }, 8_000)

      tileLayer.on("tileload", () => {
        if (tileLoadTimer) clearTimeout(tileLoadTimer)
        if (!cancelled) setLoading(false)
      })
      tileLayer.on("tileerror", () => {
        tileErrorCount++
        // If 3+ tiles fail, switch to static fallback immediately
        if (tileErrorCount >= 3 && !cancelled) setFailed(true)
      })
      tileLayer.addTo(map)

      const fmtK = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`

      comps.forEach((comp, i) => {
        const isSubject = i === 0 || comp.isSubject
        const color = isSubject
          ? theme.primary
          : comp.matchScore >= 80 ? "#64d090"
          : comp.matchScore >= 60 ? "#a6daff"
          : "#f59e0b"
        const compLat = isSubject ? lat : lat + seededOffset(comp.address.length + i * 7, 0.012)
        const compLng = isSubject ? lng : lng + seededOffset(comp.address.length + i * 13, 0.016)

        const label = isSubject ? "Subject property" : comp.address.split(" ").slice(0, 3).join(" ")
        const popup = `
          <div style="font-family:system-ui;font-size:12px;min-width:160px;padding:4px 0">
            <strong style="font-size:13px;color:#111">${label}</strong><br/>
            <span style="color:${color};font-weight:700;font-size:14px">${fmtK(comp.soldPrice)}</span><br/>
            <span style="color:#666">${comp.beds}bd · ${comp.land > 0 ? comp.land + "m² · " : ""}${comp.soldDate}</span>
            ${!isSubject ? `<br/><span style="color:#666">Match: ${comp.matchScore}%</span>` : ""}
          </div>
        `

        const circle = L.circleMarker([compLat, compLng], {
          radius:      isSubject ? 10 : 7,
          fillColor:   color,
          fillOpacity: 0.9,
          color:       "#ffffff",
          weight:      isSubject ? 3 : 1.5,
          opacity:     1,
          className:   "",
        })
        circle.bindPopup(popup, { className: "comp-popup" }).addTo(map)
      })

      const pins = comps.map((c, i) => {
        const isSubj = i === 0 || c.isSubject
        return [
          isSubj ? lat : lat + seededOffset(c.address.length + i * 7, 0.012),
          isSubj ? lng : lng + seededOffset(c.address.length + i * 13, 0.016),
        ] as [number, number]
      })

      if (pins.length > 1) {
        const bounds = L.latLngBounds(pins)
        try { map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 }) }
        catch { map.setView([lat, lng], 14) }
      } else {
        map.setView([lat, lng], 14)
      }
      return true
    }

    const initMap = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      import("leaflet").then(L => {
        if (cancelled || !containerRef.current) return
        if (mapRef.current) return

        const [lat, lng] = getSuburbCoords(suburb)

        // Phase 1: immediate render
        const ok = createMap(L, lat, lng)

        // Set up resize observer
        if (containerRef.current && typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => {
            if (!cancelled && mapRef.current) mapRef.current.invalidateSize()
          })
          ro.observe(containerRef.current)
          ;(containerRef.current as HTMLDivElement & { _ro?: ResizeObserver })._ro = ro
        }

        // Phase 2: recreate after 300ms so flex layout has settled
        if (ok) {
          recreateTimer = setTimeout(() => {
            if (!cancelled) createMap(L, lat, lng)
          }, 300)
        } else {
          // Container had zero dims on phase 1; retry after 500ms
          recreateTimer = setTimeout(() => {
            if (!cancelled) {
              const created = createMap(L, lat, lng)
              if (!created && !cancelled) setFailed(true)
            }
          }, 500)
        }
      }).catch(() => { if (!cancelled) setFailed(true) })
    }))
    initMap()

    return () => {
      cancelled = true
      if (recreateTimer) clearTimeout(recreateTimer)
      if (tileLoadTimer) clearTimeout(tileLoadTimer)
      const el = containerRef.current as (HTMLDivElement & { _ro?: ResizeObserver }) | null
      el?._ro?.disconnect()
      if (mapRef.current) { try { mapRef.current.remove() } catch {} mapRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suburb, comps.length])

  // Show static fallback if map failed to render
  if (failed) {
    return <StaticCompFallback suburb={suburb} comps={comps} theme={theme} height={height} />
  }

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", height }}>
      {/* Loading skeleton */}
      {loading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 2000,
          background: C.bg3,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ fontSize: 12, color: C.muted }}>Loading map…</div>
        </div>
      )}

      {/* Map legend — bottom-right so it doesn't block the map view */}
      <div style={{
        position: "absolute", bottom: 28, right: 8, zIndex: 1000,
        background: "rgba(4,7,13,0.82)", borderRadius: 8, padding: "6px 10px",
        display: "flex", flexDirection: "column", gap: 4, backdropFilter: "blur(4px)",
      }}>
        {[
          { color: theme.primary, label: "Subject property" },
          { color: "#64d090",     label: "Strong match (80+)" },
          { color: "#a6daff",     label: "Good match (60+)" },
          { color: "#f59e0b",     label: "Reference sale" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 4px ${color}99`, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: C.muted, whiteSpace: "nowrap" }}>{label}</span>
          </div>
        ))}
      </div>

      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Leaflet overrides */}
      <style>{`
        .leaflet-container { background: var(--c-bg3, #0e1220) !important; }
        .comp-popup .leaflet-popup-content-wrapper {
          background: var(--c-bg2, #0e1220);
          border: 1px solid var(--c-border, rgba(216,231,242,0.12));
          border-radius: 8px; color: var(--c-text, #d5dbe6);
        }
        .comp-popup .leaflet-popup-tip { background: var(--c-bg2, #0e1220); }
        .leaflet-control-zoom a {
          background: var(--c-bg3, #161c28) !important;
          color: var(--c-blue, #a6daff) !important;
          border-color: var(--c-border, rgba(166,218,255,0.2)) !important;
        }
      `}</style>
    </div>
  )
}
