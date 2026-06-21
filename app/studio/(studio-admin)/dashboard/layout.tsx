'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { href: '/studio/dashboard', label: 'Projects', icon: '📁' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const logout = async () => {
    await fetch('/studio/api/auth/logout', { method: 'POST' })
    router.push('/studio/login')
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-card border-r border-border flex flex-col">
        <div className="px-5 py-6 border-b border-border">
          <div className="text-lg font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studio</span>
          </div>
          <div className="text-xs text-muted mt-0.5">Studio Dashboard</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.href || pathname.startsWith(item.href + '/')
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

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-bg">
        {children}
      </main>
    </div>
  )
}
