'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/lib/theme-context'
import { ChevronDownIcon, SendIcon, InboxIcon, FolderIcon } from '@/components/icons'

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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [productsOpen, setProductsOpen] = useState(false)
  const [mobileProducts, setMobileProducts] = useState(false)
  const productsRef = useRef<HTMLDivElement>(null)
  const { theme, toggle } = useTheme()

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

  const closeAll = () => { setMobileOpen(false); setProductsOpen(false); setMobileProducts(false) }

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

            {/* Mobile hamburger — anonymous only; signed-in users get the
                always-visible, mobile-friendly sidebar instead of this drawer. */}
            {!session && (
              <button
                onClick={() => setMobileOpen((v) => !v)}
                className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-border text-text-primary hover:bg-border/40 transition-colors"
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              >
                {mobileOpen ? <CloseIcon /> : <HamburgerIcon />}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile backdrop */}
      {!session && mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer — anonymous only, same reasoning as the hamburger above */}
      {!session && (
      <div
        className={`fixed top-14 left-0 right-0 z-50 md:hidden bg-card border-b border-border shadow-2xl
          transition-all duration-200 ease-out
          ${mobileOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
      >
        <div className="px-5 pb-6 pt-3">

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

          {/* Auth section — anonymous only in this drawer (see wrapping
              condition above). */}
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
        </div>
      </div>
      )}
    </>
  )
}
