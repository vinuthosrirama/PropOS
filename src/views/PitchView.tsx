import { useEffect, useState } from "react"
import { apiUrl } from "../lib/api"
import { FONT } from "../data"
import PriceUpdateTemplate, { type PriceUpdatePayload } from "../components/pitch/PriceUpdateTemplate"
import DigitalIntroductionTemplate, { type DigitalIntroductionPayload } from "../components/pitch/DigitalIntroductionTemplate"
import ListingProposalTemplate, { type ListingProposalPayload } from "../components/pitch/ListingProposalTemplate"
import AppraisalView, { type AppraisalPayload } from "../components/pitch/AppraisalView"

// ── Types ─────────────────────────────────────────────────────────────────────

interface PitchResponse {
  id:               string
  type:             string
  payload:          PriceUpdatePayload | AppraisalPayload
  status:           string
  viewCount:        number
  createdAt:        string
  acceptanceToken:  string | null
  acceptedAt:       string | null
  acceptedBy:       string | null
  vendorEmail:      string | null
  vendorName:       string | null
}

// ── Accept modal ──────────────────────────────────────────────────────────────

interface AcceptModalProps {
  token:    string
  onAccept: (name: string, at: string) => void
  onClose:  () => void
}

function AcceptModal({ token, onAccept, onClose }: AcceptModalProps) {
  const [name, setName]       = useState("")
  const [agreed, setAgreed]   = useState(false)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function submit() {
    if (!name.trim() || !agreed) return
    setBusy(true)
    setError(null)
    try {
      const res  = await fetch(apiUrl(`/api/pitches/${encodeURIComponent(token)}/accept`), {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json() as { ok?: boolean; acceptedAt?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Accept failed")
      onAccept(name.trim(), data.acceptedAt ?? new Date().toISOString())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "28px 24px", width: "100%",
        maxWidth: 460, fontFamily: FONT,
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>
          Accept this proposal
        </h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#888", lineHeight: 1.5 }}>
          Enter your full name to record your acceptance. This creates an evidentiary record
          with your name, timestamp, and IP address.
        </p>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 6 }}>
          Full name *
        </label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Jane Smith"
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            border: "1.5px solid #d1d5db", fontSize: 15, fontFamily: FONT,
            boxSizing: "border-box", marginBottom: 16,
          }}
        />

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>
            I acknowledge this is <strong>not a legally binding signature</strong>. It records
            my intent to accept this proposal and creates an audit trail only.
          </span>
        </label>

        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#ef4444" }}>{error}</p>
        )}

        <button
          onClick={submit}
          disabled={!name.trim() || !agreed || busy}
          style={{
            width: "100%", padding: "12px", borderRadius: 10, border: "none",
            background: name.trim() && agreed && !busy
              ? "linear-gradient(135deg, #7B35BE, #3f0278)"
              : "#e5e7eb",
            color: name.trim() && agreed && !busy ? "#fff" : "#9ca3af",
            fontSize: 15, fontWeight: 700, cursor: name.trim() && agreed && !busy ? "pointer" : "not-allowed",
            fontFamily: FONT,
          }}
        >
          {busy ? "Accepting..." : "Accept proposal"}
        </button>

        <p style={{ margin: "12px 0 0", fontSize: 11, color: "#bbb", textAlign: "center" }}>
          For legally binding e-signatures, ask your agent about Annature integration.
        </p>
      </div>
    </div>
  )
}

// ── Accepted banner ────────────────────────────────────────────────────────────

function AcceptedBanner({ name, at }: { name: string; at: string }) {
  const date = new Date(at).toLocaleString("en-AU", {
    timeZone: "Australia/Melbourne", day: "numeric", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  })
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 900,
      background: "linear-gradient(135deg, #166534, #14532d)",
      padding: "14px 20px",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      fontFamily: FONT,
    }}>
      <span style={{ fontSize: 18 }}>✓</span>
      <span style={{ color: "#dcfce7", fontSize: 14, fontWeight: 600 }}>
        Accepted by {name}
      </span>
      <span style={{ color: "#86efac", fontSize: 13 }}>
        {date} AEST
      </span>
    </div>
  )
}

// ── Accept CTA (shown before acceptance) ──────────────────────────────────────

function AcceptCTA({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 900,
      background: "rgba(255,255,255,0.97)",
      borderTop: "1px solid #e5e7eb",
      padding: "12px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontFamily: FONT,
      backdropFilter: "blur(8px)",
    }}>
      <span style={{ fontSize: 13, color: "#555" }}>
        Ready to proceed with this proposal?
      </span>
      <button
        onClick={onOpen}
        style={{
          background: "linear-gradient(135deg, #7B35BE, #3f0278)",
          color: "#fff", border: "none", borderRadius: 8,
          padding: "10px 20px", cursor: "pointer",
          fontSize: 14, fontWeight: 700, fontFamily: FONT,
        }}
      >
        Accept proposal
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PitchView({ slug }: { slug: string }) {
  const [pitch, setPitch]       = useState<PitchResponse | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [showModal, setModal]   = useState(false)
  const [acceptedBy, setAccBy]  = useState<string | null>(null)
  const [acceptedAt, setAccAt]  = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(apiUrl(`/api/pitches/by-slug/${encodeURIComponent(slug)}`))
      .then(res => {
        if (!res.ok) throw new Error("Pitch not found")
        return res.json() as Promise<PitchResponse>
      })
      .then(data => {
        if (cancelled) return
        setPitch(data)
        // Seed local state from DB if already accepted
        if (data.acceptedAt && data.acceptedBy) {
          setAccBy(data.acceptedBy)
          setAccAt(data.acceptedAt)
        }
        // Fire-and-forget view tracking
        fetch(apiUrl(`/api/pitches/${data.id}/view`), { method: "POST" }).catch(() => {})
      })
      .catch(() => { if (!cancelled) setError("This pitch could not be found.") })

    return () => { cancelled = true }
  }, [slug])

  const isAccepted = !!(acceptedBy && acceptedAt) || pitch?.status === "accepted"
  const showAcceptUI = pitch && pitch.acceptanceToken &&
    ["price_update", "listing_proposal", "appraisal"].includes(pitch.type)

  // ── Error / loading states
  if (error) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#04070D", color: "#9AA4B2", fontFamily: FONT, textAlign: "center", padding: 24,
      }}>
        {error}
      </div>
    )
  }

  if (!pitch) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#04070D", color: "#9AA4B2", fontFamily: FONT,
      }}>
        Loading...
      </div>
    )
  }

  // ── Route to correct template ─────────────────────────────────────────────

  function renderContent() {
    if (!pitch) return null

    if (pitch.type === "appraisal") {
      return (
        <AppraisalView
          payload={pitch.payload as AppraisalPayload}
          pitchId={pitch.id}
          vendorEmail={pitch.vendorEmail}
          slug={slug}
        />
      )
    }

    if (pitch.type === "introduction") {
      return <DigitalIntroductionTemplate payload={pitch.payload as unknown as DigitalIntroductionPayload} />
    }

    if (pitch.type === "proposal") {
      return <ListingProposalTemplate payload={pitch.payload as unknown as ListingProposalPayload} />
    }

    if (pitch.type === "price_update" || pitch.type === "listing_proposal" || pitch.type === "digital_intro") {
      return <PriceUpdateTemplate payload={pitch.payload as PriceUpdatePayload} />
    }

    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#04070D", color: "#9AA4B2", fontFamily: FONT, textAlign: "center", padding: 24,
      }}>
        This pitch type is not yet supported.
      </div>
    )
  }

  return (
    <>
      {renderContent()}

      {/* Acceptance UI — bottom bar or confirmed banner */}
      {showAcceptUI && (
        <>
          {isAccepted
            ? <AcceptedBanner name={acceptedBy ?? pitch.acceptedBy ?? ""} at={acceptedAt ?? pitch.acceptedAt ?? ""} />
            : <AcceptCTA onOpen={() => setModal(true)} />
          }
          {showModal && !isAccepted && (
            <AcceptModal
              token={pitch.acceptanceToken!}
              onAccept={(name, at) => {
                setAccBy(name)
                setAccAt(at)
                setModal(false)
              }}
              onClose={() => setModal(false)}
            />
          )}
        </>
      )}
    </>
  )
}
