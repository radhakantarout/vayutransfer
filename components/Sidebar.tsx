'use client'

import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
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

// One shared selected/normal color language for every rail button (Send,
// Request, and the nav list below) — previously Send was hardcoded to
// always look "selected" and Request always looked "unselected" regardless
// of which page was actually active.
const RAIL_BUTTON_SELECTED = 'bg-gradient-to-b from-accent to-[#7C3AED] text-white shadow-md shadow-accent/25 hover:shadow-lg hover:shadow-accent/30'
const RAIL_BUTTON_NORMAL = 'border border-border bg-bg text-muted hover:text-accent hover:border-accent/50 shadow-sm'

export default function Sidebar() {
  // ConditionalSidebar never renders this component until `session` is
  // truthy, so there's no anonymous/loading branch to handle here.
  const { data: session } = useSession()
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
      {/* Fixed one-screen-tall rail, independent of page content height.
          `self-start` stops it stretching to match its flex-row sibling
          (the main content column, which grows arbitrarily tall on pages
          like My Transfers) — without it, the browser's default flex
          "stretch" would drag the whole rail (and the wallet button at its
          bottom) down with the page. A real `h-` (not `min-h-`) plus
          `sticky top-14` keeps it pinned to one viewport's worth of height
          just below the always-present Navbar (h-14 = 56px).
          Desktop-only (`hidden md:flex`) — on mobile, Navbar.tsx's
          hamburger drawer + profile avatar now own everything this rail
          does (Send/Request/My Transfers/Activity/Wallet/profile), so a
          second permanent 76px-wide column would just eat into an already
          narrow screen. */}
      <aside className="hidden md:flex flex-col items-center w-[76px] flex-shrink-0 self-start h-[calc(100vh-56px)] sticky top-14 border-r border-border bg-card py-4 gap-1">
        {/* Profile — replaces the old logo slot. The Navbar's own logo
            already handles home navigation, so a second one here was
            redundant. Deliberately NOT inside any overflow-scrolling
            container (unlike the nav list below), so its dropdown can open
            outside the rail's bounds instead of being clipped by it. */}
        <div className="relative mb-3">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full shadow-sm hover:shadow-md transition-shadow"
          >
            {session?.user?.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name ?? 'User'}
                width={34} height={34}
                className="rounded-full border border-border"
              />
            ) : (
              <div className="w-[34px] h-[34px] rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-accent text-xs font-bold">
                {session?.user?.name?.[0]?.toUpperCase() ?? 'U'}
              </div>
            )}
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-full top-0 ml-2 z-40 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[180px]">
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
        </div>

        {/* Send */}
        <button
          onClick={() => go('/transfer/new')}
          className={`flex flex-col items-center gap-1 w-16 py-2.5 rounded-2xl hover:-translate-y-0.5 transition-all flex-shrink-0 ${isActive('/transfer/new') ? RAIL_BUTTON_SELECTED : RAIL_BUTTON_NORMAL}`}
        >
          <SendIcon className="w-4 h-4" />
          <span className="text-[10px] font-bold leading-none">Send</span>
        </button>

        {/* Request */}
        <button
          onClick={() => go('/transfer/request')}
          className={`flex flex-col items-center gap-1 w-16 py-2.5 rounded-2xl hover:-translate-y-0.5 transition-all flex-shrink-0 ${isActive('/transfer/request') ? RAIL_BUTTON_SELECTED : RAIL_BUTTON_NORMAL}`}
        >
          <InboxIcon className="w-4 h-4" />
          <span className="text-[10px] font-bold leading-none">Request</span>
        </button>

        {/* Nav items — the one part of the rail that scrolls internally
            (min-h-0 lets it actually shrink instead of forcing the flex
            column to overflow) so a very short viewport never pushes the
            wallet button below the fold; on normal-height screens this
            never scrolls at all. */}
        <nav className="flex flex-col items-center gap-1 mt-2 w-full px-2 overflow-y-auto min-h-0">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <button
              key={href}
              onClick={() => go(href)}
              className={`flex flex-col items-center gap-1 w-16 py-2.5 rounded-2xl text-[10px] font-bold hover:-translate-y-0.5 transition-all flex-shrink-0 ${
                isActive(href) ? RAIL_BUTTON_SELECTED : RAIL_BUTTON_NORMAL
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Wallet balance + recharge */}
        {walletId && (
          <button
            onClick={openTopup}
            title={`₹${(balancePaise / 100).toFixed(2)} — tap to recharge`}
            className="flex flex-col items-center gap-1 w-16 py-2.5 rounded-2xl bg-bg border border-border shadow-sm hover:border-accent/50 hover:-translate-y-0.5 transition-all flex-shrink-0"
          >
            <WalletIcon className="w-4 h-4 text-success flex-shrink-0" />
            <span className="text-[10px] font-bold text-success leading-none tabular-nums truncate max-w-[56px]">₹{Math.round(balancePaise / 100)}</span>
          </button>
        )}
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
