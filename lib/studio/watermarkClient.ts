// Shared bulk-watermark POST logic — previously duplicated between
// dashboard/layout.tsx's sidebar trigger (handleBulkWatermark) and
// EventSection.tsx's selection-bar trigger (bulkApplyWatermark). Both now
// call this one function and register whatever jobs it starts with the
// shared job tracker (lib/studio/useJobTracker.ts).
export interface WatermarkTarget {
  projectId: string
  fileIds?: string[]  // omitted = every eligible file in the project
}

export interface WatermarkStarted {
  projectId: string
  jobId: string
  total: number
}

// A project that already had a WATERMARK job PROCESSING when this request
// landed — the route replies with that job's id instead of starting a new
// one, so the caller can register it with the tracker directly (showing its
// real progress + Cancel) instead of just reporting "already running" as a
// dead-end error.
export interface WatermarkAlreadyRunning {
  projectId: string
  jobId: string
}

export async function startBulkWatermark(
  targets: WatermarkTarget[],
  watermarkEnabled: boolean,
  // Which studio watermark design to apply — omitted uses the studio's own
  // isDefault preset (resolved server-side). Ignored when removing.
  presetId?: string
): Promise<{ started: WatermarkStarted[]; alreadyRunning: WatermarkAlreadyRunning[]; failed: number; noPresetMessage?: string }> {
  const results = await Promise.allSettled(targets.map(async (t) => {
    const res = await fetch(`/studio/api/admin/projects/${t.projectId}/watermark`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(t.fileIds ? { fileIds: t.fileIds } : {}), watermarkEnabled, presetId }),
    }).then(r => r.json())
    if (!res.success) {
      if (res.error === 'JOB_RUNNING') {
        return { kind: 'alreadyRunning' as const, projectId: t.projectId, jobId: res.data.jobId as string }
      }
      if (res.error === 'NO_WATERMARK_PRESET') {
        return { kind: 'noPreset' as const, message: res.message as string }
      }
      throw new Error(res.message ?? 'FAILED')
    }
    if (!res.data.total) return { kind: 'empty' as const }  // nothing eligible — not an error, just nothing to track
    return { kind: 'started' as const, projectId: t.projectId, jobId: res.data.jobId as string, total: res.data.total as number }
  }))

  const started: WatermarkStarted[] = []
  const alreadyRunning: WatermarkAlreadyRunning[] = []
  let failed = 0
  let noPresetMessage: string | undefined
  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.kind === 'started') started.push(r.value)
      else if (r.value.kind === 'alreadyRunning') alreadyRunning.push(r.value)
      else if (r.value.kind === 'noPreset') noPresetMessage = r.value.message
    } else {
      failed++
    }
  }
  return { started, alreadyRunning, failed, noPresetMessage }
}
