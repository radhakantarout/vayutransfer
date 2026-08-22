export default function StatCard({
  label, value, sub, icon,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="text-xl font-bold text-text-primary mt-1 tabular-nums truncate">{value}</div>
        {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
      </div>
      {icon && (
        <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
      )}
    </div>
  )
}
