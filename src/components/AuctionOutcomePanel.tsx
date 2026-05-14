import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { C, FONT, type AuctionOutcome } from "../data"
import { postAuctionOutcome } from "../lib/sheet"

interface Props {
  propertyId: number
  propertyAddress: string
  suburb: string
  priceGuideMin: number
  priceGuideMax: number
  onClose: () => void
  onSaved: (outcome: AuctionOutcome) => void
}

const field: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 6,
}
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.08em", color: C.muted,
}
const input: React.CSSProperties = {
  background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8,
  color: C.text, fontFamily: FONT, fontSize: 14, padding: "8px 12px", outline: "none",
}

export default function AuctionOutcomePanel({
  propertyId, propertyAddress, suburb, priceGuideMin, priceGuideMax, onClose, onSaved,
}: Props) {
  const [hammerPrice, setHammerPrice]         = useState(priceGuideMax > 0 ? String(priceGuideMax) : "")
  const [registeredBidders, setRegistered]    = useState("")
  const [activeBidders, setActive]            = useState("")
  const [propOSAtAuction, setPropOSAtAuction] = useState("")
  const [auctionDate, setAuctionDate]         = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]                     = useState("")
  const [saving, setSaving]                   = useState(false)
  const [saved, setSaved]                     = useState(false)

  const hammer  = parseInt(hammerPrice.replace(/\D/g, "")) || 0
  const guide   = (priceGuideMin + priceGuideMax) / 2
  const uplift  = guide > 0 ? Math.round(((hammer - guide) / guide) * 100) : 0
  const extraGCI = guide > 0 && hammer > guide ? Math.round((hammer - guide) * 0.022) : 0

  const handleSave = async () => {
    if (!hammer) return
    setSaving(true)
    const outcome: AuctionOutcome = {
      propertyId,
      propertyAddress,
      suburb,
      auctionDate,
      hammerPrice: hammer,
      registeredBidders: parseInt(registeredBidders) || 0,
      activeBidders: parseInt(activeBidders) || 0,
      priceGuideMin,
      priceGuideMax,
      propOSLeadsContacted: 0,  // caller can supply via event log
      propOSLeadsAtAuction: parseInt(propOSAtAuction) || 0,
      notes,
    }
    await postAuctionOutcome(outcome)
    setSaving(false)
    setSaved(true)
    setTimeout(() => { onSaved(outcome); onClose() }, 1200)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{
          position: "fixed", inset: 0, background: "rgba(4,7,13,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 16,
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: 32, width: "100%", maxWidth: 480, fontFamily: FONT,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Record Auction Outcome</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{propertyAddress}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={field}>
                <span style={label}>Auction Date</span>
                <input type="date" value={auctionDate} onChange={e => setAuctionDate(e.target.value)}
                  style={input} />
              </div>
              <div style={field}>
                <span style={label}>Hammer Price ($)</span>
                <input type="text" value={hammerPrice} onChange={e => setHammerPrice(e.target.value)}
                  placeholder="e.g. 1050000" style={input} />
              </div>
              <div style={field}>
                <span style={label}>Registered Bidders</span>
                <input type="number" min="0" max="30" value={registeredBidders}
                  onChange={e => setRegistered(e.target.value)} placeholder="0" style={input} />
              </div>
              <div style={field}>
                <span style={label}>Active Bidders</span>
                <input type="number" min="0" max="30" value={activeBidders}
                  onChange={e => setActive(e.target.value)} placeholder="0" style={input} />
              </div>
              <div style={{ ...field, gridColumn: "1 / -1" }}>
                <span style={label}>PropOS Leads at Auction</span>
                <input type="number" min="0" value={propOSAtAuction}
                  onChange={e => setPropOSAtAuction(e.target.value)} placeholder="How many came from PropOS outreach?" style={input} />
              </div>
            </div>

            {hammer > 0 && guide > 0 && (
              <div style={{
                background: uplift >= 0 ? `rgba(100,208,144,0.08)` : `rgba(255,110,110,0.08)`,
                border: `1px solid ${uplift >= 0 ? "rgba(100,208,144,0.2)" : "rgba(255,110,110,0.2)"}`,
                borderRadius: 10, padding: "12px 16px",
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, textAlign: "center",
              }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: uplift >= 0 ? C.green : C.red }}>
                    {uplift >= 0 ? "+" : ""}{uplift}%
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>vs guide</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                    ${(hammer / 1000).toFixed(0)}k
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>hammer</div>
                </div>
                {extraGCI > 0 && (
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.blue }}>
                      +${extraGCI.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>extra GCI (est.)</div>
                  </div>
                )}
              </div>
            )}

            <div style={field}>
              <span style={label}>Notes</span>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Auction atmosphere, vendor feedback, notable bidders..."
                rows={3} style={{ ...input, resize: "vertical" }} />
            </div>

            <button
              onClick={handleSave}
              disabled={!hammer || saving || saved}
              style={{
                background: saved ? C.green : "var(--accent, rgb(166,218,255))",
                border: "none", borderRadius: 10, padding: "12px 24px",
                color: C.bg, fontFamily: FONT, fontSize: 14, fontWeight: 700,
                cursor: hammer ? "pointer" : "not-allowed", opacity: hammer ? 1 : 0.5,
                transition: "all 0.2s",
              }}
            >
              {saved ? "Saved ✓" : saving ? "Saving..." : "Save Auction Outcome"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
