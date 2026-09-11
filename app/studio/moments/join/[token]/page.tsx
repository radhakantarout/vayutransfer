'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface JoinInfo {
  projectId: string
  eventName: string
  hostName: string
  existingStatus: string | null
}

function nameStorageKey(token: string) {
  return `moments_join_name_${token}`
}

export default function MomentsJoinPage({ params }: { params: { token: string } }) {
  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)

  useEffect(() => {
    fetch(`/studio/api/moments/join/${params.token}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) { setNotFound(true); return }
        setInfo(res.data)
        setStatus(res.data.existingStatus)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))

    // A name typed before the Google sign-in redirect survives here so the
    // "ask to join" step doesn't have to be repeated after coming back.
    const saved = sessionStorage.getItem(nameStorageKey(params.token))
    if (saved) { setName(saved); return }
    fetch('/studio/api/auth/me').then((r) => r.json()).then((res) => {
      if (res.success && res.data?.name) setName((current) => current || res.data.name)
    }).catch(() => {})
  }, [params.token])

  const handleJoin = async () => {
    const trimmedName = name.trim()
    setNameTouched(true)
    if (trimmedName.length < 2) return
    setJoining(true)
    setError(null)
    try {
      const res = await fetch(`/studio/api/moments/join/${params.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      }).then((r) => r.json())
      if (res.error === 'AUTH_REQUIRED') {
        sessionStorage.setItem(nameStorageKey(params.token), trimmedName)
        window.location.href = `/studio/api/auth/google?intent=moments&next=${encodeURIComponent(`/studio/moments/join/${params.token}`)}`
        return
      }
      if (!res.success) {
        setError(res.message ?? 'Something went wrong — please try again')
        return
      }
      sessionStorage.removeItem(nameStorageKey(params.token))
      setStatus(res.data.status)
    } catch {
      setError('Network error — please try again')
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  if (notFound || !info) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg gap-3 px-5 text-center">
        <p className="text-sm font-semibold text-text-primary">This invite link isn&apos;t valid or has expired</p>
        <Link href="/studio/login" className="text-sm text-accent hover:underline">← Back to sign in</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center px-5 sm:px-8 py-4 border-b border-border">
        <Link href="/studio/login" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="VayuStudios" width={28} height={28} className="h-7 w-7" />
          <span className="text-sm font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studios</span> <span className="text-muted font-semibold">Moments</span>
          </span>
        </Link>
      </header>

      <main className="max-w-md mx-auto px-5 sm:px-0 py-14 sm:py-20 text-center space-y-6">
        <div
          className="inline-flex w-16 h-16 rounded-2xl items-center justify-center text-3xl animate-reel-float"
          style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
        >
          🎉
        </div>

        <div className="space-y-1.5">
          <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">{info.eventName}</h1>
          <p className="text-sm text-muted">{info.hostName} invited you to join this gallery</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          {status === 'APPROVED' ? (
            <>
              <p className="text-sm font-semibold text-success">You&apos;re in! 🎊</p>
              <Link
                href={`/studio/moments/${info.projectId}`}
                className="block w-full text-center text-bg font-bold py-3 rounded-xl text-sm"
                style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
              >
                Open gallery →
              </Link>
            </>
          ) : status === 'PENDING' ? (
            <p className="text-sm text-muted">Your request to join is awaiting approval from {info.hostName}. You&apos;ll be able to see the gallery once approved.</p>
          ) : status === 'REJECTED' ? (
            <p className="text-sm text-muted">Your request to join wasn&apos;t approved.</p>
          ) : (
            <>
              <p className="text-sm text-muted">Ask to join and start viewing, liking, and commenting on photos & videos from this gallery.</p>
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-medium text-muted">Your name (shown to everyone in this gallery)</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  placeholder="e.g. Priya Sharma"
                  className={`w-full bg-bg border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none transition-colors ${
                    nameTouched && name.trim().length < 2 ? 'border-danger focus:border-danger' : 'border-border focus:border-accent'
                  }`}
                />
                {nameTouched && name.trim().length < 2 && <p className="text-xs text-danger">Enter your name — at least 2 characters</p>}
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full text-bg font-bold py-3 rounded-xl text-sm disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
              >
                {joining ? 'Requesting…' : 'Ask to join ✨'}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
