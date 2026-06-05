import { Router } from "express"
import {
  getAllThreads,
  getThread,
  getUnreadCount,
  markThreadRead,
  addReplyToThread,
  addAgentMessageToThread,
} from "../lib/conversations.js"

const router = Router()

/** GET /api/conversations — all threads, sorted newest-reply-first */
router.get("/", async (_req, res) => {
  try {
    const [threads, unread] = await Promise.all([getAllThreads(), getUnreadCount()])
    res.json({ threads, unread })
  } catch (err) {
    console.error("[conversations] GET / error:", (err as Error).message)
    res.status(500).json({ error: "Failed to load conversations" })
  }
})

/** GET /api/conversations/:phone — single thread by phone (URL-encoded) */
router.get("/:phone", async (req, res) => {
  let phone: string
  try {
    phone = decodeURIComponent(req.params.phone)
  } catch {
    return res.status(400).json({ error: "Invalid phone encoding" })
  }
  try {
    const thread = await getThread(phone)
    if (!thread) return res.status(404).json({ error: "Thread not found" })
    res.json({ thread })
  } catch (err) {
    console.error("[conversations] GET /:phone error:", (err as Error).message)
    res.status(500).json({ error: "Failed to load thread" })
  }
})

/** POST /api/conversations/:phone/read — mark thread as read */
router.post("/:phone/read", async (req, res) => {
  let phone: string
  try {
    phone = decodeURIComponent(req.params.phone)
  } catch {
    return res.status(400).json({ error: "Invalid phone encoding" })
  }
  try {
    await markThreadRead(phone)
    res.json({ ok: true })
  } catch (err) {
    console.error("[conversations] POST /:phone/read error:", (err as Error).message)
    res.status(500).json({ error: "Failed to mark thread read" })
  }
})

/**
 * POST /api/conversations/seed-demo
 * Creates obviously-fictional demo threads for offline demo use.
 * Phone numbers use the AU test range (+61490 prefix = fictitious by convention).
 */
router.post("/seed-demo", async (req, res) => {
  try {
    // Thread 1: Demo Buyer A — interested, asking questions
    const phone1 = process.env.TEST_RECIPIENT_PHONE?.trim() || "+61490000001"
    const meta1 = {
      leadId: "demo-001", leadName: "Alex Demo",
      propertyAddress: "17 Grand Arch Way, Berwick VIC", email: "demo.buyer.a@example.com",
    }
    await addAgentMessageToThread(phone1,
      "Hi Alex, Cameron here from Peake. Great to meet you at Thirlmere Court on Saturday! 17 Grand Arch Way just hit the market, 650sqm block in Berwick Primary catchment. Worth a look Saturday 10am? Cameron",
      meta1,
    )
    await addReplyToThread(phone1,
      "Thanks Cameron, sounds great. What's the land size compared to what we saw? And is Saturday 10am the only time?",
      meta1,
    )

    // Thread 2: Demo Buyer B — booking request
    const phone2 = "+61490000002"
    const meta2 = {
      leadId: "demo-002", leadName: "Sam Demo",
      propertyAddress: "17 Grand Arch Way, Berwick VIC", email: "demo.buyer.b@example.com",
    }
    await addAgentMessageToThread(phone2,
      "Hi Sam, Cameron from Peake Real Estate. We spoke at the Thirlmere Court open home. I have a new listing at 17 Grand Arch Way that ticks your boxes, Berwick Primary catchment and a big backyard. Open Saturday 10am. Cheers, Cameron",
      meta2,
    )
    await addReplyToThread(phone2,
      "Hi Cameron! Yes we'd love to come Saturday. Can we do 10:30 instead? We have swimming lessons at 9.",
      meta2,
    )

    // Thread 3: Demo Investor — rental yield question
    const phone3 = "+61490000003"
    const meta3 = {
      leadId: "demo-003", leadName: "Jordan Demo",
      propertyAddress: "17 Grand Arch Way, Berwick VIC", email: "demo.investor@example.com",
    }
    await addAgentMessageToThread(phone3,
      "Hi Jordan, Cameron from Peake. Following up from Thirlmere Court. 17 Grand Arch Way is a strong investment prospect, 4 bed on 650sqm. Happy to share comparable sales data. Kind regards, Cameron",
      meta3,
    )
    await addReplyToThread(phone3,
      "Cameron, what's the expected rental yield? And can you send me the recent comparable sales in that street?",
      meta3,
    )

    res.json({ ok: true, threads: 3 })
  } catch (err) {
    console.error("[seed-demo]", err)
    res.status(500).json({ error: "Failed to seed demo threads" })
  }
})

export default router
