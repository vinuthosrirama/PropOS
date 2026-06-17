import { createContext, useContext } from "react"
import type { DocTracker } from "./useDocTracker"

export const DocTrackerContext = createContext<DocTracker | null>(null)

export function useDocTrackerContext(): DocTracker | null {
  return useContext(DocTrackerContext)
}
