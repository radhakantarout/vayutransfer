'use client'

import MomentsBottomNav from '@/components/studio/moments/BottomNav'
import TopNavBar from '@/components/studio/moments/TopNavBar'
import ProfilePanel from '@/components/studio/moments/ProfilePanel'

export default function MomentsProfilePage() {
  return (
    <div className="min-h-screen bg-bg pt-14 sm:pt-16 pb-24 md:pb-0 md:pl-20 lg:pl-56">
      <TopNavBar />

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
