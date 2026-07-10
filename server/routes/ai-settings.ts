import { Router } from "express"
import { isAIEnabled, setAIEnabled } from "../lib/aiGate.js"
import { guard } from "../lib/asyncGuard.js"

const router = Router()

router.get("/", async (_req, res) => {
  // isAIEnabled() already try/catches internally and degrades to false, safe unguarded.
  const aiEnabled = await isAIEnabled()
  res.json({ aiEnabled })
})

router.put("/", guard(async (req, res) => {
  const { aiEnabled } = req.body as { aiEnabled?: boolean }
  if (typeof aiEnabled !== "boolean") {
    return res.status(400).json({ error: "aiEnabled (boolean) is required" })
  }
  // setAIEnabled -> setSetting() hits the DB directly with no internal guard,
  // unlike isAIEnabled() above — a transient blip here previously had no protection.
  await setAIEnabled(aiEnabled)
  console.log(`[ai-settings] AI features ${aiEnabled ? "ENABLED" : "DISABLED"}`)
  res.json({ ok: true, aiEnabled })
}))

export default router
