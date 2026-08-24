'use client'

import { useEffect, useState } from 'react'
import { StarIcon } from '@/components/icons'

type SubjectType = 'transfer' | 'receiveRequest'
type Role = 'sender' | 'downloader' | 'requester' | 'uploader'

const PROMPTS: Record<Role, string> = {
  sender: 'How was sending this transfer?',
  downloader: 'How was downloading this file?',
  requester: 'How was receiving this file?',
  uploader: 'How was uploading to this request?',
}

interface Props {
  subjectType: SubjectType
  subjectId: string
  role: Role
}

function storageKey(role: Role, subjectId: string) {
  return `vayu-feedback-${role}-${subjectId}`
}

export default function FeedbackWidget({ subjectType, subjectId, role }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [showComment, setShowComment] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Already-submitted-in-this-browser check runs client-side only (avoids
  // an SSR/CSR localStorage mismatch) — a new transfer/request always gets
  // its own subjectId, so this only suppresses re-prompting for the exact
  // same instance, not feedback in general.
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(storageKey(role, subjectId))) {
      setSubmitted(true)
    }
  }, [role, subjectId])

  const submit = async () => {
    if (rating === 0 || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectType, subjectId, role, rating, comment: comment.trim() || undefined }),
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem(storageKey(role, subjectId), '1')
        setSubmitted(true)
      }
    } catch {
      // Best-effort — feedback is non-critical, fail silently rather than
      // interrupting a flow that already succeeded.
    } finally {
      setSubmitting(false)
    }
  }

  if (dismissed) return null

  if (submitted) {
    return (
      <div className="bg-success/5 border border-success/20 rounded-xl px-4 py-3 text-sm text-success text-center">
        Thanks for your feedback! 🙏
      </div>
    )
  }

  return (
    <div className="bg-bg border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">{PROMPTS[role]}</span>
        <button onClick={() => setDismissed(true)} className="text-muted hover:text-text-primary text-xs flex-shrink-0 transition-colors">
          Maybe later
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => { setRating(n); setShowComment(true) }}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            className="text-yellow-500 hover:scale-110 transition-transform p-0.5"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            <StarIcon className="w-6 h-6" filled={n <= (hoverRating || rating)} />
          </button>
        ))}
      </div>

      {showComment && (
        <div className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 500))}
            placeholder="Anything you'd like to add? (optional)"
            rows={2}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60 resize-none"
          />
          <button
            onClick={submit}
            disabled={rating === 0 || submitting}
            className="w-full bg-accent text-bg font-semibold text-sm py-2 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending…' : 'Submit feedback'}
          </button>
        </div>
      )}
    </div>
  )
}
