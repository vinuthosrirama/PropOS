// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
export const C = {
  bg:          "rgb(4, 7, 13)",
  bg2:         "rgb(14, 18, 28)",
  bg3:         "rgb(22, 27, 40)",
  text:        "rgb(213, 219, 230)",
  muted:       "rgba(213, 219, 230, 0.5)",
  faint:       "rgba(213, 219, 230, 0.3)",
  border:      "rgba(216, 231, 242, 0.08)",
  borderHover: "rgba(216, 231, 242, 0.18)",
  blue:        "rgb(166, 218, 255)",
  blueDim:     "rgba(166, 218, 255, 0.12)",
  blueGlow:    "rgba(166, 218, 255, 0.06)",
  green:       "rgb(100, 208, 144)",
  greenDim:    "rgba(100, 208, 144, 0.12)",
  orange:      "rgb(255, 184, 100)",
  orangeDim:   "rgba(255, 184, 100, 0.12)",
  red:         "rgb(255, 110, 110)",
  redDim:      "rgba(255, 110, 110, 0.12)",
  purple:      "rgb(200, 160, 255)",
  purpleDim:   "rgba(200, 160, 255, 0.12)",
} as const

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
// Peake: #3b1f77 from --plyr-color-main CSS var · Barry Plant: #001FB9 cobalt from inline HTML · Jellis Craig: #8EC6B5 from CSS
// Ray White: #FFD200 from sponsor placements · Harcourts: #001F49/#C8102E from brand PDF · McGrath: #E67200 from rebrand docs
// LJ Hooker: #E8001D from ljhooker.com · Others: best available public source
export const AGENCY_THEMES: Record<string, AgencyTheme> = {
  // ── Verified ──────────────────────────────────────────────────────────────
  "Peake":                    { name: "Peake",                    primary: "#9B6FD4",             dim: "rgba(155,111,212,0.12)",    glow: "rgba(155,111,212,0.07)",    logo: "PK", gradient: ["#9B6FD4", "#3b1f77"]                       },
  "Ray White":                { name: "Ray White",                primary: "#FFD200",             dim: "rgba(255,210,0,0.12)",      glow: "rgba(255,210,0,0.07)",      logo: "RW", gradient: ["#FFD200", "#E8A800"]                       },
  "Barry Plant":              { name: "Barry Plant",              primary: "#001FB9",             dim: "rgba(0,31,185,0.12)",       glow: "rgba(0,31,185,0.07)",       logo: "BP", gradient: ["#4c96ff", "#001FB9"]                       },
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

// ─── TYPES ────────────────────────────────────────────────────────────────────
export type ViewId = "demo" | "setup"

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
  name:    string
  agency:  string
  email:   string
  phone:   string
  suburb:  string
  tagline: string
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

export const DEFAULT_AGENT: AgentProfile = {
  name:    "Cameron Knoll",
  agency:  "Peake",
  email:   "cameronk@peakere.com.au",
  phone:   "0428 762 148",
  suburb:  "Berwick",
  tagline: "Berwick specialist. Genuine results.",
  voiceProfile: {
    greeting:       "Hey",
    closing:        "Cheers",
    lengthStyle:    "medium",
    formalityScore: 2,
    aussieIndex:    3,
    specificity:    4,
    emojiUsage:     "none",
    examplesCount:  0,
    confidence:     0,
    detectedTraits: [],
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
  image:       string
  description: string
  leadCount:   number          // expected attendees / known leads
}

// Sold comparable properties — leads come exclusively from Google Sheets (Leads tab, inspectedProperty column)
export const PORTFOLIO_SOLD: PortfolioProperty[] = [
  {
    id: 101,
    address: "48 President Road",
    suburb: "Narre Warren South", state: "VIC", postcode: "3805",
    price: 962000, beds: 4, baths: 2, cars: 2, land: 640,
    type: "House", status: "sold", soldDate: "28 Apr 2026",
    image: "/48-president-road.jpg",
    description: "4-bed family home in sought-after Narre Warren South. Ducted heating and cooling, alfresco, double garage on 640sqm.",
    leadCount: 18,
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
    price: 1095000, beds: 4, baths: 2, cars: 2, land: 600,
    type: "House", status: "sold", soldDate: "15 Mar 2026",
    image: "/3-yemaya-place.jpg",
    description: "Contemporary 4-bed family home in Berwick. Open plan living, modern kitchen, alfresco, double garage on 600sqm.",
    leadCount: 15,
  },
  {
    id: 105,
    address: "34 Hartsmere Drive",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 865000, beds: 4, baths: 2, cars: 2, land: 621,
    type: "House", status: "sold", soldDate: "08 Feb 2026",
    image: "https://rimh2.domainstatic.com.au/vQZsuF67_udtR6syb8UOXkIBsD0=/660x440/filters:format(jpeg):quality(80)/2020596427_3_1_260211_032609-w2048-h1365",
    description: "Kingsmere Estate 4-bed family home. Ducted heating, reverse cycle cooling, decked pergola, double garage on 621sqm.",
    leadCount: 14,
  },
]

// Active listings for cross-property demo
export const PORTFOLIO_ACTIVE: PortfolioProperty[] = [
  {
    id: 201,
    address: "17 Grand Arch Way",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 1175000, priceMin: 1100000, priceMax: 1250000,
    beds: 4, baths: 2, cars: 2, land: 680,
    type: "House", status: "active",
    openDate: "Saturday 17 May 2026, 11:00am",
    image: "https://rimh2.domainstatic.com.au/vQZsuF67_udtR6syb8UOXkIBsD0=/660x440/filters:format(jpeg):quality(80)/2020596427_3_1_260211_032609-w2048-h1365",
    description: "Premium 4-bed in sought-after Grand Arch estate. Entertainers kitchen, theatre room, master ensuite. Walk to Berwick Grammar.",
    leadCount: 0,
  },
  {
    id: 202,
    address: "12 Broadway Street",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 870000, priceMin: 820000, priceMax: 920000,
    beds: 4, baths: 2, cars: 2, land: 601,
    type: "House", status: "active",
    openDate: "Saturday 17 May 2026, 12:30pm",
    image: "https://rimh2.domainstatic.com.au/2C-NIOdYuv1qnTl1sa6RLkBWdaE=/660x440/filters:format(jpeg):quality(80)/2020772529_1_1_260417_073531-w1802-h1200",
    description: "Charming 4-bed family home in Berwick village. Updated kitchen and bathrooms, private rear garden. Walk to station.",
    leadCount: 0,
  },
  {
    id: 203,
    address: "5 Ashfield Drive",
    suburb: "Berwick", state: "VIC", postcode: "3806",
    price: 1420000, priceMin: 1350000, priceMax: 1490000,
    beds: 5, baths: 3, cars: 2, land: 820,
    type: "House", status: "active",
    openDate: "Sunday 18 May 2026, 10:00am",
    image: "https://rimh2.domainstatic.com.au/xbGSfQJZ87FeABRXj0BOifPdSd0=/660x440/filters:format(jpeg):quality(80)/2020678133_1_1_260312_090108-w2048-h1365",
    description: "Grand 5-bed executive home. 820sqm, pool, alfresco, home theatre. Prestige Berwick address, top school zones.",
    leadCount: 0,
  },
]
