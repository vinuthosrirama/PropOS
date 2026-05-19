// PropOS SLM Lead-to-Listing Matching Engine v3
//
// Hybrid Plan B + Plan C:
//   Plan B core — "Revealed Preference Vector": the property a lead physically
//   walked through is their strongest signal. Build a 25-field taste vector from
//   the sold SLM and score active listings by proximity + improvement vs that vector.
//
//   Plan C elements — Deal-breaker scan, confidence multiplier, reasons[] array.
//   Reasons become the agent's talking points and the LLM's pitch angles.

import type { PropertySLM, PropertyQA } from "../data/propertySlm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchReason {
  type: "strength" | "neutral" | "warning"
  text: string
}

export interface MatchResult {
  score: number                  // 0–99
  matchedFactors: MatchFactor[]  // kept for backward compat
  topReason: string
  insight: string
  budgetFlag: "under" | "stretch" | "over"
  comparisons: Comparison[]
  reasons: MatchReason[]         // ordered talking points for agent + LLM
  topPitch: string               // single best line for card UI
  confidence: number             // 0–1 based on SLM completeness
}

export interface MatchFactor {
  label: string
  points: number
  tag: "beds" | "budget" | "suburb" | "school" | "land" | "yield" | "subdivision" | "amenity" | "questions" | "timeline" | "persona" | "vector"
}

export interface Comparison {
  label: string
  soldValue: string
  activeValue: string
  match: "exact" | "close" | "different"
  direction?: "up" | "down" | "same"
  investorRelevant?: boolean
  familyRelevant?: boolean
}

// ---------------------------------------------------------------------------
// Keyword map: field name -> words that trigger it in a buyer's question
// ---------------------------------------------------------------------------

export const KEYWORD_MAP: Record<string, string[]> = {
  landSqm:                    ["lot", "land", "sqm", "size", "block", "m2", "square metres", "yard"],
  schoolZoneCatchment:        ["school", "catchment", "zone", "primary", "secondary", "nossal", "grammar", "education"],
  rentalAppraisalLow:         ["rent", "rental", "appraisal", "lease", "tenant", "income", "investment"],
  grossYieldAtAsk:            ["yield", "return", "gross", "net", "investment return", "roi"],
  settlementTermsDays:        ["settlement", "settle", "terms", "days", "when", "how long"],
  easements:                  ["easement", "restriction", "right of way"],
  covenants:                  ["covenant", "restrict", "height limit", "fence"],
  overlays:                   ["overlay", "heritage", "bushfire", "eso", "planning restriction"],
  s32Status:                  ["s32", "section 32", "contract", "vendor statement", "voc"],
  buildingPermitsOutstanding: ["permit", "building report", "permits", "outstanding work", "unpermitted"],
  kitchenRenovated:           ["kitchen", "bench", "appliance", "oven", "benchtop", "renovated"],
  pool:                       ["pool", "swimming", "spa"],
  solarKw:                    ["solar", "panels", "energy", "electricity", "kw"],
  orientation:                ["north", "north-facing", "orientation", "sun", "aspect", "light"],
  distanceToTrainKm:          ["train", "commute", "station", "transport", "pakenham", "berwick station"],
  distanceToShoppingKm:       ["shopping", "shops", "centre", "retail", "supermarket", "woolworths"],
  nearestHospitalKm:          ["hospital", "casey hospital", "medical", "health"],
  subdivisionPotential:       ["subdivision", "subdivide", "second dwelling", "sub", "develop"],
  vendorMotivation:           ["vendor", "motivation", "why selling", "motivated", "reason", "relocation"],
  beds:                       ["bedroom", "bed", "room", "4 bed", "5 bed", "3 bed"],
  floorplanConfig:            ["floorplan", "floor plan", "layout", "study", "office", "living area"],
  outdoorFeatures:            ["outdoor", "alfresco", "deck", "pergola", "entertaining", "bbq"],
  extensionPotential:         ["extension", "extend", "add on", "build up"],
  zoning:                     ["zone", "zoning", "planning", "nrz", "grz", "residential"],
  councilRates:               ["council", "rates", "annual rates", "rates per year"],
  vendorTimelineDays:         ["timeline", "when move", "settle by", "possession"],
  inclusions:                 ["inclusions", "included", "dishwasher", "blind", "curtain", "what's included"],
  airConType:                 ["air con", "air conditioning", "ducted", "climate control", "cooling"],
  heatingType:                ["heating", "gas", "heat pump", "ducted heat"],
  waterTank:                  ["water tank", "rainwater", "tank"],
  batteryStorage:             ["battery", "powerwall", "energy storage"],
  grannyFlatApproved:         ["granny flat", "secondary dwelling", "unit", "adu"],
  bodyCorporateFees:          ["body corporate", "strata", "owners corp", "fees"],
  vacancyRate:                ["vacancy", "vacant", "vacancy rate", "tenant demand"],
  comparableSales:            ["comparable", "comps", "comparable sales", "recent sales", "sold nearby", "similar sales", "90 days"],
}

// ---------------------------------------------------------------------------
// SCOREABLE_FIELDS — 25 dimensions used in the revealed preference vector.
// Each field has:
//   min/max  — realistic range for normalisation to 0–1
//   dir      — "higher" (more = better, e.g. land) or "lower" (less = better, e.g. distance)
//   baseWt   — default weight across all personas
//   personaBoost — persona-specific weight multipliers
// ---------------------------------------------------------------------------

interface ScoreableField {
  key: keyof PropertySLM
  min: number
  max: number
  dir: "higher" | "lower"
  baseWt: number
  personaBoost: Partial<Record<PersonaKey, number>>
  isBoolean?: boolean
}

type PersonaKey = "investor" | "fhb" | "upsizer" | "downsizer" | "default"

const SCOREABLE_FIELDS: ScoreableField[] = [
  // Physical
  { key: "beds",                min: 1,       max: 6,       dir: "higher", baseWt: 3,  personaBoost: { upsizer: 2, fhb: 1.5 } },
  { key: "baths",               min: 1,       max: 5,       dir: "higher", baseWt: 1.5, personaBoost: { upsizer: 1.5 } },
  { key: "landSqm",             min: 100,     max: 2000,    dir: "higher", baseWt: 2,  personaBoost: { upsizer: 2.5, investor: 1.5 } },
  { key: "houseSqm",            min: 80,      max: 600,     dir: "higher", baseWt: 1.5, personaBoost: { upsizer: 2 } },
  { key: "pool",                min: 0,       max: 1,       dir: "higher", baseWt: 0.8, personaBoost: { upsizer: 1.5, fhb: 1.2 }, isBoolean: true },
  { key: "outdoorEntertaining", min: 0,       max: 1,       dir: "higher", baseWt: 1,  personaBoost: { upsizer: 1.5, fhb: 1.2 }, isBoolean: true },
  { key: "solarKw",             min: 0,       max: 20,      dir: "higher", baseWt: 1,  personaBoost: { investor: 1.5, fhb: 1.2 } },

  // Location
  { key: "distanceToTrainKm",   min: 0,       max: 20,      dir: "lower",  baseWt: 2,  personaBoost: { fhb: 2, downsizer: 2.5 } },
  { key: "distanceToShoppingKm",min: 0,       max: 10,      dir: "lower",  baseWt: 1.5, personaBoost: { downsizer: 2.5, fhb: 1.5 } },
  { key: "nearestHospitalKm",   min: 0,       max: 20,      dir: "lower",  baseWt: 1,  personaBoost: { downsizer: 3 } },
  { key: "suburb5yrGrowthPct",  min: 0,       max: 15,      dir: "higher", baseWt: 1.5, personaBoost: { investor: 2.5, upsizer: 1.5 } },

  // Financial
  { key: "priceMax",            min: 400000,  max: 2000000, dir: "lower",  baseWt: 3,  personaBoost: { fhb: 2, downsizer: 1.5 } },
  { key: "rentalAppraisalLow",  min: 0,       max: 1000,    dir: "higher", baseWt: 1,  personaBoost: { investor: 4 } },
  { key: "grossYieldAtAsk",     min: 0,       max: 8,       dir: "higher", baseWt: 0.5, personaBoost: { investor: 5 } },
  { key: "settlementTermsDays", min: 0,       max: 180,     dir: "lower",  baseWt: 1,  personaBoost: { downsizer: 2 } },
  { key: "councilRates",        min: 0,       max: 4000,    dir: "lower",  baseWt: 0.8, personaBoost: { investor: 1.5 } },

  // Features
  { key: "batteryStorage",      min: 0,       max: 1,       dir: "higher", baseWt: 0.5, personaBoost: { investor: 1.5 }, isBoolean: true },
  { key: "evCharging",          min: 0,       max: 1,       dir: "higher", baseWt: 0.5, personaBoost: { default: 1.5 }, isBoolean: true },
  { key: "waterTank",           min: 0,       max: 1,       dir: "higher", baseWt: 0.5, personaBoost: {}, isBoolean: true },
  { key: "alarmSystem",         min: 0,       max: 1,       dir: "higher", baseWt: 0.8, personaBoost: { fhb: 1.2 }, isBoolean: true },

  // Planning
  { key: "subdivisionPotential",min: 0,       max: 1,       dir: "higher", baseWt: 0.5, personaBoost: { investor: 4, upsizer: 2 }, isBoolean: true },
  { key: "grannyFlatApproved",  min: 0,       max: 1,       dir: "higher", baseWt: 0.5, personaBoost: { investor: 2.5 }, isBoolean: true },
  { key: "vendorTimelineDays",  min: 0,       max: 180,     dir: "lower",  baseWt: 1,  personaBoost: { downsizer: 2 } },
  { key: "tenantInPlace",       min: 0,       max: 1,       dir: "higher", baseWt: 0.5, personaBoost: { investor: 2 }, isBoolean: true },

  // Education
  { key: "schoolZoneCatchment", min: 0,       max: 1,       dir: "higher", baseWt: 0.5, personaBoost: { fhb: 4, upsizer: 3 }, isBoolean: true },
]

// ---------------------------------------------------------------------------
// Normalise a single SLM field value to 0–1
// ---------------------------------------------------------------------------

function normaliseField(field: ScoreableField, value: unknown): number | null {
  if (value === "TBD" || value === undefined || value === null) return null

  if (field.isBoolean) {
    if (typeof value === "boolean") return value ? 1 : 0
    return null
  }

  // schoolZoneCatchment: treat non-TBD string as 1 (zone exists)
  if (field.key === "schoolZoneCatchment") {
    return typeof value === "string" && value.length > 0 ? 1 : 0
  }

  if (typeof value !== "number") return null
  const clamped = Math.max(field.min, Math.min(field.max, value))
  const norm = (clamped - field.min) / (field.max - field.min)
  // For "lower is better" fields, invert so 1 = best (closest / cheapest)
  return field.dir === "lower" ? 1 - norm : norm
}

// ---------------------------------------------------------------------------
// Build dimension weights: base × persona multiplier × question intent boost
// ---------------------------------------------------------------------------

function buildDimensionWeights(
  persona: PersonaKey,
  questions: string[]
): Record<string, number> {
  const questionText = questions.join(" ").toLowerCase()
  const weights: Record<string, number> = {}

  for (const f of SCOREABLE_FIELDS) {
    const personaMult = (f.personaBoost[persona] ?? 1)
    let intentBoost = 1

    // Check how many question keywords match this field's KEYWORD_MAP entry
    const kws = KEYWORD_MAP[f.key as string] ?? []
    if (kws.length > 0) {
      const hits = kws.filter(kw => questionText.includes(kw)).length
      intentBoost = 1 + Math.min(hits / kws.length, 0.5) * 1.5  // max +75% from questions
    }

    weights[f.key as string] = f.baseWt * personaMult * intentBoost
  }

  return weights
}

// ---------------------------------------------------------------------------
// Revealed preference vector: build from sold SLM, score active by proximity
// Returns 0–60 score + list of significant dimension matches/misses
// ---------------------------------------------------------------------------

interface VectorScoreResult {
  score: number   // 0–60
  strengths: string[]
  improvements: string[]
  mismatches: string[]
}

function buildVectorScore(
  soldSLM: PropertySLM,
  activeSLM: PropertySLM,
  persona: PersonaKey,
  questions: string[]
): VectorScoreResult {
  const weights = buildDimensionWeights(persona, questions)
  let weightedSum = 0
  let totalWeight = 0
  const strengths: string[] = []
  const improvements: string[] = []
  const mismatches: string[] = []

  for (const f of SCOREABLE_FIELDS) {
    const soldVal = normaliseField(f, soldSLM[f.key])
    const activeVal = normaliseField(f, activeSLM[f.key])
    const w = weights[f.key as string] ?? f.baseWt

    if (soldVal === null || activeVal === null) {
      // Can't compare — don't penalise, don't reward
      continue
    }

    totalWeight += w

    // Proximity: how close is active to revealed preference?
    // 1 = identical, 0 = opposite end of the scale
    const proximity = 1 - Math.abs(activeVal - soldVal)

    // Improvement bonus: did active beat sold on this dimension?
    // For "higher is better" fields: activeVal > soldVal means improvement
    // For "lower is better" fields: already inverted, so activeVal > soldVal = improvement
    const improvementRaw = Math.max(0, activeVal - soldVal)
    const improvement = improvementRaw * 0.4  // improvement counts 40% on top of proximity

    const dimensionScore = Math.min(proximity + improvement, 1)
    weightedSum += w * dimensionScore

    // Classify for reasons[]
    const fieldLabel = fieldDisplayName(f.key as string)
    if (improvementRaw > 0.15 && w > 1) {
      improvements.push(fieldLabel)
    } else if (proximity < 0.5 && w > 1.5) {
      mismatches.push(fieldLabel)
    } else if (proximity > 0.8 && w > 1.5) {
      strengths.push(fieldLabel)
    }
  }

  if (totalWeight === 0) return { score: 30, strengths: [], improvements: [], mismatches: [] }

  const rawRatio = weightedSum / totalWeight     // 0–1
  const score = Math.round(rawRatio * 60)

  return { score, strengths, improvements, mismatches }
}

// Human-readable labels for vector dimension keys
function fieldDisplayName(key: string): string {
  const map: Record<string, string> = {
    beds: "Bedrooms", baths: "Bathrooms", landSqm: "Land size",
    houseSqm: "Home size", pool: "Pool", outdoorEntertaining: "Alfresco/outdoor",
    solarKw: "Solar panels", distanceToTrainKm: "Train distance",
    distanceToShoppingKm: "Shops proximity", nearestHospitalKm: "Hospital proximity",
    suburb5yrGrowthPct: "Suburb growth", priceMax: "Price range",
    rentalAppraisalLow: "Rental income", grossYieldAtAsk: "Gross yield",
    settlementTermsDays: "Settlement terms", councilRates: "Council rates",
    batteryStorage: "Battery storage", evCharging: "EV charging",
    waterTank: "Water tank", alarmSystem: "Alarm system",
    subdivisionPotential: "Subdivision potential", grannyFlatApproved: "Granny flat",
    vendorTimelineDays: "Vendor timeline", tenantInPlace: "Investment ready",
    schoolZoneCatchment: "School zone",
  }
  return map[key] ?? key
}

// ---------------------------------------------------------------------------
// Plan C: Deal-breaker scan
// Parse free-text notes + questions for explicit negative signals.
// Returns penalty points and warning reasons.
// ---------------------------------------------------------------------------

interface DealBreakerResult {
  penalty: number
  warnings: string[]
}

function buildDealBreakerScan(
  notes: string,
  questions: string[],
  activeSLM: PropertySLM
): DealBreakerResult {
  const text = (notes + " " + questions.join(" ")).toLowerCase()
  let penalty = 0
  const warnings: string[] = []

  // No stairs / single storey
  if (/single.?stor|no stairs|ground.?floor|step.?free|wheelchair|accessible/i.test(text)) {
    const floor = activeSLM.floorplanConfig
    if (typeof floor === "string" && /two.?stor|2.?stor|upstairs|double.?stor/i.test(floor)) {
      penalty += 20
      warnings.push("May be two-storey — they mentioned needing single level")
    }
  }

  // No pool / low maintenance
  if (/no pool|don.?t want.?pool|low.?maintenance|no maintenance/i.test(text)) {
    if (activeSLM.pool === true) {
      penalty += 15
      warnings.push("Has a pool — they prefer low maintenance")
    }
  }

  // Must have solar
  if (/must.?have solar|solar.?essential|want solar|need solar/i.test(text)) {
    const kw = activeSLM.solarKw
    if (kw === "TBD" || kw === 0) {
      penalty += 15
      warnings.push("No solar confirmed — they said solar is essential")
    }
  }

  // Vacant possession / no tenant
  if (/tenant.?free|vacant.?possession|no tenant|want.?vacant|move.?in/i.test(text)) {
    if (activeSLM.tenantInPlace === true) {
      penalty += 20
      warnings.push("Tenant in place — they wanted vacant possession")
    }
  }

  // North facing
  if (/north.?fac|north.?aspect|want.?north|morning.?sun|good.?light/i.test(text)) {
    const ori = activeSLM.orientation
    if (typeof ori === "string" && ori !== "TBD" && !/north/i.test(ori)) {
      penalty += 10
      warnings.push(`Not north-facing (${ori}) — they asked about orientation`)
    }
  }

  // Flood zone concern
  if (/flood|flood.?zone|flood.?plain/i.test(text)) {
    if (activeSLM.floodZone === true) {
      penalty += 25
      warnings.push("In flood zone — they expressed concern about flooding")
    }
  }

  return { penalty, warnings }
}

// ---------------------------------------------------------------------------
// Plan C: Question coverage + delta score
// How many questions have answers? Are those answers better or same as sold?
// Returns 0–25 points + reasons
// ---------------------------------------------------------------------------

interface QuestionDeltaResult {
  score: number   // 0–25
  covered: number
  total: number
  deltaStrengths: string[]
  deltaWeaknesses: string[]
}

function buildQuestionDeltaScore(
  questions: string[],
  activeSLM: PropertySLM,
  soldSLM: PropertySLM
): QuestionDeltaResult {
  if (questions.length === 0) return { score: 0, covered: 0, total: 0, deltaStrengths: [], deltaWeaknesses: [] }

  let covered = 0
  const deltaStrengths: string[] = []
  const deltaWeaknesses: string[] = []

  for (const q of questions) {
    const lower = q.toLowerCase()
    for (const [field, keywords] of Object.entries(KEYWORD_MAP)) {
      if (!keywords.some(kw => lower.includes(kw))) continue

      const activeVal = activeSLM[field as keyof PropertySLM]
      const soldVal = soldSLM[field as keyof PropertySLM]

      if (activeVal !== "TBD" && activeVal !== undefined && activeVal !== null) {
        covered++

        // Delta: is active answer better than what they saw?
        if (typeof activeVal === "number" && typeof soldVal === "number") {
          const fieldDef = SCOREABLE_FIELDS.find(f => f.key === field)
          if (fieldDef) {
            const better = fieldDef.dir === "higher" ? activeVal > soldVal : activeVal < soldVal
            const label = fieldDisplayName(field)
            if (better) deltaStrengths.push(label)
            else if (activeVal !== soldVal) deltaWeaknesses.push(label)
          }
        }
        break
      }
    }
  }

  const pctCovered = covered / questions.length
  const deltaBonus = deltaStrengths.length * 3 - deltaWeaknesses.length * 2
  const score = Math.max(0, Math.min(25, Math.round(pctCovered * 20 + deltaBonus)))

  return { score, covered, total: questions.length, deltaStrengths, deltaWeaknesses }
}

// ---------------------------------------------------------------------------
// Plan C: Confidence multiplier based on SLM completeness
// Agents who fill in more data get better, more reliable scores.
// ---------------------------------------------------------------------------

function buildConfidenceMultiplier(activeSLM: PropertySLM): number {
  const fieldsToCheck: (keyof PropertySLM)[] = [
    "beds", "baths", "cars", "landSqm", "houseSqm", "yearBuilt", "propertyType",
    "orientation", "pool", "outdoorEntertaining", "solarKw",
    "titleType", "easements", "overlays", "s32Status", "zoning",
    "priceMin", "priceMax", "settlementTermsDays", "rentalAppraisalLow",
    "rentalAppraisalHigh", "grossYieldAtAsk", "councilRates",
    "primarySchool", "schoolZoneCatchment", "distanceToTrainKm",
    "distanceToShoppingKm", "nearestHospitalKm", "suburb5yrGrowthPct",
    "kitchenRenovated", "bathroomRenovated", "airConType", "heatingType",
    "subdivisionPotential", "vendorMotivation", "vendorTimelineDays",
    "tenantInPlace", "floodZone",
  ]
  const nonTBD = fieldsToCheck.filter(k => {
    const v = activeSLM[k]
    return v !== "TBD" && v !== undefined && v !== null
  }).length
  const pct = nonTBD / fieldsToCheck.length
  return 0.70 + 0.30 * pct   // min 70%, max 100%
}

// ---------------------------------------------------------------------------
// Build reasons[] array from all scoring components
// ---------------------------------------------------------------------------

function buildReasons(
  vectorResult: VectorScoreResult,
  questionDelta: QuestionDeltaResult,
  dealBreaker: DealBreakerResult,
  budgetFlag: MatchResult["budgetFlag"],
  activeSLM: PropertySLM,
  soldSLM: PropertySLM,
  persona: PersonaKey
): MatchReason[] {
  const reasons: MatchReason[] = []

  // Strengths from vector match (top 3)
  for (const s of vectorResult.strengths.slice(0, 3)) {
    reasons.push({ type: "strength", text: `${s} closely matches what they experienced` })
  }

  // Improvements from vector match (top 2)
  for (const imp of vectorResult.improvements.slice(0, 2)) {
    reasons.push({ type: "strength", text: `Better ${imp.toLowerCase()} than the property they saw` })
  }

  // Question coverage
  if (questionDelta.covered > 0) {
    reasons.push({
      type: questionDelta.covered === questionDelta.total ? "strength" : "neutral",
      text: `${questionDelta.covered} of ${questionDelta.total} question${questionDelta.total > 1 ? "s" : ""} they asked can be answered from this listing's data`,
    })
  }

  // Delta strengths (active answers better than what they saw)
  for (const ds of questionDelta.deltaStrengths.slice(0, 2)) {
    reasons.push({ type: "strength", text: `${ds} — better than ${soldSLM.address} on this point` })
  }

  // Delta weaknesses
  for (const dw of questionDelta.deltaWeaknesses.slice(0, 1)) {
    reasons.push({ type: "neutral", text: `${dw} — slightly different from the property they saw` })
  }

  // Budget
  if (budgetFlag === "under") {
    reasons.push({ type: "strength", text: "Within their budget — no stretch required" })
  } else if (budgetFlag === "stretch") {
    reasons.push({ type: "neutral", text: "Slightly above budget — worth a conversation" })
  } else if (budgetFlag === "over") {
    reasons.push({ type: "warning", text: "Over budget — price expectation conversation needed" })
  }

  // Investor-specific
  if (persona === "investor") {
    const gy = typeof activeSLM.grossYieldAtAsk === "number" ? activeSLM.grossYieldAtAsk : null
    const soldGy = typeof soldSLM.grossYieldAtAsk === "number" ? soldSLM.grossYieldAtAsk : null
    if (gy !== null && soldGy !== null) {
      if (gy > soldGy) reasons.push({ type: "strength", text: `Higher gross yield (${gy}% vs ${soldGy}% at the property they inspected)` })
      else if (gy < soldGy) reasons.push({ type: "neutral", text: `Yield slightly lower (${gy}% vs ${soldGy}% at the property they inspected)` })
    }
  }

  // Deal-breaker warnings (always last)
  for (const w of dealBreaker.warnings) {
    reasons.push({ type: "warning", text: w })
  }

  return reasons
}

// ---------------------------------------------------------------------------
// matchQuestionToSLM — used by DemoView for Q&A panel
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set(["a","an","the","is","it","in","on","at","to","do","of","and","or","for","with","was","are","how","what","does","can","will","this","that","would","about","has","have","any","its","your"])

function questionOverlap(asked: string, candidate: string): number {
  const tokenise = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w))
  const a = new Set(tokenise(asked))
  return tokenise(candidate).filter(w => a.has(w)).length
}

export function matchQuestionToSLM(
  question: string,
  slm: PropertySLM,
  alreadyShown: Set<string>
): PropertyQA | null {
  const lower = question.toLowerCase()
  const candidates = slm.qa.filter(qa => !alreadyShown.has(qa.question))
  if (candidates.length === 0) return null

  // Pass 1 — keyword scoring (only accept if a genuine match, score > 0)
  const matchedFields: string[] = []
  for (const [field, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) matchedFields.push(field)
  }

  if (matchedFields.length > 0) {
    let bestQA: PropertyQA | null = null
    let bestScore = 0
    for (const qa of candidates) {
      let s = 0
      for (const kw of qa.keywords) { if (lower.includes(kw)) s += 2 }
      for (const field of matchedFields) {
        const fieldKws = KEYWORD_MAP[field] ?? []
        if (fieldKws.some((kw) => qa.keywords.includes(kw))) s += 1
      }
      if (s > bestScore) { bestScore = s; bestQA = qa }
    }
    if (bestQA && bestScore > 0) return bestQA
  }

  // Pass 2 — word-overlap between the asked question and each QA's question text
  let bestOverlapQA: PropertyQA | null = null
  let bestOverlap = 0
  for (const qa of candidates) {
    const overlap = questionOverlap(question, qa.question)
    if (overlap > bestOverlap) { bestOverlap = overlap; bestOverlapQA = qa }
  }
  if (bestOverlapQA && bestOverlap > 0) return bestOverlapQA

  // Pass 3 — no good match found; return null rather than an irrelevant answer
  return null
}

// ---------------------------------------------------------------------------
// resolvePersona
// ---------------------------------------------------------------------------

function resolvePersona(raw: string): PersonaKey {
  const p = raw.toLowerCase()
  if (p.includes("invest")) return "investor"
  if (p.includes("fhb") || p.includes("first home") || p.includes("first-home")) return "fhb"
  if (p.includes("upsize") || p.includes("upgrade") || p.includes("upsiz")) return "upsizer"
  if (p.includes("downsize") || p.includes("retire") || p.includes("empty nester") || p.includes("downsiz")) return "downsizer"
  return "default"
}

// ---------------------------------------------------------------------------
// LeadProfile
// ---------------------------------------------------------------------------

export interface LeadProfile {
  budget: number
  bedsWanted: number
  persona: string
  suburbs: string[]
  notes: string
  questions: string[]
  timelineDays?: number
}

// ---------------------------------------------------------------------------
// matchLeadToListing — HYBRID PLAN B + PLAN C ENGINE
//
// Scoring breakdown:
//   0–60 pts: Revealed preference vector (how closely active mirrors what they saw)
//   0–25 pts: Question coverage + improvement delta
//   0–??  pts: Deal-breaker penalties (deducted)
//   × 0.70–1.00: Confidence multiplier (SLM completeness)
//   Final: 0–99
// ---------------------------------------------------------------------------

export function matchLeadToListing(
  lead: LeadProfile,
  activeSLM: PropertySLM,
  soldSLM: PropertySLM
): MatchResult {
  const personaKey = resolvePersona(lead.persona)

  // ── Plan B: Revealed preference vector score ────────────────────────────
  const vectorResult = buildVectorScore(soldSLM, activeSLM, personaKey, lead.questions)

  // ── Plan C Stage 2: Deal-breaker scan ──────────────────────────────────
  const dealBreaker = buildDealBreakerScan(lead.notes, lead.questions, activeSLM)

  // ── Plan C Stage 3: Question coverage + delta ───────────────────────────
  const questionDelta = buildQuestionDeltaScore(lead.questions, activeSLM, soldSLM)

  // ── Budget flag (kept from v2) ──────────────────────────────────────────
  const priceMax = typeof activeSLM.priceMax === "number" ? activeSLM.priceMax : null
  let budgetFlag: MatchResult["budgetFlag"] = "over"
  if (priceMax === null) {
    budgetFlag = "under"
  } else if (priceMax <= lead.budget) {
    budgetFlag = "under"
  } else if (priceMax <= lead.budget * 1.08) {
    budgetFlag = "stretch"
  }

  // ── Plan C Stage 5: Confidence multiplier ──────────────────────────────
  const confidence = buildConfidenceMultiplier(activeSLM)

  // ── Combine ─────────────────────────────────────────────────────────────
  const rawBeforePenalty = vectorResult.score + questionDelta.score
  const rawAfterPenalty = Math.max(0, rawBeforePenalty - dealBreaker.penalty)
  const score = Math.min(Math.round(rawAfterPenalty * confidence), 99)

  // ── Backward-compat matchedFactors ─────────────────────────────────────
  const factors: MatchFactor[] = [
    { label: `Property match score (${Math.round(vectorResult.score / 60 * 100)}% similarity to ${soldSLM.address})`, points: vectorResult.score, tag: "vector" },
    { label: `${questionDelta.covered}/${questionDelta.total} questions answered`, points: questionDelta.score, tag: "questions" },
  ]
  if (dealBreaker.penalty > 0) {
    factors.push({ label: `Deal-breaker flags (−${dealBreaker.penalty} pts)`, points: -dealBreaker.penalty, tag: "persona" })
  }
  factors.sort((a, b) => b.points - a.points)

  // ── Reasons ─────────────────────────────────────────────────────────────
  const reasons = buildReasons(vectorResult, questionDelta, dealBreaker, budgetFlag, activeSLM, soldSLM, personaKey)

  // ── Top pitch ───────────────────────────────────────────────────────────
  const firstStrength = reasons.find(r => r.type === "strength")
  const topPitch = firstStrength?.text ?? `Strong match against ${soldSLM.address}`

  // ── Top reason (backward compat) ────────────────────────────────────────
  const topTwo = reasons.filter(r => r.type === "strength").slice(0, 2).map(r => r.text)
  const topReason = topTwo.length >= 2 ? `${topTwo[0]} · ${topTwo[1]}` : topTwo[0] ?? "Match pending more SLM data"

  // ── Insight (persona-specific one-liner) ────────────────────────────────
  const insight = buildInsight(personaKey, lead, activeSLM, soldSLM, factors, score)

  // ── Comparisons ─────────────────────────────────────────────────────────
  const comparisons = buildComparisons(personaKey, activeSLM, soldSLM)

  return { score, matchedFactors: factors, topReason, insight, budgetFlag, comparisons, reasons, topPitch, confidence }
}

// ---------------------------------------------------------------------------
// buildInsight — persona-specific one-liner (kept from v2)
// ---------------------------------------------------------------------------

function buildInsight(
  persona: PersonaKey,
  _lead: LeadProfile,
  active: PropertySLM,
  sold: PropertySLM,
  factors: MatchFactor[],
  score: number
): string {
  if (persona === "investor") {
    const gy = typeof active.grossYieldAtAsk === "number" ? active.grossYieldAtAsk : null
    const soldGy = typeof sold.grossYieldAtAsk === "number" ? sold.grossYieldAtAsk : null
    if (gy !== null && soldGy !== null && gy > soldGy)
      return `Investor play — ${gy}% gross yield vs ${soldGy}% at the property they inspected`
    const rental = typeof active.rentalAppraisalLow === "number" ? active.rentalAppraisalLow : null
    if (rental !== null)
      return `Rental appraisal $${rental}–${typeof active.rentalAppraisalHigh === "number" ? active.rentalAppraisalHigh : rental}/wk — strong income from day one`
    return `Strong investor match (${score}/100) — income and growth metrics align`
  }

  if (persona === "fhb") {
    if (active.schoolZoneCatchment !== "TBD")
      return `FHB — ${active.schoolZoneCatchment} school zone confirmed, matching what they prioritised`
    const pm = typeof active.priceMax === "number" ? active.priceMax : null
    if (pm !== null && pm <= 800000)
      return `FHB grant eligible (${fmtPrice(pm)}) — under $800K threshold`
    return `Budget-aligned FHB match — ${score}/100 on their priorities`
  }

  if (persona === "upsizer") {
    const activeLand = typeof active.landSqm === "number" ? active.landSqm : null
    const soldLand = typeof sold.landSqm === "number" ? sold.landSqm : null
    if (activeLand !== null && soldLand !== null && activeLand > soldLand)
      return `Upsizer upgrade — ${activeLand - soldLand}sqm more land and ${typeof active.beds === "number" ? active.beds : "?"}br`
    return `Configuration upgrade over the sold property they saw`
  }

  if (persona === "downsizer") {
    const train = typeof active.distanceToTrainKm === "number" ? `${active.distanceToTrainKm}km to train` : null
    const shop = typeof active.distanceToShoppingKm === "number" ? `${active.distanceToShoppingKm}km to shops` : null
    const amenities = [train, shop].filter(Boolean).join(", ")
    if (amenities) return `Downsizer — walkable amenities: ${amenities}`
    return `Low-maintenance lifestyle match for downsizer profile`
  }

  const topFactor = factors[0]?.label ?? "strong attribute alignment"
  return `${score}/100 match — ${topFactor}`
}

// ---------------------------------------------------------------------------
// buildComparisons — sold vs active, contextual to persona (kept from v2)
// ---------------------------------------------------------------------------

function buildComparisons(
  persona: PersonaKey,
  active: PropertySLM,
  sold: PropertySLM
): Comparison[] {
  const out: Comparison[] = []

  out.push({
    label: "Bedrooms",
    soldValue: sold.beds !== "TBD" ? `${sold.beds} bed` : "TBD",
    activeValue: active.beds !== "TBD" ? `${active.beds} bed` : "TBD",
    match: numericExact(sold.beds, active.beds),
    direction: numericDir(sold.beds, active.beds),
    familyRelevant: true,
  })

  out.push({
    label: "Land size",
    soldValue: sold.landSqm !== "TBD" ? `${sold.landSqm}sqm` : "TBD",
    activeValue: active.landSqm !== "TBD" ? `${active.landSqm}sqm` : "TBD",
    match: numericCloseness(sold.landSqm, active.landSqm, 0.25),
    direction: numericDir(sold.landSqm, active.landSqm),
    familyRelevant: true,
    investorRelevant: persona === "investor" && active.subdivisionPotential === true,
  })

  out.push({
    label: "Price",
    soldValue: sold.soldPrice ? fmtPrice(sold.soldPrice) : "TBD",
    activeValue:
      active.priceMin !== "TBD" && active.priceMax !== "TBD"
        ? `${fmtPrice(active.priceMin as number)}–${fmtPrice(active.priceMax as number)}`
        : "TBD",
    match: priceBandMatch(sold.soldPrice, active.priceMin, active.priceMax),
  })

  if (persona === "investor") {
    out.push({
      label: "Rental appraisal",
      soldValue:
        sold.rentalAppraisalLow !== "TBD" && sold.rentalAppraisalHigh !== "TBD"
          ? `$${sold.rentalAppraisalLow}–$${sold.rentalAppraisalHigh}/wk`
          : "TBD",
      activeValue:
        active.rentalAppraisalLow !== "TBD" && active.rentalAppraisalHigh !== "TBD"
          ? `$${active.rentalAppraisalLow}–$${active.rentalAppraisalHigh}/wk`
          : "TBD",
      match: numericCloseness(
        typeof sold.rentalAppraisalLow === "number" ? sold.rentalAppraisalLow : undefined as unknown as number,
        typeof active.rentalAppraisalLow === "number" ? active.rentalAppraisalLow : undefined as unknown as number,
        0.15
      ),
      direction: numericDir(sold.rentalAppraisalLow, active.rentalAppraisalLow),
      investorRelevant: true,
    })
    out.push({
      label: "Gross yield",
      soldValue: sold.grossYieldAtAsk !== "TBD" ? `${sold.grossYieldAtAsk}%` : "TBD",
      activeValue: active.grossYieldAtAsk !== "TBD" ? `${active.grossYieldAtAsk}%` : "TBD",
      match: numericCloseness(sold.grossYieldAtAsk, active.grossYieldAtAsk, 0.1),
      direction: numericDir(sold.grossYieldAtAsk, active.grossYieldAtAsk),
      investorRelevant: true,
    })
  } else {
    out.push({
      label: "School zone",
      soldValue: sold.schoolZoneCatchment !== "TBD" ? sold.schoolZoneCatchment : "TBD",
      activeValue: active.schoolZoneCatchment !== "TBD" ? active.schoolZoneCatchment : "TBD",
      match:
        active.schoolZoneCatchment !== "TBD" && sold.schoolZoneCatchment !== "TBD"
          ? active.schoolZoneCatchment === sold.schoolZoneCatchment ? "exact" : "close"
          : "different",
      familyRelevant: true,
    })
  }

  out.push({
    label: "Vendor timeline",
    soldValue: sold.settlementTermsDays !== "TBD" ? `${sold.settlementTermsDays} days` : "TBD",
    activeValue: active.vendorTimelineDays !== "TBD" ? `${active.vendorTimelineDays} days preferred` : "TBD",
    match: numericCloseness(sold.settlementTermsDays, active.vendorTimelineDays, 0.3),
  })

  return out
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPrice(n: number): string {
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : `$${(n / 1_000).toFixed(0)}K`
}

function numericExact(a: number | "TBD", b: number | "TBD"): "exact" | "close" | "different" {
  if (a === "TBD" || b === "TBD") return "different"
  if (a === b) return "exact"
  if (Math.abs(a - b) === 1) return "close"
  return "different"
}

function numericCloseness(
  a: number | "TBD" | undefined,
  b: number | "TBD" | undefined,
  tolerance: number
): "exact" | "close" | "different" {
  if (a === "TBD" || b === "TBD" || a == null || b == null) return "different"
  if (a === b) return "exact"
  if (tolerance > 0 && Math.abs(a - b) / Math.max(a, b) <= tolerance) return "close"
  return "different"
}

function numericDir(
  sold: number | "TBD" | boolean | undefined,
  active: number | "TBD" | boolean | undefined
): "up" | "down" | "same" | undefined {
  if (typeof sold !== "number" || typeof active !== "number") return undefined
  if (active > sold) return "up"
  if (active < sold) return "down"
  return "same"
}

function priceBandMatch(
  soldPrice: number | undefined,
  priceMin: number | "TBD",
  priceMax: number | "TBD"
): "exact" | "close" | "different" {
  if (!soldPrice || priceMin === "TBD" || priceMax === "TBD") return "different"
  if (soldPrice >= priceMin && soldPrice <= priceMax) return "exact"
  const mid = ((priceMin as number) + (priceMax as number)) / 2
  if (Math.abs(soldPrice - mid) / mid <= 0.15) return "close"
  return "different"
}
