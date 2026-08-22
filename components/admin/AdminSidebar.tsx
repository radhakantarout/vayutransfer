'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ListIcon, UsersIcon } from '@/components/icons'

// Only the nav items that are actually real/functional in this phase —
// see the "not built in this pass" backlog in the admin plan rather than
// padding this out with dead links to match the full reference mockup.
const NAV_ITEMS = [
  { label: 'Overview', href: '/admin', icon: ListIcon },
  { label: 'Users', href: '/admin/users', icon: UsersIcon },
]

export default function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const isActive = (href: string) => href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const logout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <aside className="w-56 flex-shrink-0 min-h-screen border-r border-border bg-card flex flex-col py-5 px-3">
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <Image src="/logo.png" alt="VayuTransfer" width={30} height={30} className="rounded-lg" />
        <div>
          <div className="font-bold text-text-primary text-sm leading-none">VayuTransfer</div>
          <div className="text-[10px] text-muted mt-1 uppercase tracking-wide">Platform Admin</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isActive(href) ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-border/40 hover:text-text-primary'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border pt-3 px-2">
        <div className="text-xs text-text-primary font-medium truncate">{adminEmail}</div>
        <button onClick={logout} className="text-xs text-danger hover:underline mt-1.5">
          Log out
        </button>
      </div>
    </aside>
  )
}
