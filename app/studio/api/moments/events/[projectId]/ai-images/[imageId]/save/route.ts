import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, studioTransactWrite, TABLES, type StudioTransactOp } from '@/lib/studio/dynamodb'
import { invokeStudioWatermarkLambda } from '@/lib/studio/watermark'
import { resolveProjectForViewer, isOwnerOrAdmin } from '@/lib/studio/galleryMembers'
import type { StudioAiImage, MediaFile } from '@/types/studio'

// Deterministic (not random) specifically so re-POSTing the same
// (imageId, index) pair — a retried request, or two concurrent taps of
// "Save" — always resolves to the SAME fileId. That's what makes the
// conditional PUT below the actual atomicity boundary: two racing requests
// both compute the same id, only one PUT can win the
// attribute_not_exists(fileId) condition, the loser's ConditionalCheckFailed
// is treated as "already saved" and correctly skipped from billing/counting
// — no read-then-write window to lose a race in. Mirrors the
// momentsStudioIdFor pattern in auth/moments-onboard/route.ts.
function aiImageOutputFileId(imageId: string, index: number): string {
  return createHash('sha256').update(`ai-image:${imageId}:${index}`).digest('hex').slice(0, 32)
}

// Promotes a chosen subset of a completed AI Image Studio batch's staged R2
// results into real MediaFile rows — see lambda/vayustudio-imagegen's header
// comment for why generation results start as plain R2 keys, not MediaFile
// rows: the credit charge already happened at request time regardless of
// what the user keeps, but STORAGE billing should only count what's
// actually kept. Discarded staged objects are never promoted and are swept
// later by the same storage-check cron that already sweeps orphaned
// multipart uploads.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; imageId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.studioId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { projectId, imageId } = params
    const resolved = await resolveProjectForViewer(auth, projectId)
    if (!resolved || !isOwnerOrAdmin(auth.studioId, resolved.project, resolved.member)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const studioId = resolved.project.studioId

    const image = await studioGetItem<StudioAiImage>(TABLES.aiImages, { imageId })
    if (!image || image.projectId !== projectId || image.studioId !== studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (image.status !== 'completed' || !image.outputR2Keys?.length) {
      return NextResponse.json({ success: false, error: 'NOT_READY' }, { status: 400 })
    }

    const { indices } = await req.json().catch(() => ({})) as { indices?: number[] }
    const validIndices = Array.isArray(indices)
      ? Array.from(new Set(indices)).filter((i) => Number.isInteger(i) && i >= 0 && i < image.outputR2Keys!.length)
      : []
    if (validIndices.length === 0) {
      return NextResponse.json({ success: false, error: 'NO_SELECTION', message: 'Pick at least one image to save.' }, { status: 400 })
    }

    const now = new Date().toISOString()

    const newFileIds: string[] = []
    const alreadySavedFileIds: string[] = []
    for (const i of validIndices) {
      const fileId = aiImageOutputFileId(imageId, i)
      const r2Key = image.outputR2Keys[i]
      const sizeBytes = image.outputSizes?.[i] ?? 0

      const mediaFile: MediaFile = {
        projectId, fileId, studioId,
        originalFilename: `ai-image-${imageId}-${i}.jpg`,
        fileType: 'IMAGE',
        mimeType: 'image/jpeg',
        sizeBytes,
        storageBackend: 'R2',
        r2Key,
        watermarkEnabled: false,
        // Date.now()-based, matching every other upload path in this
        // codebase (upload-url, transfers import/move/copy) — deliberately
        // NOT derived from project.totalFiles. A later index in this same
        // loop can throw after an earlier one already committed; on retry a
        // totalFiles-derived value would hand out the same displayOrder
        // twice, which Date.now() can't do.
        displayOrder: Date.now() + i,
        uploadedAt: now,
        processingStatus: 'PROCESSING',
        aiGenerated: true,
        aiPrompt: image.prompt,
        aiSourceFileIds: image.sourceFileIds?.length ? image.sourceFileIds : undefined,
      }
      // The MediaFile create and its two billing counters commit as ONE
      // DynamoDB transaction — not three separate calls. That's what
      // guarantees there's no window where the row exists but wasn't billed
      // (or was double-billed): either all three land together, or none do
      // and the conditional PUT is free to succeed on a clean retry.
      const transactOps: StudioTransactOp[] = [
        { type: 'Put', table: TABLES.mediafiles, item: mediaFile as unknown as Record<string, unknown>, conditionExpression: 'attribute_not_exists(fileId)' },
        {
          type: 'Update', table: TABLES.projects, key: { studioId, projectId },
          updateExpression: 'ADD totalFiles :n SET updatedAt = :now, #s = :active',
          expressionValues: { ':n': 1, ':now': now, ':active': 'ACTIVE' },
          expressionNames: { '#s': 'status' },
          conditionExpression: 'attribute_exists(studioId)',
        },
        {
          type: 'Update', table: TABLES.studios, key: { studioId },
          updateExpression: 'ADD storageUsedBytes :size, billableStorageBytes :size SET updatedAt = :now',
          expressionValues: { ':size': sizeBytes, ':now': now },
        },
      ]
      let alreadySaved = false
      // One retry on TransactionConflict only — that code means DynamoDB
      // cancelled the WHOLE transaction because another transaction was
      // touching the same item (the shared project/studio rows) at the same
      // instant, not that anything committed. It's the concurrent-double-tap
      // counterpart to ConditionalCheckFailed's sequential-retry case, and
      // is safe to just retry once rather than surface as a spurious 500.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await studioTransactWrite(transactOps)
          break
        } catch (err) {
          const name = (err as { name?: string }).name
          const reasons = (err as { CancellationReasons?: { Code?: string }[] }).CancellationReasons
          if (name === 'TransactionCanceledException' && reasons?.[0]?.Code === 'ConditionalCheckFailed') {
            alreadySaved = true // already saved by an earlier call — not an error, just skip billing/counting again
            break
          }
          if (name === 'TransactionCanceledException' && reasons?.some((r) => r.Code === 'TransactionConflict') && attempt === 0) {
            continue // transient contention, nothing committed — retry once
          }
          throw err
        }
      }
      if (alreadySaved) {
        alreadySavedFileIds.push(fileId)
        continue
      }
      newFileIds.push(fileId)

      // Same pipeline every normal upload goes through (thumbnail
      // generation happens here regardless of the watermark toggle itself,
      // per upload-complete's identical invocation) — a saved AI image
      // should behave exactly like any other gallery photo downstream.
      invokeStudioWatermarkLambda({
        fileId, projectId, studioId, sourceKey: r2Key, sourceBackend: 'R2',
        watermarkEnabled: false, fileType: 'IMAGE',
      }).catch((err) => {
        console.error('[ai-images save] watermark invoke failed', err)
        studioUpdateItem(TABLES.mediafiles, { projectId, fileId }, 'SET processingStatus = :s', { ':s': 'FAILED' }).catch(() => {})
      })
    }

    if (newFileIds.length > 0) {
      // Best-effort tracking only — the real idempotency guarantee is the
      // conditional PUT above, not this list. Stores the actual MediaFile
      // fileId (not a synthetic string) so a future UI can link straight
      // from "AI Images" history to the real gallery photo.
      await studioUpdateItem(
        TABLES.aiImages, { imageId },
        'SET savedFileIds = list_append(if_not_exists(savedFileIds, :empty), :ids)',
        { ':ids': newFileIds, ':empty': [] }
      ).catch((e) => console.error('[ai-images save] savedFileIds tracking update failed (non-fatal)', e))
    }

    return NextResponse.json({ success: true, data: { fileIds: newFileIds, alreadySaved: alreadySavedFileIds.length } })
  } catch (err) {
    console.error('[ai-images save POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
