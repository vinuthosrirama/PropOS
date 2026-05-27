/**
 * PropOS — Past Buyers Seed Script
 *
 * Posts 24 realistic past buyers to your Google Sheets "Past Buyers" tab.
 *
 * Usage (after deploying the updated Apps Script):
 *   node scripts/seed-past-buyers.mjs
 *
 * Requires VITE_SHEET_URL to be set in .env.local (or pass via env):
 *   SHEET_URL=https://... node scripts/seed-past-buyers.mjs
 */

import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load SHEET_URL from .env.local or environment
let SHEET_URL = process.env.SHEET_URL || process.env.VITE_SHEET_URL || ""

if (!SHEET_URL) {
  try {
    const envPath = resolve(__dirname, "../.env.local")
    const env = readFileSync(envPath, "utf8")
    const match = env.match(/VITE_SHEET_URL=(.+)/)
    if (match) SHEET_URL = match[1].trim()
  } catch { /* no .env.local */ }
}

if (!SHEET_URL) {
  console.error("❌  SHEET_URL not found. Set VITE_SHEET_URL in .env.local or pass SHEET_URL= as env var.")
  process.exit(1)
}

// ── 24 Past Buyers — Berwick / Casey corridor ─────────────────────────────────

const BUYERS = [
  // ── Owner-occupiers ──────────────────────────────────────────────────────
  {
    id: 5001, name: "David & Karen Hollis", phone: "0418 234 567",
    email: "k.hollis@gmail.com",
    purchaseAddress: "8 Thirlmere Court, Berwick", suburb: "Berwick",
    purchaseDate: "2017-03-15", purchasePrice: 620000, deposit: 124000,
    propertyType: "House", beds: 4, baths: 2, land: 610,
    status: "owner-occupier",
    notes: "Lovely family. Two kids at Berwick Primary — Ella (yr 5) and Oscar (yr 3). Karen volunteers at the school canteen. David works in the city, catches the 6:42am train. They love the court position and the park across from Thirlmere. Karen mentioned wanting a bigger kitchen when they had everyone over at Christmas.",
    lastContactDate: "2024-11-20"
  },
  {
    id: 5002, name: "Michael Chen", phone: "0411 567 890",
    email: "m.chen.property@outlook.com",
    purchaseAddress: "14 Whitecliffe Way, Berwick", suburb: "Berwick",
    purchaseDate: "2015-08-22", purchasePrice: 545000, deposit: 109000,
    propertyType: "House", beds: 5, baths: 3, land: 718,
    status: "owner-occupier",
    notes: "Michael and Fiona. Both kids have moved out — daughter in Fitzroy, son in Brisbane. House feels too big now. Michael semi-retired from engineering, Fiona still works part-time as a physio. He mentioned he'd love to be closer to the coast. Very analytical, will want to see numbers before deciding.",
    lastContactDate: "2023-06-15"
  },
  {
    id: 5003, name: "Sandra Moore", phone: "0422 891 234",
    email: "sandra.moore2@gmail.com",
    purchaseAddress: "22 Birchwood Drive, Berwick", suburb: "Berwick",
    purchaseDate: "2020-02-10", purchasePrice: 710000, deposit: 71000,
    propertyType: "House", beds: 3, baths: 2, land: 480,
    status: "owner-occupier",
    notes: "Single mum, absolute trooper. Has two boys (7 and 5) and third baby due August 2026. Current 3-bed is getting very tight. She mentioned wanting a study nook for working from home. Very budget-conscious but knows she needs more space. School zone is important — wants to stay in Berwick Chase catchment.",
    lastContactDate: "2025-03-01"
  },
  {
    id: 5004, name: "James & Lisa Thompson", phone: "0404 123 456",
    email: "jlthompson@hotmail.com",
    purchaseAddress: "18 Ascot Rise, Berwick", suburb: "Berwick",
    purchaseDate: "2018-11-30", purchasePrice: 785000, deposit: 157000,
    propertyType: "House", beds: 4, baths: 2, land: 648,
    status: "owner-occupier",
    notes: "James is a plumber, Lisa is a nurse at Casey Hospital. Both kids have finished uni and moved out. Lisa mentioned at the last catch-up that the garden is too much work now. They've been talking about a townhouse in Narre Warren South — less maintenance, closer to the shops. Lisa is the decision maker.",
    lastContactDate: "2024-06-01"
  },
  {
    id: 5006, name: "Sarah & Tom Mitchell", phone: "0413 445 678",
    email: "smitchell.family@gmail.com",
    purchaseAddress: "31 Hawthorne Park Drive, Narre Warren South", suburb: "Narre Warren South",
    purchaseDate: "2016-06-20", purchasePrice: 695000, deposit: 139000,
    propertyType: "House", beds: 4, baths: 2, land: 590,
    status: "owner-occupier",
    notes: "Sarah and Tom have three kids — oldest just started Year 7. Tom works at Bunnings head office, Sarah is a school teacher. They absolutely love the street and the neighbours. Tom mentioned at the last open home catch-up that they've been thinking about a pool. Might be a renovate vs sell decision for them.",
    lastContactDate: "2024-08-14"
  },
  {
    id: 5008, name: "Paul Donovan", phone: "0499 334 112",
    email: "pdonovan55@yahoo.com.au",
    purchaseAddress: "11 Lakeside Boulevard, Officer", suburb: "Officer",
    purchaseDate: "2019-09-05", purchasePrice: 650000, deposit: 65000,
    propertyType: "House", beds: 4, baths: 2, land: 540,
    status: "owner-occupier",
    notes: "Paul is a single dad — his two teenagers are almost done with school and looking at uni in the city. He works remotely for a logistics company. Mentioned he feels a bit isolated out in Officer and would prefer somewhere closer to family in Cranbourne. Good equity position, realistic about the market.",
    lastContactDate: "2024-09-30"
  },
  {
    id: 5010, name: "Emma & Josh Wilson", phone: "0406 789 012",
    email: "emma.wilson.home@gmail.com",
    purchaseAddress: "45 Somerfield Circuit, Berwick", suburb: "Berwick",
    purchaseDate: "2018-04-18", purchasePrice: 785000, deposit: 157000,
    propertyType: "House", beds: 5, baths: 3, land: 702,
    status: "owner-occupier",
    notes: "Emma and Josh are a high-energy couple — Josh runs a gym, Emma is a dental hygienist. They've renovated the kitchen and master suite beautifully. Third kid on the way and they're already looking at properties in Pakenham Upper or Gembrook for some land. Said they'd probably sell mid-2026 when Emma is back at work.",
    lastContactDate: "2025-01-08"
  },
  {
    id: 5011, name: "Frank & Maria Russo", phone: "0417 223 445",
    email: "russo.frank@bigpond.com",
    purchaseAddress: "3 Camelot Court, Berwick", suburb: "Berwick",
    purchaseDate: "2013-07-10", purchasePrice: 455000, deposit: 91000,
    propertyType: "House", beds: 4, baths: 2, land: 672,
    status: "owner-occupier",
    notes: "Frank and Maria are both in their late 60s and ready to downsize. Frank retired from the council last year. Maria has had some health issues and wants something single-level, smaller garden, closer to the Berwick Village. Both their kids are in Berwick so staying in the suburb is non-negotiable. Very motivated.",
    lastContactDate: "2024-10-05"
  },
  {
    id: 5012, name: "Derek & Shannon O'Brien", phone: "0421 667 889",
    email: "shannobrien@gmail.com",
    purchaseAddress: "27 Springvale Road, Officer", suburb: "Officer",
    purchaseDate: "2018-02-22", purchasePrice: 675000, deposit: 67500,
    propertyType: "House", beds: 4, baths: 2, land: 515,
    status: "owner-occupier",
    notes: "Derek got a job offer in Brisbane — they are seriously considering a move interstate. Shannon is on the fence. They have two kids in primary school which complicates things. Derek mentioned he would prefer to sell before they decide on the move rather than rent it out. Very warm, good relationship with Cameron.",
    lastContactDate: "2025-02-14"
  },
  {
    id: 5013, name: "Jessica Tang", phone: "0433 556 778",
    email: "j.tang.property@gmail.com",
    purchaseAddress: "62 Hampton Park Drive, Narre Warren South", suburb: "Narre Warren South",
    purchaseDate: "2021-03-12", purchasePrice: 890000, deposit: 89000,
    propertyType: "House", beds: 5, baths: 3, land: 621,
    status: "owner-occupier",
    notes: "Jessica went through a divorce last year. The house is far too big for one person now. She works in finance in the city and is looking at a low-maintenance apartment or townhouse in Berwick or Narre Warren South. She's emotionally ready to move but practical about timing — wants to sell in spring when the market is better.",
    lastContactDate: "2025-04-20"
  },

  // ── Investors ─────────────────────────────────────────────────────────────
  {
    id: 5005, name: "Robert Patel", phone: "0431 678 901",
    email: "rob.patel@gmail.com",
    purchaseAddress: "7 Heritage Court, Berwick", suburb: "Berwick",
    purchaseDate: "2019-05-14", purchasePrice: 680000, deposit: 136000,
    propertyType: "House", beds: 4, baths: 2, land: 601,
    status: "investor",
    notes: "Investment property — Rob lives in South Yarra. Currently tenanted at $520/wk. Tenant lease expires November 2026. Rob mentioned he's thinking about selling one of his three IPs to free up capital for a commercial investment in Dandenong. Very numbers-driven, responds to yield and tax analysis.",
    lastContactDate: "2025-01-15"
  },
  {
    id: 5007, name: "Wei & Helen Zhang", phone: "0408 990 112",
    email: "weizhang.invest@outlook.com",
    purchaseAddress: "19 Meridian Close, Narre Warren South", suburb: "Narre Warren South",
    purchaseDate: "2014-11-08", purchasePrice: 580000, deposit: 116000,
    propertyType: "House", beds: 4, baths: 2, land: 665,
    status: "investor",
    notes: "Wei and Helen own two IPs in the Berwick corridor. This one is rented at $540/wk on a 12-month lease. Helen called last month asking about current values — she said they want to consolidate their portfolio into one better property closer to the CBD. Very investment-minded, will move quickly if the numbers make sense.",
    lastContactDate: "2025-03-22"
  },
  {
    id: 5009, name: "Anthony Nguyen", phone: "0455 334 667",
    email: "a.nguyen.prop@gmail.com",
    purchaseAddress: "88 Ormond Road, Pakenham", suburb: "Pakenham",
    purchaseDate: "2017-07-14", purchasePrice: 485000, deposit: 48500,
    propertyType: "House", beds: 3, baths: 2, land: 450,
    status: "investor",
    notes: "Anthony is a builder living in Seaford. This was his first IP — bought it with a 10% deposit when he was 24. It's been rented solidly for 7 years. He mentioned he wants to use the equity to build a spec home in Clyde North. Younger investor, comfortable with risk, just needs to see the equity number to pull the trigger.",
    lastContactDate: "2024-07-30"
  },
  {
    id: 5014, name: "Kevin & Linda Park", phone: "0412 445 667",
    email: "kevinpark.invest@hotmail.com",
    purchaseAddress: "5 Sunridge Place, Berwick", suburb: "Berwick",
    purchaseDate: "2015-10-28", purchasePrice: 625000, deposit: 125000,
    propertyType: "House", beds: 4, baths: 2, land: 585,
    status: "investor",
    notes: "Kevin and Linda own three investment properties — this is one of them. Linda handles the portfolio management. She rang last quarter asking about the suburb trends. They are considering selling this one because the rental yield has softened and they want to invest in regional Victoria instead. Very process-driven, will want a full CMA.",
    lastContactDate: "2024-12-01"
  },
  {
    id: 5018, name: "Sanjay Kumar", phone: "0488 223 445",
    email: "s.kumar.property@gmail.com",
    purchaseAddress: "14 Wattle Grove Crescent, Cranbourne", suburb: "Cranbourne",
    purchaseDate: "2018-06-14", purchasePrice: 495000, deposit: 49500,
    propertyType: "Townhouse", beds: 3, baths: 2, land: 220,
    status: "investor",
    notes: "Sanjay is an IT contractor, lives in Carlton. This townhouse has been rented at $390/wk but the body corp fees have crept up to $3,200/year. Net yield is softer than he'd like. He told me at a function last year that he was considering selling in 2025-2026 and moving the capital into shares. Needs a solid comparable sales analysis.",
    lastContactDate: "2024-05-10"
  },
  {
    id: 5020, name: "Lucy Chen", phone: "0400 667 889",
    email: "lucychen.au@gmail.com",
    purchaseAddress: "38 Sunbury Road, Endeavour Hills", suburb: "Endeavour Hills",
    purchaseDate: "2019-04-09", purchasePrice: 680000, deposit: 68000,
    propertyType: "House", beds: 4, baths: 2, land: 510,
    status: "investor",
    notes: "Lucy moved to Brisbane two years ago for work and has been renting this out since. She's paying a PM fee and has had maintenance issues — hot water system replaced last year. She's been asking friends whether it's a good time to sell. Emotionally detached from the property, primarily interested in the net proceeds figure.",
    lastContactDate: "2024-11-05"
  },
  {
    id: 5023, name: "Jack Lam", phone: "0422 334 556",
    email: "j.lam.invest@gmail.com",
    purchaseAddress: "101 Clyde Road, Clyde North", suburb: "Clyde North",
    purchaseDate: "2020-08-18", purchasePrice: 760000, deposit: 76000,
    propertyType: "House", beds: 5, baths: 3, land: 448,
    status: "investor",
    notes: "Jack is a pharmacist who bought this new estate property as an IP. It's appreciated strongly in 4 years. He mentioned at a property seminar he attended (I was a speaker) that he was watching the market for the right time to sell and reinvest in commercial property. Methodical thinker, responds well to data. CGT planning is important to him.",
    lastContactDate: "2025-02-28"
  },

  // ── Upsizers / life stage change ─────────────────────────────────────────
  {
    id: 5015, name: "Chris & Amanda Brown", phone: "0416 778 990",
    email: "cabrown.family@gmail.com",
    purchaseAddress: "72 Princes Highway, Hallam", suburb: "Hallam",
    purchaseDate: "2016-09-05", purchasePrice: 520000, deposit: 52000,
    propertyType: "House", beds: 3, baths: 2, land: 385,
    status: "owner-occupier",
    notes: "Chris works in trade sales, Amanda is a bookkeeper working from home. They have a 10-year-old and a 7-year-old. The 3-bed in Hallam is feeling cramped — Amanda needs a proper office. They've been driving around Officer and Berwick on weekends looking at open homes. Very active buyers, just need to make the sale decision first.",
    lastContactDate: "2025-01-22"
  },
  {
    id: 5016, name: "Mel & Brad Foster", phone: "0403 112 334",
    email: "fostermelb@gmail.com",
    purchaseAddress: "29 Grandview Boulevard, Officer", suburb: "Officer",
    purchaseDate: "2020-12-10", purchasePrice: 730000, deposit: 73000,
    propertyType: "House", beds: 4, baths: 3, land: 490,
    status: "owner-occupier",
    notes: "Mel and Brad have a 2-year-old and Mel is expecting their second. Brad works in construction management. Their current 4-bed is great but they'd love an extra bedroom for a dedicated study/craft room for Mel. Budget is tight so they'd need to sell first. Brad is a slow decision maker — Mel drives the property conversations.",
    lastContactDate: "2024-10-15"
  },
  {
    id: 5021, name: "Ben & Kate Murray", phone: "0411 889 001",
    email: "murrayhouse2021@gmail.com",
    purchaseAddress: "55 Ashwood Drive, Officer", suburb: "Officer",
    purchaseDate: "2021-06-22", purchasePrice: 795000, deposit: 79500,
    propertyType: "House", beds: 4, baths: 2, land: 465,
    status: "owner-occupier",
    notes: "Ben is a high school teacher, Kate is a marketing manager. Second baby due in four months. They'd love a 5th bedroom for a nursery + study. Ben mentioned they've been on a few open homes but haven't found the right property yet. Kate said she follows the Berwick market closely on Domain. They're realistic and not in a rush.",
    lastContactDate: "2025-04-01"
  },

  // ── Downsizers / empty nesters ────────────────────────────────────────────
  {
    id: 5017, name: "Lisa & Graham Scott", phone: "0418 556 778",
    email: "scottfamily.berwick@gmail.com",
    purchaseAddress: "14 Sherwood Way, Berwick", suburb: "Berwick",
    purchaseDate: "2017-08-04", purchasePrice: 810000, deposit: 162000,
    propertyType: "House", beds: 5, baths: 3, land: 740,
    status: "owner-occupier",
    notes: "Lisa and Graham are both in their mid-50s — youngest daughter just moved to Melbourne CBD. Graham is thinking about semi-retirement. Lisa said at our last catch-up 'when the time is right, we'll downsize.' The 5-bedroom is enormous for two people. Graham does woodworking in the garage so he'd want a new place with a decent shed.",
    lastContactDate: "2024-07-10"
  },
  {
    id: 5019, name: "Danny & Trish Watts", phone: "0420 667 889",
    email: "dwatts1958@hotmail.com",
    purchaseAddress: "8 Parkview Terrace, Narre Warren South", suburb: "Narre Warren South",
    purchaseDate: "2016-03-15", purchasePrice: 650000, deposit: 130000,
    propertyType: "House", beds: 4, baths: 2, land: 605,
    status: "owner-occupier",
    notes: "Danny worked at Ford Broadmeadows for 30 years, now retired. Trish is a part-time florist. Both in their early 60s. Kids all grown up and interstate. Danny mentioned his knees aren't great so stairs are becoming an issue — they want something single-level, low maintenance, ideally closer to the lakes. Very genuine people, extremely loyal.",
    lastContactDate: "2024-09-12"
  },
  {
    id: 5022, name: "Steve & Di Lawson", phone: "0417 334 556",
    email: "di.lawson@gmail.com",
    purchaseAddress: "77 Canberra Street, Berwick", suburb: "Berwick",
    purchaseDate: "2013-05-18", purchasePrice: 430000, deposit: 86000,
    propertyType: "House", beds: 4, baths: 2, land: 630,
    status: "owner-occupier",
    notes: "Steve had a health scare last year — triple bypass. He's fully recovered but it changed their priorities. Di has been pushing to downsize to something manageable. The garden is high-maintenance and they both want to travel more. They have a lot of equity and Di mentioned a 2-bed villa in Berwick Village would be perfect. Di will make the call.",
    lastContactDate: "2025-03-28"
  },

  // ── Buyer → Landlord (upsizing, want to keep current home as IP) ─────────
  {
    id: 5026, name: "Darren & Kylie Holt", phone: "0408 112 334",
    email: "dkyholt@gmail.com",
    purchaseAddress: "6 Ramsay Court, Berwick", suburb: "Berwick",
    purchaseDate: "2019-07-20", purchasePrice: 680000, deposit: 68000,
    propertyType: "House", beds: 3, baths: 2, land: 450,
    status: "buyer→landlord",
    notes: "Darren and Kylie have outgrown their 3-bed since having a third kid. They've been seriously looking at 4-5 bed homes in Berwick or Narre Warren South. Kylie is keen to KEEP the Ramsay Court house and rent it out — she said 'it's basically paid itself off.' Darren is on the fence but warming to the idea. They need to understand the rental yield and whether the bank will allow them to hold both. Great relationship — very open to advice.",
    lastContactDate: "2025-02-10"
  },
  {
    id: 5027, name: "Tim & Alicia Nguyen", phone: "0421 445 667",
    email: "timalivianguyen@gmail.com",
    purchaseAddress: "23 Huntington Drive, Officer", suburb: "Officer",
    purchaseDate: "2018-11-14", purchasePrice: 650000, deposit: 65000,
    propertyType: "House", beds: 4, baths: 2, land: 510,
    status: "buyer→landlord",
    notes: "Tim is a civil engineer, Alicia is a pharmacist. No kids yet but they're actively trying. They've built up solid equity and Tim mentioned at a BBQ that he wants to buy a new place and keep this one — he calls it 'building a passive income portfolio one house at a time.' Very financially savvy. Alicia is more conservative and wants to clear the mortgage on the current place first. The conversation is ongoing.",
    lastContactDate: "2025-01-05"
  },
  {
    id: 5028, name: "Mark Stellios", phone: "0414 778 990",
    email: "mark.stellios@outlook.com",
    purchaseAddress: "48 Junction Road, Narre Warren South", suburb: "Narre Warren South",
    purchaseDate: "2016-04-08", purchasePrice: 590000, deposit: 118000,
    propertyType: "House", beds: 4, baths: 2, land: 572,
    status: "buyer→landlord",
    notes: "Mark is divorced, kids are every second week. He wants to upsize to a 5-bed for when he has the kids (his partner Amy moves in part-time). His plan is to keep the current 4-bed as a rental — his brother offered to manage it informally. He's got strong equity and the bank pre-approval looks likely. Mark is decisive when he's ready to move. Needs a property with a guest room and double garage.",
    lastContactDate: "2024-12-20"
  },
  {
    id: 5029, name: "Sophie & Aaron Walsh", phone: "0433 223 445",
    email: "soph.walsh.au@gmail.com",
    purchaseAddress: "12 Crescent Drive, Berwick", suburb: "Berwick",
    purchaseDate: "2020-09-11", purchasePrice: 745000, deposit: 74500,
    propertyType: "House", beds: 4, baths: 2, land: 495,
    status: "buyer→landlord",
    notes: "Sophie and Aaron both work in healthcare — Sophie is a midwife, Aaron is a paramedic. No kids. They're high-income earners and want to use their equity to start a property portfolio. They attended one of Cameron's open homes in Pakenham out of curiosity and asked lots of smart questions. Their plan is to buy a second property and eventually have two IPs. Need guidance on which strategy makes more sense: sell vs hold.",
    lastContactDate: "2025-03-15"
  },
  {
    id: 5030, name: "Greg & Denise Hoffman", phone: "0405 334 556",
    email: "greghoffman58@bigpond.com",
    purchaseAddress: "35 Ferndale Close, Berwick", suburb: "Berwick",
    purchaseDate: "2017-02-28", purchasePrice: 710000, deposit: 142000,
    propertyType: "House", beds: 4, baths: 2, land: 620,
    status: "buyer→landlord",
    notes: "Greg and Denise are empty nesters. Youngest finished Year 12 last year. Denise's mother recently moved to a retirement village which has freed up a lot of their emotional bandwidth. They're considering a sea change to Inverloch or Wonthaggi — Greg's dream is to retire to the coast by 60 (he's 57). Plan is to keep the Berwick house as a rental and buy something smaller on the coast. Very open to a full strategy conversation.",
    lastContactDate: "2025-04-05"
  },
  {
    id: 5031, name: "Chloe & James Parker", phone: "0425 889 001",
    email: "chloe.jamesparker@gmail.com",
    purchaseAddress: "9 Westmore Way, Clyde North", suburb: "Clyde North",
    purchaseDate: "2021-02-17", purchasePrice: 820000, deposit: 82000,
    propertyType: "House", beds: 4, baths: 2, land: 448,
    status: "buyer→landlord",
    notes: "Chloe and James are both in their early 30s — Chloe is a UX designer, James is a software developer at Seek. They bought new in Clyde North's Eliston estate. They've been talking about moving to Berwick or Narre Warren South for better school zoning for their daughter (starting school in 2027). Their preference is to keep Clyde North as an IP and buy the family home. Mortgage broker is already on board. Just need to find the right property.",
    lastContactDate: "2025-05-01"
  },

  // ── Buyer → Seller (previously bought, now actively ready to list) ────────
  {
    id: 5032, name: "Ian & Cheryl Broadbent", phone: "0416 001 223",
    email: "ianbroadbent.berwick@gmail.com",
    purchaseAddress: "19 Silkwood Rise, Berwick", suburb: "Berwick",
    purchaseDate: "2015-06-12", purchasePrice: 645000, deposit: 129000,
    propertyType: "House", beds: 4, baths: 2, land: 598,
    status: "buyer→seller",
    notes: "Ian and Cheryl bought through Cameron in 2015. Both kids are now at uni interstate. They've been watching the market for about 18 months. Ian called last month and said 'we're ready when you are.' Cheryl wants to sell before winter and move into a low-maintenance villa in Berwick. Ian is fully on board. They are one of Cameron's warmest listings — just needs the call to confirm appraisal date.",
    lastContactDate: "2025-05-10"
  },
  {
    id: 5033, name: "Raj & Priya Sharma", phone: "0413 667 889",
    email: "rajpriya.sharma@gmail.com",
    purchaseAddress: "67 Outlook Drive, Narre Warren South", suburb: "Narre Warren South",
    purchaseDate: "2016-08-30", purchasePrice: 720000, deposit: 144000,
    propertyType: "House", beds: 5, baths: 3, land: 670,
    status: "buyer→seller",
    notes: "Raj is a pharmacist, Priya runs a childcare centre. Both born in India, highly community-oriented. Their three kids are grown up now. Priya messaged two months ago asking for a market appraisal — she said 'we've been here long enough, time to let someone else enjoy it.' They want to move to a townhouse in the Berwick Village precinct. Raj wants to understand CGT implications first. Very motivated to act in the next 3 months.",
    lastContactDate: "2025-04-15"
  },
  {
    id: 5034, name: "Nicole Harrison", phone: "0402 556 778",
    email: "nicole.harrison.au@gmail.com",
    purchaseAddress: "53 Cedar Creek Road, Harkaway", suburb: "Harkaway",
    purchaseDate: "2018-03-22", purchasePrice: 950000, deposit: 190000,
    propertyType: "Acreage", beds: 4, baths: 2, land: 4200,
    status: "buyer→seller",
    notes: "Nicole is a senior account manager at ANZ, recently separated. She bought the Harkaway acreage with her ex — managing 4,200m² alone has become too much. She's emotionally done with the property and wants a clean start. Looking at a townhouse or modern home in Berwick or Officer. She's given herself a firm deadline of end of 2026. Very organised, will want clear process steps. Handle with sensitivity — separation is recent.",
    lastContactDate: "2025-03-05"
  },
  {
    id: 5035, name: "Brendan & Jo Ellis", phone: "0417 334 556",
    email: "brendanjoellis@hotmail.com",
    purchaseAddress: "8 Wentworth Boulevard, Officer", suburb: "Officer",
    purchaseDate: "2019-04-15", purchasePrice: 760000, deposit: 76000,
    propertyType: "House", beds: 4, baths: 2, land: 530,
    status: "buyer→seller",
    notes: "Brendan drives trucks interstate, Jo is a teacher's aide at Berwick College. Their youngest just got a full footy scholarship in WA and is moving in July. Jo mentioned she cried about it but also said 'time to sell the big house.' They want to move to a low-maintenance 3-bed in Pakenham closer to Jo's mum. Brendan is away a lot so Jo handles the house stuff. Very genuine and warm — good relationship from when they bought.",
    lastContactDate: "2025-04-28"
  },
  {
    id: 5036, name: "Andrew Kim", phone: "0488 112 334",
    email: "andrew.kim.au@gmail.com",
    purchaseAddress: "14 Beauchamp Road, Berwick", suburb: "Berwick",
    purchaseDate: "2020-07-01", purchasePrice: 815000, deposit: 163000,
    propertyType: "House", beds: 4, baths: 2, land: 540,
    status: "buyer→seller",
    notes: "Andrew is a data scientist at Telstra. He bought this property when he was in a serious relationship — that didn't work out. He's been living here alone for the past 2 years and has now made the call to sell and move closer to the CBD. He's very analytical — expects a full comp analysis before listing. He'll move fast once he's satisfied with the data. Has already spoken to a mortgage broker about buying in Fitzroy North.",
    lastContactDate: "2025-05-15"
  },
  {
    id: 5037, name: "Mick & Tracey O'Sullivan", phone: "0403 778 990",
    email: "osullivanberwick@gmail.com",
    purchaseAddress: "26 Sandalwood Grove, Berwick", suburb: "Berwick",
    purchaseDate: "2014-09-16", purchasePrice: 540000, deposit: 108000,
    propertyType: "House", beds: 4, baths: 2, land: 635,
    status: "buyer→seller",
    notes: "Mick runs an electrical contracting business, Tracey is a dental receptionist. They've owned this 11 years and renovated the kitchen and bathrooms beautifully. Tracey called last week to say they're 'definitely listing this year.' They want to buy in Somerville or Mornington to be near Tracey's parents. Mick wants to make sure they get top dollar — he's proud of what they've done to the place. Appraisal conversation is overdue.",
    lastContactDate: "2025-05-18"
  },
  {
    id: 5038, name: "Yuki & David Tanaka", phone: "0431 223 445",
    email: "yukitanaka.melb@gmail.com",
    purchaseAddress: "4 Stonybrook Close, Narre Warren", suburb: "Narre Warren",
    purchaseDate: "2017-05-30", purchasePrice: 685000, deposit: 137000,
    propertyType: "House", beds: 4, baths: 2, land: 560,
    status: "buyer→seller",
    notes: "Yuki is a nurse manager, David works in IT security. They have two high-school kids. David got offered a 2-year secondment at Microsoft in Sydney, which they're taking. They want to sell the Narre Warren house before they go — too much risk leaving it vacant or dealing with tenants from interstate. Very organised, want a smooth sale process. Yuki is the main point of contact. Target departure is August/September.",
    lastContactDate: "2025-04-12"
  },

  // ── Renter → Buyer (previously renting, now ready / able to purchase) ─────
  {
    id: 5039, name: "Josh & Amber Reid", phone: "0407 556 778",
    email: "joshamber.reid@gmail.com",
    purchaseAddress: "Renting — 15 Fairway Drive, Berwick", suburb: "Berwick",
    purchaseDate: "2025-01-01", purchasePrice: 0, deposit: 60000,
    propertyType: "House", beds: 0, baths: 0, land: 0,
    status: "renter→buyer",
    notes: "Josh and Amber are renting in Berwick at $570/wk. Josh is a carpenter, Amber is a bookkeeper. They've been saving for 4 years and now have a $60k deposit plus FHOG. They attended Cameron's open home on Somerfield Circuit earlier this year and were well-researched. Pre-approval in progress through their broker. Amber has a Domain alert set for every new listing. They're very close to buying — budget around $680k-$720k, want at least 450m² land.",
    lastContactDate: "2025-05-02"
  },
  {
    id: 5040, name: "Priya Nair", phone: "0422 889 001",
    email: "priyanair.melb@gmail.com",
    purchaseAddress: "Renting — 8 Rosewood Drive, Narre Warren South", suburb: "Narre Warren South",
    purchaseDate: "2025-01-01", purchasePrice: 0, deposit: 80000,
    propertyType: "Unit", beds: 0, baths: 0, land: 0,
    status: "renter→buyer",
    notes: "Priya is a solicitor who moved to Berwick for work 3 years ago and has been renting. She's single but wants to buy her own place — 'tired of paying someone else's mortgage,' she said. She has $80k saved and solid income. Looking for a 3-bed townhouse or standalone 3-bed in Berwick, Narre Warren South, or Officer. Maximum budget $750k. She attended two of Cameron's open homes and follows the market keenly. Will be a decisive buyer when she finds the right fit.",
    lastContactDate: "2025-03-20"
  },
  {
    id: 5041, name: "Sam & Ella Kovacs", phone: "0415 334 556",
    email: "samella.kovacs@gmail.com",
    purchaseAddress: "Renting — 42 McMahon Road, Berwick", suburb: "Berwick",
    purchaseDate: "2025-01-01", purchasePrice: 0, deposit: 55000,
    propertyType: "House", beds: 0, baths: 0, land: 0,
    status: "renter→buyer",
    notes: "Sam is a mechanic, Ella is a nurse at Casey Hospital. They have a 3-year-old daughter. Both 28 years old, renting for 5 years. They missed out on a property in Cranbourne North last year (outbid by $25k) and were devastated — that actually pushed them to get really serious. Pre-approval is confirmed at $650k. They want to stay in Berwick school zone. Ella is very emotionally invested in the process. Sam wants something with a double garage.",
    lastContactDate: "2025-04-22"
  },
  {
    id: 5042, name: "Tom & Grace Osei", phone: "0402 667 889",
    email: "tgosei@gmail.com",
    purchaseAddress: "Renting — 77 Princes Highway, Berwick", suburb: "Berwick",
    purchaseDate: "2025-01-01", purchasePrice: 0, deposit: 95000,
    propertyType: "House", beds: 0, baths: 0, land: 0,
    status: "renter→buyer",
    notes: "Tom is a project manager at a civil engineering firm, Grace is a speech therapist. Originally from Ghana, been in Australia 6 years. They're citizens now and fully ready to buy. $95k deposit, pre-approved to $820k. They attended an open home in Berwick and were extremely polite and thorough — asked great questions about school catchments and public transport. Want a 4-bed with room for Grace's parents to visit. In no rush but will move quickly for the right property.",
    lastContactDate: "2025-05-08"
  },
  {
    id: 5043, name: "Connor Byrne", phone: "0430 001 223",
    email: "connorbyrne.au@gmail.com",
    purchaseAddress: "Renting — 31 Fairview Boulevard, Officer", suburb: "Officer",
    purchaseDate: "2025-01-01", purchasePrice: 0, deposit: 45000,
    propertyType: "Unit", beds: 0, baths: 0, land: 0,
    status: "renter→buyer",
    notes: "Connor is 26, works as a diesel mechanic at a transport depot in Dandenong. Single, no kids. His dad encouraged him to get into property and he's taken it seriously. He's been renting for 3 years and has just hit the $45k mark. Eligible for FHOG and First Home Guarantee (5% deposit). He's very motivated but a little nervous — first-time buyer, first in family. Wants a modest 3-bed in Officer or Pakenham around $580k-$620k. Will need hand-holding through the process.",
    lastContactDate: "2025-03-30"
  },
  {
    id: 5044, name: "Vikram & Lena Bhat", phone: "0412 778 990",
    email: "v.bhat.melb@gmail.com",
    purchaseAddress: "Renting — 18 Parkside Court, Berwick", suburb: "Berwick",
    purchaseDate: "2025-01-01", purchasePrice: 0, deposit: 120000,
    propertyType: "House", beds: 0, baths: 0, land: 0,
    status: "renter→buyer",
    notes: "Vikram is an anaesthetist at Monash, Lena is a GP. Dual high income, been renting by choice while establishing their careers. They now have $120k saved and are ready to buy a quality family home. Budget $950k–$1.1m. Looking for something in a premium Berwick street — Maranatha Estate or similar. They are particular about fit and finish and will take their time. They want Cameron's honest suburb-level advice, not a sales pitch. Treat them as peers.",
    lastContactDate: "2025-04-30"
  },

  // ── Buyer → Downsizer (family home owners ready to right-size) ────────────
  {
    id: 5045, name: "Ross & Patricia McLeod", phone: "0419 445 667",
    email: "ross.mcleod.berwick@gmail.com",
    purchaseAddress: "66 Silkwood Rise, Berwick", suburb: "Berwick",
    purchaseDate: "2015-07-14", purchasePrice: 780000, deposit: 156000,
    propertyType: "House", beds: 5, baths: 3, land: 720,
    status: "buyer→downsizer",
    notes: "Ross is a retired dentist, Patricia a retired teacher. Both 64. Three adult kids all interstate. Ross has been talking about downsizing for two years but Patricia is emotionally attached to the garden. She recently said 'I think I'm ready now' — which is a big shift. They want a single-level 2 or 3-bed in Berwick Village with a courtyard or small garden. No stairs is non-negotiable for Patricia (hip replacement due next year). Strong financial position — property fully paid off.",
    lastContactDate: "2024-11-15"
  },
  {
    id: 5046, name: "Phil & Margaret Hart", phone: "0418 001 223",
    email: "p.hart.1960@hotmail.com",
    purchaseAddress: "34 Grandview Boulevard, Officer", suburb: "Officer",
    purchaseDate: "2016-10-20", purchasePrice: 725000, deposit: 145000,
    propertyType: "House", beds: 5, baths: 2, land: 695,
    status: "buyer→downsizer",
    notes: "Phil worked as a plumber for 40 years, now retired. Margaret still does casual work at Coles. They bought the 5-bed when all four kids were still at home. Now it's just them rattling around. Phil mentioned the upkeep is 'killing him' — gutters, painting, lawns. They've been talking to some of the other couples at Phil's Men's Shed about the downsizing process. Want something manageable — 2-bed + study, lock up and leave, near a golf course ideally.",
    lastContactDate: "2024-10-25"
  },
  {
    id: 5047, name: "Cheryl Donaldson", phone: "0423 334 556",
    email: "cheryl.donaldson59@gmail.com",
    purchaseAddress: "7 Yarrabee Way, Berwick", suburb: "Berwick",
    purchaseDate: "2014-03-07", purchasePrice: 495000, deposit: 99000,
    propertyType: "House", beds: 4, baths: 2, land: 580,
    status: "buyer→downsizer",
    notes: "Cheryl is a widow — husband Trevor passed away 18 months ago after a long illness. She's managing OK but said the big house is lonely and expensive to run. Both daughters have encouraged her to downsize to something near the Berwick Village strip. She attends the Berwick bowling club twice a week so she wants to stay close. Looking for a 2-bed villa or ground floor apartment. Proceeds from sale will top up her retirement savings. Handle with care and warmth — she trusts Cameron implicitly.",
    lastContactDate: "2025-02-22"
  },
  {
    id: 5048, name: "Barry & Anne Whitfield", phone: "0411 556 778",
    email: "whitfieldanne@gmail.com",
    purchaseAddress: "51 Somerfield Circuit, Berwick", suburb: "Berwick",
    purchaseDate: "2017-01-18", purchasePrice: 855000, deposit: 171000,
    propertyType: "House", beds: 5, baths: 3, land: 700,
    status: "buyer→downsizer",
    notes: "Barry is a retired accountant, Anne runs a small craft business online. Son in London, daughter in Brisbane. They're both 68 and ready to right-size. Barry wants to free up capital for travel — 'we want to see Europe properly while our knees still work,' he told Cameron at a function. Anne has been looking at townhouses near Berwick's high street. They're not in a rush but they're definitely in the mindset. A well-timed appraisal conversation would be very well received.",
    lastContactDate: "2024-09-08"
  },
  {
    id: 5049, name: "Norm & Val Perkins", phone: "0414 889 001",
    email: "normval.perkins@bigpond.com",
    purchaseAddress: "28 Hawthorn Park Drive, Narre Warren South", suburb: "Narre Warren South",
    purchaseDate: "2013-09-11", purchasePrice: 520000, deposit: 104000,
    propertyType: "House", beds: 4, baths: 2, land: 610,
    status: "buyer→downsizer",
    notes: "Norm worked at the council as an engineer, Val was a school librarian. Both retired. Four kids, all in their 30s and 40s, living across Melbourne. They bought through Cameron in 2013 when Cameron was just starting out — one of his earliest clients. Val mentioned at a community event that they were 'giving serious thought to downsizing.' Strong loyalty to Cameron. Have referred two people to him. Would be a meaningful listing and a good word-of-mouth opportunity.",
    lastContactDate: "2024-07-30"
  },
  {
    id: 5050, name: "Terry & Bev Cassidy", phone: "0420 223 445",
    email: "tncassidy@gmail.com",
    purchaseAddress: "16 Lakewood Avenue, Officer", suburb: "Officer",
    purchaseDate: "2018-05-25", purchasePrice: 770000, deposit: 154000,
    propertyType: "House", beds: 5, baths: 3, land: 660,
    status: "buyer→downsizer",
    notes: "Terry and Bev bought this 5-bed thinking the extended family would use it — that plan changed. Now it's just them. Terry has a chronic back condition and the stairs are a real problem. Bev mentioned she'd prefer a unit or single-storey townhouse in a complex with low maintenance. Their youngest still visits on weekends so they want at least a 2-bed with a quality spare room. Very pragmatic and process-focused. Terry will want a clear action plan and timeline before committing.",
    lastContactDate: "2025-03-12"
  },

  // ── Special situations ────────────────────────────────────────────────────
  {
    id: 5024, name: "Natalie & Brad Thompson", phone: "0405 778 990",
    email: "nbthompson.property@gmail.com",
    purchaseAddress: "9 Ironbark Circuit, Narre Warren South", suburb: "Narre Warren South",
    purchaseDate: "2022-02-28", purchasePrice: 920000, deposit: 184000,
    propertyType: "House", beds: 4, baths: 2, land: 512,
    status: "owner-occupier",
    notes: "Natalie and Brad bought this brand new in 2022 — stunning build, they love it. But Brad just got a significant promotion that requires a move to Sydney. They are torn. Natalie would prefer to rent it out but Brad thinks they should sell while the market is strong and buy something equally good in Sydney. Timing is the main constraint — Brad starts in September.",
    lastContactDate: "2025-04-30"
  },
  {
    id: 5025, name: "Peter & Robyn Clarke", phone: "0414 223 445",
    email: "pclarke.berwick@gmail.com",
    purchaseAddress: "41 Macquarie Drive, Berwick", suburb: "Berwick",
    purchaseDate: "2014-04-22", purchasePrice: 575000, deposit: 115000,
    propertyType: "House", beds: 4, baths: 2, land: 615,
    status: "owner-occupier",
    notes: "Peter is a retired schoolteacher, Robyn is a librarian going part-time this year. Both kids have long since left home. The garden backs onto the reserve which they love, but the 4-bed is just too much house. They've been talking about selling 'in the next year or two' for about three years now. Peter is the hesitant one. Robyn told me privately she's ready now.",
    lastContactDate: "2024-08-20"
  }
]

// ── POST each buyer ────────────────────────────────────────────────────────────

async function postBuyer(buyer) {
  const res = await fetch(SHEET_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ type: "add_past_buyer", ...buyer }),
  })
  const json = await res.json()
  return json
}

async function main() {
  console.log(`\n🏠  PropOS Past Buyers Seed`)
  console.log(`📋  Sheet URL: ${SHEET_URL.slice(0, 60)}...`)
  console.log(`📊  Seeding ${BUYERS.length} past buyers...\n`)

  let ok = 0, skipped = 0, failed = 0

  for (const buyer of BUYERS) {
    try {
      const result = await postBuyer(buyer)
      if (result.skipped) {
        console.log(`  ⏭  ${buyer.name} — already exists (row ${result.row})`)
        skipped++
      } else if (result.ok) {
        console.log(`  ✅  ${buyer.name} — added (row ${result.row})`)
        ok++
      } else {
        console.log(`  ❌  ${buyer.name} — error: ${result.error}`)
        failed++
      }
    } catch (err) {
      console.log(`  ❌  ${buyer.name} — network error: ${err.message}`)
      failed++
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 150))
  }

  console.log(`\n📈  Done: ${ok} added, ${skipped} skipped, ${failed} failed`)
  if (failed > 0) {
    console.log(`\n⚠️  Some buyers failed. Did you paste + deploy the new Apps Script first?`)
    console.log(`   File: docs/apps-script-complete.gs`)
    console.log(`   Steps: Extensions → Apps Script → paste → Deploy → New deployment`)
  } else {
    console.log(`\n🎉  All buyers are live. Reload PropOS and switch to Vendor mode.`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
