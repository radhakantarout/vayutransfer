import { NextRequest, NextResponse } from 'next/server'
import { randomUUID, randomBytes } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import { initiateStudioR2MultipartUpload, getStudioR2PartPresignedUrls, getStudioR2TransferFileKey } from '@/lib/studio/r2'
import { syncBillingCycle, checkStorageAvailable } from '@/lib/studio/quota'
import { DEFAULT_TRANSFER_EXPIRY_DAYS, TRANSFER_EXTEND_DAY_OPTIONS } from '@/lib/studio/transferConfig'
import type { StudioProject, StudioTransfer, StudioTransferFile, Studio } from '@/types/studio'

const studioUrl = () => process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.vayutransfer.com'

interface BatchFileInput {
  filename: string
  relativePath?: string
  mimeType: string
  sizeBytes: number
  partCount: number
}

// POST — create a multi-file SEND batch: one parent StudioTransfer
// (fileCount set, one shareToken/link) + one StudioTransferFile child per
// file, each with its own multipart upload already initiated. Single-file
// SEND keeps using the existing .../transfers POST untouched — this route
// only exists for 2+ files, so a batch is never created for what should be
// a plain single-file transfer.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const studioId = auth.studioId!
    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const body = await req.json()
    const files: BatchFileInput[] = Array.isArray(body.files) ? body.files : []
    const { note, expiryDays: requestedExpiryDays } = body
    if (files.length < 2) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: 'A batch needs at least 2 files — use the single-file route for one.' }, { status: 400 })
    }

    for (const f of files) {
      if (!f.filename || !f.mimeType || !f.sizeBytes || !f.partCount) {
        return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
      }
      if (f.partCount < 1 || f.partCount > 10000) {
        return NextResponse.json({ success: false, error: 'INVALID_PART_COUNT' }, { status: 400 })
      }
      if (!f.mimeType.startsWith('image/') && !f.mimeType.startsWith('video/')) {
        return NextResponse.json({
          success: false, error: 'INVALID_FILE_TYPE',
          message: 'Raw Transfer only accepts photos and videos.',
        }, { status: 400 })
      }
    }

    const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0)
    let studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (studio) {
      studio = await syncBillingCycle(studio)
      const quota = checkStorageAvailable(studio, totalSizeBytes)
      if (!quota.ok) {
        return NextResponse.json({
          success: false, error: 'QUOTA_EXCEEDED', quotaType: 'storage',
          message: 'You’re out of storage space. Top up storage or upgrade your plan in Settings → Billing to keep sending files.',
          usedBytes: quota.usedBytes, quotaBytes: quota.quotaBytes, usedPct: quota.usedPct,
        }, { status: 402 })
      }
    }

    const expiryDays: number = (TRANSFER_EXTEND_DAY_OPTIONS as readonly number[]).includes(requestedExpiryDays)
      ? requestedExpiryDays
      : DEFAULT_TRANSFER_EXPIRY_DAYS

    const transferId = randomUUID()
    const shareToken = randomBytes(32).toString('hex')
    const shareExpiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const fileResults = await Promise.all(files.map(async (f) => {
      const fileId = randomUUID()
      const r2Key = getStudioR2TransferFileKey(studioId, projectId, transferId, fileId, f.filename)
      const uploadId = await initiateStudioR2MultipartUpload(r2Key, f.mimeType)
      const presignedUrls = await getStudioR2PartPresignedUrls(r2Key, uploadId, f.partCount)
      const child: StudioTransferFile = {
        transferId, fileId,
        filename: f.filename,
        relativePath: f.relativePath || f.filename,
        mimeType: f.mimeType, sizeBytes: f.sizeBytes, r2Key,
        status: 'UPLOADING', uploadId,
        downloadCount: 0,
        createdAt: now, updatedAt: now,
      }
      return { child, fileId, uploadId, presignedUrls }
    }))

    await Promise.all(fileResults.map(r => studioPutItem(TABLES.transferFiles, r.child as unknown as Record<string, unknown>)))

    const transfer: StudioTransfer = {
      projectId, transferId, studioId, direction: 'SEND',
      sizeBytes: totalSizeBytes,
      status: 'UPLOADING',
      shareToken, shareExpiresAt,
      expiryDays,
      fileCount: files.length,
      downloadCount: 0,
      importedToGallery: false,
      note,
      createdBy: auth.userId,
      createdAt: now, updatedAt: now,
    }
    await studioPutItem(TABLES.transfers, transfer as unknown as Record<string, unknown>)

    return NextResponse.json({
      success: true,
      data: {
        transferId,
        shareUrl: `${studioUrl()}/studio/transfer/send/${shareToken}`,
        files: fileResults.map(r => ({ fileId: r.fileId, uploadId: r.uploadId, presignedUrls: r.presignedUrls })),
      },
    })
  } catch (err) {
    console.error('[transfers batch POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
