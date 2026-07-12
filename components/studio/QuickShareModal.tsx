'use client'

import { useState } from 'react'
import type { StudioProject, MediaFile, Selection } from '@/types/studio'
import { PHOTO_SCOPE_LABEL, resolveScopeFileIds, type PhotoScope } from '@/lib/studio/photoScope'

const SHARE_SCOPES: PhotoScope[] = ['ALL', 'STARRED', 'FAVORITE', 'FINAL', 'EDIT_REQUIRED']

interface Props {
  projects: StudioProject[]  // length 1 for a single event, >1 for "share all events for this client"
  onClose: () => void
}

// Resolves scope by fetching this project's files + (loved-only) selections
// on demand — the sidebar doesn't keep every project's files/selections
// loaded, only whichever is currently open. The selections GET only returns
// isSelected rows, which is exactly what FAVORITE/EDIT_REQUIRED need (in this
// product editingRequired is only ever set on a photo the client has loved).
async function resolveProjectScopeFileIds(project: StudioProject, scope: PhotoScope): Promise<string[] | undefined> {
  if (scope === 'ALL') return undefined
  const [filesRes, selRes] = await Promise.all([
    fetch(`/studio/api/admin/projects/${project.projectId}/files`).then(r => r.json()),
    fetch(`/studio/api/admin/projects/${project.projectId}/selections`).then(r => r.json()),
  ])
  const files: MediaFile[] = filesRes.success ? filesRes.data : []
  const selections: Selection[] = selRes.success ? selRes.data.map((x: { selection: Selection }) => x.selection) : []
  return resolveScopeFileIds(scope, files, selections, project)
}

export default function QuickShareModal({ projects, onClose }: Props) {
  const [scope, setScope]     = useState<PhotoScope>('ALL')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [singleUrl, setSingleUrl] = useState('')
  const [copied, setCopied]   = useState(false)
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: number } | null>(null)

  const isSingle = projects.length === 1
  const label = isSingle ? projects[0].clientName : `${projects[0].clientName} (${projects.length} events)`

  const shareOne = async (project: StudioProject): Promise<string | null> => {
    const includedFileIds = await resolveProjectScopeFileIds(project, scope)
    if (includedFileIds && includedFileIds.length === 0) {
      throw new Error(`No photos match "${PHOTO_SCOPE_LABEL[scope]}" for ${project.eventType.replace(/_/g, ' ')}`)
    }
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiryDays: 30, ...(includedFileIds ? { includedFileIds } : {}) }),
    }).then(r => r.json())
    if (!res.success) throw new Error(res.message ?? 'Failed to generate link')
    return res.data.shareUrl as string
  }

  const handleSingleAction = async (action: 'copy' | 'preview' | 'share') => {
    setBusy(true); setError(''); setSingleUrl(''); setCopied(false)
    try {
      const url = await shareOne(projects[0])
      if (!url) return
      setSingleUrl(url)
      if (action === 'copy' || action === 'share') {
        await navigator.clipboard.writeText(url)
        setCopied(true)
      }
      if (action === 'preview') window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to share')
    } finally {
      setBusy(false)
    }
  }

  const handleShareAll = async () => {
    setBusy(true); setError(''); setBulkResult(null)
    const results = await Promise.allSettled(projects.map(shareOne))
    const ok = results.filter(r => r.status === 'fulfilled').length
    const failed = results.length - ok
    setBulkResult({ ok, failed })
    if (failed > 0) {
      const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      setError(firstError ? String((firstError.reason as Error)?.message ?? firstError.reason) : '')
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">Share</h2>
            <p className="text-xs text-muted mt-0.5 truncate">{label}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Include</label>
            <select value={scope} onChange={e => setScope(e.target.value as PhotoScope)}
              className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors">
              {SHARE_SCOPES.map(s => <option key={s} value={s}>{PHOTO_SCOPE_LABEL[s]}</option>)}
            </select>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          {isSingle ? (
            <div className="flex gap-2">
              <button onClick={() => handleSingleAction('copy')} disabled={busy}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-text-primary hover:bg-border/40 disabled:opacity-50 transition-colors">
                🔗 Copy link
              </button>
              <button onClick={() => handleSingleAction('preview')} disabled={busy}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-text-primary hover:bg-border/40 disabled:opacity-50 transition-colors">
                👁 Preview
              </button>
              <button onClick={() => handleSingleAction('share')} disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-accent text-bg text-xs font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
                {busy ? '…' : '✉ Share'}
              </button>
            </div>
          ) : (
            <button onClick={handleShareAll} disabled={busy}
              className="w-full py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
              {busy ? 'Sharing…' : `Share all ${projects.length} events`}
            </button>
          )}

          {copied && singleUrl && (
            <p className="text-xs text-success">Link copied to clipboard.</p>
          )}
          {bulkResult && (
            <p className={`text-xs ${bulkResult.failed > 0 ? 'text-yellow-400' : 'text-success'}`}>
              Shared {bulkResult.ok}/{projects.length} events{bulkResult.failed > 0 ? ` — ${bulkResult.failed} failed` : ''}.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
