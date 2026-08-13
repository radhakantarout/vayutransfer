import type { StudioTransfer } from '@/types/studio'
import { DEFAULT_TRANSFER_EXPIRY_DAYS, RECEIVE_PROGRESS_ETA_BUFFER_MULTIPLIER } from '@/lib/studio/transferConfig'

export function fmtBytes(bytes?: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function fmtExact(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return fmtExact(iso)
}

export type DerivedStatus = 'ACTIVE' | 'EXTENDED' | 'EXPIRING_SOON' | 'EXPIRED' | 'FAILED' | 'PENDING' | 'UPLOADING'

const EXPIRING_SOON_WINDOW_MS = 24 * 60 * 60 * 1000

// The stored `status` field lags reality for expiry — the daily cron sweep,
// not real-time, is what eventually flips READY -> EXPIRED, so a link past
// its own shareExpiresAt but still "READY" in the DB is common and must be
// treated as expired here regardless of the stored value.
export function derivedStatus(t: StudioTransfer): DerivedStatus {
  if (t.status === 'FAILED') return 'FAILED'
  if (t.status === 'PENDING') return 'PENDING'
  if (t.status === 'UPLOADING') return 'UPLOADING'
  const expiresAtMs = new Date(t.shareExpiresAt).getTime()
  const msLeft = expiresAtMs - Date.now()
  if (t.status === 'EXPIRED' || msLeft <= 0) return 'EXPIRED'
  if (msLeft <= EXPIRING_SOON_WINDOW_MS) return 'EXPIRING_SOON'
  if ((t.expiryDays ?? DEFAULT_TRANSFER_EXPIRY_DAYS) > DEFAULT_TRANSFER_EXPIRY_DAYS) return 'EXTENDED'
  return 'ACTIVE'
}

export const STATUS_META: Record<DerivedStatus, { label: string; className: string }> = {
  ACTIVE:         { label: 'Active',         className: 'text-success bg-success/10 border-success/20' },
  EXTENDED:       { label: 'Extended',       className: 'text-accent bg-accent/10 border-accent/20' },
  EXPIRING_SOON:  { label: 'Expiring soon',  className: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  EXPIRED:        { label: 'Expired',        className: 'text-danger bg-danger/10 border-danger/20' },
  FAILED:         { label: 'Failed',         className: 'text-danger bg-danger/10 border-danger/20' },
  PENDING:        { label: 'Awaiting upload', className: 'text-muted bg-border/40 border-border' },
  UPLOADING:      { label: 'Uploading…',     className: 'text-accent bg-accent/10 border-accent/20' },
}

// Shared between TransferActionBar (where a send is kicked off) and
// TransferDetailPanel (which shows the same live tracker if the admin has
// that specific transfer's detail panel open while it's the one uploading).
// transferId is undefined only in the brief window between clicking Send
// and the create-transfer call actually resolving.
export interface SendProgress {
  transferId?: string
  filename: string
  percent: number
  uploadedBytes: number
  totalBytes: number
  speedBps: number
  etaSeconds: number
}

export function fmtCooldown(ms: number): string {
  const totalSec = Math.max(Math.ceil(ms / 1000), 0)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export interface ReceiveProgressEstimate {
  uploadedBytes: number
  totalBytes: number
  percent: number
  speedBps: number
  etaSecondsBuffered: number
  checkedAt: string
}

// Derived entirely from fields already on the transfer record (no extra
// fetch) — `updatedAt` doubles as "upload started at" since nothing else
// touches a RECEIVE transfer's record while it's UPLOADING except the check-
// progress route itself, which deliberately never writes updatedAt.
export function estimateReceiveProgress(t: StudioTransfer): ReceiveProgressEstimate | null {
  if (t.direction !== 'RECEIVE' || t.status !== 'UPLOADING') return null
  if (!t.lastProgressCheckAt || t.lastProgressUploadedBytes == null || !t.sizeBytes) return null
  const startMs = new Date(t.updatedAt).getTime()
  const checkedMs = new Date(t.lastProgressCheckAt).getTime()
  const elapsedSec = Math.max((checkedMs - startMs) / 1000, 1)
  const speedBps = t.lastProgressUploadedBytes / elapsedSec
  const remainingBytes = Math.max(t.sizeBytes - t.lastProgressUploadedBytes, 0)
  const rawEtaSeconds = speedBps > 0 ? remainingBytes / speedBps : 0
  return {
    uploadedBytes: t.lastProgressUploadedBytes,
    totalBytes: t.sizeBytes,
    percent: Math.min(Math.round((t.lastProgressUploadedBytes / t.sizeBytes) * 100), 100),
    speedBps,
    etaSecondsBuffered: rawEtaSeconds * RECEIVE_PROGRESS_ETA_BUFFER_MULTIPLIER,
    checkedAt: t.lastProgressCheckAt,
  }
}

export function fmtEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s left`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s left`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m left`
}

export function fmtExpiryCountdown(t: StudioTransfer): string {
  const msLeft = new Date(t.shareExpiresAt).getTime() - Date.now()
  if (msLeft <= 0) return 'Expired'
  const hours = Math.floor(msLeft / (60 * 60 * 1000))
  if (hours < 1) return '<1h left'
  if (hours < 24) return `${hours}h left`
  const days = Math.floor(hours / 24)
  return `${days}d left`
}

export function transferShareUrl(t: StudioTransfer): string {
  const base = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.vayutransfer.com'
  return `${base}/studio/transfer/${t.direction === 'SEND' ? 'send' : 'receive'}/${t.shareToken}`
}

// Small single-weight (16-18px) line-icon set for file types — matches the
// codebase's inline-SVG-only convention (no icon library anywhere).
export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'archive' | 'generic'
export function fileKindFromMime(mimeType?: string): FileKind {
  if (!mimeType) return 'generic'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'archive'
  return 'generic'
}
