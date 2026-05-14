import "dotenv/config"
import express from "express"
import cors from "cors"
import generateRouter from "./routes/generate.js"
import sheetRouter from "./routes/sheet.js"
import transcriptRouter from "./routes/transcript.js"

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({ origin: ["http://localhost:3003", "http://localhost:5173"] }))
app.use(express.json())

app.use("/api/generate", generateRouter)
app.use("/api/sheet", sheetRouter)
app.use("/api/transcript", transcriptRouter)

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    sheet: !!process.env.SHEET_URL,
  })
})

app.listen(PORT, () => {
  console.log(`PropOS server running on http://localhost:${PORT}`)
  console.log(`  OpenAI:    ${process.env.OPENAI_API_KEY ? "configured" : "not set (demo fallback active)"}`)
  console.log(`  Anthropic: ${process.env.ANTHROPIC_API_KEY ? "configured" : "not set (skipping analysis + QA)"}`)
  console.log(`  Sheet:     ${process.env.SHEET_URL ? "configured" : "not set (demo mode)"}`)
})
