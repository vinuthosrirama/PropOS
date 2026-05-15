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
 * Only works when TEST_RECIPIENT_PHONE is set.
 */
router.post("/seed-demo", async (req, res) => {
  const testPhone = process.env.TEST_RECIPIENT_PHONE?.trim()
  if (!testPhone) {
    return res.status(403).json({ error: "Only available in test mode (TEST_RECIPIENT_PHONE not set)" })
  }

  const meta = {
    leadId:          "demo-seed-001",
    leadName:        "James Wilson",
    propertyAddress: "17 Grand Arch Way, Berwick VIC",
    email:           "james.wilson@example.com",
  }

  // Agent's outbound message
  await addAgentMessageToThread(testPhone,
    "Hi James, Cameron Peake here from Peake Real Estate. Great to meet you at 3 Thirlmere Court on Saturday! I think 17 Grand Arch Way might be a perfect fit for what you mentioned - it's just hit the market. Would love to show you through. Cameron",
    meta
  )

  // Lead's reply (marks thread unread)
  await addReplyToThread(testPhone,
    "Hi Cameron, thanks for reaching out. What's the land size on the property? And is there a formal dining room?",
    meta
  )

  res.json({ ok: true, phone: testPhone, leadName: meta.leadName })
})

export default router
