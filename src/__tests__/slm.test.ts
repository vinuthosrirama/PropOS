import { describe, it, expect } from "vitest"
import { getSLMCompleteness, createBlankSLM } from "../data/propertySlm"

describe("propertySlm", () => {
  it("createBlankSLM returns a valid blank SLM", () => {
    const blank = createBlankSLM(999, "1 Test St", "TestSuburb VIC 3000")
    expect(blank.propertyId).toBe(999)
    expect(blank.address).toBe("1 Test St")
    expect(blank.beds).toBe("TBD")
    expect(blank.qa).toEqual([])
  })

  it("getSLMCompleteness reports 0% for blank SLM", () => {
    const blank = createBlankSLM(999)
    const c = getSLMCompleteness(blank)
    expect(c.pct).toBe(0)
    expect(c.total).toBeGreaterThan(50)
  })

  it("getSLMCompleteness counts filled fields", () => {
    const slm = createBlankSLM(999)
    slm.beds = 4
    slm.baths = 2
    slm.landSqm = 650
    const c = getSLMCompleteness(slm)
    expect(c.filled).toBe(3)
    expect(c.pct).toBeGreaterThan(0)
  })
})
