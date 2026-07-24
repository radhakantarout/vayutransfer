import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { initiateStudioR2MultipartUpload, getStudioR2PartPresignedUrls, getStudioR2Key } from '@/lib/studio/r2'
import { syncBillingCycle, checkStorageAvailable } from '@/lib/studio/quota'
import type { StudioProject, MediaFile, Studio } from '@/types/studio'

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { filename, mimeType, sizeBytes, partCount } = await req.json()
    if (!filename || !mimeType || !sizeBytes || !partCount) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }
    if (partCount < 1 || partCount > 10000) {
      return NextResponse.json({ success: false, error: 'INVALID_PART_COUNT' }, { status: 400 })
    }

    const { projectId } = params

    // Verify project belongs to this studio
    const projects = await studioGetItem<StudioProject>(
      TABLES.projects,
      { studioId: auth.studioId, projectId }
    )
    if (!projects) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Soft gate — real size is only known once, but this stops the common
    // case (already full, about to add more) before the studio wastes time
    // picking/uploading files. billableStorageBytes is the hard backstop:
    // upload-complete still runs even if this check is skipped somehow, but
    // the studio would just be over quota and see it on their next check.
    let studio = await studioGetItem<Studio>(TABLES.studios, { studioId: auth.studioId! })
    if (studio) {
      studio = await syncBillingCycle(studio)
      const quota = checkStorageAvailable(studio, sizeBytes)
      if (!quota.ok) {
        return NextResponse.json({
          success: false, error: 'QUOTA_EXCEEDED', quotaType: 'storage',
          message: 'You’re out of storage space. Top up storage or upgrade your plan in Settings → Billing to keep uploading.',
          usedBytes: quota.usedBytes, quotaBytes: quota.quotaBytes, usedPct: quota.usedPct,
        }, { status: 402 })
      }
    }

    const studioId = auth.studioId!
    const fileId = randomUUID()
    const fileType = mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE'
    // New uploads go to R2 — old S3 files (storageBackend absent/'S3') are
    // untouched and keep being served from S3 forever.
    const r2Key = getStudioR2Key(studioId, projectId, fileId, filename)

    const uploadId = await initiateStudioR2MultipartUpload(r2Key, mimeType)
    const presignedUrls = await getStudioR2PartPresignedUrls(r2Key, uploadId, partCount)

    const now = new Date().toISOString()
    const mediaFile: MediaFile = {
      projectId,
      fileId,
      studioId,
      originalFilename: filename,
      fileType,
      mimeType,
      sizeBytes,
      storageBackend: 'R2',
      r2Key,
      // Clean by default — the studio admin explicitly applies watermark
      // (single photo or bulk) when they want it, rather than every upload
      // being auto-protected. The watermark Lambda already fully respects
      // this flag (still resizes to 1200px either way, just skips the
      // overlay when false), so this needs no new image pipeline.
      watermarkEnabled: false,
      displayOrder: Date.now(),
      uploadedAt: now,
      processingStatus: 'UPLOADING',
    }

    await studioPutItem(TABLES.mediafiles, mediaFile as unknown as Record<string, unknown>)

    // r2Key deliberately not in the response — client never needs it (only
    // fileId/uploadId/presignedUrls), and per the golden security rule R2/S3
    // keys should never leave the server.
    return NextResponse.json({
      success: true,
      data: { fileId, uploadId, presignedUrls },
    })
  } catch (err) {
    console.error('[upload-url]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
