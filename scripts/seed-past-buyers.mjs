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
