'use client'

import { useEffect, useState } from 'react'
import { useWatermarkModal } from './WatermarkModalContext'
import { startBulkWatermark } from '@/lib/studio/watermarkClient'
import type { WatermarkPreset } from '@/types/studio'
import type { TrackedJob } from '@/lib/studio/useJobTracker'

type Action = 'apply' | 'remove'
type Scope = 'all' | 'selected'

const PREVIEW_BASE = (process.env.NEXT_PUBLIC_STUDIO_PREVIEW_URL ?? 'https://previews.vayustudios.com').replace(/\/$/, '')

function PresetPreviewDot({ preset }: { preset: WatermarkPreset }) {
  const label = preset.text || (preset.type === 'logo' ? 'Logo' : 'Text')
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/30 via-border to-accent/10 flex items-center justify-center overflow-hidden flex-shrink-0">
      {preset.type === 'logo' && preset.logoR2Key ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${PREVIEW_BASE}/${preset.logoR2Key}`} alt="" className="w-6 h-6 object-contain" />
      ) : (
        <span className="text-[8px] font-bold truncate px-1" style={{ color: preset.color }}>{label}</span>
      )}
    </div>
  )
}

// The single, unified entry point for every watermark action in the admin
// dashboard — sidebar per-client menu, selection-bar dropdown, and a single
// photo's "⋯" menu all call openWatermarkModal() (WatermarkModalContext)
// instead of each running its own confirm dialog + POST, which is what
// used to make the per-photo path skip confirmation and progress tracking
// entirely. Rendered once from dashboard/layout.tsx.
export default function WatermarkModal({
  onOpenSettings,
  registerJob,
}: {
  onOpenSettings: (tab: 'watermark') => void
  registerJob: (job: { jobId: string; jobType: TrackedJob['jobType']; projectId: string; label: string; total: number }) => void
}) {
  const { request, closeWatermarkModal } = useWatermarkModal()
  const [pending, setPending] = useState<{ action: Action; scope: Scope } | null>(null)
  const [presets, setPresets] = useState<WatermarkPreset[] | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!request) {
      setPending(null); setPresets(null); setSelectedPresetId(null); setError(null)
      return
    }
    fetch('/studio/api/admin/settings/watermark-presets').then(r => r.json()).then(res => {
      if (!res.success) return
      const list = res.data as WatermarkPreset[]
      setPresets(list)
      setSelectedPresetId(list.find(p => p.isDefault)?.id ?? list[0]?.id ?? null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  if (!request) return null

  const selectedCount = request.selectedTargets?.reduce((sum, t) => sum + t.fileIds.length, 0) ?? 0
  const hasSelection = selectedCount > 0

  const choose = (action: Action, scope: Scope) => { setPending({ action, scope }); setError(null) }

  const confirm = async () => {
    if (!pending) return
    setWorking(true); setError(null)
    const targets = pending.scope === 'all'
      ? request.projectIds.map(projectId => ({ projectId }))
      : (request.selectedTargets ?? [])
    const { started, alreadyRunning, failed, noPresetMessage } = await startBulkWatermark(
      targets, pending.action === 'apply', pending.action === 'apply' ? selectedPresetId ?? undefined : undefined
    )
    setWorking(false)

    if (noPresetMessage) { setError(noPresetMessage); return }
    if (failed > 0 && started.length === 0 && alreadyRunning.length === 0) {
      setError('Could not start watermarking — please try again')
      return
    }

    const label = (projectId: string) => request.label
    started.forEach(s => registerJob({ jobId: s.jobId, jobType: 'WATERMARK', projectId: s.projectId, label: label(s.projectId), total: s.total }))
    alreadyRunning.forEach(a => registerJob({ jobId: a.jobId, jobType: 'WATERMARK', projectId: a.projectId, label: label(a.projectId), total: 0 }))
    closeWatermarkModal()
  }

  const selectedPreset = presets?.find(p => p.id === selectedPresetId) ?? null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !working) closeWatermarkModal() }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">Watermark</h2>
            <p className="text-xs text-muted mt-0.5 truncate">{request.label}</p>
          </div>
          <button onClick={closeWatermarkModal} disabled={working}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-text-primary hover:bg-border/60 transition-colors disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!pending ? (
            <>
              <p className="text-xs text-muted">Choose what this watermark action should apply to.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => choose('apply', 'all')}
                  className="text-left px-3.5 py-3 rounded-xl border border-border hover:border-accent/60 hover:bg-accent/5 transition-colors">
                  <p className="text-xs font-bold text-text-primary">Apply to all photos</p>
                </button>
                <button onClick={() => choose('remove', 'all')}
                  className="text-left px-3.5 py-3 rounded-xl border border-border hover:border-danger/60 hover:bg-danger/5 transition-colors">
                  <p className="text-xs font-bold text-text-primary">Remove from all photos</p>
                </button>
                <button onClick={() => hasSelection && choose('apply', 'selected')} disabled={!hasSelection}
                  title={!hasSelection ? 'Select some photos first' : undefined}
                  className="text-left px-3.5 py-3 rounded-xl border border-border hover:border-accent/60 hover:bg-accent/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent">
                  <p className="text-xs font-bold text-text-primary">Apply to {hasSelection ? `${selectedCount} selected` : 'selected'}</p>
                </button>
                <button onClick={() => hasSelection && choose('remove', 'selected')} disabled={!hasSelection}
                  title={!hasSelection ? 'Select some photos first' : undefined}
                  className="text-left px-3.5 py-3 rounded-xl border border-border hover:border-danger/60 hover:bg-danger/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent">
                  <p className="text-xs font-bold text-text-primary">Remove from {hasSelection ? `${selectedCount} selected` : 'selected'}</p>
                </button>
              </div>
            </>
          ) : (
            <>
              {pending.action === 'apply' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider">Watermark design</label>
                  {presets === null ? (
                    <p className="text-xs text-muted">Loading your watermarks…</p>
                  ) : presets.length === 0 ? (
                    <div className="bg-bg border border-border rounded-xl p-3 space-y-2">
                      <p className="text-xs text-muted">You haven&apos;t created a watermark yet.</p>
                      <button onClick={() => { closeWatermarkModal(); onOpenSettings('watermark') }}
                        className="text-xs font-bold text-accent hover:underline">
                        + Create a watermark →
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-3 py-2">
                        {selectedPreset && <PresetPreviewDot preset={selectedPreset} />}
                        <select value={selectedPresetId ?? ''} onChange={e => setSelectedPresetId(e.target.value)}
                          className="flex-1 bg-transparent text-sm text-text-primary outline-none min-w-0">
                          {presets.map(p => (
                            <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (Default)' : ''}</option>
                          ))}
                        </select>
                      </div>
                      <button onClick={() => { closeWatermarkModal(); onOpenSettings('watermark') }}
                        className="text-[11px] font-semibold text-accent hover:underline">
                        + Create new watermark
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-3">
                <p className="text-xs text-yellow-400 leading-relaxed">
                  {pending.scope === 'all' ? 'These photos' : `The selected ${selectedCount} photo${selectedCount !== 1 ? 's' : ''}`} will be temporarily
                  unavailable for other actions (like delete or move) while this runs. You&apos;ll see live progress with a cancel option in the bottom-right corner.
                </p>
              </div>

              {error && <p className="text-xs text-danger">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setPending(null)} disabled={working}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text-primary hover:bg-border/40 transition-colors disabled:opacity-50">
                  Back
                </button>
                <button onClick={confirm} disabled={working || (pending.action === 'apply' && (!presets || presets.length === 0))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 ${
                    pending.action === 'remove' ? 'bg-danger text-white hover:bg-danger/90' : 'bg-accent text-bg hover:bg-accent/90'
                  }`}>
                  {working ? 'Starting…' : pending.action === 'apply' ? 'Apply Watermark' : 'Remove Watermark'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
