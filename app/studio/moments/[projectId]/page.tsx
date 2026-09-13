'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { MediaFile, GalleryMember, ReelStyle } from '@/types/studio'
import { MOMENTS_RETENTION_DAYS } from '@/constants/studioPricing'
import { loadUploadResume, saveUploadResume, clearUploadResume } from '@/lib/studio/uploadResume'
import {
  CHUNK_SIZE, uploadFileInChunks, fetchWithTimeout, runWithConcurrencyLimit,
  formatBytes, formatSpeed, formatEta, type PartRecord,
} from '@/lib/studio/clientUpload'
import PhotoLightbox, { type LightboxPhoto } from '@/components/studio/PhotoLightbox'
import ReelMvpModal from '@/components/studio/ReelMvpModal'
import SelfieSearchModal from '@/components/studio/SelfieSearchModal'
import { MIN_REEL_PHOTOS, MAX_REEL_PHOTOS, REEL_TEMPLATES, REEL_STYLE_META } from '@/constants/videoProviders'

const MAX_CONCURRENT_UPLOADS = 4
const GRADIENT = 'linear-gradient(135deg,#f97316,#ec4899,#8b5cf6)'

interface EventDetail {
  projectId: string
  clientName: string
  createdAt: string
}

type GalleryFile = MediaFile & { likedByMe?: boolean }

interface AccessInfo {
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'NONE'
  role: 'ADMIN' | 'MEMBER' | null
  isOwner: boolean
}

interface UploadItem {
  id: string
  file: File
  fileId?: string
  uploadId?: string
  uploadedBytes: number
  totalBytes: number
  speedBytesPerSec: number
  secondsRemaining: number
  status: 'queued' | 'uploading' | 'done' | 'error' | 'cancelled'
  error?: string
  // Created once at queue-time (not per-render — object URLs are a real
  // per-call browser resource) and revoked on dismiss.
  previewUrl?: string
}

function retentionCountdown(createdAt: string): { daysLeft: number; deadline: string } {
  const created = new Date(createdAt)
  const deadline = new Date(created.getTime() + MOMENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
  return { daysLeft, deadline: deadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
}

async function initOrResumeUpload(
  projectId: string,
  file: File,
  partCount: number
): Promise<{ fileId: string; uploadId: string; presignedUrls: string[]; completedParts: PartRecord[] }> {
  const existing = loadUploadResume(projectId, file.name, file.size, file.lastModified)
  if (existing) {
    const statusRes = await fetchWithTimeout(
      `/studio/api/moments/events/${projectId}/files/${existing.fileId}/upload-status?uploadId=${encodeURIComponent(existing.uploadId)}&partCount=${partCount}`
    ).then((r) => r.json()).catch(() => null)
    if (statusRes?.success) {
      return {
        fileId: existing.fileId,
        uploadId: existing.uploadId,
        presignedUrls: statusRes.data.presignedUrls,
        completedParts: statusRes.data.completedParts,
      }
    }
    clearUploadResume(projectId, file.name, file.size, file.lastModified)
  }

  const initRes = await fetchWithTimeout(`/studio/api/moments/events/${projectId}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, partCount }),
  }).then((r) => r.json())
  if (!initRes.success) throw new Error(initRes.message ?? 'Upload failed to start')
  const { fileId, uploadId, presignedUrls } = initRes.data
  saveUploadResume({ projectId, fileId, uploadId, filename: file.name, size: file.size, lastModified: file.lastModified })
  return { fileId, uploadId, presignedUrls, completedParts: [] }
}

// ── Comments — lightweight bottom-sheet, Moments-only (not folded into the
// shared PhotoLightbox since that component is also used by Client Gallery
// and Guest, which have no comment concept yet). ──────────────────────────
interface CommentItem {
  commentId: string
  userId: string
  name?: string
  text: string
  createdAt: string
  isMine: boolean
}

function CommentsSheet({
  projectId, fileId, isAdmin, onClose, onCountChange,
}: {
  projectId: string; fileId: string; isAdmin: boolean; onClose: () => void; onCountChange: (delta: number) => void
}) {
  const [comments, setComments] = useState<CommentItem[] | null>(null)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(() => {
    fetch(`/studio/api/moments/events/${projectId}/files/${fileId}/comments`)
      .then((r) => r.json())
      .then((res) => setComments(res.success ? res.data : []))
      .catch(() => setComments([]))
  }, [projectId, fileId])

  useEffect(() => { load() }, [load])

  // Live-ish — polls for new comments from other people while this sheet is
  // open, so a conversation feels shared without anyone hitting refresh.
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 4000)
    return () => clearInterval(timer)
  }, [load])

  const post = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      const res = await fetch(`/studio/api/moments/events/${projectId}/files/${fileId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      }).then((r) => r.json())
      if (res.success) {
        setComments((prev) => [res.data, ...(prev ?? [])])
        setText('')
        onCountChange(1)
      }
    } finally {
      setPosting(false)
    }
  }

  const remove = async (commentId: string) => {
    const res = await fetch(`/studio/api/moments/events/${projectId}/files/${fileId}/comments/${commentId}`, { method: 'DELETE' }).then((r) => r.json())
    if (res.success) {
      setComments((prev) => (prev ?? []).filter((c) => c.commentId !== commentId))
      onCountChange(-1)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold text-text-primary">💬 Comments</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border/60 text-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {comments === null ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          ) : comments.length === 0 ? (
            <div className="text-center py-10 space-y-1.5">
              <div className="text-2xl">💬</div>
              <p className="text-xs text-muted">No comments yet — say something nice!</p>
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.commentId} className="flex items-start gap-2.5 group">
                <Avatar label={c.name ?? 'Someone'} size={28} />
                <div className="min-w-0 flex-1 bg-bg border border-border rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                  <p className="text-xs font-bold text-text-primary">{c.name ?? 'Someone'}</p>
                  <p className="text-sm text-text-primary break-words">{c.text}</p>
                </div>
                {(c.isMine || isAdmin) && (
                  <button onClick={() => remove(c.commentId)} className="text-muted hover:text-danger text-xs flex-shrink-0 px-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                )}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-shrink-0">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && post()}
            placeholder="Add a comment…"
            maxLength={500}
            className="flex-1 bg-bg border border-border rounded-full px-4 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={post}
            disabled={posting || !text.trim()}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full text-white disabled:opacity-40"
            style={{ background: GRADIENT }}
            aria-label="Post"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.77 59.77 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── "Liked by" — small popover, same attribution idea WhatsApp/Instagram
// show on a long-press/tap of a like count. ────────────────────────────────
function LikersSheet({ projectId, fileId, onClose }: { projectId: string; fileId: string; onClose: () => void }) {
  const [likers, setLikers] = useState<{ userId: string; name: string }[] | null>(null)

  useEffect(() => {
    fetch(`/studio/api/moments/events/${projectId}/files/${fileId}/likes`)
      .then((r) => r.json())
      .then((res) => setLikers(res.success ? res.data : []))
      .catch(() => setLikers([]))
  }, [projectId, fileId])

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-xs max-h-[60vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold text-text-primary">❤️ Liked by</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border/60 text-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {likers === null ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
          ) : likers.length === 0 ? (
            <p className="text-xs text-muted text-center py-8">No likes yet</p>
          ) : (
            likers.map((l) => (
              <div key={l.userId} className="flex items-center gap-2.5 py-1.5">
                <Avatar label={l.name} size={28} />
                <span className="text-sm text-text-primary">{l.name}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Group Chat — WhatsApp-style, polling-based (see memory: chosen over a
// WebSocket push implementation to avoid new AWS infra this pass). Every
// approved member can use it, not just admins. ─────────────────────────────
interface ChatMessage {
  messageId: string
  userId: string
  name?: string
  text: string
  createdAt: string
  isMine: boolean
}

function fmtChatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

function GroupChatModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastCountRef = useRef(0)

  const load = useCallback(() => {
    fetch(`/studio/api/moments/events/${projectId}/messages`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) return
        setMessages(res.data)
      })
      .catch(() => {})
  }, [projectId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 3000)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (!messages) return
    if (messages.length !== lastCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: lastCountRef.current === 0 ? 'auto' : 'smooth' })
      lastCountRef.current = messages.length
    }
  }, [messages])

  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    setSending(true)
    try {
      const res = await fetch(`/studio/api/moments/events/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      }).then((r) => r.json())
      if (res.success) setMessages((prev) => [...(prev ?? []), res.data])
      else setText(trimmed) // put it back so nothing typed is lost
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[95] bg-bg flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <h2 className="text-sm font-bold text-text-primary">💬 Group Chat</h2>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-border/60 text-muted">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-2xl mx-auto w-full">
        {messages === null ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted text-center py-8">No messages yet — say hi 👋</p>
        ) : (
          messages.map((m) => (
            <div key={m.messageId} className={`flex items-end gap-2 ${m.isMine ? 'justify-end' : 'justify-start'}`}>
              {!m.isMine && <Avatar label={m.name ?? 'Someone'} size={26} />}
              <div className={`max-w-[75%] ${m.isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                {!m.isMine && <span className="text-[10px] font-semibold text-accent px-1 mb-0.5">{m.name ?? 'Someone'}</span>}
                <div
                  className={`rounded-2xl px-3.5 py-2 text-sm break-words ${
                    m.isMine ? 'text-white rounded-br-sm' : 'bg-card border border-border text-text-primary rounded-bl-sm'
                  }`}
                  style={m.isMine ? { background: GRADIENT } : undefined}
                >
                  {m.text}
                </div>
                <span className="text-[9px] text-muted px-1 mt-0.5">{fmtChatTime(m.createdAt)}</span>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-shrink-0 max-w-2xl mx-auto w-full">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message…"
          maxLength={1000}
          className="flex-1 bg-card border border-border rounded-full px-4 py-2.5 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full text-bg disabled:opacity-40"
          style={{ background: GRADIENT }}
          aria-label="Send"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.77 59.77 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

const AVATAR_TINTS = [
  'linear-gradient(135deg,#f97316,#ec4899)',
  'linear-gradient(135deg,#3b82f6,#8b5cf6)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)',
  'linear-gradient(135deg,#10b981,#3b82f6)',
]

function initialsOf(label: string) {
  const parts = label.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function tintFor(label: string) {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]
}

function Avatar({ label, size = 34 }: { label: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ background: tintFor(label), width: size, height: size, fontSize: size * 0.4 }}
    >
      {initialsOf(label)}
    </div>
  )
}

// ── Admin "People" panel — invite link + permission toggles + pending
// requests + member list. Owner/admin only. ───────────────────────────────
function PeopleModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [daysRemaining, setDaysRemaining] = useState(0)
  const [atMaxExpiry, setAtMaxExpiry] = useState(false)
  const [extendDayOptions, setExtendDayOptions] = useState<number[]>([1, 3, 7])
  const [extending, setExtending] = useState(false)
  const [autoApprove, setAutoApprove] = useState(false)
  const [allowDownloads, setAllowDownloads] = useState(false)
  const [allowReels, setAllowReels] = useState(false)
  const [members, setMembers] = useState<GalleryMember[] | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch(`/studio/api/moments/events/${projectId}/invite`).then((r) => r.json()).then((res) => {
      if (!res.success) return
      setInviteUrl(res.data.inviteUrl)
      setDaysRemaining(res.data.daysRemaining)
      setAtMaxExpiry(res.data.atMaxExpiry)
      setExtendDayOptions(res.data.extendDayOptions ?? [1, 3, 7])
      setAutoApprove(res.data.autoApproveMembers)
      setAllowDownloads(res.data.allowMemberDownloads)
      setAllowReels(res.data.allowMemberReels)
    })
    fetch(`/studio/api/moments/events/${projectId}/members`).then((r) => r.json()).then((res) => {
      if (res.success) setMembers(res.data)
    })
  }, [projectId])

  useEffect(() => { load() }, [load])

  const generateOrSave = async (overrides: Partial<{ autoApproveMembers: boolean; allowMemberDownloads: boolean; allowMemberReels: boolean; regenerate: boolean }> = {}) => {
    setSaving(true)
    try {
      const res = await fetch(`/studio/api/moments/events/${projectId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoApproveMembers: overrides.autoApproveMembers ?? autoApprove,
          allowMemberDownloads: overrides.allowMemberDownloads ?? allowDownloads,
          allowMemberReels: overrides.allowMemberReels ?? allowReels,
          regenerate: overrides.regenerate ?? false,
        }),
      }).then((r) => r.json())
      if (res.success) load()
    } finally {
      setSaving(false)
    }
  }

  const extend = async (days: number) => {
    setExtending(true)
    try {
      const res = await fetch(`/studio/api/moments/events/${projectId}/invite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extendDays: days }),
      }).then((r) => r.json())
      if (res.success) load()
    } finally {
      setExtending(false)
    }
  }

  const respond = async (userId: string, action: 'approve' | 'reject') => {
    const res = await fetch(`/studio/api/moments/events/${projectId}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    }).then((r) => r.json())
    if (res.success) load()
  }

  const promote = async (userId: string, action: 'promote' | 'demote') => {
    const res = await fetch(`/studio/api/moments/events/${projectId}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    }).then((r) => r.json())
    if (res.success) load()
  }

  const remove = async (userId: string) => {
    if (!window.confirm('Remove this person from the gallery?')) return
    const res = await fetch(`/studio/api/moments/events/${projectId}/members/${userId}`, { method: 'DELETE' }).then((r) => r.json())
    if (res.success) load()
  }

  const copy = () => {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const share = () => {
    if (!inviteUrl) return
    if (navigator.share) navigator.share({ title: 'Join my gallery', url: inviteUrl }).catch(() => {})
    else copy()
  }

  const pending = members?.filter((m) => m.status === 'PENDING') ?? []
  const approved = members?.filter((m) => m.status === 'APPROVED') ?? []

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0" style={{ background: GRADIENT }}>👨‍👩‍👧</div>
            <h2 className="text-sm font-bold text-text-primary">Invite &amp; manage people</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-border/60 text-muted">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="bg-bg border border-border rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-text-primary">Invite link</p>
            {inviteUrl ? (
              <>
                <div className="flex gap-2">
                  <input readOnly value={inviteUrl} className="flex-1 min-w-0 bg-card border border-border rounded-xl px-3 py-2.5 text-xs text-muted truncate" />
                  <button onClick={share} title="Share" className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-border text-muted hover:text-text-primary transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                    </svg>
                  </button>
                  <button onClick={copy} className="text-xs font-bold px-3.5 py-2.5 rounded-xl text-white flex-shrink-0 hover:opacity-90 transition-opacity" style={{ background: GRADIENT }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${daysRemaining <= 2 ? 'text-danger bg-danger/10' : 'text-muted bg-border/50'}`}>
                    Expires in {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
                  </span>
                  {!atMaxExpiry ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted">Extend</span>
                      {extendDayOptions.map((d) => (
                        <button
                          key={d} onClick={() => extend(d)} disabled={extending}
                          className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-border text-muted hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
                        >
                          +{d}d
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted">At the 19-day gallery limit</span>
                  )}
                </div>
                <button onClick={() => generateOrSave({ regenerate: true })} disabled={saving} className="text-[11px] text-muted hover:text-text-primary">
                  Generate a new link
                </button>
              </>
            ) : (
              <button onClick={() => generateOrSave({ regenerate: true })} disabled={saving} className="text-xs font-bold px-4 py-2.5 rounded-xl text-white hover:opacity-90 transition-opacity" style={{ background: GRADIENT }}>
                Create invite link
              </button>
            )}
          </div>

          <div className="bg-bg border border-border rounded-2xl p-4 space-y-4">
            <p className="text-xs font-bold text-text-primary">Settings</p>
            {[
              { label: 'Auto-approve join requests', desc: 'Skip manual approval for new people', value: autoApprove, set: setAutoApprove, key: 'autoApproveMembers' as const },
              { label: 'Let members download', desc: 'Show a download button to approved members', value: allowDownloads, set: setAllowDownloads, key: 'allowMemberDownloads' as const },
              { label: 'Let members create Reels', desc: 'Uses your free AI credits per reel', value: allowReels, set: setAllowReels, key: 'allowMemberReels' as const },
            ].map((t) => (
              <div key={t.key} className="flex items-center gap-3">
                <button
                  type="button" role="switch" aria-checked={t.value}
                  onClick={() => { t.set(!t.value); generateOrSave({ [t.key]: !t.value }) }}
                  className={`relative flex-shrink-0 rounded-full transition-colors ${t.value ? 'bg-accent' : 'bg-border'}`}
                  style={{ height: '22px', width: '38px' }}
                >
                  <span className={`absolute top-0.5 left-0.5 rounded-full bg-white transition-transform ${t.value ? 'translate-x-4' : 'translate-x-0'}`} style={{ height: '18px', width: '18px' }} />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary">{t.label}</p>
                  <p className="text-[11px] text-muted">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-text-primary">Pending requests ({pending.length})</p>
              {pending.map((m) => (
                <div key={m.userId} className="flex items-center justify-between gap-2 bg-bg border border-border rounded-2xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar label={m.name ?? m.email ?? 'Someone'} size={30} />
                    <span className="text-sm text-text-primary truncate">{m.name ?? m.email ?? 'Someone'}</span>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => respond(m.userId, 'approve')} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg text-white bg-success">Approve</button>
                    <button onClick={() => respond(m.userId, 'reject')} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-border text-muted">Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-bold text-text-primary">Members ({approved.length})</p>
            {approved.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-2 bg-bg border border-border rounded-2xl px-3.5 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar label={m.name ?? m.email ?? 'Someone'} size={30} />
                  <div className="min-w-0">
                    <span className="text-sm text-text-primary truncate block">{m.name ?? m.email ?? 'Someone'}</span>
                    <span className="text-[10px] text-muted">{m.role === 'ADMIN' ? '⭐ Admin' : 'Member'}</span>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => promote(m.userId, m.role === 'ADMIN' ? 'demote' : 'promote')}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-text-primary"
                  >
                    {m.role === 'ADMIN' ? 'Remove admin' : 'Make admin'}
                  </button>
                  <button onClick={() => remove(m.userId)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-border text-danger hover:bg-danger/10">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Reels tab — inline, replacing the old ReelHistoryModal popup for
// Moments (same fetch/data shape, just rendered as a tab instead of a
// separate modal layer — see plan's "merge into tab" decision). ───────────
interface ReelHistoryItem {
  reelId: string
  status: string
  photoCount: number
  durationSec: number
  style: ReelStyle | null
  templateId: string | null
  creditsCharged: number
  createdAt: string
  completedAt: string | null
  errorMessage: string | null
  outputUrl: string | null
}

const REEL_STATUS_LABEL: Record<string, string> = { generating: 'Generating…', completed: 'Ready', failed: 'Failed' }
const REEL_STATUS_DOT: Record<string, string> = { generating: 'bg-yellow-400 animate-pulse', completed: 'bg-success', failed: 'bg-danger' }

function fmtReelDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function ReelsTabContent({ projectId, canReel }: { projectId: string; canReel: boolean }) {
  const [reels, setReels] = useState<ReelHistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/studio/api/moments/events/${projectId}/reels`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setReels(d.data); else setError('Could not load your reels.') })
      .catch(() => setError('Could not load your reels.'))
  }, [projectId])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-danger text-center py-8">{error}</p>}

      {!error && reels === null && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!error && reels?.length === 0 && (
        <div className="border border-dashed border-border rounded-2xl text-center py-14 space-y-2">
          <div className="text-3xl animate-reel-float">🎬</div>
          <p className="text-sm text-muted max-w-xs mx-auto">
            No reels yet{canReel ? ' — head to the Photos tab, tap ✨ Make a reel, and pick your favourites.' : ' yet.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {reels?.map((r) => (
          <div key={r.reelId} className="border border-border rounded-2xl overflow-hidden bg-card">
            <button
              onClick={() => r.status === 'completed' && setPlayingId(playingId === r.reelId ? null : r.reelId)}
              className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-border/30 transition-colors"
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${REEL_STATUS_DOT[r.status] ?? 'bg-muted'}`} />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary truncate">
                  {r.templateId && <span>{REEL_TEMPLATES.find((t) => t.id === r.templateId)?.icon}</span>}
                  {r.photoCount} photos · {r.durationSec}s
                  {r.style && (
                    <span
                      className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${REEL_STYLE_META[r.style].colors[0]}, ${REEL_STYLE_META[r.style].colors[2]})` }}
                    >
                      {REEL_STYLE_META[r.style].icon} {REEL_STYLE_META[r.style].label}
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-muted">{fmtReelDate(r.createdAt)} · {r.creditsCharged} credits</span>
              </span>
              <span className="text-[11px] font-semibold text-muted flex-shrink-0">{REEL_STATUS_LABEL[r.status] ?? r.status}</span>
            </button>

            {r.status === 'failed' && r.errorMessage && (
              <p className="text-[11px] text-danger px-3.5 pb-3">{r.errorMessage}</p>
            )}

            {playingId === r.reelId && r.outputUrl && (
              <div className="p-3 pt-0 space-y-2">
                <video src={r.outputUrl} controls autoPlay className="w-full rounded-xl bg-black" />
                <a href={r.outputUrl} download className="block text-center text-xs font-semibold text-accent hover:underline py-1">Download</a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MomentsEventPage({ params }: { params: { projectId: string } }) {
  const router = useRouter()
  const { projectId } = params

  const [access, setAccess]     = useState<AccessInfo | null>(null)
  const [event, setEvent]       = useState<EventDetail | null>(null)
  const [files, setFiles]       = useState<GalleryFile[]>([])
  const [meta, setMeta]         = useState({ allowMemberDownloads: false, allowMemberReels: false })
  const [uploads, setUploads]   = useState<UploadItem[]>([])
  // 'full' = dedicated full-screen "Uploading your moments" view (opens the
  // moment a batch starts); 'minimized' = a small floating tracker so the
  // person can keep browsing the gallery while it finishes in the background.
  const [uploadViewMode, setUploadViewMode] = useState<'full' | 'minimized'>('full')
  const [aiEnabled, setAiEnabled] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [checking, setChecking] = useState(true)
  const [dragActive, setDragActive] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [commentsFor, setCommentsFor] = useState<string | null>(null)
  const [likersFor, setLikersFor] = useState<string | null>(null)
  const [showPeople, setShowPeople] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [activeTab, setActiveTab] = useState<'photos' | 'reels'>('photos')
  const [menuOpen, setMenuOpen] = useState(false)
  const [reelSelectMode, setReelSelectMode] = useState(false)
  const [reelSelectedIds, setReelSelectedIds] = useState<Set<string>>(new Set())
  const [showReelModal, setShowReelModal] = useState(false)
  const [showSelfie, setShowSelfie] = useState(false)
  const [selfieFileIds, setSelfieFileIds] = useState<Set<string> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const indexedBatchRef = useRef<Set<string>>(new Set())
  const controllersRef = useRef<Map<string, AbortController>>(new Map())
  const startTimesRef  = useRef<Map<string, number>>(new Map())

  const isAdmin = access?.role === 'ADMIN'

  const refreshFiles = useCallback(async () => {
    const res = await fetch(`/studio/api/moments/events/${projectId}/files`).then((r) => r.json())
    if (res.success) {
      setFiles(res.data)
      if (res.meta) setMeta(res.meta)
    }
  }, [projectId])

  useEffect(() => {
    fetch('/studio/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (!res.success || !res.data || res.data.role !== 'CLIENT') {
          router.replace(`/studio/login?next=/studio/moments/${projectId}`)
          return
        }
        return fetch(`/studio/api/moments/events/${projectId}/access`)
          .then((r) => r.json())
          .then((accessRes) => {
            if (!accessRes.success) { setNotFound(true); return }
            setAccess(accessRes.data)
            if (accessRes.data.status !== 'APPROVED') return
            return fetch(`/studio/api/moments/events/${projectId}`)
              .then((r) => r.json())
              .then((eventRes) => {
                if (!eventRes.success) { setNotFound(true); return }
                setEvent(eventRes.data)
                return refreshFiles()
              })
          })
      })
      .catch(() => setNotFound(true))
      .finally(() => setChecking(false))
  }, [projectId, router, refreshFiles])

  // Live-ish gallery — polls every few seconds so a new like/comment/upload
  // from someone else shows up without anyone needing to hit refresh. Paused
  // while the tab is hidden (no point spending the request), and skipped
  // entirely until the event itself has loaded.
  useEffect(() => {
    if (!event) return
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refreshFiles() }, 4000)
    return () => clearInterval(timer)
  }, [event, refreshFiles])

  useEffect(() => {
    if (!isAdmin) return
    if (uploads.length === 0) return
    const allSettled = uploads.every((u) => u.status === 'done' || u.status === 'error' || u.status === 'cancelled')
    if (!allSettled) return
    const doneFileIds = uploads.filter((u) => u.status === 'done' && u.fileId).map((u) => u.fileId!)
    if (doneFileIds.length === 0) return
    const batchKey = doneFileIds.slice().sort().join(',')
    if (indexedBatchRef.current.has(batchKey)) return
    indexedBatchRef.current.add(batchKey)
    if (aiEnabled) {
      fetch(`/studio/api/moments/events/${projectId}/faces/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: doneFileIds }),
      }).catch((err) => console.error('[moments AI indexing]', err))
    }
  }, [uploads, aiEnabled, projectId, isAdmin])

  const uploadFile = async (file: File, itemId: string) => {
    const update = (patch: Partial<UploadItem>) =>
      setUploads((prev) => prev.map((u) => (u.id === itemId ? { ...u, ...patch } : u)))

    const controller = controllersRef.current.get(itemId)
    if (!controller || controller.signal.aborted) return

    const startTime = Date.now()
    startTimesRef.current.set(itemId, startTime)
    update({ status: 'uploading', uploadedBytes: 0 })
    const partCount = Math.ceil(file.size / CHUNK_SIZE)

    try {
      const { fileId, uploadId, presignedUrls, completedParts } = await initOrResumeUpload(projectId, file, partCount)
      if (controller.signal.aborted) throw new DOMException('Upload cancelled', 'AbortError')
      update({ fileId, uploadId })

      const parts: PartRecord[] = await uploadFileInChunks(
        file, presignedUrls, completedParts,
        (uploadedBytes) => {
          const elapsed = (Date.now() - startTime) / 1000
          const speed = elapsed > 0.5 ? uploadedBytes / elapsed : 0
          const secsLeft = speed > 0 ? (file.size - uploadedBytes) / speed : Infinity
          update({ uploadedBytes, speedBytesPerSec: speed, secondsRemaining: secsLeft })
        },
        controller.signal
      )

      const completeRes = await fetchWithTimeout(`/studio/api/moments/events/${projectId}/upload-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, uploadId, parts }),
      }).then((r) => r.json())

      if (!completeRes.success) throw new Error(completeRes.message ?? 'Upload failed to finish')
      clearUploadResume(projectId, file.name, file.size, file.lastModified)
      update({ status: 'done', uploadedBytes: file.size })
      refreshFiles()
    } catch (err) {
      if (controller.signal.aborted) {
        update({ status: 'cancelled' })
      } else {
        update({ status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
      }
    } finally {
      controllersRef.current.delete(itemId)
      startTimesRef.current.delete(itemId)
    }
  }

  const handleFiles = (selected: FileList | null) => {
    if (!selected || selected.length === 0) return
    const items: UploadItem[] = Array.from(selected).map((f) => ({
      id: crypto.randomUUID(), file: f, uploadedBytes: 0, totalBytes: f.size,
      speedBytesPerSec: 0, secondsRemaining: Infinity, status: 'queued' as const,
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }))
    items.forEach((item) => controllersRef.current.set(item.id, new AbortController()))
    setUploadViewMode('full')
    setUploads((prev) => [...prev, ...items])
    runWithConcurrencyLimit(items, MAX_CONCURRENT_UPLOADS, (item) => uploadFile(item.file, item.id))
  }

  const cancelUpload = async (item: UploadItem) => {
    controllersRef.current.get(item.id)?.abort()
    setUploads((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'cancelled' } : u)))
    if (item.fileId && item.uploadId) {
      clearUploadResume(projectId, item.file.name, item.file.size, item.file.lastModified)
      await fetch(`/studio/api/moments/events/${projectId}/upload-abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: item.fileId, uploadId: item.uploadId }),
      }).catch(() => {})
    }
  }

  const retryUpload = (item: UploadItem) => {
    controllersRef.current.set(item.id, new AbortController())
    setUploads((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'queued', error: undefined } : u)))
    uploadFile(item.file, item.id)
  }

  const dismissUpload = (itemId: string) => {
    controllersRef.current.delete(itemId)
    setUploads((prev) => {
      const item = prev.find((u) => u.id === itemId)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((u) => u.id !== itemId)
    })
  }

  const deleteFile = async (fileId: string) => {
    if (!window.confirm('Delete this permanently? This can\'t be undone.')) return
    setDeletingId(fileId)
    try {
      const res = await fetch(`/studio/api/moments/events/${projectId}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: [fileId] }),
      }).then((r) => r.json())
      if (res.success) {
        setFiles((prev) => prev.filter((f) => f.fileId !== fileId))
        setLightboxIndex(null)
      }
    } finally {
      setDeletingId(null)
    }
  }

  const toggleLike = async (fileId: string) => {
    setFiles((prev) => prev.map((f) => f.fileId === fileId
      ? { ...f, likedByMe: !f.likedByMe, likeCount: (f.likeCount ?? 0) + (f.likedByMe ? -1 : 1) }
      : f))
    const res = await fetch(`/studio/api/moments/events/${projectId}/files/${fileId}/like`, { method: 'POST' }).then((r) => r.json()).catch(() => null)
    if (!res?.success) refreshFiles() // revert via a fresh fetch if the toggle failed
  }

  const bumpCommentCount = (fileId: string, delta: number) => {
    setFiles((prev) => prev.map((f) => f.fileId === fileId ? { ...f, commentCount: Math.max(0, (f.commentCount ?? 0) + delta) } : f))
  }

  const toggleReelSelect = (fileId: string) => {
    setReelSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else if (next.size < MAX_REEL_PHOTOS) next.add(fileId)
      return next
    })
  }

  // Sign out lives on /studio/moments/profile now — the per-gallery menu
  // only holds gallery-scoped actions.

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  if (notFound || !access) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg gap-3 px-5 text-center">
        <p className="text-sm font-semibold text-text-primary">Couldn&apos;t find this event</p>
        <Link href="/studio/moments" className="text-sm text-accent hover:underline">← Back to your galleries</Link>
      </div>
    )
  }

  if (access.status === 'NONE' || access.status === 'REJECTED') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg gap-3 px-5 text-center">
        <div className="text-3xl">🔒</div>
        <p className="text-sm font-semibold text-text-primary">
          {access.status === 'REJECTED' ? 'Your request to join wasn\'t approved' : 'You need an invite to view this gallery'}
        </p>
        <p className="text-xs text-muted max-w-xs">Ask the gallery owner for their invite link.</p>
        <Link href="/studio/moments" className="text-sm text-accent hover:underline">← Back to your galleries</Link>
      </div>
    )
  }

  if (access.status === 'PENDING') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg gap-3 px-5 text-center">
        <div className="text-3xl animate-reel-float">⏳</div>
        <p className="text-sm font-semibold text-text-primary">Your request is awaiting approval</p>
        <p className="text-xs text-muted max-w-xs">You&apos;ll be able to see this gallery as soon as the owner approves you.</p>
        <Link href="/studio/moments" className="text-sm text-accent hover:underline">← Back to your galleries</Link>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  const { daysLeft, deadline } = retentionCountdown(event.createdAt)
  const activeUploads = uploads.filter((u) => u.status === 'queued' || u.status === 'uploading')
  const doneCount = uploads.filter((u) => u.status === 'done').length
  const combinedSpeed = activeUploads.reduce((sum, u) => sum + u.speedBytesPerSec, 0)
  const canDownload = isAdmin || meta.allowMemberDownloads
  const canReel = isAdmin || meta.allowMemberReels
  const displayFiles = selfieFileIds ? files.filter((f) => selfieFileIds.has(f.fileId)) : files
  const viewablePhotos: LightboxPhoto[] = displayFiles
    .filter((f) => f.processingStatus !== 'UPLOADING' && !!f.r2PreviewUrl)
    .map((f) => ({ fileId: f.fileId, previewUrl: f.r2PreviewUrl!, filename: f.originalFilename, fileType: f.fileType }))

  const coverPhotoUrl = files.find((f) => f.processingStatus === 'READY' && !!f.r2PreviewUrl)?.r2PreviewUrl
  const photoCount = files.filter((f) => f.fileType === 'IMAGE').length
  const videoCount = files.filter((f) => f.fileType === 'VIDEO').length

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-between gap-2 px-5 sm:px-8 py-4">
        <Link href="/studio/moments" aria-label="Back" className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-border/40 transition-colors -ml-1.5">
          <svg className="w-5 h-5 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex items-center gap-2">
          {/* Group Chat — promoted out of the menu since it's a core loop,
              not a setting; every approved member can reach it in one tap. */}
          <button
            onClick={() => setShowChat(true)}
            aria-label="Group chat"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4 4v-4z" />
            </svg>
          </button>
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-text-primary transition-colors"
            >
              <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-20 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[180px]">
                  <Link href="/studio/moments" className="block w-full px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors text-left">
                    ← My galleries
                  </Link>
                  {isAdmin && (
                    <button onClick={() => { setShowPeople(true); setMenuOpen(false) }} className="block w-full px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors text-left">
                      👨‍👩‍👧 Invite & manage people
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 pb-8 sm:pb-12 space-y-5">
        {/* Gradient-bordered hero card — cover photo backdrop when one
            exists, gradient fallback otherwise, matching the mock's header
            treatment on both the admin and member views. */}
        <div className="rounded-3xl p-[1.5px]" style={{ background: GRADIENT }}>
          <div className="relative rounded-[22px] overflow-hidden aspect-[16/10] sm:aspect-[21/9]">
            {coverPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-4xl" style={{ background: GRADIENT }}>🎉</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur ${daysLeft <= 2 ? 'bg-danger/80 text-white' : 'bg-white/20 text-white'}`}>
                {daysLeft > 0 ? `${daysLeft} days left` : 'Retention ending'}
              </span>
              {!isAdmin && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur">Member view</span>}
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4 space-y-0.5">
              <h1 className="text-lg sm:text-2xl font-extrabold text-white break-words drop-shadow">{event.clientName}</h1>
              <p className="text-xs text-white/80">
                {photoCount} photo{photoCount === 1 ? '' : 's'} · {videoCount} video{videoCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>

        {/* Photos / Reels tabs */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-full p-1 w-fit">
          <button
            onClick={() => setActiveTab('photos')}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${activeTab === 'photos' ? 'text-bg' : 'text-muted hover:text-text-primary'}`}
            style={activeTab === 'photos' ? { background: GRADIENT, color: 'white' } : undefined}
          >
            Photos
          </button>
          <button
            onClick={() => setActiveTab('reels')}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${activeTab === 'reels' ? 'text-bg' : 'text-muted hover:text-text-primary'}`}
            style={activeTab === 'reels' ? { background: GRADIENT, color: 'white' } : undefined}
          >
            Reels
          </button>
        </div>

        {activeTab === 'photos' && (
          <>
            {isAdmin && (
              <>
                <div className="flex items-start gap-3 bg-card border border-border rounded-2xl p-4">
                  <button
                    type="button" role="switch" aria-checked={aiEnabled}
                    onClick={() => setAiEnabled((v) => !v)}
                    className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors mt-0.5 ${aiEnabled ? 'bg-accent' : 'bg-border'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${aiEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text-primary">✨ AI Face Search</p>
                    <p className="text-xs text-muted leading-relaxed">
                      Let people find themselves instantly with a selfie. Uses a small amount of your free AI credits per photo, charged as each one is indexed — turn it off now and apply it later anytime.
                    </p>
                  </div>
                </div>

                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files) }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl py-10 sm:py-14 flex flex-col items-center justify-center gap-2 text-center px-5 cursor-pointer transition-colors ${
                    dragActive ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
                  }`}
                >
                  <input
                    ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
                    onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
                  />
                  <div className="text-3xl animate-reel-float">📤</div>
                  <p className="text-sm font-bold text-text-primary">Tap to add photos & videos</p>
                  <p className="text-xs text-muted">or drag and drop — up to {MAX_CONCURRENT_UPLOADS} upload at once, you can add more anytime</p>
                </div>
              </>
            )}

            {files.length > 0 && canReel && reelSelectMode && (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <span className="text-xs font-semibold text-text-primary whitespace-nowrap">{reelSelectedIds.size}/{MAX_REEL_PHOTOS} picked</span>
                <button
                  onClick={() => { setReelSelectMode(false); setReelSelectedIds(new Set()) }}
                  className="text-xs font-semibold text-bg bg-accent hover:bg-accent/90 transition-colors px-3 py-1.5 rounded-xl"
                >
                  Cancel
                </button>
              </div>
            )}

            {files.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setShowSelfie(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold border border-accent/40 text-accent bg-accent/10 rounded-full px-3 py-1.5 hover:bg-accent/20 transition-colors flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Find My Photos
                </button>
              </div>
            )}

            {selfieFileIds && (
              <div className="flex items-center gap-2 px-3 py-2 bg-accent/10 rounded-xl text-xs text-accent font-semibold">
                <span>Showing {displayFiles.length} photo{displayFiles.length !== 1 ? 's' : ''} with you</span>
                <button onClick={() => setSelfieFileIds(null)} className="ml-auto opacity-60 hover:opacity-100">Show all ×</button>
              </div>
            )}

            {displayFiles.length === 0 ? (
              <div className="border border-dashed border-border rounded-2xl py-16 sm:py-20 flex flex-col items-center justify-center gap-3 text-center px-5">
                <div className="text-3xl">📷</div>
                <p className="text-sm font-semibold text-text-primary">{selfieFileIds ? 'No matches' : 'No photos yet'}</p>
                <p className="text-xs text-muted max-w-xs">
                  {selfieFileIds ? 'No photos matched your selfie.' : isAdmin ? 'Add your first photo or video above to get this gallery started.' : 'The gallery owner hasn\'t added any photos yet.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                {displayFiles.map((f) => {
                  const isReady = f.processingStatus !== 'UPLOADING' && !!f.r2PreviewUrl
                  const isPicked = reelSelectedIds.has(f.fileId)
                  return (
                    <div key={f.fileId} className="relative aspect-square rounded-xl overflow-hidden bg-card border border-border">
                      <div
                        onClick={() => {
                          if (!isReady) return
                          if (reelSelectMode) toggleReelSelect(f.fileId)
                          else setLightboxIndex(viewablePhotos.findIndex((p) => p.fileId === f.fileId))
                        }}
                        className={`w-full h-full ${isReady ? 'cursor-pointer' : ''} ${reelSelectMode && isReady ? (isPicked ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'ring-1 ring-border') : ''}`}
                      >
                        {!isReady ? (
                          <div className="w-full h-full flex items-center justify-center text-2xl">{f.fileType === 'VIDEO' ? '🎬' : '🖼️'}</div>
                        ) : f.fileType === 'VIDEO' ? (
                          <video src={f.r2PreviewUrl} muted preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.r2PreviewUrl} alt={f.originalFilename} className="w-full h-full object-cover" loading="lazy" />
                        )}
                      </div>
                      {f.fileType === 'VIDEO' && isReady && !reelSelectMode && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                            <div className="w-0 h-0 border-y-[6px] border-y-transparent border-l-[10px] border-l-white ml-0.5" />
                          </div>
                        </div>
                      )}
                      {reelSelectMode && isReady && (
                        <div className={`absolute inset-0 flex items-center justify-center transition-colors pointer-events-none ${isPicked ? 'bg-accent/25' : 'bg-black/10'}`}>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isPicked ? 'bg-accent border-accent scale-100' : 'border-white/80 scale-90 bg-black/20'}`}>
                            {isPicked && (
                              <svg className="w-3.5 h-3.5 text-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </div>
                        </div>
                      )}
                      {f.processingStatus === 'PROCESSING' && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {isAdmin && !reelSelectMode && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteFile(f.fileId) }}
                          disabled={deletingId === f.fileId}
                          aria-label="Delete"
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 hover:bg-danger flex items-center justify-center text-white transition-colors disabled:opacity-50"
                        >
                          {deletingId === f.fileId ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      )}
                      {isReady && !reelSelectMode && (
                        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleLike(f.fileId) }}
                            className="flex items-center gap-0.5 bg-black/55 rounded-full px-1.5 py-0.5 text-white text-[10px] font-semibold"
                          >
                            <span className={f.likedByMe ? 'text-rose-500' : ''}>{f.likedByMe ? '❤️' : '🤍'}</span>
                            {(f.likeCount ?? 0) > 0 && (
                              <span onClick={(e) => { e.stopPropagation(); setLikersFor(f.fileId) }} className="underline decoration-dotted">
                                {f.likeCount}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setCommentsFor(f.fileId) }}
                            className="flex items-center gap-0.5 bg-black/55 rounded-full px-1.5 py-0.5 text-white text-[10px] font-semibold"
                          >
                            <span>💬</span>
                            {(f.commentCount ?? 0) > 0 && <span>{f.commentCount}</span>}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'reels' && <ReelsTabContent projectId={projectId} canReel={canReel} />}
      </main>

      {activeTab === 'photos' && canReel && files.length > 0 && !reelSelectMode && (
        <button
          onClick={() => { setReelSelectMode(true); setReelSelectedIds(new Set()) }}
          className="fixed bottom-24 md:bottom-8 right-4 z-30 flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 active:scale-[0.97] transition-all rounded-full pl-4 pr-5 py-3 shadow-2xl"
        >
          ✨ Make a reel
        </button>
      )}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={viewablePhotos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          role="moments"
          onDelete={isAdmin ? (photo) => deleteFile(photo.fileId) : undefined}
          onDownload={canDownload ? (photo) => window.open(photo.previewUrl, '_blank') : undefined}
        />
      )}

      {commentsFor && (
        <CommentsSheet
          projectId={projectId}
          fileId={commentsFor}
          isAdmin={isAdmin}
          onClose={() => setCommentsFor(null)}
          onCountChange={(delta) => bumpCommentCount(commentsFor, delta)}
        />
      )}

      {likersFor && (
        <LikersSheet projectId={projectId} fileId={likersFor} onClose={() => setLikersFor(null)} />
      )}

      {showPeople && <PeopleModal projectId={projectId} onClose={() => setShowPeople(false)} />}

      {showChat && <GroupChatModal projectId={projectId} onClose={() => setShowChat(false)} />}

      {reelSelectMode && reelSelectedIds.size >= MIN_REEL_PHOTOS && (
        <div className="fixed bottom-5 inset-x-4 z-30 flex justify-center">
          <button
            onClick={() => setShowReelModal(true)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-6 py-3.5 rounded-2xl shadow-2xl active:scale-[0.97] transition-all"
          >
            ✨ Create Reel ({reelSelectedIds.size})
          </button>
        </div>
      )}

      {showReelModal && (
        <ReelMvpModal
          source="moments"
          projectId={projectId}
          photoIds={Array.from(reelSelectedIds)}
          onClose={() => { setShowReelModal(false); setReelSelectMode(false); setReelSelectedIds(new Set()) }}
        />
      )}

      {showSelfie && (
        <SelfieSearchModal
          source="moments"
          projectId={projectId}
          onClose={() => setShowSelfie(false)}
          onResults={(photos) => { setSelfieFileIds(new Set(photos.map((p) => p.fileId))); setShowSelfie(false) }}
        />
      )}

      {/* Upload progress — a dedicated full-screen view opens the moment a
          batch starts (matching the mock's "Uploading your moments" screen);
          minimizing drops to a small floating tracker so browsing the
          gallery isn't blocked while it finishes. Same upload state/logic as
          before, purely a presentation change. */}
      {uploads.length > 0 && uploadViewMode === 'full' && (
        <div className="fixed inset-0 z-[110] bg-bg flex flex-col">
          <div className="flex items-center gap-3 px-5 sm:px-8 py-5 flex-shrink-0">
            <button
              onClick={() => setUploadViewMode('minimized')}
              aria-label="Minimize"
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-border/40 transition-colors -ml-1.5"
            >
              <svg className="w-5 h-5 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-extrabold text-text-primary">Uploading your moments <span aria-hidden>📤</span></h2>
              <p className="text-xs text-muted">
                {activeUploads.length > 0 ? `${activeUploads.length} upload${activeUploads.length === 1 ? '' : 's'} in progress` : 'All done'}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 sm:px-8 pb-8 space-y-3 max-w-2xl w-full mx-auto">
            {activeUploads.length > 0 && (
              <div className="flex items-center justify-between text-[11px] text-muted px-1 pb-1">
                <span>{doneCount} of {uploads.length} uploaded</span>
                {combinedSpeed > 0 && <span>{formatSpeed(combinedSpeed)} combined</span>}
              </div>
            )}
            {uploads.map((u) => {
              const pct = u.totalBytes > 0 ? Math.round((u.uploadedBytes / u.totalBytes) * 100) : 0
              const canCancel = u.status === 'queued' || u.status === 'uploading'
              const previewUrl = u.previewUrl ?? null
              return (
                <div key={u.id} className="flex items-center gap-3 bg-card border border-border rounded-2xl px-3.5 py-3 shadow-sm">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-bg flex-shrink-0 flex items-center justify-center text-lg">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="" className="w-full h-full object-cover" />
                    ) : '🎬'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary truncate">{u.file.name}</p>
                    {u.status === 'error' ? (
                      <p className="text-[11px] text-danger">{u.error}</p>
                    ) : u.status === 'cancelled' ? (
                      <p className="text-[11px] text-muted">Cancelled</p>
                    ) : (
                      <>
                        <div className="h-1.5 bg-border rounded-full overflow-hidden mt-1.5">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${u.status === 'queued' ? 0 : pct}%`, background: u.status === 'done' ? undefined : GRADIENT }}
                          />
                        </div>
                        {u.status === 'uploading' && (
                          <p className="text-[10px] text-muted mt-1">
                            {u.speedBytesPerSec > 0 && `${formatSpeed(u.speedBytesPerSec)}`}
                            {formatEta(u.secondsRemaining) && ` · ${formatEta(u.secondsRemaining)}`}
                          </p>
                        )}
                        {u.status === 'queued' && <p className="text-[10px] text-muted mt-1">Waiting…</p>}
                      </>
                    )}
                  </div>
                  <span className="text-xs font-bold text-text-primary flex-shrink-0">
                    {u.status === 'done' ? '✓' : u.status === 'queued' ? '' : u.status === 'uploading' ? `${pct}%` : ''}
                  </span>
                  {canCancel && (
                    <button onClick={() => cancelUpload(u)} aria-label="Cancel upload" className="flex-shrink-0 text-muted hover:text-danger transition-colors p-1">✕</button>
                  )}
                  {u.status === 'error' && (
                    <button onClick={() => retryUpload(u)} className="flex-shrink-0 text-[11px] font-semibold text-accent hover:underline px-1">Retry</button>
                  )}
                  {(u.status === 'done' || u.status === 'error' || u.status === 'cancelled') && (
                    <button onClick={() => dismissUpload(u.id)} aria-label="Dismiss" className="flex-shrink-0 text-muted hover:text-text-primary transition-colors p-1">✕</button>
                  )}
                </div>
              )
            })}
          </div>

          {activeUploads.length === 0 ? (
            <div className="px-5 sm:px-8 pb-8 max-w-2xl w-full mx-auto">
              <button
                onClick={() => {
                  setUploads((prev) => { prev.forEach((u) => { if (u.previewUrl) URL.revokeObjectURL(u.previewUrl) }); return [] })
                  setUploadViewMode('minimized')
                }}
                className="w-full text-white font-bold py-3.5 rounded-2xl text-sm"
                style={{ background: GRADIENT }}
              >
                Back to gallery
              </button>
            </div>
          ) : (
            <p className="text-center text-[11px] text-muted pb-6">Uploading — keep this tab open</p>
          )}
        </div>
      )}

      {uploads.length > 0 && uploadViewMode === 'minimized' && (
        <button
          onClick={() => setUploadViewMode('full')}
          className="fixed bottom-24 md:bottom-6 right-4 z-[105] flex items-center gap-2.5 bg-card border border-border rounded-2xl shadow-xl pl-2 pr-4 py-2"
        >
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-bg flex items-center justify-center text-sm flex-shrink-0">
            {activeUploads.length > 0 ? '📤' : '✓'}
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-text-primary">
              {activeUploads.length > 0 ? `Uploading ${doneCount}/${uploads.length}` : 'Upload complete'}
            </p>
            {activeUploads.length > 0 && (
              <div className="w-24 h-1 bg-border rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full" style={{ width: `${Math.round((doneCount / uploads.length) * 100)}%`, background: GRADIENT }} />
              </div>
            )}
          </div>
        </button>
      )}
    </div>
  )
}
