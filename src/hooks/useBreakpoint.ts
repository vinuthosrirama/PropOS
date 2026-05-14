import { useState, useEffect } from "react"

export type Breakpoint = "mobile" | "tablet" | "desktop"

function get(): Breakpoint {
  if (typeof window === "undefined") return "desktop"
  if (window.innerWidth < 640) return "mobile"
  if (window.innerWidth < 1024) return "tablet"
  return "desktop"
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(get)
  useEffect(() => {
    const h = () => setBp(get())
    window.addEventListener("resize", h)
    return () => window.removeEventListener("resize", h)
  }, [])
  return bp
}

export function isMobile(bp: Breakpoint) { return bp === "mobile" }
export function isTabletOrSmaller(bp: Breakpoint) { return bp !== "desktop" }
