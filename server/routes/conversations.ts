import { Router } from "express"
import {
  getAllThreads,
  getThread,
  getUnreadCount,
  markThreadRead,
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

export default router
