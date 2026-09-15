'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMomentsTheme } from '@/lib/momentsTheme'
import { useChatWidget } from '@/components/studio/ChatWidgetContext'
import StudioTopupModal from '@/components/studio/StudioTopupModal'

interface Me {
  name: string
  email: string
  billingPlanId?: string
  aiCreditsUsed: number
  aiCreditsQuota: number
}

interface MomentsEventLite {
  photoCount?: number
  videoCount?: number
}

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'
const SUPPORT_EMAIL = 'support@vayutransfer.com'

function ChevronRight() {
  return (
    <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold text-muted uppercase tracking-wider px-1 pb-1.5">{children}</p>
}

function Row({
  icon, label, sub, onClick, right, danger,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  onClick?: () => void
  right?: React.ReactNode
  danger?: boolean
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${onClick ? 'hover:bg-border/30 active:bg-border/50' : ''}`}
    >
      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 bg-bg">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${danger ? 'text-danger' : 'text-text-primary'}`}>{label}</span>
        {sub && <span className="block text-[11px] text-muted mt-0.5">{sub}</span>}
      </span>
      {right !== undefined ? right : onClick ? <ChevronRight /> : null}
    </Comp>
  )
}

// Shared small centered modal shell for the pieces below — matches the
// rounded-3xl bottom-sheet/card pattern used everywhere else in Moments.
function MiniModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[95] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold text-text-primary">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border/60 text-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

// Feedback + legal-report both send a durable, server-side record via SES
// (POST /studio/api/moments/feedback) — a real support-inbox record even if
// the mailto: below (still opened as a redundant, familiar path) does
// nothing because the visitor has no mail client configured.
function MailtoModal({ kind, title, subjectLine, placeholder, onClose }: { kind: 'feedback' | 'legal'; title: string; subjectLine: string; placeholder: string; onClose: () => void }) {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)

  const send = () => {
    const trimmed = text.trim()
    fetch('/studio/api/moments/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, text: trimmed }),
    }).catch(() => {})
    const body = encodeURIComponent(trimmed)
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subjectLine)}&body=${body}`
    setSent(true)
  }

  return (
    <MiniModal title={title} onClose={onClose}>
      {sent ? (
        <div className="text-center py-6 space-y-2">
          <div className="text-2xl">✉️</div>
          <p className="text-sm font-semibold text-text-primary">Opening your email app…</p>
          <p className="text-xs text-muted">Send it across and we&apos;ll get back to you soon.</p>
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={5}
            autoFocus
            className="w-full bg-bg border border-border rounded-2xl px-3.5 py-3 text-sm text-text-primary placeholder:text-muted/60 focus:outline-none focus:border-accent resize-none transition-colors"
          />
          <button
            onClick={send}
            disabled={text.trim().length < 3}
            className="w-full text-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ background: GRADIENT }}
          >
            Send
          </button>
        </>
      )}
    </MiniModal>
  )
}

function DeleteAllModal({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ deleted: number; failed: number } | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    const res = await fetch('/studio/api/moments/events', { method: 'DELETE' }).then((r) => r.json()).catch(() => null)
    setDeleting(false)
    if (!res?.success) {
      setError('Something went wrong — please try again.')
      return
    }
    setDone(res.data)
  }

  if (done) {
    return (
      <MiniModal title="Delete all galleries" onClose={() => { onClose(); onDeleted() }}>
        <div className="text-center space-y-3 py-2">
          <div className="text-3xl">✅</div>
          <p className="text-sm font-bold text-text-primary">
            {done.deleted} galler{done.deleted === 1 ? 'y' : 'ies'} deleted{done.failed > 0 ? `, ${done.failed} failed` : ''}
          </p>
        </div>
        <Link
          href="/studio/moments"
          onClick={() => { onClose(); onDeleted() }}
          className="block w-full text-center text-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity"
          style={{ background: GRADIENT }}
        >
          Go to My Galleries
        </Link>
      </MiniModal>
    )
  }

  return (
    <MiniModal title="Delete all galleries" onClose={onClose}>
      <div className="text-center space-y-3">
        <div className="text-3xl">⚠️</div>
        <p className="text-sm font-bold text-text-primary">This permanently deletes every gallery you own</p>
        <p className="text-xs text-muted leading-relaxed">
          All photos, videos, comments, likes, and chat history in your own galleries will be gone for good — galleries you&apos;ve only joined as a member are not affected. This can&apos;t be undone.
        </p>
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] text-muted">Type <strong className="text-text-primary">delete</strong> to confirm</label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:border-danger"
          autoFocus
        />
      </div>
      {error && <p className="text-xs text-danger text-center">{error}</p>}
      <button
        onClick={handleDelete}
        disabled={confirmText.trim().toLowerCase() !== 'delete' || deleting}
        className="w-full bg-danger text-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {deleting ? 'Deleting…' : 'Delete everything'}
      </button>
    </MiniModal>
  )
}

export default function ProfilePanel() {
  const router = useRouter()
  const { theme, toggle: toggleTheme } = useMomentsTheme()
  const { setOpen: setChatOpen } = useChatWidget()
  const [me, setMe] = useState<Me | null>(null)
  const [usage, setUsage] = useState<{ galleryCount: number; mediaCount: number } | null>(null)
  const [checking, setChecking] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [modal, setModal] = useState<'upgrade' | 'feedback' | 'legal' | 'deleteAll' | null>(null)

  const loadMe = () => {
    return fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data || res.data.role !== 'CLIENT') {
          router.replace('/studio/login?next=/studio/moments/profile')
          return
        }
        setMe(res.data)
        return fetch('/studio/api/moments/events').then((r) => r.json()).then((eventsRes) => {
          if (!eventsRes.success) return
          const events: MomentsEventLite[] = eventsRes.data
          setUsage({
            galleryCount: events.length,
            mediaCount: events.reduce((sum, e) => sum + (e.photoCount ?? 0) + (e.videoCount ?? 0), 0),
          })
        })
      })
      .catch(() => router.replace('/studio/login?next=/studio/moments/profile'))
  }

  useEffect(() => {
    loadMe().finally(() => setChecking(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleLogout = async () => {
    setSigningOut(true)
    await fetch('/studio/api/auth/logout', { method: 'POST' })
    router.replace('/studio/login')
  }

  if (checking || !me) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const initials = (me.name || me.email || '?').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center gap-4 bg-card border border-border rounded-2xl p-5">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-extrabold flex-shrink-0 animate-reel-float"
          style={{ background: GRADIENT }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-text-primary truncate">{me.name || 'Your account'}</p>
          <p className="text-xs text-muted truncate">{me.email}</p>
        </div>
      </div>

      {/* Plan + usage */}
      <div>
        <SectionLabel>Plan &amp; Usage</SectionLabel>
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 bg-bg">⭐</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text-primary">Plan</span>
              <span className="inline-block text-[10px] font-bold text-accent bg-accent/10 rounded-full px-2 py-0.5 mt-0.5 capitalize">
                {me.billingPlanId ?? 'Free'}
              </span>
            </span>
            <button
              onClick={() => setModal('upgrade')}
              className="text-xs font-bold text-white rounded-full px-3.5 py-1.5 flex-shrink-0 hover:opacity-90 transition-opacity"
              style={{ background: GRADIENT }}
            >
              Buy credits
            </button>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 bg-bg">📊</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text-primary">Galleries</span>
              <span className="block text-[11px] text-muted mt-0.5">
                {usage ? `${usage.galleryCount} gallery${usage.galleryCount === 1 ? '' : 'ies'} · ${usage.mediaCount} photo${usage.mediaCount === 1 ? '' : 's'}/video${usage.mediaCount === 1 ? '' : 's'}` : '—'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 bg-bg">✨</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text-primary">AI credits</span>
              <span className="block text-[11px] text-muted mt-0.5">
                {typeof me.aiCreditsQuota === 'number' ? `${Math.max(0, me.aiCreditsQuota - me.aiCreditsUsed)} left of ${me.aiCreditsQuota} this month · covers AI search & reels` : '—'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div>
        <SectionLabel>Appearance</SectionLabel>
        <div className="bg-card border border-border rounded-2xl">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <button
              type="button" role="switch" aria-checked={theme === 'dark'}
              onClick={toggleTheme}
              className={`relative flex-shrink-0 rounded-full transition-colors ${theme === 'dark' ? 'bg-accent' : 'bg-border'}`}
              style={{ height: '22px', width: '38px' }}
            >
              <span className={`absolute top-0.5 left-0.5 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-4' : 'translate-x-0'}`} style={{ height: '18px', width: '18px' }} />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text-primary">Dark mode</p>
              <p className="text-[11px] text-muted">Moments looks best in the dark — switch back to light anytime</p>
            </div>
          </div>
        </div>
      </div>

      {/* Help & support */}
      <div>
        <SectionLabel>Help &amp; Support</SectionLabel>
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          <Row icon="💬" label="Help Center" sub="Chat with us" onClick={() => setChatOpen(true)} />
          <Row icon="📝" label="Send feedback" onClick={() => setModal('feedback')} />
          <Row icon="🚩" label="Report a legal issue" onClick={() => setModal('legal')} />
          <Row icon="🔒" label="Privacy notice" onClick={() => window.open('/privacy?from=moments', '_blank')} />
        </div>
      </div>

      {/* Danger zone */}
      <div>
        <SectionLabel>Danger Zone</SectionLabel>
        <div className="bg-card border border-danger/30 rounded-2xl">
          <Row icon="🗑️" label="Delete all galleries" danger onClick={() => setModal('deleteAll')} />
        </div>
      </div>

      <button
        onClick={handleLogout}
        disabled={signingOut}
        className="w-full border border-danger/30 text-danger text-sm font-bold py-3 rounded-xl hover:bg-danger/10 transition-colors disabled:opacity-50"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>

      <div className="text-center space-y-1 pt-2 pb-1">
        <p className="flex items-center justify-center gap-3 text-[11px] text-muted">
          <a href="/privacy?from=moments" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary hover:underline">Privacy</a>
          <span aria-hidden>·</span>
          <a href="/terms?from=moments" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary hover:underline">Terms of Service</a>
        </p>
        <p className="text-[10px] text-muted/70">© {new Date().getFullYear()} VayuStudios · Moments v1.0</p>
      </div>

      {modal === 'upgrade' && (
        <StudioTopupModal
          kind="ai-search"
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); loadMe() }}
        />
      )}
      {modal === 'feedback' && (
        <MailtoModal
          kind="feedback"
          title="Send feedback"
          subjectLine="Moments Feedback"
          placeholder="What's working well, what's not, what would you love to see?"
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'legal' && (
        <MailtoModal
          kind="legal"
          title="Report a legal issue"
          subjectLine="Moments — Legal/Safety Report"
          placeholder="Tell us what happened — include a gallery link if relevant."
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'deleteAll' && <DeleteAllModal onClose={() => setModal(null)} onDeleted={loadMe} />}
    </div>
  )
}
