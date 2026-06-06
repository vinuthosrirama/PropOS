/**
 * ComparableSalesMap
 * Live Leaflet/OpenStreetMap map showing subject property + comparable sales as pins.
 * No API key required — uses free CartoDB Dark Matter tiles.
 */
import { useEffect, useRef } from "react"
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

export default function ComparableSalesMap({ suburb, comps, theme, height = 280 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LeafletMap | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    // Avoid double-init (strict mode / hot reload)
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

    let cancelled = false

    // Two-phase init:
    // Phase 1 (immediate): render map so something appears quickly.
    // Phase 2 (300ms): destroy + recreate with the correct container size.
    // Leaflet reads offsetWidth at L.map() init time. In a flex layout the
    // container may not have its final width yet, so tiles load only on one side.
    // Recreating after 300ms guarantees the flex layout has fully settled.
    let recreateTimer: ReturnType<typeof setTimeout> | null = null

    const createMap = (L: typeof import("leaflet"), lat: number, lng: number) => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      if (!containerRef.current) return

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 14,
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false,
      })
      mapRef.current = map

      // Use light or dark tiles depending on current colour scheme
      const isLight = document.documentElement.classList.contains("light-mode")
      const tileUrl = isLight
        ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      L.tileLayer(tileUrl, {
        maxZoom: 19,
        subdomains: "abcd",
        opacity: 0.95,
      }).addTo(map)

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
        const svgSize = isSubject ? 18 : 14
        const svgIcon = L.divIcon({
          className: "",
          iconSize:  [svgSize, svgSize],
          iconAnchor:[svgSize / 2, svgSize / 2],
          html: `
            <div style="
              width:${svgSize}px; height:${svgSize}px; border-radius:50%;
              background:${color}; border:2px solid ${isSubject ? "#fff" : color + "cc"};
              box-shadow: 0 0 0 4px ${color}33, 0 0 12px ${color}66;
              ${isSubject ? `animation: pulse-pin 2s ease-out infinite;` : ""}
            "></div>
            <style>
              @keyframes pulse-pin {
                0%, 100% { box-shadow: 0 0 0 4px ${color}44, 0 0 12px ${color}55; }
                50%       { box-shadow: 0 0 0 8px ${color}22, 0 0 20px ${color}44; }
              }
            </style>
          `,
        })
        const label = isSubject ? "Subject property" : comp.address.split(" ").slice(0, 3).join(" ")
        const popup = `
          <div style="font-family:system-ui;font-size:12px;min-width:160px">
            <strong style="font-size:13px">${label}</strong><br/>
            <span style="color:${color};font-weight:700;font-size:14px">${fmtK(comp.soldPrice)}</span><br/>
            <span style="color:#888">${comp.beds}bd · ${comp.land}m² · ${comp.soldDate}</span>
            ${!isSubject ? `<br/><span style="color:#888">Match: ${comp.matchScore}%</span>` : ""}
          </div>
        `
        L.marker([compLat, compLng], { icon: svgIcon })
          .bindPopup(popup, { className: "comp-popup" })
          .addTo(map)
      })

      const bounds = L.latLngBounds(
        comps.map((c, i) => {
          const isSubj = i === 0 || c.isSubject
          return [
            isSubj ? lat : lat + seededOffset(c.address.length + i * 7, 0.012),
            isSubj ? lng : lng + seededOffset(c.address.length + i * 13, 0.016),
          ] as [number, number]
        })
      )
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 })
      return bounds
    }

    const initMap = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      // Leaflet CSS must be loaded before the map renders — inject once
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link")
        link.id   = "leaflet-css"
        link.rel  = "stylesheet"
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        document.head.appendChild(link)
      }

      import("leaflet").then(L => {
        if (cancelled || !containerRef.current) return
        if (mapRef.current) return

        const [lat, lng] = getSuburbCoords(suburb)

        // Phase 1: immediate render
        createMap(L, lat, lng)

        // Set up resize observer once — survives phase-2 recreation
        if (containerRef.current && typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => {
            if (!cancelled && mapRef.current) mapRef.current.invalidateSize()
          })
          ro.observe(containerRef.current)
          ;(containerRef.current as HTMLDivElement & { _ro?: ResizeObserver })._ro = ro
        }

        // Phase 2: destroy + recreate after 300ms so flex layout has settled
        recreateTimer = setTimeout(() => {
          if (!cancelled) createMap(L, lat, lng)
        }, 300)
      })
    }))
    initMap()

    return () => {
      cancelled = true
      if (recreateTimer) clearTimeout(recreateTimer)
      const el = containerRef.current as (HTMLDivElement & { _ro?: ResizeObserver }) | null
      el?._ro?.disconnect()
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suburb, comps.length])

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", height }}>
      {/* Map legend */}
      <div style={{
        position: "absolute", top: 8, left: 8, zIndex: 1000,
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

      {/* Leaflet overrides — adapts to light/dark via CSS vars */}
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
