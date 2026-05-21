import { Router } from "express"
import { addOptOut } from "../lib/compliance.js"

const router = Router()

/** GET /unsubscribe?token=leadId&type=email|sms|all */
router.get("/", async (req, res) => {
  const { token, type } = req.query as { token?: string; type?: string }

  if (!token) {
    return res.status(400).send(confirmationPage("Invalid unsubscribe link."))
  }

  const optOutType = (type === "sms" || type === "all") ? type : "email"
  try {
    await addOptOut(token, optOutType, "link")
  } catch (err) {
    console.error("[unsubscribe]", err)
    return res.status(500).send(confirmationPage("Something went wrong. Please try again."))
  }

  res.send(confirmationPage("You have been unsubscribed. You will no longer receive " +
    (optOutType === "all" ? "any communications" : `${optOutType} messages`) +
    " from this agent via AddVantage."))
})

function confirmationPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Unsubscribed — AddVantage</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #04070d; color: #d5dbe6;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #0e121c; border: 1px solid rgba(216,231,242,0.08); border-radius: 12px;
            padding: 40px; max-width: 440px; text-align: center; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    p  { font-size: 14px; color: rgba(213,219,230,0.6); margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Unsubscribed</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
}

export default router
