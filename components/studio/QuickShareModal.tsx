'use client'

import { useState } from 'react'
import type { StudioProject } from '@/types/studio'

interface Props {
  projects: StudioProject[]  // length 1 for a single event, >1 for "share all events for this client"
  onClose: () => void
  // When provided (selection-bar / lightbox trigger), share exactly these
  // fileIds per project — the admin already hand-picked the set. When
  // omitted (sidebar trigger), every photo in the project(s) is shared.
  explicitFileIdsByProject?: Map<string, string[]>
  // "Client must pick between N-M photos" quota — single-project only,
  // mirrors StudioProject.selectionMin/selectionMax.
  showSelectionRange?: boolean
}

type ExpiryDays = 1 | 3 | 7

export default function QuickShareModal({ projects, onClose, explicitFileIdsByProject, showSelectionRange }: Props) {
  const [expiryDays, setExpiryDays]       = useState<ExpiryDays>(1)
  const [passwordProtected, setPasswordProtected] = useState(false)
  const [sharePassword, setSharePassword] = useState<string | null>(null)
  const [selMin, setSelMin] = useState(projects[0]?.selectionMin ?? 0)
  const [selMax, setSelMax] = useState(projects[0]?.selectionMax ?? 0)

  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied]   = useState(false)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: number } | null>(null)

  const [emailPanelOpen, setEmailPanelOpen] = useState(false)
  const [emailConfirmed, setEmailConfirmed] = useState(false)
  const [emailSending, setEmailSending]     = useState(false)
  const [emailSent, setEmailSent]           = useState(false)

  const isSingle = projects.length === 1
  const isMulti = !isSingle
  const useExplicit = !!explicitFileIdsByProject
  const label = isSingle ? projects[0].clientName : `${projects[0].clientName} (${projects.length} events)`
  const clientEmail = projects[0]?.clientEmail ?? ''

  // Hand-picked selection count, or (sidebar trigger) every photo already
  // tracked on the project(s) — StudioProject.totalFiles, no extra fetch needed.
  const totalCount = useExplicit
    ? projects.reduce((sum, p) => sum + (explicitFileIdsByProject!.get(p.projectId)?.length ?? 0), 0)
    : projects.reduce((sum, p) => sum + (p.totalFiles ?? 0), 0)

  const scopeMessage = isSingle
    ? `${totalCount} photo${totalCount !== 1 ? 's' : ''} — ${(projects[0].eventType ?? '').replace(/_/g, ' ')}`
    : `${totalCount} photo${totalCount !== 1 ? 's' : ''} across ${projects.length} events`

  const resetResult = () => {
    setShareUrl(''); setSharePassword(null); setCopied(false); setPasswordCopied(false)
    setBulkResult(null); setEmailPanelOpen(false); setEmailConfirmed(false); setEmailSent(false)
  }

  const shareOne = async (project: StudioProject): Promise<string | null> => {
    const includedFileIds = useExplicit ? (explicitFileIdsByProject!.get(project.projectId) ?? []) : undefined
    if (includedFileIds && includedFileIds.length === 0) {
      throw new Error(`No selected photos for ${(project.eventType ?? '').replace(/_/g, ' ')}`)
    }
    const hasRange = showSelectionRange && isSingle && selMax > 0
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/share-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expiryDays, passwordProtected,
        ...(includedFileIds ? { includedFileIds } : {}),
        ...(hasRange ? { selectionMin: selMin, selectionMax: selMax } : {}),
      }),
    }).then(r => r.json())
    if (!res.success) throw new Error(res.message ?? 'Failed to generate link')
    if (res.data.sharePassword) setSharePassword(res.data.sharePassword)
    return res.data.shareUrl as string
  }

  const handleGenerate = async () => {
    resetResult()
    setBusy(true); setError('')
    try {
      const url = await shareOne(projects[0])
      if (url) setShareUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to share')
    } finally {
      setBusy(false)
    }
  }

  const handleShareAll = async () => {
    resetResult()
    setBusy(true); setError('')
    const results = await Promise.allSettled(projects.map(shareOne))
    const ok = results.filter(r => r.status === 'fulfilled').length
    const failed = results.length - ok
    setBulkResult({ ok, failed })
    const firstUrl = results.find((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled' && !!r.value)?.value
    if (firstUrl) setShareUrl(firstUrl)
    if (failed > 0) {
      const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      setError(firstError ? String((firstError.reason as Error)?.message ?? firstError.reason) : '')
    }
    setBusy(false)
  }

  const copyLink = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  const copyPassword = async () => {
    if (!sharePassword) return
    await navigator.clipboard.writeText(sharePassword); setPasswordCopied(true); setTimeout(() => setPasswordCopied(false), 2000)
  }
  const shareToWhatsapp = () => {
    if (!shareUrl) return
    window.open(`https://wa.me/?text=${encodeURIComponent(shareUrl)}`, '_blank')
  }

  const sendEmail = async () => {
    setEmailSending(true); setError('')
    try {
      const results = await Promise.all(
        projects.map(p => fetch(`/studio/api/admin/projects/${p.projectId}/share-link/email`, { method: 'POST' }).then(r => r.json()))
      )
      const failed = results.find(r => !r.success)
      if (failed) { setError(failed.message ?? 'Failed to send email'); return }
      setEmailSent(true)
    } catch {
      setError('Failed to send email')
    } finally {
      setEmailSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div>
            <h2 className="text-sm font-bold text-text-primary">Share</h2>
            <p className="text-[11px] text-muted mt-0.5 truncate">{label}</p>
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-[11px] text-accent font-medium bg-accent/10 border border-accent/20 rounded-lg px-2.5 py-2">
            {scopeMessage} — client will only see these
          </p>

          {/* Selection quota — single project only, opt-in */}
          {showSelectionRange && isSingle && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-semibold text-muted uppercase tracking-wider flex-shrink-0">Client must pick</label>
              <input type="number" min={0} max={1000} value={selMin}
                onChange={e => { const v = Math.min(1000, Math.max(0, Number(e.target.value))); setSelMin(v); if (selMax > 0 && v > selMax) setSelMax(v) }}
                className="w-14 bg-bg border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent/60" />
              <span className="text-muted text-xs">–</span>
              <input type="number" min={0} max={1000} value={selMax}
                onChange={e => { const v = Math.min(1000, Math.max(0, Number(e.target.value))); setSelMax(v); if (selMin > v && v > 0) setSelMin(v) }}
                className="w-14 bg-bg border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent/60" />
              <span className="text-[11px] text-muted">photos</span>
            </div>
          )}

          {/* Expiry + password row */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1">
              <label className="text-[10px] font-semibold text-muted uppercase tracking-wider flex-shrink-0">Expires</label>
              <select value={expiryDays} onChange={e => setExpiryDays(Number(e.target.value) as ExpiryDays)}
                className="flex-1 bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/60">
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
              </select>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
              <span className="text-[11px] font-semibold text-muted">Password</span>
              <button type="button" onClick={() => setPasswordProtected(v => !v)}
                className={`relative w-8 h-5 rounded-full transition-colors ${passwordProtected ? 'bg-accent' : 'bg-border'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${passwordProtected ? 'translate-x-3' : ''}`} />
              </button>
            </label>
          </div>

          {error && <p className="text-[11px] text-danger">{error}</p>}

          {/* Generate action */}
          {!shareUrl && (
            isMulti ? (
              <button onClick={handleShareAll} disabled={busy}
                className="w-full py-2.5 rounded-xl bg-accent text-bg text-xs font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
                {busy ? 'Sharing…' : `Share all ${projects.length} events`}
              </button>
            ) : (
              <button onClick={handleGenerate} disabled={busy}
                className="w-full py-2.5 rounded-xl bg-accent text-bg text-xs font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
                {busy ? 'Generating…' : 'Generate Link'}
              </button>
            )
          )}

          {/* Result — link actions */}
          {shareUrl && (
            <div className="space-y-2.5 pt-1 border-t border-border">
              {bulkResult && (
                <p className={`text-[11px] ${bulkResult.failed > 0 ? 'text-yellow-400' : 'text-success'}`}>
                  Shared {bulkResult.ok}/{projects.length} events{bulkResult.failed > 0 ? ` — ${bulkResult.failed} failed` : ''}.
                </p>
              )}

              {sharePassword && (
                <div className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-lg px-2.5 py-2">
                  <span className="text-[10px] font-semibold text-muted uppercase tracking-wider flex-shrink-0">Password</span>
                  <span className="flex-1 text-sm font-mono font-bold text-accent tracking-[0.15em]">{sharePassword}</span>
                  <button onClick={copyPassword} title="Copy password"
                    className="text-[10px] font-semibold text-accent hover:underline flex-shrink-0">
                    {passwordCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <button onClick={copyLink}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-semibold text-text-primary hover:bg-border/40 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')} title="Preview (as admin — no password needed)"
                  className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl border border-border text-muted hover:text-text-primary hover:bg-border/40 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button onClick={shareToWhatsapp} title="Share via WhatsApp"
                  className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl border border-border text-green-500 hover:bg-green-500/10 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.9.525 3.68 1.438 5.2L2 22l4.938-1.396A9.94 9.94 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.148a8.11 8.11 0 01-4.13-1.13l-.296-.176-3.05.862.833-3.037-.192-.311A8.113 8.113 0 013.89 12c0-4.478 3.632-8.11 8.11-8.11 4.477 0 8.11 3.632 8.11 8.11 0 4.477-3.633 8.148-8.11 8.148z" />
                  </svg>
                </button>
                <button onClick={() => setEmailPanelOpen(v => !v)} title="Email to client"
                  className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl border transition-colors ${
                    emailPanelOpen ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border text-muted hover:text-text-primary hover:bg-border/40'
                  }`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0a2.25 2.25 0 00-2.25-2.25h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </button>
              </div>

              {emailPanelOpen && (
                <div className="bg-bg border border-border rounded-xl p-3 space-y-2.5">
                  {clientEmail ? (
                    <>
                      <p className="text-[11px] text-muted">Sending to <span className="text-text-primary font-semibold">{clientEmail}</span></p>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={emailConfirmed} onChange={e => setEmailConfirmed(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-border accent-accent" />
                        <span className="text-[11px] text-muted">I&apos;ve verified this is the correct email</span>
                      </label>
                      {emailSent ? (
                        <p className="text-[11px] text-success">Sent to {clientEmail}.</p>
                      ) : (
                        <button onClick={sendEmail} disabled={!emailConfirmed || emailSending}
                          className="w-full py-2 rounded-lg bg-accent text-bg text-xs font-bold hover:bg-accent/90 disabled:opacity-40 transition-colors">
                          {emailSending ? 'Sending…' : 'Send'}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-yellow-500">No client email on file — add one to send by email.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
