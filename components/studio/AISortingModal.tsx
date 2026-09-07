'use client'

import { useState, useEffect } from 'react'
import type { StudioProject, MediaFile, Selection } from '@/types/studio'
import { PHOTO_SCOPE_LABEL, PHOTO_SCOPE_ORDER, resolveScopeFileIds, type PhotoScope } from '@/lib/studio/photoScope'
import PhotoScopeIcon from '@/components/studio/PhotoScopeIcon'
import PhotoActionsMenu from '@/components/studio/PhotoActionsMenu'
import JobConfirmDialog from '@/components/studio/JobConfirmDialog'
import type { TrackedJob } from '@/lib/studio/useJobTracker'

interface Props {
  projects: StudioProject[]  // length 1 for a single event, >1 for "index all events for this client"
  onClose: () => void
  // Registers each started INDEX_FACES job with the shared background-job
  // tracker in dashboard/layout.tsx so progress shows up in the bottom-right
  // toast even after this modal closes.
  onJobStarted?: (job: { jobId: string; jobType: TrackedJob['jobType']; projectId: string; label: string; total: number; status?: TrackedJob['status'] }) => void
}

interface ProjectCounts {
  projectId: string
  eligibleIds: string[]  // every READY image in scope
  pendingIds: string[]   // eligibleIds not yet faceIndexed
  activeJob: boolean
}

// Same fields already fetched by the Face Index tab's own status check
// (EventSection.tsx's loadFaceStatus) — reused here so this modal can warn
// about "already fully indexed" or "indexing already running" BEFORE the
// admin clicks anything, instead of silently starting a job that finds
// nothing to do and finishes looking like it accomplished something.
async function loadProjectCounts(project: StudioProject, scope: PhotoScope): Promise<ProjectCounts> {
  const [filesRes, selRes, statusRes] = await Promise.all([
    fetch(`/studio/api/admin/projects/${project.projectId}/files`).then(r => r.json()),
    fetch(`/studio/api/admin/projects/${project.projectId}/selections`).then(r => r.json()),
    fetch(`/studio/api/admin/projects/${project.projectId}/faces`).then(r => r.json()),
  ])
  const files: MediaFile[] = filesRes.success ? filesRes.data : []
  const selections: Selection[] = selRes.success ? selRes.data.map((x: { selection: Selection }) => x.selection) : []
  const scopedIds = resolveScopeFileIds(scope, files, selections, project)
  const eligible = files.filter(f =>
    f.processingStatus === 'READY' && f.fileType === 'IMAGE' && (!scopedIds || scopedIds.includes(f.fileId))
  )
  return {
    projectId: project.projectId,
    eligibleIds: eligible.map(f => f.fileId),
    pendingIds: eligible.filter(f => !f.faceIndexed).map(f => f.fileId),
    activeJob: statusRes.success ? !!statusRes.data.activeJob : false,
  }
}

export default function AISortingModal({ projects, onClose, onJobStarted }: Props) {
  const [scope, setScope]   = useState<PhotoScope>('ALL')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null)
  const [confirmKind, setConfirmKind] = useState<'normal' | 'force' | null>(null)

  const [counts, setCounts]               = useState<ProjectCounts[] | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)
  const [countsError, setCountsError]     = useState('')

  const isSingle = projects.length === 1
  const label = isSingle ? projects[0].clientName : `${projects[0].clientName} (${projects.length} events)`

  useEffect(() => {
    let cancelled = false
    setCounts(null); setCountsError(''); setCountsLoading(true)
    Promise.all(projects.map(p => loadProjectCounts(p, scope)))
      .then(res => { if (!cancelled) setCounts(res) })
      .catch(() => { if (!cancelled) setCountsError('Could not check photo status — please try again.') })
      .finally(() => { if (!cancelled) setCountsLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, projects])

  const totalEligible = counts?.reduce((s, p) => s + p.eligibleIds.length, 0) ?? 0
  const totalPending   = counts?.reduce((s, p) => s + p.pendingIds.length, 0) ?? 0
  const totalAlready   = totalEligible - totalPending
  const anyJobRunning  = counts?.some(p => p.activeJob) ?? false

  const indexOne = async (project: StudioProject, fileIds: string[], forceAll: boolean) => {
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/faces/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds, ...(forceAll ? { forceAll: true } : {}) }),
    }).then(r => r.json())
    if (!res.success) throw new Error(res.message ?? 'Failed to start face indexing')
    return { projectId: project.projectId, jobId: res.data.jobId as string, total: fileIds.length }
  }

  const handleGenerate = async (forceAll: boolean) => {
    setConfirmKind(null)
    if (!counts) return
    const targets = counts
      .map(c => ({ project: projects.find(p => p.projectId === c.projectId)!, fileIds: forceAll ? c.eligibleIds : c.pendingIds }))
      .filter(t => t.fileIds.length > 0)
    if (targets.length === 0) return

    setBusy(true); setError(''); setResult(null)
    const results = await Promise.allSettled(targets.map(t => indexOne(t.project, t.fileIds, forceAll)))
    const ok = results.filter(r => r.status === 'fulfilled').length
    const failed = results.length - ok
    setResult({ ok, failed })
    if (failed > 0) {
      const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      setError(firstError ? String((firstError.reason as Error)?.message ?? firstError.reason) : '')
    }
    // Register every started job so its live progress shows up in the
    // shared bottom-right toast even after this modal closes. The total is
    // the exact fileIds count sent — no more "PENDING, total unknown" guess
    // now that the eligible/pending count is already known up front.
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return
      const { project } = targets[i]
      onJobStarted?.({
        jobId: r.value.jobId, jobType: 'INDEX_FACES', projectId: r.value.projectId,
        label: (project.eventType ?? '').replace(/_/g, ' ') || project.clientName,
        total: r.value.total, status: 'PROCESSING',
      })
    })
    setBusy(false)
    // At least one job actually started — close immediately so the shared
    // bottom-right progress toast takes over, instead of leaving this modal
    // sitting open with a "Started 1/1" line nobody asked to keep reading.
    // If everything failed, stay open so the error above is visible.
    if (ok > 0) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">AI Sorting / Search</h2>
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
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Apply to</label>
            <PhotoActionsMenu
              align="left"
              className="block w-full"
              menuClassName="w-full"
              trigger={
                <button className="w-full flex items-center gap-2 bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary hover:border-accent/60 transition-colors">
                  <PhotoScopeIcon scope={scope} />
                  {PHOTO_SCOPE_LABEL[scope]}
                  <svg className="w-3.5 h-3.5 ml-auto text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              }
              actions={PHOTO_SCOPE_ORDER.map(s => ({
                label: scope === s ? `${PHOTO_SCOPE_LABEL[s]}  ✓` : PHOTO_SCOPE_LABEL[s],
                icon: <PhotoScopeIcon scope={s} />,
                onClick: () => setScope(s),
              }))}
            />
          </div>

          <p className="text-xs text-muted">Indexes the chosen photos so guests can find themselves by selfie. Runs in the background.</p>

          {countsLoading && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <div className="w-3.5 h-3.5 border-2 border-muted border-t-transparent rounded-full animate-spin flex-shrink-0" />
              Checking photos…
            </div>
          )}

          {countsError && <p className="text-xs text-danger">{countsError}</p>}

          {error && <p className="text-xs text-danger">{error}</p>}

          {!countsLoading && !countsError && counts && (
            <>
              {anyJobRunning ? (
                <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2.5 text-xs text-text-primary flex items-start gap-2">
                  <span className="flex-shrink-0">⏳</span>
                  <span>Face indexing is already running for {isSingle ? 'this event' : 'one of these events'} — check the bottom-right corner for live progress.</span>
                </div>
              ) : totalEligible === 0 ? (
                <div className="bg-bg border border-border rounded-lg px-3 py-2.5 text-xs text-muted">
                  No eligible photos found for &quot;{PHOTO_SCOPE_LABEL[scope]}&quot;.
                </div>
              ) : totalPending === 0 ? (
                <>
                  <div className="bg-success/10 border border-success/30 rounded-lg px-3 py-2.5 text-xs text-text-primary flex items-start gap-2">
                    <span className="flex-shrink-0">✅</span>
                    <span>All {totalEligible} photo{totalEligible !== 1 ? 's' : ''} in &quot;{PHOTO_SCOPE_LABEL[scope]}&quot; {totalEligible !== 1 ? 'are' : 'is'} already AI-enabled — nothing new to index.</span>
                  </div>
                  <button onClick={() => setConfirmKind('force')} disabled={busy}
                    className="w-full text-xs text-muted font-semibold py-2 hover:text-text-primary disabled:opacity-40 transition-colors">
                    Force re-index anyway (uses AI credits again)
                  </button>
                </>
              ) : (
                <>
                  {totalAlready > 0 && (
                    <p className="text-xs text-muted">
                      {totalAlready} of {totalEligible} already AI-enabled — {totalPending} new photo{totalPending !== 1 ? 's' : ''} will be indexed.
                    </p>
                  )}
                  <button onClick={() => setConfirmKind('normal')} disabled={busy}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
                    </svg>
                    {busy ? 'Starting…' : `Index ${totalPending} New Photo${totalPending !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </>
          )}

          {result && (
            <p className={`text-xs ${result.failed > 0 ? 'text-yellow-400' : 'text-success'}`}>
              Started {result.ok}/{result.ok + result.failed} event{result.ok + result.failed !== 1 ? 's' : ''}{result.failed > 0 ? ` — ${result.failed} failed` : ''}.
            </p>
          )}
        </div>
      </div>

      {confirmKind === 'normal' && (
        <JobConfirmDialog
          icon="✨"
          title="Start AI sorting?"
          message={`This scans ${totalPending} new photo${totalPending !== 1 ? 's' : ''} for faces so guests can find themselves by selfie — it uses a bit of your AI search balance per photo, charged as it runs. The photos will be temporarily unavailable for other actions until it finishes, and you'll see live progress with a cancel option in the bottom-right corner.`}
          confirmLabel={`Index ${totalPending} New Photo${totalPending !== 1 ? 's' : ''}`}
          onConfirm={() => handleGenerate(false)}
          onCancel={() => setConfirmKind(null)}
        />
      )}

      {confirmKind === 'force' && (
        <JobConfirmDialog
          icon="⚠️"
          danger
          title="Re-index already-enabled photos?"
          message={`All ${totalEligible} photo${totalEligible !== 1 ? 's' : ''} here ${totalEligible !== 1 ? 'are' : 'is'} already AI-enabled. Re-indexing scans them again from scratch and charges AI search credits a second time for every one of them — only do this if something actually looks wrong with the current results.`}
          confirmLabel="Re-index Anyway"
          onConfirm={() => handleGenerate(true)}
          onCancel={() => setConfirmKind(null)}
        />
      )}
    </div>
  )
}
