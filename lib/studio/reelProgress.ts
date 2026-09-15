import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioJob } from '@/types/studio'

export interface ReelProgress {
  stage: 'generating' | 'assembling' | 'finalizing' | string
  processed: number
  total: number
  percent: number
}

const STAGE_WEIGHT: Record<string, number> = { generating: 0, assembling: 0.7, finalizing: 0.9 }

// The Lambda (lambda/vayustudio-reelgen/index.js) writes {stage, processed,
// total} to StudioJob.outputPayload at each step — one Kling task per photo
// during 'generating', then a single-unit 'assembling'/'finalizing' pass.
// Blending a per-stage floor with the in-stage fraction keeps the percentage
// monotonically increasing across stage transitions instead of resetting
// back toward 0 when processed/total resets for the next stage.
export async function reelJobProgress(jobId: string): Promise<ReelProgress | null> {
  const job = await studioGetItem<StudioJob>(TABLES.jobs, { jobId })
  const payload = job?.outputPayload as { stage?: string; processed?: number; total?: number } | undefined
  if (!payload || typeof payload.total !== 'number' || payload.total <= 0) return null

  const stage = payload.stage ?? 'generating'
  const processed = payload.processed ?? 0
  const total = payload.total
  const floor = STAGE_WEIGHT[stage] ?? 0
  const ceiling = stage === 'generating' ? 0.7 : stage === 'assembling' ? 0.9 : 1
  const fraction = floor + (ceiling - floor) * Math.min(1, processed / total)
  const percent = Math.max(1, Math.min(99, Math.round(fraction * 100)))

  return { stage, processed, total, percent }
}
