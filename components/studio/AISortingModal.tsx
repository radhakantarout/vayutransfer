'use client'

import { useState } from 'react'
import type { StudioProject, MediaFile, Selection } from '@/types/studio'
import { PHOTO_SCOPE_LABEL, resolveScopeFileIds, type PhotoScope } from '@/lib/studio/photoScope'

const AI_SCOPES: PhotoScope[] = ['ALL', 'FINAL', 'EDITED', 'FAVORITE', 'STARRED']

interface Props {
  projects: StudioProject[]  // length 1 for a single event, >1 for "index all events for this client"
  onClose: () => void
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

export default function AISortingModal({ projects, onClose }: Props) {
  const [scope, setScope]   = useState<PhotoScope>('ALL')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null)

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
  }

  const handleGenerate = async () => {
    setBusy(true); setError(''); setResult(null)
    const results = await Promise.allSettled(projects.map(indexOne))
    const ok = results.filter(r => r.status === 'fulfilled').length
    const failed = results.length - ok
    setResult({ ok, failed })
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
            <select value={scope} onChange={e => setScope(e.target.value as PhotoScope)}
              className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/60 transition-colors">
              {AI_SCOPES.map(s => <option key={s} value={s}>{PHOTO_SCOPE_LABEL[s]}</option>)}
            </select>
          </div>

          <p className="text-xs text-muted">Indexes the chosen photos so guests can find themselves by selfie. Runs in the background.</p>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button onClick={handleGenerate} disabled={busy}
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
    </div>
  )
}
