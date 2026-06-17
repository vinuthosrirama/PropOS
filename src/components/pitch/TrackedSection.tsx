import type { ReactNode, CSSProperties } from "react"
import { useDocTrackerContext } from "../../lib/docTrackerContext"

interface Props {
  id:       string
  children: ReactNode
  style?:   CSSProperties
  className?: string
}

/**
 * Wraps a document section so the doc tracker can observe enter/exit,
 * cursor position, and time spent. Falls back to a plain div when no tracker
 * is in context (e.g., agent preview mode).
 */
export default function TrackedSection({ id, children, style, className }: Props) {
  const tracker = useDocTrackerContext()

  return (
    <div
      data-section={id}
      ref={tracker?.sectionRef(id)}
      onMouseMove={tracker ? (e) => tracker.onMouseMove(e, id) : undefined}
      style={style}
      className={className}
    >
      {children}
    </div>
  )
}
