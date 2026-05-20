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
router.get("/", (_req, res) => {
  const threads = getAllThreads()
  res.json({ threads, unread: getUnreadCount() })
})

/** GET /api/conversations/:phone — single thread by phone (URL-encoded) */
router.get("/:phone", (req, res) => {
  const phone  = decodeURIComponent(req.params.phone)
  const thread = getThread(phone)
  if (!thread) return res.status(404).json({ error: "Thread not found" })
  res.json({ thread })
})

/** POST /api/conversations/:phone/read — mark thread as read */
router.post("/:phone/read", (req, res) => {
  markThreadRead(decodeURIComponent(req.params.phone))
  res.json({ ok: true })
})

/**
 * POST /api/conversations/seed-demo
 * Creates a fake lead reply thread for offline demo use.
 * Uses TEST_RECIPIENT_PHONE if set, otherwise a fixed demo number.
 */
router.post("/seed-demo", async (req, res) => {
  // Seed multiple realistic demo threads to show a live inbox

  // Thread 1: James Whitfield — interested, asking questions
  const phone1 = process.env.TEST_RECIPIENT_PHONE?.trim() || "+61412334891"
  const meta1 = {
    leadId:          "fb-001",
    leadName:        "James Whitfield",
    propertyAddress: "17 Grand Arch Way, Berwick VIC",
    email:           "james.whitfield@gmail.com",
  }
  await addAgentMessageToThread(phone1,
    "Hi James, Cameron here from Peake. Great to meet you at Thirlmere Court on Saturday! 17 Grand Arch Way just hit the market, 650sqm block in Berwick Primary catchment. Worth a look Saturday 10am? Cameron",
    meta1
  )
  await addReplyToThread(phone1,
    "Thanks Cameron, sounds great. What's the land size compared to what we saw? And is Saturday 10am the only time?",
    meta1
  )

  // Thread 2: Claire Thompson — booking request
  const phone2 = "+61423556781"
  const meta2 = {
    leadId:          "fb-002",
    leadName:        "Claire Thompson",
    propertyAddress: "17 Grand Arch Way, Berwick VIC",
    email:           "claire.thompson@hotmail.com",
  }
  await addAgentMessageToThread(phone2,
    "Hi Claire, Cameron from Peake Real Estate. We spoke at the Thirlmere Court open home. I have a new listing at 17 Grand Arch Way that ticks your boxes, Berwick Primary catchment and a big backyard. Open Saturday 10am. Cheers, Cameron",
    meta2
  )
  await addReplyToThread(phone2,
    "Hi Cameron! Yes we'd love to come Saturday. Can we do 10:30 instead? We have swimming lessons at 9.",
    meta2
  )

  // Thread 3: Michael Tran — investor question
  const phone3 = "+61401228559"
  const meta3 = {
    leadId:          "fb-003",
    leadName:        "Michael Tran",
    propertyAddress: "17 Grand Arch Way, Berwick VIC",
    email:           "m.tran@yahoo.com.au",
  }
  await addAgentMessageToThread(phone3,
    "Hi Michael, Cameron from Peake. Following up from Thirlmere Court. 17 Grand Arch Way is a strong investment prospect, 4 bed on 650sqm. Happy to share comparable sales data. Kind regards, Cameron",
    meta3
  )
  await addReplyToThread(phone3,
    "Cameron, what's the expected rental yield? And can you send me the recent comparable sales in that street?",
    meta3
  )

  res.json({ ok: true, threads: 3 })
})

export default router
