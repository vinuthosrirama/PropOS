// PropOS Property SLM (Small Language Model / Property Brain)
// 100-data-point structured knowledge store per property
// All Berwick VIC 3806 data; Beaconsfield VIC 3807 for property 101

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
  // 101 — 48 President Road, Narre Warren South (SOLD ~$962K, 28 Apr 2026)
  // SLM data: Confirm with Section 32 and vendor — marked TBD where unconfirmed
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
    landSqm: 640,
    houseSqm: "TBD",
    yearBuilt: "TBD",
    propertyType: "House",
    frontageMetre: "TBD",
    depthMetre: "TBD",
    propertyShape: "TBD",
    orientation: "TBD",
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
    titleType: "TBD",
    easements: "TBD",
    covenants: "TBD",
    overlays: "TBD",
    s32Status: "TBD",
    encumbrances: "TBD",
    ownerOccupied: "TBD",
    zoning: "TBD",
    rightOfWay: "TBD",
    sewerEasement: "TBD",
    contaminatedLand: "TBD",
    buildingPermitsOutstanding: "TBD",
    ownerBuilderWork: "TBD",
    titlesOfficeReady: "TBD",
    section32CompletionDate: "TBD",

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
    stampDutyEstimate: "TBD",
    landTaxThreshold: "TBD",
    depreciationYear1Est: "TBD",
    capitalGainsHistory: "TBD",

    // LOCATION & SUBURB
    primarySchool: "TBD",
    primarySchoolRating: "TBD",
    secondarySchool: "TBD",
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
    dualOccupancyPotential: "TBD",
    grannyFlatApproved: "TBD",
    extensionPotential: "TBD",
    councilDevelopmentHistory: "TBD",
    neighbourhoodDescription: "Narre Warren South family precinct. Close to Fountain Gate Westfield and Casey Hospital.",
    trafficNoiseLevel: "TBD",
    flightPathFlag: "TBD",
    futureInfrastructure: "TBD",
    floodZone: "TBD",
    vendorMotivation: "TBD",
    vendorTimelineDays: "TBD",
    previousOffers: "TBD",
    daysOnMarket: "TBD",
    priceReductionHistory: "TBD",
    tenantInPlace: "TBD",
    tenantLeaseEndDate: "TBD",
    vendorPreferredSettlement: "TBD",
    vendorFlexOnInclusions: "TBD",
    inclusions: "TBD",

    qa: [
      {
        question: "How big is the land?",
        answer: "640 square metres — confirm exact dimensions from title.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square"],
      },
      {
        question: "How many bedrooms?",
        answer: "4 bedrooms, 2 bathrooms, double garage.",
        category: "physical",
        keywords: ["bed", "bedroom", "rooms", "layout", "floorplan"],
      },
      {
        question: "What is the suburb like?",
        answer: "Narre Warren South is a well-established family suburb, close to Fountain Gate Westfield, Casey Hospital, and quality schools.",
        category: "location",
        keywords: ["suburb", "area", "neighbourhood", "narre warren", "community"],
      },
      {
        question: "What is the rental appraisal?",
        answer: "TBD — obtain from local property manager. Narre Warren South 4-bed homes typically rent $480 to $540 per week.",
        category: "financial",
        keywords: ["rent", "rental", "appraisal", "yield", "investment", "income", "per week"],
      },
      {
        question: "What school zone is this in?",
        answer: "TBD — confirm exact catchment with Casey Council. Likely zoned for Narre Warren South P-12 College.",
        category: "location",
        keywords: ["school", "zone", "catchment", "primary", "secondary"],
      },
      {
        question: "Is the Section 32 ready?",
        answer: "TBD — add details from vendor solicitor.",
        category: "legal",
        keywords: ["s32", "section 32", "contract", "vendor statement", "ready"],
      },
      {
        question: "What are the council rates?",
        answer: "TBD — confirm from Casey Council rate notice.",
        category: "financial",
        keywords: ["council", "rates", "annual", "fees"],
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
  // 104 — 3 Yemaya Place, Berwick (SOLD ~$1.095M, 15 Mar 2026)
  // SLM data: Confirm with Section 32 — marked TBD where unconfirmed
  // -------------------------------------------------------------------------
  104: {
    propertyId: 104,
    address: "3 Yemaya Place",
    suburb: "Berwick VIC 3806",
    status: "sold",
    soldDate: "15 Mar 2026",
    soldPrice: 1095000,

    // PHYSICAL
    beds: 4,
    baths: 2,
    cars: 2,
    landSqm: 600,
    houseSqm: "TBD",
    yearBuilt: "TBD",
    propertyType: "House",
    frontageMetre: "TBD",
    depthMetre: "TBD",
    propertyShape: "TBD",
    orientation: "TBD",
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
    titleType: "TBD",
    easements: "TBD",
    covenants: "TBD",
    overlays: "TBD",
    s32Status: "TBD",
    encumbrances: "TBD",
    ownerOccupied: "TBD",
    zoning: "TBD",
    rightOfWay: "TBD",
    sewerEasement: "TBD",
    contaminatedLand: "TBD",
    buildingPermitsOutstanding: "TBD",
    ownerBuilderWork: "TBD",
    titlesOfficeReady: "TBD",
    section32CompletionDate: "TBD",

    // FINANCIAL
    priceMin: 1095000,
    priceMax: 1095000,
    vendorReserve: "TBD",
    settlementTermsDays: "TBD",
    depositPct: 10,
    rentalAppraisalLow: "TBD",
    rentalAppraisalHigh: "TBD",
    grossYieldAtAsk: "TBD",
    councilRates: "TBD",
    waterRates: "TBD",
    bodyCorporateFees: 0,
    stampDutyEstimate: "TBD",
    landTaxThreshold: "TBD",
    depreciationYear1Est: "TBD",
    capitalGainsHistory: "TBD",

    // LOCATION & SUBURB
    primarySchool: "Berwick Primary School",
    primarySchoolRating: "Above average (MySchool rating 7/10)",
    secondarySchool: "Berwick Secondary College",
    secondarySchoolRating: "7.5/10 (MySchool)",
    schoolZoneCatchment: "TBD — confirm with Casey Council",
    distanceToTrainKm: "TBD",
    trainLine: "Pakenham Line, Berwick Station",
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
    dualOccupancyPotential: "TBD",
    grannyFlatApproved: "TBD",
    extensionPotential: "TBD",
    councilDevelopmentHistory: "TBD",
    neighbourhoodDescription: "Berwick family suburb with quality schools, parks, and shopping within easy reach.",
    trafficNoiseLevel: "TBD",
    flightPathFlag: "TBD",
    futureInfrastructure: "TBD",
    floodZone: "TBD",
    vendorMotivation: "TBD",
    vendorTimelineDays: "TBD",
    previousOffers: "TBD",
    daysOnMarket: "TBD",
    priceReductionHistory: "TBD",
    tenantInPlace: "TBD",
    tenantLeaseEndDate: "TBD",
    vendorPreferredSettlement: "TBD",
    vendorFlexOnInclusions: "TBD",
    inclusions: "TBD",

    qa: [
      {
        question: "What is the land size?",
        answer: "600 square metres — confirm exact dimensions from title.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square"],
      },
      {
        question: "How many bedrooms?",
        answer: "4 bedrooms, 2 bathrooms, double garage.",
        category: "physical",
        keywords: ["bed", "bedroom", "rooms", "layout", "floorplan"],
      },
      {
        question: "What school zone is this in?",
        answer: "TBD — confirm catchment with Casey Council. Berwick Primary School and Berwick Secondary College are the local zone schools.",
        category: "location",
        keywords: ["school", "zone", "catchment", "primary", "secondary", "berwick"],
      },
      {
        question: "What is the rental appraisal?",
        answer: "TBD — obtain from local property manager.",
        category: "financial",
        keywords: ["rent", "rental", "appraisal", "yield", "investment", "income", "per week"],
      },
      {
        question: "Is the Section 32 ready?",
        answer: "TBD — confirm with vendor solicitor.",
        category: "legal",
        keywords: ["s32", "section 32", "contract", "vendor statement", "ready"],
      },
      {
        question: "How far is Berwick Station?",
        answer: "TBD — confirm distance to Berwick Station on the Pakenham Line.",
        category: "location",
        keywords: ["train", "station", "walk", "commute", "transport", "pakenham"],
      },
      {
        question: "What inclusions are provided?",
        answer: "TBD — confirm inclusions with vendor.",
        category: "legal",
        keywords: ["inclusions", "included", "dishwasher", "oven", "blind", "curtain"],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 105 — 34 Hartsmere Drive, Berwick (SOLD ~$865K, 08 Feb 2026)
  // Kingsmere Estate. Data confirmed where noted; TBD = needs verification
  // -------------------------------------------------------------------------
  105: {
    propertyId: 105,
    address: "34 Hartsmere Drive",
    suburb: "Berwick VIC 3806",
    status: "sold",
    soldDate: "08 Feb 2026",
    soldPrice: 865000,

    // PHYSICAL — Based on estate comparables and agent data
    beds: 4,
    baths: 2,
    cars: 2,
    landSqm: 621,
    houseSqm: "TBD",
    yearBuilt: "TBD",
    propertyType: "House",
    frontageMetre: "TBD",
    depthMetre: "TBD",
    propertyShape: "Rectangular",
    orientation: "TBD",
    pool: false,
    gardenSqm: "TBD",
    shed: "TBD",
    outdoorEntertaining: true,
    alfrescoSqm: "TBD",
    roofType: "TBD",
    externalCladding: "TBD",
    construction: "TBD",
    floorplanConfig: "4 bed, 2 bath, double garage, decked pergola",

    // LEGAL & TITLE
    titleType: "Torrens Title",
    easements: "TBD",
    covenants: "Kingsmere Estate covenant — confirm details",
    overlays: "TBD",
    s32Status: "TBD",
    encumbrances: "TBD",
    ownerOccupied: "TBD",
    zoning: "TBD",
    rightOfWay: "None",
    sewerEasement: "TBD",
    contaminatedLand: false,
    buildingPermitsOutstanding: "TBD",
    ownerBuilderWork: "TBD",
    titlesOfficeReady: "TBD",
    section32CompletionDate: "TBD",

    // FINANCIAL
    priceMin: 820000,
    priceMax: 900000,
    vendorReserve: "TBD",
    settlementTermsDays: "TBD",
    depositPct: 10,
    rentalAppraisalLow: 470,
    rentalAppraisalHigh: 520,
    grossYieldAtAsk: 2.93,
    councilRates: "TBD",
    waterRates: "TBD",
    bodyCorporateFees: 0,
    stampDutyEstimate: "TBD",
    landTaxThreshold: "TBD",
    depreciationYear1Est: "TBD",
    capitalGainsHistory: "TBD",

    // LOCATION & SUBURB — Confirmed from agent knowledge
    primarySchool: "Berwick Primary School",
    primarySchoolRating: "Above average (MySchool rating 7/10)",
    secondarySchool: "Berwick Secondary College",
    secondarySchoolRating: "7.5/10 (MySchool)",
    schoolZoneCatchment: "Berwick Primary School (850m walk), Berwick Secondary College",
    distanceToTrainKm: "TBD",
    trainLine: "Pakenham Line, Berwick Station",
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
    airConType: "Reverse cycle split system (confirmed)",
    heatingType: "Ducted gas heating (confirmed)",
    solarKw: "TBD",
    batteryStorage: "TBD",
    evCharging: "TBD",
    nbnType: "TBD",
    waterTank: "TBD",
    alarmSystem: "TBD",
    smartHome: "TBD",
    disabilityAccess: "TBD",
    petsAllowed: "TBD",
    outdoorFeatures: "Decked pergola, private rear garden, double garage",

    // PLANNING & VENDOR
    subdivisionPotential: false,
    dualOccupancyPotential: false,
    grannyFlatApproved: "TBD",
    extensionPotential: "TBD",
    councilDevelopmentHistory: "TBD",
    neighbourhoodDescription: "Kingsmere Estate, Berwick. Quiet residential street (no through traffic). Walk to Berwick Primary School. Close to Berwick village shops and Berwick Station.",
    trafficNoiseLevel: "Very low — no through traffic residential street",
    flightPathFlag: false,
    futureInfrastructure: "TBD",
    floodZone: false,
    vendorMotivation: "TBD",
    vendorTimelineDays: "TBD",
    previousOffers: "TBD",
    daysOnMarket: "TBD",
    priceReductionHistory: "TBD",
    tenantInPlace: "TBD",
    tenantLeaseEndDate: "TBD",
    vendorPreferredSettlement: "TBD",
    vendorFlexOnInclusions: "TBD",
    inclusions: "TBD",

    qa: [
      {
        question: "What is the land size?",
        answer: "621 square metres on a quiet no-through-traffic street in Kingsmere Estate.",
        category: "physical",
        keywords: ["land", "lot", "sqm", "block", "size", "m2", "square"],
      },
      {
        question: "How many bedrooms?",
        answer: "4 bedrooms, 2 bathrooms, double garage with decked pergola.",
        category: "physical",
        keywords: ["bed", "bedroom", "rooms", "layout", "floorplan"],
      },
      {
        question: "What school zone is this in?",
        answer: "Confirmed within Berwick Primary School catchment — 850m walk. Also zoned for Berwick Secondary College.",
        category: "location",
        keywords: ["school", "zone", "catchment", "primary", "secondary", "berwick", "grammar"],
      },
      {
        question: "How quiet is the street?",
        answer: "Hartsmere Drive is a no-through-traffic residential street in Kingsmere Estate. Very low traffic noise.",
        category: "planning",
        keywords: ["quiet", "traffic", "noise", "street", "road", "through", "peaceful"],
      },
      {
        question: "What is the rental appraisal?",
        answer: "A 4-bedroom home in Kingsmere Estate would rent for approximately $470 to $520 per week.",
        category: "financial",
        keywords: ["rent", "rental", "appraisal", "yield", "investment", "income", "per week"],
      },
      {
        question: "Is there subdivision potential?",
        answer: "No. Block size and estate covenants do not permit subdivision.",
        category: "planning",
        keywords: ["subdivision", "subdivide", "sub", "second dwelling", "split"],
      },
      {
        question: "What is the suburb growth?",
        answer: "Berwick has delivered approximately 28% median price growth over the past 5 years.",
        category: "location",
        keywords: ["growth", "capital", "appreciation", "suburb", "5 year", "market"],
      },
      {
        question: "Is the Section 32 ready?",
        answer: "TBD — confirm with vendor solicitor.",
        category: "legal",
        keywords: ["s32", "section 32", "contract", "vendor statement", "ready"],
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
