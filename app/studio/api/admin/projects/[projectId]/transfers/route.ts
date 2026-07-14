import { NextRequest, NextResponse } from 'next/server'
import { randomUUID, randomBytes } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { initiateStudioR2MultipartUpload, getStudioR2PartPresignedUrls, getStudioR2TransferKey } from '@/lib/studio/r2'
import type { StudioProject, StudioTransfer } from '@/types/studio'

const studioUrl = () => process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.vayutransfer.com'
const expirySeconds = () => parseInt(process.env.TRANSFER_LINK_EXPIRY_SECONDS ?? '604800', 10)

// GET — list all transfers (both directions) for the tab
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId })
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const transfers = await studioQueryByPK<StudioTransfer>(TABLES.transfers, 'projectId', projectId)
    transfers.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

    return NextResponse.json({ success: true, data: { transfers } })
  } catch (err) {
    console.error('[transfers GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// POST — create a transfer. SEND starts the multipart upload immediately;
// RECEIVE just creates a share link for someone else to upload against.
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
    const { direction, note } = body
    if (direction !== 'SEND' && direction !== 'RECEIVE') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const transferId = randomUUID()
    const shareToken = randomBytes(32).toString('hex')
    const shareExpiresAt = new Date(Date.now() + expirySeconds() * 1000).toISOString()
    const now = new Date().toISOString()

    if (direction === 'SEND') {
      const { filename, mimeType, sizeBytes, partCount } = body
      if (!filename || !mimeType || !sizeBytes || !partCount) {
        return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
      }
      if (partCount < 1 || partCount > 10000) {
        return NextResponse.json({ success: false, error: 'INVALID_PART_COUNT' }, { status: 400 })
      }

      const r2Key = getStudioR2TransferKey(studioId, projectId, transferId, filename)
      const uploadId = await initiateStudioR2MultipartUpload(r2Key, mimeType)
      const presignedUrls = await getStudioR2PartPresignedUrls(r2Key, uploadId, partCount)

      const transfer: StudioTransfer = {
        projectId, transferId, studioId, direction: 'SEND',
        filename, mimeType, sizeBytes, r2Key,
        status: 'UPLOADING',
        shareToken, shareExpiresAt,
        downloadCount: 0,
        importedToGallery: false,
        note,
        createdBy: auth.userId,
        createdAt: now, updatedAt: now,
      }
      await studioPutItem(TABLES.transfers, transfer as unknown as Record<string, unknown>)

      // r2Key deliberately not returned — same golden rule as regular uploads.
      return NextResponse.json({
        success: true,
        data: {
          transferId, uploadId, presignedUrls,
          shareUrl: `${studioUrl()}/studio/transfer/send/${shareToken}`,
        },
      })
    }

    // RECEIVE — no file yet, just a link for someone else to upload against.
    const transfer: StudioTransfer = {
      projectId, transferId, studioId, direction: 'RECEIVE',
      status: 'PENDING',
      shareToken, shareExpiresAt,
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
        shareUrl: `${studioUrl()}/studio/transfer/receive/${shareToken}`,
      },
    })
  } catch (err) {
    console.error('[transfers POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
