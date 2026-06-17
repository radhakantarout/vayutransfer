'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [balance, setBalance] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetch('/api/wallet/balance')
        .then((r) => r.json())
        .then((d) => { if (d.success) setBalance(d.data.balanceFormatted) })
        .catch(() => {})
    }
  }, [session])

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">My Profile</h1>

      {/* User card */}
      <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-5">
        {session.user?.image ? (
          <Image
            src={session.user.image}
            alt={session.user.name ?? 'User'}
            width={64}
            height={64}
            className="rounded-full border-2 border-accent/30"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-accent/20 border-2 border-accent/30 flex items-center justify-center text-accent text-2xl font-bold">
            {session.user?.name?.[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <div className="text-lg font-bold text-text-primary">{session.user?.name}</div>
          <div className="text-sm text-muted">{session.user?.email}</div>
          <div className="text-xs text-accent mt-1 font-medium">Free Plan</div>
        </div>
      </div>

      {/* Wallet balance */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="text-sm text-muted mb-1">Wallet Balance</div>
        <div className="text-3xl font-bold text-success">{balance ?? '...'}</div>
        <div className="text-xs text-muted mt-1">Includes ₹50 welcome bonus</div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/transfers"
          className="bg-card border border-border rounded-2xl p-5 hover:border-accent/50 transition-colors"
        >
          <div className="text-2xl mb-2">📁</div>
          <div className="font-semibold text-text-primary text-sm">My Transfers</div>
          <div className="text-xs text-muted mt-1">View all files you've shared</div>
        </Link>
        <Link
          href="/"
          className="bg-card border border-border rounded-2xl p-5 hover:border-accent/50 transition-colors"
        >
          <div className="text-2xl mb-2">⬆️</div>
          <div className="font-semibold text-text-primary text-sm">Transfer a File</div>
          <div className="text-xs text-muted mt-1">Share securely with a link</div>
        </Link>
      </div>

      {/* Sign out */}
      <button
        onClick={() => signOut({ callbackUrl: '/' })}
        className="w-full bg-card border border-border rounded-xl py-3 text-sm text-muted hover:text-danger hover:border-danger/40 transition-colors"
      >
        Sign Out
      </button>
    </main>
  )
}
