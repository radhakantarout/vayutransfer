'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

interface JoinInfo {
  projectId: string
  eventName: string
  hostName: string
  existingStatus: string | null
}

function nameStorageKey(token: string) {
  return `moments_join_name_${token}`
}

function celebratedKey(token: string) {
  return `moments_join_celebrated_${token}`
}

// Small self-built confetti burst — no library, fired once when a join
// request becomes approved (either immediately via auto-approve, or the
// first time this browser revisits the link after a manual approval).
function fireConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  ctx.scale(dpr, dpr)
  const colors = ['#f97316', '#ec4899', '#8b5cf6', '#facc15', '#34d399']
  const particles = Array.from({ length: 90 }, () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 3,
    vx: (Math.random() - 0.5) * 14,
    vy: Math.random() * -12 - 4,
    size: Math.random() * 6 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    spin: (Math.random() - 0.5) * 20,
  }))
  let frame = 0
  const tick = () => {
    frame++
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    particles.forEach((p) => {
      p.vy += 0.5
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.spin
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    })
    if (frame < 100) requestAnimationFrame(tick)
    else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  }
  requestAnimationFrame(tick)
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
  const confettiRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    fetch(`/studio/api/moments/join/${params.token}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) { setNotFound(true); return }
        setInfo(res.data)
        setStatus(res.data.existingStatus)
        if (res.data.existingStatus === 'APPROVED' && !sessionStorage.getItem(celebratedKey(params.token))) {
          sessionStorage.setItem(celebratedKey(params.token), '1')
          setTimeout(() => confettiRef.current && fireConfetti(confettiRef.current), 200)
        }
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
      if (res.data.status === 'APPROVED') {
        sessionStorage.setItem(celebratedKey(params.token), '1')
        setTimeout(() => confettiRef.current && fireConfetti(confettiRef.current), 200)
      }
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
        <div className="text-3xl">🔗</div>
        <p className="text-sm font-semibold text-text-primary">This invite link isn&apos;t valid or has expired</p>
        <Link href="/studio/login" className="text-sm text-accent hover:underline">← Back to sign in</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden">
      <canvas ref={confettiRef} className="fixed inset-0 pointer-events-none z-50" aria-hidden />

      <header className="flex items-center px-5 sm:px-8 py-4">
        <Link href="/studio/login" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="VayuStudios" width={28} height={28} className="h-7 w-7" />
          <span className="text-sm font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studios</span> <span className="text-muted font-semibold">Moments</span>
          </span>
        </Link>
      </header>

      <main className="max-w-md mx-auto px-5 sm:px-0 py-10 sm:py-16 text-center space-y-6">
        <div
          className="inline-flex w-20 h-20 rounded-3xl items-center justify-center text-4xl animate-reel-float shadow-lg"
          style={{ background: GRADIENT }}
        >
          {status === 'APPROVED' ? '🎊' : status === 'PENDING' ? '⏳' : '🎉'}
        </div>

        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary break-words">{info.eventName}</h1>
          <p className="text-sm text-muted">
            <span className="font-semibold text-text-primary">{info.hostName}</span> invited you to join this gallery
          </p>
        </div>

        <div className="rounded-3xl p-[1.5px]" style={{ background: GRADIENT }}>
          <div className="bg-card rounded-[22px] p-6 sm:p-7 space-y-4">
            {status === 'APPROVED' ? (
              <>
                <p className="text-base font-extrabold text-text-primary">You&apos;re in! <span aria-hidden>🎊</span></p>
                <p className="text-xs text-muted">Time to see what everyone&apos;s been sharing.</p>
                <Link
                  href={`/studio/moments/${info.projectId}`}
                  className="block w-full text-center text-white font-bold py-3.5 rounded-2xl text-sm hover:opacity-90 transition-opacity"
                  style={{ background: GRADIENT }}
                >
                  Open gallery <span aria-hidden>→</span>
                </Link>
              </>
            ) : status === 'PENDING' ? (
              <>
                <div className="flex justify-center gap-1 py-1">
                  <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-sm text-muted">
                  Your request to join is awaiting approval from <span className="font-semibold text-text-primary">{info.hostName}</span>. You&apos;ll be able to see the gallery as soon as they say yes.
                </p>
              </>
            ) : status === 'REJECTED' ? (
              <p className="text-sm text-muted">Your request to join wasn&apos;t approved.</p>
            ) : (
              <>
                <p className="text-sm text-muted">Ask to join and start viewing, liking, and commenting on photos &amp; videos from this gallery.</p>
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-muted pl-1">Your name (shown to everyone in this gallery)</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setNameTouched(true)}
                    placeholder="e.g. Priya Sharma"
                    className={`w-full bg-bg border rounded-2xl px-4 py-3 text-sm text-text-primary placeholder:text-muted/70 shadow-sm focus:outline-none transition-colors ${
                      nameTouched && name.trim().length < 2 ? 'border-danger focus:border-danger' : 'border-border/60 focus:border-accent'
                    }`}
                  />
                  {nameTouched && name.trim().length < 2 && <p className="text-xs text-danger pl-1">Enter your name — at least 2 characters</p>}
                </div>
                {error && <div className="bg-danger/10 border border-danger/30 rounded-lg px-3.5 py-2.5 text-xs text-danger text-left">{error}</div>}
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="w-full text-white font-bold py-3.5 rounded-2xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  style={{ background: GRADIENT }}
                >
                  {joining ? 'Requesting…' : 'Ask to join ✨'}
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted">Private by default <span aria-hidden>🔒</span></p>
      </main>
    </div>
  )
}
