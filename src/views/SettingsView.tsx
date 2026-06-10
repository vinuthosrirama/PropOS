import { useState, useEffect } from "react"
import { useBreakpoint } from "../hooks/useBreakpoint"
import { C, FONT, PORTFOLIO_ACTIVE, PORTFOLIO_SOLD, PAS_PORTFOLIO_ACTIVE, PAS_PORTFOLIO_SOLD, getAgencyTheme, getPortfolioForAgent, type AgentProfile, type VendorDisplaySettings, type PortfolioProperty } from "../data"
import {
  loadSLMForProperty, saveSLMForProperty, resetSLMForProperty,
  getSLMCompleteness, type PropertySLM, type PropertyQA
} from "../data/propertySlm"
import { readPropertySLMFromSheet, writeSLMFieldToSheet, sheetsConnected } from "../lib/sheet"
import AnalyticsDashboard from "../components/AnalyticsDashboard"
import { loadCorpus, saveCorpus, type TrainingEntry } from "../lib/voiceContext"
import { authFetch } from "../lib/authFetch"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function camelToLabel(key: string): string {
  // Special-case overrides for units / clarity
  const overrides: Record<string, string> = {
    landSqm: "Land (sqm)",
    houseSqm: "House Size (sqm)",
    frontageMetre: "Frontage (m)",
    depthMetre: "Depth (m)",
    alfrescoSqm: "Alfresco (sqm)",
    gardenSqm: "Garden (sqm)",
    priceMin: "Price Min ($)",
    priceMax: "Price Max ($)",
    vendorReserve: "Vendor Reserve ($)",
    depositPct: "Deposit (%)",
    rentalAppraisalLow: "Rental Appraisal Low ($/wk)",
    rentalAppraisalHigh: "Rental Appraisal High ($/wk)",
    grossYieldAtAsk: "Gross Yield at Ask (%)",
    councilRates: "Council Rates ($/yr)",
    waterRates: "Water Rates ($/yr)",
    bodyCorporateFees: "Body Corporate Fees ($/yr)",
    stampDutyEstimate: "Stamp Duty Estimate ($)",
    depreciationYear1Est: "Depreciation Year 1 Est ($)",
    distanceToTrainKm: "Distance to Train (km)",
    distanceToFreewayKm: "Distance to Freeway (km)",
    distanceToShoppingKm: "Distance to Shopping (km)",
    nearestHospitalKm: "Nearest Hospital (km)",
    suburb5yrGrowthPct: "Suburb 5-yr Growth (%)",
    suburbMedianPrice: "Suburb Median Price ($)",
    clearanceRatePct: "Clearance Rate (%)",
    solarKw: "Solar (kW)",
    s32Status: "S32 Status",
    nbnType: "NBN Type",
    evCharging: "EV Charging",
  }
  if (overrides[key]) return overrides[key]
  // camelCase -> Title Case with spaces
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

function getFieldType(key: string, _slm?: PropertySLM): "string" | "number" | "boolean" {
  const boolFields = new Set([
    "pool", "shed", "outdoorEntertaining",
    "ownerOccupied", "contaminatedLand", "ownerBuilderWork", "titlesOfficeReady",
    "batteryStorage", "evCharging", "waterTank", "alarmSystem", "smartHome",
    "disabilityAccess", "petsAllowed",
    "subdivisionPotential", "dualOccupancyPotential", "grannyFlatApproved",
    "flightPathFlag", "floodZone", "previousOffers", "tenantInPlace",
  ])
  const numFields = new Set([
    "beds", "baths", "cars", "landSqm", "houseSqm", "yearBuilt",
    "frontageMetre", "depthMetre", "gardenSqm", "alfrescoSqm",
    "priceMin", "priceMax", "vendorReserve", "settlementTermsDays", "depositPct",
    "rentalAppraisalLow", "rentalAppraisalHigh", "grossYieldAtAsk",
    "councilRates", "waterRates", "bodyCorporateFees", "stampDutyEstimate",
    "depreciationYear1Est",
    "distanceToTrainKm", "distanceToFreewayKm", "distanceToShoppingKm",
    "nearestHospitalKm", "suburb5yrGrowthPct", "suburbMedianPrice",
    "daysOnMarketAvg", "clearanceRatePct",
    "solarKw", "vendorTimelineDays", "daysOnMarket",
  ])
  if (boolFields.has(key)) return "boolean"
  if (numFields.has(key)) return "number"
  return "string"
}

const SECTION_FIELDS: { label: string; fields: string[] }[] = [
  {
    label: "Physical",
    fields: [
      "beds", "baths", "cars", "landSqm", "houseSqm", "yearBuilt", "propertyType",
      "frontageMetre", "depthMetre", "propertyShape", "orientation", "pool",
      "gardenSqm", "shed", "outdoorEntertaining", "alfrescoSqm", "roofType",
      "externalCladding", "construction", "floorplanConfig",
    ],
  },
  {
    label: "Legal and Title",
    fields: [
      "titleType", "easements", "covenants", "overlays", "s32Status", "encumbrances",
      "ownerOccupied", "zoning", "rightOfWay", "sewerEasement", "contaminatedLand",
      "buildingPermitsOutstanding", "ownerBuilderWork", "titlesOfficeReady",
      "section32CompletionDate",
    ],
  },
  {
    label: "Financial",
    fields: [
      "priceMin", "priceMax", "vendorReserve", "settlementTermsDays", "depositPct",
      "rentalAppraisalLow", "rentalAppraisalHigh", "grossYieldAtAsk", "councilRates",
      "waterRates", "bodyCorporateFees", "stampDutyEstimate", "landTaxThreshold",
      "depreciationYear1Est", "capitalGainsHistory",
    ],
  },
  {
    label: "Location and Suburb",
    fields: [
      "primarySchool", "primarySchoolRating", "secondarySchool", "secondarySchoolRating",
      "schoolZoneCatchment", "distanceToTrainKm", "trainLine", "distanceToFreewayKm",
      "distanceToShoppingKm", "nearestHospitalKm", "suburb5yrGrowthPct", "suburbMedianPrice",
      "daysOnMarketAvg", "clearanceRatePct", "comparableSales",
    ],
  },
  {
    label: "Features and Condition",
    fields: [
      "kitchenRenovated", "bathroomRenovated", "flooringType", "airConType", "heatingType",
      "solarKw", "batteryStorage", "evCharging", "nbnType", "waterTank", "alarmSystem",
      "smartHome", "disabilityAccess", "petsAllowed", "outdoorFeatures",
    ],
  },
  {
    label: "Planning and Vendor",
    fields: [
      "subdivisionPotential", "dualOccupancyPotential", "grannyFlatApproved", "extensionPotential",
      "councilDevelopmentHistory", "neighbourhoodDescription", "trafficNoiseLevel", "flightPathFlag",
      "futureInfrastructure", "floodZone", "vendorMotivation", "vendorTimelineDays",
      "previousOffers", "daysOnMarket", "priceReductionHistory", "tenantInPlace",
      "tenantLeaseEndDate", "vendorPreferredSettlement", "vendorFlexOnInclusions", "inclusions",
    ],
  },
]

function getPropertyIdsForAgent(agent: AgentProfile): number[] {
  const { sold, active } = getPortfolioForAgent(agent)
  return [...sold.map(p => p.id), ...active.map(p => p.id)]
}

function getPropertyMeta(id: number): {
  address: string
  status: "active" | "sold"
  soldDate?: string
  beds: number
  baths: number
  land: number
} {
  // Check all known portfolios
  const allSold = [...PORTFOLIO_SOLD, ...PAS_PORTFOLIO_SOLD]
  const allActive = [...PORTFOLIO_ACTIVE, ...PAS_PORTFOLIO_ACTIVE]
  const sold = allSold.find(p => p.id === id)
  if (sold) {
    return {
      address: sold.address,
      status: "sold",
      soldDate: sold.soldDate,
      beds: sold.beds,
      baths: sold.baths,
      land: sold.land ?? 0,
    }
  }
  const active = allActive.find(p => p.id === id)
  if (active) {
    return {
      address: active.address,
      status: "active",
      beds: active.beds,
      baths: active.baths,
      land: active.land ?? 0,
    }
  }
  return { address: `Property ${id}`, status: "active", beds: 0, baths: 0, land: 0 }
}

function countTBDInSection(slm: PropertySLM, fields: string[]): number {
  let count = 0
  for (const f of fields) {
    const val = slm[f as keyof PropertySLM]
    if (val === "TBD") count++
  }
  return count
}

function shortAddress(address: string): string {
  // First word(s) before comma or just first ~20 chars
  const parts = address.split(",")
  const street = parts[0].trim()
  if (street.length <= 22) return street
  return street.slice(0, 20) + "..."
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function inputStyle(isTBD: boolean): React.CSSProperties {
  return {
    width: "100%",
    background: isTBD ? "rgba(255,184,100,0.1)" : C.bg3,
    border: isTBD ? "1px solid rgba(255,184,100,0.3)" : `1px solid ${C.border}`,
    borderRadius: 6,
    color: isTBD ? "rgb(255,184,100)" : C.text,
    fontSize: 13,
    padding: "6px 10px",
    fontFamily: FONT,
    outline: "none",
    boxSizing: "border-box" as const,
  }
}

function FieldInput({
  fieldKey,
  slm,
  onChange,
}: {
  fieldKey: string
  slm: PropertySLM
  onChange: (key: string, val: string | number | boolean | "TBD") => void
}) {
  const rawVal = slm[fieldKey as keyof PropertySLM]
  const isTBD = rawVal === "TBD"
  const ftype = getFieldType(fieldKey)

  // comparableSales is array — show as JSON string
  if (fieldKey === "comparableSales") {
    const strVal = isTBD ? "TBD" : JSON.stringify(rawVal)
    return (
      <input
        type="text"
        value={strVal}
        style={inputStyle(isTBD)}
        onChange={(e) => {
          const v = e.target.value
          if (v === "TBD") { onChange(fieldKey, "TBD"); return }
          try {
            const parsed = JSON.parse(v)
            onChange(fieldKey, parsed)
          } catch {
            onChange(fieldKey, v)
          }
        }}
      />
    )
  }

  if (ftype === "boolean") {
    const selectVal = isTBD ? "TBD" : rawVal === true ? "true" : "false"
    return (
      <select
        value={selectVal}
        style={{ ...inputStyle(isTBD), cursor: "pointer" }}
        onChange={(e) => {
          const v = e.target.value
          if (v === "TBD") onChange(fieldKey, "TBD")
          else onChange(fieldKey, v === "true")
        }}
      >
        <option value="TBD">TBD</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }

  if (ftype === "number") {
    return (
      <input
        type="number"
        value={isTBD ? "" : (rawVal as number)}
        placeholder={isTBD ? "TBD" : ""}
        style={inputStyle(isTBD)}
        onChange={(e) => {
          const v = e.target.value
          if (v === "" || v === "TBD") onChange(fieldKey, "TBD")
          else onChange(fieldKey, parseFloat(v))
        }}
      />
    )
  }

  // string
  return (
    <input
      type="text"
      value={isTBD ? "" : (rawVal as string)}
      placeholder={isTBD ? "TBD" : ""}
      style={inputStyle(isTBD)}
      onChange={(e) => {
        const v = e.target.value
        if (v === "") onChange(fieldKey, "TBD")
        else onChange(fieldKey, v)
      }}
    />
  )
}

function AccordionSection({
  section,
  slm,
  isOpen,
  onToggle,
  onChange,
}: {
  section: { label: string; fields: string[] }
  slm: PropertySLM
  isOpen: boolean
  onToggle: () => void
  onChange: (key: string, val: string | number | boolean | "TBD") => void
}) {
  const tbdCount = countTBDInSection(slm, section.fields)

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 8,
      }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`${section.label} section — ${tbdCount} fields TBD`}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: isOpen ? C.bg3 : C.bg2,
          border: "none",
          cursor: "pointer",
          fontFamily: FONT,
          color: C.text,
          fontSize: 14,
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>{section.label}</span>
          {tbdCount > 0 && (
            <span
              style={{
                fontSize: 11,
                background: "rgba(255,184,100,0.15)",
                color: "rgb(255,184,100)",
                border: "1px solid rgba(255,184,100,0.3)",
                borderRadius: 4,
                padding: "1px 7px",
                fontWeight: 600,
              }}
            >
              {tbdCount} TBD
            </span>
          )}
          {tbdCount === 0 && (
            <span
              style={{
                fontSize: 11,
                background: C.greenDim,
                color: C.green,
                border: `1px solid rgba(100,208,144,0.3)`,
                borderRadius: 4,
                padding: "1px 7px",
                fontWeight: 600,
              }}
            >
              Complete
            </span>
          )}
        </div>
        <span style={{ color: C.muted, fontSize: 16 }}>{isOpen ? "▲" : "▼"}</span>
      </button>

      {/* Body */}
      {isOpen && (
        <div
          style={{
            padding: "16px",
            background: C.bg2,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "12px 20px",
          }}
        >
          {section.fields.map((fieldKey) => (
            <div key={fieldKey}>
              <div
                style={{
                  fontSize: 11,
                  color: C.muted,
                  marginBottom: 4,
                  fontWeight: 500,
                  letterSpacing: 0.2,
                }}
              >
                {camelToLabel(fieldKey)}
              </div>
              <FieldInput fieldKey={fieldKey} slm={slm} onChange={onChange} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QACard({
  qa,
  onChange,
  onRemove,
}: {
  qa: PropertyQA
  onChange: (updated: PropertyQA) => void
  onRemove: () => void
}) {
  const isTBD = qa.answer === "TBD"
  const categoryColors: Record<string, string> = {
    physical: C.blue,
    legal: "rgb(200,160,255)",
    financial: C.green,
    location: "rgb(255,184,100)",
    features: "rgb(100,200,255)",
    planning: "rgb(255,110,110)",
  }
  const catColor = categoryColors[qa.category] ?? C.muted

  return (
    <div
      style={{
        background: C.bg3,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 10,
        position: "relative",
      }}
    >
      {/* Remove button */}
      <button
        onClick={onRemove}
        aria-label="Remove Q&A entry"
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          background: "none",
          border: "none",
          color: C.muted,
          fontSize: 16,
          cursor: "pointer",
          fontFamily: FONT,
          lineHeight: 1,
          padding: "2px 4px",
        }}
      >
        ×
      </button>

      {/* Category + Keywords row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: catColor,
            background: `${catColor}1A`,
            border: `1px solid ${catColor}40`,
            borderRadius: 4,
            padding: "2px 8px",
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {qa.category}
        </span>
        {qa.keywords.map((kw, i) => (
          <span
            key={i}
            style={{
              fontSize: 10,
              color: C.faint,
              background: "rgba(213,219,230,0.06)",
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: "1px 6px",
            }}
          >
            {kw}
          </span>
        ))}
      </div>

      {/* Question */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 3, fontWeight: 500 }}>Question</div>
        <input
          type="text"
          value={qa.question}
          style={{
            ...inputStyle(false),
            fontWeight: 500,
          }}
          onChange={(e) => onChange({ ...qa, question: e.target.value })}
        />
      </div>

      {/* Answer */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 3, fontWeight: 500 }}>Answer</div>
        <textarea
          rows={2}
          value={qa.answer}
          style={{
            ...inputStyle(isTBD),
            resize: "vertical",
            width: "100%",
            boxSizing: "border-box",
            display: "block",
            fontFamily: FONT,
          }}
          onChange={(e) => onChange({ ...qa, answer: e.target.value || "TBD" })}
        />
      </div>

      {/* Keywords */}
      <div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 3, fontWeight: 500 }}>Keywords</div>
        <input
          type="text"
          value={qa.keywords.join(", ")}
          placeholder="e.g. land size, sqm, allotment"
          style={{ ...inputStyle(false), fontSize: 11 }}
          onChange={(e) => onChange({
            ...qa,
            keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean),
          })}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SettingsView({ agent, vendorSettings, onVendorSettingsChange, lightMode, onToggleLightMode }: {
  agent: AgentProfile
  vendorSettings?: VendorDisplaySettings
  onVendorSettingsChange?: (s: VendorDisplaySettings) => void
  lightMode?: boolean
  onToggleLightMode?: () => void
}) {
  const bp = useBreakpoint()
  const isMobile = bp === "mobile"
  const agentPropertyIds = getPropertyIdsForAgent(agent)
  const [selectedPropId, setSelectedPropId] = useState<number>(() => agentPropertyIds[0] ?? 201)
  const [editedSLMs, setEditedSLMs] = useState<Record<number, PropertySLM>>({})
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [openSections, setOpenSections] = useState<Record<number, Set<number>>>({})
  const SETTINGS_TAB_KEY = `propOS_settingsTab_${agent.name.replace(/\s+/g, "_")}`
  const [settingsTab, setSettingsTab] = useState<"slm" | "voice" | "comms" | "listings" | "connections" | "display">(() => {
    try { return (localStorage.getItem(SETTINGS_TAB_KEY) as typeof settingsTab) ?? "slm" } catch { return "slm" }
  })
  const navigateTab = (t: typeof settingsTab) => {
    setSettingsTab(t)
    try { localStorage.setItem(SETTINGS_TAB_KEY, t) } catch {}
  }
  const [corpus, setCorpus] = useState<TrainingEntry[]>(() => loadCorpus())

  // Load all SLMs on mount — seed blank SLMs with portfolio address/suburb
  useEffect(() => {
    const { sold: agentSold, active: agentActive } = getPortfolioForAgent(agent)
    const allPortfolio = [...agentSold, ...agentActive]
    const loaded: Record<number, PropertySLM> = {}
    for (const id of agentPropertyIds) {
      let slm = loadSLMForProperty(id)
      // If SLM has no address yet (blank), seed from portfolio metadata
      if (slm.address === "Unknown") {
        const meta = allPortfolio.find(p => p.id === id)
        if (meta) {
          slm = { ...slm, address: meta.address, suburb: `${meta.suburb} ${meta.state} ${meta.postcode}`, status: meta.status === "sold" ? "sold" : "active" }
        }
      }
      loaded[id] = slm
    }
    setEditedSLMs(loaded)

    // Default: first accordion open for each property
    const sections: Record<number, Set<number>> = {}
    for (const id of agentPropertyIds) {
      sections[id] = new Set([0])
    }
    setOpenSections(sections)
  }, [])

  const currentSLM = editedSLMs[selectedPropId]

  function updateField(key: string, val: string | number | boolean | "TBD") {
    if (!currentSLM) return
    setEditedSLMs((prev) => ({
      ...prev,
      [selectedPropId]: { ...prev[selectedPropId], [key]: val },
    }))
  }

  function updateQA(index: number, updated: PropertyQA) {
    if (!currentSLM) return
    const newQA = [...currentSLM.qa]
    newQA[index] = updated
    setEditedSLMs((prev) => ({
      ...prev,
      [selectedPropId]: { ...prev[selectedPropId], qa: newQA },
    }))
  }

  function removeQA(index: number) {
    if (!currentSLM) return
    const newQA = currentSLM.qa.filter((_, i) => i !== index)
    setEditedSLMs((prev) => ({
      ...prev,
      [selectedPropId]: { ...prev[selectedPropId], qa: newQA },
    }))
  }

  function addQA() {
    if (!currentSLM) return
    const newEntry: PropertyQA = {
      question: "",
      answer: "TBD",
      category: "physical",
      keywords: [],
    }
    setEditedSLMs((prev) => ({
      ...prev,
      [selectedPropId]: {
        ...prev[selectedPropId],
        qa: [...prev[selectedPropId].qa, newEntry],
      },
    }))
  }

  async function handleSave() {
    if (!currentSLM) return
    setSaving(true)
    saveSLMForProperty(currentSLM)
    // Push all changed fields to GSheets as the source-of-truth SLM store
    if (sheetsConnected()) {
      const entries = Object.entries(currentSLM) as [string, unknown][]
      entries.forEach(([field, value]) => {
        if (value !== "TBD" && value !== null && value !== undefined) {
          writeSLMFieldToSheet(selectedPropId, field, value).catch(() => {})
        }
      })
    }
    await new Promise((r) => setTimeout(r, 400))
    setSaving(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  function handleReset() {
    const fresh = resetSLMForProperty(selectedPropId)
    setEditedSLMs((prev) => ({ ...prev, [selectedPropId]: fresh }))
  }

  async function handleSync() {
    setSyncing(true)
    const raw = await readPropertySLMFromSheet(selectedPropId)
    if (raw && currentSLM) {
      // Merge returned fields over current SLM
      const merged = { ...currentSLM } as PropertySLM & Record<string, unknown>
      for (const [k, v] of Object.entries(raw)) {
        if (k in merged && v !== null && v !== undefined && v !== "") {
          merged[k] = v
        }
      }
      setEditedSLMs((prev) => ({ ...prev, [selectedPropId]: merged }))
    }
    setSyncing(false)
  }

  function toggleSection(sectionIndex: number) {
    setOpenSections((prev) => {
      const current = new Set(prev[selectedPropId] ?? [0])
      if (current.has(sectionIndex)) {
        current.delete(sectionIndex)
      } else {
        current.add(sectionIndex)
      }
      return { ...prev, [selectedPropId]: current }
    })
  }

  // Completeness for current prop
  const completeness = currentSLM ? getSLMCompleteness(currentSLM) : null
  const tbdTotal = completeness ? completeness.total - completeness.filled : 0

  // Build tab labels
  function tabLabel(id: number): string {
    const slm = editedSLMs[id]
    const meta = getPropertyMeta(id)
    const short = shortAddress(meta.address)
    if (!slm) return short
    const comp = getSLMCompleteness(slm)
    const tbd = comp.total - comp.filled
    if (meta.status === "sold") return `${short} (sold)`
    if (tbd > 0) return `${short} (${tbd} TBD)`
    return short
  }

  // Button shared style
  const btnBase: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 7,
    padding: "7px 16px",
    cursor: "pointer",
    border: `1px solid ${C.border}`,
    transition: "opacity 0.15s",
  }

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        paddingTop: 80,
        fontFamily: FONT,
        color: C.text,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: isMobile ? "0 16px 80px" : "0 32px 80px",
        }}
      >
        {/* ── Section 1: Agent Profile ── */}
        <div
          style={{
            background: C.bg2,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 32,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: C.blueDim,
              border: `2px solid ${C.blue}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 700,
              color: C.blue,
              flexShrink: 0,
            }}
          >
            {agent.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{agent.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {agent.agency}
            </div>
          </div>
        </div>

        {/* ── Top-level tab strip ── */}
        <div style={{ display: "flex", gap: 2, marginBottom: 28, flexWrap: "wrap" }}>
          {(["slm", "voice", "comms", "listings", "display", "connections"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => navigateTab(tab)}
              style={{
                background: settingsTab === tab ? "var(--accent, rgb(166,218,255))" : C.bg2,
                border: `1px solid ${settingsTab === tab ? "transparent" : C.border}`,
                borderRadius: 8,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                color: settingsTab === tab ? C.bg : C.muted,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab === "slm" ? "SLM Brain"
                : tab === "voice" ? "Writing Style"
                : tab === "comms" ? "Comms"
                : tab === "listings" ? "Listings"
                : tab === "display" ? "Display"
                : "Connections"}
            </button>
          ))}
        </div>

        {settingsTab === "connections" && <ConnectionsPanel agent={agent} />}
        {settingsTab === "comms" && <CommsPanel agent={agent} />}
        {settingsTab === "listings" && <ListingsPanel agent={agent} />}

        {settingsTab === "display" && vendorSettings && onVendorSettingsChange && (
          <VendorPanelToggles
            settings={vendorSettings}
            onChange={onVendorSettingsChange}
            lightMode={lightMode}
            onToggleLightMode={onToggleLightMode}
          />
        )}

        {settingsTab === "voice" && (
          <VoiceStylePanel
            corpus={corpus}
            onAdd={({ text, type, persona, label }) => {
              const entry: TrainingEntry = {
                id: `entry_${Date.now()}`,
                type,
                text: text.trim(),
                timestamp: new Date().toISOString(),
                wordCount: text.trim().split(/\s+/).length,
                source: type === "email" ? "Email Body" : type === "email_subject" ? "Email Subject" : "SMS",
                persona,
                label: label?.trim() || undefined,
              }
              const updated = [...corpus, entry]
              saveCorpus(updated)
              setCorpus(updated)
            }}
            onRemove={(id) => {
              const updated = corpus.filter(e => e.id !== id)
              saveCorpus(updated)
              setCorpus(updated)
            }}
            onClearAll={() => {
              saveCorpus([])
              setCorpus([])
            }}
          />
        )}

        {settingsTab === "slm" && (<>
        {/* ── Section 2: SLM Brain ── */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>
            Property SLM Brain
          </div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
            100 data points per property power matching, Q&A answers, and outreach generation.
          </div>
        </div>

        {/* ── Property Tab Strip ── */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 20,
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: 0,
            flexWrap: "nowrap",
            overflowX: "auto",
          }}
        >
          {agentPropertyIds.map((id) => {
            const active = id === selectedPropId
            return (
              <button
                key={id}
                onClick={() => setSelectedPropId(id)}
                style={{
                  fontFamily: FONT,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? C.blue : C.faint,
                  background: active ? C.blueDim : "transparent",
                  border: "none",
                  borderBottom: active ? `2px solid ${C.blue}` : "2px solid transparent",
                  borderRadius: "6px 6px 0 0",
                  padding: "9px 14px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                }}
              >
                {tabLabel(id)}
              </button>
            )
          })}
        </div>

        {/* ── Active Tab Content ── */}
        {currentSLM && (() => {
          const meta = getPropertyMeta(selectedPropId)
          const openSet = openSections[selectedPropId] ?? new Set([0])

          return (
            <div>
              {/* Property Header Card */}
              <div
                style={{
                  background: C.bg2,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: "16px 20px",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>
                      {meta.address}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
                      {/* Status badge */}
                      {meta.status === "sold" ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: C.green,
                            background: C.greenDim,
                            border: `1px solid rgba(100,208,144,0.3)`,
                            borderRadius: 5,
                            padding: "2px 9px",
                          }}
                        >
                          Sold {meta.soldDate ? `· ${meta.soldDate}` : ""}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: C.blue,
                            background: C.blueDim,
                            border: `1px solid rgba(166,218,255,0.3)`,
                            borderRadius: 5,
                            padding: "2px 9px",
                          }}
                        >
                          Active
                        </span>
                      )}
                      <span style={{ fontSize: 13, color: C.muted }}>
                        {meta.beds} bed &nbsp;·&nbsp; {meta.baths} bath &nbsp;·&nbsp; {meta.land} sqm
                      </span>
                    </div>
                  </div>

                  {/* TBD Count Badge */}
                  <div style={{ textAlign: "right" }}>
                    {tbdTotal > 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgb(255,184,100)",
                          background: "rgba(255,184,100,0.1)",
                          border: "1px solid rgba(255,184,100,0.3)",
                          borderRadius: 7,
                          padding: "6px 12px",
                          fontWeight: 600,
                        }}
                      >
                        {tbdTotal} of 100 fields are TBD
                        <div style={{ fontSize: 10, fontWeight: 400, color: "rgba(255,184,100,0.7)", marginTop: 2 }}>
                          Add answers before your next demo
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12,
                          color: C.green,
                          background: C.greenDim,
                          border: `1px solid rgba(100,208,144,0.3)`,
                          borderRadius: 7,
                          padding: "6px 12px",
                          fontWeight: 600,
                        }}
                      >
                        All 100 fields complete
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons row */}
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  {sheetsConnected() && (
                    <button
                      onClick={handleSync}
                      disabled={syncing}
                      style={{
                        ...btnBase,
                        background: C.bg3,
                        color: syncing ? C.muted : C.text,
                      }}
                    >
                      {syncing ? "Syncing..." : "Sync from Sheets"}
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    style={{
                      ...btnBase,
                      background: C.bg3,
                      color: C.muted,
                    }}
                  >
                    Reset to defaults
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      ...btnBase,
                      background: savedFlash ? C.greenDim : C.blueDim,
                      color: savedFlash ? C.green : C.blue,
                      border: savedFlash
                        ? `1px solid rgba(100,208,144,0.4)`
                        : `1px solid rgba(166,218,255,0.3)`,
                      marginLeft: "auto",
                    }}
                  >
                    {saving ? "Saving..." : savedFlash ? "Saved!" : "Save"}
                  </button>
                </div>
              </div>

              {/* Accordion Sections */}
              {SECTION_FIELDS.map((section, sIdx) => (
                <AccordionSection
                  key={section.label}
                  section={section}
                  slm={currentSLM}
                  isOpen={openSet.has(sIdx)}
                  onToggle={() => toggleSection(sIdx)}
                  onChange={updateField}
                />
              ))}

              {/* Q&A Section */}
              <div style={{ marginTop: 28 }}>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>
                    Q&A Library
                  </span>
                  <span
                    style={{
                      marginLeft: 10,
                      fontSize: 12,
                      color: C.muted,
                      background: C.bg3,
                      border: `1px solid ${C.border}`,
                      borderRadius: 5,
                      padding: "2px 8px",
                    }}
                  >
                    {currentSLM.qa.length} entries
                  </span>
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
                  These question-answer pairs power the lead profile page and LLM outreach generation.
                </div>

                {currentSLM.qa.map((qa, i) => (
                  <QACard
                    key={i}
                    qa={qa}
                    onChange={(updated) => updateQA(i, updated)}
                    onRemove={() => removeQA(i)}
                  />
                ))}

                {/* Add Q&A button */}
                <button
                  onClick={addQA}
                  style={{
                    ...btnBase,
                    background: C.bg2,
                    color: C.blue,
                    border: `1px solid rgba(166,218,255,0.25)`,
                    width: "100%",
                    textAlign: "center",
                    padding: "10px",
                    marginTop: 4,
                  }}
                >
                  + Add Q&A
                </button>
              </div>
            </div>
          )
        })()}
        </>)}
      </div>

      {/* Version footer */}
      <div style={{ marginTop: 48, paddingTop: 20, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: C.faint }}>
          PropOS v{__APP_VERSION__} · by AddVantage
        </div>
      </div>
    </div>
  )
}

// ── VoiceStylePanel ────────────────────────────────────────────────────────────

interface VoiceStylePanelProps {
  corpus: TrainingEntry[]
  onAdd: (entry: { text: string; type: TrainingEntry["type"]; persona?: TrainingEntry["persona"]; label?: string }) => void
  onRemove: (id: string) => void
  onClearAll: () => void
}

// ── Combined Connections panel (Analytics + Integrations + AgentBox CRM) ───────
type HealthStatus = { openai: boolean; anthropic: boolean; sheet: boolean; twilio: boolean; gmail: boolean }

const AGENTBOX_KEY_STORE = "propOS_agentbox_creds"

function formatTimeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000)
  if (mins < 1)    return "just now"
  if (mins < 60)   return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

function ConnectionsPanel({ agent }: { agent: AgentProfile }) {
  const theme = getAgencyTheme(agent.agency)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthError, setHealthError] = useState<string | null>(null)

  // AgentBox credentials — kept in localStorage, but all API calls go through
  // the PropOS server proxy (/api/agentbox/test). Browser→AgentBox direct is
  // blocked by CORS, and proxying keeps the key out of third-party requests.
  const [agentBoxCreds, setAgentBoxCreds] = useState<{ apiKey: string; clientId: string; officeId: string; lastTestedOk?: number }>(() => {
    try { return JSON.parse(localStorage.getItem(AGENTBOX_KEY_STORE) ?? "{}") } catch { return {} }
  })
  const [abTesting, setAbTesting] = useState(false)
  const [abResult, setAbResult] = useState<"ok" | "error" | null>(null)
  const [abError, setAbError] = useState<string | null>(null)
  const [abContactCount, setAbContactCount] = useState<number | null>(null)

  useEffect(() => {
    authFetch("/api/health")
      .then(r => r.json())
      .then(d => { setHealth(d as HealthStatus); setHealthLoading(false) })
      .catch(() => { setHealthError("Could not reach server — service status is only live in the deployed app."); setHealthLoading(false) })
  }, [])

  const saveAgentBoxCreds = (creds: typeof agentBoxCreds) => {
    setAgentBoxCreds(creds)
    try { localStorage.setItem(AGENTBOX_KEY_STORE, JSON.stringify(creds)) } catch {}
  }

  const testAgentBoxConnection = async () => {
    if (!agentBoxCreds.apiKey || !agentBoxCreds.clientId) return
    setAbTesting(true); setAbResult(null); setAbError(null)
    try {
      const res = await authFetch("/api/agentbox/test", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clientId: agentBoxCreds.clientId, apiKey: agentBoxCreds.apiKey }),
      })
      const data = await res.json() as { ok: boolean; contactCount?: number | null; error?: string }
      if (data.ok) {
        setAbContactCount(data.contactCount ?? null)
        setAbResult("ok")
        saveAgentBoxCreds({ ...agentBoxCreds, lastTestedOk: Date.now() })
      } else {
        setAbError(data.error ?? "Connection failed")
        setAbResult("error")
      }
    } catch {
      setAbError("Could not reach the PropOS server")
      setAbResult("error")
    }
    setAbTesting(false)
  }

  const services: { key: keyof HealthStatus; label: string; description: string; icon: string }[] = [
    { key: "openai",    label: "OpenAI (GPT-4o)",  description: "Outreach generation engine",    icon: "🤖" },
    { key: "anthropic", label: "Anthropic Claude",  description: "Lead grading + QA review",      icon: "🧠" },
    { key: "sheet",     label: "Google Sheets",     description: "Lead data sync",                icon: "📊" },
    { key: "twilio",    label: "Twilio SMS",        description: "SMS delivery",                  icon: "💬" },
    { key: "gmail",     label: "Gmail",             description: "Email delivery",                icon: "📧" },
  ]

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>Connections</div>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 32, lineHeight: 1.5 }}>
        Live status of all connected services + CRM integrations.
      </div>

      {/* ── Service health ───────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
        Proptech Services
      </div>
      {healthLoading && <div style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>Checking connections…</div>}
      {healthError  && <div style={{ color: C.red,  fontSize: 13, marginBottom: 24 }}>{healthError}</div>}
      {health && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
          {services.map(({ key, label, description, icon }) => {
            const ok = health[key]
            return (
              <div key={key} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: C.bg2, border: `1px solid ${ok ? C.green + "33" : C.red + "33"}`,
                borderRadius: 12, padding: "12px 16px",
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{description}</div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: ok ? C.green : C.red,
                  background: ok ? C.green + "18" : C.red + "18",
                  borderRadius: 6, padding: "3px 8px",
                }}>
                  {ok ? "Connected" : "Offline"}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── AgentBox CRM ────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
        CRM — AgentBox (Reapit ANZ)
      </div>
      <div style={{
        background: C.bg2, border: `1px solid ${agentBoxCreds.apiKey ? theme.primary + "44" : C.border}`,
        borderRadius: 14, padding: "20px 20px 16px", marginBottom: 32,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>🏠</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>AgentBox CRM</div>
              {agentBoxCreds.lastTestedOk && (
                <div style={{
                  fontSize: 10, fontWeight: 700, color: C.green,
                  background: C.green + "18", borderRadius: 6, padding: "2px 8px",
                }}>
                  Connected · verified {formatTimeAgo(agentBoxCreds.lastTestedOk)}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Australia's most widely-deployed real estate CRM. Connect to pull contacts, listings, and inspection data directly into PropOS — eliminating manual Google Sheets exports.
            </div>
          </div>
        </div>

        {/* API endpoint summary */}
        <div style={{
          background: C.bg3, borderRadius: 8, padding: "10px 14px", marginBottom: 16,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            What PropOS reads from AgentBox
          </div>
          {[
            { endpoint: "GET /contacts",     desc: "Sync buyer + vendor contacts → VendorOS pipeline" },
            { endpoint: "GET /listings",     desc: "Pull active + sold listings → Active Listings + Comparable Sales" },
            { endpoint: "GET /inspections",  desc: "Import open-home attendees → BuyerOS lead database" },
            { endpoint: "POST /notes",       desc: "Write outreach activity back to contact record" },
          ].map(r => (
            <div key={r.endpoint} style={{ display: "flex", gap: 10, marginBottom: 4, alignItems: "flex-start" }}>
              <code style={{ fontSize: 10, color: theme.primary, background: theme.primary + "12", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0 }}>
                {r.endpoint}
              </code>
              <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{r.desc}</span>
            </div>
          ))}
        </div>

        {/* Credentials form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {[
            { key: "apiKey",   label: "X-API-Key",    placeholder: "Issued by AgentBox per agency" },
            { key: "clientId", label: "X-Client-ID",  placeholder: "Your agency client identifier" },
            { key: "officeId", label: "Office ID",    placeholder: "Optional — multi-office agencies" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>{label}</div>
              <input
                type="password"
                value={(agentBoxCreds as Record<string, string>)[key] ?? ""}
                onChange={e => saveAgentBoxCreds({ ...agentBoxCreds, [key]: e.target.value, lastTestedOk: undefined })}
                placeholder={placeholder}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8,
                  background: C.bg, border: `1px solid ${C.border}`,
                  color: C.text, fontSize: 13, fontFamily: "inherit",
                  outline: "none",
                }}
              />
            </div>
          ))}
        </div>

        {/* Test connection + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={testAgentBoxConnection}
            disabled={!agentBoxCreds.apiKey || !agentBoxCreds.clientId || abTesting}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: agentBoxCreds.apiKey ? theme.primary : C.bg3,
              color: agentBoxCreds.apiKey ? "#fff" : C.faint,
              fontSize: 12, fontWeight: 700, cursor: agentBoxCreds.apiKey ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {abTesting && (
              <span style={{
                width: 11, height: 11, borderRadius: "50%", display: "inline-block",
                border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff",
                animation: "spin 0.7s linear infinite", verticalAlign: -1, marginRight: 7,
              }} />
            )}
            {abTesting ? "Testing connection" : "Test Connection"}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          {abResult === "ok" && (
            <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>
              ✅ Connected{abContactCount !== null ? ` — ${abContactCount} contact${abContactCount === 1 ? "" : "s"} found` : ""}
            </div>
          )}
          {abResult === "error" && (
            <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>
              ❌ {abError ?? "Connection failed — check your API key and Client ID"}
            </div>
          )}
        </div>

        {/* How to get access */}
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            How to get API access
          </div>
          <ol style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              "Submit an integrator application at agentbox.com.au/integrator-application",
              "Email salessupportanz@reapit.com to request sandbox credentials",
              "AgentBox QA-reviews the integration before issuing production keys (2–4 weeks)",
              "Paste your X-API-Key and X-Client-ID above and click Test Connection",
            ].map((step, i) => (
              <li key={i} style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                {step.includes("agentbox.com.au") ? (
                  <><a href="https://www.agentbox.com.au/integrator-application" target="_blank" rel="noopener noreferrer" style={{ color: theme.primary }}>agentbox.com.au/integrator-application</a>{step.slice(step.indexOf(" ") + 1)}</>
                ) : step}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* ── Analytics ───────────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
        Analytics
      </div>
      <AnalyticsDashboard agent={agent} theme={theme} />
    </div>
  )
}

function IntegrationsPanel() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // authFetch sends Bearer token → health endpoint returns full service map for authenticated callers
    authFetch("/api/health")
      .then(r => r.json())
      .then(d => { setHealth(d as HealthStatus); setLoading(false) })
      .catch(() => { setError("Could not reach server"); setLoading(false) })
  }, [])

  const services: { key: keyof HealthStatus; label: string; description: string }[] = [
    { key: "openai",    label: "OpenAI (GPT-4o)",  description: "Outreach generation engine" },
    { key: "anthropic", label: "Anthropic Claude",  description: "Lead grading + QA review" },
    { key: "sheet",     label: "Google Sheets",     description: "Lead data sync" },
    { key: "twilio",    label: "Twilio SMS",        description: "SMS delivery" },
    { key: "gmail",     label: "Gmail",             description: "Email delivery" },
  ]

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Integrations</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Live status of all connected services</div>
      {loading && <div style={{ color: C.muted, fontSize: 13 }}>Checking connections...</div>}
      {error  && <div style={{ color: C.red,  fontSize: 13 }}>{error}</div>}
      {health && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {services.map(({ key, label, description }) => {
            const ok = health[key]
            return (
              <div key={key} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: C.bg2, border: `1px solid ${ok ? C.green + "33" : C.red + "33"}`,
                borderRadius: 12, padding: "14px 16px",
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: ok ? C.green : C.red,
                  boxShadow: `0 0 8px ${ok ? C.green : C.red}88`,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{description}</div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: ok ? C.green : C.red,
                  background: ok ? C.green + "18" : C.red + "18",
                  borderRadius: 6, padding: "3px 8px",
                }}>
                  {ok ? "Connected" : "Offline"}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function VoiceStylePanel({ corpus, onAdd, onRemove, onClearAll }: VoiceStylePanelProps) {
  const [pasteText, setPasteText]     = useState("")
  const [msgType, setMsgType]         = useState<TrainingEntry["type"]>("paste")
  const [persona, setPersona]         = useState<TrainingEntry["persona"] | "">("")
  const [labelText, setLabelText]     = useState("")

  const card: React.CSSProperties = {
    background: C.bg2, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: "20px 24px", marginBottom: 16,
  }
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
    color: C.muted, textTransform: "uppercase" as const, marginBottom: 10,
  }

  // Counts for the strength gauge
  const smsCount     = corpus.filter(e => e.type === "paste" || e.type === "voice").length
  const emailCount   = corpus.filter(e => e.type === "email").length
  const subjectCount = corpus.filter(e => e.type === "email_subject").length
  const autoCount    = corpus.filter(e => e.isAutoLearned).length
  const total = corpus.length

  // Strength thresholds: weak < 3, building 3-7, good 8+
  const strengthLevel = total < 3 ? "weak" : total < 8 ? "building" : "good"
  const strengthColor = strengthLevel === "good" ? C.green : strengthLevel === "building" ? "#f59e0b" : C.red ?? "#ef4444"
  const strengthLabel = strengthLevel === "good" ? "Voice well-trained" : strengthLevel === "building" ? "Building up..." : "Add more examples"
  const strengthPct   = Math.min(100, Math.round((total / 10) * 100))

  const PLACEHOLDERS: Record<TrainingEntry["type"], string> = {
    paste:         "Hi David, Cameron from Peake. A similar 4-bed on Birkdale just settled at $1.08M. Your place has done really well since 2017. Worth a chat? Cheers, Cam",
    email:         "Hi David, Cameron from Peake here. Quick update on Thirlmere Court. A comparable property in Berwick has just settled well, and your home is now sitting at around $1.00M...",
    email_subject: "A quick update on Berwick — your place has done well",
    voice:         "Voice transcript would appear here...",
  }

  const TYPE_META: { key: TrainingEntry["type"]; label: string; color: string }[] = [
    { key: "paste",         label: "SMS",           color: C.green },
    { key: "email",         label: "Email Body",    color: C.blue },
    { key: "email_subject", label: "Email Subject", color: "#a78bfa" },
  ]

  const PERSONA_META: { key: TrainingEntry["persona"]; label: string; emoji: string }[] = [
    { key: "investor",  label: "Investor",  emoji: "📈" },
    { key: "family",    label: "Family",    emoji: "🏡" },
    { key: "downsizer", label: "Downsizer", emoji: "🌿" },
    { key: "general",   label: "General",   emoji: "👋" },
  ]

  const canAdd = pasteText.trim().length > 10

  function handleAdd() {
    if (!canAdd) return
    onAdd({
      text: pasteText,
      type: msgType,
      persona: persona || undefined,
      label: labelText.trim() || undefined,
    })
    setPasteText("")
    setLabelText("")
  }

  const typeBadgeStyle = (type: TrainingEntry["type"]): React.CSSProperties => {
    const meta = TYPE_META.find(t => t.key === type)
    const color = meta?.color ?? C.muted
    return {
      fontSize: 9, fontWeight: 800, letterSpacing: "0.07em",
      color, background: color + "18", border: `1px solid ${color}33`,
      borderRadius: 4, padding: "2px 6px", flexShrink: 0,
      textTransform: "uppercase" as const,
    }
  }

  const personaBadgeStyle = (_p: TrainingEntry["persona"]): React.CSSProperties => ({
    fontSize: 9, fontWeight: 700, color: C.muted,
    background: C.bg3, border: `1px solid ${C.border}`,
    borderRadius: 4, padding: "2px 6px", flexShrink: 0,
    textTransform: "capitalize" as const,
  })

  return (
    <div>
      {/* Header + title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>Writing Style</div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
          Provide sample texts to train your voice.
        </div>
      </div>

      {/* Corpus strength gauge */}
      <div style={{ ...card, borderColor: strengthColor + "33", background: strengthColor + "08", marginBottom: 20 }}>
        {/* Progress bar */}
        <div style={{ height: 4, background: C.bg3, borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${strengthPct}%`, background: strengthColor, borderRadius: 2, transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>Training: {total} example{total !== 1 ? "s" : ""}</div>
        {total < 5 && (
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
            Add {5 - total} more example{5 - total !== 1 ? "s" : ""} for best results. Aim for at least 2 SMS + 2 email body examples.
          </div>
        )}
      </div>

      {/* Add example form */}
      <div style={card}>
        <div style={sectionLabel}>Add an example</div>

        {/* Type selector */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {TYPE_META.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setMsgType(key)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                cursor: "pointer", border: "none", fontFamily: FONT,
                background: msgType === key ? color + "22" : C.bg3,
                color: msgType === key ? color : C.muted,
                outline: msgType === key ? `1.5px solid ${color}55` : "none",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          placeholder={PLACEHOLDERS[msgType]}
          style={{
            width: "100%", minHeight: msgType === "email_subject" ? 48 : 120,
            background: C.bg3, border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.text, fontSize: 13,
            padding: "12px 14px", resize: "vertical", fontFamily: FONT,
            lineHeight: 1.5, boxSizing: "border-box",
          }}
        />

        {/* Persona selector (optional) */}
        <div style={{ marginTop: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 6 }}>
            Persona tag (optional)
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {PERSONA_META.map(({ key, label, emoji }) => (
              <button
                key={key}
                onClick={() => setPersona(persona === key ? "" : key)}
                style={{
                  padding: "5px 12px", borderRadius: 16, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", border: "none", fontFamily: FONT,
                  background: persona === key ? "rgba(167,139,250,0.18)" : C.bg3,
                  color: persona === key ? "#a78bfa" : C.muted,
                  outline: persona === key ? "1.5px solid rgba(167,139,250,0.4)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {emoji} {label}
              </button>
            ))}
          </div>
        </div>

        {/* Optional label */}
        <input
          value={labelText}
          onChange={e => setLabelText(e.target.value)}
          placeholder="Optional label, e.g. first contact after appraisal"
          style={{
            width: "100%", background: C.bg3, border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.text, fontSize: 12,
            padding: "9px 12px", fontFamily: FONT, boxSizing: "border-box",
            marginBottom: 12,
          }}
        />

        {/* Add button */}
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          style={{
            background: canAdd ? C.blue : C.bg3,
            color: canAdd ? C.bg : C.muted,
            border: "none", borderRadius: 8, padding: "10px 20px",
            fontSize: 13, fontWeight: 700, cursor: canAdd ? "pointer" : "not-allowed",
            fontFamily: FONT, transition: "background 0.15s",
          }}
        >
          + Add to voice corpus
        </button>
      </div>

      {/* Saved examples */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={sectionLabel}>Saved examples ({corpus.length})</div>
          {corpus.length > 0 && (
            <button
              onClick={onClearAll}
              style={{ fontSize: 12, color: C.red ?? "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Clear all
            </button>
          )}
        </div>

        {corpus.length === 0 ? (
          <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "24px 0" }}>
            No examples yet. Paste a message above to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...corpus].reverse().map(entry => (
              <div
                key={entry.id}
                style={{
                  background: C.bg3, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "12px 14px",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}
              >
                {/* Type badge */}
                <span style={typeBadgeStyle(entry.type)}>
                  {entry.type === "email" ? "EMAIL" : entry.type === "email_subject" ? "SUBJ" : "SMS"}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Badges row */}
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const, marginBottom: 4 }}>
                    {entry.persona && (
                      <span style={personaBadgeStyle(entry.persona)}>
                        {entry.persona}
                      </span>
                    )}
                    {entry.isAutoLearned && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", background: "#f59e0b18", border: "1px solid #f59e0b33", borderRadius: 4, padding: "2px 6px" }}>
                        auto-learned
                      </span>
                    )}
                    {entry.label && (
                      <span style={{ fontSize: 9, color: C.faint, fontStyle: "italic" }}>{entry.label}</span>
                    )}
                  </div>
                  {/* Preview text */}
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, wordBreak: "break-word" }}>
                    {entry.text.length > 180 ? entry.text.slice(0, 180) + "..." : entry.text}
                  </div>
                  <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
                    {entry.wordCount} words · {new Date(entry.timestamp).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </div>
                </div>

                <button
                  onClick={() => onRemove(entry.id)}
                  style={{ fontSize: 15, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
        Examples are stored locally on this device only. They are sent to the AI only during message generation, never stored on any server.
      </div>
    </div>
  )
}

// ─── Comms Panel ──────────────────────────────────────────────────────────────

interface CommSettings {
  greeting:       string
  closing:        string
  lengthStyle:    "short" | "medium" | "detailed"
  formalityScore: number   // 1-5
  followUp1Days:  number   // days after first contact for 2nd touch
  followUp2Days:  number   // days after 2nd touch for 3rd touch
  smsEnabled:     boolean
  emailEnabled:   boolean
  dripEnabled:    boolean  // automated nurture drip
}

const DEFAULT_COMM_SETTINGS: CommSettings = {
  greeting:       "Hi",
  closing:        "Cheers",
  lengthStyle:    "short",
  formalityScore: 2,
  followUp1Days:  3,
  followUp2Days:  7,
  smsEnabled:     true,
  emailEnabled:   true,
  dripEnabled:    false,
}

function loadCommSettings(): CommSettings {
  try {
    const raw = localStorage.getItem("propos_comm_settings")
    return raw ? { ...DEFAULT_COMM_SETTINGS, ...JSON.parse(raw) } : DEFAULT_COMM_SETTINGS
  } catch { return DEFAULT_COMM_SETTINGS }
}

function saveCommSettings(s: CommSettings) {
  try { localStorage.setItem("propos_comm_settings", JSON.stringify(s)) } catch {}
}

function CommsPanel({ agent }: { agent: AgentProfile }) {
  const [settings, setSettings] = useState<CommSettings>(loadCommSettings)
  const [saved, setSaved] = useState(false)

  void agent  // used for future personalisation

  function update<K extends keyof CommSettings>(key: K, val: CommSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: val }))
  }

  function handleSave() {
    saveCommSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const card: React.CSSProperties = {
    background: C.bg2, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: "20px 24px", marginBottom: 16,
  }
  const row: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 0", borderBottom: `1px solid ${C.border}`,
  }
  const label: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: C.text,
  }
  const sublabel: React.CSSProperties = {
    fontSize: 11, color: C.muted, marginTop: 2,
  }
  const select: React.CSSProperties = {
    background: C.bg3, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "7px 10px",
    color: C.text, fontSize: 13, fontFamily: FONT, cursor: "pointer",
  }

  const GREETINGS = ["Hi", "Hey", "G'day", "Good morning", "Good afternoon", "Hello"]
  const CLOSINGS  = ["Cheers", "Thanks", "Kind regards", "Best", "Speak soon", "Warm regards"]

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>Comms Style</div>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 1.5 }}>
        Control how PropOS writes outreach on your behalf. These settings apply to all generated SMS, emails, and follow-ups.
      </div>

      {/* ── Voice defaults ── */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
          Message Defaults
        </div>

        <div style={{ ...row }}>
          <div>
            <div style={label}>Greeting</div>
            <div style={sublabel}>How you open every message</div>
          </div>
          <select style={select} value={settings.greeting} onChange={e => update("greeting", e.target.value)}>
            {GREETINGS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div style={{ ...row }}>
          <div>
            <div style={label}>Sign-off</div>
            <div style={sublabel}>How you close every message</div>
          </div>
          <select style={select} value={settings.closing} onChange={e => update("closing", e.target.value)}>
            {CLOSINGS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ ...row }}>
          <div>
            <div style={label}>Message length</div>
            <div style={sublabel}>Short = 1-2 sentences. Medium = 3-4. Detailed = paragraph.</div>
          </div>
          <select style={select} value={settings.lengthStyle} onChange={e => update("lengthStyle", e.target.value as CommSettings["lengthStyle"])}>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="detailed">Detailed</option>
          </select>
        </div>

        <div style={{ ...row, borderBottom: "none" }}>
          <div>
            <div style={label}>Formality</div>
            <div style={sublabel}>1 = casual mate-style, 5 = professional correspondence</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="range" min={1} max={5} step={1}
              value={settings.formalityScore}
              onChange={e => update("formalityScore", Number(e.target.value))}
              style={{ width: 100, accentColor: "var(--accent, rgb(166,218,255))" }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.blue, minWidth: 16 }}>
              {settings.formalityScore}
            </span>
          </div>
        </div>
      </div>

      {/* ── Channel toggles ── */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
          Active Channels
        </div>

        {([
          { key: "smsEnabled" as const,   label: "SMS",   desc: "Send text messages to leads" },
          { key: "emailEnabled" as const, label: "Email", desc: "Send email outreach to leads" },
          { key: "dripEnabled" as const,  label: "Automated nurture drip", desc: "Auto-send follow-up sequences based on timing below" },
        ]).map(({ key, label: l, desc }, i, arr) => (
          <div
            key={key}
            role="switch"
            aria-checked={settings[key] as boolean}
            tabIndex={0}
            onClick={() => update(key, !settings[key])}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); update(key, !settings[key]) } }}
            style={{
              ...row,
              cursor: "pointer",
              borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.border}`,
            }}
          >
            <div>
              <div style={label}>{l}</div>
              <div style={sublabel}>{desc}</div>
            </div>
            <TogglePill on={settings[key] as boolean} />
          </div>
        ))}
      </div>

      {/* ── Follow-up timing ── */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
          Follow-up Timing
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
          When automated drip is enabled, PropOS schedules follow-ups at these intervals after first contact.
        </div>

        {([
          { key: "followUp1Days" as const, label: "2nd touch", desc: "Days after initial outreach" },
          { key: "followUp2Days" as const, label: "3rd touch", desc: "Days after 2nd touch" },
        ]).map(({ key, label: l, desc }, i, arr) => (
          <div key={key} style={{ ...row, borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.border}` }}>
            <div>
              <div style={label}>{l}</div>
              <div style={sublabel}>{desc}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="number" min={1} max={30}
                value={settings[key] as number}
                onChange={e => update(key, Math.max(1, Math.min(30, Number(e.target.value))))}
                style={{ ...select, width: 64, textAlign: "center" }}
              />
              <span style={{ fontSize: 12, color: C.muted }}>days</span>
            </div>
          </div>
        ))}
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        style={{
          background: saved ? C.greenDim : C.blueDim,
          color: saved ? C.green : C.blue,
          border: saved ? `1px solid rgba(100,208,144,0.4)` : `1px solid rgba(166,218,255,0.3)`,
          borderRadius: 8, padding: "10px 24px",
          fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          transition: "all 0.15s",
        }}
      >
        {saved ? "Saved!" : "Save changes"}
      </button>

      <div style={{ marginTop: 16, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
        These settings are stored locally on this device and applied to all AI-generated messages.
      </div>
    </div>
  )
}

// ─── Listings Panel ───────────────────────────────────────────────────────────

const FEATURED_LISTING_KEY = "propos_featured_listing_id"

function loadFeaturedId(): number | null {
  try {
    const raw = localStorage.getItem(FEATURED_LISTING_KEY)
    return raw ? Number(raw) : null
  } catch { return null }
}

function ListingsPanel({ agent }: { agent: AgentProfile }) {
  const { sold, active } = getPortfolioForAgent(agent)
  const all: PortfolioProperty[] = [...active, ...sold]
  const [featuredId, setFeaturedId] = useState<number | null>(loadFeaturedId)
  const [flash, setFlash] = useState<number | null>(null)

  function markFeatured(id: number) {
    const next = featuredId === id ? null : id
    setFeaturedId(next)
    try { localStorage.setItem(FEATURED_LISTING_KEY, String(next ?? "")) } catch {}
    setFlash(id)
    setTimeout(() => setFlash(null), 1500)
  }

  function fmtPrice(p: number, min?: number, max?: number) {
    if (!p && min && max) return `$${(min / 1000).toFixed(0)}k – $${(max / 1000).toFixed(0)}k`
    if (!p) return "TBD"
    return `$${(p / 1000).toFixed(0)}k`
  }

  // ── Health check alerts ──────────────────────────────────────────────────────
  type ListingAlert = { id: number; address: string; type: "missing_image" | "incomplete_slm" | "missing_s32" | "no_price"; detail: string }
  const alerts: ListingAlert[] = []
  for (const p of all) {
    if (!p.image || p.image === "/placeholder.jpg") {
      alerts.push({ id: p.id, address: p.address, type: "missing_image", detail: "No listing photo — card will render blank" })
    }
    if (!p.price && !p.priceMin) {
      alerts.push({ id: p.id, address: p.address, type: "no_price", detail: "No price or price guide set" })
    }
    const slm = loadSLMForProperty(p.id)
    if (slm) {
      const { pct } = getSLMCompleteness(slm)
      if (pct < 50) {
        alerts.push({ id: p.id, address: p.address, type: "incomplete_slm", detail: `SLM Brain only ${pct}% complete — buyer Q&A answers will be thin` })
      }
      const s32 = slm.s32Status ?? ""
      if (!s32 || s32 === "TBD" || s32.toLowerCase().includes("preparation")) {
        alerts.push({ id: p.id, address: p.address, type: "missing_s32", detail: `Section 32: "${s32 || "TBD"}" — not yet signed/issued` })
      }
    }
  }

  const alertIcon: Record<ListingAlert["type"], string> = {
    missing_image:  "🖼️",
    incomplete_slm: "🧠",
    missing_s32:    "📄",
    no_price:       "💰",
  }
  const alertColor: Record<ListingAlert["type"], string> = {
    missing_image:  "rgba(251,146,60,0.15)",
    incomplete_slm: "rgba(168,85,247,0.12)",
    missing_s32:    "rgba(251,191,36,0.12)",
    no_price:       "rgba(239,68,68,0.12)",
  }
  const alertBorder: Record<ListingAlert["type"], string> = {
    missing_image:  "rgba(251,146,60,0.4)",
    incomplete_slm: "rgba(168,85,247,0.35)",
    missing_s32:    "rgba(251,191,36,0.35)",
    no_price:       "rgba(239,68,68,0.35)",
  }

  if (all.length === 0) {
    return (
      <div style={{ maxWidth: 640 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>Listings</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 24 }}>
          No portfolio properties found. Log in as Cameron, Pas, or Manny to see their listings.
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>Listings</div>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 1.5 }}>
        Your current portfolio. Mark one active listing as <strong style={{ color: C.blue }}>Featured</strong> to use it as the primary property in buyer outreach and demo flows.
      </div>

      {/* ── Health alerts ──────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Listing Health
            </div>
            <div style={{
              padding: "1px 8px", borderRadius: 10,
              background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)",
              fontSize: 10, fontWeight: 700, color: "#f87171",
            }}>
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((a, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 14px", borderRadius: 10,
                background: alertColor[a.type],
                border: `1px solid ${alertBorder[a.type]}`,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{alertIcon[a.type]}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{a.address}</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {alerts.length === 0 && all.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 24,
          padding: "10px 14px", borderRadius: 10,
          background: "rgba(100,208,144,0.08)", border: "1px solid rgba(100,208,144,0.3)",
        }}>
          <span style={{ fontSize: 16 }}>✅</span>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.green }}>All listings look healthy — no missing photos, prices, SLM data, or Section 32 issues.</div>
        </div>
      )}

      {/* Active */}
      {active.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
            Active ({active.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {active.map(p => (
              <ListingCard
                key={p.id}
                prop={p}
                isFeatured={featuredId === p.id}
                flash={flash === p.id}
                onToggleFeatured={() => markFeatured(p.id)}
                fmtPrice={fmtPrice}
              />
            ))}
          </div>
        </>
      )}

      {/* Sold */}
      {sold.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
            Sold ({sold.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sold.map(p => (
              <ListingCard
                key={p.id}
                prop={p}
                isFeatured={false}
                flash={false}
                onToggleFeatured={() => {}}
                fmtPrice={fmtPrice}
                dimmed
              />
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
        The featured listing is used in buyer outreach messages as the reference property. Only active listings can be featured.
      </div>
    </div>
  )
}

function ListingCard({
  prop, isFeatured, flash, onToggleFeatured, fmtPrice, dimmed = false,
}: {
  prop: PortfolioProperty
  isFeatured: boolean
  flash: boolean
  onToggleFeatured: () => void
  fmtPrice: (p: number, min?: number, max?: number) => string
  dimmed?: boolean
}) {
  return (
    <div style={{
      background: C.bg2,
      border: `1px solid ${isFeatured ? "var(--accent, rgb(166,218,255))55" : C.border}`,
      borderRadius: 12,
      padding: "16px 20px",
      display: "flex",
      alignItems: "flex-start",
      gap: 16,
      opacity: dimmed ? 0.7 : 1,
      transition: "border-color 0.2s",
    }}>
      {/* Property image placeholder */}
      <div style={{
        width: 72, height: 56, borderRadius: 8, background: C.bg3,
        flexShrink: 0, overflow: "hidden",
        border: `1px solid ${C.border}`,
      }}>
        <img
          src={prop.image}
          alt={prop.address}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
        />
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{prop.address}</span>
          {prop.status === "sold" && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: C.green, background: C.greenDim,
              border: `1px solid rgba(100,208,144,0.3)`, borderRadius: 4, padding: "1px 7px",
            }}>SOLD {prop.soldDate ?? ""}</span>
          )}
          {isFeatured && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: "rgb(166,218,255)", background: "rgba(166,218,255,0.12)",
              border: "1px solid rgba(166,218,255,0.3)", borderRadius: 4, padding: "1px 7px",
            }}>FEATURED</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
          {prop.suburb} · {prop.beds}bd {prop.baths}ba {prop.cars}car{prop.land ? ` · ${prop.land}m²` : ""}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: prop.status === "active" ? "var(--accent, rgb(166,218,255))" : C.muted }}>
          {fmtPrice(prop.price, prop.priceMin, prop.priceMax)}
          {prop.auctionDate && <span style={{ fontSize: 11, fontWeight: 400, color: C.faint, marginLeft: 8 }}>Auction {prop.auctionDate}</span>}
        </div>
      </div>

      {/* Feature button — only for active listings */}
      {prop.status === "active" && (
        <button
          onClick={onToggleFeatured}
          style={{
            flexShrink: 0,
            background: flash ? C.greenDim : isFeatured ? "rgba(166,218,255,0.1)" : C.bg3,
            color: flash ? C.green : isFeatured ? C.blue : C.muted,
            border: `1px solid ${flash ? "rgba(100,208,144,0.4)" : isFeatured ? "rgba(166,218,255,0.3)" : C.border}`,
            borderRadius: 8, padding: "7px 14px",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            transition: "all 0.15s",
          }}
        >
          {flash ? "Done!" : isFeatured ? "Unfeature" : "Set featured"}
        </button>
      )}
    </div>
  )
}

// ─── Vendor Panel Toggles ─────────────────────────────────────────────────────

const VENDOR_PANEL_META: Array<{
  key: keyof VendorDisplaySettings
  label: string
  description: string
  group?: string
}> = [
  // ── Vendor profile panels ─────────────────────────────────────────────────
  { key: "showCRMNotes",        label: "From Your CRM Notes",         description: "AI-extracted personalisation hooks from contact notes",          group: "Vendor Profile" },
  { key: "showTriggers",        label: "Triggers & Pitch Angles",      description: "Life-stage triggers and outreach angle suggestions",             group: "Vendor Profile" },
  { key: "showOutreachAngles",  label: "Choose Outreach Angle",        description: "Equity / lifestyle / CGT / market angle picker cards",          group: "Vendor Profile" },
  { key: "showEquityScenarios", label: "Equity Release Scenarios",     description: "Low / mid / high sale price breakdown with net proceeds",       group: "Vendor Profile" },
  { key: "showOptimalWindow",   label: "Optimal Listing Window",       description: "AI-predicted best months to list based on market data",         group: "Vendor Profile" },
  // ── Noise reduction toggles ───────────────────────────────────────────────
  { key: "showMarketTriggers",  label: "Market Trigger Feed",          description: "Smart alerts on the vendor pipeline page (neighbour sales, CGT windows, life events)", group: "Interface Controls" },
  { key: "showComparableMap",   label: "Comparable Sales Map",         description: "Interactive Leaflet map of recent comparable sales in the vendor appraisal panel",     group: "Interface Controls" },
  { key: "showMatchScores",     label: "Match Score Rings",            description: "Visual score rings on buyer lead cards",                                                group: "Interface Controls" },
  { key: "showDNAAnalysis",     label: "Property DNA Analysis",        description: "AI-generated property DNA tags on vendor profile",                                      group: "Interface Controls" },
  { key: "forceDemoData",       label: "Force demo data",              description: "Always use built-in demo leads for buyer view (ignores Google Sheets). Useful during presentations.", group: "Demo Mode" },
]

function TogglePill({ on }: { on: boolean }) {
  return (
    <div style={{
      flexShrink: 0, width: 44, height: 24, borderRadius: 12, marginLeft: 16,
      background: on ? "var(--accent, rgb(166,218,255))" : C.bg3,
      border: `1px solid ${on ? "transparent" : C.border}`,
      position: "relative", transition: "background 0.2s",
    }}>
      <div style={{
        position: "absolute", top: 3, left: on ? 22 : 3,
        width: 16, height: 16, borderRadius: "50%",
        background: on ? C.bg : C.muted,
        transition: "left 0.2s",
      }} />
    </div>
  )
}

function VendorPanelToggles({
  settings,
  onChange,
  lightMode,
  onToggleLightMode,
}: {
  settings: VendorDisplaySettings
  onChange: (s: VendorDisplaySettings) => void
  lightMode?: boolean
  onToggleLightMode?: () => void
}) {
  const toggle = (key: keyof VendorDisplaySettings) =>
    onChange({ ...settings, [key]: !settings[key] })

  // Group items by "group" key
  const groups = VENDOR_PANEL_META.reduce<Record<string, typeof VENDOR_PANEL_META>>((acc, item) => {
    const g = item.group ?? "Other"
    if (!acc[g]) acc[g] = []
    acc[g].push(item)
    return acc
  }, {})

  const groupOrder = ["Vendor Profile", "Interface Controls", "Demo Mode"]

  const groupLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
    color: C.faint, textTransform: "uppercase" as const,
    marginBottom: 8, marginTop: 20,
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>
        Display
      </div>
      <div style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 1.5 }}>
        Control which panels and UI elements are visible. Changes save instantly to this browser.
      </div>

      {/* ── Day / Night Mode ── */}
      {onToggleLightMode !== undefined && (
        <>
          <div style={{ ...groupLabel, marginTop: 0 }}>Appearance</div>
          <div
            role="switch"
            aria-checked={lightMode}
            tabIndex={0}
            onClick={onToggleLightMode}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleLightMode() } }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: C.bg2, border: `1px solid ${lightMode ? "var(--accent, rgb(166,218,255))40" : C.border}`,
              borderRadius: 12, padding: "14px 18px", cursor: "pointer",
              transition: "border-color 0.15s", marginBottom: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                {lightMode ? "Light mode" : "Dark mode"}
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>Switch between dark and light themes</div>
            </div>
            <TogglePill on={!!lightMode} />
          </div>
        </>
      )}

      {/* ── Panel groups ── */}
      {groupOrder.map(g => (
        <div key={g}>
          <div style={groupLabel}>{g}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(groups[g] ?? []).map(({ key, label, description }) => {
              const on = settings[key]
              const shortDesc = description.length > 28 ? description.slice(0, 28) + "…" : description
              return (
                <div
                  key={key}
                  role="switch"
                  aria-checked={on}
                  tabIndex={0}
                  onClick={() => toggle(key)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(key) } }}
                  title={description}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: C.bg2, border: `1px solid ${on ? "var(--accent, rgb(166,218,255))40" : C.border}`,
                    borderRadius: 12, padding: "14px 18px", cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{shortDesc}</div>
                  </div>
                  <TogglePill on={on} />
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 20, fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
        All panels are off by default for a low-noise experience. Toggle on what you need.
      </div>
    </div>
  )
}
