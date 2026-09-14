'use client'

import { useRouter } from 'next/navigation'
import ProfilePanel from '@/components/studio/moments/ProfilePanel'

// A dedicated full-screen destination (not a popup, not wrapped in the
// persistent TopNavBar/BottomNav shell) — reached from the profile icon on
// every other Moments page. Small "classic back" chevron instead of a
// modal's ✕, using real browser history so it returns to wherever the
// visitor actually came from (a specific gallery, search, etc.).
export default function MomentsProfilePage() {
  const router = useRouter()

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/studio/moments')
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center gap-2 px-4 sm:px-6 py-4">
        <button
          onClick={goBack}
          aria-label="Back"
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-border/40 transition-colors -ml-1.5"
        >
          <svg className="w-5 h-5 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-text-primary">Profile</h1>
      </header>

      <main className="max-w-md mx-auto px-4 sm:px-6 pb-14">
        <ProfilePanel />
      </main>
    </div>
  )
}
