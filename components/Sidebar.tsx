'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useState } from 'react'
import { useWallet } from '@/lib/wallet-context'
import { useTheme } from '@/lib/theme-context'
import { useUpload } from '@/lib/upload-context'
import TopupModal from '@/components/TopupModal'
import { SendIcon, InboxIcon, FolderIcon, ListIcon, WalletIcon, UploadCloudIcon } from '@/components/icons'

// Received/Upload Links/Starred/Trash join this list once their pages exist
// (later phases), rather than linking anywhere dead in the meantime. See
// the UI redesign roadmap in memory.
const NAV_ITEMS = [
  { label: 'My Transfers', href: '/transfers', icon: FolderIcon },
  { label: 'Activity', href: '/dashboard', icon: ListIcon },
]

export default function Sidebar() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const { walletId, balancePaise, refreshBalance, topupOpen, openTopup, closeTopup } = useWallet()
  const { theme, toggle } = useTheme()
  const { uploads, abortUpload } = useUpload()
  const [menuOpen, setMenuOpen] = useState(false)
  // Destination the user actually clicked, held while the "transfer in
  // progress" confirmation is up — navigation only happens once they pick
  // Continue Browsing or Cancel Transfer, never on the raw click itself.
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  const isActive = (href: string) => pathname === href
  const activeUploads = uploads.filter((u) => u.status === 'uploading' || u.status === 'partial')

  // Every nav destination in this sidebar routes through this instead of a
  // plain <Link> — if something is actively uploading, clicking elsewhere
  // shouldn't feel like it might lose the transfer, so it pauses on a
  // reassuring confirmation instead of navigating straight away.
  const go = (href: string) => {
    if (pathname === href) return
    if (activeUploads.length > 0) {
      setPendingHref(href)
      return
    }
    router.push(href)
  }

  const continueBrowsing = () => {
    if (pendingHref) router.push(pendingHref)
    setPendingHref(null)
  }
  const cancelActiveTransfer = async () => {
    await Promise.all(activeUploads.map((u) => abortUpload(u.id)))
    if (pendingHref) router.push(pendingHref)
    setPendingHref(null)
  }

  return (
    <>
      {/* Sticks just below the always-present Navbar (h-14 = 56px), not at
          viewport top-0 — otherwise it would slide underneath the navbar
          during scroll instead of sitting flush below it. */}
      <aside className="flex flex-col items-center w-[76px] flex-shrink-0 min-h-[calc(100vh-56px)] sticky top-14 border-r border-border bg-card overflow-y-auto py-4 gap-1">
        {/* Logo */}
        <button onClick={() => go('/')} className="mb-3 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          <Image src="/logo.png" alt="VayuTransfer" width={34} height={34} className="h-[34px] w-[34px]" />
        </button>

        {/* Send */}
        <button
          onClick={() => go('/transfer/new')}
          className="flex flex-col items-center gap-1 w-16 py-2.5 rounded-2xl bg-gradient-to-b from-accent to-[#7C3AED] text-white shadow-md shadow-accent/25 hover:shadow-lg hover:shadow-accent/30 hover:-translate-y-0.5 transition-all"
        >
          <SendIcon className="w-4 h-4" />
          <span className="text-[10px] font-bold leading-none">Send</span>
        </button>

        {/* Request */}
        <button
          onClick={() => go('/transfers?request=1')}
          className="flex flex-col items-center gap-1 w-16 py-2.5 rounded-2xl border border-border bg-bg text-muted hover:text-accent hover:border-accent/50 hover:-translate-y-0.5 transition-all shadow-sm"
        >
          <InboxIcon className="w-4 h-4" />
          <span className="text-[10px] font-bold leading-none">Request</span>
        </button>

        {/* Nav items */}
        <nav className="flex flex-col items-center gap-1 mt-2 w-full px-2">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <button
              key={href}
              onClick={() => go(href)}
              className={`flex flex-col items-center gap-1 w-16 py-2 rounded-xl text-[10px] font-medium transition-all ${
                isActive(href)
                  ? 'bg-accent/10 text-accent shadow-inner'
                  : 'text-muted hover:bg-border/40 hover:text-text-primary'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Wallet balance + recharge */}
        {session && walletId && (
          <button
            onClick={openTopup}
            title={`₹${(balancePaise / 100).toFixed(2)} — tap to recharge`}
            className="flex flex-col items-center gap-1 w-16 py-2.5 mb-1 rounded-2xl bg-bg border border-border shadow-sm hover:border-accent/50 hover:-translate-y-0.5 transition-all"
          >
            <WalletIcon className="w-4 h-4 text-success flex-shrink-0" />
            <span className="text-[10px] font-bold text-success leading-none tabular-nums truncate max-w-[56px]">₹{Math.round(balancePaise / 100)}</span>
          </button>
        )}

        {/* User footer */}
        <div className="relative">
          {status === 'loading' ? (
            <div className="w-9 h-9 rounded-full bg-border/40 animate-pulse" />
          ) : session ? (
            <>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-full shadow-sm hover:shadow-md transition-shadow"
              >
                {session.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name ?? 'User'}
                    width={34} height={34}
                    className="rounded-full border border-border"
                  />
                ) : (
                  <div className="w-[34px] h-[34px] rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-accent text-xs font-bold">
                    {session.user?.name?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                )}
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute left-full bottom-0 ml-2 z-20 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[180px]">
                    <button
                      onClick={() => { setMenuOpen(false); go('/profile') }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors"
                    >
                      Profile
                    </button>
                    <button
                      onClick={toggle}
                      className="w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors"
                    >
                      {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    </button>
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
            </>
          ) : (
            <button
              onClick={() => signIn('google')}
              title="Sign in"
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </button>
          )}
        </div>
      </aside>

      {topupOpen && walletId && (
        <TopupModal
          walletId={walletId}
          onSuccess={() => { refreshBalance(); closeTopup() }}
          onClose={closeTopup}
        />
      )}

      {/* "Transfer in progress" navigation guard */}
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
