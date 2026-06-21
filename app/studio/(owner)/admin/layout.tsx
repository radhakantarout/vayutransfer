'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { href: '/studio/admin/studios', label: 'Studios',  icon: '🏠' },
  { href: '/studio/admin/users',   label: 'Users',    icon: '👥' },
]

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()

  // Verify OWNER JWT on mount
  useEffect(() => {
    fetch('/studio/api/owner/stats')
      .then((r) => { if (r.status === 401 || r.status === 403) router.replace('/studio/login') })
      .catch(() => {})
  }, [router])

  const logout = async () => {
    await fetch('/studio/api/auth/logout', { method: 'POST' })
    router.push('/studio/login')
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-card border-r border-border flex flex-col">
        <div className="px-5 py-6 border-b border-border">
          <div className="text-lg font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studio</span>
          </div>
          <div className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
            Platform Owner
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
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

        <div className="px-3 py-4 border-t border-border">
          <button
            onClick={logout}
            className="w-full text-left px-3 py-2 text-sm text-muted hover:text-danger transition-colors rounded-lg"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-bg">{children}</main>
    </div>
  )
}
