'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  FolderIcon, PackageIcon, EditIcon, CopyIcon, ClockIcon, EyeIcon,
  LockIcon, TrashIcon, ChevronDownIcon, CheckCircleIcon, AlertCircleIcon,
} from '@/components/icons'
import { EXPIRY_DAY_OPTIONS, MAX_EXPIRY_DAYS_FROM_UPLOAD } from '@/constants/pricing'

interface TransferDetail {
  fileId: string
  fileName: string
  displayName?: string
  fileSizeBytes: number
  fileCount?: number
  status: 'pending' | 'active' | 'expired' | 'failed' | 'deleted'
  downloadsUsed: number
  expiryDays: number
  expiryTime: string
  createdAt: string
  passwordEnabled?: boolean
  shareableLink: string
}

interface ActivityAttempt {
  downloadId: string
  attemptedAt: string
  outcome: string
  countryCode?: string
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const OUTCOME_LABEL: Record<string, string> = {
  success: 'Downloaded',
  expired: 'Blocked — link expired',
  exhausted: 'Blocked — limit reached',
}

const EXTEND_TARGETS = [...EXPIRY_DAY_OPTIONS, MAX_EXPIRY_DAYS_FROM_UPLOAD] as const

type Section = 'share' | 'tracking' | 'password' | null

export default function ManageTransferPage({ params }: { params: { fileId: string } }) {
  const { fileId } = params
  const { status: sessionStatus } = useSession()
  const router = useRouter()
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.replace('/login')
  }, [sessionStatus, router])

  const [transfer, setTransfer] = useState<TransferDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState<Section>(null)

  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [activity, setActivity] = useState<ActivityAttempt[] | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(false)

  const [extending, setExtending] = useState(false)

  const [passwordInput, setPasswordInput] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordActionError, setPasswordActionError] = useState<string | null>(null)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchTransfer = useCallback(async () => {
    const res = await fetch(`/api/transfers/${fileId}`).then((r) => r.json())
    if (res.success) {
      setTransfer(res.data)
      setNameInput(res.data.displayName ?? res.data.fileName)
    } else {
      setLoadError(res.message ?? 'Could not load this transfer')
    }
    setLoading(false)
  }, [fileId])

  useEffect(() => { fetchTransfer() }, [fetchTransfer])

  const copyLink = async () => {
    if (!transfer) return
    await navigator.clipboard.writeText(transfer.shareableLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const saveRename = async () => {
    if (!transfer) return
    setSavingName(true)
    try {
      const res = await fetch(`/api/transfers/${fileId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: nameInput }),
      }).then((r) => r.json())
      if (res.success) {
        setTransfer((t) => t ? { ...t, displayName: nameInput.trim() || t.fileName } : t)
        setRenaming(false)
      }
    } finally {
      setSavingName(false)
    }
  }

  const toggleSection = (section: Section) => {
    setExpanded((cur) => (cur === section ? null : section))
    if (section === 'tracking' && !activity) {
      setLoadingActivity(true)
      fetch(`/api/transfers/${fileId}/activity`)
        .then((r) => r.json())
        .then((res) => { if (res.success) setActivity(res.data.attempts) })
        .finally(() => setLoadingActivity(false))
    }
  }

  const extendExpiry = async (targetDays: number) => {
    setExtending(true)
    try {
      const res = await fetch(`/api/transfers/${fileId}/extend-expiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDays }),
      }).then((r) => r.json())
      if (res.success) await fetchTransfer()
    } finally {
      setExtending(false)
    }
  }

  const setPassword = async () => {
    if (passwordInput.length < 4) {
      setPasswordActionError('Password must be at least 4 characters')
      return
    }
    setSavingPassword(true)
    setPasswordActionError(null)
    try {
      const res = await fetch(`/api/transfers/${fileId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordEnabled: true, password: passwordInput }),
      }).then((r) => r.json())
      if (res.success) {
        setTransfer((t) => t ? { ...t, passwordEnabled: true } : t)
        setPasswordInput('')
      } else {
        setPasswordActionError(res.message ?? 'Could not set password')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  const removePassword = async () => {
    setSavingPassword(true)
    try {
      const res = await fetch(`/api/transfers/${fileId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordEnabled: false }),
      }).then((r) => r.json())
      if (res.success) setTransfer((t) => t ? { ...t, passwordEnabled: false } : t)
    } finally {
      setSavingPassword(false)
    }
  }

  const deleteTransfer = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/transfers/${fileId}`, { method: 'DELETE' }).then((r) => r.json())
      if (res.success) router.push('/transfers')
      else { setDeleting(false); setShowDeleteConfirm(false) }
    } catch {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading || sessionStatus === 'loading') {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError || !transfer) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-3">
        <AlertCircleIcon className="w-10 h-10 text-danger mx-auto" />
        <div className="text-text-primary font-semibold">{loadError ?? 'Transfer not found'}</div>
      </div>
    )
  }

  const displayName = transfer.displayName ?? transfer.fileName
  const statusBadge = transfer.status === 'active'
    ? { label: 'Active', className: 'bg-success/10 text-success border-success/30' }
    : transfer.status === 'expired'
    ? { label: 'Expired', className: 'bg-muted/10 text-muted border-border' }
    : transfer.status === 'deleted'
    ? { label: 'Deleted', className: 'bg-danger/10 text-danger border-danger/30' }
    : { label: 'Failed', className: 'bg-danger/10 text-danger border-danger/30' }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
          {transfer.fileCount ? <PackageIcon className="w-5 h-5" /> : <FolderIcon className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-0">
          {renaming ? (
            <div className="flex items-center gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveRename() }}
                autoFocus
                className="bg-bg border border-border rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent/60 flex-1"
              />
              <button onClick={saveRename} disabled={savingName} className="text-xs font-semibold text-accent hover:underline flex-shrink-0">Save</button>
              <button onClick={() => { setRenaming(false); setNameInput(displayName) }} className="text-xs text-muted hover:underline flex-shrink-0">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-text-primary truncate">{displayName}</span>
              <button onClick={() => setRenaming(true)} className="text-muted hover:text-accent transition-colors flex-shrink-0">
                <EditIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
            <span className={`px-1.5 py-0.5 rounded-full border font-medium ${statusBadge.className}`}>{statusBadge.label}</span>
            <span>Created {relativeTime(transfer.createdAt)}</span>
            <span>·</span>
            <span>{formatBytes(transfer.fileSizeBytes)}</span>
          </div>
        </div>
      </div>

      {/* Link */}
      <div className="flex gap-2">
        <input readOnly value={transfer.shareableLink} className="flex-1 bg-card border border-border rounded-lg px-3 py-2.5 text-xs text-text-primary font-mono truncate focus:outline-none" />
        <button onClick={copyLink} className="flex items-center gap-1.5 px-4 py-2.5 bg-accent text-bg font-semibold rounded-lg text-sm hover:bg-accent/90 transition-colors whitespace-nowrap">
          <CopyIcon className="w-3.5 h-3.5" /> {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card border border-border rounded-xl px-2 py-2.5 text-center">
          <div className="text-sm font-bold text-text-primary">{transfer.fileCount ?? 1}</div>
          <div className="text-[11px] text-muted">Items</div>
        </div>
        <div className="bg-card border border-border rounded-xl px-2 py-2.5 text-center">
          <div className="text-sm font-bold text-text-primary">{formatBytes(transfer.fileSizeBytes)}</div>
          <div className="text-[11px] text-muted">Size</div>
        </div>
        <div className="bg-card border border-border rounded-xl px-2 py-2.5 text-center">
          <div className="text-sm font-bold text-text-primary">{transfer.expiryDays}d</div>
          <div className="text-[11px] text-muted">Expires</div>
        </div>
        <div className="bg-card border border-border rounded-xl px-2 py-2.5 text-center">
          <div className="text-sm font-bold text-text-primary">{transfer.downloadsUsed}</div>
          <div className="text-[11px] text-muted">Downloads</div>
        </div>
      </div>

      {/* Expandable sections */}
      <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
        {/* Share settings */}
        <div>
          <button onClick={() => toggleSection('share')} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-bg/50 transition-colors text-left">
            <div className="flex items-center gap-3">
              <ClockIcon className="w-4 h-4 text-muted flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-text-primary">Share settings</div>
                <div className="text-xs text-muted">Extend expiry</div>
              </div>
            </div>
            <ChevronDownIcon className={`w-4 h-4 text-muted transition-transform flex-shrink-0 ${expanded === 'share' ? 'rotate-180' : ''}`} />
          </button>
          {expanded === 'share' && (
            <div className="px-4 pb-4 space-y-2">
              <div className="text-xs text-muted">Extend link to:</div>
              <div className="flex gap-1.5 flex-wrap">
                {EXTEND_TARGETS.filter((d) => d > transfer.expiryDays).map((days) => (
                  <button
                    key={days}
                    onClick={() => extendExpiry(days)}
                    disabled={extending}
                    className="text-xs font-medium px-3 py-1 rounded-full border border-border text-muted hover:border-accent/50 hover:text-text-primary transition-colors disabled:opacity-40"
                  >
                    {days}d
                  </button>
                ))}
                {EXTEND_TARGETS.filter((d) => d > transfer.expiryDays).length === 0 && (
                  <span className="text-xs text-muted">Already at the maximum retention.</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Download tracking */}
        <div>
          <button onClick={() => toggleSection('tracking')} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-bg/50 transition-colors text-left">
            <div className="flex items-center gap-3">
              <EyeIcon className="w-4 h-4 text-muted flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-text-primary">Download tracking</div>
                <div className="text-xs text-muted">See who downloaded and when</div>
              </div>
            </div>
            <ChevronDownIcon className={`w-4 h-4 text-muted transition-transform flex-shrink-0 ${expanded === 'tracking' ? 'rotate-180' : ''}`} />
          </button>
          {expanded === 'tracking' && (
            <div className="px-4 pb-4">
              {loadingActivity ? (
                <div className="text-xs text-muted py-2">Loading…</div>
              ) : !activity || activity.length === 0 ? (
                <div className="text-xs text-muted py-2">No downloads yet.</div>
              ) : (
                <div className="space-y-1.5">
                  {activity.map((a) => (
                    <div key={a.downloadId} className="flex items-center justify-between text-xs px-3 py-2 bg-bg border border-border rounded-lg">
                      <span className={a.outcome === 'success' ? 'text-success' : 'text-muted'}>{OUTCOME_LABEL[a.outcome] ?? a.outcome}</span>
                      <span className="text-muted">{relativeTime(a.attemptedAt)}{a.countryCode ? ` · ${a.countryCode}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add password */}
        <div>
          <button onClick={() => toggleSection('password')} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-bg/50 transition-colors text-left">
            <div className="flex items-center gap-3">
              <LockIcon className="w-4 h-4 text-muted flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-text-primary">{transfer.passwordEnabled ? 'Password protected' : 'Add password'}</div>
                <div className="text-xs text-muted">{transfer.passwordEnabled ? 'This transfer requires a password' : 'Protect your transfer'}</div>
              </div>
            </div>
            <ChevronDownIcon className={`w-4 h-4 text-muted transition-transform flex-shrink-0 ${expanded === 'password' ? 'rotate-180' : ''}`} />
          </button>
          {expanded === 'password' && (
            <div className="px-4 pb-4 space-y-2">
              {transfer.passwordEnabled ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-success"><CheckCircleIcon className="w-3.5 h-3.5" /> Password is set</div>
                  <button onClick={removePassword} disabled={savingPassword} className="text-xs font-semibold text-danger hover:underline">Remove password</button>
                </div>
              ) : (
                <>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => { setPasswordInput(e.target.value); setPasswordActionError(null) }}
                    placeholder="Set a password"
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/60"
                  />
                  {passwordActionError && <div className="text-xs text-danger">{passwordActionError}</div>}
                  <button onClick={setPassword} disabled={savingPassword || !passwordInput} className="text-xs font-semibold text-accent hover:underline disabled:opacity-40">
                    {savingPassword ? 'Saving…' : 'Save password'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Delete transfer */}
        <div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={transfer.status === 'deleted'}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-danger/5 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <TrashIcon className="w-4 h-4 text-danger flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-danger">Delete transfer</div>
              <div className="text-xs text-muted">This action cannot be undone</div>
            </div>
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-text-primary font-semibold">Delete this transfer?</div>
            <div className="text-sm text-muted">
              This will permanently delete {transfer.fileCount ?? 1} {transfer.fileCount === 1 || !transfer.fileCount ? 'file' : 'files'}. This action cannot be undone.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="flex-1 border border-border text-text-primary text-sm font-semibold py-2.5 rounded-lg hover:border-accent/60 transition-colors">
                Cancel
              </button>
              <button onClick={deleteTransfer} disabled={deleting} className="flex-1 bg-danger text-white text-sm font-bold py-2.5 rounded-lg hover:bg-danger/90 transition-colors disabled:opacity-60">
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
