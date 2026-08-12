import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioTransfer, StudioProject } from '@/types/studio'

// PATCH — move a transfer to another event of the SAME client. Same
// mechanics as files/[fileId]/move: no R2 bytes touched (the object's key
// is stored on the row and read as-is — getStudioR2TransferKey's projectId
// segment is only ever used at creation time, never re-derived afterward),
// so this is a pure DynamoDB re-point (projectId is the partition key, so
// "moving" means put-under-new-key-then-delete-old, never delete-then-put —
// a crash mid-operation leaves it duplicated/recoverable, not gone).
export async function PATCH(
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
    if (targetProjectId === projectId) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: 'Already in this event' }, { status: 400 })
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

    const movedTransfer: StudioTransfer = { ...transfer, projectId: targetProjectId }
    await studioPutItem(TABLES.transfers, movedTransfer as unknown as Record<string, unknown>)
    await studioDeleteItem(TABLES.transfers, { projectId, transferId })

    return NextResponse.json({ success: true, data: { transferId, targetProjectId } })
  } catch (err) {
    console.error('[transfers move PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
