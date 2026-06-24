'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { href: '/studio/admin/studios', label: 'Studios', icon: '🏠' },
  { href: '/studio/admin/users',   label: 'Users',   icon: '👥' },
]

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  // Verify OWNER JWT on mount
  useEffect(() => {
    fetch('/studio/api/owner/stats')
      .then((r) => {
        if (r.status === 401 || r.status === 403) router.replace('/studio/home')
      })
      .catch(() => {})
  }, [router])

  return (
    <div className="flex flex-1">
      <aside className="w-52 bg-card border-r border-border flex-shrink-0">
        <nav className="px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith(item.href)
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted hover:text-text-primary hover:bg-border'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto bg-bg">{children}</main>
    </div>
  )
}
