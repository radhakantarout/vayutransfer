'use client'

// Shared green/orange/red usage bar — <70% green, 70-80% orange, >80% red.
// Pure presentational, no server imports (lib/studio/quota.ts's usageBand
// is the server-side source of the same thresholds; kept in sync by hand
// since one lives in a client component and the other can't import server
// dynamodb code).
export function usageBarColor(pct: number): string {
  if (pct > 80) return 'bg-danger'
  if (pct >= 70) return 'bg-yellow-400'
  return 'bg-accent'
}
export function usageTextColor(pct: number): string {
  if (pct > 80) return 'text-danger'
  if (pct >= 70) return 'text-yellow-400'
  return 'text-accent'
}

export default function UsageBar({ pct, className = '' }: { pct: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className={`h-1.5 bg-border rounded-full overflow-hidden ${className}`}>
      <div className={`h-full rounded-full transition-all ${usageBarColor(pct)}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}
