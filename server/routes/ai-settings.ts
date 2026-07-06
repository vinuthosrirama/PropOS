import { Router } from "express"
import { isAIEnabled, setAIEnabled } from "../lib/aiGate.js"

const router = Router()

router.get("/", async (_req, res) => {
  const aiEnabled = await isAIEnabled()
  res.json({ aiEnabled })
})

router.put("/", async (req, res) => {
  const { aiEnabled } = req.body as { aiEnabled?: boolean }
  if (typeof aiEnabled !== "boolean") {
    return res.status(400).json({ error: "aiEnabled (boolean) is required" })
  }
  await setAIEnabled(aiEnabled)
  console.log(`[ai-settings] AI features ${aiEnabled ? "ENABLED" : "DISABLED"}`)
  res.json({ ok: true, aiEnabled })
})

export default router
