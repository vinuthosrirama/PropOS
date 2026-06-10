import { useState } from "react"
import { FONT } from "../data"

const ACCENT = "#A6DAFF"
const ACCENT_BRIGHT = "#0099FF"

function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-AU")
}

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

function SliderRow({ label, value, min, max, step, format, onChange }: SliderRowProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "rgba(213,219,230,0.7)" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>{format(value)}</span>
      </div>
      <input
        type="range"
        className="gci-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          accentColor: ACCENT_BRIGHT,
          height: 4,
          cursor: "pointer",
        }}
      />
    </div>
  )
}

export default function GciCalculator() {
  const [salePrice, setSalePrice] = useState(850_000)
  const [commissionPct, setCommissionPct] = useState(2.2)
  const [marketingFee, setMarketingFee] = useState(1500)
  const [includesGst, setIncludesGst] = useState(true)
  const [splitPct, setSplitPct] = useState(50)

  const grossCommission = salePrice * (commissionPct / 100)
  const gstAmount = includesGst ? grossCommission - grossCommission / 1.1 : 0
  const commissionExGst = grossCommission - gstAmount
  const netCommission = Math.max(commissionExGst - marketingFee, 0)
  const agentGCI = netCommission * (splitPct / 100)

  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(207,231,255,0.15)",
      borderRadius: 16,
      padding: 28,
      fontFamily: FONT,
      color: "#F5F7FA",
      maxWidth: 480,
    }}>
      <style>{`
        .gci-slider { -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.12); border-radius: 999px; outline: none; }
        .gci-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: ${ACCENT_BRIGHT}; border: 2px solid #fff; cursor: pointer; }
        .gci-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: ${ACCENT_BRIGHT}; border: 2px solid #fff; cursor: pointer; }
      `}</style>

      <div style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 11,
        letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(166,218,255,0.7)",
        marginBottom: 16,
      }}>
        GCI Calculator
      </div>

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{
          fontSize: 13, color: "rgba(213,219,230,0.7)", marginBottom: 6,
        }}>
          Your GCI
        </div>
        <div style={{
          fontSize: 48, fontWeight: 800, color: ACCENT,
          textShadow: "0 0 20px rgba(166,218,255,0.4)",
        }}>
          {fmtMoney(agentGCI)}
        </div>
      </div>

      <SliderRow
        label="Sale Price"
        value={salePrice}
        min={300_000}
        max={2_500_000}
        step={10_000}
        format={fmtMoney}
        onChange={setSalePrice}
      />
      <SliderRow
        label="Commission %"
        value={commissionPct}
        min={1}
        max={3.5}
        step={0.05}
        format={v => `${v.toFixed(2)}%`}
        onChange={setCommissionPct}
      />
      <SliderRow
        label="Marketing / Admin Fee"
        value={marketingFee}
        min={0}
        max={5_000}
        step={50}
        format={fmtMoney}
        onChange={setMarketingFee}
      />
      <SliderRow
        label="Your Split %"
        value={splitPct}
        min={0}
        max={100}
        step={1}
        format={v => `${v}%`}
        onChange={setSplitPct}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 13, color: "rgba(213,219,230,0.7)" }}>Commission includes GST</span>
        <button
          onClick={() => setIncludesGst(v => !v)}
          style={{
            width: 44, height: 24, borderRadius: 999, border: "none", cursor: "pointer",
            background: includesGst ? ACCENT_BRIGHT : "rgba(255,255,255,0.12)",
            position: "relative", transition: "background 0.15s",
          }}
        >
          <div style={{
            position: "absolute", top: 3, left: includesGst ? 23 : 3,
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            transition: "left 0.15s",
          }} />
        </button>
      </div>

      <div style={{
        marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)",
        fontSize: 12, color: "rgba(213,219,230,0.5)", lineHeight: 1.8,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Gross commission</span><span>{fmtMoney(grossCommission)}</span>
        </div>
        {includesGst && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>GST</span><span>-{fmtMoney(gstAmount)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Marketing / admin fee</span><span>-{fmtMoney(marketingFee)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Net commission</span><span>{fmtMoney(netCommission)}</span>
        </div>
      </div>
    </div>
  )
}
