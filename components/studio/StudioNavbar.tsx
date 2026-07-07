'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import type { StudioRole } from '@/lib/studio/auth'

type Auth = { role: StudioRole; userId: string; studioId?: string; name: string; email: string; projectToken?: string }

const ROLE_LABEL: Record<StudioRole, string> = {
  OWNER: 'Platform Owner',
  ADMIN: 'Studio Admin',
  CLIENT: 'Client',
  PRINT: 'Print Admin',
}

const PRODUCTS: { label: string; href: string; desc: string; icon: JSX.Element; badge?: string }[] = [
  { label: 'Client Gallery',   href: '/studio/products/client-gallery',  desc: 'Secure watermarked gallery for clients',      icon: <GalleryIcon /> },
  { label: 'Guest QR Code',    href: '/studio/products/guest-qr',         desc: 'Guests scan & find their own photos',         icon: <QRIcon /> },
  { label: 'AI Face Search',   href: '/studio/products/ai-search',        desc: 'Find photos instantly with a selfie',         icon: <AIIcon /> },
  { label: 'Print Delivery',   href: '/studio/products/print-delivery',   desc: 'Secure 7-day links for your print lab',       icon: <PrintIcon /> },
  { label: 'Studio Dashboard', href: '/studio/products/dashboard',        desc: 'Manage every shoot in one place',             icon: <DashboardIcon /> },
  { label: 'Studio Website',   href: '/studio/products/studio-website',   desc: 'Your own branded booking page',               icon: <GlobeIcon /> },
]

const NAV_LINKS = [
  { label: 'Pricing',  href: '/studio/pricing'  },
  { label: 'Events',   href: '/studio/events'   },
  { label: 'Examples', href: '/studio/examples' },
]

/* ── small inline SVG icons ── */
function GalleryIcon()   { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path strokeLinecap="round" d="M21 15l-5-5L5 21"/></svg> }
function QRIcon()        { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="5" height="5" rx="0.5"/><rect x="16" y="3" width="5" height="5" rx="0.5"/><rect x="3" y="16" width="5" height="5" rx="0.5"/><path strokeLinecap="round" d="M16 16h2v2h-2zM19 19h2v2h-2zM16 19h1M19 16h2M21 21h-1"/></svg> }
function AIIcon()        { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="8" r="4"/><path strokeLinecap="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path strokeLinecap="round" d="M19 3l1 1-1 1M21 5h-2"/></svg> }
function PrintIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg> }
function DashboardIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> }
function GlobeIcon()     { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> }
function HamburgerIcon() { return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg> }
function CloseIcon()     { return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg> }
function ChevronDown()   { return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M19 9l-7 7-7-7"/></svg> }
function HomeIcon()      { return <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg> }

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  return (
    <div className={`rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center font-bold text-accent flex-shrink-0 ${size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'}`}>
      {initials}
    </div>
  )
}

export default function StudioNavbar() {
  const [auth, setAuth]                     = useState<Auth | null | 'loading'>('loading')
  const [mobileOpen, setMobileOpen]         = useState(false)
  const [profileOpen, setProfileOpen]       = useState(false)
  const [productsOpen, setProductsOpen]     = useState(false)
  const [mobileProducts, setMobileProducts] = useState(false)
  const profileRef  = useRef<HTMLDivElement>(null)
  const productsRef = useRef<HTMLDivElement>(null)
  const router      = useRouter()
  const pathname    = usePathname()

  useEffect(() => {
    const match = document.cookie.split('; ').find((c) => c.startsWith('studio_ui='))
    if (match) {
      try {
        const parsed = JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')))
        setAuth({ role: parsed.role, userId: '', studioId: parsed.studioId ?? '', name: parsed.name ?? '', email: parsed.email ?? '', projectToken: parsed.projectToken ?? undefined })
      } catch { setAuth(null) }
    } else { setAuth(null) }
  }, [pathname])

  useEffect(() => {
    if (!profileOpen) return
    const h = (e: MouseEvent) => { if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [profileOpen])

  useEffect(() => {
    if (!productsOpen) return
    const h = (e: MouseEvent) => { if (productsRef.current && !productsRef.current.contains(e.target as Node)) setProductsOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [productsOpen])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const closeAll = () => { setMobileOpen(false); setProfileOpen(false); setProductsOpen(false); setMobileProducts(false) }

  const handleLogout = async () => {
    const wasClient = auth && auth !== 'loading' && (auth as Auth).role === 'CLIENT'
    await fetch('/studio/api/auth/logout', { method: 'POST' })
    closeAll(); setAuth(null)
    router.push(wasClient ? '/studio/home' : '/studio/home')
    router.refresh()
  }

  const isLoggedIn = auth && auth !== 'loading'
  const isHome     = pathname === '/studio/home'
  const navBg      = isHome ? 'bg-white/15 backdrop-blur-md border-white/10' : 'bg-card border-border'
  const linkCls    = isHome
    ? 'text-[#0D3B6E] hover:text-[#0099CC] font-medium transition-colors whitespace-nowrap text-base'
    : 'text-muted hover:text-text-primary transition-colors whitespace-nowrap text-base'
  const logoTextCls = isHome ? 'text-[#0D3B6E]' : 'text-text-primary'

  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <nav className={`sticky top-0 z-50 border-b ${navBg}`}>
        <div className="px-5 h-14 flex items-center justify-between">

          {/* Logo */}
          <Link href="/studio/home" onClick={closeAll} className="flex items-center gap-2 flex-shrink-0">
            <Image src="/logo.png" alt="VayuStudios" width={36} height={36} className="h-9 w-9 flex-shrink-0" />
            <span className={`text-lg font-extrabold leading-none ${logoTextCls}`}>
              Vayu<span className="text-accent">Studios</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6 text-base">
            {isLoggedIn ? (
              <>
                {/* Stylish home icon for all logged-in users */}
                <Link href="/studio/home" onClick={closeAll} title="Home"
                  className={`flex items-center justify-center w-8 h-8 rounded-xl border transition-colors ${pathname === '/studio/home' ? 'border-accent/40 text-accent bg-accent/10' : 'border-border/60 text-muted hover:text-text-primary hover:bg-border/50 hover:border-border'}`}>
                  <HomeIcon />
                </Link>
                {(auth as Auth).role === 'OWNER' && (
                  <><Link href="/studio/admin/studios" className={linkCls}>Studios</Link><Link href="/studio/admin/users" className={linkCls}>Users</Link></>
                )}
                {(['ADMIN','PRINT'] as StudioRole[]).includes((auth as Auth).role) && (
                  <Link href="/studio/dashboard" className={linkCls}>Dashboard</Link>
                )}
                {(auth as Auth).role === 'CLIENT' && (auth as Auth).projectToken && (
                  <Link href={`/studio/gallery/${(auth as Auth).projectToken}`} className={linkCls}>My Gallery</Link>
                )}
                {NAV_LINKS.map(({ label, href }) => (
                  <Link key={href} href={href} className={linkCls}>{label}</Link>
                ))}
              </>
            ) : (
              <>
                {/* Products dropdown */}
                <div ref={productsRef} className="relative">
                  <button
                    onClick={() => setProductsOpen(v => !v)}
                    className={`flex items-center gap-1.5 ${linkCls}`}
                  >
                    Products <span className={`transition-transform duration-200 ${productsOpen ? 'rotate-180' : ''}`}><ChevronDown /></span>
                  </button>

                  {/* Dropdown panel — single column */}
                  <div className={`absolute top-full left-0 mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden transition-all duration-200 ${productsOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
                    <div className="p-2 space-y-0.5">
                      {PRODUCTS.map((p) => (
                        <Link
                          key={p.href}
                          href={p.href}
                          onClick={closeAll}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/5 border border-transparent hover:border-accent/15 transition-all group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0 group-hover:bg-accent group-hover:text-white group-hover:border-accent transition-all">
                            {p.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">{p.label}</span>
                              {p.badge && <span className="text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-full">{p.badge}</span>}
                            </div>
                            <p className="text-xs text-muted leading-snug">{p.desc}</p>
                          </div>
                          <svg className="w-3.5 h-3.5 text-muted/40 group-hover:text-accent/60 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-muted">All-in-one photography platform</span>
                      <Link href="/studio/get-started" onClick={closeAll} className="text-xs text-accent font-semibold hover:underline">Get started →</Link>
                    </div>
                  </div>
                </div>

                {NAV_LINKS.map(({ label, href }) => (
                  <Link key={href} href={href} className={linkCls}>{label}</Link>
                ))}
              </>
            )}
          </div>

          {/* Desktop right */}
          <div className="hidden md:flex items-center gap-2">
            {auth === 'loading' ? (
              <div className="w-9 h-9 rounded-full bg-border animate-pulse" />
            ) : isLoggedIn ? (
              <div className="relative" ref={profileRef}>
                <button onClick={() => setProfileOpen((v) => !v)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-border/40 transition-colors" aria-label="Profile menu">
                  <Avatar name={(auth as Auth).name || (auth as Auth).email || 'U'} />
                  <span className={`w-3.5 h-3.5 text-muted transition-transform ${profileOpen ? 'rotate-180' : ''}`}><ChevronDown /></span>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-12 w-64 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="px-4 py-4 border-b border-border flex items-center gap-3">
                      <Avatar name={(auth as Auth).name || (auth as Auth).email || 'U'} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{(auth as Auth).name || 'Studio User'}</div>
                        <div className="text-xs text-muted truncate">{(auth as Auth).email}</div>
                        <span className="inline-block mt-1 text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 rounded-full px-2 py-0.5">{ROLE_LABEL[(auth as Auth).role]}</span>
                      </div>
                    </div>
                    <div className="p-2">
                      {(['ADMIN','PRINT'] as StudioRole[]).includes((auth as Auth).role) && (
                        <Link href="/studio/dashboard" onClick={closeAll} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-text-primary hover:bg-border/50 transition-colors">
                          <DashboardIcon />Dashboard
                        </Link>
                      )}
                      {(auth as Auth).role === 'CLIENT' && (auth as Auth).projectToken && (
                        <Link href={`/studio/gallery/${(auth as Auth).projectToken}`} onClick={closeAll} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-text-primary hover:bg-border/50 transition-colors">
                          <GalleryIcon />My Gallery
                        </Link>
                      )}
                      {(auth as Auth).role === 'OWNER' && (
                        <Link href="/studio/admin/studios" onClick={closeAll} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-text-primary hover:bg-border/50 transition-colors">
                          <DashboardIcon />Admin Panel
                        </Link>
                      )}
                      <button onClick={handleLogout} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-danger hover:bg-danger/10 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/studio/login" className={`text-base font-semibold px-4 py-2 rounded-lg border transition-colors ${isHome ? 'border-[#0D3B6E]/40 text-[#0D3B6E] hover:bg-[#0D3B6E]/10' : 'border-border text-text-primary hover:bg-border/40'}`}>Login</Link>
                <Link href="/studio/get-started" className="text-base font-bold px-4 py-2 rounded-lg bg-accent text-bg hover:bg-accent/90 transition-colors">Get Started</Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen((v) => !v)} className={`md:hidden flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${isHome ? 'border-[#0D3B6E]/40 text-[#0D3B6E]' : 'border-border text-text-primary hover:bg-border/40'}`} aria-label="Menu">
            {mobileOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        </div>
      </nav>

      {/* ── Mobile backdrop ── */}
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />}

      {/* ── Mobile drawer ── */}
      <div className={`fixed top-14 left-0 right-0 z-50 md:hidden bg-card border-b border-border shadow-2xl transition-all duration-200 ease-out ${mobileOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
        <div className="px-5 pb-6 pt-3 max-h-[80vh] overflow-y-auto">
          {isLoggedIn ? (
            <>
              <div className="flex items-center gap-3 py-3 mb-2 border-b border-border">
                <Avatar name={(auth as Auth).name || (auth as Auth).email || 'U'} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{(auth as Auth).name || 'Studio User'}</div>
                  <div className="text-xs text-muted truncate">{(auth as Auth).email}</div>
                </div>
                <span className="ml-auto text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 rounded-full px-2 py-0.5 flex-shrink-0">{ROLE_LABEL[(auth as Auth).role]}</span>
              </div>
              <Link href="/studio/home" onClick={closeAll} className="flex items-center gap-2 py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors">
                <HomeIcon /><span>Home</span>
              </Link>
              {(auth as Auth).role === 'OWNER' && (
                <><Link href="/studio/admin/studios" onClick={closeAll} className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors">Studios <span className="text-muted text-sm">→</span></Link>
                <Link href="/studio/admin/users" onClick={closeAll} className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors">Users <span className="text-muted text-sm">→</span></Link></>
              )}
              {(['ADMIN','PRINT'] as StudioRole[]).includes((auth as Auth).role) && (
                <Link href="/studio/dashboard" onClick={closeAll} className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors">Dashboard <span className="text-muted text-sm">→</span></Link>
              )}
              {(auth as Auth).role === 'CLIENT' && (auth as Auth).projectToken && (
                <Link href={`/studio/gallery/${(auth as Auth).projectToken}`} onClick={closeAll} className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors">My Gallery <span className="text-muted text-sm">→</span></Link>
              )}
              {NAV_LINKS.map(({ label, href }) => (
                <Link key={href} href={href} onClick={closeAll} className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors">
                  {label} <span className="text-muted text-sm">→</span>
                </Link>
              ))}
              <button onClick={handleLogout} className="mt-4 w-full text-center py-3 rounded-xl border border-danger/30 text-danger text-sm font-semibold hover:bg-danger/10 transition-colors">Sign out</button>
            </>
          ) : (
            <>
              {/* Products accordion */}
              <button onClick={() => setMobileProducts((v) => !v)} className="flex items-center justify-between w-full py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors">
                Products
                <span className={`transition-transform duration-200 ${mobileProducts ? 'rotate-180' : ''}`}><ChevronDown /></span>
              </button>
              {mobileProducts && (
                <div className="bg-bg/50 rounded-xl border border-border/50 mb-1 overflow-hidden">
                  {PRODUCTS.map((p) => (
                    <Link key={p.href} href={p.href} onClick={closeAll} className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-accent/5 transition-colors">
                      <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">{p.icon}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text-primary">{p.label}</span>
                          {p.badge && <span className="text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-full">{p.badge}</span>}
                        </div>
                        <p className="text-xs text-muted">{p.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {NAV_LINKS.map(({ label, href }) => (
                <Link key={href} href={href} onClick={closeAll} className="flex items-center justify-between py-3.5 text-base font-medium text-text-primary border-b border-border/40 last:border-0 hover:text-accent transition-colors">
                  {label} <span className="text-muted text-sm">→</span>
                </Link>
              ))}

              <div className="grid grid-cols-2 gap-3 mt-5">
                <Link href="/studio/login" onClick={closeAll} className="py-3 rounded-xl border border-border text-text-primary text-sm font-semibold text-center hover:bg-border/40 transition-colors">Login</Link>
                <Link href="/studio/get-started" onClick={closeAll} className="py-3 rounded-xl bg-accent text-bg text-sm font-bold text-center hover:bg-accent/90 transition-colors">Get Started</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
