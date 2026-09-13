'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

interface Props {
  pendingCount?: number
}

const ICONS = {
  home: (active: boolean) => (
    <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0l8.955 8.955M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
    </svg>
  ),
  search: (active: boolean) => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  bell: (active: boolean) => (
    <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.311 6.022c1.733.64 3.56 1.085 5.454 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  ),
  profile: (active: boolean) => (
    <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

// Persistent shell for the top-level Moments pages only (My Galleries /
// Search / Profile) — deliberately NOT shown inside a specific gallery
// (app/studio/moments/[projectId]), which uses that screen space for the
// grid + floating action button instead, matching the mock. Renders as a
// bottom tab bar on mobile and collapses into a left rail at md+ so the
// same five destinations work as a desktop nav without a second component.
export default function MomentsBottomNav({ pendingCount = 0 }: Props) {
  const pathname = usePathname()
  const isHome = pathname === '/studio/moments'
  const isSearch = pathname === '/studio/moments/search'
  const isNotifications = pathname === '/studio/moments/notifications'
  const isProfile = pathname === '/studio/moments/profile'

  const items = [
    { href: '/studio/moments', label: 'Home', icon: ICONS.home, active: isHome },
    { href: '/studio/moments/search', label: 'Search', icon: ICONS.search, active: isSearch },
    { href: '/studio/moments/new', label: 'Create', icon: null, active: false, isCreate: true },
    { href: '/studio/moments/notifications', label: 'Alerts', icon: ICONS.bell, active: isNotifications, badge: pendingCount },
    { href: '/studio/moments/profile', label: 'Profile', icon: ICONS.profile, active: isProfile },
  ]

  return (
    <>
      {/* Mobile — fixed bottom bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 py-2">
          {items.map((item) =>
            item.isCreate ? (
              <Link key={item.href} href={item.href} aria-label="Create event" className="flex flex-col items-center -mt-5">
                <span
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-2xl leading-none shadow-lg animate-reel-glow"
                  style={{ background: GRADIENT }}
                >
                  +
                </span>
              </Link>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${item.active ? 'text-accent' : 'text-muted'}`}
              >
                {item.icon!(item.active)}
                <span className="text-[10px] font-semibold">{item.label}</span>
                {!!item.badge && (
                  <span className="absolute -top-0.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </Link>
            )
          )}
        </div>
      </nav>

      {/* Desktop — left rail */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-20 lg:w-56 flex-col items-stretch bg-card border-r border-border py-6 px-3 gap-1">
        <div className="px-2 pb-6 hidden lg:block">
          <span className="text-sm font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studios</span>
          </span>
          <span className="block text-[11px] font-semibold text-muted">Moments</span>
        </div>
        {items.filter((i) => !i.isCreate).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${item.active ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text-primary hover:bg-border/40'}`}
          >
            {item.icon!(item.active)}
            <span className="text-sm font-semibold hidden lg:inline">{item.label}</span>
            {!!item.badge && (
              <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center hidden lg:flex">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </Link>
        ))}
        <Link
          href="/studio/moments/new"
          className="mt-4 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-sm font-bold"
          style={{ background: GRADIENT }}
        >
          <span className="text-lg leading-none">+</span>
          <span className="hidden lg:inline">New event</span>
        </Link>
      </nav>
    </>
  )
}
