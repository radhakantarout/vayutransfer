'use client'

import { useState } from 'react'
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

export default function AISortingModal({ projects, onClose, onJobStarted }: Props) {
  const [scope, setScope]   = useState<PhotoScope>('ALL')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const isSingle = projects.length === 1
  const label = isSingle ? projects[0].clientName : `${projects[0].clientName} (${projects.length} events)`

  const indexOne = async (project: StudioProject) => {
    const fileIds = await resolveProjectScopeFileIds(project, scope)
    if (fileIds && fileIds.length === 0) {
      throw new Error(`No photos match "${PHOTO_SCOPE_LABEL[scope]}" for ${(project.eventType ?? '').replace(/_/g, ' ')}`)
    }
    const res = await fetch(`/studio/api/admin/projects/${project.projectId}/faces/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fileIds ? { fileIds } : {}),
    }).then(r => r.json())
    if (!res.success) throw new Error(res.message ?? 'Failed to start face indexing')
    return { projectId: project.projectId, jobId: res.data.jobId as string, total: fileIds?.length }
  }

  const handleGenerate = async () => {
    setShowConfirm(false)
    setBusy(true); setError(''); setResult(null)
    const results = await Promise.allSettled(projects.map(indexOne))
    const ok = results.filter(r => r.status === 'fulfilled').length
    const failed = results.length - ok
    setResult({ ok, failed })
    if (failed > 0) {
      const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      setError(firstError ? String((firstError.reason as Error)?.message ?? firstError.reason) : '')
    }
    // Register every started job so its live progress shows up in the
    // shared bottom-right toast even after this modal is closed — the exact
    // total isn't known yet when scope is "all photos" (the Lambda scans
    // the project itself), so it's registered PENDING and the first poll
    // fills in the real number.
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return
      const project = projects[i]
      onJobStarted?.({
        jobId: r.value.jobId, jobType: 'INDEX_FACES', projectId: r.value.projectId,
        label: (project.eventType ?? '').replace(/_/g, ' ') || project.clientName,
        total: r.value.total ?? 0,
        status: r.value.total ? 'PROCESSING' : 'PENDING',
      })
    })
    setBusy(false)
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

          {error && <p className="text-xs text-danger">{error}</p>}

          <button onClick={() => setShowConfirm(true)} disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.344a.75.75 0 01-.53.22H9.75a.75.75 0 01-.53-.22l-.344-.344z" />
            </svg>
            {busy ? 'Starting…' : isSingle ? 'Generate Face Index' : `Generate for all ${projects.length} events`}
          </button>

          {result && (
            <p className={`text-xs ${result.failed > 0 ? 'text-yellow-400' : 'text-success'}`}>
              Started {result.ok}/{projects.length} event{projects.length !== 1 ? 's' : ''}{result.failed > 0 ? ` — ${result.failed} failed` : ''}.
            </p>
          )}
        </div>
      </div>

      {showConfirm && (
        <JobConfirmDialog
          icon="✨"
          title="Start AI sorting?"
          message="This scans the chosen photos for faces so guests can find themselves by selfie — it uses a bit of your AI search balance per photo, charged as it runs. The photos will be temporarily unavailable for other actions until it finishes, and you'll see live progress with a cancel option in the bottom-right corner."
          confirmLabel={isSingle ? 'Generate Face Index' : `Generate for all ${projects.length} events`}
          onConfirm={handleGenerate}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}
