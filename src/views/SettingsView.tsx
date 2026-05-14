import { useState, useEffect } from "react"
import { C, FONT, PORTFOLIO_ACTIVE, PORTFOLIO_SOLD, type AgentProfile } from "../data"
import {
  loadSLMForProperty, saveSLMForProperty, resetSLMForProperty,
  getSLMCompleteness, type PropertySLM, type PropertyQA
} from "../data/propertySlm"
import { readPropertySLMFromSheet, sheetsConnected } from "../lib/sheet"
import AnalyticsDashboard from "../components/AnalyticsDashboard"
import { loadCorpus, saveCorpus, type TrainingEntry } from "../lib/voiceContext"

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

// All property IDs (sold 101-104, active 201-203)
const ALL_PROPERTY_IDS = [101, 102, 103, 104, 201, 202, 203]

function getPropertyMeta(id: number): {
  address: string
  status: "active" | "sold"
  soldDate?: string
  beds: number
  baths: number
  land: number
} {
  const sold = PORTFOLIO_SOLD.find(p => p.id === id)
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
  const active = PORTFOLIO_ACTIVE.find(p => p.id === id)
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
            onChange(fieldKey, v as any)
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
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>
            {section.fields.length} fields
          </span>
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
            gridTemplateColumns: "1fr 1fr",
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
        title="Remove"
      >
        x
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
      <div>
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SettingsView({ agent }: { agent: AgentProfile }) {
  const [selectedPropId, setSelectedPropId] = useState<number>(201)
  const [editedSLMs, setEditedSLMs] = useState<Record<number, PropertySLM>>({})
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [openSections, setOpenSections] = useState<Record<number, Set<number>>>({})
  const [settingsTab, setSettingsTab] = useState<"slm" | "voice" | "analytics">("slm")
  const [corpus, setCorpus] = useState<TrainingEntry[]>(() => loadCorpus())
  const [stylePaste, setStylePaste] = useState("")

  // Load all SLMs on mount
  useEffect(() => {
    const loaded: Record<number, PropertySLM> = {}
    for (const id of ALL_PROPERTY_IDS) {
      loaded[id] = loadSLMForProperty(id)
    }
    setEditedSLMs(loaded)

    // Default: first accordion open for each property
    const sections: Record<number, Set<number>> = {}
    for (const id of ALL_PROPERTY_IDS) {
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
      const merged = { ...currentSLM } as PropertySLM
      for (const [k, v] of Object.entries(raw)) {
        if (k in merged && v !== null && v !== undefined && v !== "") {
          (merged as any)[k] = v
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
          padding: "0 32px 80px",
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
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{agent.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {agent.agency} &nbsp;·&nbsp; {agent.email}
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span
              style={{
                fontSize: 11,
                color: C.muted,
                background: C.bg3,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: "4px 10px",
              }}
            >
              Profile managed in login flow
            </span>
          </div>
        </div>

        {/* ── Top-level tab strip ── */}
        <div style={{ display: "flex", gap: 2, marginBottom: 28 }}>
          {(["slm", "voice", "analytics"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setSettingsTab(tab)}
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
              {tab === "slm" ? "SLM Brain" : tab === "voice" ? "Writing Style" : "Analytics"}
            </button>
          ))}
        </div>

        {settingsTab === "analytics" && <AnalyticsDashboard />}

        {settingsTab === "voice" && (
          <VoiceStylePanel
            corpus={corpus}
            stylePaste={stylePaste}
            onPasteChange={setStylePaste}
            onAdd={(text, type) => {
              const entry: TrainingEntry = {
                id: `entry_${Date.now()}`,
                type,
                text: text.trim(),
                timestamp: new Date().toISOString(),
                wordCount: text.trim().split(/\s+/).length,
                source: type === "email" ? "Email example" : "SMS example",
              }
              const updated = [...corpus, entry]
              saveCorpus(updated)
              setCorpus(updated)
              setStylePaste("")
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
          {ALL_PROPERTY_IDS.map((id) => {
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
    </div>
  )
}

// ── VoiceStylePanel ────────────────────────────────────────────────────────────

interface VoiceStylePanelProps {
  corpus: TrainingEntry[]
  stylePaste: string
  onPasteChange: (v: string) => void
  onAdd: (text: string, type: "email" | "paste") => void
  onRemove: (id: string) => void
  onClearAll: () => void
}

function VoiceStylePanel({ corpus, stylePaste, onPasteChange, onAdd, onRemove, onClearAll }: VoiceStylePanelProps) {
  const card: React.CSSProperties = {
    background: C.bg2,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 20,
  }
  const label: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: C.muted,
    textTransform: "uppercase" as const,
    marginBottom: 10,
  }

  return (
    <div>
      {/* Explainer */}
      <div style={{ ...card, borderColor: "rgba(166,218,255,0.2)", background: "rgba(166,218,255,0.05)" }}>
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
          <strong style={{ color: C.blue }}>How this works:</strong> Paste 2-5 real texts or emails you've sent to leads. The AI reads these and matches your exact tone, vocabulary, and sign-off style in every generated message. The more specific and real these are, the better the output.
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
          Examples are stored locally on this device only. They are never sent to any server except during outreach generation.
        </div>
      </div>

      {/* Paste area */}
      <div style={card}>
        <div style={label}>Paste an example message</div>
        <textarea
          value={stylePaste}
          onChange={e => onPasteChange(e.target.value)}
          placeholder={"Paste a real SMS or email you've sent to a lead...\n\nExample:\nHey Michelle, Simon here. Just heard back on the Toorak inspection - they loved it. Wanted to let you know first before it goes to contract. Worth a chat today?"}
          style={{
            width: "100%",
            minHeight: 130,
            background: C.bg3,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            color: C.text,
            fontSize: 13,
            padding: "12px 14px",
            resize: "vertical",
            fontFamily: FONT,
            lineHeight: 1.5,
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            onClick={() => { if (stylePaste.trim().length > 10) onAdd(stylePaste, "paste") }}
            disabled={stylePaste.trim().length <= 10}
            style={{
              background: stylePaste.trim().length > 10 ? C.blue : C.bg3,
              color: stylePaste.trim().length > 10 ? C.bg : C.muted,
              border: "none",
              borderRadius: 8,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: stylePaste.trim().length > 10 ? "pointer" : "not-allowed",
            }}
          >
            + Add as SMS / Short message
          </button>
          <button
            onClick={() => { if (stylePaste.trim().length > 10) onAdd(stylePaste, "email") }}
            disabled={stylePaste.trim().length <= 10}
            style={{
              background: stylePaste.trim().length > 10 ? "rgba(166,218,255,0.12)" : C.bg3,
              color: stylePaste.trim().length > 10 ? C.blue : C.muted,
              border: `1px solid ${stylePaste.trim().length > 10 ? "rgba(166,218,255,0.3)" : C.border}`,
              borderRadius: 8,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: stylePaste.trim().length > 10 ? "pointer" : "not-allowed",
            }}
          >
            + Add as Email
          </button>
        </div>
      </div>

      {/* Saved examples */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={label}>Saved examples ({corpus.length} / 20)</div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...corpus].reverse().map(entry => (
              <div
                key={entry.id}
                style={{
                  background: C.bg3,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: entry.type === "email" ? C.blue : C.green,
                  background: entry.type === "email" ? "rgba(166,218,255,0.1)" : "rgba(100,220,130,0.1)",
                  border: `1px solid ${entry.type === "email" ? "rgba(166,218,255,0.2)" : "rgba(100,220,130,0.2)"}`,
                  borderRadius: 4,
                  padding: "2px 7px",
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  {entry.type === "email" ? "EMAIL" : "SMS"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, wordBreak: "break-word" }}>
                    {entry.text.length > 160 ? entry.text.slice(0, 160) + "..." : entry.text}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    {entry.wordCount} words · {new Date(entry.timestamp).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </div>
                </div>
                <button
                  onClick={() => onRemove(entry.id)}
                  style={{ fontSize: 14, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
