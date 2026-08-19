export default function UserStatusBadge({ status }: { status?: 'active' | 'warned' | 'blocked' }) {
  const map = {
    active: { label: 'Active', cls: 'bg-success/10 text-success' },
    warned: { label: 'Warned', cls: 'bg-yellow-500/10 text-yellow-500' },
    blocked: { label: 'Blocked', cls: 'bg-danger/10 text-danger' },
  } as const
  const { label, cls } = map[status ?? 'active']
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}
