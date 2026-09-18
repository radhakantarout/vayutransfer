import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioJob } from '@/types/studio'

export interface AiImageProgress {
  stage: 'generating' | 'uploading' | 'finalizing' | string
  processed: number
  total: number
  percent: number
}

// Mirrors lib/studio/reelProgress.ts's monotonic stage-blend approach, with
// the 3 stages lambda/vayustudio-imagegen actually writes: 'generating' (a
// single Kling task producing the whole batch — no per-image progress until
// it resolves, unlike reelgen's one-task-per-photo loop), 'uploading' (real
// per-output-image progress), 'finalizing'.
const STAGE_WEIGHT: Record<string, number> = { generating: 0, uploading: 0.5, finalizing: 0.9 }

export async function aiImageJobProgress(jobId: string): Promise<AiImageProgress | null> {
  const job = await studioGetItem<StudioJob>(TABLES.jobs, { jobId })
  const payload = job?.outputPayload as { stage?: string; processed?: number; total?: number } | undefined
  if (!payload || typeof payload.total !== 'number' || payload.total <= 0) return null

  const stage = payload.stage ?? 'generating'
  const processed = payload.processed ?? 0
  const total = payload.total
  const floor = STAGE_WEIGHT[stage] ?? 0
  const ceiling = stage === 'generating' ? 0.5 : stage === 'uploading' ? 0.9 : 1
  const fraction = floor + (ceiling - floor) * Math.min(1, processed / total)
  const percent = Math.max(1, Math.min(99, Math.round(fraction * 100)))

  return { stage, processed, total, percent }
}
