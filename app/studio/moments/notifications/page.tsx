'use client'

import { useRouter } from 'next/navigation'
import MomentsBottomNav from '@/components/studio/moments/BottomNav'
import TopNavBar from '@/components/studio/moments/TopNavBar'
import NotificationsPanel from '@/components/studio/moments/NotificationsPanel'

export default function MomentsNotificationsPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-bg pt-14 sm:pt-16 pb-24 md:pb-0 md:pl-20 lg:pl-56">
      <TopNavBar />

      <header className="px-5 sm:px-8 py-6 space-y-1">
        <button onClick={() => router.back()} className="text-sm text-accent hover:underline">← Back</button>
        <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">Notifications</h1>
        <p className="text-sm text-muted">Join requests waiting on you</p>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8">
        <NotificationsPanel />
      </main>

      <MomentsBottomNav />
    </div>
  )
}
