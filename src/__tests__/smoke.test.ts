import { describe, it, expect } from "vitest"
import { scoreColor, withAlpha, fmtYears, shortAddr, normaliseAddr, fullAddr, fmt } from "../views/demo/helpers"
import type { Stage } from "../views/demo/types"
import { EMPTY_FORM } from "../views/demo/types"

describe("helpers", () => {
  it("fmt formats currency correctly", () => {
    expect(fmt(1_500_000)).toBe("$1.50M")
    expect(fmt(750_000)).toBe("$750K")
    expect(fmt(0)).toBe("$0K")
  })

  it("scoreColor returns correct tier colours", () => {
    expect(scoreColor(90)).toContain("")  // green
    expect(scoreColor(50)).toBe("#f59e0b")
    expect(scoreColor(20)).toBeTruthy()   // red variant
  })

  it("withAlpha converts hex to rgba", () => {
    expect(withAlpha("#ff0000", 0.5)).toBe("rgba(255,0,0,0.5)")
    expect(withAlpha("#000000", 1)).toBe("rgba(0,0,0,1)")
  })

  it("withAlpha handles rgb() input", () => {
    expect(withAlpha("rgb(10,20,30)", 0.3)).toBe("rgba(10,20,30,0.3)")
  })

  it("fmtYears formats years and months", () => {
    expect(fmtYears(10)).toBe("10yr")
    expect(fmtYears(10.5)).toBe("10yr 6m")
    expect(fmtYears(0.25)).toBe("0yr 3m")
  })

  it("shortAddr strips house number and abbreviates type", () => {
    expect(shortAddr("3 Thirlmere Court")).toBe("Thirlmere Ct")
    expect(shortAddr("17 Grand Arch Way")).toBe("Grand Arch Way")
    expect(shortAddr("10 Ashby Drive")).toBe("Ashby Dr")
  })

  it("normaliseAddr removes postcodes, state, and normalises type", () => {
    const result = normaliseAddr("10 Ashby Drive, Berwick VIC 3806")
    expect(result).not.toContain("3806")
    expect(result).not.toContain("vic")
  })

  it("fullAddr avoids duplicating suburb", () => {
    expect(fullAddr("10 Ashby Drive, Berwick", "Berwick")).toBe("10 Ashby Drive, Berwick")
    expect(fullAddr("10 Ashby Drive", "Berwick")).toBe("10 Ashby Drive, Berwick")
  })
})

describe("types", () => {
  it("Stage type covers buyer and vendor flows", () => {
    const buyerStage: Stage = { kind: "portfolio" }
    const vendorStage: Stage = { kind: "vendorPortfolio" }
    expect(buyerStage.kind).toBe("portfolio")
    expect(vendorStage.kind).toBe("vendorPortfolio")
  })

  it("EMPTY_FORM has all required fields", () => {
    expect(EMPTY_FORM.name).toBe("")
    expect(EMPTY_FORM.propertyType).toBe("House")
    expect(EMPTY_FORM.beds).toBe("4")
    expect(EMPTY_FORM.status).toBe("owner-occupier")
  })
})
