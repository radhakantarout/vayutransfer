'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useState } from 'react'
import { useWallet } from '@/lib/wallet-context'
import { useTheme } from '@/lib/theme-context'
import TopupModal from '@/components/TopupModal'

export default function Navbar() {
  const { data: session, status } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const { walletId, balancePaise, refreshBalance, topupOpen, openTopup, closeTopup } = useWallet()
  const { theme, toggle } = useTheme()

  return (
    <>
      <nav className="border-b border-border bg-nav/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <Image src="/logo.png" alt="VayuTransfer" width={200} height={200} className="h-10 w-auto" />
          </Link>

          {/* Nav links — desktop */}
          <div className="hidden md:flex items-center gap-6 text-sm text-muted">
            <Link href="/" className="hover:text-text-primary transition-colors">Transfer Files</Link>
            <Link href="/pricing" className="hover:text-text-primary transition-colors">Pricing</Link>
            {session && (
              <Link href="/transfers" className="hover:text-text-primary transition-colors">My Transfers</Link>
            )}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-3">
            {/* Day / Night toggle */}
            <button
              onClick={toggle}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-border hover:border-accent text-muted hover:text-accent transition-colors"
            >
              {theme === 'dark' ? (
                /* Sun icon */
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                /* Moon icon */
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>

            {status === 'loading' ? (
              <div className="w-8 h-8 rounded-full bg-border animate-pulse" />
            ) : session ? (
              <>
                {/* Wallet balance + topup */}
                {walletId && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-success">
                      ₹{(balancePaise / 100).toFixed(2)}
                    </span>
                    <button
                      onClick={openTopup}
                      title="Add credits"
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-bold text-lg leading-none transition-colors"
                    >
                      +
                    </button>
                  </div>
                )}

                {/* User avatar dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  >
                    {session.user?.image ? (
                      <Image
                        src={session.user.image}
                        alt={session.user.name ?? 'User'}
                        width={32}
                        height={32}
                        className="rounded-full border border-border"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-accent text-sm font-bold">
                        {session.user?.name?.[0]?.toUpperCase() ?? 'U'}
                      </div>
                    )}
                    <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-10 z-20 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[160px]">
                        <Link
                          href="/profile"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors"
                        >
                          Profile
                        </Link>
                        <Link
                          href="/transfers"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors"
                        >
                          My Transfers
                        </Link>
                        <div className="border-t border-border my-1" />
                        <button
                          onClick={() => { setMenuOpen(false); signOut({ callbackUrl: '/' }) }}
                          className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
                        >
                          Sign Out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={() => signIn('google')}
                className="flex items-center gap-2 bg-white text-gray-800 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Topup modal — global, triggered from navbar */}
      {topupOpen && walletId && (
        <TopupModal
          walletId={walletId}
          onSuccess={() => { refreshBalance(); closeTopup() }}
          onClose={closeTopup}
        />
      )}
    </>
  )
}
