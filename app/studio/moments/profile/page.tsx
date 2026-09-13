'use client'

import MomentsBottomNav from '@/components/studio/moments/BottomNav'
import ProfilePanel from '@/components/studio/moments/ProfilePanel'

export default function MomentsProfilePage() {
  return (
    <div className="min-h-screen bg-bg pb-24 md:pb-0 md:pl-20 lg:pl-56">
      <header className="px-5 sm:px-8 py-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">Profile</h1>
      </header>

      <main className="max-w-md mx-auto px-5 sm:px-8">
        <ProfilePanel />
      </main>

      <MomentsBottomNav />
    </div>
  )
}
