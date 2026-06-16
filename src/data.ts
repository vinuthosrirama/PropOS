// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
// ── Colour tokens ─────────────────────────────────────────────────────────────
// All surface/text/border values use CSS custom properties so the light/dark
// toggle in App.tsx only needs to swap the variable values — no component
// changes required. Accent colours (blue, green, etc.) are fixed on both modes.

export const C = {
  // Surfaces & text — resolved at runtime via CSS vars
  bg:          "var(--c-bg)",
  bg2:         "var(--c-bg2)",
  bg3:         "var(--c-bg3)",
  text:        "var(--c-text)",
  muted:       "var(--c-muted)",
  faint:       "var(--c-faint)",
  border:      "var(--c-border)",
  borderHover: "var(--c-border-hover)",
  // Accent colours — mode-aware via CSS vars (dark: pastels, light: saturated)
  blue:        "var(--c-blue)",
  blueDim:     "var(--c-blue-dim)",
  blueGlow:    "rgba(166, 218, 255, 0.06)",
  green:       "var(--c-green)",
  greenDim:    "var(--c-green-dim)",
  orange:      "var(--c-orange)",
  orangeDim:   "var(--c-orange-dim)",
  red:         "var(--c-red)",
  redDim:      "var(--c-red-dim)",
  purple:      "var(--c-purple)",
  purpleDim:   "var(--c-purple-dim)",
  // Peake brand tokens — fixed across light/dark
  peakePurple: "#3b1f77",
  peakeDark:   "#2c1b59",
  peakeCharc:  "#2c2d30",
  peakeSage:   "#b6c2ab",
  peakeSilver: "#f7f7f8",
} as const

// ── Theme variable blocks ─────────────────────────────────────────────────────

export const DARK_CSS_VARS = `
  --c-bg:           #14072e;
  --c-bg2:          #2c1b59;
  --c-bg3:          #351c6b;
  --c-text:         rgba(255, 255, 255, 0.92);
  --c-muted:        rgba(255, 255, 255, 0.52);
  --c-faint:        rgba(255, 255, 255, 0.25);
  --c-border:       rgba(182, 194, 171, 0.14);
  --c-border-hover: rgba(182, 194, 171, 0.28);
  --c-green:        rgb(100, 208, 144);
  --c-green-dim:    rgba(100, 208, 144, 0.12);
  --c-blue:         rgb(166, 218, 255);
  --c-blue-dim:     rgba(166, 218, 255, 0.12);
  --c-orange:       rgb(255, 184, 100);
  --c-orange-dim:   rgba(255, 184, 100, 0.12);
  --c-red:          rgb(255, 110, 110);
  --c-red-dim:      rgba(255, 110, 110, 0.12);
  --c-purple:       rgb(200, 160, 255);
  --c-purple-dim:   rgba(200, 160, 255, 0.12);
`

export const LIGHT_CSS_VARS = `
  --c-bg:           #f7f7f8;
  --c-bg2:          #ffffff;
  --c-bg3:          #f1f1f2;
  --c-text:         #2c2d30;
  --c-muted:        rgba(59, 31, 119, 0.58);
  --c-faint:        rgba(59, 31, 119, 0.32);
  --c-border:       rgba(59, 31, 119, 0.12);
  --c-border-hover: rgba(59, 31, 119, 0.24);
  --c-green:        #15803d;
  --c-green-dim:    rgba(21, 128, 61, 0.10);
  --c-blue:         #1d4ed8;
  --c-blue-dim:     rgba(29, 78, 216, 0.10);
  --c-orange:       #c2410c;
  --c-orange-dim:   rgba(194, 65, 12, 0.10);
  --c-red:          #dc2626;
  --c-red-dim:      rgba(220, 38, 38, 0.10);
  --c-purple:       #7c3aed;
  --c-purple-dim:   rgba(124, 58, 237, 0.10);
`

export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

// ─── AGENCY THEMES ────────────────────────────────────────────────────────────
export interface AgencyTheme {
  name:    string
  primary: string
  dim:     string
  glow:    string
  logo:    string   // emoji or short text
  gradient: [string, string]  // for AV logo box
}

// Hex codes verified by direct CSS extraction from each agency's live website (May 2026)
// Peake: #3f0278 (RGB 63,2,120) confirmed brand color · Barry Plant: #001FB9 cobalt from inline HTML · Jellis Craig: #8EC6B5 from CSS
// Ray White: #FFD200 from sponsor placements · Harcourts: #001F49/#C8102E from brand PDF · McGrath: #E67200 from rebrand docs
// LJ Hooker: #E8001D from ljhooker.com · Others: best available public source
export const AGENCY_THEMES: Record<string, AgencyTheme> = {
  // ── Verified ──────────────────────────────────────────────────────────────
  "Peake":                    { name: "Peake",                    primary: "#3b1f77",             dim: "rgba(59,31,119,0.10)",      glow: "rgba(59,31,119,0.06)",      logo: "PK", gradient: ["#553990", "#3b1f77"]                       },
  "Ray White":                { name: "Ray White",                primary: "#FFD200",             dim: "rgba(255,210,0,0.12)",      glow: "rgba(255,210,0,0.07)",      logo: "RW", gradient: ["#FFD200", "#E8A800"]                       },
  "Barry Plant":              { name: "Barry Plant",              primary: "#001FB9",             dim: "rgba(232,0,45,0.14)",       glow: "rgba(232,0,45,0.10)",       logo: "BP", gradient: ["#E8002D", "#C0001A"]                       },
  "Barry Plant Berwick":      { name: "Barry Plant Berwick",      primary: "#001FB9",             dim: "rgba(232,0,45,0.14)",       glow: "rgba(232,0,45,0.10)",       logo: "BP", gradient: ["#E8002D", "#C0001A"]                       },
  "Jellis Craig":             { name: "Jellis Craig",             primary: "#8EC6B5",             dim: "rgba(142,198,181,0.12)",    glow: "rgba(142,198,181,0.07)",    logo: "JC", gradient: ["#8EC6B5", "#4A9B88"]                       },
  // ── Well-documented ───────────────────────────────────────────────────────
  "Harcourts":                { name: "Harcourts",                primary: "#C8102E",             dim: "rgba(200,16,46,0.12)",      glow: "rgba(200,16,46,0.07)",      logo: "HC", gradient: ["#E8384F", "#C8102E"]                       },
  "McGrath Estate Agents":    { name: "McGrath Estate Agents",    primary: "#E67200",             dim: "rgba(230,114,0,0.12)",      glow: "rgba(230,114,0,0.07)",      logo: "MC", gradient: ["#FF8C00", "#E67200"]                       },
  "LJ Hooker":                { name: "LJ Hooker",                primary: "#E8001D",             dim: "rgba(232,0,29,0.12)",       glow: "rgba(232,0,29,0.07)",       logo: "LJ", gradient: ["#FF3040", "#E8001D"]                       },
  // ── Best available ────────────────────────────────────────────────────────
  "Nelson Alexander":         { name: "Nelson Alexander",         primary: "#C8705A",             dim: "rgba(200,112,90,0.12)",     glow: "rgba(200,112,90,0.07)",     logo: "NA", gradient: ["#D4845E", "#8B3A2C"]                       },
  "Fletchers Real Estate":    { name: "Fletchers Real Estate",    primary: "#00897B",             dim: "rgba(0,137,123,0.12)",      glow: "rgba(0,137,123,0.07)",      logo: "FL", gradient: ["#26A69A", "#00897B"]                       },
  "Buxton Real Estate":       { name: "Buxton Real Estate",       primary: "#B8966E",             dim: "rgba(184,150,110,0.12)",    glow: "rgba(184,150,110,0.07)",    logo: "BX", gradient: ["#C8A87E", "#8C6040"]                       },
  "Raine & Horne":            { name: "Raine & Horne",            primary: "#C9A84C",             dim: "rgba(201,168,76,0.12)",     glow: "rgba(201,168,76,0.07)",     logo: "RH", gradient: ["#D4B84C", "#8C6800"]                       },
  "Century 21":               { name: "Century 21",               primary: "#D4A017",             dim: "rgba(212,160,23,0.12)",     glow: "rgba(212,160,23,0.07)",     logo: "C21",gradient: ["#D4A017", "#8C6400"]                       },
  "First National Real Estate":{ name: "First National Real Estate",primary:"#005CA9",            dim: "rgba(0,92,169,0.12)",       glow: "rgba(0,92,169,0.07)",       logo: "FN", gradient: ["#0078D4", "#005CA9"]                       },
  "Kay & Burton":             { name: "Kay & Burton",             primary: "#B0A090",             dim: "rgba(176,160,144,0.12)",    glow: "rgba(176,160,144,0.07)",    logo: "KB", gradient: ["#C0B0A0", "#786050"]                       },
  "Biggin & Scott":           { name: "Biggin & Scott",           primary: "#4C78CC",             dim: "rgba(76,120,204,0.12)",     glow: "rgba(76,120,204,0.07)",     logo: "BS", gradient: ["#6492E0", "#4C78CC"]                       },
  "Area Specialist":          { name: "Area Specialist",          primary: "#111111",              dim: "rgba(17,17,17,0.12)",       glow: "rgba(17,17,17,0.07)",       logo: "AS", gradient: ["#484848", "#111111"]                       },
  // ── New agents (June 2026) — hex from live site CSS extraction where possible ──
  // 5th Avenue Real Estate: #e1b530 confirmed from .bg-primary/.text-primary in site CSS (the5thavenue.com.au)
  "5th Avenue Real Estate":   { name: "5th Avenue Real Estate",   primary: "#e1b530",             dim: "rgba(225,181,48,0.12)",     glow: "rgba(225,181,48,0.07)",     logo: "5A", gradient: ["#f0cf6a", "#e1b530"]                       },
  // Uphill Real Estate: #f18017 best available from uphillrealestate.com.au site CSS (orange brand accent)
  "Uphill Real Estate":       { name: "Uphill Real Estate",       primary: "#f18017",             dim: "rgba(241,128,23,0.12)",     glow: "rgba(241,128,23,0.07)",     logo: "UH", gradient: ["#ffa64d", "#f18017"]                       },
  // Gill Estate Agents: site unreachable for CSS extraction — best-available placeholder (navy), verify before brand use
  "Gill Estate Agents":       { name: "Gill Estate Agents",       primary: "#14274e",             dim: "rgba(20,39,78,0.12)",       glow: "rgba(20,39,78,0.07)",       logo: "GE", gradient: ["#3a5a99", "#14274e"]                       },
  "Other":                    { name: "Other",                    primary: "rgb(166,218,255)",    dim: "rgba(166,218,255,0.12)",    glow: "rgba(166,218,255,0.06)",    logo: "AV", gradient: ["rgb(166,218,255)", "rgb(100,208,144)"]      },
}

export const DEFAULT_THEME: AgencyTheme = AGENCY_THEMES["Other"]

export function getAgencyTheme(agency: string): AgencyTheme {
  return AGENCY_THEMES[agency] ?? {
    ...DEFAULT_THEME,
    name: agency,
    logo: agency.slice(0, 2).toUpperCase(),
  }
}

// ─── VENDOR DISPLAY SETTINGS ──────────────────────────────────────────────────
export interface VendorDisplaySettings {
  showCRMNotes:        boolean
  showTriggers:        boolean
  showOutreachAngles:  boolean
  showEquityScenarios: boolean
  showOptimalWindow:   boolean
  // Added in v2 — UX noise reduction toggles
  showMarketTriggers:  boolean   // TriggerFeed on vendor portfolio page
  showComparableMap:   boolean   // Comparable sales Leaflet map
  showMatchScores:     boolean   // Score rings on lead cards
  showDNAAnalysis:     boolean   // Property DNA section
  // Added in v3 — live AI / demo mode
  forceDemoData:       boolean   // Always use hardcoded DEMO_FALLBACK_LEADS; ignore sheet
}

export const DEFAULT_VENDOR_SETTINGS: VendorDisplaySettings = {
  showCRMNotes:        false,
  showTriggers:        false,
  showOutreachAngles:  false,
  showEquityScenarios: false,
  showOptimalWindow:   false,
  showMarketTriggers:  false,
  showComparableMap:   false,
  showMatchScores:     false,
  showDNAAnalysis:     false,
  forceDemoData:       false,
}

// ─── TYPES ────────────────────────────────────────────────────────────────────
export type ViewId = "demo" | "setup" | "principal" | "campaign" | "voiceagent" | "insights"

export type LeadStatus =
  | "outreach_sent"
  | "email_opened"
  | "sms_replied"
  | "email_clicked"
  | "inspection_booked"
  | "inspection_attended"
  | "registered_to_bid"
  | "bid_placed"
  | "property_won"
  | "missed_out"
  | "nurture_sequence"
  | "opted_out"

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  outreach_sent:       "Sent",
  email_opened:        "Opened",
  sms_replied:         "Replied",
  email_clicked:       "Clicked",
  inspection_booked:   "Booked",
  inspection_attended: "Attended",
  registered_to_bid:   "Registered",
  bid_placed:          "Bid",
  property_won:        "Won",
  missed_out:          "Missed out",
  nurture_sequence:    "Nurturing",
  opted_out:           "Opted out",
}

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "outreach_sent", "email_opened", "sms_replied", "email_clicked",
  "inspection_booked", "inspection_attended", "registered_to_bid",
  "bid_placed", "property_won",
]

export interface AuctionOutcome {
  propertyId:             number
  propertyAddress:        string
  suburb:                 string
  auctionDate:            string
  hammerPrice:            number
  registeredBidders:      number
  activeBidders:          number
  priceGuideMin:          number
  priceGuideMax:          number
  propOSLeadsContacted:   number
  propOSLeadsAtAuction:   number
  notes:                  string
}

/** Single entry in the agent's voice training corpus */
export interface TrainingEntry {
  id:        string
  type:      "voice" | "paste" | "email"
  text:      string
  timestamp: string   // ISO date
  wordCount: number
  source:    string   // display label e.g. "Voice clip 1"
}

export interface AgentProfile {
  name:         string
  agency:       string
  email:        string
  phone:        string
  suburb:       string
  tagline:      string
  role?:        "agent" | "principal"
  nickname?:    string    // preferred first name in outreach, e.g. "Manny"
  agencyShort?: string    // short agency label in outreach, e.g. "BP"
  photoUrl?:    string    // headshot for appraisal report footer
  voiceProfile:    VoiceProfile
  trainingCorpus:  TrainingEntry[]
}

export interface VoiceProfile {
  greeting:     string   // "Hey" | "Hi" | "G'day" | "Good morning"
  closing:      string   // "Cheers" | "Thanks" | "Best" | "Speak soon"
  lengthStyle:  "short" | "medium" | "detailed"
  formalityScore: number // 1=casual, 5=formal
  aussieIndex:  number   // 1=neutral, 5=very Aussie
  specificity:  number   // 1=vague, 5=very specific (uses data, numbers)
  emojiUsage:   "none" | "occasional" | "frequent"
  examplesCount: number  // how many examples were fed in
  confidence:   number   // 0-100 how well trained the voice model is
  detectedTraits: string[]
}

export const PAS_DEFAULT_AGENT: AgentProfile = {
  name:    "Pas Sunilchandra",
  agency:  "Area Specialist",
  email:   "pass@areaspecialist.com.au",
  phone:   "0430 366 649",
  suburb:  "Berwick",
  tagline: "SE Melbourne specialist. Results driven.",
  voiceProfile: {
    greeting:       "Hi",
    closing:        "Cheers",
    lengthStyle:    "short",
    formalityScore: 2,
    aussieIndex:    2,
    specificity:    3,
    emojiUsage:     "none",
    examplesCount:  9,
    confidence:     80,
    detectedTraits: ["professional", "concise", "data-focused", "warm closer"],
  },
  trainingCorpus: [],
}

export const MANPREET_DEFAULT_AGENT: AgentProfile = {
  name:         "Manpreet Singh",
  agency:       "Barry Plant Berwick",
  nickname:     "Manny",
  agencyShort:  "BP",
  email:        "manpreet.singh@barryplant.com.au",
  phone:        "0452 275 013",
  suburb:       "Berwick",
  tagline:      "Berwick specialist. Trusted results.",
  voiceProfile: {
    greeting:       "Hey",
    closing:        "Cheers",
    lengthStyle:    "short",
    formalityScore: 1,
    aussieIndex:    3,
    specificity:    3,
    emojiUsage:     "none",
    examplesCount:  9,
    confidence:     82,
    detectedTraits: ["casual", "personal", "upbeat", "neighbourhood-aware", "low-pressure"],
  },
  trainingCorpus: [],
}

export const GILL_DEFAULT_AGENT: AgentProfile = {
  name:         "Harkirat Gill",
  agency:       "Gill Estate Agents",
  agencyShort:  "GE",
  email:        "harkirat@gillagents.com",
  phone:        "0400 000 000",   // TBD — verify direct mobile
  suburb:       "Berwick",
  tagline:      "Clyde North & Berwick specialist. Local results.",
  voiceProfile: {
    greeting:       "Hi",
    closing:        "Cheers",
    lengthStyle:    "short",
    formalityScore: 2,
    aussieIndex:    2,
    specificity:    3,
    emojiUsage:     "none",
    examplesCount:  0,
    confidence:     60,
    detectedTraits: ["professional", "local-area focus", "concise"],
  },
  trainingCorpus: [],
}

export const KUMARAGE_DEFAULT_AGENT: AgentProfile = {
  name:         "Chris Kumarage",
  agency:       "Uphill Real Estate",
  agencyShort:  "UH",
  email:        "chris@uphillrealestate.com.au",
  phone:        "0400 000 000",   // TBD — verify direct mobile
  suburb:       "Clyde North",
  tagline:      "Clyde & Clyde North specialist. Honest, hard-working results.",
  voiceProfile: {
    greeting:       "Hi",
    closing:        "Cheers",
    lengthStyle:    "short",
    formalityScore: 2,
    aussieIndex:    2,
    specificity:    3,
    emojiUsage:     "none",
    examplesCount:  0,
    confidence:     60,
    detectedTraits: ["relationship-focused", "local-area focus", "concise"],
  },
  trainingCorpus: [],
}

export const ABEYSENA_DEFAULT_AGENT: AgentProfile = {
  name:         "Anthony Abeysena",
  agency:       "5th Avenue Real Estate",
  agencyShort:  "5A",
  email:        "anthony@the5thavenue.com.au",
  phone:        "0400 000 000",   // TBD — verify direct mobile
  suburb:       "Truganina",
  tagline:      "Western & SE growth corridor specialist. Genuine results.",
  voiceProfile: {
    greeting:       "Hi",
    closing:        "Cheers",
    lengthStyle:    "short",
    formalityScore: 2,
    aussieIndex:    2,
    specificity:    3,
    emojiUsage:     "none",
    examplesCount:  0,
    confidence:     60,
    detectedTraits: ["professional", "data-focused", "concise"],
  },
  trainingCorpus: [],
}

export const DEFAULT_AGENT: AgentProfile = {
  name:    "Cameron Knoll",
  agency:  "Peake",
  email:   "cameronk@peakere.com.au",
  phone:   "0428 762 148",
  suburb:  "Berwick",
  tagline: "Berwick specialist. Genuine results.",
  voiceProfile: {
    greeting:       "Hi",
    closing:        "Cheers",
    lengthStyle:    "short",
    formalityScore: 2,
    aussieIndex:    2,
    specificity:    3,
    emojiUsage:     "occasional",
    examplesCount:  9,
    confidence:     82,
    detectedTraits: ["warm", "appreciative", "concise", "responsive"],
  },
  trainingCorpus: [],
}

// ─── PORTFOLIO ────────────────────────────────────────────────────────────────
export interface PortfolioProperty {
  id:          number
  address:     string
  suburb:      string
  state:       string
  postcode:    string
  price:       number          // sold price or mid guide for active
  priceMin?:   number          // active listing guide low
  priceMax?:   number          // active listing guide high
  beds:        number
  baths:       number
  cars:        number
  land?:       number
  type:        "House" | "Unit" | "Townhouse"
  status:      "active" | "sold" | "under_offer"
  soldDate?:   string
  openDate?:   string
  auctionDate?: string
  image:       string
  description: string
  leadCount:   number          // expected attendees / known leads
}

// ── Agent gating ──────────────────────────────────────────────────────────────

export function isCamKnoll(agent: AgentProfile): boolean {
  const name = agent.name.toLowerCase().trim()
  const agency = agent.agency.toLowerCase().trim()
  return (name.startsWith("cam") && name.includes("knoll")) && agency.includes("peake")
}

export function isPasSunilchandra(agent: AgentProfile): boolean {
  const name = agent.name.toLowerCase().trim()
  const agency = agent.agency.toLowerCase().trim()
  return (name.startsWith("pas") && name.includes("sunilchandra")) && agency.includes("area specialist")
}

export function isManpreetSingh(agent: AgentProfile): boolean {
  const name = agent.name.toLowerCase().trim()
  const agency = agent.agency.toLowerCase().trim()
  const nameMatch = name.includes("manpreet") || (name.includes("manny") && name.includes("singh"))
  return nameMatch && agency.includes("barry plant")
}

export function isHarkiratGill(agent: AgentProfile): boolean {
  const name = agent.name.toLowerCase().trim()
  const agency = agent.agency.toLowerCase().trim()
  return name.includes("harkirat") && name.includes("gill") && agency.includes("gill")
}

export function isChrisKumarage(agent: AgentProfile): boolean {
  const name = agent.name.toLowerCase().trim()
  const agency = agent.agency.toLowerCase().trim()
  return name.includes("chris") && name.includes("kumarage") && agency.includes("uphill")
}

export function isAnthonyAbeysena(agent: AgentProfile): boolean {
  const name = agent.name.toLowerCase().trim()
  const agency = agent.agency.toLowerCase().trim()
  return name.includes("anthony") && name.includes("abeysena") && agency.includes("5th avenue")
}

export function getPortfolioForAgent(agent: AgentProfile): { sold: PortfolioProperty[]; active: PortfolioProperty[] } {
  if (isCamKnoll(agent)) return { sold: PORTFOLIO_SOLD, active: PORTFOLIO_ACTIVE }
  if (isPasSunilchandra(agent)) return { sold: PAS_PORTFOLIO_SOLD, active: PAS_PORTFOLIO_ACTIVE }
  if (isManpreetSingh(agent)) return { sold: MANPREET_PORTFOLIO_SOLD, active: MANPREET_PORTFOLIO_ACTIVE }
  if (isHarkiratGill(agent)) return { sold: GILL_PORTFOLIO_SOLD, active: GILL_PORTFOLIO_ACTIVE }
  if (isChrisKumarage(agent)) return { sold: KUMARAGE_PORTFOLIO_SOLD, active: KUMARAGE_PORTFOLIO_ACTIVE }
  if (isAnthonyAbeysena(agent)) return { sold: ABEYSENA_PORTFOLIO_SOLD, active: ABEYSENA_PORTFOLIO_ACTIVE }
  // Other agents see empty portfolio
  return { sold: [], active: [] }
}

// Sold comparable properties — leads come exclusively from Google Sheets (Leads tab, inspectedProperty column)
export const PORTFOLIO_SOLD: PortfolioProperty[] = [
  {
    id: 107,
    address: "34 Hartsmere Drive",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 850000, beds: 4, baths: 2, cars: 2, land: 621,
    type: "House", status: "sold", soldDate: "08 Mar 2026",
    image: "/34-hartsmere-drive.jpg",
    description: "4-bed family home in the Kingsmere Estate. Open plan living, stone kitchen, alfresco, double garage on a 621sqm lot.",
    leadCount: 4,
  },
  {
    id: 102,
    address: "3 Thirlmere Court",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 941000, beds: 4, baths: 2, cars: 2, land: 612,
    type: "House", status: "sold", soldDate: "02 May 2026",
    image: "/3-thirlmere-court.jpg",
    description: "Quiet court position, double lock-up garage, updated kitchen. 612sqm in the sought-after Berwick Fields estate.",
    leadCount: 19,
  },
  {
    id: 103,
    address: "5 Ascot Rise",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 1265000, beds: 4, baths: 2, cars: 2, land: 754,
    type: "House", status: "sold", soldDate: "03 Jul 2023",
    image: "/5-ascot-rise.jpg",
    description: "Prestige Hamptons renovation. 754sqm, renovated kitchen with stone benchtops, outdoor kitchen, home theatre. Walking distance to Berwick Grammar.",
    leadCount: 24,
  },
  {
    id: 104,
    address: "3 Yemaya Place",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 1100000, beds: 4, baths: 2, cars: 2, land: 806,
    type: "House", status: "sold", soldDate: "11 May 2026",
    image: "/3-yemaya-place.jpg",
    description: "Contemporary 4-bed family home in Berwick. Open plan living, modern kitchen, alfresco, double garage on 806sqm cul-de-sac block.",
    leadCount: 15,
  },
]

// ── Pas Sunilchandra / Area Specialist — SE Melbourne portfolio ───────────────

export const PAS_PORTFOLIO_SOLD: PortfolioProperty[] = [
  {
    id: 301,
    address: "58 Broadway Street",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 932000, beds: 4, baths: 2, cars: 2, land: 612,
    type: "House", status: "sold", soldDate: "14 May 2026",
    image: "/58-broadway-street.png",
    description: "Brand new 2025 Metricon build in established Berwick. 4-bed family home with double garage. Berwick Chase Primary catchment, close to Berwick Station.",
    leadCount: 16,
  },
  {
    id: 302,
    address: "48 Chantenay Parade",
    suburb: "Cranbourne North", state: "VIC", postcode: "3977",
    price: 815000, beds: 4, baths: 2, cars: 2, land: 423,
    type: "House", status: "sold", soldDate: "28 Apr 2026",
    image: "/48-chantenay-parade.jpg",
    description: "Modern 4-bed in Cranbourne North estate. Open plan living, stone benchtops, ducted reverse-cycle, double garage on 423sqm.",
    leadCount: 14,
  },
  {
    id: 303,
    address: "20 Elwick Drive",
    suburb: "Clyde North", state: "VIC", postcode: "3978",
    price: 670000, beds: 3, baths: 2, cars: 1, land: 289,
    type: "House", status: "sold", soldDate: "04 Feb 2026",
    image: "/20-elwick-drive.jpg",
    description: "Neat 3-bed home in Clyde North. Modern kitchen, split-system cooling, low-maintenance 289sqm block. Ideal entry-level or investment.",
    leadCount: 12,
  },
]

export const PAS_PORTFOLIO_ACTIVE: PortfolioProperty[] = [
  {
    id: 401,
    address: "64 Timbertop Boulevard",
    suburb: "Officer", state: "VIC", postcode: "3809",
    price: 910000, priceMin: 860000, priceMax: 960000,
    beds: 4, baths: 2, cars: 2, land: 519,
    type: "House", status: "active",
    openDate: "Saturday 24 May 2026, 11:00am",
    image: "/64-timbertop-boulevard.jpg",
    description: "Custom 46+ square two-storey home in Officer. Grand entry, theatre room, study, stone kitchen with butler's pantry, freestanding bath in ensuite. 6-star energy rating. Officer Secondary College zone.",
    leadCount: 0,
  },
  {
    id: 402,
    address: "8/59-61 Belgrave Hallam Road",
    suburb: "Hallam", state: "VIC", postcode: "3803",
    price: 510000, priceMin: 490000, priceMax: 540000,
    beds: 2, baths: 1, cars: 1, land: 162,
    type: "Unit", status: "active",
    openDate: "Saturday 24 May 2026, 1:30pm",
    image: "/8-59-61-belgrave-hallam-road.jpg",
    description: "2-bed townhouse in a boutique 2018 complex on Belgrave Hallam Road. Open plan living, private courtyard, single garage. 1.1km to Hallam Station. Excellent entry-level or investment.",
    leadCount: 0,
  },
  {
    id: 403,
    address: "12 Swallowtail Avenue",
    suburb: "Clyde North", state: "VIC", postcode: "3978",
    price: 815000, priceMin: 780000, priceMax: 850000,
    beds: 4, baths: 2, cars: 2, land: 380,
    type: "House", status: "active",
    openDate: "Sunday 25 May 2026, 11:00am",
    image: "/12-swallowtail-avenue.jpg",
    description: "Contemporary 4-bed family home in Clyde North's Berwick Waters estate (2018 build). Butler's pantry, ducted reverse-cycle, alfresco, double garage. Wilandra Rise Primary zone.",
    leadCount: 0,
  },
]

// ── Manpreet Singh / Barry Plant Berwick — portfolio ─────────────────────────

export const MANPREET_PORTFOLIO_SOLD: PortfolioProperty[] = [
  {
    id: 501,
    address: "40 Jack William Way",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 805000, beds: 3, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "25 May 2026",
    image: "/40-jack-william-way.jpg",
    description: "Well-presented 3-bed family home in the heart of Berwick. Open plan kitchen and living, ducted heating, double lock-up garage. Quiet streetscape close to Berwick Station and Berwick Village.",
    leadCount: 0,
  },
  {
    id: 502,
    address: "15 Hartsmere Drive",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 845000, beds: 3, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "02 May 2026",
    image: "/15-hartsmere-drive.jpg",
    description: "Immaculate 3-bed home with striking rendered façade. Stylish open plan living, stone kitchen benchtops, alfresco entertaining area, double garage. Steps to Berwick Primary and Timbarra shopping.",
    leadCount: 0,
  },
  {
    id: 503,
    address: "47 Marija Crescent",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 920000, beds: 4, baths: 3, cars: 2,
    type: "House", status: "sold", soldDate: "27 Feb 2026",
    image: "/47-marija-crescent.jpg",
    description: "Impressive 4-bed, 3-bath family home with premium inclusions throughout. Double garage, alfresco entertaining, stone kitchen benchtops. Walking distance to Berwick Village and St Margaret Mary's College.",
    leadCount: 0,
  },
  {
    id: 504,
    address: "6 Monarch Road",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 950000, beds: 4, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "30 Dec 2025",
    image: "/6-monarch-road.jpg",
    description: "Elegant 4-bed family residence on generous allotment. Multiple living areas, gourmet kitchen with butler's pantry, alfresco with outdoor kitchen, double remote garage. Premier Berwick address.",
    leadCount: 0,
  },
  {
    id: 505,
    address: "4 Riverglen Road",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 1035000, beds: 5, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "30 Mar 2026",
    image: "/4-riverglen-road.jpg",
    description: "Stunning 5-bed executive home in one of Berwick's most sought-after streets. Grand proportions, home theatre, study, chef's kitchen, master retreat with spa ensuite. Triple garage.",
    leadCount: 0,
  },
]

export const MANPREET_PORTFOLIO_ACTIVE: PortfolioProperty[] = [
  {
    id: 602,
    address: "13 Jack William Way",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 0, priceMin: 0, priceMax: 0,
    beds: 0, baths: 0, cars: 0, land: 630,
    type: "House", status: "active",
    openDate: "TBD",
    auctionDate: "TBD",
    image: "/13-jack-william-way.png",
    description: "630m² residential property (GRZ1) at Jack William Way, Berwick. Lot 106 PS516565X. Title Vol 10794 Fol 460. Electricity, gas, water and sewerage connected. No planning overlays. Not in bushfire prone area. E-2 drainage and sewerage easement (9m). ANZ mortgage discharged at settlement. City of Casey. Melway 131 A5.",
    leadCount: 0,
  },
  {
    id: 601,
    address: "2 Tallangatta Place",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 1050000, priceMin: 1000000, priceMax: 1100000,
    beds: 4, baths: 2, cars: 2, land: 774,
    type: "House", status: "active",
    openDate: "Saturday 31 May 2026, 1:00pm",
    auctionDate: "Saturday 14 June 2026",
    image: "/2-tallangatta-place.jpg",
    description: "Impressive 4-bed family residence on a generous 774sqm allotment in one of Berwick's most sought-after pockets. Featuring multiple living zones, modern kitchen with stone benchtops, alfresco entertaining and a double garage. Walking distance to Berwick Village, top schools and Casey Hub.",
    leadCount: 3,
  },
]

// ── Harkirat Gill / Gill Estate Agents — Clyde North & Berwick portfolio ─────
// Source: agent-supplied recently sold / active listing summary (Jun 2026).
// No Section 32 available — descriptions are based on bed/bath/car counts only.

export const GILL_PORTFOLIO_SOLD: PortfolioProperty[] = [
  {
    id: 701,
    address: "44 Elmtree Crescent",
    suburb: "Clyde North", state: "VIC", postcode: "3978",
    price: 830000, beds: 4, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "13 May 2026",
    image: "/44-elmtree-crescent.jpg",
    description: "4-bed, 2-bath family home with double garage in Clyde North. Sold 13 May 2026.",
    leadCount: 0,
  },
  {
    id: 702,
    address: "2/11 Pettit Close",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 765000, beds: 4, baths: 2, cars: 2,
    type: "Townhouse", status: "sold", soldDate: "04 May 2026",
    image: "/2-11-pettit-close.jpg",
    description: "4-bed, 2-bath townhouse with double garage in Berwick. Sold 04 May 2026.",
    leadCount: 0,
  },
  {
    id: 703,
    address: "4/527 Princes Highway",
    suburb: "Noble Park", state: "VIC", postcode: "3174",
    price: 462000, beds: 2, baths: 1, cars: 1,
    type: "Unit", status: "sold", soldDate: "24 Apr 2026",
    image: "/4-527-princes-highway.jpg",
    description: "2-bed, 1-bath unit with single car space in Noble Park. Sold 24 Apr 2026.",
    leadCount: 0,
  },
]

export const GILL_PORTFOLIO_ACTIVE: PortfolioProperty[] = [
  {
    id: 711,
    address: "31 Paxford Drive",
    suburb: "Cranbourne North", state: "VIC", postcode: "3977",
    price: 705000, priceMin: 680000, priceMax: 730000,
    beds: 3, baths: 2, cars: 1,
    type: "House", status: "active",
    openDate: "TBD",
    image: "/31-paxford-drive.jpg",
    description: "3-bed, 2-bath family home with single garage in Cranbourne North. Listed 05 Jun 2026.",
    leadCount: 0,
  },
  {
    id: 712,
    address: "139 Kananook Avenue",
    suburb: "Seaford", state: "VIC", postcode: "3198",
    price: 1000000, priceMin: 950000, priceMax: 1050000,
    beds: 3, baths: 1, cars: 0,
    type: "House", status: "active",
    openDate: "TBD",
    image: "/139-kananook-avenue.jpg",
    description: "3-bed, 1-bath home in Seaford, close to the beach and Kananook Station. Listed 04 Jun 2026.",
    leadCount: 0,
  },
  {
    id: 713,
    address: "8 Canter Circuit",
    suburb: "Clyde North", state: "VIC", postcode: "3978",
    price: 910000, priceMin: 910000, priceMax: 910000,
    beds: 0, baths: 0, cars: 0,
    type: "House", status: "active",
    openDate: "TBD",
    image: "/8-canter-circuit.jpg",
    description: "Residential land at Canter Circuit, Clyde North. Listed 02 Jun 2026.",
    leadCount: 0,
  },
]

// ── Chris Kumarage / Uphill Real Estate — Clyde & Clyde North portfolio ──────
// Source: agent-supplied recently sold / active listing summary (Jun 2026).
// No Section 32 available — descriptions are based on bed/bath/car counts only.

export const KUMARAGE_PORTFOLIO_SOLD: PortfolioProperty[] = [
  {
    id: 801,
    address: "14 Basalt Drive",
    suburb: "Clyde North", state: "VIC", postcode: "3978",
    price: 780000, beds: 4, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "05 May 2026",
    image: "/14-basalt-drive.jpg",
    description: "4-bed, 2-bath family home with double garage in Clyde North. Sold 05 May 2026.",
    leadCount: 0,
  },
  {
    id: 802,
    address: "27 Picnic Avenue",
    suburb: "Clyde North", state: "VIC", postcode: "3978",
    price: 0, beds: 4, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "03 May 2026",
    image: "/27-picnic-avenue.jpg",
    description: "4-bed, 2-bath family home with double garage in Clyde North. Sold price undisclosed (contact agent). Sold 03 May 2026.",
    leadCount: 0,
  },
  {
    id: 803,
    address: "57 Kamet Street",
    suburb: "Clyde", state: "VIC", postcode: "3978",
    price: 650000, beds: 4, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "30 Apr 2026",
    image: "/57-kamet-street.jpg",
    description: "4-bed, 2-bath family home with double garage in Clyde. Sold 30 Apr 2026.",
    leadCount: 0,
  },
]

export const KUMARAGE_PORTFOLIO_ACTIVE: PortfolioProperty[] = [
  {
    id: 811,
    address: "15 Niloma Street",
    suburb: "Clyde North", state: "VIC", postcode: "3978",
    price: 724500, priceMin: 699000, priceMax: 750000,
    beds: 4, baths: 2, cars: 2,
    type: "House", status: "active",
    openDate: "TBD",
    image: "/15-niloma-street.jpg",
    description: "4-bed, 2-bath family home with double garage in Clyde North. Listed 01 May 2026.",
    leadCount: 0,
  },
  {
    id: 812,
    address: "23 Seahawk Street",
    suburb: "Clyde North", state: "VIC", postcode: "3978",
    price: 719000, priceMin: 689000, priceMax: 749000,
    beds: 4, baths: 2, cars: 2,
    type: "House", status: "active",
    openDate: "TBD",
    image: "/23-seahawk-street.jpg",
    description: "4-bed, 2-bath family home with double garage in Clyde North. Listed 17 Apr 2026.",
    leadCount: 0,
  },
  {
    id: 813,
    address: "19 Sark Street",
    suburb: "Clyde North", state: "VIC", postcode: "3978",
    price: 974000, priceMin: 949000, priceMax: 999000,
    beds: 4, baths: 2, cars: 2,
    type: "House", status: "active",
    openDate: "TBD",
    image: "/19-sark-street.jpg",
    description: "4-bed, 2-bath family home with double garage in Clyde North. Listed 17 Apr 2026.",
    leadCount: 0,
  },
]

// ── Anthony Abeysena / 5th Avenue Real Estate — growth corridor portfolio ───
// Source: agent-supplied recently sold / active listing summary (Jun 2026).
// No Section 32 available — descriptions are based on bed/bath/car counts only.

export const ABEYSENA_PORTFOLIO_SOLD: PortfolioProperty[] = [
  {
    id: 901,
    address: "18 Straun Road",
    suburb: "Mickleham", state: "VIC", postcode: "3064",
    price: 730000, beds: 4, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "22 May 2026",
    image: "/18-straun-road.jpg",
    description: "4-bed, 2-bath family home with double garage in Mickleham. Sold 22 May 2026.",
    leadCount: 0,
  },
  {
    id: 902,
    address: "5 Glenisla Way",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 940000, beds: 4, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "18 Mar 2026",
    image: "/5-glenisla-way.jpg",
    description: "4-bed, 2-bath family home with double garage in Berwick. Sold 18 Mar 2026.",
    leadCount: 0,
  },
  {
    id: 903,
    address: "9 Sugarloaf Grove",
    suburb: "Werribee", state: "VIC", postcode: "3030",
    price: 685000, beds: 4, baths: 2, cars: 2,
    type: "House", status: "sold", soldDate: "06 Mar 2026",
    image: "/9-sugarloaf-grove.jpg",
    description: "4-bed, 2-bath family home with double garage in Werribee. Sold 06 Mar 2026.",
    leadCount: 0,
  },
]

export const ABEYSENA_PORTFOLIO_ACTIVE: PortfolioProperty[] = [
  {
    id: 911,
    address: "18 Maplewood Circuit",
    suburb: "Truganina", state: "VIC", postcode: "3029",
    price: 719500, priceMin: 690000, priceMax: 749000,
    beds: 4, baths: 2, cars: 2,
    type: "House", status: "active",
    openDate: "TBD",
    image: "/18-maplewood-circuit.jpg",
    description: "4-bed, 2-bath family home with double garage in Truganina. Listed 30 Apr 2026.",
    leadCount: 0,
  },
]

// ─── DEMO MODE ────────────────────────────────────────────────────────────────
export type DemoMode = "buyer" | "vendor"

// ─── VENDOR PROSPECTS ─────────────────────────────────────────────────────────
export interface VendorProspect {
  id: number
  name: string
  address: string
  suburb: string
  yearsOwned: number
  estimatedValue: number   // asking-price estimate $
  triggerEvent: string     // "Neighbour sold", "Empty nester", etc.
  notes: string
  phone: string
  email?: string
  propertyType: "House" | "Unit" | "Townhouse"
  beds: number
  baths: number
  land?: number            // sqm
  linkedPropertyId: number // which sold property is the proof-of-performance
}

export const VENDOR_PROSPECTS: VendorProspect[] = [
  // ── Cameron Knoll / Peake — Berwick prospects ────────────────────────────
  {
    id: 1001, linkedPropertyId: 102,
    name: "David & Karen Hollis", address: "35 Jarryd Crescent", suburb: "Berwick",
    yearsOwned: 9, estimatedValue: 1000000, phone: "0418 234 567",
    triggerEvent: "Neighbours sold, saw Cameron's result on their street",
    notes: "Two kids still at school. Karen mentioned they've been thinking about upsizing for a while. Very receptive when the subject came up.",
    propertyType: "House", beds: 4, baths: 2, land: 949,
  },
  {
    id: 1002, linkedPropertyId: 102,
    name: "Michael Chen", address: "37 Cedarwood Crescent", suburb: "Berwick",
    yearsOwned: 11, estimatedValue: 1230000, phone: "0411 567 890",
    triggerEvent: "Both kids grown up, looking to rightsize",
    notes: "Heard about Cameron's recent results in Berwick. Very engaged and researching the right timing. Not in a hurry but motivated.",
    propertyType: "House", beds: 5, baths: 2, land: 728,
  },
  {
    id: 1003, linkedPropertyId: 102,
    name: "Sandra Moore", address: "22 Tilba Court", suburb: "Berwick",
    yearsOwned: 6, estimatedValue: 840000, phone: "0422 891 234",
    triggerEvent: "Growing family, needs a bigger home urgently",
    notes: "Third baby due August. Wants to be on the market by end of year. Timeline is firm.",
    propertyType: "House", beds: 3, baths: 2, land: 676,
  },
  {
    id: 1004, linkedPropertyId: 103,
    name: "James & Lisa Thompson", address: "10 Meg Way", suburb: "Berwick",
    yearsOwned: 8, estimatedValue: 1200000, phone: "0404 123 456",
    triggerEvent: "Downsizing, both kids have left home",
    notes: "Lisa is the decision maker. Wants to move closer to Narre Warren South. Flexible on timing but keen to understand current market value.",
    propertyType: "House", beds: 4, baths: 3, land: 824,
  },
  {
    id: 1005, linkedPropertyId: 103,
    name: "Robert Patel", address: "113 Soldiers Road", suburb: "Berwick",
    yearsOwned: 7, estimatedValue: 890000, phone: "0431 678 901",
    triggerEvent: "Tenant lease expiring, reviewing portfolio",
    notes: "Highly motivated investor — looking to free up capital. Needs to be sold within 90 days. Will consider a strong offer quickly.",
    propertyType: "House", beds: 4, baths: 2, land: 428,
  },
  {
    id: 1006, linkedPropertyId: 104,
    name: "Paul & Michelle Grant", address: "5 Claremont Glen", suburb: "Berwick",
    yearsOwned: 5, estimatedValue: 770000, phone: "0415 345 678",
    triggerEvent: "Surprised by recent comparable sales in the area",
    notes: "Paul had no idea the market had moved this much. Wants a market update. Low-pressure initial conversation, just curious at this stage.",
    propertyType: "House", beds: 4, baths: 2, land: 631,
  },
  // ── Manpreet Singh / Barry Plant Berwick — Berwick prospects ────────────
  {
    id: 3001, linkedPropertyId: 501,
    name: "Gary & Sue Holden", address: "34 Jack William Way", suburb: "Berwick",
    yearsOwned: 9, estimatedValue: 820000, phone: "0418 441 892",
    email: "sholden@gmail.com",
    triggerEvent: "Watched 40 Jack William Way sell, rang Manpreet next day",
    notes: "Gary is a sparky, Sue works part-time at the school. Three kids, youngest finishing Year 12 this year. They mentioned the backyard is bigger than they need now and they've been thinking about something a bit more manageable. Very warm. Gary knew the sellers and was impressed with how smooth the campaign ran.",
    propertyType: "House", beds: 3, baths: 2, land: 548,
  },
  {
    id: 3002, linkedPropertyId: 501,
    name: "Priya & Raj Mehta", address: "12 Jack William Way", suburb: "Berwick",
    yearsOwned: 7, estimatedValue: 810000, phone: "0431 667 234",
    email: "priya.mehta.property@gmail.com",
    triggerEvent: "Number 40 sold, noticed the Barry Plant board went up and came down fast",
    notes: "Priya is a pharmacist, Raj is in IT. Two young kids. They bought in 2019 and have good equity. Raj mentioned at the street party that they'd been talking about upsizing to a 4-bed but aren't sure if it's the right time. Priya follows the market closely and would want a detailed CMA.",
    propertyType: "House", beds: 3, baths: 2, land: 512,
  },
  {
    id: 3003, linkedPropertyId: 502,
    name: "Marco & Lisa Ferretti", address: "9 Hartsmere Drive", suburb: "Berwick",
    yearsOwned: 11, estimatedValue: 860000, phone: "0422 773 105",
    email: "mferretti@hotmail.com",
    triggerEvent: "Neighbour's sale at No. 15, asked Manpreet for an appraisal on the spot",
    notes: "Marco is a concreter, Lisa is a dental nurse. Their two kids have grown up and moved out. One in the city, one in Geelong. Marco mentioned the house is way too big for just the two of them now and the garden takes up every weekend. He's ready to move; Lisa wants to find the right place to downsize to first.",
    propertyType: "House", beds: 3, baths: 2, land: 561,
  },
  {
    id: 3004, linkedPropertyId: 502,
    name: "Anh Nguyen", address: "28 Hartsmere Drive", suburb: "Berwick",
    yearsOwned: 6, estimatedValue: 830000, phone: "0411 298 543",
    email: "anh.nguyen.berwick@gmail.com",
    triggerEvent: "15 Hartsmere result surprised her, owns a similar spec home on same street",
    notes: "Anh bought as an investment in 2019, currently self-managing since the property manager retired. She's been thinking about selling to free up capital for a duplex site in Cranbourne. Mentioned she's been watching the Hartsmere corridor closely. Respond well to yield and capital growth comparisons.",
    propertyType: "House", beds: 3, baths: 2, land: 498,
  },

  // ── Pas Sunilchandra / Area Specialist — SE Melbourne prospects ──────────
  {
    id: 2001, linkedPropertyId: 301,
    name: "Thomas Nguyen", address: "16 Redwood Avenue", suburb: "Hampton Park",
    yearsOwned: 8, estimatedValue: 690000, phone: "0427 456 789",
    triggerEvent: "Saw Pas's sold board in Hampton Park, rang for an appraisal",
    notes: "Thomas saw the sold sticker go up and called Pas directly. Very engaged, wants numbers within the week.",
    propertyType: "House", beds: 3, baths: 2, land: 516,
  },
  {
    id: 2002, linkedPropertyId: 301,
    name: "Anna & Steve Kowalski", address: "11 Gleneadie Close", suburb: "Hampton Park",
    yearsOwned: 6, estimatedValue: 750000, phone: "0438 901 234",
    triggerEvent: "Moving to Melbourne CBD, need to sell by Christmas",
    notes: "Anna is the decision maker, Steve is supportive. Timeline is firm. Must be on market by October at latest.",
    propertyType: "House", beds: 3, baths: 2, land: 545,
  },
  {
    id: 2003, linkedPropertyId: 302,
    name: "Chris Wilson", address: "29 Saffron Drive", suburb: "Hallam",
    yearsOwned: 10, estimatedValue: 790000, phone: "0419 012 345",
    triggerEvent: "Retiring, looking to downsize to a unit nearby",
    notes: "Chris met Pas at the 32 Seattle Crescent open home and was very impressed with her presentation. Has been considering this for 2 years.",
    propertyType: "House", beds: 3, baths: 2, land: 641,
  },
]

// Active listings — Cameron Knoll / Peake
export const PORTFOLIO_ACTIVE: PortfolioProperty[] = [
  {
    id: 101,
    address: "10 Ashby Drive",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 950000, priceMin: 900000, priceMax: 1000000,
    beds: 4, baths: 2, cars: 2, land: 640,
    type: "House", status: "active",
    openDate: "Saturday 31 May 2026, 11:00am",
    auctionDate: "Saturday 14 June 2026",
    image: "/10-ashby-drive.jpg",
    description: "Stunning 4-bed family home on 640sqm in established Berwick. Spacious open plan living, stone kitchen benchtops, ducted heating and cooling, alfresco, double garage. Short walk to Berwick Primary.",
    leadCount: 0,
  },
  {
    id: 105,
    address: "3 Fairholme Boulevard",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 895000, priceMin: 850000, priceMax: 940000,
    beds: 4, baths: 2, cars: 2, land: 744,
    type: "House", status: "active",
    openDate: "Saturday 31 May 2026, 12:30pm",
    auctionDate: "Saturday 14 June 2026",
    image: "/3-fairholme-boulevard.jpg",
    description: "Premium 4-bed on 744sqm in a quiet Berwick pocket. Renovated kitchen with stone benchtops, timber decked entertaining area, ducted heating and cooling, double lock-up garage. Berwick Grammar zone.",
    leadCount: 0,
  },
]
