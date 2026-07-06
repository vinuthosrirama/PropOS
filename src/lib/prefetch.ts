const prefetched = new Set<string>()

export function prefetchChunk(loader: () => Promise<unknown>): void {
  const key = loader.toString()
  if (prefetched.has(key)) return
  prefetched.add(key)
  loader().catch(() => {})
}

export const prefetchVendorStages = () => prefetchChunk(() => import("../views/demo/VendorStages"))
export const prefetchSettings = () => prefetchChunk(() => import("../views/SettingsView"))
export const prefetchPitch = () => prefetchChunk(() => import("../views/PitchView"))
export const prefetchVoiceAgent = () => prefetchChunk(() => import("../views/VoiceAgentView"))
export const prefetchDocInsights = () => prefetchChunk(() => import("../views/DocInsightsView"))
