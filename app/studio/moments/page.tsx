'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import MomentsBottomNav from '@/components/studio/moments/BottomNav'
import TopNavBar from '@/components/studio/moments/TopNavBar'
import GoogleIcon from '@/components/studio/GoogleIcon'
import { setVayustudiosPath } from '@/lib/vayustudiosPathCookie'
import { MOMENTS_RETENTION_DAYS } from '@/constants/studioPricing'
import type { MediaFile } from '@/types/studio'

const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

interface Me {
  role: string
  name: string
  email: string
}

interface MomentsEvent {
  projectId: string
  clientName: string
  updatedAt: string
  createdAt: string
  coverPhotoUrl?: string | null
  memberCount?: number
  photoCount?: number
  videoCount?: number
  reelCount?: number
  isAdmin?: boolean
}

const FEATURES = [
  { emoji: '🎉', title: 'Create a quick event', body: 'Start sharing photos instantly with a shared gallery.', tint: 'linear-gradient(135deg,#f97316,#ec4899)' },
  { emoji: '💌', title: 'Invite your people', body: 'Share access easily via link, QR, or contact list.', tint: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' },
  { emoji: '🎬', title: 'Turn it into a reel', body: 'Compile best moments into a stunning video montage.', tint: 'linear-gradient(135deg,#8b5cf6,#ec4899)' },
]

function daysLeftFor(createdAt: string): number {
  const created = new Date(createdAt)
  const deadline = new Date(created.getTime() + MOMENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  return Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
}

// No real photography to source (same limitation solved for Reel style
// cards) — a small scattered "photo stack" built from gradient tiles +
// emoji stands in for the mock's polaroid illustration.
function PhotoStack() {
  return (
    <div className="relative w-24 h-24 mx-auto">
      <div className="absolute inset-0 m-auto w-16 h-16 rounded-full blur-2xl opacity-40" style={{ background: GRADIENT }} />
      <div className="absolute left-1 top-3 w-14 h-14 rounded-xl -rotate-12 shadow-lg flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg,#fdba74,#f97316)' }}>🎊</div>
      <div className="absolute right-0 top-0 w-14 h-14 rounded-xl rotate-12 shadow-lg flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg,#f0abfc,#ec4899)' }}>💜</div>
      <div className="absolute left-5 bottom-0 w-14 h-14 rounded-xl rotate-3 shadow-lg flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg,#c4b5fd,#8b5cf6)' }}>📷</div>
    </div>
  )
}

// The actual Moments front door for anyone signed out — reached either via
// the /studio/welcome chooser or by visiting /studio/moments directly.
// Reuses PhotoStack + FEATURES already defined above (zero new copy needed
// for the pitch section) so it stays trivially in sync with the rest of
// this file. Deliberately its own small "Taking you to Google…" transition
// (mirrors the one on /studio/(auth)/login/page.tsx) rather than importing
// anything from that file — keeps Studio Admin's login page untouched.
function MomentsLoggedOutLanding() {
  const [redirecting, setRedirecting] = useState(false)

  const goToGoogle = () => {
    setRedirecting(true)
    setTimeout(() => { window.location.href = '/studio/api/auth/google?intent=moments&next=/studio/moments' }, 700)
  }

  const switchToStudio = () => {
    setVayustudiosPath('studio')
    window.location.href = '/studio/home'
  }

  if (redirecting) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-5">
        <div className="text-center space-y-6">
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 rounded-full animate-spin" style={{ background: GRADIENT, animationDuration: '1.6s' }} />
            <div className="absolute inset-1.5 rounded-full bg-card flex items-center justify-center">
              <GoogleIcon />
            </div>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-extrabold text-text-primary">Taking you to Google…</h1>
            <p className="text-sm text-muted">Just a second — we&apos;re getting your gallery ready ✨</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-center px-5 py-6">
        <span className="text-sm font-extrabold text-text-primary">
          Vayu<span className="text-accent">Studios</span> <span className="text-muted font-semibold">Moments</span>
        </span>
      </header>

      <main className="max-w-md md:max-w-4xl mx-auto px-5 sm:px-8 pb-16 md:grid md:grid-cols-2 md:items-center md:gap-12">
        <div className="space-y-6">
          <div className="text-center md:text-left space-y-3">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-text-primary leading-tight">
              Your people.<br />Your moments. <span aria-hidden>✨</span>
            </h1>
            <p className="text-sm sm:text-base text-muted max-w-sm mx-auto md:mx-0">
              Free private galleries for weddings, trips, and get-togethers — invite your people, no studio needed.
            </p>
          </div>

          <button
            onClick={goToGoogle}
            className="w-full flex items-center justify-center gap-2.5 bg-card border border-border text-text-primary font-bold py-3.5 rounded-2xl text-sm hover:border-accent/40 transition-colors shadow-sm"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <p className="text-center md:text-left text-[11px] text-muted">Private by default 🔒 · Free to start</p>
        </div>

        <div className="mt-10 md:mt-0 space-y-6">
          <PhotoStack />

          <div className="bg-card border border-border rounded-3xl p-4 sm:p-5 space-y-1 animate-reel-pop-in" style={{ animationFillMode: 'backwards' }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-center gap-3.5 py-2.5">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: f.tint }}>
                  {f.emoji}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text-primary">{f.title}</p>
                  <p className="text-xs text-muted leading-snug">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <p className="text-center text-[11px] text-muted pb-8">
        <button onClick={switchToStudio} className="hover:text-text-primary hover:underline transition-colors">
          Looking for professional studio tools instead?
        </button>
      </p>
    </div>
  )
}

// "Edit" pencil — rename the event and/or change its cover, in one popup.
// Cover always picks from an EXISTING ready photo already in the gallery
// (same precedent as Studio Admin's "Set as Cover"), never a fresh upload,
// so this needs no upload machinery of its own.
function EditEventModal({
  event, onClose, onRenamed, onCoverPicked,
}: {
  event: MomentsEvent
  onClose: () => void
  onRenamed: (name: string) => void
  onCoverPicked: (url: string | null) => void
}) {
  const [files, setFiles] = useState<MediaFile[] | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [name, setName] = useState(event.clientName)
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/studio/api/moments/events/${event.projectId}/files`)
      .then((r) => r.json())
      .then((res) => setFiles(res.success ? res.data : []))
      .catch(() => setFiles([]))
  }, [event.projectId])

  const saveName = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 2) { setNameError('Give it a name — at least 2 characters'); return }
    if (trimmed === event.clientName) return
    setNameError(null)
    setSavingName(true)
    try {
      const res = await fetch(`/studio/api/moments/events/${event.projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName: trimmed }),
      }).then((r) => r.json())
      if (res.success) onRenamed(trimmed)
      else setNameError('Something went wrong — please try again')
    } finally {
      setSavingName(false)
    }
  }

  const pick = async (fileId: string, previewUrl: string) => {
    setSaving(fileId)
    try {
      const res = await fetch(`/studio/api/moments/events/${event.projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverPhotoFileId: fileId }),
      }).then((r) => r.json())
      if (res.success) { onCoverPicked(previewUrl); onClose() }
    } finally {
      setSaving(null)
    }
  }

  const ready = (files ?? []).filter((f) => f.fileType === 'IMAGE' && f.processingStatus === 'READY' && !!f.r2PreviewUrl)

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold text-text-primary">Edit gallery</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border/60 text-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted pl-1">Event name</label>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                className={`flex-1 min-w-0 bg-bg border rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none transition-colors ${
                  nameError ? 'border-danger focus:border-danger' : 'border-border focus:border-accent'
                }`}
              />
              <button
                onClick={saveName}
                disabled={savingName || name.trim() === event.clientName}
                className="text-xs font-bold px-3.5 py-2.5 rounded-xl text-white flex-shrink-0 hover:opacity-90 transition-opacity disabled:opacity-40"
                style={{ background: GRADIENT }}
              >
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
            {nameError && <p className="text-xs text-danger pl-1">{nameError}</p>}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted pl-1">Cover photo</p>
            {files === null ? (
              <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            ) : ready.length === 0 ? (
              <p className="text-xs text-muted text-center py-10">Add some photos to this gallery first, then come back to pick a cover.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {ready.map((f) => (
                  <button
                    key={f.fileId}
                    onClick={() => pick(f.fileId, f.r2PreviewUrl!)}
                    disabled={!!saving}
                    className="relative aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-accent transition-colors disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.r2PreviewUrl} alt="" className="w-full h-full object-cover" />
                    {saving === f.fileId && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmModal({ event, onClose, onConfirm, deleting }: { event: MomentsEvent; onClose: () => void; onConfirm: () => void; deleting: boolean }) {
  const totalMedia = (event.photoCount ?? 0) + (event.videoCount ?? 0)
  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={deleting ? undefined : onClose}>
      <div className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-6 space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-3xl">⚠️</div>
        <div className="space-y-1.5">
          <h2 className="text-base font-extrabold text-text-primary">Delete &quot;{event.clientName}&quot;?</h2>
          <p className="text-xs text-muted leading-relaxed">
            This permanently deletes {totalMedia} photo{totalMedia === 1 ? '' : 's'}/video{totalMedia === 1 ? '' : 's'}
            {!!event.reelCount && ` and ${event.reelCount} reel${event.reelCount === 1 ? '' : 's'}`}, every comment and like, and removes everyone in this gallery. This cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={deleting} className="flex-1 border border-border text-text-primary text-sm font-semibold py-3 rounded-xl hover:bg-border transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting} className="flex-1 bg-danger text-white text-sm font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            {deleting ? 'Deleting…' : 'Delete forever'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MomentsLandingPage() {
  const [me, setMe]         = useState<Me | null>(null)
  const [events, setEvents] = useState<MomentsEvent[] | null>(null)
  const [checking, setChecking] = useState(true)
  const [unauthenticated, setUnauthenticated] = useState(false)
  const [editingEvent, setEditingEvent] = useState<MomentsEvent | null>(null)
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<MomentsEvent | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data || res.data.role !== 'CLIENT') {
          setUnauthenticated(true)
          return
        }
        setMe(res.data)
        return fetch('/studio/api/moments/events')
          .then((r) => r.json())
          .then((eventsRes) => setEvents(eventsRes.success ? eventsRes.data : []))
      })
      .catch(() => setUnauthenticated(true))
      .finally(() => setChecking(false))
  }, [])

  const handleDelete = async () => {
    if (!deleteConfirmFor) return
    setDeleting(true)
    try {
      const res = await fetch(`/studio/api/moments/events/${deleteConfirmFor.projectId}`, { method: 'DELETE' }).then((r) => r.json())
      if (res.success) {
        setEvents((prev) => (prev ?? []).filter((e) => e.projectId !== deleteConfirmFor.projectId))
        setDeleteConfirmFor(null)
      }
    } finally {
      setDeleting(false)
    }
  }

  if (unauthenticated) {
    return <MomentsLoggedOutLanding />
  }

  if (checking || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  const firstName = me.name?.split(' ')[0] || 'there'
  const hasEvents = !!events && events.length > 0

  return (
    <div className="min-h-screen bg-bg pt-14 sm:pt-16 pb-24 md:pb-0 md:pl-20 lg:pl-56">
      <TopNavBar />

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-8 sm:py-16 space-y-8 sm:space-y-10">
        {hasEvents ? (
          <>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary">My Galleries</h1>
              <p className="text-sm text-muted">Your favourite people, all in one place.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {events!.map((ev, i) => {
                const daysLeft = daysLeftFor(ev.createdAt)
                const totalMedia = (ev.photoCount ?? 0) + (ev.videoCount ?? 0)
                return (
                  <Link
                    key={ev.projectId}
                    href={`/studio/moments/${ev.projectId}`}
                    className="relative overflow-hidden rounded-2xl aspect-[4/5] group animate-reel-pop-in"
                    style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' }}
                  >
                    {ev.coverPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ev.coverPhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-3xl" style={{ background: GRADIENT }}>🎉</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0" />

                    <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur ${daysLeft <= 2 ? 'bg-danger/85 text-white' : 'bg-black/40 text-white/90'}`}>
                        {daysLeft > 0 ? `${daysLeft}d left` : 'Expiring'}
                      </span>
                      {ev.isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingEvent(ev) }}
                            aria-label="Edit gallery"
                            title="Edit gallery"
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteConfirmFor(ev) }}
                            aria-label="Delete gallery"
                            title="Delete gallery"
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-black/40 hover:bg-danger text-white backdrop-blur transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1">
                      <p className="text-sm font-bold text-white truncate drop-shadow">{ev.clientName}</p>
                      <div className="flex flex-wrap items-center gap-1">
                        {!!ev.memberCount && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/90 bg-white/15 backdrop-blur px-2 py-0.5 rounded-full">
                            👥 {ev.memberCount}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/90 bg-white/15 backdrop-blur px-2 py-0.5 rounded-full">
                          🖼️ {totalMedia}
                        </span>
                        {!!ev.reelCount && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/90 bg-white/15 backdrop-blur px-2 py-0.5 rounded-full">
                            🎬 {ev.reelCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <div className="text-center space-y-4">
              <PhotoStack />
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary">
                  Welcome to Moments, {firstName} <span aria-hidden>✨</span>
                </h1>
                <p className="text-sm sm:text-base text-muted max-w-sm mx-auto">
                  Let&apos;s make your next moment unforgettable — bring your people together and keep every photo in one private place.
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-3xl p-4 sm:p-5 space-y-1 animate-reel-pop-in" style={{ animationFillMode: 'backwards' }}>
              {FEATURES.map((f) => (
                <div key={f.title} className="flex items-center gap-3.5 py-2.5">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: f.tint }}>
                    {f.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text-primary">{f.title}</p>
                    <p className="text-xs text-muted leading-snug">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <Link
                href="/studio/moments/new"
                className="w-full sm:w-auto text-center px-8 py-3.5 rounded-2xl font-bold text-sm text-white hover:opacity-90 transition-opacity"
                style={{ background: GRADIENT }}
              >
                Create an event <span aria-hidden>↗</span>
              </Link>
            </div>
            <p className="text-center text-[11px] text-muted -mt-6">Private by default <span aria-hidden>🔒</span></p>
          </>
        )}
      </main>

      {editingEvent && (
        <EditEventModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onRenamed={(name) => {
            setEvents((prev) => (prev ?? []).map((e) => (e.projectId === editingEvent.projectId ? { ...e, clientName: name } : e)))
            setEditingEvent((prev) => (prev ? { ...prev, clientName: name } : prev))
          }}
          onCoverPicked={(url) => setEvents((prev) => (prev ?? []).map((e) => (e.projectId === editingEvent.projectId ? { ...e, coverPhotoUrl: url } : e)))}
        />
      )}

      {deleteConfirmFor && (
        <DeleteConfirmModal event={deleteConfirmFor} deleting={deleting} onClose={() => setDeleteConfirmFor(null)} onConfirm={handleDelete} />
      )}

      <MomentsBottomNav />
    </div>
  )
}
