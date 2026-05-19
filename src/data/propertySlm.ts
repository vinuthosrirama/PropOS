// PropOS Property SLM (Small Language Model / Property Brain)
// 100-data-point structured knowledge store per property
// Property 101: Narre Warren South VIC 3805 | Properties 102+: Berwick VIC 3806

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PropertyQA {
  question: string
  answer: string
  category: "physical" | "legal" | "financial" | "location" | "features" | "planning"
  keywords: string[]
}

export interface PropertySLM {
  propertyId: number
  address: string
  suburb: string
  status: "active" | "sold"
  soldDate?: string
  soldPrice?: number

  // PHYSICAL (20 fields)
  beds: number | "TBD"
  baths: number | "TBD"
  cars: number | "TBD"
  landSqm: number | "TBD"
  houseSqm: number | "TBD"
  yearBuilt: number | "TBD"
  propertyType: string | "TBD"
  frontageMetre: number | "TBD"
  depthMetre: number | "TBD"
  propertyShape: string | "TBD"
  orientation: string | "TBD"
  pool: boolean | "TBD"
  gardenSqm: number | "TBD"
  shed: boolean | "TBD"
  outdoorEntertaining: boolean | "TBD"
  alfrescoSqm: number | "TBD"
  roofType: string | "TBD"
  externalCladding: string | "TBD"
  construction: string | "TBD"
  floorplanConfig: string | "TBD"

  // LEGAL & TITLE (15 fields)
  titleType: string | "TBD"
  easements: string | "TBD"
  covenants: string | "TBD"
  overlays: string | "TBD"
  s32Status: string | "TBD"
  encumbrances: string | "TBD"
  ownerOccupied: boolean | "TBD"
  zoning: string | "TBD"
  rightOfWay: string | "TBD"
  sewerEasement: string | "TBD"
  contaminatedLand: boolean | "TBD"
  buildingPermitsOutstanding: string | "TBD"
  ownerBuilderWork: boolean | "TBD"
  titlesOfficeReady: boolean | "TBD"
  section32CompletionDate: string | "TBD"

  // FINANCIAL (15 fields)
  priceMin: number | "TBD"
  priceMax: number | "TBD"
  vendorReserve: number | "TBD"
  settlementTermsDays: number | "TBD"
  depositPct: number | "TBD"
  rentalAppraisalLow: number | "TBD"
  rentalAppraisalHigh: number | "TBD"
  grossYieldAtAsk: number | "TBD"
  councilRates: number | "TBD"
  waterRates: number | "TBD"
  bodyCorporateFees: number | "TBD"
  stampDutyEstimate: number | "TBD"
  landTaxThreshold: string | "TBD"
  depreciationYear1Est: number | "TBD"
  capitalGainsHistory: string | "TBD"

  // LOCATION & SUBURB (15 fields)
  primarySchool: string | "TBD"
  primarySchoolRating: string | "TBD"
  secondarySchool: string | "TBD"
  secondarySchoolRating: string | "TBD"
  schoolZoneCatchment: string | "TBD"
  distanceToTrainKm: number | "TBD"
  trainLine: string | "TBD"
  distanceToFreewayKm: number | "TBD"
  distanceToShoppingKm: number | "TBD"
  nearestHospitalKm: number | "TBD"
  suburb5yrGrowthPct: number | "TBD"
  suburbMedianPrice: number | "TBD"
  daysOnMarketAvg: number | "TBD"
  clearanceRatePct: number | "TBD"
  comparableSales: Array<{ address: string; price: number; date: string; beds: number }> | "TBD"

  // FEATURES & CONDITION (15 fields)
  kitchenRenovated: string | "TBD"
  bathroomRenovated: string | "TBD"
  flooringType: string | "TBD"
  airConType: string | "TBD"
  heatingType: string | "TBD"
  solarKw: number | "TBD"
  batteryStorage: boolean | "TBD"
  evCharging: boolean | "TBD"
  nbnType: string | "TBD"
  waterTank: boolean | "TBD"
  alarmSystem: boolean | "TBD"
  smartHome: boolean | "TBD"
  disabilityAccess: boolean | "TBD"
  petsAllowed: boolean | "TBD"
  outdoorFeatures: string | "TBD"

  // PLANNING & VENDOR (20 fields)
  subdivisionPotential: boolean | "TBD"
  dualOccupancyPotential: boolean | "TBD"
  grannyFlatApproved: boolean | "TBD"
  extensionPotential: string | "TBD"
  councilDevelopmentHistory: string | "TBD"
  neighbourhoodDescription: string | "TBD"
  trafficNoiseLevel: string | "TBD"
  flightPathFlag: boolean | "TBD"
  futureInfrastructure: string | "TBD"
  floodZone: boolean | "TBD"
  vendorMotivation: string | "TBD"
  vendorTimelineDays: number | "TBD"
  previousOffers: boolean | "TBD"
  daysOnMarket: number | "TBD"
  priceReductionHistory: string | "TBD"
  tenantInPlace: boolean | "TBD"
  tenantLeaseEndDate: string | "TBD"
  vendorPreferredSettlement: string | "TBD"
  vendorFlexOnInclusions: string | "TBD"
  inclusions: string | "TBD"

  // Q&A (25+ entries per property)
  qa: PropertyQA[]
}

// ---------------------------------------------------------------------------
// SLM Data
// ---------------------------------------------------------------------------

export const SLM_DATA: Record<number, PropertySLM> = {

  // -------------------------------------------------------------------------
  // 101 — 48 President Road, Narre Warren South (SOLD $962K, 28 Apr 2026)
  // SLM data: Extracted from Section 32 / COS (Ideal Conveyancing, 06/05/2026)
  // Title: Vol 10427 Folio 211 | Lot 598 PS416514Y | Springfield Stage 21
  // -------------------------------------------------------------------------
  101: {
    propertyId: 101,
    address: "48 President Road",
    suburb: "Narre Warren South VIC 3805",
    status: "sold",
    soldDate: "28 Apr 2026",
    soldPrice: 962000,

    // PHYSICAL
    beds: 4,
    baths: 2,
    cars: 2,
    landSqm: 630,
    houseSqm: "TBD",
    yearBuilt: "TBD",
    propertyType: "House",
    frontageMetre: 17.96,
    depthMetre: 35.06,
    propertyShape: "Rectangular",
    orientation: "South",
    pool: "TBD",
    gardenSqm: "TBD",
    shed: "TBD",
    outdoorEntertaining: "TBD",
    alfrescoSqm: "TBD",
    roofType: "TBD",
    externalCladding: "TBD",
    construction: "TBD",
    floorplanConfig: "4 bed, 2 bath, double garage",

    // LEGAL & TITLE
    titleType: "Torrens — Vol 10427 Folio 211 (Lot 598 PS416514Y)",
    easements: "E-3 drainage and sewerage easement — in favour of Casey City Council and South East Water Ltd (per PS416514Y Sheet 6)",
    covenants: "Section 173 Agreement V896188Q (16/02/1999, Berwick Planning Scheme): development must comply with Springfield Stage 21 neighbourhood design plan; maximum one dwelling per lot; minimum 3 off-street car spaces (at least 1 covered). Covenants run with the land.",
    overlays: "None",
    s32Status: "Signed — vendor Laura Ah Choy, dated 08/05/2026. Prepared by Ideal Conveyancing (ref RC:LL:26/13932).",
    encumbrances: "Section 173 Planning Agreement V896188Q (16/02/1999, Casey City Council / Avjennings Holdings Ltd)",
    ownerOccupied: true,
    zoning: "GRZ1 — General Residential Zone Schedule 1 (Casey Planning Scheme)",
    rightOfWay: "None",
    sewerEasement: "Yes — E-3 drainage and sewerage easement on title (Casey City Council / South East Water Ltd)",
    contaminatedLand: false,
    buildingPermitsOutstanding: "No building permits issued in preceding 7 years (vendor's knowledge as at 08/05/2026)",
    ownerBuilderWork: false,
    titlesOfficeReady: true,
    section32CompletionDate: "08/05/2026",

    // FINANCIAL
    priceMin: 962000,
    priceMax: 962000,
    vendorReserve: "TBD",
    settlementTermsDays: "TBD",
    depositPct: 10,
    rentalAppraisalLow: "TBD",
    rentalAppraisalHigh: "TBD",
    grossYieldAtAsk: "TBD",
    councilRates: "TBD",
    waterRates: "TBD",
    bodyCorporateFees: 0,
    stampDutyEstimate: 52800,
    landTaxThreshold: "Vendor exempt as PPOR at time of sale. Purchaser liability depends on intended use — investor purchasers will be assessed under the Land Tax Act 2005 (Vic) from settlement date.",
    depreciationYear1Est: "TBD",
    capitalGainsHistory: "TBD",

    // LOCATION & SUBURB
    primarySchool: "Strathaird Primary School (357m)",
    primarySchoolRating: "TBD",
    secondarySchool: "Narre Warren South P-12 College (1016m)",
    secondarySchoolRating: "TBD",
    schoolZoneCatchment: "Strathaird Primary School and Narre Warren South P-12 College (confirm with Casey Council)",
    distanceToTrainKm: "TBD",
    trainLine: "Pakenham Line (nearest station TBD — Berwick or Narre Warren; confirm distance)",
    distanceToFreewayKm: "TBD",
    distanceToShoppingKm: "TBD",
    nearestHospitalKm: "TBD",
    suburb5yrGrowthPct: "TBD",
    suburbMedianPrice: "TBD",
    daysOnMarketAvg: "TBD",
    clearanceRatePct: "TBD",
    comparableSales: "TBD",

    // FEATURES & CONDITION
    kitchenRenovated: "TBD",
    bathroomRenovated: "TBD",
    flooringType: "TBD",
    airConType: "TBD",
    heatingType: "TBD",
    solarKw: "TBD",
    batteryStorage: "TBD",
    evCharging: "TBD",
    nbnType: "TBD",
    waterTank: "TBD",
    alarmSystem: "TBD",
    smartHome: "TBD",
    disabilityAccess: "TBD",
    petsAllowed: "TBD",
    outdoorFeatures: "TBD",

    // PLANNING & VENDOR
    subdivisionPotential: false,
    dualOccupancyPotential: false,
    grannyFlatApproved: false,
    extensionPotential: "Yes — GRZ1 allows extensions subject to council permit and S173 neighbourhood design plan setbacks",
    councilDevelopmentHistory: "No building permits recorded in preceding 7 years (vendor statement, 08/05/2026)",
    neighbourhoodDescription: "Springfield Estate Stage 21 — established family precinct on President Road, Narre Warren South. South-facing 630m² rectangular lot with 18m frontage. Strathaird Primary School 357m walk. Surrounded by comparable owner-occupied homes; adjacent to roundabout at Kershaw Drive intersection per aerial imagery. Distances to Fountain Gate Westfield and Casey Hospital TBD.",
    trafficNoiseLevel: "Low — residential estate, President Road is a local street",
    flightPathFlag: false,
    futureInfrastructure: "Casey growth corridor — active development contributions plans in surrounding areas (Lyndhurst DCP and Cranbourne East LSP, per Casey Planning Scheme amendments C303case/C302case 2026). No road or infrastructure works directly impacting this property identified in vendor statement or planning certificate.",
    floodZone: false,
    vendorMotivation: "TBD",
    vendorTimelineDays: "TBD",
    previousOffers: "TBD",
    daysOnMarket: "TBD",
    priceReductionHistory: "TBD",
    tenantInPlace: false,
    tenantLeaseEndDate: "N/A — vacant possession at settlement",
    vendorPreferredSettlement: "Flexible (confirmed in contract particulars)",
    vendorFlexOnInclusions: "Standard inclusions only — all fixed floor coverings, light fittings, window furnishings and permanent fixtures as inspected",
    inclusions: "All fixed floor coverings, light fittings, window furnishings, and all fixtures and fittings of a permanent nature as inspected",

    qa: [
      {
        question: "How big is the land?",
        answer: "630 square metres — rectangular block, 17.96m frontage by 35.06m deep. Confirmed from Plan of Subdivision PS416514Y.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square", "frontage", "depth"],
      },
      {
        question: "How many bedrooms?",
        answer: "4 bedrooms, 2 bathrooms, double garage. Exact floorplan configuration to be confirmed on inspection.",
        category: "physical",
        keywords: ["bed", "bedroom", "rooms", "layout", "floorplan"],
      },
      {
        question: "What direction does the property face?",
        answer: "South-facing — confirmed from the planning certificate (orientation: South). Consider this for natural light and garden planning.",
        category: "physical",
        keywords: ["orientation", "facing", "north", "south", "light", "aspect"],
      },
      {
        question: "What school zone is this in?",
        answer: "Strathaird Primary School (357m away) and Narre Warren South P-12 College (1016m). Confirm exact catchment with Casey Council on 03 9705 5190.",
        category: "location",
        keywords: ["school", "zone", "catchment", "primary", "secondary", "strathaird"],
      },
      {
        question: "Are there any easements or covenants on the title?",
        answer: "Yes — two items. First, an E-3 drainage and sewerage easement in favour of Casey City Council and South East Water. Second, a Section 173 Planning Agreement (V896188Q) binding all lots in Springfield Stage 21: one dwelling per lot maximum, minimum 3 off-street parking spaces (1 covered), and development must follow the neighbourhood design plan. These run with the land permanently.",
        category: "legal",
        keywords: ["easement", "covenant", "s173", "restriction", "title", "encumbrance", "sewer", "drainage"],
      },
      {
        question: "What is the zoning?",
        answer: "GRZ1 — General Residential Zone Schedule 1 under the Casey Planning Scheme. No planning overlays apply. The zone supports single dwellings, extensions, and a limited range of community uses. Note: the S173 covenant restricts to one dwelling per lot.",
        category: "planning",
        keywords: ["zone", "zoning", "grz", "residential", "planning", "overlay", "development"],
      },
      {
        question: "Is the Section 32 ready?",
        answer: "Yes — vendor statement signed by Laura Ah Choy on 08/05/2026. Prepared by Ideal Conveyancing (ref RC:LL:26/13932). Title is clean, no charges, no owners corporation, no GAIC, no bushfire overlay. GST withholding not required.",
        category: "legal",
        keywords: ["s32", "section 32", "contract", "vendor statement", "ready", "signed"],
      },
      {
        question: "What are the council rates?",
        answer: "Casey City Council rates plus South East Water charges combined do not exceed $4,500 per annum (per vendor statement). Individual amounts to be confirmed from rate notices.",
        category: "financial",
        keywords: ["council", "rates", "annual", "fees", "outgoings", "water", "casey"],
      },
      {
        question: "What is the rental appraisal?",
        answer: "TBD — obtain from local property manager. Narre Warren South 4-bedroom homes in the $900K-$1M bracket typically rent $490 to $560 per week, implying a gross yield of approximately 2.6 to 3.0% at the $962K sale price.",
        category: "financial",
        keywords: ["rent", "rental", "appraisal", "yield", "investment", "income", "per week"],
      },
      {
        question: "Can this property be subdivided?",
        answer: "No — the Section 173 Agreement (V896188Q) restricts the lot to one dwelling only. At 630m², the block is also below the minimum size typically required for subdivision in GRZ1. No subdivision potential.",
        category: "planning",
        keywords: ["subdivide", "subdivision", "dual occupancy", "split", "develop", "potential"],
      },
      {
        question: "What services are connected?",
        answer: "All services connected — electricity, gas, water, sewerage, and telephone (confirmed in vendor statement). NBN type to be confirmed.",
        category: "features",
        keywords: ["services", "utilities", "electricity", "gas", "water", "sewer", "nbn", "internet"],
      },
      {
        question: "Is the property in a bushfire prone area?",
        answer: "No — confirmed in the vendor statement. Not in a designated bushfire prone area under section 192A of the Building Act 1993.",
        category: "planning",
        keywords: ["bushfire", "fire", "prone", "bap", "risk", "overlay"],
      },
      {
        question: "What is the suburb like?",
        answer: "Springfield Estate in Narre Warren South — established family-oriented precinct on a quiet residential street. Owner-occupied homes throughout. Strathaird Primary School is a 357m walk. Adjacent to roundabout at Kershaw Drive. Distances to Fountain Gate Westfield and Casey Hospital TBD — confirm locally.",
        category: "location",
        keywords: ["suburb", "area", "neighbourhood", "narre warren", "community", "springfield", "estate"],
      },
      {
        question: "What is the stamp duty on this property?",
        answer: "Approximately $52,800 at standard Victorian transfer duty rates for a $962,000 purchase (non-PPOR, non-FHB). First home buyers and owner-occupiers may be eligible for significant concessions — confirm with a conveyancer.",
        category: "financial",
        keywords: ["stamp duty", "transfer duty", "tax", "purchase costs", "fhb", "concession"],
      },
      {
        question: "Can I build a granny flat or second dwelling?",
        answer: "No — Section 173 Agreement V896188Q clause 1.3 is an absolute restriction: no more than one dwelling house may be erected on this lot. This covenant runs with the land permanently and cannot be removed without a Planning Scheme amendment. Dual occupancy and dependent person's units are also not permitted.",
        category: "planning",
        keywords: ["granny flat", "second dwelling", "dpu", "dependent person", "dual occ", "extra dwelling"],
      },
      {
        question: "How long has the vendor owned the property?",
        answer: "Laura Ah Choy has been registered as proprietor since 04/12/2007 (per Register Search Statement, Vol 10427 Folio 211). Approximately 18.5 years of ownership at time of sale in April 2026.",
        category: "legal",
        keywords: ["vendor", "owner", "how long", "ownership", "history", "title"],
      },
      {
        question: "What is the crime rate in this area?",
        answer: "Below average — the 3805 postcode records 1 burglary per 110 homes, compared to the Victorian state average of 1 in 76 homes and Casey council average of 1 in 82 homes (source: Ideal Conveyancing Property Report, 06/05/2026).",
        category: "location",
        keywords: ["crime", "safety", "burglary", "security", "postcode", "statistics"],
      },
      {
        question: "What is the council property number?",
        answer: "Casey Council property number 69788 (per planning certificate, 06/05/2026). Casey Council contact: 03 9705 5190 / caseycc@casey.vic.gov.au / casey.vic.gov.au",
        category: "legal",
        keywords: ["council", "property number", "reference", "casey", "contact"],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 102 — 3 Thirlmere Court, Berwick (SOLD $941K, 02 May 2026)
  // -------------------------------------------------------------------------
  102: {
    propertyId: 102,
    address: "3 Thirlmere Court",
    suburb: "Berwick VIC 3806",
    status: "sold",
    soldDate: "02 May 2026",
    soldPrice: 941000,

    // PHYSICAL
    beds: 4,
    baths: 2,
    cars: 2,
    landSqm: 612,
    houseSqm: 240,
    yearBuilt: 2008,
    propertyType: "House",
    frontageMetre: 17,
    depthMetre: 36,
    propertyShape: "Rectangular",
    orientation: "North-facing living",
    pool: false,
    gardenSqm: 220,
    shed: false,
    outdoorEntertaining: true,
    alfrescoSqm: 18,
    roofType: "Colorbond",
    externalCladding: "Brick veneer",
    construction: "Brick veneer with feature render panel",
    floorplanConfig: "4 bed, 2 bath, open plan living, double garage",

    // LEGAL & TITLE
    titleType: "Torrens Title",
    easements: "No easements on title",
    covenants: "Estate covenant: no caravan or commercial vehicles in driveway",
    overlays: "No planning overlays",
    s32Status: "Section 32 issued",
    encumbrances: "None",
    ownerOccupied: true,
    zoning: "Neighbourhood Residential Zone (NRZ1)",
    rightOfWay: "None",
    sewerEasement: "None",
    contaminatedLand: false,
    buildingPermitsOutstanding: "None",
    ownerBuilderWork: false,
    titlesOfficeReady: true,
    section32CompletionDate: "April 2026",

    // FINANCIAL
    priceMin: 941000,
    priceMax: 941000,
    vendorReserve: "TBD",
    settlementTermsDays: 45,
    depositPct: 10,
    rentalAppraisalLow: 500,
    rentalAppraisalHigh: 540,
    grossYieldAtAsk: 2.97,
    councilRates: 1850,
    waterRates: 900,
    bodyCorporateFees: 0,
    stampDutyEstimate: 51330,
    landTaxThreshold: "Above threshold for single investment property, land tax applies",
    depreciationYear1Est: 8500,
    capitalGainsHistory: "TBD",

    // LOCATION & SUBURB
    primarySchool: "Berwick Primary School",
    primarySchoolRating: "Above average (MySchool rating 7/10)",
    secondarySchool: "Berwick Secondary College",
    secondarySchoolRating: "7.5/10 (MySchool)",
    schoolZoneCatchment: "Berwick Primary School, Berwick Secondary College",
    distanceToTrainKm: 0.8,
    trainLine: "Pakenham Line, Berwick Station",
    distanceToFreewayKm: 3.5,
    distanceToShoppingKm: 1.8,
    nearestHospitalKm: 4.2,
    suburb5yrGrowthPct: 28,
    suburbMedianPrice: 920000,
    daysOnMarketAvg: 32,
    clearanceRatePct: 74,
    comparableSales: [
      { address: "7 Thirlmere Court, Berwick", price: 910000, date: "Feb 2026", beds: 4 },
      { address: "14 Clive Court, Berwick", price: 955000, date: "Mar 2026", beds: 4 },
      { address: "22 Fairway Drive, Berwick", price: 890000, date: "Jan 2026", beds: 4 },
    ],

    // FEATURES & CONDITION
    kitchenRenovated: "Updated 2020, stone benchtops, stainless steel appliances, breakfast bar",
    bathroomRenovated: "Main bathroom updated 2020, ensuite original 2008",
    flooringType: "Hybrid timber look flooring in living areas, carpet in bedrooms",
    airConType: "Ducted evaporative cooling",
    heatingType: "Ducted gas heating",
    solarKw: 3.5,
    batteryStorage: false,
    evCharging: false,
    nbnType: "NBN FTTN (Fibre to the Node)",
    waterTank: false,
    alarmSystem: true,
    smartHome: false,
    disabilityAccess: false,
    petsAllowed: true,
    outdoorFeatures: "Covered alfresco 18sqm, lawn area, garden beds",

    // PLANNING & VENDOR
    subdivisionPotential: false,
    dualOccupancyPotential: false,
    grannyFlatApproved: false,
    extensionPotential: "Potential to extend to rear and add pergola within existing setbacks",
    councilDevelopmentHistory: "Kitchen reno 2020, no building permits outstanding",
    neighbourhoodDescription: "Quiet court position, family neighbourhood close to Berwick village and train station",
    trafficNoiseLevel: "Low, court position",
    flightPathFlag: false,
    futureInfrastructure: "Berwick Station precinct upgrade in planning",
    floodZone: false,
    vendorMotivation: "Downsizing, children have left home",
    vendorTimelineDays: 45,
    previousOffers: false,
    daysOnMarket: 18,
    priceReductionHistory: "No price reduction",
    tenantInPlace: false,
    tenantLeaseEndDate: "N/A",
    vendorPreferredSettlement: "45 days preferred",
    vendorFlexOnInclusions: "All kitchen appliances and window coverings included",
    inclusions: "Dishwasher, rangehood, oven, all window coverings, alarm system",

    qa: [
      {
        question: "What is the land size?",
        answer: "612 square metres, a well-proportioned suburban block in a court position.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square"],
      },
      {
        question: "How large is the home?",
        answer: "Approximately 240 square metres of living space across 4 bedrooms and open-plan living.",
        category: "physical",
        keywords: ["house", "size", "area", "internal", "sqm", "living"],
      },
      {
        question: "When was it built?",
        answer: "Built in 2008 with kitchen and main bathroom updated in 2020.",
        category: "physical",
        keywords: ["built", "year", "age", "when", "old", "construction"],
      },
      {
        question: "Is there outdoor entertaining?",
        answer: "Yes. A covered alfresco of 18 square metres opens to a lawn area with garden beds.",
        category: "physical",
        keywords: ["outdoor", "alfresco", "entertaining", "pergola", "deck", "garden"],
      },
      {
        question: "What is the orientation?",
        answer: "The living areas face north, providing good natural light through winter.",
        category: "physical",
        keywords: ["orientation", "north", "north-facing", "sun", "aspect", "light"],
      },
      {
        question: "Are there any easements?",
        answer: "No easements on title.",
        category: "legal",
        keywords: ["easement", "easements", "restriction", "title"],
      },
      {
        question: "Are there any covenants?",
        answer: "Yes, an estate covenant restricting caravans and commercial vehicles in the driveway.",
        category: "legal",
        keywords: ["covenant", "covenants", "restriction", "estate", "rules"],
      },
      {
        question: "What is the zoning?",
        answer: "Neighbourhood Residential Zone NRZ1.",
        category: "legal",
        keywords: ["zone", "zoning", "planning", "nrz", "residential"],
      },
      {
        question: "What are the council rates?",
        answer: "Approximately $1,850 per year with Casey Council.",
        category: "financial",
        keywords: ["council", "rates", "annual", "per year", "fees"],
      },
      {
        question: "What is the rental appraisal?",
        answer: "A 4-bedroom home in this location would rent for approximately $500 to $540 per week.",
        category: "financial",
        keywords: ["rent", "rental", "appraisal", "yield", "investment", "income", "per week"],
      },
      {
        question: "What gross yield does this represent?",
        answer: "At the sold price of $941K and mid-rental of $520 per week, the gross yield is approximately 2.97%.",
        category: "financial",
        keywords: ["yield", "gross", "return", "investment return"],
      },
      {
        question: "What stamp duty would apply?",
        answer: "Stamp duty for a principal place of residence purchase at $941K in Victoria is approximately $51,330.",
        category: "financial",
        keywords: ["stamp duty", "duty", "transfer", "government", "cost"],
      },
      {
        question: "What school zone is this property in?",
        answer: "Zoned for Berwick Primary School and Berwick Secondary College.",
        category: "location",
        keywords: ["school", "zone", "catchment", "primary", "secondary", "berwick"],
      },
      {
        question: "How far to the train station?",
        answer: "Berwick Station on the Pakenham Line is approximately 800 metres, an easy walk.",
        category: "location",
        keywords: ["train", "station", "walk", "commute", "transport", "pakenham", "distance"],
      },
      {
        question: "How far to shopping?",
        answer: "Eden Rise shopping centre with Coles and specialty stores is about 1.8km away. Fountain Gate Westfield is about 8km.",
        category: "location",
        keywords: ["shopping", "shops", "centre", "coles", "supermarket", "eden rise", "westfield"],
      },
      {
        question: "How far is Casey Hospital?",
        answer: "Casey Hospital in Berwick is approximately 4.2km from the property.",
        category: "location",
        keywords: ["hospital", "casey", "medical", "health", "emergency"],
      },
      {
        question: "What is the suburb growth history?",
        answer: "Berwick has delivered approximately 28% median price growth over the past 5 years.",
        category: "location",
        keywords: ["growth", "capital", "appreciation", "suburb", "5 year", "market"],
      },
      {
        question: "Has the kitchen been renovated?",
        answer: "Yes, updated in 2020 with stone benchtops, stainless steel appliances, and a breakfast bar.",
        category: "features",
        keywords: ["kitchen", "bench", "appliance", "renovated", "stone", "updated"],
      },
      {
        question: "What type of air conditioning is installed?",
        answer: "Ducted evaporative cooling throughout with ducted gas heating.",
        category: "features",
        keywords: ["air con", "ducted", "cooling", "heating", "evaporative", "climate"],
      },
      {
        question: "Is there solar power?",
        answer: "Yes. A 3.5kW solar system is installed.",
        category: "features",
        keywords: ["solar", "panels", "energy", "electricity", "power", "kw"],
      },
      {
        question: "Is there subdivision potential?",
        answer: "No. NRZ1 zoning and the 612sqm lot size do not meet subdivision minimums.",
        category: "planning",
        keywords: ["subdivision", "subdivide", "sub", "second dwelling", "split"],
      },
      {
        question: "What inclusions are provided?",
        answer: "Dishwasher, rangehood, oven, all window coverings, and the alarm system are included.",
        category: "legal",
        keywords: ["inclusions", "included", "dishwasher", "blind", "curtain", "alarm"],
      },
      {
        question: "Why is the vendor selling?",
        answer: "The vendor is downsizing as their children have moved out.",
        category: "planning",
        keywords: ["vendor", "motivation", "why selling", "motivated", "downsizing", "reason"],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 103 — 5 Ascot Rise, Berwick (SOLD $1,265,000, 03 Jul 2023) — confirmed
  // -------------------------------------------------------------------------
  103: {
    propertyId: 103,
    address: "5 Ascot Rise",
    suburb: "Berwick VIC 3806",
    status: "sold",
    soldDate: "03 Jul 2023",
    soldPrice: 1265000,

    // PHYSICAL
    beds: 4,
    baths: 2,
    cars: 2,
    landSqm: 754,
    houseSqm: 310,
    yearBuilt: 2001,
    propertyType: "House",
    frontageMetre: 20,
    depthMetre: 37,
    propertyShape: "Rectangular",
    orientation: "North-facing rear garden",
    pool: false,
    gardenSqm: 300,
    shed: false,
    outdoorEntertaining: true,
    alfrescoSqm: 35,
    roofType: "Concrete tile",
    externalCladding: "Double brick",
    construction: "Double brick prestige build",
    floorplanConfig: "4 bed, 2 bath, master ensuite, theatre room, formal lounge, alfresco, double garage",

    // LEGAL & TITLE
    titleType: "Torrens Title",
    easements: "No easements",
    covenants: "Berwick Grammar proximity covenant: no commercial use",
    overlays: "No planning overlays",
    s32Status: "Section 32 issued",
    encumbrances: "None",
    ownerOccupied: true,
    zoning: "Neighbourhood Residential Zone (NRZ1)",
    rightOfWay: "None",
    sewerEasement: "None",
    contaminatedLand: false,
    buildingPermitsOutstanding: "None",
    ownerBuilderWork: false,
    titlesOfficeReady: true,
    section32CompletionDate: "March 2026",

    // FINANCIAL
    priceMin: 1265000,
    priceMax: 1265000,
    vendorReserve: "TBD",
    settlementTermsDays: 60,
    depositPct: 10,
    rentalAppraisalLow: 580,
    rentalAppraisalHigh: 640,
    grossYieldAtAsk: 2.51,
    councilRates: 2050,
    waterRates: 920,
    bodyCorporateFees: 0,
    stampDutyEstimate: 69575,
    landTaxThreshold: "Above threshold, land tax applies for investors",
    depreciationYear1Est: 11500,
    capitalGainsHistory: "TBD",

    // LOCATION & SUBURB
    primarySchool: "Berwick Primary School",
    primarySchoolRating: "Above average (MySchool rating 7/10)",
    secondarySchool: "Berwick Secondary College",
    secondarySchoolRating: "7.5/10 (MySchool)",
    schoolZoneCatchment: "Berwick Primary School, Berwick Secondary College. Walking distance to Berwick Grammar (independent).",
    distanceToTrainKm: 0.9,
    trainLine: "Pakenham Line, Berwick Station",
    distanceToFreewayKm: 3.8,
    distanceToShoppingKm: 1.5,
    nearestHospitalKm: 4.0,
    suburb5yrGrowthPct: 28,
    suburbMedianPrice: 920000,
    daysOnMarketAvg: 32,
    clearanceRatePct: 74,
    comparableSales: [
      { address: "12 Ascot Rise, Berwick", price: 1270000, date: "Jan 2026", beds: 4 },
      { address: "8 Grand Arch Way, Berwick", price: 1310000, date: "Feb 2026", beds: 4 },
      { address: "3 Brookfield Drive, Berwick", price: 1250000, date: "Dec 2025", beds: 4 },
    ],

    // FEATURES & CONDITION
    kitchenRenovated: "Fully renovated 2019, 40mm stone benchtops, Bosch appliances, butler's pantry",
    bathroomRenovated: "Master ensuite renovated 2019, main bathroom updated 2021",
    flooringType: "Solid timber floors in living areas, carpet in bedrooms",
    airConType: "Ducted refrigerated cooling (Daikin)",
    heatingType: "Ducted gas heating",
    solarKw: 5.0,
    batteryStorage: false,
    evCharging: false,
    nbnType: "NBN FTTP (Fibre to the Premises)",
    waterTank: true,
    alarmSystem: true,
    smartHome: false,
    disabilityAccess: false,
    petsAllowed: true,
    outdoorFeatures: "Alfresco 35sqm with outdoor kitchen, manicured rear garden, room for pool addition",

    // PLANNING & VENDOR
    subdivisionPotential: false,
    dualOccupancyPotential: false,
    grannyFlatApproved: false,
    extensionPotential: "Room to add pool and extend alfresco; rear garden 300sqm provides space",
    councilDevelopmentHistory: "Kitchen and ensuite reno permits 2019, no outstanding permits",
    neighbourhoodDescription: "Prestigious Ascot Rise address walking distance to Berwick Grammar, Berwick Village, and Berwick Station. Tree-lined street, elevated position with park views.",
    trafficNoiseLevel: "Low, residential street with good setback from Clyde Road",
    flightPathFlag: false,
    futureInfrastructure: "Berwick Station precinct upgrade in planning; potential high-speed rail future corridor nearby",
    floodZone: false,
    vendorMotivation: "Relocating to Queensland",
    vendorTimelineDays: 60,
    previousOffers: true,
    daysOnMarket: 24,
    priceReductionHistory: "No price reduction, sold at auction above reserve",
    tenantInPlace: false,
    tenantLeaseEndDate: "N/A",
    vendorPreferredSettlement: "60 days",
    vendorFlexOnInclusions: "Outdoor kitchen negotiable, all internal inclusions included",
    inclusions: "All light fittings, window coverings, dishwasher, outdoor kitchen, water tank, alarm system",

    qa: [
      {
        question: "What is the land size?",
        answer: "754 square metres, a generous block within walking distance of Berwick Grammar.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square"],
      },
      {
        question: "What is the house size?",
        answer: "Approximately 310 square metres including 4 bedrooms, theatre room, formal lounge, and alfresco.",
        category: "physical",
        keywords: ["house", "size", "area", "internal", "sqm", "living", "floor"],
      },
      {
        question: "What is the construction quality?",
        answer: "Double brick prestige construction built in 2001, known for solid build quality and good thermal mass.",
        category: "physical",
        keywords: ["construction", "brick", "double brick", "quality", "build", "materials"],
      },
      {
        question: "Is there outdoor entertaining?",
        answer: "Yes. A 35 square metre alfresco with an outdoor kitchen, opening to a manicured rear garden.",
        category: "physical",
        keywords: ["outdoor", "alfresco", "entertaining", "deck", "kitchen", "garden"],
      },
      {
        question: "Is there a theatre room?",
        answer: "Yes. A dedicated theatre room is part of the floorplan.",
        category: "physical",
        keywords: ["theatre", "media", "room", "cinema", "entertainment", "floorplan"],
      },
      {
        question: "What are the easements and covenants?",
        answer: "No easements on title. There is a covenant restricting commercial use, common in the Berwick Grammar precinct.",
        category: "legal",
        keywords: ["easement", "covenant", "restriction", "title", "legal"],
      },
      {
        question: "Is the Section 32 ready?",
        answer: "Yes. Section 32 was issued in March 2026.",
        category: "legal",
        keywords: ["s32", "section 32", "contract", "vendor statement", "ready"],
      },
      {
        question: "What are the council rates?",
        answer: "Approximately $2,050 per year with Casey Council.",
        category: "financial",
        keywords: ["council", "rates", "annual", "per year", "fees"],
      },
      {
        question: "What is the rental appraisal?",
        answer: "A prestige 4-bedroom near Berwick Grammar would rent for approximately $580 to $640 per week.",
        category: "financial",
        keywords: ["rent", "rental", "appraisal", "yield", "investment", "income", "per week"],
      },
      {
        question: "What school zone does this fall in?",
        answer: "Zoned for Berwick Primary School and Berwick Secondary College. It is also walking distance to Berwick Grammar (independent school).",
        category: "location",
        keywords: ["school", "zone", "catchment", "grammar", "berwick", "primary", "secondary"],
      },
      {
        question: "How far is the train station?",
        answer: "Berwick Station on the Pakenham Line is approximately 900 metres away.",
        category: "location",
        keywords: ["train", "station", "commute", "walk", "transport", "pakenham"],
      },
      {
        question: "Has the kitchen been renovated?",
        answer: "Yes. Full renovation in 2019 with 40mm stone benchtops, Bosch appliances, and a butler's pantry.",
        category: "features",
        keywords: ["kitchen", "bench", "appliance", "renovated", "stone", "butler", "pantry"],
      },
      {
        question: "What is the NBN connection type?",
        answer: "NBN FTTP (Fibre to the Premises), the fastest connection type.",
        category: "features",
        keywords: ["nbn", "internet", "fibre", "broadband", "fttp", "connection"],
      },
      {
        question: "Is there solar power?",
        answer: "Yes. A 5kW solar system is installed.",
        category: "features",
        keywords: ["solar", "panels", "energy", "electricity", "power", "kw"],
      },
      {
        question: "Is there pool potential?",
        answer: "Yes. The 300sqm rear garden has room for a pool subject to council approval under NRZ1.",
        category: "planning",
        keywords: ["pool", "swimming", "spa", "potential", "add", "garden"],
      },
      {
        question: "Is there subdivision potential?",
        answer: "No. NRZ1 zoning restricts subdivision on a 740sqm lot in this precinct.",
        category: "planning",
        keywords: ["subdivision", "subdivide", "sub", "second dwelling", "split"],
      },
      {
        question: "What is the neighbourhood like?",
        answer: "Prestigious Ascot Rise address. Tree-lined street, elevated position with park views, walking distance to Berwick Village and Berwick Grammar.",
        category: "planning",
        keywords: ["neighbourhood", "street", "area", "suburb", "community", "prestige"],
      },
      {
        question: "What is the suburb 5-year growth?",
        answer: "Berwick has delivered approximately 28% median price growth over the past 5 years.",
        category: "location",
        keywords: ["growth", "capital", "appreciation", "suburb", "5 year", "market"],
      },
      {
        question: "What inclusions are provided?",
        answer: "All light fittings, window coverings, dishwasher, outdoor kitchen (negotiable), water tank, and alarm system.",
        category: "legal",
        keywords: ["inclusions", "included", "dishwasher", "blind", "alarm", "outdoor kitchen"],
      },
      {
        question: "Why is the vendor selling?",
        answer: "The vendor is relocating to Queensland.",
        category: "planning",
        keywords: ["vendor", "motivation", "why selling", "motivated", "reason", "relocating"],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 104 — 3 Yemaya Place, Berwick (ACTIVE LISTING — S32 signed 04/05/2026)
  // SLM data: Extracted from Section 32/COS (John Conquest Lawyers, 04/05/2026)
  // Title: Vol 10933 Folio 708 | Lot 14 PS537252C | Casey Council prop no. 95724
  // Restrictive covenant AE322439C | ME Bank mortgage AU406181L to discharge
  // -------------------------------------------------------------------------
  104: {
    propertyId: 104,
    address: "3 Yemaya Place",
    suburb: "Berwick VIC 3806",
    status: "active",

    // PHYSICAL
    beds: "TBD",
    baths: "TBD",
    cars: "TBD",
    landSqm: 806,
    houseSqm: "TBD",
    yearBuilt: "TBD",
    propertyType: "House",
    frontageMetre: "TBD",
    depthMetre: "TBD",
    propertyShape: "Irregular — trapezoidal cul-de-sac position with curved frontage (end of Yemaya Place)",
    orientation: "South — frontage faces south toward Yemaya Place (confirmed from planning certificate lot map and SEW asset plans, April 2026)",
    pool: "TBD",
    gardenSqm: "TBD",
    shed: "TBD",
    outdoorEntertaining: "TBD",
    alfrescoSqm: "TBD",
    roofType: "TBD",
    externalCladding: "TBD",
    construction: "TBD",
    floorplanConfig: "TBD",

    // LEGAL & TITLE
    titleType: "Torrens — Vol 10933 Folio 708 (Lot 14 PS537252C)",
    easements: "E-1 Crown Grant reservation V8876 F474 (4.02m wide, drainage and other purposes — in favour of Casey City Council and South East Water Ltd) and E-2 Drainage and Sewerage easement (origin PS537252C, width 'see diagram' — in favour of Casey City Council and South East Water Ltd). SEW Sewer & Drainage asset plan (case 51958648, 21 April 2026) shows the 150 UPVC sewer main runs along Yemaya Place (the road), not through Lot 14 itself. Depth limitation: 15.24m below surface applies to ALL land in PS537252C — restricts deep excavation and underground works across the entire subdivision. Confirm exact E-2 boundary position on Lot 14 with a licensed surveyor before any underground construction works.",
    covenants: "Restrictive Covenant AE322439C (registered 01/05/2006 — Transfer of Land, Arleon Holdings Pty Ltd to Christopher Yue; applies to all lots in PS537252C, PS537253A and PS537251E): single dwelling only per lot; minimum floor area 160sqm (excluding garage, carport, terrace, pergola, verandah); external walls brick, brick veneer, concrete, stone, glass or timber (timber max 30%, all materials new); roof concrete or terracotta tiles, slate, or non-reflective Colourbond at minimum 22-degree pitch; garage or covered carport for minimum 1 vehicle using same materials, built simultaneously with dwelling; no fences within 5m of front boundary unless max 1m height; side and rear fences 1.8m-2.0m; driveway installed at Certificate of Occupancy (concrete, bitumen or pavers); no boats, caravans, trailers or vehicles 1 tonne or more stored forward of building line outside business hours; front landscaping within 6 months of occupation. Covenant runs with land permanently.",
    overlays: "None — confirmed from Planning Certificate (Ref 1247581, 21 April 2026, Minister for Planning Sonya Kilkenny). Casey Planning Scheme GRZ1 only, no additional overlays.",
    s32Status: "Signed (e-signed) — vendor Christopher Yue, 04/05/2026 at 9:35 AM GMT. Vendor Statement AMENDED 04.05.2026. Prepared by John Conquest Lawyers (ref SB:YUE). Executed via Adobe Acrobat Sign (Transaction ID: CBJCHBCAABAAU0Q8EZh838obCgFZRiDjaIPZkt0btyea). No owners corporation. Not bushfire prone. No building permits outstanding. All services connected. GAIC: not applicable — Berwick is an established suburb; no GAIC disclosure in Vendor Statement. ME Bank mortgage AU406181L must be discharged at settlement.",
    encumbrances: "1. Mortgage AU406181L (01/06/2021) — Members Equity Bank Ltd (ME Bank, ACN 070887679) — must be formally discharged at or before settlement; eCT currently held by Galilee Solicitors Pty Ltd (ref 20486E). 2. Restrictive Covenant AE322439C (01/05/2006) — runs with land permanently; see covenants field for full terms.",
    ownerOccupied: true,
    zoning: "GRZ1 — General Residential Zone Schedule 1 (Casey Planning Scheme)",
    rightOfWay: "None",
    sewerEasement: "E-2 (Drainage and Sewerage in favour of Casey City Council and South East Water Ltd) exists in PS537252C — width 'SEE DIAG'. Based on the SEW Sewer & Drainage asset plan (case 51958648, 21 April 2026), the 150 UPVC sewer main runs along Yemaya Place (the road), not through Lot 14 itself. No sewer infrastructure is shown crossing Lot 14 on the SEW plan. E-1 Crown Grant reservation (V8876 F474, 4.02m wide, drainage) also applies per PS537252C. Confirm exact E-2 boundary traversal on Lot 14 with a licensed surveyor before any underground excavation or extension works.",
    contaminatedLand: false,
    buildingPermitsOutstanding: "No building permits issued in last 10 years per Casey Council Building Surveying Services certificate (CerB/W037423, 22 April 2026). Property not subject to any notices or orders under Building Act 1993.",
    ownerBuilderWork: false,
    titlesOfficeReady: true,
    section32CompletionDate: "04/05/2026",

    // FINANCIAL
    priceMin: "TBD",
    priceMax: "TBD",
    vendorReserve: "TBD",
    settlementTermsDays: "TBD",
    depositPct: 10,
    rentalAppraisalLow: "TBD",
    rentalAppraisalHigh: "TBD",
    grossYieldAtAsk: "TBD",
    councilRates: 2769,
    waterRates: 704,
    bodyCorporateFees: 0,
    stampDutyEstimate: "TBD",
    landTaxThreshold: "Vendor exempt as PPOR (SRO Property Clearance Certificate 98773178, 21 April 2026: Land Tax $0.00 — LTX Principal Place of Residence exemption). Investor single ownership: $2,430 p.a. (SRO-confirmed: $2,250 + ($630,000 - $600,000) x 0.600 cents). If left vacant: Vacant Residential Land Tax $9,150 p.a. ($915,000 CIV x 1.000%). No Windfall Gains Tax (WGT cert 98773178 — 'No windfall gains tax liability identified'). AVPCC 110 — not a qualifying use; no CIPT (CIPT cert 98773178, 21 April 2026). No outstanding land tax arrears.",
    depreciationYear1Est: "TBD",
    capitalGainsHistory: "Vendor purchased Lot 14 as vacant land on 01/05/2006 for $167,000 (stamp duty $5,680 at transfer from Arleon Holdings Pty Ltd). Casey Council Capital Improved Value as at 01/07/2025: $915,000. Site Value: $630,000.",

    // LOCATION & SUBURB
    primarySchool: "TBD — confirm school zone catchment for 3 Yemaya Place with Casey Council",
    primarySchoolRating: "TBD",
    secondarySchool: "TBD — confirm with Casey Council",
    secondarySchoolRating: "TBD",
    schoolZoneCatchment: "TBD — confirm with Casey Council (council property number 95724, City of Casey)",
    distanceToTrainKm: "TBD",
    trainLine: "Pakenham Line (Berwick Station — confirm distance from Yemaya Place)",
    distanceToFreewayKm: "TBD",
    distanceToShoppingKm: "TBD",
    nearestHospitalKm: "TBD",
    suburb5yrGrowthPct: 28,
    suburbMedianPrice: 920000,
    daysOnMarketAvg: 32,
    clearanceRatePct: 74,
    comparableSales: "TBD",

    // FEATURES & CONDITION
    kitchenRenovated: "TBD",
    bathroomRenovated: "TBD",
    flooringType: "TBD",
    airConType: "TBD",
    heatingType: "TBD",
    solarKw: "TBD",
    batteryStorage: "TBD",
    evCharging: "TBD",
    nbnType: "TBD",
    waterTank: "TBD",
    alarmSystem: "TBD",
    smartHome: "TBD",
    disabilityAccess: "TBD",
    petsAllowed: "TBD",
    outdoorFeatures: "TBD",

    // PLANNING & VENDOR
    subdivisionPotential: "TBD",
    dualOccupancyPotential: false,
    grannyFlatApproved: false,
    extensionPotential: "Possible — GRZ1 allows extensions and alterations subject to planning permit. Covenant AE322439C restricts to single dwelling but does not prohibit extension of the existing dwelling. Minimum 160sqm floor area covenant clause sets a floor, not a ceiling.",
    councilDevelopmentHistory: "No building permits issued in last 10 years (Casey Council Building Surveying Services CerB/W037423, 22 April 2026).",
    neighbourhoodDescription: "Yemaya Place is a quiet cul-de-sac off Golf Links Road, Berwick (City of Casey). Lot 14 is at the closed end of the cul-de-sac — no through traffic. Subdivision registered March 2006 (PS537252C). All surrounding properties in the same Arleon Holdings estate carry identical AE322439C covenant ensuring consistent building standards across the precinct.",
    trafficNoiseLevel: "Very low — cul-de-sac with no through traffic",
    flightPathFlag: false,
    futureInfrastructure: "VicRoads: no road acquisition proposals as at 21 April 2026 (certificate 80296080). No infrastructure works directly impacting this property identified in vendor statement or council/statutory certificates.",
    floodZone: false,
    vendorMotivation: "TBD",
    vendorTimelineDays: "TBD",
    previousOffers: "TBD",
    daysOnMarket: "TBD",
    priceReductionHistory: "TBD",
    tenantInPlace: false,
    tenantLeaseEndDate: "N/A — vacant possession at settlement",
    vendorPreferredSettlement: "TBD",
    vendorFlexOnInclusions: "TBD",
    inclusions: "All fixed floor coverings, window furnishings, light fittings, dishwasher, oven, cooktop, rangehood, and any other items of a permanent nature (per Contract of Sale particulars, 04/05/2026)",

    qa: [
      {
        question: "How big is the land?",
        answer: "806 square metres — confirmed from Plan of Subdivision PS537252C Sheet 2, Casey Council Land Information Certificate (wCerR/C078905, 21 April 2026), and South East Water Information Statement (case 51958648). Lot 14 is at the closed end of Yemaya Place cul-de-sac with an irregular trapezoidal shape.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square", "frontage"],
      },
      {
        question: "What are the covenants on this property?",
        answer: "Restrictive Covenant AE322439C (registered 01/05/2006) runs with the land permanently. Key terms: single dwelling only per lot; minimum floor area 160sqm; external walls must be brick, brick veneer, concrete, stone, glass or timber (timber max 30%, all materials new); roof must be concrete or terracotta tiles, slate, or non-reflective Colourbond at minimum 22-degree pitch; garage or carport for at least one vehicle required; no front fence within 5m of boundary unless under 1m; side and rear fences 1.8m-2.0m. Applies to all lots in the PS537252C, PS537253A and PS537251E subdivisions.",
        category: "legal",
        keywords: ["covenant", "restriction", "encumbrance", "building", "materials", "dwelling", "fence", "roof"],
      },
      {
        question: "Are there any easements?",
        answer: "PS537252C contains E-1 (Crown Grant reservation V8876 F474, 4.02m wide, drainage and other purposes — in favour of Casey City Council and South East Water Ltd) and E-2 (drainage and sewerage, width 'see diagram' — in favour of Casey City Council and South East Water Ltd). Based on the SEW Sewer & Drainage asset plan (case 51958648, 21 April 2026), the 150 UPVC sewer main runs along Yemaya Place (the road), not through Lot 14 itself. A 15.24m depth limitation below the surface applies to ALL land in PS537252C — restricts deep excavation and underground works across the whole subdivision. Confirm exact easement traversal on Lot 14 with a licensed surveyor before underground works.",
        category: "legal",
        keywords: ["easement", "drainage", "sewer", "depth", "restriction", "title", "encumbrance"],
      },
      {
        question: "Is there a mortgage on the property?",
        answer: "Yes — ME Bank (Members Equity Bank Ltd, ACN 070887679) holds Mortgage AU406181L, registered 01/06/2021. This must be formally discharged at or before settlement. The electronic Certificate of Title is currently held by Galilee Solicitors Pty Ltd on behalf of ME Bank (eCT ref 20486E).",
        category: "legal",
        keywords: ["mortgage", "loan", "bank", "encumbrance", "discharge", "me bank", "settlement"],
      },
      {
        question: "Is the Section 32 ready?",
        answer: "Yes — vendor Christopher Yue e-signed the Vendor Statement AMENDED 04.05.2026 on 04/05/2026 at 9:35 AM GMT (via Adobe Acrobat Sign). Prepared by John Conquest Lawyers (ref SB:YUE). Title is confirmed as Torrens (Vol 10933 Folio 708). No owners corporation, not bushfire prone, no building permits outstanding, all services connected. ME Bank mortgage (AU406181L) must be discharged at settlement.",
        category: "legal",
        keywords: ["s32", "section 32", "vendor statement", "ready", "signed", "contract"],
      },
      {
        question: "What is the zoning?",
        answer: "GRZ1 — General Residential Zone Schedule 1 under the Casey Planning Scheme. Confirmed by Planning Certificate (Ref 1247581, 21 April 2026). No planning overlays apply. Restrictive Covenant AE322439C adds additional building material and design standards beyond the planning scheme.",
        category: "planning",
        keywords: ["zone", "zoning", "grz", "residential", "planning", "overlay", "casey"],
      },
      {
        question: "What are the council rates?",
        answer: "Council rates for FY2026: $2,006.73 general rates + $468.00 garbage charge + $294.30 ESVF levy = $2,769.03 per annum (Casey Council, Land Information Certificate wCerR/C078905, 21 April 2026). South East Water annual service charges approximately $704 (quarterly $176.08 x 4, excludes usage at $1.66/day). The Section 32 states combined outgoings will not exceed $4,100 per annum.",
        category: "financial",
        keywords: ["council", "rates", "annual", "fees", "outgoings", "water", "casey"],
      },
      {
        question: "What is the council valuation?",
        answer: "As at 01/07/2025 — Site Value: $630,000; Capital Improved Value: $915,000; Net Annual Value: $45,750. (Casey Council valuation, Land Information Certificate wCerR/C078905.)",
        category: "financial",
        keywords: ["valuation", "site value", "capital improved", "council", "assessed value"],
      },
      {
        question: "What land tax applies?",
        answer: "Vendor Christopher Yue is exempt as principal place of residence (SRO Property Clearance Certificate 98773178, 21 April 2026 — Land Tax $0.00). Investor single ownership: $2,430 p.a. (SRO-confirmed: $2,250 + ($630,000 - $600,000) x 0.600 cents). If left vacant: Vacant Residential Land Tax $9,150 p.a. ($915,000 CIV x 1.000%). No Windfall Gains Tax ('No windfall gains tax liability identified' — WGT cert 98773178). AVPCC 110 — not qualifying use; no CIPT (CIPT cert 98773178). No arrears.",
        category: "financial",
        keywords: ["land tax", "ppor", "investment", "vacant residential", "windfall", "tax", "sro"],
      },
      {
        question: "Can I build a granny flat or second dwelling?",
        answer: "No — Restrictive Covenant AE322439C is an absolute restriction to a single dwelling per lot. This runs with the land permanently and prevents any second dwelling, dual occupancy, granny flat or dependent person's unit regardless of what the planning scheme may otherwise permit.",
        category: "planning",
        keywords: ["granny flat", "second dwelling", "dual occ", "dpu", "dependent", "extra unit", "secondary"],
      },
      {
        question: "Can the property be subdivided?",
        answer: "TBD — the 806sqm block in GRZ1 may theoretically allow lot subdivision. However Covenant AE322439C restricts each existing lot to a single dwelling. Legal advice is recommended on whether the covenant extends to restrict subdivision creating new lots.",
        category: "planning",
        keywords: ["subdivision", "subdivide", "split", "develop", "two lots", "second lot"],
      },
      {
        question: "Is the property in a bushfire or flood risk area?",
        answer: "No on both counts. Not a designated bushfire prone area (confirmed in Vendor Statement). Not subject to flooding from Melbourne Water's drainage system (South East Water Information Statement, 21 April 2026 — below 1% AEP flood level). VicRoads confirms no road acquisition proposals (21 April 2026).",
        category: "planning",
        keywords: ["bushfire", "flood", "risk", "prone", "flooding", "drainage", "fire"],
      },
      {
        question: "Is there a termite risk?",
        answer: "Yes — the property is in a designated termite attack area (BR 151: Designated as subject to Attack by Termites — Yes, Casey Council Building Surveying Services CerB/W037422, 22 April 2026). A professional pest inspection is strongly recommended prior to purchase.",
        category: "features",
        keywords: ["termite", "pest", "inspection", "infestation", "white ant", "br 151"],
      },
      {
        question: "What services are connected?",
        answer: "All services connected — electricity, gas, water, sewerage, and telephone (confirmed in Vendor Statement). Water and sewerage serviced by South East Water (Information Statement, 21 April 2026). No recycled water service in this area (per South East Water asset map). NBN type TBD.",
        category: "features",
        keywords: ["services", "utilities", "electricity", "gas", "water", "sewer", "nbn", "internet"],
      },
      {
        question: "What inclusions come with the property?",
        answer: "All fixed floor coverings, window furnishings, light fittings, dishwasher, oven, cooktop, rangehood, and any other items of a permanent nature (per Contract of Sale particulars, 04/05/2026).",
        category: "legal",
        keywords: ["inclusions", "included", "dishwasher", "oven", "cooktop", "rangehood", "fixtures"],
      },
      {
        question: "How long has the vendor owned the property?",
        answer: "Christopher Yue purchased Lot 14 as vacant land on 01/05/2006 from Arleon Holdings Pty Ltd for $167,000 (stamp duty $5,680). The house was built after the 2006 transfer. Approximately 20 years of ownership at time of listing in May 2026.",
        category: "legal",
        keywords: ["vendor", "ownership", "how long", "history", "bought", "years", "original"],
      },
      {
        question: "Is this a cul-de-sac property?",
        answer: "Yes — 3 Yemaya Place is at the closed end of the Yemaya Place cul-de-sac, off Golf Links Road, Berwick. No through traffic. Lot 14 in PS537252C is an irregular trapezoidal lot. The position provides privacy and very low traffic noise.",
        category: "location",
        keywords: ["cul-de-sac", "court", "quiet", "traffic", "through", "golf links", "place"],
      },
      {
        question: "What is the council property number?",
        answer: "Casey Council property number 95724 (per Land Information Certificate wCerR/C078905 and Building Surveying Services CerB/W037422, April 2026). SRO Land ID: 33855428. Casey Council contact: 03 9705 5200 / caseycc@casey.vic.gov.au",
        category: "legal",
        keywords: ["council", "property number", "reference", "casey", "contact", "land id"],
      },
      {
        question: "What is the rental appraisal?",
        answer: "TBD — obtain from local property manager. As a guide, 806sqm lots in Berwick cul-de-sac positions command a premium. Confirm beds/baths to get an accurate appraisal.",
        category: "financial",
        keywords: ["rent", "rental", "appraisal", "yield", "investment", "income", "per week"],
      },
      {
        question: "How old is the house?",
        answer: "Built approximately 2006-2009. The land was transferred to Christopher Yue on 01/05/2006 (Lot 14 PS537252C registered 28/03/2006). No building permits exist in council records for the last 10 years (searched to April 2026), confirming the dwelling predates 2016. Exact year to be confirmed on inspection or from council records.",
        category: "physical",
        keywords: ["age", "built", "year", "old", "construction", "when", "2006"],
      },
      {
        question: "Are there any outstanding rates at settlement?",
        answer: "As at 21 April 2026, there was an outstanding council rates balance of $692.25 (Casey Council Land Information Certificate wCerR/C078905). Under s175(1) of the Local Government Act 1989, the purchaser must pay all overdue rates at the time they become the registered owner. Rate arrears should be checked and adjusted at settlement.",
        category: "financial",
        keywords: ["rates", "outstanding", "arrears", "settlement", "balance", "overdue", "adjustment"],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 105 — 34 Hartsmere Drive, Berwick (ACTIVE LISTING — S32 signed vendor 04/05/2026)
  // Title: Vol 10668 Folio 952 | Lot 323 PS444491A | Casey Council prop no. 81625
  // Covenant AB543185A | S173 Agreement P168642E (Kingsmere Estate) | Bank Australia mortgage AZ356770W
  // Vendor: Daniella May Maloney (sole proprietor since 28/06/2018; Maloney family from 2002 / $76K)
  // -------------------------------------------------------------------------
  105: {
    propertyId: 105,
    address: "34 Hartsmere Drive",
    suburb: "Berwick VIC 3806",
    status: "active",

    // PHYSICAL
    beds: "TBD",
    baths: "TBD",
    cars: "TBD",
    landSqm: 621,
    houseSqm: "TBD",
    yearBuilt: "TBD",
    propertyType: "House",
    frontageMetre: "TBD",
    depthMetre: "TBD",
    propertyShape: "Approximately rectangular — eastern end lot on Hartsmere Drive, Kingsmere Estate Stage 5A. Possible irregular rear boundary per PS444491A Sheet 3; confirm at inspection.",
    orientation: "TBD",
    pool: "TBD",
    gardenSqm: "TBD",
    shed: "TBD",
    outdoorEntertaining: "TBD",
    alfrescoSqm: "TBD",
    roofType: "TBD",
    externalCladding: "TBD",
    construction: "TBD — covenant AB543185A mandates brick or brick veneer outer walls (max 20% timber/glass, excluding windows)",
    floorplanConfig: "TBD",

    // LEGAL & TITLE
    titleType: "Torrens — Vol 10668 Folio 952 (Lot 323 PS444491A). Parent Title Vol 10578 Folio 925. Created 15/08/2002 (Security no. 124134254076K, produced 30/04/2026). Sole proprietor: Daniella May Maloney (sole since AR184162X 28/06/2018 — transferred from joint proprietors Gary Robert Maloney and Daniella May Maloney).",
    easements: "E-1 Sewerage (origin PS323020T, in favour of Melbourne Water Corporation; and origin PS412796G, in favour of South East Water Limited). E-2 Drainage (origin PS430239P, in favour of Casey City Council) and E-2 Sewerage (origin PS430239P, in favour of South East Water Limited) — appears to run along rear boundary of Lot 323 per PS444491A Sheet 3. E-3 Drainage (origin PS444491A, in favour of Casey City Council and South East Water Limited) and E-3 Sewerage (origin PS444491A, in favour of South East Water Limited). E-4 Powerline (origin PS444491A, s88 Electricity Industry Act 2000, in favour of TXU Networks Pty Ltd). 15.24m excavation depth limitation applies to all land in PS444491A.",
    covenants: "Restrictive Covenant AB543185A (registered 09/09/2002 — Transfer of Land, Dalmont Bay Pty Ltd to Gary Robert Maloney and Daniella May Maloney): (a) single dwelling with min 150sqm floor area, outer walls brick or brick veneer max 20% timber/glass (excluding windows); (b) garage/carport to be brick or brick veneer; (c) no shed including garden shed greater than 4sqm; (d) no more than 2 of any species of animal or bird; (e) no re-subdivision by Plan of Subdivision, Strata Subdivision or Cluster Titles. Runs with land permanently. S173 Agreement P168642E (registered 04/05/1989, amended 18/07/1990 — City of Berwick, Allen's Vegetable Farms Pty Ltd, Hooker Corporation Ltd, RVA Pty Ltd): (1) construct noise attenuation mounds along Princes Freeway (M1) reservation adjacent to Kingsmere Estate boundary; (2) subdivide only in accordance with Berwick Residential Normal Density Zone. Obligation (1) almost certainly performed by developer at estate completion c.2002. Remains on title as historic encumbrance. Runs with all land derived from Crown Allotments 31C and 31E, Parish of Berwick (entire Kingsmere Estate).",
    overlays: "TBD — no planning certificate (s199) included in this S32 pack. Obtain from Casey Planning Scheme directly.",
    s32Status: "Signed (vendor Daniella May Maloney, 04/05/2026). Purchaser not yet signed (PREVIEW state as at PDF date). No owners corporation. Not bushfire prone area (s32 section 3.3 — box unchecked). All services connected. CIPT not applicable (AVPCC 110 = residential, not qualifying). No GAIC (Berwick established suburb). No road acquisition proposals (VicRoads certificate 30/04/2026). Bank Australia Ltd mortgage AZ356770W must be discharged at settlement. No building surveying certificate in this S32 pack — building permit history TBD. Special Condition 12 (Swimming Pool/Spa) included in COS — suggests pool or spa may be present; confirm at inspection.",
    encumbrances: "1. Mortgage AZ356770W (08/07/2025) — Bank Australia Ltd — must be discharged at settlement; eCT held by Bank Australia Limited (20000L, effective 08/07/2025). 2. Covenant AB543185A (09/09/2002) — see covenants field. 3. Agreement P168642E (04/05/1989) — S173 Planning and Environment Act 1987 — see covenants field.",
    ownerOccupied: true,
    zoning: "TBD — no planning certificate in S32 pack. Expected GRZ1 or NRZ under Casey Planning Scheme. Confirm from Casey council.",
    rightOfWay: "None",
    sewerEasement: "Yes — E-2 drainage and sewerage easement (origin PS430239P, in favour of Casey City Council and South East Water Limited) runs along rear boundary of Lot 323 per PS444491A Sheet 3.",
    contaminatedLand: false,
    buildingPermitsOutstanding: "TBD — no building surveying certificate in S32 pack. Building permit history not confirmed.",
    ownerBuilderWork: "TBD",
    titlesOfficeReady: "TBD",
    section32CompletionDate: "04/05/2026",

    // FINANCIAL
    priceMin: 820000,
    priceMax: 900000,
    vendorReserve: "TBD",
    settlementTermsDays: "TBD",
    depositPct: 10,
    rentalAppraisalLow: 470,
    rentalAppraisalHigh: 520,
    grossYieldAtAsk: "TBD",
    councilRates: 2334,
    waterRates: 704,
    bodyCorporateFees: 0,
    stampDutyEstimate: "TBD",
    landTaxThreshold: "Vendor exempt as PPOR (Land Tax cert 98949575, 30/04/2026, SV $570,000). Investor (single ownership) ~$2,160 p.a. (calculated as $1,350 + ($570,000 - $300,000) x 0.300 cents). Vacant residential $7,500 p.a. (CIV $750,000 x 1%). No CIPT (AVPCC 110, residential, not qualifying). No WGT.",
    depreciationYear1Est: "TBD",
    capitalGainsHistory: "Gary Robert Maloney and Daniella May Maloney purchased Lot 323 as vacant land from Dalmont Bay Pty Ltd on 05/09/2002 for $76,000 (stamp duty $1,624). Gary transferred his interest to Daniella on 28/06/2018 (AR184162X) — Daniella sole proprietor since then. CIV as at 01/07/2025: $750,000. SV: $570,000.",

    // LOCATION & SUBURB
    primarySchool: "TBD",
    primarySchoolRating: "TBD",
    secondarySchool: "TBD",
    secondarySchoolRating: "TBD",
    schoolZoneCatchment: "TBD",
    distanceToTrainKm: "TBD",
    trainLine: "Pakenham Line (Berwick Station — confirm distance)",
    distanceToFreewayKm: "TBD",
    distanceToShoppingKm: "TBD",
    nearestHospitalKm: "TBD",
    suburb5yrGrowthPct: 28,
    suburbMedianPrice: 920000,
    daysOnMarketAvg: 32,
    clearanceRatePct: 74,
    comparableSales: [
      { address: "32 Hartsmere Drive, Berwick", price: 820000, date: "Feb 2026", beds: 4 },
      { address: "22 Cullen Close, Berwick", price: 778000, date: "Apr 2026", beds: 4 },
      { address: "4 Sunnyside Drive, Berwick", price: 843000, date: "Mar 2026", beds: 4 },
    ],

    // FEATURES & CONDITION
    kitchenRenovated: "TBD",
    bathroomRenovated: "TBD",
    flooringType: "TBD",
    airConType: "TBD",
    heatingType: "TBD",
    solarKw: "TBD",
    batteryStorage: "TBD",
    evCharging: "TBD",
    nbnType: "TBD",
    waterTank: "TBD",
    alarmSystem: "TBD",
    smartHome: "TBD",
    disabilityAccess: "TBD",
    petsAllowed: "TBD",
    outdoorFeatures: "TBD",

    // PLANNING & VENDOR
    subdivisionPotential: false,
    dualOccupancyPotential: false,
    grannyFlatApproved: false,
    extensionPotential: "TBD",
    councilDevelopmentHistory: "TBD",
    neighbourhoodDescription: "Kingsmere Estate, Berwick — Stage 5A. Eastern end of Hartsmere Drive. Lot 323 backs toward Princes Freeway (M1) reservation; noise attenuation mounds were constructed along this boundary at estate development per S173 Agreement P168642E. Quiet residential street (low through traffic). Casey City Council.",
    trafficNoiseLevel: "TBD — eastern end lot on Hartsmere Drive, adjacent to Princes Freeway (M1) reservation with noise mounds; inspect at various times to assess actual noise impact",
    flightPathFlag: false,
    futureInfrastructure: "TBD",
    floodZone: false,
    vendorMotivation: "TBD",
    vendorTimelineDays: "TBD",
    previousOffers: "TBD",
    daysOnMarket: "TBD",
    priceReductionHistory: "TBD",
    tenantInPlace: false,
    tenantLeaseEndDate: "N/A — vacant possession at settlement",
    vendorPreferredSettlement: "TBD",
    vendorFlexOnInclusions: "TBD",
    inclusions: "All fixtures and fittings as inspected (per COS particulars, 04/05/2026)",

    qa: [
      {
        question: "What is the land size and lot details?",
        answer: "621 sqm confirmed — Lot 323 on PS444491A, Vol 10668 Folio 952. Casey Council property no. 81625. Eastern end lot on Hartsmere Drive, Kingsmere Estate Stage 5A. 15.24m excavation depth limitation applies to all land in PS444491A.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square", "title"],
      },
      {
        question: "What covenants and restrictions affect this property?",
        answer: "Two registered encumbrances: (1) AB543185A — restrictive covenant (2002): single dwelling min 150sqm, brick/brick veneer construction, no re-subdivision, no shed over 4sqm, max 2 of any animal species. (2) P168642E — S173 agreement (1989) for entire Kingsmere Estate: noise attenuation mounds along M1 freeway reservation (obligation performed by developer c.2002); subdivision restricted to residential normal density zone (completed). Both run with land permanently.",
        category: "legal",
        keywords: ["covenant", "restriction", "s173", "encumbrance", "build", "subdivision", "material"],
      },
      {
        question: "Is there a mortgage on the property?",
        answer: "Yes — Bank Australia Ltd mortgage AZ356770W registered 08/07/2025. eCT held by Bank Australia Limited. Must be fully discharged at settlement before title transfers to purchaser.",
        category: "legal",
        keywords: ["mortgage", "loan", "bank", "discharge", "encumbrance", "title", "ect"],
      },
      {
        question: "What are the council rates?",
        answer: "$2,333.61 per year (FY2026): General Rates $1,644.86, Garbage Charge $423.00, ESVF Levy $265.75. Outstanding balance $0.00 as at Land Information Certificate 01/05/2026 — rates fully paid. Casey City Council, Certificate wCerR/C079208.",
        category: "financial",
        keywords: ["council", "rates", "annual", "levy", "garbage", "esvf", "casey", "lic"],
      },
      {
        question: "What are the water rates?",
        answer: "South East Water charges approximately $176.08 per quarter ($704 annualised): Parks Victoria $22.45, Melbourne Water $31.25, SEW Water Service $21.97, SEW Sewerage $100.41. Water usage charged separately at $1.80/day. Unpaid balance $126.08 as at 30/04/2026. No recycled water available in this area (confirmed SEW asset map 30/04/2026).",
        category: "financial",
        keywords: ["water", "rates", "south east water", "sewerage", "quarterly", "annual", "sew"],
      },
      {
        question: "What are the property valuations?",
        answer: "As at 01/07/2025: Site Value (SV) $570,000, Capital Improved Value (CIV) $750,000, Net Annual Value $37,500. Source: Casey Land Information Certificate wCerR/C079208.",
        category: "financial",
        keywords: ["valuation", "site value", "civ", "capital improved", "nav", "sv"],
      },
      {
        question: "What is the land tax situation?",
        answer: "Vendor (Daniella May Maloney) is exempt as Principal Place of Residence — $0 land tax (SRO cert 98949575, 30/04/2026). For an investor on a single holding with SV $570,000: approx $2,160/year ($1,350 + ($570K - $300K) x 0.3 cents). If vacant: $7,500/year (CIV $750,000 x 1%). No CIPT (AVPCC 110, residential, not qualifying). No Windfall Gains Tax.",
        category: "financial",
        keywords: ["land tax", "sro", "investor", "ppor", "exempt", "vacant", "wgt", "cipt"],
      },
      {
        question: "Who is the vendor and how long have they owned?",
        answer: "Vendor is Daniella May Maloney. Property originally purchased as vacant land by Gary Robert Maloney and Daniella May Maloney on 05/09/2002 for $76,000 (stamp duty $1,624) from Dalmont Bay Pty Ltd (Kingsmere Estate developer). Gary transferred his interest to Daniella on 28/06/2018 (AR184162X). Daniella has been sole proprietor for approx 8 years; Maloney family ownership totals approx 23 years.",
        category: "legal",
        keywords: ["vendor", "owner", "history", "purchased", "when", "price", "bought", "long"],
      },
      {
        question: "Is there a pool or spa?",
        answer: "TBD — Special Condition 12 (Swimming Pool/Spa) is included in the Contract of Sale. This clause is typically included when a pool or spa exists. The original SLM placeholder had pool: false but this appears unverified. Confirm at inspection and check pool/spa registration with Casey Council.",
        category: "physical",
        keywords: ["pool", "spa", "swimming", "water", "feature", "recreation"],
      },
      {
        question: "Are there any easements?",
        answer: "Yes — multiple from PS444491A: E-1 Sewerage (Melbourne Water Corp and South East Water), E-2 Drainage and Sewerage (Casey City Council and SEW — runs along rear boundary of Lot 323), E-3 Drainage and Sewerage (created by PS444491A), E-4 Powerline (TXU Networks under Electricity Industry Act 2000). Do not build within easements or within 1m of SEW assets without prior approval.",
        category: "legal",
        keywords: ["easement", "sewer", "drainage", "powerline", "restriction", "build", "easements"],
      },
      {
        question: "What is the S173 agreement on this property?",
        answer: "P168642E (1989) is a Section 173 Planning and Environment Act agreement running with all land in Kingsmere Estate. The original developer (Hooker Corporation Ltd) was required to: (1) construct noise attenuation mounds along the Princes Freeway (M1) reservation; (2) develop only as Berwick Residential Normal Density Zone. The mound construction obligation was almost certainly completed at estate development c.2002. Agreement remains registered on title as historic encumbrance with minimal ongoing practical obligation for current owners.",
        category: "legal",
        keywords: ["s173", "agreement", "freeway", "noise", "mound", "kingsmere", "planning", "encumbrance"],
      },
      {
        question: "How close is the property to the Princes Freeway and what is the noise impact?",
        answer: "Lot 323 is at the eastern end of Hartsmere Drive and is positioned close to the Princes Freeway (M1) reservation. Noise attenuation mounds were specifically required and constructed along this boundary as part of Kingsmere Estate development per S173 Agreement P168642E. Actual noise impact is TBD — physical inspection at various times of day recommended. SEW certificate confirms no flood risk.",
        category: "location",
        keywords: ["freeway", "princes", "m1", "noise", "highway", "proximity", "motorway", "mound"],
      },
      {
        question: "Is the property in a flood zone?",
        answer: "No. South East Water (30/04/2026) confirms this property is not subject to flooding from Melbourne Water's drainage system based on a 1% annual probability flood level.",
        category: "planning",
        keywords: ["flood", "flooding", "zone", "water", "drainage", "risk"],
      },
      {
        question: "Is the property in a bushfire prone area?",
        answer: "No. Vendor Statement section 3.3 confirms the land is NOT in a designated bushfire prone area under section 192A of the Building Act 1993.",
        category: "planning",
        keywords: ["bushfire", "fire", "prone", "bap", "hazard", "building act"],
      },
      {
        question: "What services are connected?",
        answer: "All five services confirmed connected: electricity, gas, water, sewerage, and telephone. No recycled water available in this area (confirmed SEW asset map 30/04/2026). Water usage charge $1.80/day.",
        category: "physical",
        keywords: ["services", "electricity", "gas", "water", "sewer", "telephone", "nbn", "connected", "recycled"],
      },
      {
        question: "Is there an owners corporation?",
        answer: "No owners corporation. Nothing in the S32 or title search identifies any OC applicable to Lot 323.",
        category: "legal",
        keywords: ["owners corporation", "oc", "body corporate", "strata", "fees"],
      },
      {
        question: "Is subdivision possible?",
        answer: "No. Restrictive covenant AB543185A expressly prohibits re-subdivision of Lot 323 by Plan of Subdivision, Strata Subdivision or Cluster Titles. At 621sqm this would also be unlikely to meet minimum lot size requirements.",
        category: "planning",
        keywords: ["subdivision", "subdivide", "split", "two lots", "potential"],
      },
      {
        question: "Is a granny flat or dual occupancy possible?",
        answer: "No. Covenant AB543185A limits Lot 323 to a single dwelling (minimum 150sqm floor area). A second independent dwelling would conflict with the covenant's single-dwelling intent and the no-re-subdivision clause. Enforcement rests with beneficiary parties (other lots in PS430239P/Kingsmere Estate).",
        category: "planning",
        keywords: ["granny flat", "dual occ", "second dwelling", "secondary", "build behind", "additional"],
      },
      {
        question: "What is the Section 32 status?",
        answer: "Vendor Statement signed by Daniella May Maloney on 04/05/2026. Purchaser not yet signed (PREVIEW state as at PDF date). Prepared by Premier Conveyancing Group Pty Ltd, Berwick. Ref AK:260313. Note: no planning certificate (s199) is attached to this S32 — zoning and overlays must be independently confirmed from Casey Planning Scheme.",
        category: "legal",
        keywords: ["s32", "section 32", "vendor statement", "signed", "ready", "status", "contract"],
      },
      {
        question: "Are there any outstanding rates at settlement?",
        answer: "Council rates outstanding balance $0.00 as at LIC 01/05/2026 (rates fully paid for FY2026). South East Water unpaid balance $126.08 as at 30/04/2026. Under s175(1) LGA 1989, any overdue council rates become the purchaser's liability on becoming owner — confirm current balance closer to settlement.",
        category: "financial",
        keywords: ["outstanding", "rates", "balance", "owe", "paid", "overdue", "settlement"],
      },
      {
        question: "Are there any VicRoads road acquisition proposals?",
        answer: "No proposals as at 30 April 2026. VicRoads Roads Property Certificate (# 80407172) confirms no approved proposals requiring any part of this property. Note: property is adjacent to the existing Princes Freeway (M1) reservation but the freeway is already established and does not affect Lot 323 title.",
        category: "planning",
        keywords: ["vicroads", "road", "acquisition", "proposal", "freeway", "reserve"],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 106 — 37 Manuka Road, Berwick (ACTIVE LISTING — S32 signed vendors 08/05/2026)
  // Title: Vol 8395 Folio 799 | Lot 11 LP57254 | Casey Council prop no. 21980
  // Vendors: Tenants in Common — Colin Thomas MacLean + Leanne Joy Hein (X922227Q 03/12/2001)
  // Mortgage AM576543T (Bendigo and Adelaide Bank) | Drainage easement (LP57254)
  // -------------------------------------------------------------------------
  106: {
    propertyId: 106,
    address: "37 Manuka Road",
    suburb: "Berwick VIC 3806",
    status: "active",

    // PHYSICAL
    beds: "TBD",
    baths: "TBD",
    cars: "TBD",
    landSqm: 790,
    houseSqm: "TBD",
    yearBuilt: "TBD",
    propertyType: "House",
    frontageMetre: 19.23,
    depthMetre: 41.05,
    propertyShape: "Rectangular — 19.23m frontage x 41.05m depth (site dimensions plan, Ideal Conveyancing/Landchecker, 07/05/2026). West-facing onto Manuka Road. Standard in-line lot (not a corner lot). Drainage easement runs along north boundary per LP57254 and DELWP easements map. Open land at 42-52 Manuka Road to the east (pending residential subdivision PA25-0524).",
    orientation: "West",
    pool: false,
    gardenSqm: "TBD",
    shed: "TBD",
    outdoorEntertaining: "TBD",
    alfrescoSqm: "TBD",
    roofType: "Tile",
    externalCladding: "Brick Veneer",
    construction: "Brick veneer, strip footings and stumps — 1960s-era construction. Timber floors throughout living areas, original timber-framed windows. Renovated wet areas (ensuite, bathroom, laundry) by owner-builder ~2023.",
    floorplanConfig: "TBD",

    // LEGAL & TITLE
    titleType: "Torrens — Vol 8395 Folio 799 (Lot 11 on Plan LP57254). Parent Title Vol 8305 Folio 331 (Crown Allotment). Created by instrument B480784, 21/02/1963 (Security no. 124134279578Q, produced 01/05/2026). Tenants in Common — equal 1/2 undivided shares: (1) Colin Thomas MacLean and (2) Leanne Joy Hein (X922227Q, registered 03/12/2001). eCT held by Bendigo and Adelaide Bank Ltd (03500L, safe custody effective 21/07/2017). Activity last 125 days: NIL.",
    easements: "Drainage easement — shown in blue on plan LP57254 (Plan of Subdivision lodged 20/12/1962, registered 21/02/1963): land coloured blue is appropriated for easements of Drainage per plan note and Shire of Berwick endorsement (16/06/1962). Runs along north boundary per DELWP easements map (Landchecker, 07/05/2026 — classified as 'Others'/DELWP). No separate title instrument number identified (easement derives from original LP57254 subdivision). South East Water Information Statement (54P//16289/15, 01/05/2026) shows no specific SEW encumbrances on title. Do not build over or within 1m of drainage easement without prior Council/SEW approval.",
    covenants: "None. No restrictive covenants or S173 Planning and Environment Act agreements registered on title. Title encumbrances limited to Mortgage AM576543T (Bendigo and Adelaide Bank) and the drainage easement on LP57254.",
    overlays: "None — confirmed by Property Report (Ideal Conveyancing/Landchecker, 07/05/2026): 'There are no overlays for this property.' No planning overlays under Casey Planning Scheme. Note: property IS in a Designated Bushfire Prone Area (Building Act 1993 s192A, confirmed S32 section 3.3 ☒ and DELWP BPA layer updated 09/03/2026) — this is a building regulation designation, NOT a planning overlay. The Bushfire Management Overlay (BMO) does not apply to this lot.",
    s32Status: "Signed by both vendors — Colin Thomas MacLean and Leanne Joy Hein, both dated 08/05/2026. Purchaser not yet signed. Prepared by Ideal Conveyancing, Suite 126, 445 Princes Highway, Officer VIC 3809 (Robyn Clarke, robyn@idealconveyancing.net.au; Ref 13910). Vendor GST Withholding Notice (07/05/2026) — GST withholding not required (residential, not new property). Designated Bushfire Prone Area (s3.3 ☒). All services connected except landline telephone. CIPT not applicable (AVPCC 110). No GAIC (Berwick established suburb). No road acquisition proposals (VicRoads cert # 80415470, 01/05/2026). No building permits in last 10 years (Casey Building Cert CerB/W037580, 04/05/2026). Owner builder s137B report included (ensuite/bathroom/laundry ~2023, No Permit Required, no structural defects). Bendigo and Adelaide Bank mortgage AM576543T must be discharged at settlement. No owners corporation.",
    encumbrances: "1. Mortgage AM576543T (22/02/2016) — Bendigo and Adelaide Bank Ltd — must be discharged at settlement; eCT held by Bendigo and Adelaide Bank Ltd (03500L, safe custody effective 21/07/2017). 2. Drainage easement — appropriated for Drainage purposes on plan LP57254 (1963); runs along north boundary per DELWP easements map; no separate instrument number.",
    ownerOccupied: true,
    zoning: "GRZ — General Residential Zone — Schedule 1 (Casey Planning Scheme)",
    rightOfWay: "None",
    sewerEasement: "No South East Water encumbrances on title (SEW Information Statement 54P//16289/15, 01/05/2026). Sewer main 225 UPVC runs along Manuka Road (SEW Sewer and Drainage asset map, Case 52056255, 01/05/2026). Drainage easement on LP57254 runs along north boundary (Council/DELWP) — distinct from any SEW sewer encumbrances. No SEW-specific restrictions on this lot's title.",
    contaminatedLand: false,
    buildingPermitsOutstanding: "No building permits issued in last 10 years (Casey Building Surveying Services certificate CerB/W037580, 04/05/2026). Property not subject to any notices or orders under Building Act 1993.",
    ownerBuilderWork: true,
    titlesOfficeReady: "TBD",
    section32CompletionDate: "08/05/2026",

    // FINANCIAL
    priceMin: "TBD",
    priceMax: "TBD",
    vendorReserve: "TBD",
    settlementTermsDays: "TBD",
    depositPct: 10,
    rentalAppraisalLow: "TBD",
    rentalAppraisalHigh: "TBD",
    grossYieldAtAsk: "TBD",
    councilRates: 2769,
    waterRates: 704,
    bodyCorporateFees: 0,
    stampDutyEstimate: "TBD",
    landTaxThreshold: "Vendors exempt as PPOR (Land Tax cert 98967167, 01/05/2026, SV $795,000 — Colin Thomas MacLean listed, LTX Principal Place of Residence). Investor (single ownership): $3,420 p.a. (SRO-calculated: $2,250 + ($795,000 - $600,000) x 0.600 cents). Vacant residential: $9,150 p.a. (CIV $915,000 x 1%). No CIPT (AVPCC 110, residential, not qualifying use — cert 98967167, 01/05/2026). No WGT (cert 98967167, 01/05/2026 — no windfall gains tax liability identified).",
    depreciationYear1Est: "TBD",
    capitalGainsHistory: "Colin Thomas MacLean and Leanne Joy Hein acquired as tenants in common (equal 1/2 undivided shares) on 03/12/2001 (X922227Q) — derived from parent title Vol 8305 Folio 331 (Crown Allotment originally registered 21/02/1963). Prior purchase price not disclosed in S32. CIV as at 01/07/2025: $915,000. SV: $795,000. NAV: $45,750. Both vendors listed at this address — PPOR since at least 2001 (24+ years); main residence CGT exemption likely applicable. At least one vendor holds a pensioner concession card (pensioner rebate of $316 applied to council rates).",

    // LOCATION & SUBURB
    primarySchool: "Berwick Primary School (1,443m)",
    primarySchoolRating: "TBD",
    secondarySchool: "Berwick Secondary College (335m)",
    secondarySchoolRating: "TBD",
    schoolZoneCatchment: "TBD",
    distanceToTrainKm: "TBD",
    trainLine: "TBD",
    distanceToFreewayKm: "TBD",
    distanceToShoppingKm: "TBD",
    nearestHospitalKm: "TBD",
    suburb5yrGrowthPct: "TBD",
    suburbMedianPrice: "TBD",
    daysOnMarketAvg: "TBD",
    clearanceRatePct: "TBD",
    comparableSales: "TBD",

    // FEATURES & CONDITION
    kitchenRenovated: "TBD",
    bathroomRenovated: "Yes — ensuite (Bedroom 1), main bathroom and laundry renovated by owner-builder ~2023. No building permit required. Frameless shower screens, floating vanities, modern tiled wet areas. Minor maintenance items noted in s137B inspection (02/05/2026): caulking to 3 joints in bathroom; minor wall cracks in ensuite (fill and paint).",
    flooringType: "Timber + tiles (confirmed: s137B inspection 02/05/2026 — Flooring: Timber, Tiles)",
    airConType: "TBD",
    heatingType: "TBD",
    solarKw: "TBD",
    batteryStorage: "TBD",
    evCharging: "TBD",
    nbnType: "TBD",
    waterTank: "TBD",
    alarmSystem: "TBD",
    smartHome: "TBD",
    disabilityAccess: "TBD",
    petsAllowed: "TBD",
    outdoorFeatures: "TBD",

    // PLANNING & VENDOR
    subdivisionPotential: "TBD",
    dualOccupancyPotential: "TBD",
    grannyFlatApproved: "TBD",
    extensionPotential: "TBD",
    councilDevelopmentHistory: "No planning permit data on file for 37 Manuka Road (Property Report, Ideal Conveyancing, 07/05/2026). Nearby approved: 39 Manuka Road — 3-lot subdivision approved (PA23-0562, 08/03/2024); 35 Manuka Road — 3-lot subdivision approved (SubA00340/21, 28/04/2022) and prior 3-lot (PA21-0715, 22/11/2021); 34 Manuka Road — 2-lot subdivision approved (SubA00182/20, 17/11/2020). Pending: 42-52 Manuka Road — multi-lot residential subdivision (PA25-0524, received 26/08/2025); 54-60 Manuka Road — restaurant and cafe use (PA25-0761).",
    neighbourhoodDescription: "TBD",
    trafficNoiseLevel: "TBD",
    flightPathFlag: "TBD",
    futureInfrastructure: "42-52 Manuka Road (open land directly adjacent to east): multi-lot residential subdivision pending (PA25-0524, received 26/08/2025) and vegetation removal permit (PA25-0329). C300case (proposed 23/04/2026): rezoning of nearby land from Farming Zone to GRZ1/Rural Conservation/Public Conservation zones. Monitor PA25-0524 outcome — approval could materially change density and outlook from the east boundary.",
    floodZone: false,
    vendorMotivation: "TBD",
    vendorTimelineDays: "TBD",
    previousOffers: "TBD",
    daysOnMarket: "TBD",
    priceReductionHistory: "TBD",
    tenantInPlace: false,
    tenantLeaseEndDate: "N/A — vacant possession at settlement",
    vendorPreferredSettlement: "TBD",
    vendorFlexOnInclusions: "TBD",
    inclusions: "All fixed floor coverings, light fittings, window furnishings and all fixtures and fittings of a permanent nature as inspected",

    qa: [
      {
        question: "Who are the vendors and what is the title structure?",
        answer: "Two vendors — Colin Thomas MacLean and Leanne Joy Hein — hold as Tenants in Common in equal 1/2 undivided shares (not joint tenants). Both must sign the Contract of Sale and transfer. Transaction X922227Q registered 03/12/2001 created the current tenancy in common arrangement. Both vendors are listed at 37 Manuka Road — PPOR. Title: Vol 8395 Folio 799, Lot 11 LP57254. eCT held by Bendigo and Adelaide Bank Ltd.",
        category: "legal",
        keywords: ["vendor", "vendors", "owner", "owners", "title", "tenants in common", "joint", "sign", "MacLean", "Hein"],
      },
      {
        question: "What encumbrances are registered on the title?",
        answer: "Two encumbrances only: (1) Mortgage AM576543T (22/02/2016) — Bendigo and Adelaide Bank Ltd — must be formally discharged at or before settlement; eCT held by Bendigo and Adelaide Bank (03500L, safe custody from 21/07/2017). (2) Drainage easement on LP57254 — appropriated for Drainage purposes on the original 1963 subdivision plan; runs along north boundary per DELWP easements map. No restrictive covenants, no S173 agreements, no caveats on title.",
        category: "legal",
        keywords: ["encumbrance", "mortgage", "charge", "caveat", "registered", "title", "Bendigo", "bank", "discharge"],
      },
      {
        question: "Are there any restrictive covenants or S173 agreements on this title?",
        answer: "No. No restrictive covenants or S173 Planning and Environment Act agreements are registered on this title. This is a clean title in this respect — materially different from some nearby properties. The only encumbrances are the Bendigo and Adelaide Bank mortgage (to be discharged at settlement) and the original LP57254 drainage easement.",
        category: "legal",
        keywords: ["covenant", "covenants", "s173", "restriction", "agreement", "dwelling", "limit", "single", "build"],
      },
      {
        question: "What is the drainage easement and does it affect building?",
        answer: "A drainage easement was created with the original 1962-63 LP57254 subdivision, appropriated for Drainage purposes per the Shire of Berwick. It runs along the north boundary per the DELWP easements map. South East Water shows no SEW-specific encumbrances in the water information statement. Do not build over or within 1m of this easement without prior approval from Casey Council and South East Water. Confirm exact location and width with a licensed surveyor before any building or extension works near the north boundary.",
        category: "legal",
        keywords: ["easement", "drainage", "build", "boundary", "restriction", "north", "LP57254"],
      },
      {
        question: "What owner builder works were done and what did the inspection find?",
        answer: "The vendors completed owner-builder alterations to the ensuite, main bathroom and laundry approximately 3 years ago (~2023). These works did not require a building permit (confirmed in s137B report and Casey building certificate). Owner Builder Inspection Report (s137B, Job BI 1087-1, Glenn Dornbusch IN-U 1140, 02/05/2026) found: no structural defects; overall condition Average; workmanship Average. Minor maintenance items only: (1) caulking required to 3 wall and timber beading joints in main bathroom; (2) minor wall cracks in 2 sections of ensuite — fill and paint required. Sub-floor area and waterproofing were inaccessible at inspection.",
        category: "physical",
        keywords: ["owner builder", "renovation", "bathroom", "ensuite", "laundry", "inspection", "defects", "works", "permit", "s137B"],
      },
      {
        question: "Is the property in a bushfire prone area and does the BMO apply?",
        answer: "Yes — the property is in a Designated Bushfire Prone Area (BPA) under s192A of the Building Act 1993 (confirmed S32 section 3.3 ☒ and DELWP BPA layer updated 09/03/2026). Any new building works requiring a permit must comply with BAL (Bushfire Attack Level) construction standards — obtain a BAL assessment before planning any significant additions or extensions. However, the Bushfire Management Overlay (BMO) planning overlay does NOT apply to this specific lot (BMO is Unaffected per Landchecker, 09/03/2026). The BPA is a building regulation designation, not a planning overlay.",
        category: "planning",
        keywords: ["bushfire", "BPA", "BAL", "fire", "prone", "overlay", "BMO", "bushfire prone area", "construction standard"],
      },
      {
        question: "What is the zoning and are there any planning overlays?",
        answer: "GRZ — General Residential Zone — Schedule 1 (Casey Planning Scheme). No planning overlays apply to this property (Property Report: 'There are no overlays for this property'). GRZ1 encourages housing diversity and growth in locations with good access to services and transport, and permits single dwellings, dual occupancy, and residential uses. Nearby overlays (SLO, BMO, HO, DPO) do NOT affect this lot.",
        category: "planning",
        keywords: ["zone", "zoning", "GRZ", "overlay", "overlays", "planning", "residential", "general residential", "GRZ1"],
      },
      {
        question: "What is the subdivision potential of this property?",
        answer: "Strong potential — TBD for formal assessment. Positive indicators: GRZ1 zone, 790 sqm, 19.23m frontage, rectangular lot, no planning overlays, no restrictive covenant. Precedent on Manuka Road is strong: 39 Manuka Rd — 3-lot approved 2024; 35 Manuka Rd — 3-lot approved 2021-22; 34 Manuka Rd — 2-lot approved 2020. Aboriginal Cultural Heritage Sensitivity applies in the vicinity — a CHMP may be required for significant ground disturbance. Recommend a formal town planner assessment and pre-application meeting with Casey Council.",
        category: "planning",
        keywords: ["subdivision", "subdivide", "potential", "develop", "development", "lots", "split", "GRZ", "2-lot", "3-lot"],
      },
      {
        question: "Is there granny flat or dual occupancy potential?",
        answer: "TBD — requires formal planning assessment. No title-level restrictions prevent secondary dwellings (no restrictive covenant — unlike 34 Hartsmere which has Covenant AB543185A limiting to single dwelling). GRZ1, 790 sqm and no overlays are positive indicators for granny flat (Dependent Persons Unit) and dual occupancy potential. VC304 (22/03/2026) extended temporary DPU provisions. Recommend assessment by a Casey-experienced town planner.",
        category: "planning",
        keywords: ["granny flat", "DPU", "dual occupancy", "second dwelling", "secondary", "dependent persons unit"],
      },
      {
        question: "What is the land tax position for an investor?",
        answer: "Vendors exempt: PPOR (Land Tax cert 98967167, 01/05/2026, SV $795,000 — Colin Thomas MacLean, LTX Principal Place of Residence). Investor single ownership: $3,420 p.a. (SRO-calculated: $2,250 + ($795,000 - $600,000) x 0.600 cents). If purchased as tenants in common (50/50), each co-owner assessed on $397,500: each approximately $1,643 p.a. ($1,350 + $97,500 x 0.300%). Vacant residential land tax: $9,150 p.a. (CIV $915,000 x 1%). No CIPT (AVPCC 110). No WGT.",
        category: "financial",
        keywords: ["land tax", "investor", "tax", "PPOR", "exempt", "annual", "holding cost", "CIPT", "WGT", "$3,420"],
      },
      {
        question: "What are the council rates and does a pensioner rebate apply?",
        answer: "Annual council rates FY2026: $2,769.03 (General Rates $2,006.73 + Garbage Charge $468.00 + ESVF Levy $294.30). The current owners receive a pensioner rebate of $316.00 — this is personal to them as concession card holders and does NOT transfer to a new owner. A purchaser without pensioner status pays the full $2,769.03. Balance outstanding as at LIC (04/05/2026): $301.25 — adjustable at settlement. Council property number: 21980. CIV: $915,000, SV: $795,000.",
        category: "financial",
        keywords: ["council rates", "rates", "pensioner", "rebate", "discount", "balance", "outstanding", "$2,769", "FY2026"],
      },
      {
        question: "Is there a pool or spa on the property?",
        answer: "No — no evidence of a pool or spa. There is no SC12 (Swimming Pool/Spa Special Condition) in the COS (unlike 34 Hartsmere Drive which included SC12). No building permit for pool construction in last 10 years. No pool or spa mentioned in the owner builder inspection report. The Casey building certificate pool note is standard boilerplate included on all Casey certificates. Confirm at inspection.",
        category: "features",
        keywords: ["pool", "spa", "swimming pool", "pool fence", "SC12"],
      },
      {
        question: "What services are connected to the property?",
        answer: "Electricity, gas, water and sewerage all connected (S32 section 8 — boxes unmarked = connected). Telephone landline NOT connected (box marked ☒ — no practical impact given NBN availability). No recycled water main available (recycled water asset map shows no service). South East Water services the property — 100 UPVC-CL12 water main from 19/05/1983 runs along Manuka Road; 225 UPVC sewer main runs along Manuka Road.",
        category: "physical",
        keywords: ["services", "gas", "electricity", "water", "sewerage", "NBN", "telephone", "internet", "recycled water", "connected"],
      },
      {
        question: "Is the property subject to flooding?",
        answer: "No. Melbourne Water confirms property not subject to flooding based on a 1-in-100-year flood probability (SEW Information Statement 01/05/2026). All DELWP flood designations (FO, FO1, FO2, FO3) and all storm/inundation overlays (LSIO, RFO, SBO, UFZ etc.) are Unaffected (Landchecker flood report, updated 23/02/2026). No Flood Overlay or Land Subject to Inundation Overlay (LSIO) applies.",
        category: "planning",
        keywords: ["flood", "flooding", "inundation", "LSIO", "Melbourne Water", "water risk", "1-in-100"],
      },
      {
        question: "Is there Aboriginal cultural heritage sensitivity?",
        answer: "Yes. Property Report (07/05/2026) confirms the property is within, or in the vicinity of, one or more areas of Aboriginal cultural heritage sensitivity. For development activities involving significant ground disturbance (excavation, foundations, major earthworks), a Cultural Heritage Management Plan (CHMP) may be required under the Aboriginal Heritage Act 2006. Confirm requirements with Casey Council and the relevant Registered Aboriginal Party before commencing any significant ground disturbing works.",
        category: "planning",
        keywords: ["cultural heritage", "aboriginal", "CHMP", "indigenous", "heritage sensitivity", "ground disturbance", "heritage"],
      },
      {
        question: "What is the nearby development activity?",
        answer: "Active subdivision pressure on Manuka Road: 39 Manuka Rd — 3-lot approved 2024 (PA23-0562); 35 Manuka Rd — 3-lot approved 2021-22; 34 Manuka Rd — 2-lot approved 2020. 42-52 Manuka Road (open land to the east — currently adjacent): multi-lot residential subdivision PENDING (PA25-0524, received 26/08/2025). If approved, this will materially change the outlook to the east and increase neighbourhood density. 54-60 Manuka Road: restaurant and cafe use pending (PA25-0761).",
        category: "planning",
        keywords: ["development", "nearby", "subdivision", "42-52", "Manuka", "planning permit", "outlook", "density"],
      },
      {
        question: "What is the Section 32 status?",
        answer: "Vendor Statement signed by both vendors (Colin Thomas MacLean and Leanne Joy Hein) on 08/05/2026. Purchaser not yet signed. Prepared by Ideal Conveyancing (Robyn Clarke, Ref 13910). Planning certificate (s199) is included via the Property Report (Landchecker/Ideal Conveyancing, 07/05/2026) — confirms GRZ1, no overlays. Owner builder s137B report (02/05/2026) included. All required certificates present: Land Tax, CIPT, WGT, VicRoads, Casey Building Cert, Land Information Certificate, SEW Information Statement.",
        category: "legal",
        keywords: ["s32", "section 32", "vendor statement", "signed", "ready", "status", "contract", "settlement", "complete"],
      },
      {
        question: "Are there any outstanding rates balances at settlement?",
        answer: "Council rates balance outstanding: $301.25 as at LIC date (04/05/2026) — adjustable at settlement under s175(1) Local Government Act 1989. South East Water total unpaid balance: $176.08 as at 01/05/2026 (full Apr-Jun 2026 quarter service charges). Both amounts are adjustable at settlement. Confirm balances closer to settlement date as interest accrues.",
        category: "financial",
        keywords: ["outstanding", "rates", "balance", "owe", "paid", "settlement", "adjustable", "council", "water"],
      },
      {
        question: "Are there any VicRoads road acquisition proposals?",
        answer: "No proposals. VicRoads Roads Property Certificate (# 80415470, issued 01/05/2026): 'NO PROPOSALS — as at 1 May 2026, VicRoads has no approved proposals requiring any part of the property.' No road widening or acquisition affecting this property.",
        category: "planning",
        keywords: ["vicroads", "road", "acquisition", "proposal", "widening", "reserve", "roads"],
      },
      {
        question: "What are the key physical features and construction of the house?",
        answer: "1960s-era construction: brick veneer external walls, tiled roof, original timber floors throughout living areas, timber-framed windows, strip footings and stumps (sub-floor structure — sub-floor inaccessible at s137B inspection). Owner-builder renovation ~2023 covered ensuite, main bathroom and laundry — modern frameless shower screens, floating vanities, tiled wet areas. Inspection photos (s137B, 02/05/2026) show open-plan living/kitchen with sliding door to rear garden and original timber floors. Overall condition: Average.",
        category: "physical",
        keywords: ["construction", "brick veneer", "timber floors", "features", "1960s", "stumps", "roof", "tile", "sub-floor", "renovation"],
      },
      {
        question: "When was the property acquired and what is the ownership history?",
        answer: "Colin Thomas MacLean and Leanne Joy Hein acquired as tenants in common (1/2 share each) on 03/12/2001 (X922227Q). Property derives from parent title Vol 8305 Folio 331 — a Crown Allotment first subdivided by LP57254 in 1962-63. Both vendors have lived at this address since acquisition — PPOR for 24+ years as at 2026. At least one vendor holds a pensioner concession card (pensioner rebate of $316 applied to council rates). Prior purchase price not disclosed in the S32.",
        category: "financial",
        keywords: ["ownership", "history", "acquired", "purchase", "when", "how long", "held", "pensioner", "CGT", "main residence", "PPOR"],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 201 — 17 Grand Arch Way, Berwick (ACTIVE $1.1M-$1.25M)
  // -------------------------------------------------------------------------
  201: {
    propertyId: 201,
    address: "17 Grand Arch Way",
    suburb: "Berwick VIC 3806",
    status: "active",

    // PHYSICAL
    beds: 4,
    baths: 2,
    cars: 2,
    landSqm: 680,
    houseSqm: 290,
    yearBuilt: 2006,
    propertyType: "House",
    frontageMetre: 18,
    depthMetre: 37,
    propertyShape: "Rectangular",
    orientation: "North-facing rear garden",
    pool: false,
    gardenSqm: 260,
    shed: false,
    outdoorEntertaining: true,
    alfrescoSqm: 28,
    roofType: "Concrete tile",
    externalCladding: "Brick veneer with feature stone",
    construction: "Brick veneer, prestige Grand Arch estate build",
    floorplanConfig: "4 bed, 2 bath, master ensuite, theatre room, entertainers kitchen, formal and casual living, double garage",

    // LEGAL & TITLE
    titleType: "Torrens Title",
    easements: "TBD",
    covenants: "Grand Arch estate covenant: single dwelling, quality materials, no caravan storage",
    overlays: "No planning overlays",
    s32Status: "Section 32 in preparation",
    encumbrances: "TBD",
    ownerOccupied: true,
    zoning: "Neighbourhood Residential Zone (NRZ1)",
    rightOfWay: "None",
    sewerEasement: "TBD",
    contaminatedLand: false,
    buildingPermitsOutstanding: "TBD",
    ownerBuilderWork: false,
    titlesOfficeReady: false,
    section32CompletionDate: "TBD",

    // FINANCIAL
    priceMin: 1100000,
    priceMax: 1250000,
    vendorReserve: "TBD",
    settlementTermsDays: 60,
    depositPct: 10,
    rentalAppraisalLow: 540,
    rentalAppraisalHigh: 600,
    grossYieldAtAsk: 2.50,
    councilRates: 2000,
    waterRates: 910,
    bodyCorporateFees: 0,
    stampDutyEstimate: 66000,
    landTaxThreshold: "Above threshold for investors",
    depreciationYear1Est: 10500,
    capitalGainsHistory: "TBD",

    // LOCATION & SUBURB
    primarySchool: "Berwick Primary School",
    primarySchoolRating: "Above average (MySchool rating 7/10)",
    secondarySchool: "Berwick Secondary College",
    secondarySchoolRating: "7.5/10 (MySchool)",
    schoolZoneCatchment: "Berwick Primary School, Berwick Secondary College. Walking distance to Berwick Grammar.",
    distanceToTrainKm: 0.9,
    trainLine: "Pakenham Line, Berwick Station",
    distanceToFreewayKm: 3.8,
    distanceToShoppingKm: 1.6,
    nearestHospitalKm: 4.0,
    suburb5yrGrowthPct: 28,
    suburbMedianPrice: 920000,
    daysOnMarketAvg: 32,
    clearanceRatePct: 74,
    comparableSales: [
      { address: "8 Grand Arch Way, Berwick", price: 1210000, date: "Feb 2026", beds: 4 },
      { address: "5 Ascot Rise, Berwick", price: 1300000, date: "Apr 2026", beds: 4 },
      { address: "12 Ascot Rise, Berwick", price: 1270000, date: "Jan 2026", beds: 4 },
    ],

    // FEATURES & CONDITION
    kitchenRenovated: "Entertainers kitchen with stone benchtops, 900mm oven, walk-in pantry, island bench",
    bathroomRenovated: "Master ensuite fully renovated 2023, main bathroom updated 2021",
    flooringType: "Engineered timber in living areas, plush carpet in bedrooms",
    airConType: "Ducted refrigerated cooling (Daikin)",
    heatingType: "Ducted gas heating",
    solarKw: 6.6,
    batteryStorage: false,
    evCharging: false,
    nbnType: "NBN FTTP (Fibre to the Premises)",
    waterTank: true,
    alarmSystem: true,
    smartHome: true,
    disabilityAccess: false,
    petsAllowed: true,
    outdoorFeatures: "Alfresco 28sqm, north-facing rear garden, established gardens, feature lighting",

    // PLANNING & VENDOR
    subdivisionPotential: false,
    dualOccupancyPotential: false,
    grannyFlatApproved: false,
    extensionPotential: "Room for pool addition in north-facing rear garden, subject to council approval",
    councilDevelopmentHistory: "Ensuite reno permit 2023, no outstanding permits",
    neighbourhoodDescription: "Premium Grand Arch estate, one of Berwick's most sought-after addresses. Tree-lined boulevard, executive homes throughout.",
    trafficNoiseLevel: "Low, quiet residential street within estate",
    flightPathFlag: false,
    futureInfrastructure: "Berwick Station precinct upgrade in planning stages",
    floodZone: false,
    vendorMotivation: "TBD",
    vendorTimelineDays: 60,
    previousOffers: false,
    daysOnMarket: 0,
    priceReductionHistory: "No reductions, new listing",
    tenantInPlace: false,
    tenantLeaseEndDate: "N/A",
    vendorPreferredSettlement: "60 days preferred",
    vendorFlexOnInclusions: "TBD",
    inclusions: "All light fittings, window coverings, dishwasher, outdoor feature lighting, water tank, alarm, smart home hub",

    qa: [
      {
        question: "What is the land size?",
        answer: "680 square metres, a well-proportioned block in the premium Grand Arch estate.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square"],
      },
      {
        question: "What is the house size?",
        answer: "Approximately 290 square metres of living space comprising 4 bedrooms, theatre room, entertainers kitchen, and formal and casual living areas.",
        category: "physical",
        keywords: ["house", "size", "area", "internal", "sqm", "living", "floor"],
      },
      {
        question: "Does it have a theatre room?",
        answer: "Yes. A dedicated theatre room is included in the floorplan.",
        category: "physical",
        keywords: ["theatre", "media", "room", "cinema", "entertainment", "floorplan"],
      },
      {
        question: "Is there outdoor entertaining?",
        answer: "Yes. A 28 square metre alfresco area opens to a north-facing rear garden with established gardens and feature lighting.",
        category: "physical",
        keywords: ["outdoor", "alfresco", "entertaining", "deck", "garden", "feature"],
      },
      {
        question: "What is the price range?",
        answer: "The property is listed with a price range of $1,100,000 to $1,250,000.",
        category: "financial",
        keywords: ["price", "range", "asking", "listed", "cost", "how much", "budget"],
      },
      {
        question: "What school zone is this property in?",
        answer: "Zoned for Berwick Primary School and Berwick Secondary College, and is within walking distance of Berwick Grammar.",
        category: "location",
        keywords: ["school", "zone", "catchment", "berwick", "grammar", "primary", "secondary"],
      },
      {
        question: "How far is the train station?",
        answer: "Berwick Station on the Pakenham Line is approximately 900 metres away, a comfortable walk.",
        category: "location",
        keywords: ["train", "station", "commute", "walk", "transport", "pakenham"],
      },
      {
        question: "How far is the freeway?",
        answer: "The Princes Freeway M1 is approximately 3.8km from Grand Arch Way.",
        category: "location",
        keywords: ["freeway", "m1", "princes", "highway", "motorway", "distance"],
      },
      {
        question: "How far to shopping?",
        answer: "Eden Rise with Coles is about 1.6km. Fountain Gate Westfield is approximately 8km.",
        category: "location",
        keywords: ["shopping", "shops", "eden rise", "coles", "westfield", "supermarket"],
      },
      {
        question: "How far is Casey Hospital?",
        answer: "Casey Hospital is approximately 4km from the property.",
        category: "location",
        keywords: ["hospital", "casey", "medical", "health", "emergency", "distance"],
      },
      {
        question: "What is the kitchen like?",
        answer: "An entertainers kitchen with stone benchtops, a 900mm oven, walk-in pantry, and island bench.",
        category: "features",
        keywords: ["kitchen", "bench", "appliance", "island", "pantry", "stone", "oven", "entertainers"],
      },
      {
        question: "What air conditioning is installed?",
        answer: "Ducted refrigerated cooling (Daikin) and ducted gas heating.",
        category: "features",
        keywords: ["air con", "ducted", "cooling", "heating", "daikin", "refrigerated", "climate"],
      },
      {
        question: "Is there solar?",
        answer: "Yes. A 6.6kW solar system is installed.",
        category: "features",
        keywords: ["solar", "panels", "energy", "electricity", "kw", "power"],
      },
      {
        question: "Is there a smart home system?",
        answer: "Yes. The property has a smart home hub for lighting and security control.",
        category: "features",
        keywords: ["smart home", "automation", "hub", "lighting", "control", "tech"],
      },
      {
        question: "What is the NBN connection?",
        answer: "NBN FTTP (Fibre to the Premises), the fastest residential NBN technology.",
        category: "features",
        keywords: ["nbn", "internet", "fibre", "fttp", "broadband", "connection"],
      },
      {
        question: "What is the rental appraisal?",
        answer: "A property of this calibre in Grand Arch would rent for approximately $540 to $600 per week.",
        category: "financial",
        keywords: ["rent", "rental", "appraisal", "yield", "investment", "income", "per week"],
      },
      {
        question: "What are the council rates?",
        answer: "Approximately $2,000 per year with Casey Council.",
        category: "financial",
        keywords: ["council", "rates", "annual", "per year", "fees"],
      },
      {
        question: "What stamp duty applies?",
        answer: "At the midpoint of $1.175M, stamp duty for an owner-occupier in Victoria is approximately $66,000.",
        category: "financial",
        keywords: ["stamp duty", "duty", "transfer", "government", "cost"],
      },
      {
        question: "Is there pool potential?",
        answer: "Yes. The north-facing rear garden has room for a pool subject to Casey Council approval.",
        category: "planning",
        keywords: ["pool", "swimming", "spa", "potential", "add", "rear"],
      },
      {
        question: "What is the vacancy rate in the suburb?",
        answer: "Berwick vacancy is running below 1.5%, well under the Melbourne metro average. Strong tenant demand driven by school catchments, train access, and family-friendly amenity.",
        category: "financial",
        keywords: ["vacancy", "vacant", "tenant", "demand", "rental", "market", "suburb"],
      },
      {
        question: "What are the comparable sales in the last 90 days?",
        answer: "3 sales in Grand Arch Way and surrounding courts in the last 90 days, ranging $940K to $1.27M. Average 28 days on market. The most recent was 8 Grand Arch Way at $1.21M in February 2026.",
        category: "financial",
        keywords: ["comparable", "comps", "sales", "sold", "recent", "90 days", "similar", "comparables"],
      },
      {
        question: "Is there subdivision potential?",
        answer: "No. The Grand Arch estate covenant restricts single dwelling only.",
        category: "planning",
        keywords: ["subdivision", "subdivide", "sub", "second dwelling", "split"],
      },
      {
        question: "What is the neighbourhood like?",
        answer: "Premium Grand Arch estate, one of Berwick's most sought-after addresses. Tree-lined boulevard with executive homes throughout.",
        category: "planning",
        keywords: ["neighbourhood", "estate", "grand arch", "street", "suburb", "prestige"],
      },
      {
        question: "What inclusions are provided?",
        answer: "All light fittings, window coverings, dishwasher, outdoor feature lighting, water tank, alarm, and smart home hub.",
        category: "legal",
        keywords: ["inclusions", "included", "dishwasher", "alarm", "smart", "water tank"],
      },
      {
        question: "Is the Section 32 ready?",
        answer: "The Section 32 is currently in preparation. Confirm the expected completion date with the agent.",
        category: "legal",
        keywords: ["s32", "section 32", "contract", "vendor statement", "ready"],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 202 — 12 Broadway Street, Berwick (ACTIVE $820K-$920K)
  // -------------------------------------------------------------------------
  202: {
    propertyId: 202,
    address: "12 Broadway Street",
    suburb: "Berwick VIC 3806",
    status: "active",

    // PHYSICAL
    beds: 4,
    baths: 2,
    cars: 2,
    landSqm: 601,
    houseSqm: 230,
    yearBuilt: 2010,
    propertyType: "House",
    frontageMetre: 15,
    depthMetre: 40,
    propertyShape: "Rectangular",
    orientation: "West-facing front, private rear garden",
    pool: false,
    gardenSqm: 210,
    shed: false,
    outdoorEntertaining: true,
    alfrescoSqm: 16,
    roofType: "Colorbond",
    externalCladding: "Brick veneer",
    construction: "Brick veneer, double garage",
    floorplanConfig: "4 bed, 2 bath, open plan living and dining, separate lounge, private rear garden, double garage",

    // LEGAL & TITLE
    titleType: "Torrens Title",
    easements: "TBD",
    covenants: "TBD",
    overlays: "No planning overlays",
    s32Status: "TBD",
    encumbrances: "TBD",
    ownerOccupied: true,
    zoning: "General Residential Zone (GRZ1)",
    rightOfWay: "None",
    sewerEasement: "TBD",
    contaminatedLand: false,
    buildingPermitsOutstanding: "TBD",
    ownerBuilderWork: false,
    titlesOfficeReady: false,
    section32CompletionDate: "TBD",

    // FINANCIAL
    priceMin: 820000,
    priceMax: 920000,
    vendorReserve: "TBD",
    settlementTermsDays: 45,
    depositPct: 10,
    rentalAppraisalLow: 490,
    rentalAppraisalHigh: 530,
    grossYieldAtAsk: 3.02,
    councilRates: 1800,
    waterRates: 900,
    bodyCorporateFees: 0,
    stampDutyEstimate: 46700,
    landTaxThreshold: "Above threshold for investors",
    depreciationYear1Est: 8000,
    capitalGainsHistory: "TBD",

    // LOCATION & SUBURB
    primarySchool: "Berwick Primary School",
    primarySchoolRating: "Above average (MySchool rating 7/10)",
    secondarySchool: "Berwick Secondary College",
    secondarySchoolRating: "7.5/10 (MySchool)",
    schoolZoneCatchment: "Berwick Primary School, Berwick Secondary College",
    distanceToTrainKm: 0.7,
    trainLine: "Pakenham Line, Berwick Station",
    distanceToFreewayKm: 3.5,
    distanceToShoppingKm: 1.4,
    nearestHospitalKm: 4.1,
    suburb5yrGrowthPct: 28,
    suburbMedianPrice: 920000,
    daysOnMarketAvg: 32,
    clearanceRatePct: 74,
    comparableSales: [
      { address: "3 Thirlmere Court, Berwick", price: 941000, date: "May 2026", beds: 4 },
      { address: "47 Premier Drive, Berwick", price: 1005000, date: "Apr 2026", beds: 4 },
      { address: "22 Fairway Drive, Berwick", price: 890000, date: "Jan 2026", beds: 4 },
    ],

    // FEATURES & CONDITION
    kitchenRenovated: "Updated kitchen 2022, stone benchtops, stainless appliances",
    bathroomRenovated: "Both bathrooms updated 2022",
    flooringType: "Hybrid timber look flooring living areas, carpet bedrooms",
    airConType: "Ducted evaporative cooling",
    heatingType: "Ducted gas heating",
    solarKw: 3.0,
    batteryStorage: false,
    evCharging: false,
    nbnType: "NBN FTTN (Fibre to the Node)",
    waterTank: false,
    alarmSystem: false,
    smartHome: false,
    disabilityAccess: false,
    petsAllowed: true,
    outdoorFeatures: "Covered alfresco 16sqm, private rear garden, low-maintenance lawn",

    // PLANNING & VENDOR
    subdivisionPotential: false,
    dualOccupancyPotential: false,
    grannyFlatApproved: false,
    extensionPotential: "Potential to extend at rear within GRZ1 setbacks",
    councilDevelopmentHistory: "Kitchen and bathroom permit 2022, no outstanding permits",
    neighbourhoodDescription: "Quiet residential street close to Berwick Station and Berwick Village. Family-friendly neighbourhood with good walkability.",
    trafficNoiseLevel: "Low to moderate, Broadway Street is a residential street with some through traffic to station",
    flightPathFlag: false,
    futureInfrastructure: "Berwick Station precinct upgrade in planning",
    floodZone: false,
    vendorMotivation: "TBD",
    vendorTimelineDays: 45,
    previousOffers: false,
    daysOnMarket: 0,
    priceReductionHistory: "New listing, no reductions",
    tenantInPlace: false,
    tenantLeaseEndDate: "N/A",
    vendorPreferredSettlement: "45 days preferred",
    vendorFlexOnInclusions: "TBD",
    inclusions: "TBD",

    qa: [
      {
        question: "What is the land size?",
        answer: "601 square metres, a compact and manageable block close to Berwick Station.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square"],
      },
      {
        question: "What is the home size?",
        answer: "Approximately 230 square metres with 4 bedrooms, open plan living and dining, and a separate lounge.",
        category: "physical",
        keywords: ["house", "size", "area", "internal", "sqm", "living"],
      },
      {
        question: "Is there outdoor entertaining?",
        answer: "Yes. A covered alfresco of 16 square metres opens to a private rear garden.",
        category: "physical",
        keywords: ["outdoor", "alfresco", "entertaining", "private", "garden", "rear"],
      },
      {
        question: "What is the price range?",
        answer: "Listed at $820,000 to $920,000.",
        category: "financial",
        keywords: ["price", "range", "asking", "listed", "cost", "how much", "budget"],
      },
      {
        question: "What school zone is this in?",
        answer: "Zoned for Berwick Primary School and Berwick Secondary College.",
        category: "location",
        keywords: ["school", "zone", "catchment", "primary", "secondary", "berwick"],
      },
      {
        question: "How close is the train station?",
        answer: "Berwick Station on the Pakenham Line is approximately 700 metres, a very easy walk.",
        category: "location",
        keywords: ["train", "station", "walk", "commute", "transport", "pakenham", "distance"],
      },
      {
        question: "How far is shopping?",
        answer: "Eden Rise with Coles is approximately 1.4km. Berwick Village shops are also close.",
        category: "location",
        keywords: ["shopping", "shops", "eden rise", "village", "coles", "supermarket"],
      },
      {
        question: "Has the kitchen been updated?",
        answer: "Yes. The kitchen was updated in 2022 with stone benchtops and stainless steel appliances.",
        category: "features",
        keywords: ["kitchen", "bench", "appliance", "renovated", "stone", "updated"],
      },
      {
        question: "Have the bathrooms been renovated?",
        answer: "Yes. Both bathrooms were updated in 2022.",
        category: "features",
        keywords: ["bathroom", "ensuite", "renovated", "updated", "bath"],
      },
      {
        question: "What type of air conditioning is there?",
        answer: "Ducted evaporative cooling and ducted gas heating.",
        category: "features",
        keywords: ["air con", "ducted", "cooling", "evaporative", "heating", "climate"],
      },
      {
        question: "Is there solar power?",
        answer: "Yes. A 3kW solar system is installed.",
        category: "features",
        keywords: ["solar", "panels", "energy", "electricity", "kw", "power"],
      },
      {
        question: "What is the rental appraisal?",
        answer: "A 4-bedroom home in this location would rent for approximately $490 to $530 per week.",
        category: "financial",
        keywords: ["rent", "rental", "appraisal", "yield", "investment", "income", "per week"],
      },
      {
        question: "What is the gross yield?",
        answer: "At the midpoint of $870K and $510 per week rental, the gross yield is approximately 3.0%, which is competitive for Berwick.",
        category: "financial",
        keywords: ["yield", "gross", "return", "investment", "income"],
      },
      {
        question: "What are the council rates?",
        answer: "Approximately $1,800 per year with Casey Council.",
        category: "financial",
        keywords: ["council", "rates", "annual", "per year", "fees"],
      },
      {
        question: "What stamp duty applies?",
        answer: "At the midpoint of $870K, stamp duty for an owner-occupier is approximately $46,700.",
        category: "financial",
        keywords: ["stamp duty", "duty", "transfer", "government", "cost"],
      },
      {
        question: "What is the zoning?",
        answer: "General Residential Zone GRZ1, which allows greater development flexibility than NRZ.",
        category: "legal",
        keywords: ["zone", "zoning", "planning", "grz", "residential"],
      },
      {
        question: "Are there easements or covenants?",
        answer: "Easement and covenant details are TBD. Confirm with the agent before making an offer.",
        category: "legal",
        keywords: ["easement", "covenant", "restriction", "title", "legal"],
      },
      {
        question: "Is the Section 32 ready?",
        answer: "Section 32 status is TBD. Ask the agent for the expected issue date.",
        category: "legal",
        keywords: ["s32", "section 32", "contract", "vendor statement", "ready"],
      },
      {
        question: "Is there subdivision potential?",
        answer: "No. The 601sqm lot and GRZ1 setbacks do not support subdivision in this precinct.",
        category: "planning",
        keywords: ["subdivision", "subdivide", "sub", "second dwelling", "split"],
      },
      {
        question: "What are the inclusions?",
        answer: "Inclusions are TBD. Confirm with the agent at inspection.",
        category: "legal",
        keywords: ["inclusions", "included", "dishwasher", "blind", "curtain", "fittings"],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 203 — 5 Ashfield Drive, Berwick (ACTIVE $1.35M-$1.49M)
  // -------------------------------------------------------------------------
  203: {
    propertyId: 203,
    address: "5 Ashfield Drive",
    suburb: "Berwick VIC 3806",
    status: "active",

    // PHYSICAL
    beds: 5,
    baths: 3,
    cars: 2,
    landSqm: 820,
    houseSqm: 380,
    yearBuilt: 2005,
    propertyType: "House",
    frontageMetre: 22,
    depthMetre: 37,
    propertyShape: "Rectangular",
    orientation: "North-facing rear with pool",
    pool: true,
    gardenSqm: 280,
    shed: false,
    outdoorEntertaining: true,
    alfrescoSqm: 45,
    roofType: "Concrete tile",
    externalCladding: "Double brick with rendered feature panels",
    construction: "Double brick prestige construction",
    floorplanConfig: "5 bed, 3 bath, master ensuite, home theatre, formal lounge, open plan family and meals, alfresco, pool, double garage",

    // LEGAL & TITLE
    titleType: "Torrens Title",
    easements: "TBD",
    covenants: "TBD",
    overlays: "No planning overlays",
    s32Status: "Section 32 in preparation",
    encumbrances: "TBD",
    ownerOccupied: true,
    zoning: "Neighbourhood Residential Zone (NRZ1)",
    rightOfWay: "None",
    sewerEasement: "TBD",
    contaminatedLand: false,
    buildingPermitsOutstanding: "TBD",
    ownerBuilderWork: false,
    titlesOfficeReady: false,
    section32CompletionDate: "TBD",

    // FINANCIAL
    priceMin: 1350000,
    priceMax: 1490000,
    vendorReserve: "TBD",
    settlementTermsDays: 90,
    depositPct: 10,
    rentalAppraisalLow: 650,
    rentalAppraisalHigh: 720,
    grossYieldAtAsk: 2.62,
    councilRates: 2200,
    waterRates: 950,
    bodyCorporateFees: 0,
    stampDutyEstimate: 82650,
    landTaxThreshold: "Above threshold for investors",
    depreciationYear1Est: 15000,
    capitalGainsHistory: "TBD",

    // LOCATION & SUBURB
    primarySchool: "Berwick Primary School",
    primarySchoolRating: "Above average (MySchool rating 7/10)",
    secondarySchool: "Berwick Secondary College",
    secondarySchoolRating: "7.5/10 (MySchool)",
    schoolZoneCatchment: "Berwick Primary School, Berwick Secondary College. Proximity to Berwick Grammar and Nossal High School.",
    distanceToTrainKm: 1.0,
    trainLine: "Pakenham Line, Berwick Station",
    distanceToFreewayKm: 4.0,
    distanceToShoppingKm: 2.0,
    nearestHospitalKm: 4.3,
    suburb5yrGrowthPct: 28,
    suburbMedianPrice: 920000,
    daysOnMarketAvg: 32,
    clearanceRatePct: 74,
    comparableSales: [
      { address: "11 Coach House Lane, Beaconsfield", price: 2110000, date: "May 2026", beds: 5 },
      { address: "5 Ascot Rise, Berwick", price: 1300000, date: "Apr 2026", beds: 4 },
      { address: "8 Grand Arch Way, Berwick", price: 1210000, date: "Feb 2026", beds: 4 },
    ],

    // FEATURES & CONDITION
    kitchenRenovated: "Fully renovated 2021, 40mm stone benchtops, 900mm Smeg oven, butler's pantry, island bench with breakfast bar",
    bathroomRenovated: "Master ensuite renovated 2021, second bathroom renovated 2023, third bathroom original 2005",
    flooringType: "Solid timber floors living areas, plush carpet bedrooms",
    airConType: "Ducted refrigerated cooling (Daikin, 2021)",
    heatingType: "Ducted gas heating",
    solarKw: 8.0,
    batteryStorage: true,
    evCharging: true,
    nbnType: "NBN FTTP (Fibre to the Premises)",
    waterTank: true,
    alarmSystem: true,
    smartHome: true,
    disabilityAccess: false,
    petsAllowed: true,
    outdoorFeatures: "Alfresco 45sqm, heated inground pool, spa, established gardens, outdoor kitchen with BBQ",

    // PLANNING & VENDOR
    subdivisionPotential: false,
    dualOccupancyPotential: false,
    grannyFlatApproved: false,
    extensionPotential: "Already maximised with pool and alfresco; scope for upper level addition subject to NRZ1 height limits",
    councilDevelopmentHistory: "Pool permit 2018, kitchen and bathroom reno permit 2021, no outstanding permits",
    neighbourhoodDescription: "Prestigious Ashfield Drive address, surrounded by executive homes. Walking distance to Berwick Grammar, Berwick Village, and Berwick Station.",
    trafficNoiseLevel: "Low, quiet residential street with excellent setback",
    flightPathFlag: false,
    futureInfrastructure: "Berwick Station precinct upgrade, Nossal High expansion. Strong long-term demand drivers.",
    floodZone: false,
    vendorMotivation: "TBD",
    vendorTimelineDays: 90,
    previousOffers: false,
    daysOnMarket: 0,
    priceReductionHistory: "New listing, no reductions",
    tenantInPlace: false,
    tenantLeaseEndDate: "N/A",
    vendorPreferredSettlement: "90 days preferred",
    vendorFlexOnInclusions: "TBD",
    inclusions: "All light fittings, window coverings, dishwasher, outdoor kitchen, pool equipment, water tank, EV charger, alarm, smart home hub",

    qa: [
      {
        question: "What is the land size?",
        answer: "820 square metres, a generous block with room for the pool, alfresco, and established gardens.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square"],
      },
      {
        question: "What is the home size?",
        answer: "Approximately 380 square metres of living space including 5 bedrooms, 3 bathrooms, home theatre, formal lounge, and open plan family and meals areas.",
        category: "physical",
        keywords: ["house", "size", "area", "internal", "sqm", "living", "floor"],
      },
      {
        question: "Does it have a pool?",
        answer: "Yes. A heated inground pool and spa with a 45 square metre alfresco and outdoor kitchen.",
        category: "physical",
        keywords: ["pool", "swimming", "spa", "heated", "inground"],
      },
      {
        question: "Is there outdoor entertaining?",
        answer: "Yes. A 45 square metre alfresco with an outdoor kitchen and BBQ, overlooking the pool and landscaped gardens.",
        category: "physical",
        keywords: ["outdoor", "alfresco", "entertaining", "bbq", "kitchen", "pool", "garden"],
      },
      {
        question: "What is the construction type?",
        answer: "Double brick prestige construction with rendered feature panels, built in 2005.",
        category: "physical",
        keywords: ["construction", "brick", "double brick", "quality", "build", "materials"],
      },
      {
        question: "What is the price range?",
        answer: "Listed at $1,350,000 to $1,490,000.",
        category: "financial",
        keywords: ["price", "range", "asking", "listed", "cost", "how much", "budget"],
      },
      {
        question: "What school zone is this property in?",
        answer: "Zoned for Berwick Primary School and Berwick Secondary College. It is also close to Berwick Grammar and Nossal High School.",
        category: "location",
        keywords: ["school", "zone", "catchment", "berwick", "grammar", "nossal", "primary", "secondary"],
      },
      {
        question: "How far is the train station?",
        answer: "Berwick Station on the Pakenham Line is approximately 1km from Ashfield Drive.",
        category: "location",
        keywords: ["train", "station", "commute", "walk", "transport", "pakenham"],
      },
      {
        question: "How far is the freeway?",
        answer: "The Princes Freeway M1 is approximately 4km from the property.",
        category: "location",
        keywords: ["freeway", "m1", "princes", "highway", "motorway", "distance"],
      },
      {
        question: "What is the suburb growth rate?",
        answer: "Berwick has delivered approximately 28% median price growth over the past 5 years, supported by strong school zones and infrastructure.",
        category: "location",
        keywords: ["growth", "capital", "appreciation", "suburb", "5 year", "market"],
      },
      {
        question: "What is the kitchen like?",
        answer: "Fully renovated in 2021 with 40mm stone benchtops, 900mm Smeg oven, butler's pantry, and island bench with breakfast bar.",
        category: "features",
        keywords: ["kitchen", "bench", "smeg", "oven", "butler", "pantry", "island", "stone", "renovated"],
      },
      {
        question: "What is the air conditioning setup?",
        answer: "Ducted refrigerated cooling (Daikin, installed 2021) and ducted gas heating throughout.",
        category: "features",
        keywords: ["air con", "ducted", "cooling", "daikin", "heating", "refrigerated", "climate"],
      },
      {
        question: "Is there solar power and battery storage?",
        answer: "Yes. An 8kW solar system with battery storage is installed, plus an EV charger in the garage.",
        category: "features",
        keywords: ["solar", "battery", "ev", "charger", "energy", "electricity", "kw", "storage"],
      },
      {
        question: "Is there a smart home system?",
        answer: "Yes. Smart home system covering lighting, security, and climate control.",
        category: "features",
        keywords: ["smart home", "automation", "hub", "control", "lighting", "tech"],
      },
      {
        question: "What is the NBN type?",
        answer: "NBN FTTP (Fibre to the Premises), the fastest available technology.",
        category: "features",
        keywords: ["nbn", "internet", "fibre", "fttp", "broadband", "connection"],
      },
      {
        question: "What is the rental appraisal?",
        answer: "A 5-bedroom prestige home with pool in this location would rent for approximately $650 to $720 per week.",
        category: "financial",
        keywords: ["rent", "rental", "appraisal", "yield", "investment", "income", "per week"],
      },
      {
        question: "What are the council rates?",
        answer: "Approximately $2,200 per year with Casey Council.",
        category: "financial",
        keywords: ["council", "rates", "annual", "per year", "fees"],
      },
      {
        question: "What stamp duty applies?",
        answer: "At the midpoint of $1.42M, stamp duty for an owner-occupier is approximately $82,650.",
        category: "financial",
        keywords: ["stamp duty", "duty", "transfer", "government", "cost"],
      },
      {
        question: "Are there any overlays?",
        answer: "No planning overlays apply to this property.",
        category: "legal",
        keywords: ["overlay", "overlays", "heritage", "bushfire", "eso", "planning"],
      },
      {
        question: "Is the Section 32 ready?",
        answer: "The Section 32 is currently in preparation. Confirm the expected completion date with the agent.",
        category: "legal",
        keywords: ["s32", "section 32", "contract", "vendor statement", "ready"],
      },
      {
        question: "Is there subdivision potential?",
        answer: "No. NRZ1 zoning and the existing pool and alfresco footprint preclude subdivision.",
        category: "planning",
        keywords: ["subdivision", "subdivide", "sub", "second dwelling", "split"],
      },
      {
        question: "Is there an EV charger?",
        answer: "Yes. An EV charger is installed in the double garage.",
        category: "features",
        keywords: ["ev", "charger", "electric vehicle", "tesla", "charge", "garage"],
      },
      {
        question: "What inclusions are provided?",
        answer: "All light fittings, window coverings, dishwasher, outdoor kitchen, pool equipment, water tank, EV charger, alarm, and smart home hub.",
        category: "legal",
        keywords: ["inclusions", "included", "pool", "ev", "outdoor kitchen", "alarm", "smart"],
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// Utility: count filled fields (100 data-point fields, excluding qa)
// ---------------------------------------------------------------------------

const DATA_FIELD_KEYS: Array<keyof Omit<PropertySLM, "propertyId" | "address" | "suburb" | "status" | "soldDate" | "soldPrice" | "qa">> = [
  // PHYSICAL (20)
  "beds", "baths", "cars", "landSqm", "houseSqm", "yearBuilt", "propertyType",
  "frontageMetre", "depthMetre", "propertyShape", "orientation", "pool",
  "gardenSqm", "shed", "outdoorEntertaining", "alfrescoSqm", "roofType",
  "externalCladding", "construction", "floorplanConfig",
  // LEGAL (15)
  "titleType", "easements", "covenants", "overlays", "s32Status", "encumbrances",
  "ownerOccupied", "zoning", "rightOfWay", "sewerEasement", "contaminatedLand",
  "buildingPermitsOutstanding", "ownerBuilderWork", "titlesOfficeReady", "section32CompletionDate",
  // FINANCIAL (15)
  "priceMin", "priceMax", "vendorReserve", "settlementTermsDays", "depositPct",
  "rentalAppraisalLow", "rentalAppraisalHigh", "grossYieldAtAsk", "councilRates",
  "waterRates", "bodyCorporateFees", "stampDutyEstimate", "landTaxThreshold",
  "depreciationYear1Est", "capitalGainsHistory",
  // LOCATION (15)
  "primarySchool", "primarySchoolRating", "secondarySchool", "secondarySchoolRating",
  "schoolZoneCatchment", "distanceToTrainKm", "trainLine", "distanceToFreewayKm",
  "distanceToShoppingKm", "nearestHospitalKm", "suburb5yrGrowthPct", "suburbMedianPrice",
  "daysOnMarketAvg", "clearanceRatePct", "comparableSales",
  // FEATURES (15)
  "kitchenRenovated", "bathroomRenovated", "flooringType", "airConType", "heatingType",
  "solarKw", "batteryStorage", "evCharging", "nbnType", "waterTank", "alarmSystem",
  "smartHome", "disabilityAccess", "petsAllowed", "outdoorFeatures",
  // PLANNING & VENDOR (20)
  "subdivisionPotential", "dualOccupancyPotential", "grannyFlatApproved", "extensionPotential",
  "councilDevelopmentHistory", "neighbourhoodDescription", "trafficNoiseLevel", "flightPathFlag",
  "futureInfrastructure", "floodZone", "vendorMotivation", "vendorTimelineDays",
  "previousOffers", "daysOnMarket", "priceReductionHistory", "tenantInPlace",
  "tenantLeaseEndDate", "vendorPreferredSettlement", "vendorFlexOnInclusions", "inclusions",
]

export function getSLMCompleteness(slm: PropertySLM): { filled: number; total: number; pct: number } {
  const total = DATA_FIELD_KEYS.length
  let filled = 0
  for (const key of DATA_FIELD_KEYS) {
    const val = slm[key as keyof PropertySLM]
    if (val !== "TBD") filled++
  }
  return { filled, total, pct: Math.round((filled / total) * 100) }
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const SLM_KEY_PREFIX = "propOS_slm_v2_"

export function loadSLMForProperty(propertyId: number): PropertySLM {
  try {
    const raw = localStorage.getItem(`${SLM_KEY_PREFIX}${propertyId}`)
    if (raw) {
      return JSON.parse(raw) as PropertySLM
    }
  } catch {
    // fall through to default
  }
  return SLM_DATA[propertyId]
}

export function saveSLMForProperty(slm: PropertySLM): void {
  try {
    localStorage.setItem(`${SLM_KEY_PREFIX}${slm.propertyId}`, JSON.stringify(slm))
  } catch {
    // storage may be unavailable in SSR or private browsing — silently ignore
  }
}

export function resetSLMForProperty(propertyId: number): PropertySLM {
  try {
    localStorage.removeItem(`${SLM_KEY_PREFIX}${propertyId}`)
  } catch {
    // ignore
  }
  return SLM_DATA[propertyId]
}
