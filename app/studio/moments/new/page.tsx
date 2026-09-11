'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const SUGGESTIONS = ['Priya & Rahul\'s Wedding', 'Goa Trip 2026', 'Mom\'s 60th Birthday', 'Diwali at Home']

export default function NewMomentsEventPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [name, setName]         = useState('')
  const [touched, setTouched]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data || res.data.role !== 'CLIENT') {
          router.replace('/studio/login?next=/studio/moments/new')
        }
      })
      .finally(() => setChecking(false))
  }, [router])

  const isValid = name.trim().length >= 2

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!isValid) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/studio/api/moments/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      }).then((r) => r.json())
      if (!res.success) {
        setError('Something went wrong — please try again')
        return
      }
      router.push(`/studio/moments/${res.data.projectId}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center px-5 sm:px-8 py-4 border-b border-border">
        <Link href="/studio/moments" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="VayuStudios" width={28} height={28} className="h-7 w-7" />
          <span className="text-sm font-extrabold text-text-primary">
            Vayu<span className="text-accent">Studios</span> <span className="text-muted font-semibold">Moments</span>
          </span>
        </Link>
      </header>

      <main className="max-w-md mx-auto px-5 sm:px-0 py-10 sm:py-16 space-y-6">
        <div className="text-center space-y-2">
          <div
            className="inline-flex w-14 h-14 rounded-2xl items-center justify-center text-2xl animate-reel-float"
            style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
          >
            🎉
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">Name your event</h1>
          <p className="text-sm text-muted">You can always change this later.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted">Event name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              autoFocus
              placeholder="Priya &amp; Rahul's Wedding"
              className={`w-full bg-bg border rounded-lg px-3.5 py-3 text-base sm:text-sm text-text-primary placeholder:text-muted focus:outline-none transition-colors ${
                touched && !isValid ? 'border-danger focus:border-danger' : 'border-border focus:border-accent'
              }`}
            />
            {touched && !isValid && <p className="text-xs text-danger">Give it a name — at least 2 characters</p>}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setName(s)}
                className="text-[11px] px-2.5 py-1.5 rounded-full border border-border text-muted hover:border-accent/40 hover:text-text-primary transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3.5 py-2.5 text-sm text-danger">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full text-bg font-bold py-3.5 sm:py-3 rounded-xl text-sm transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)' }}
          >
            {submitting ? 'Creating…' : 'Create event ✨'}
          </button>
        </form>

        <p className="text-center">
          <Link href="/studio/moments" className="text-xs text-muted hover:text-text-primary transition-colors">← Back</Link>
        </p>
      </main>
    </div>
  )
}
