'use client'

import { useState } from 'react'
import MomentsBottomNav from '@/components/studio/moments/BottomNav'
import NotificationsPanel from '@/components/studio/moments/NotificationsPanel'

export default function MomentsNotificationsPage() {
  const [pendingCount, setPendingCount] = useState(0)

  return (
    <div className="min-h-screen bg-bg pb-24 md:pb-0 md:pl-20 lg:pl-56">
      <header className="px-5 sm:px-8 py-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">Notifications</h1>
        <p className="text-sm text-muted">Join requests waiting on you</p>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-8">
        <NotificationsPanel onPendingCountChange={setPendingCount} />
      </main>

      <MomentsBottomNav pendingCount={pendingCount} />
    </div>
  )
}
