'use client'

import { useState } from 'react'
import type { StudioProject } from '@/types/studio'

interface Props {
  clientName: string
  projects: StudioProject[]
  onClose: () => void
}

type ExtendDays = 1 | 3 | 7

function fmtRelative(iso?: string): string {
  if (!iso) return 'Not opened yet'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'Opened just now'
  if (mins < 60) return `Opened ${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Opened ${hours}h ago`
  const days = Math.floor(hours / 24)
  return `Opened ${days}d ago`
}

// A share link either scopes to an explicit fileId list (sharedFileIds, set
// when the admin hand-picked photos or filtered by scope) or, when unset,
// covers every photo in the project — same convention share-link/route.ts
// and the client gallery route both already use.
function sharedCount(p: StudioProject): number {
  return p.sharedFileIds && p.sharedFileIds.length > 0 ? p.sharedFileIds.length : (p.totalFiles ?? 0)
}

function progressLabel(p: StudioProject): { label: string; className: string } {
  if (p.selectionSubmittedAt) return { label: 'Submitted', className: 'text-success bg-success/10 border-success/20' }
  if ((p.selectedFilesCount ?? 0) > 0 || (p.editingRequiredCount ?? 0) > 0) {
    return { label: 'In progress', className: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' }
  }
  return { label: 'Not started', className: 'text-muted bg-border/40 border-border' }
}

export default function RecentTransfersModal({ clientName, projects, onClose }: Props) {
  const links = projects
    .filter(p => p.clientShareToken)
    .sort((a, b) => new Date(b.clientShareExpiresAt ?? 0).getTime() - new Date(a.clientShareExpiresAt ?? 0).getTime())

  const [busyId, setBusyId] = useState<string | null>(null)
  const [extendOpenId, setExtendOpenId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [emailSentId, setEmailSentId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [localLinks, setLocalLinks] = useState(links)

  const shareUrl = (p: StudioProject) => `${location.origin}/studio/gallery/${p.clientShareToken}`

  const copyLink = async (p: StudioProject) => {
    await navigator.clipboard.writeText(shareUrl(p))
    setCopiedId(p.projectId); setTimeout(() => setCopiedId(null), 2000)
  }

  const extend = async (p: StudioProject, extendDays: ExtendDays) => {
    setBusyId(p.projectId); setError(''); setExtendOpenId(null)
    try {
      const res = await fetch(`/studio/api/admin/projects/${p.projectId}/share-link`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extendDays }),
      }).then(r => r.json())
      if (!res.success) { setError(res.message ?? 'Failed to extend link'); return }
      setLocalLinks(prev => prev.map(x => x.projectId === p.projectId ? { ...x, clientShareExpiresAt: res.data.expiresAt } : x))
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  const sendEmail = async (p: StudioProject) => {
    setBusyId(p.projectId); setError('')
    try {
      const res = await fetch(`/studio/api/admin/projects/${p.projectId}/share-link/email`, { method: 'POST' }).then(r => r.json())
      if (!res.success) { setError(res.message ?? 'Failed to send email'); return }
      setEmailSentId(p.projectId); setTimeout(() => setEmailSentId(null), 2500)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  const deleteLink = async (p: StudioProject) => {
    setBusyId(p.projectId); setError(''); setDeleteConfirmId(null)
    try {
      const res = await fetch(`/studio/api/admin/projects/${p.projectId}/share-link`, { method: 'DELETE' }).then(r => r.json())
      if (!res.success) { setError(res.message ?? 'Failed to delete link'); return }
      setLocalLinks(prev => prev.filter(x => x.projectId !== p.projectId))
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-text-primary">Recent Transfers</h2>
            <p className="text-[11px] text-muted mt-0.5">{clientName}</p>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 flex-1 space-y-2.5">
          {error && <p className="text-[11px] text-danger px-1">{error}</p>}

          {localLinks.length === 0 ? (
            <p className="text-sm text-muted text-center py-14">No share links yet for this client.</p>
          ) : (
            localLinks.map(p => {
              const expired = !p.clientShareExpiresAt || new Date(p.clientShareExpiresAt) < new Date()
              const progress = progressLabel(p)
              const isBusy = busyId === p.projectId
              return (
                <div key={p.projectId} className="border border-border rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-primary truncate">{(p.eventType ?? '').replace(/_/g, ' ')}</div>
                      <div className="text-[10px] text-muted">
                        {new Date(p.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                      expired ? 'text-muted bg-border/40 border-border' : 'text-accent bg-accent/10 border-accent/20'
                    }`}>
                      {expired ? 'Expired' : 'Active'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.sharePasswordProtected && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-muted bg-border/40 border border-border rounded-full px-2 py-0.5">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        Protected
                      </span>
                    )}
                    <span className="text-[10px] font-semibold text-muted bg-border/40 border border-border rounded-full px-2 py-0.5">
                      {fmtRelative(p.shareLastOpenedAt)}
                    </span>
                    <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${progress.className}`}>
                      {progress.label}
                    </span>
                    <span className="text-[10px] font-semibold text-muted bg-border/40 border border-border rounded-full px-2 py-0.5">
                      {sharedCount(p)} photo{sharedCount(p) !== 1 ? 's' : ''} shared
                    </span>
                    <span className="text-[10px] font-semibold text-muted bg-border/40 border border-border rounded-full px-2 py-0.5">
                      {p.shareDownloadCount ?? 0} download{(p.shareDownloadCount ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <button onClick={() => copyLink(p)} disabled={isBusy}
                      className="flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-text-primary hover:bg-border/40 disabled:opacity-50 transition-colors">
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                      </svg>
                      {copiedId === p.projectId ? 'Copied!' : 'Copy Link'}
                    </button>
                    <button onClick={() => window.open(shareUrl(p), '_blank', 'noopener,noreferrer')} title="Preview as admin — no password needed"
                      className="flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Preview
                    </button>
                    <div className="relative flex-shrink-0">
                      <button onClick={() => setExtendOpenId(v => v === p.projectId ? null : p.projectId)} disabled={isBusy} title="Extend expiry"
                        className="whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted hover:text-text-primary hover:bg-border/40 disabled:opacity-50 transition-colors">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Extend
                      </button>
                      {extendOpenId === p.projectId && (
                        <div className="absolute left-0 top-9 z-10 bg-card border border-border rounded-xl shadow-2xl py-1 w-32">
                          {[1, 3, 7].map(d => (
                            <button key={d} onClick={() => extend(p, d as ExtendDays)}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-text-primary hover:bg-border/40 transition-colors">
                              +{d} day{d !== 1 ? 's' : ''}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareUrl(p))}`, '_blank')} title="Share via WhatsApp"
                      className="flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-green-500 hover:bg-green-500/10 transition-colors">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.9.525 3.68 1.438 5.2L2 22l4.938-1.396A9.94 9.94 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.148a8.11 8.11 0 01-4.13-1.13l-.296-.176-3.05.862.833-3.037-.192-.311A8.113 8.113 0 013.89 12c0-4.478 3.632-8.11 8.11-8.11 4.477 0 8.11 3.632 8.11 8.11 0 4.477-3.633 8.148-8.11 8.148z" />
                      </svg>
                      WhatsApp
                    </button>
                    <button onClick={() => sendEmail(p)} disabled={isBusy || !p.clientEmail} title={p.clientEmail ? 'Email the client' : 'No client email on file'}
                      className="flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted hover:text-text-primary hover:bg-border/40 disabled:opacity-40 transition-colors">
                      {emailSentId === p.projectId ? (
                        <svg className="w-3.5 h-3.5 flex-shrink-0 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0a2.25 2.25 0 00-2.25-2.25h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                      )}
                      {emailSentId === p.projectId ? 'Sent!' : 'Email'}
                    </button>
                    <button onClick={() => setDeleteConfirmId(p.projectId)} disabled={isBusy} title="Delete link"
                      className="flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-danger hover:bg-danger/10 disabled:opacity-50 transition-colors">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                      Delete
                    </button>
                  </div>

                  {deleteConfirmId === p.projectId && (
                    <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2.5 space-y-2">
                      <p className="text-[11px] text-danger">Delete this link? The client will no longer be able to access it.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setDeleteConfirmId(null)} disabled={isBusy}
                          className="flex-1 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted hover:text-text-primary transition-colors">
                          Cancel
                        </button>
                        <button onClick={() => deleteLink(p)} disabled={isBusy}
                          className="flex-1 py-1.5 rounded-lg bg-danger text-white text-[11px] font-bold hover:bg-danger/90 disabled:opacity-60 transition-colors">
                          {isBusy ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
