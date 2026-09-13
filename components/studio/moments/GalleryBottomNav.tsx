'use client'

import Link from 'next/link'

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

interface Props {
  isAdmin: boolean
  canReel: boolean
  onChat: () => void
  onUpload: () => void
  onManagePeople: () => void
  onReelIt: () => void
}

const ICONS = {
  home: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0l8.955 8.955M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
    </svg>
  ),
  chat: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4 4v-4z" />
    </svg>
  ),
  people: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  ),
  reel: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  ),
  upload: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  ),
}

type NavItem =
  | { key: string; label: string; icon: React.ReactNode; href: string; isUpload?: false }
  | { key: string; label: string; icon: React.ReactNode; onClick: () => void; isUpload?: false }
  | { key: string; label: string; isUpload: true; onClick: () => void }

// Gallery-scoped bottom bar/left rail — persists across the whole time
// someone is inside a specific gallery (Photos tab, Reels tab, doesn't
// matter), unlike the top-level MomentsBottomNav which deliberately hides
// here. Composition is permission-aware: a plain member never sees Upload
// or People (upload/admin-only actions everywhere else in this file too),
// so they get Reel It (if allowed) and Find gets folded into the header
// instead — Home + Chat are the only two guaranteed slots for everyone.
export default function GalleryBottomNav({ isAdmin, canReel, onChat, onUpload, onManagePeople, onReelIt }: Props) {
  const items: NavItem[] = [
    { key: 'home', label: 'Home', icon: ICONS.home, href: '/studio/moments' },
    { key: 'chat', label: 'Chat', icon: ICONS.chat, onClick: onChat },
    ...(isAdmin ? [{ key: 'upload', label: 'Upload', isUpload: true as const, onClick: onUpload }] : []),
    ...(isAdmin ? [{ key: 'people', label: 'People', icon: ICONS.people, onClick: onManagePeople }] : []),
    ...(canReel ? [{ key: 'reel', label: 'Reel it', icon: ICONS.reel, onClick: onReelIt }] : []),
  ]

  return (
    <>
      {/* Mobile — fixed bottom bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 py-2">
          {items.map((item) =>
            item.isUpload ? (
              <button key={item.key} onClick={item.onClick} aria-label={item.label} className="flex flex-col items-center -mt-5">
                <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg animate-reel-glow" style={{ background: GRADIENT }}>
                  {ICONS.upload}
                </span>
              </button>
            ) : 'href' in item ? (
              <Link key={item.key} href={item.href} aria-label={item.label} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-muted transition-colors">
                {item.icon}
                <span className="text-[10px] font-semibold">{item.label}</span>
              </Link>
            ) : (
              <button key={item.key} onClick={item.onClick} aria-label={item.label} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-muted hover:text-accent transition-colors">
                {item.icon}
                <span className="text-[10px] font-semibold">{item.label}</span>
              </button>
            )
          )}
        </div>
      </nav>

      {/* Desktop — left rail */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-20 lg:w-56 flex-col items-stretch bg-card border-r border-border py-6 px-3 gap-1">
        {items.map((item) =>
          item.isUpload ? (
            <button
              key={item.key}
              onClick={item.onClick}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white text-sm font-bold mb-1"
              style={{ background: GRADIENT }}
            >
              {ICONS.upload}
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          ) : 'href' in item ? (
            <Link key={item.key} href={item.href} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted hover:text-text-primary hover:bg-border/40 transition-colors">
              {item.icon}
              <span className="text-sm font-semibold hidden lg:inline">{item.label}</span>
            </Link>
          ) : (
            <button key={item.key} onClick={item.onClick} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted hover:text-text-primary hover:bg-border/40 transition-colors">
              {item.icon}
              <span className="text-sm font-semibold hidden lg:inline">{item.label}</span>
            </button>
          )
        )}
      </nav>
    </>
  )
}
