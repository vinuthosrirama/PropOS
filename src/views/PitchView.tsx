import { useEffect, useState } from "react"
import { apiUrl } from "../lib/api"
import { FONT } from "../data"
import PriceUpdateTemplate, { type PriceUpdatePayload } from "../components/pitch/PriceUpdateTemplate"
import DigitalIntroductionTemplate, { type DigitalIntroductionPayload } from "../components/pitch/DigitalIntroductionTemplate"
import ListingProposalTemplate, { type ListingProposalPayload } from "../components/pitch/ListingProposalTemplate"

interface PitchResponse {
  id: string
  type: string
  payload: PriceUpdatePayload
  status: string
  viewCount: number
  createdAt: string
}

export default function PitchView({ slug }: { slug: string }) {
  const [pitch, setPitch] = useState<PitchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        // Fire-and-forget view tracking — Realtair's "notified when client opens it"
        fetch(apiUrl(`/api/pitches/${data.id}/view`), { method: "POST" }).catch(() => {})
      })
      .catch(() => { if (!cancelled) setError("This pitch could not be found.") })

    return () => { cancelled = true }
  }, [slug])

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

  if (pitch.type === "price_update") {
    return <PriceUpdateTemplate payload={pitch.payload as PriceUpdatePayload} />
  }

  if (pitch.type === "introduction") {
    return <DigitalIntroductionTemplate payload={pitch.payload as unknown as DigitalIntroductionPayload} />
  }

  if (pitch.type === "proposal") {
    return <ListingProposalTemplate payload={pitch.payload as unknown as ListingProposalPayload} />
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
