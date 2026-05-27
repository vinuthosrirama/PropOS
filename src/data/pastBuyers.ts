// PropOS — Past Buyer CRM Data
//
// Represents the agent's historical buyer database (from Box+Dice, Zenu,
// Google Sheets, or manual entry). Each record is a person who bought a
// property through or near the agent in the past.
//
// This is the raw material for vendor prospecting — we analyse each buyer's
// current financial position and life stage to decide who to approach about selling.

export type BuyerStatus = "owner-occupier" | "investor" | "renter" | "unknown"

export interface PastBuyer {
  id: number
  name: string
  phone: string
  email?: string

  // Property they bought
  purchaseAddress: string
  suburb: string
  purchaseDate: string        // ISO date
  purchasePrice: number
  deposit?: number            // if known from contract
  propertyType: "House" | "Unit" | "Townhouse"
  beds: number
  baths: number
  land?: number               // sqm

  // Current status
  status: BuyerStatus
  notes: string               // agent's CRM notes — the gold for personalisation

  // Optional
  lastContactDate?: string    // when agent last spoke to them
  contractTerms?: string      // "60 day settlement, 10% deposit"

  // Sheet-sourced enrichment (populated when live sheet is connected)
  personalisationHook?: string      // col R — pre-written 1-line hook for outreach (bypasses AI extraction)
  currentEstimateOverride?: number  // col S — agent-entered current market value; overrides auto-estimate
  lastMessage?: string              // col Q — last outreach SMS/email snippet written back to sheet
}

// ---------------------------------------------------------------------------
// Demo data — Cameron Knoll / Peake (Berwick corridor)
// ---------------------------------------------------------------------------

export const CAMERON_PAST_BUYERS: PastBuyer[] = [
  {
    id: 5001,
    name: "David & Karen Hollis",
    phone: "0418 234 567", email: "k.hollis@gmail.com",
    purchaseAddress: "8 Thirlmere Court", suburb: "Berwick",
    purchaseDate: "2017-03-15", purchasePrice: 620000, deposit: 124000,
    propertyType: "House", beds: 4, baths: 2, land: 610,
    status: "owner-occupier",
    notes: "Lovely family. Two kids at Berwick Primary — Ella (yr 5) and Oscar (yr 3). Karen volunteers at the school canteen. David works in the city, catches the 6:42am train. They love the court position and the park across from Thirlmere. Karen mentioned wanting a bigger kitchen when they had everyone over at Christmas. Solid community people.",
    lastContactDate: "2024-11-20",
    contractTerms: "60 day settlement, 20% deposit",
    personalisationHook: "Karen mentioned wanting a bigger kitchen when they had everyone over at Christmas. 7 years on, Ella and Oscar are outgrowing Thirlmere Court.",
  },
  {
    id: 5002,
    name: "Michael Chen",
    phone: "0411 567 890", email: "m.chen.property@outlook.com",
    purchaseAddress: "14 Whitecliffe Way", suburb: "Berwick",
    purchaseDate: "2015-08-22", purchasePrice: 545000, deposit: 109000,
    propertyType: "House", beds: 5, baths: 3, land: 718,
    status: "owner-occupier",
    notes: "Michael and Fiona. Both kids have moved out — daughter in Fitzroy, son in Brisbane. House feels too big now. Michael semi-retired from engineering, Fiona still works part-time as a physio. He mentioned he'd love to be closer to the coast. Very analytical, will want to see the numbers before making any decisions.",
    lastContactDate: "2023-06-15",
    contractTerms: "90 day settlement, 20% deposit",
  },
  {
    id: 5003,
    name: "Sandra Moore",
    phone: "0422 891 234",
    purchaseAddress: "22 Birchwood Drive", suburb: "Berwick",
    purchaseDate: "2020-02-10", purchasePrice: 710000, deposit: 71000,
    propertyType: "House", beds: 3, baths: 2, land: 480,
    status: "owner-occupier",
    notes: "Single mum, absolute trooper. Has two boys (7 and 5) and third baby due August 2026. Current 3-bed is getting very tight. She mentioned wanting a study nook for working from home. Very budget-conscious but knows she needs more space. School zone is important — wants to stay in Berwick Chase catchment if possible.",
    lastContactDate: "2025-03-01",
    contractTerms: "45 day settlement, 10% deposit",
  },
  {
    id: 5004,
    name: "James & Lisa Thompson",
    phone: "0404 123 456", email: "jlthompson@hotmail.com",
    purchaseAddress: "18 Ascot Rise", suburb: "Berwick",
    purchaseDate: "2018-11-30", purchasePrice: 785000, deposit: 157000,
    propertyType: "House", beds: 4, baths: 2, land: 648,
    status: "owner-occupier",
    notes: "James is a plumber, Lisa is a nurse at Casey Hospital. Both kids have finished uni and moved out. Lisa mentioned at the last catch-up that the garden is too much work now. They've been talking about a townhouse in Narre Warren South — less maintenance, closer to the shops. Lisa is the decision maker.",
    lastContactDate: "2024-06-01",
    contractTerms: "60 day settlement, 20% deposit",
  },
  {
    id: 5005,
    name: "Robert Patel",
    phone: "0431 678 901", email: "rob.patel@gmail.com",
    purchaseAddress: "7 Heritage Court", suburb: "Berwick",
    purchaseDate: "2019-05-14", purchasePrice: 680000, deposit: 136000,
    propertyType: "House", beds: 4, baths: 2, land: 601,
    status: "investor",
    notes: "Investment property — Rob lives in South Yarra. Currently tenanted at $520/wk. Tenant lease expires November 2026. Rob mentioned he's thinking about selling one of his three IPs to free up capital for a commercial investment in Dandenong. Very numbers-driven, responds to yield and tax analysis.",
    lastContactDate: "2025-01-15",
    contractTerms: "30 day settlement, 20% deposit",
  },
  {
    id: 5006,
    name: "Paul & Michelle Grant",
    phone: "0415 345 678", email: "pmgrant@live.com.au",
    purchaseAddress: "11 Yemaya Place", suburb: "Berwick",
    purchaseDate: "2021-09-05", purchasePrice: 760000, deposit: 152000,
    propertyType: "House", beds: 4, baths: 2, land: 560,
    status: "owner-occupier",
    notes: "Young couple, no kids yet. Paul works in IT (remote), Michelle is a teacher at Berwick Secondary. They bought during the pandemic boom. Paul was surprised by the recent sale at 3 Yemaya Place — didn't realise the market was this strong. Michelle mentioned they might want to move to the coast in a few years but no rush.",
    lastContactDate: "2025-04-10",
  },
  {
    id: 5007,
    name: "Priya & Arjun Sharma",
    phone: "0439 234 567", email: "priya.sharma@gmail.com",
    purchaseAddress: "52 Timbertop Drive", suburb: "Berwick",
    purchaseDate: "2016-04-20", purchasePrice: 510000, deposit: 102000,
    propertyType: "House", beds: 3, baths: 1, land: 540,
    status: "investor",
    notes: "Priya and Arjun live in Glen Waverley. This was their first IP. Currently rented at $450/wk. The property needs some work — kitchen is original 2005 build. Priya mentioned at our last call that they're worried about rising interest rates and thinking about whether to renovate or sell. She said 'we'd sell if the numbers made sense.'",
    lastContactDate: "2024-08-12",
    contractTerms: "60 day settlement, 20% deposit",
  },
  {
    id: 5008,
    name: "Tony & Mel Rossi",
    phone: "0421 876 543", email: "tony.rossi@outlook.com",
    purchaseAddress: "3 Sundance Boulevard", suburb: "Narre Warren South",
    purchaseDate: "2014-02-28", purchasePrice: 430000, deposit: 86000,
    propertyType: "House", beds: 4, baths: 2, land: 672,
    status: "owner-occupier",
    notes: "Italian family, very warm. Three kids — all teenagers now. Tony runs a small landscaping business. Mel works at Fountain Gate Woolworths. They've done a lot of work on the house — new alfresco, shed, kitchen reno in 2020. Tony mentioned they've been looking at acreage in Officer/Pakenham for years. 'When the kids are done with school, we're out.' Youngest is in Year 10.",
    lastContactDate: "2023-12-01",
    contractTerms: "90 day settlement, 20% deposit",
  },
  {
    id: 5009,
    name: "Angela Tran",
    phone: "0408 765 432",
    purchaseAddress: "Unit 6/88 High Street", suburb: "Berwick",
    purchaseDate: "2022-06-15", purchasePrice: 420000, deposit: 42000,
    propertyType: "Unit", beds: 2, baths: 1, land: 0,
    status: "investor",
    notes: "Angela is a pharmacist, lives in Malvern. Bought this as an IP for her daughter who was studying at Monash Berwick. Daughter has since graduated and moved to Sydney. Currently tenanted but tenant is month-to-month. Angela said 'I only bought it for Lily, now there's no real reason to keep it.' Very open to selling if the timing is right.",
    lastContactDate: "2025-02-20",
    contractTerms: "30 day settlement, 10% deposit",
  },
  {
    id: 5010,
    name: "Sam & Jess Woodford",
    phone: "0412 111 222", email: "sam.woodford@gmail.com",
    purchaseAddress: "29 Donalds Road", suburb: "Narre Warren",
    purchaseDate: "2019-10-18", purchasePrice: 590000, deposit: 118000,
    propertyType: "House", beds: 3, baths: 2, land: 520,
    status: "owner-occupier",
    notes: "Young family — Sam is a sparky, Jess is on mat leave with their second (baby Archie, 4 months). Their first, Poppy, is 3. The 3-bed worked fine with one kid but they're already running out of room. Sam mentioned wanting a proper garage/workshop. Jess wants to be near Berwick Chase Primary for when Poppy starts school in 2028. Would move tomorrow if they could afford the upgrade.",
    lastContactDate: "2025-05-10",
  },
]

// ---------------------------------------------------------------------------
// Demo data — Pas Sunilchandra / Area Specialist
// ---------------------------------------------------------------------------

export const PAS_PAST_BUYERS: PastBuyer[] = [
  {
    id: 6001,
    name: "Thomas Nguyen",
    phone: "0427 456 789", email: "t.nguyen88@gmail.com",
    purchaseAddress: "71 Broadway Street", suburb: "Hampton Park",
    purchaseDate: "2018-04-10", purchasePrice: 480000, deposit: 48000,
    propertyType: "House", beds: 3, baths: 1, land: 528,
    status: "owner-occupier",
    notes: "Thomas saw Pas sell 58 Broadway and rang the office. Lives alone, works as a forklift driver in Dandenong South. Mentioned the house needs a new bathroom and kitchen but he's been putting it off. Very straightforward, no nonsense. Responds best to text, not email.",
    lastContactDate: "2025-05-01",
  },
  {
    id: 6002,
    name: "Anna & Steve Kowalski",
    phone: "0438 901 234", email: "anna.kowalski@yahoo.com",
    purchaseAddress: "15 Chelmsford Drive", suburb: "Hampton Park",
    purchaseDate: "2020-07-22", purchasePrice: 540000, deposit: 108000,
    propertyType: "House", beds: 4, baths: 2, land: 577,
    status: "owner-occupier",
    notes: "Anna got a promotion — now working in the CBD. Steve works from home (web developer). Commute from Hampton Park is killing Anna, 1.5hrs each way. They want to move closer to the city but love their house. Two cats, no kids. Anna said 'we need to be on the market before Christmas or I'll lose my mind on that train.'",
    lastContactDate: "2025-04-15",
    contractTerms: "60 day settlement, 20% deposit",
  },
  {
    id: 6003,
    name: "Chris Wilson",
    phone: "0419 012 345", email: "cwilson.retire@gmail.com",
    purchaseAddress: "45 Seattle Crescent", suburb: "Hallam",
    purchaseDate: "2016-11-03", purchasePrice: 460000, deposit: 92000,
    propertyType: "House", beds: 4, baths: 2, land: 603,
    status: "owner-occupier",
    notes: "Chris is 67, recently retired from AusPost. Wife passed 3 years ago. House is way too big for one person. He's been looking at 2-bed units in Berwick near his daughter. Very impressed with Pas at the 32 Seattle Crescent open — said 'when I'm ready, you'll be the one I call.' Daughter (Sarah) is the influencer in this decision.",
    lastContactDate: "2025-03-05",
    contractTerms: "90 day settlement",
  },
]

// ---------------------------------------------------------------------------
// Demo data — Manpreet Singh / Barry Plant Berwick
// Anchor property: 40 Jack William Way, Berwick (sold $805K — property 501)
// ---------------------------------------------------------------------------

export const MANPREET_PAST_BUYERS: PastBuyer[] = [
  {
    id: 7001,
    name: "Kevin & Amita Sharma",
    phone: "0432 881 207", email: "amita.sharma@gmail.com",
    purchaseAddress: "6 Creekwood Rise", suburb: "Berwick",
    purchaseDate: "2020-08-14", purchasePrice: 645000, deposit: 64500,
    propertyType: "House", beds: 3, baths: 2, land: 498,
    status: "owner-occupier",
    notes: "Kevin teaches at Berwick Secondary, Amita is in healthcare admin at Casey Hospital. Two kids — Aryan (4) and Kavya (2). Baby number three due January 2027. The 3-bed is already feeling cramped — Amita mentioned the kids are sharing a room and it is getting harder. They want a 4-bed with a proper study. Very motivated but nervous about the market. Kevin follows the Jack William Way sales closely — was really impressed with what Manpreet got for No. 40.",
    lastContactDate: "2025-04-22",
    contractTerms: "60 day settlement, 10% deposit",
  },
  {
    id: 7002,
    name: "Jason Nakamura",
    phone: "0418 556 334", email: "jason.nakamura.invest@gmail.com",
    purchaseAddress: "17 Windward Crescent", suburb: "Berwick",
    purchaseDate: "2017-06-10", purchasePrice: 590000, deposit: 118000,
    propertyType: "House", beds: 4, baths: 2, land: 622,
    status: "investor",
    notes: "Jason lives in Toorak. This is one of three IPs. Tenant lease on Windward Cres expires June 2026. He is very numbers-focused and tracks property values obsessively — sent Manpreet a message after the 40 Jack William Way sale asking if the Berwick market had peaked. Jason has read about the CGT discount changes and mentioned he might want to sell before 2027 to lock in the discount. Responds to data, not emotion.",
    lastContactDate: "2025-05-02",
    contractTerms: "30 day settlement, 20% deposit",
    personalisationHook: "Jason, your Windward Cres tenant just moved out and the CGT clock is ticking — selling now locks in your 50% discount before the July 2027 deadline.",
  },
  {
    id: 7003,
    name: "Bill & Heather McCormack",
    phone: "0411 223 744", email: "hmc.berwick@bigpond.com",
    purchaseAddress: "42 Delfin Drive", suburb: "Berwick",
    purchaseDate: "2016-03-22", purchasePrice: 570000, deposit: 114000,
    propertyType: "House", beds: 4, baths: 2, land: 635,
    status: "owner-occupier",
    notes: "Lovely couple. Bill is a retired school principal, Heather still does bookkeeping a couple days a week. Both kids have flown the nest — son in Sydney, daughter in London. Four-bed house on Delfin is way too much for the two of them now. Bill told Manpreet at the school fete that he is ready when Heather is. Heather is getting closer — she has started looking at ground-floor apartments in Berwick Village. Garden maintenance is becoming a real issue for Bill's back.",
    lastContactDate: "2025-03-15",
    contractTerms: "90 day settlement, 20% deposit",
  },
  {
    id: 7004,
    name: "Thanh & Lily Vo",
    phone: "0403 119 865", email: "thanh.vo.property@gmail.com",
    purchaseAddress: "54 Jack William Way", suburb: "Berwick",
    purchaseDate: "2021-04-19", purchasePrice: 755000, deposit: 75500,
    propertyType: "House", beds: 4, baths: 2, land: 502,
    status: "owner-occupier",
    notes: "Thanh is in logistics management, Lily is a dental hygienist. No kids yet but mentioned they want to start a family in the next year or two. They bought 54 Jack William Way just before the top of the market. Thanh was a bit worried for a while but the sale at No. 40 for $805K made him feel much better. He messaged Manpreet the day after settlement to ask what 54 would be worth. Not rushing, but definitely thinking about it.",
    lastContactDate: "2025-05-26",
  },
  {
    id: 7005,
    name: "Dan & Carly Crosbie",
    phone: "0427 490 612", email: "dancrosbie@hotmail.com",
    purchaseAddress: "21 Hartsmere Drive", suburb: "Berwick",
    purchaseDate: "2018-09-03", purchasePrice: 695000, deposit: 139000,
    propertyType: "House", beds: 4, baths: 2, land: 610,
    status: "investor",
    notes: "Dan is a builder, Carly is a teacher at Kambrya College. Investment property — they live in Officer. Currently rented at $520/wk. Dan mentioned after the 15 Hartsmere sale that he is thinking about selling to fund a duplex development in Pakenham. He has the skills to build it himself. Very pragmatic — he will move when the numbers make sense. Carly is supportive but wants to understand the tax position first.",
    lastContactDate: "2025-02-10",
    contractTerms: "60 day settlement, 20% deposit",
  },
]

// ---------------------------------------------------------------------------
// Current market value estimates (hardcoded for demo — would come from
// comparable sales engine in production)
// ---------------------------------------------------------------------------

export const CURRENT_VALUE_ESTIMATES: Record<number, number> = {
  // Cameron's buyers
  5001: 880000,   // 8 Thirlmere Ct — bought $620K in 2017
  5002: 950000,   // 14 Whitecliffe Way — bought $545K in 2015
  5003: 820000,   // 22 Birchwood Drive — bought $710K in 2020
  5004: 910000,   // 18 Ascot Rise — bought $785K in 2018
  5005: 870000,   // 7 Heritage Ct — bought $680K in 2019 (investor)
  5006: 790000,   // 11 Yemaya Pl — bought $760K in 2021
  5007: 780000,   // 52 Timbertop Dr — bought $510K in 2016 (investor)
  5008: 850000,   // 3 Sundance Blvd — bought $430K in 2014
  5009: 440000,   // Unit 6/88 High St — bought $420K in 2022 (investor)
  5010: 765000,   // 29 Donalds Rd — bought $590K in 2019
  // Pas's buyers
  6001: 610000,   // 71 Broadway St — bought $480K in 2018
  6002: 650000,   // 15 Chelmsford Dr — bought $540K in 2020
  6003: 680000,   // 45 Seattle Cres — bought $460K in 2016
  // Manpreet's buyers
  7001: 820000,   // 6 Creekwood Rise — bought $645K in 2020
  7002: 855000,   // 17 Windward Cres — bought $590K in 2017 (investor)
  7003: 870000,   // 42 Delfin Drive — bought $570K in 2016
  7004: 815000,   // 54 Jack William Way — bought $755K in 2021
  7005: 862000,   // 21 Hartsmere Drive — bought $695K in 2018 (investor)
}

// ---------------------------------------------------------------------------
// Helper to get buyers for an agent
// ---------------------------------------------------------------------------

import { isCamKnoll, isPasSunilchandra, isManpreetSingh, type AgentProfile } from "../data"

export function getPastBuyersForAgent(agent: AgentProfile): PastBuyer[] {
  if (isCamKnoll(agent)) return CAMERON_PAST_BUYERS
  if (isPasSunilchandra(agent)) return PAS_PAST_BUYERS
  if (isManpreetSingh(agent)) return MANPREET_PAST_BUYERS
  return []
}
