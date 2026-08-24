'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { useUpload } from '@/lib/upload-context'
import { useWallet } from '@/lib/wallet-context'
import TopupModal from '@/components/TopupModal'
import { ChevronDownIcon, SendIcon, InboxIcon, FolderIcon, ListIcon, WalletIcon, UploadCloudIcon } from '@/components/icons'

const MOBILE_NAV_ITEMS = [
  { label: 'My Transfers', href: '/transfers', icon: FolderIcon },
  { label: 'Activity', href: '/dashboard', icon: ListIcon },
] as const

const PRODUCTS = [
  { label: 'Transfer Files', href: '/products/transfer-files', desc: 'Send files up to 400GB, flat ₹4.99/GB', icon: SendIcon },
  { label: 'Receive Files', href: '/products/receive-files', desc: 'Request files from anyone, no account needed', icon: InboxIcon },
  { label: 'Manage Transfers', href: '/products/manage-transfers', desc: 'Track, extend, and share every link in one place', icon: FolderIcon },
] as const

function HamburgerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/studio/home`

export default function Navbar() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [productsOpen, setProductsOpen] = useState(false)
  const [mobileProducts, setMobileProducts] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const productsRef = useRef<HTMLDivElement>(null)
  const { theme, toggle } = useTheme()
  const { uploads, abortUpload } = useUpload()
  const { walletId, balancePaise, topupOpen, openTopup, closeTopup, refreshBalance } = useWallet()
  // Set only while a just-clicked mobile-drawer destination is waiting on
  // the "transfer in progress" confirmation — mirrors Sidebar.tsx's own
  // guard so navigating away mid-upload from the mobile drawer (which now
  // owns Send/Request/My Transfers/Activity on small screens, since the
  // desktop sidebar is hidden there) can't silently drop an active upload.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const activeUploads = uploads.filter((u) => u.status === 'uploading' || u.status === 'partial')

  const isActive = (href: string) => pathname === href
  const desktopLinkClass = (href: string) =>
    `transition-colors ${isActive(href) ? 'text-accent font-semibold' : 'text-muted hover:text-text-primary'}`

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  useEffect(() => {
    if (!productsOpen) return
    const h = (e: MouseEvent) => { if (productsRef.current && !productsRef.current.contains(e.target as Node)) setProductsOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [productsOpen])

  const closeAll = () => { setMobileOpen(false); setProductsOpen(false); setMobileProducts(false); setProfileMenuOpen(false) }

  const go = (href: string) => {
    closeAll()
    if (pathname === href) return
    if (activeUploads.length > 0) { setPendingHref(href); return }
    router.push(href)
  }
  const continueBrowsing = () => { if (pendingHref) router.push(pendingHref); setPendingHref(null) }
  const cancelActiveTransfer = async () => {
    await Promise.all(activeUploads.map((u) => abortUpload(u.id)))
    if (pendingHref) router.push(pendingHref)
    setPendingHref(null)
  }

  return (
    <>
      {/* ── Navbar ── glassy sticky bar, modern depth to match the sidebar's
           gradient/shadow language rather than a flat bottom-border ── */}
      <nav className="sticky top-0 z-50 bg-card/90 backdrop-blur-md shadow-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <Link href="/" onClick={closeAll} className="flex items-center gap-2 flex-shrink-0 group">
            <span className="rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
              <Image src="/logo.png" alt="VayuTransfer" width={36} height={36} className="h-9 w-9 flex-shrink-0" />
            </span>
            <span className="text-lg font-extrabold text-text-primary leading-none">
              Vayu<span className="text-accent">Transfer</span>
            </span>
          </Link>

          {/* Desktop nav links — trimmed once signed in, since the sidebar
              (always visible for signed-in users) now owns My Transfers/
              Recent Activity/Send/Request. Anonymous users keep the full set. */}
          <div className="hidden md:flex items-center gap-7 text-sm">
            {/* Products dropdown */}
            <div ref={productsRef} className="relative">
              <button
                onClick={() => setProductsOpen((v) => !v)}
                className={`flex items-center gap-1.5 transition-colors ${productsOpen ? 'text-accent font-semibold' : 'text-muted hover:text-text-primary'}`}
              >
                Products
                <span className={`transition-transform duration-200 ${productsOpen ? 'rotate-180' : ''}`}><ChevronDownIcon className="w-3.5 h-3.5" /></span>
              </button>

              <div className={`absolute top-full left-0 mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl shadow-black/10 overflow-hidden transition-all duration-200 ${productsOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
                <div className="p-2 space-y-0.5">
                  {PRODUCTS.map(({ label, href, desc, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={closeAll}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/5 border border-transparent hover:border-accent/15 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0 group-hover:bg-accent group-hover:text-white group-hover:border-accent transition-all">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors block">{label}</span>
                        <p className="text-xs text-muted leading-snug">{desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <Link href="/pricing" className={desktopLinkClass('/pricing')}>Pricing</Link>
            {/* Opens in a new tab — VayuStudios is a separate product, keeping
                the VayuTransfer tab alive behind it is the better experience
                for both rather than navigating away entirely. */}
            <a
              href={STUDIO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-accent hover:text-accent/80 font-semibold transition-colors"
            >
              VayuStudios
              <span className="text-[10px] bg-gradient-to-r from-accent to-[#7C3AED] text-white px-1.5 py-0.5 rounded-full font-bold leading-none shadow-sm">NEW</span>
            </a>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 ml-auto">

            {/* Theme toggle */}
            <button
              onClick={toggle}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-muted shadow-sm hover:shadow-md hover:border-accent hover:text-accent hover:-translate-y-0.5 transition-all"
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>

            {/* Desktop auth — hidden on mobile. Signed-in users get nothing
                here: profile, sign-out, and theme toggle's sibling all live
                in the always-visible sidebar now, so a second profile
                icon/dropdown here would just be a redundant duplicate. */}
            <div className="hidden md:flex items-center gap-2">
              {status === 'loading' ? (
                <div className="w-8 h-8 rounded-full bg-border animate-pulse" />
              ) : !session ? (
                <>
                  <Link
                    href="/login"
                    className="border border-border text-text-primary text-sm font-semibold px-4 py-2 rounded-lg hover:border-accent hover:text-accent hover:-translate-y-0.5 transition-all"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="flex items-center gap-2 bg-gradient-to-r from-accent to-[#7C3AED] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 hover:shadow-md hover:-translate-y-0.5 transition-all shadow-sm"
                  >
                    Sign up
                  </Link>
                </>
              ) : null}
            </div>

            {/* Mobile profile avatar — signed-in only. Small, modern "3D"
                look (gradient ring + shadow + lift-on-hover), opens a
                compact Profile/Sign out menu. The sidebar's own profile
                menu is desktop-only now (see Sidebar.tsx), so this is
                mobile's only way to reach it. */}
            {session && (
              <div className="relative md:hidden">
                <button
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-br from-accent to-[#7C3AED] shadow-md shadow-accent/20 hover:shadow-lg hover:shadow-accent/30 hover:-translate-y-0.5 transition-all"
                  aria-label="Profile menu"
                >
                  {session.user?.image ? (
                    <Image src={session.user.image} alt={session.user.name ?? 'User'} width={29} height={29} className="w-full h-full rounded-full border-2 border-card" />
                  ) : (
                    <div className="w-full h-full rounded-full border-2 border-card bg-card flex items-center justify-center text-accent text-xs font-bold">
                      {session.user?.name?.[0]?.toUpperCase() ?? 'U'}
                    </div>
                  )}
                </button>

                {profileMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setProfileMenuOpen(false)} />
                    <div className="absolute right-0 top-10 z-40 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[160px]">
                      {walletId && (
                        <button
                          onClick={() => { setProfileMenuOpen(false); openTopup() }}
                          className="flex items-center justify-between w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors"
                        >
                          <span className="flex items-center gap-2"><WalletIcon className="w-4 h-4 text-success" />Wallet</span>
                          <span className="text-success font-semibold tabular-nums">₹{Math.round(balancePaise / 100)}</span>
                        </button>
                      )}
                      <button
                        onClick={() => { setProfileMenuOpen(false); go('/profile') }}
                        className="block w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors"
                      >
                        Profile
                      </button>
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={() => { setProfileMenuOpen(false); signOut({ callbackUrl: '/' }) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mobile hamburger — every screen size, both signed in and
                anonymous. Signed-in: Send/Request/My Transfers/Activity
                (previously desktop-sidebar-only) plus Products/Pricing/
                VayuStudios. Anonymous: unchanged. */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-border text-text-primary hover:bg-border/40 transition-colors"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <CloseIcon /> : <HamburgerIcon />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer — signed-in users get Send/Request/My Transfers/
          Activity here too (see below), since the desktop sidebar that
          normally owns those is hidden on mobile now (Sidebar.tsx). */}
      <div
        className={`fixed top-14 left-0 right-0 z-50 md:hidden bg-card border-b border-border shadow-2xl
          transition-all duration-200 ease-out
          ${mobileOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
      >
        <div className="px-5 pb-6 pt-3">

          {session && (
            <div className="pb-1 mb-1 border-b border-border/40">
              <button
                onClick={() => go('/transfer/new')}
                className="w-full flex items-center gap-3 py-2.5 text-sm font-semibold text-text-primary hover:text-accent transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-[#7C3AED] text-white flex items-center justify-center flex-shrink-0">
                  <SendIcon className="w-3.5 h-3.5" />
                </span>
                Send
              </button>
              <button
                onClick={() => go('/transfer/request')}
                className="w-full flex items-center gap-3 py-2.5 text-sm font-semibold text-text-primary hover:text-accent transition-colors"
              >
                <span className="w-7 h-7 rounded-lg border border-border bg-bg text-muted flex items-center justify-center flex-shrink-0">
                  <InboxIcon className="w-3.5 h-3.5" />
                </span>
                Request
              </button>
              {MOBILE_NAV_ITEMS.map(({ label, href, icon: Icon }) => (
                <button
                  key={href}
                  onClick={() => go(href)}
                  className={`w-full flex items-center gap-3 py-2.5 text-sm font-semibold transition-colors ${isActive(href) ? 'text-accent' : 'text-text-primary hover:text-accent'}`}
                >
                  <span className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${isActive(href) ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border bg-bg text-muted'}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Products accordion */}
          <button
            onClick={() => setMobileProducts((v) => !v)}
            className="flex items-center justify-between w-full py-3.5 text-base font-medium text-text-primary border-b border-border/40 hover:text-accent transition-colors"
          >
            Products
            <span className={`transition-transform duration-200 ${mobileProducts ? 'rotate-180' : ''}`}><ChevronDownIcon className="w-4 h-4" /></span>
          </button>
          {mobileProducts && (
            <div className="bg-bg/50 rounded-xl border border-border/50 my-1 overflow-hidden">
              {PRODUCTS.map(({ label, href, desc, icon: Icon }) => (
                <Link key={href} href={href} onClick={closeAll} className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-accent/5 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-accent flex-shrink-0"><Icon className="w-4 h-4" /></div>
                  <div>
                    <span className="text-sm font-semibold text-text-primary block">{label}</span>
                    <p className="text-xs text-muted">{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Nav links */}
          {[
            { label: 'Pricing', href: '/pricing' },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              onClick={closeAll}
              className={`flex items-center justify-between py-3.5 text-base border-b border-border/40 transition-colors ${
                isActive(href) ? 'font-semibold text-accent' : 'font-medium text-text-primary hover:text-accent'
              }`}
            >
              {label}
              <span className={isActive(href) ? 'text-accent text-sm' : 'text-muted text-sm'}>→</span>
            </Link>
          ))}

          {/* VayuStudios link — opens in a new tab, same reasoning as desktop */}
          <a
            href={STUDIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeAll}
            className="flex items-center justify-between py-3.5 text-base font-semibold text-accent border-b border-border/40 hover:text-accent/80 transition-colors"
          >
            <span className="flex items-center gap-2">
              VayuStudios
              <span className="text-[10px] bg-accent/15 border border-accent/20 text-accent px-1.5 py-0.5 rounded-full font-bold leading-none">NEW</span>
            </span>
            <span className="text-accent/50 text-sm">↗</span>
          </a>

          {/* Auth section — anonymous only; signed-in users manage their
              account from the profile avatar next to the hamburger instead. */}
          {!session && (
            <div className="mt-4 space-y-2">
              {status === 'loading' ? (
                <div className="h-12 bg-border/40 rounded-xl animate-pulse" />
              ) : (
                <>
                  <Link
                    href="/signup"
                    onClick={closeAll}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent to-[#7C3AED] text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity text-sm"
                  >
                    Sign up
                  </Link>
                  <Link
                    href="/login"
                    onClick={closeAll}
                    className="w-full flex items-center justify-center gap-2 border border-border text-text-primary font-semibold py-3 rounded-xl hover:bg-border/40 transition-colors text-sm"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TopupModal — opened from the mobile profile menu's Wallet row */}
      {topupOpen && walletId && (
        <TopupModal
          walletId={walletId}
          onSuccess={() => { refreshBalance(); closeTopup() }}
          onClose={closeTopup}
        />
      )}

      {/* "Transfer in progress" navigation guard — mirrors Sidebar.tsx's
          own guard, for the mobile drawer's Send/Request/My Transfers/
          Activity links. */}
      {pendingHref && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPendingHref(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                <UploadCloudIcon className="w-5 h-5" />
              </span>
              <div className="text-text-primary font-semibold">Your file transfer is in progress</div>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              No worries — you can keep browsing and track it anytime from My Transfers, or watch its progress in the tracker at the bottom-right. Want to cancel the current transfer instead?
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={continueBrowsing} className="w-full bg-accent text-bg font-bold py-2.5 rounded-xl hover:bg-accent/90 transition-colors text-sm">
                Continue Browsing
              </button>
              <button onClick={cancelActiveTransfer} className="w-full border border-danger/30 text-danger font-semibold py-2.5 rounded-xl hover:bg-danger/10 transition-colors text-sm">
                Cancel Transfer
              </button>
              <button onClick={() => setPendingHref(null)} className="w-full text-muted text-xs hover:text-text-primary transition-colors py-1">
                Stay on this page
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
