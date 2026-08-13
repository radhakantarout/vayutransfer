import { NextRequest, NextResponse } from 'next/server'
import { randomUUID, randomBytes } from 'crypto'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { copyStudioR2Object, getStudioR2TransferKey } from '@/lib/studio/r2'
import { syncBillingCycle, checkStorageAvailable } from '@/lib/studio/quota'
import { transferLinkExpirySeconds, DEFAULT_TRANSFER_EXPIRY_DAYS } from '@/lib/studio/transferConfig'
import type { StudioTransfer, StudioProject, Studio } from '@/types/studio'

// POST — copy a READY transfer into another event of the SAME client, as a
// fully independent record (own transferId, own shareToken, own byte-copied
// R2 object) — same approach as files/[fileId]/copy. Independent storage
// means deleting either copy is always safe in isolation, with no
// cross-reference bookkeeping needed on delete.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; transferId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, transferId } = params
    const { targetProjectId } = await req.json().catch(() => ({}))
    if (!targetProjectId || typeof targetProjectId !== 'string') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: 'targetProjectId is required' }, { status: 400 })
    }

    const [transfer, sourceProject, targetProject] = await Promise.all([
      studioGetItem<StudioTransfer>(TABLES.transfers, { projectId, transferId }),
      studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId }),
      studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId: targetProjectId }),
    ])
    if (!transfer || transfer.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (!sourceProject || !targetProject) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (targetProject.clientName !== sourceProject.clientName) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'Target event belongs to a different client' }, { status: 403 })
    }
    if (transfer.status !== 'READY' || !transfer.r2Key || !transfer.sizeBytes || !transfer.filename) {
      return NextResponse.json({ success: false, error: 'INVALID_STATE', message: 'Only a ready transfer with a file can be copied' }, { status: 409 })
    }

    const studioId = auth.studioId!

    let studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (studio) {
      studio = await syncBillingCycle(studio)
      const quota = checkStorageAvailable(studio, transfer.sizeBytes)
      if (!quota.ok) {
        return NextResponse.json({
          success: false, error: 'QUOTA_EXCEEDED', quotaType: 'storage',
          message: 'You’re out of storage space. Top up storage or upgrade your plan in Settings → Billing to copy this file.',
          usedBytes: quota.usedBytes, quotaBytes: quota.quotaBytes, usedPct: quota.usedPct,
        }, { status: 402 })
      }
    }

    const newTransferId = randomUUID()
    const newR2Key = getStudioR2TransferKey(studioId, targetProjectId, newTransferId, transfer.filename)
    await copyStudioR2Object(transfer.r2Key, newR2Key)

    const shareToken = randomBytes(32).toString('hex')
    const shareExpiresAt = new Date(Date.now() + transferLinkExpirySeconds() * 1000).toISOString()
    const now = new Date().toISOString()

    const newTransfer: StudioTransfer = {
      projectId: targetProjectId,
      transferId: newTransferId,
      studioId,
      direction: transfer.direction,
      filename: transfer.filename,
      mimeType: transfer.mimeType,
      sizeBytes: transfer.sizeBytes,
      r2Key: newR2Key,
      status: 'READY',
      shareToken,
      shareExpiresAt,
      expiryDays: DEFAULT_TRANSFER_EXPIRY_DAYS,
      downloadCount: 0,
      importedToGallery: false,
      note: transfer.note,
      createdBy: auth.userId,
      createdAt: now, updatedAt: now,
    }
    await studioPutItem(TABLES.transfers, newTransfer as unknown as Record<string, unknown>)

    // Genuinely new storage — same ADD pattern as files/[fileId]/copy's billing block.
    await studioUpdateItem(
      TABLES.studios, { studioId },
      'ADD storageUsedBytes :size, billableStorageBytes :size SET updatedAt = :now',
      { ':size': transfer.sizeBytes, ':now': now }
    )

    return NextResponse.json({ success: true, data: { transferId: newTransferId, targetProjectId } })
  } catch (err) {
    console.error('[transfers copy POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
