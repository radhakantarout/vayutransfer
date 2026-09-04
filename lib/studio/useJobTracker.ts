'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { JobStatus, JobType } from '@/types/studio'

export interface TrackedJob {
  jobId: string
  jobType: Extract<JobType, 'WATERMARK' | 'INDEX_FACES'>
  projectId: string
  label: string
  status: JobStatus
  processed: number
  total: number
  errorMessage?: string | null
}

const POLL_INTERVAL_MS: Record<TrackedJob['jobType'], number> = {
  WATERMARK: 3000,
  INDEX_FACES: 6000,
}

// Persistent background-job tracker, meant to be instantiated exactly once
// in dashboard/layout.tsx so progress survives navigating between events/
// tabs and there is only ever one poll loop per job, never one per mounted
// component.
//
// Each job gets its own monotonically-incrementing generation number in
// `genRef`. A poll loop captures its generation at start and re-checks it
// before every state update and before scheduling its next tick — so a
// stale loop from a job that was cancelled or already completed can never
// resurrect it or race a newer registration of the same jobId. This is the
// same guard already proven in app/studio/print/[token]/page.tsx's zip
// polling, applied here to fix "deadlock" (a loop that could otherwise get
// stuck contending with itself) and "memory leak" (an orphaned timer no one
// ever clears) in one mechanism.
export function useJobTracker() {
  const [jobs, setJobs] = useState<TrackedJob[]>([])
  const genRef = useRef<Map<string, number>>(new Map())

  const dismiss = useCallback((jobId: string) => {
    genRef.current.delete(jobId)
    setJobs(prev => prev.filter(j => j.jobId !== jobId))
  }, [])

  const pollLoop = useCallback(async (
    meta: { jobId: string; jobType: TrackedJob['jobType']; projectId: string },
    myGen: number
  ) => {
    while (genRef.current.get(meta.jobId) === myGen) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS[meta.jobType]))
      if (genRef.current.get(meta.jobId) !== myGen) return

      try {
        const res = await fetch(`/studio/api/admin/projects/${meta.projectId}/jobs/${meta.jobId}`).then(r => r.json())
        if (genRef.current.get(meta.jobId) !== myGen) return
        if (!res.success) continue

        const { status, outputPayload, errorMessage } = res.data as {
          status: JobStatus
          outputPayload?: { processed?: number; total?: number }
          errorMessage?: string | null
        }
        setJobs(prev => prev.map(j => j.jobId === meta.jobId
          ? {
              ...j,
              status,
              processed: outputPayload?.processed ?? j.processed,
              total: outputPayload?.total ?? j.total,
              errorMessage: errorMessage ?? j.errorMessage,
            }
          : j))

        if (status !== 'PENDING' && status !== 'PROCESSING') {
          genRef.current.delete(meta.jobId)
          // Leave the terminal row visible briefly so the admin actually
          // sees "Done"/"Cancelled" rather than the row vanishing instantly.
          setTimeout(() => dismiss(meta.jobId), 4000)
          return
        }
      } catch {
        // Transient network error — loop just tries again next tick.
      }
    }
  }, [dismiss])

  const registerJob = useCallback((job: {
    jobId: string
    jobType: TrackedJob['jobType']
    projectId: string
    label: string
    processed?: number
    total: number
    status?: JobStatus
  }) => {
    const tracked: TrackedJob = {
      jobId: job.jobId, jobType: job.jobType, projectId: job.projectId, label: job.label,
      status: job.status ?? 'PROCESSING', processed: job.processed ?? 0, total: job.total,
    }
    setJobs(prev => [...prev.filter(j => j.jobId !== tracked.jobId), tracked])
    const myGen = (genRef.current.get(job.jobId) ?? 0) + 1
    genRef.current.set(job.jobId, myGen)
    pollLoop({ jobId: job.jobId, jobType: job.jobType, projectId: job.projectId }, myGen)
  }, [pollLoop])

  // Soft-cancel everywhere: stops this tab's own tracking/polling and asks
  // the server to mark the job CANCELLED. For INDEX_FACES the Lambda itself
  // observes that flag and stops for real; for WATERMARK a few already-
  // dispatched Lambda invocations still finish quietly in the background
  // (see lambda/vayustudio-watermark/index.js) — there is no way to abort an
  // already-fired fire-and-forget invoke, so this is the honest ceiling.
  const cancelJob = useCallback(async (job: TrackedJob) => {
    genRef.current.delete(job.jobId)
    setJobs(prev => prev.map(j => j.jobId === job.jobId ? { ...j, status: 'CANCELLED' } : j))
    try {
      await fetch(`/studio/api/admin/projects/${job.projectId}/jobs/${job.jobId}/cancel`, { method: 'POST' })
    } catch {
      // Best-effort — the row already reflects cancelled locally either way.
    }
    setTimeout(() => dismiss(job.jobId), 4000)
  }, [dismiss])

  useEffect(() => () => { genRef.current.clear() }, [])

  const hasActiveJob = useCallback((projectId: string, jobType?: TrackedJob['jobType']) =>
    jobs.some(j => j.projectId === projectId
      && (j.status === 'PENDING' || j.status === 'PROCESSING')
      && (!jobType || j.jobType === jobType)),
    [jobs])

  return { jobs, registerJob, cancelJob, dismiss, hasActiveJob }
}
