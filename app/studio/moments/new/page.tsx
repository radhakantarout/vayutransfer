'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MomentsBottomNav from '@/components/studio/moments/BottomNav'
import TopNavBar from '@/components/studio/moments/TopNavBar'

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'
const SUGGESTIONS = ['Priya & Rahul\'s Wedding', 'Mia\'s 30th 🎂', 'Family Trip 🌴', 'Summer Reunion ☀️']

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
    <div className="min-h-screen bg-bg pt-14 sm:pt-16 pb-24 md:pb-0 md:pl-20 lg:pl-56">
      <TopNavBar />

      <main className="max-w-md mx-auto px-5 sm:px-0 py-6 sm:py-12 space-y-6">
        <button onClick={() => router.back()} className="text-sm text-accent hover:underline">← Back</button>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold text-text-primary">Start a new moment <span aria-hidden>✨</span></h1>
          <p className="text-sm text-muted">Give your event a name — the rest can come alive later.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted pl-1">Event name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              autoFocus
              placeholder="Priya &amp; Rahul's Wedding"
              className={`w-full bg-card border rounded-2xl px-4 py-3.5 text-base sm:text-sm text-text-primary placeholder:text-muted/60 shadow-sm focus:outline-none transition-colors ${
                touched && !isValid ? 'border-danger focus:border-danger' : 'border-border/60 focus:border-accent'
              }`}
            />
            {touched && !isValid && <p className="text-xs text-danger pl-1">Give it a name — at least 2 characters</p>}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted pl-1">Need an idea?</p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setName(s)}
                  className="text-xs font-medium text-left px-3 py-2.5 rounded-xl bg-card border border-border/60 text-text-primary hover:border-accent/40 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-3.5 py-2.5 text-sm text-danger">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full text-white font-bold py-3.5 rounded-2xl text-sm transition-opacity disabled:opacity-50 hover:opacity-90"
            style={{ background: GRADIENT }}
          >
            {submitting ? 'Creating…' : 'Create event'}
          </button>
        </form>
      </main>

      <MomentsBottomNav />
    </div>
  )
}
