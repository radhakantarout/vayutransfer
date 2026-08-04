import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioPutItem, studioDeleteItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { MediaFile, StudioProject } from '@/types/studio'

// POST — move a photo from this event to another event of the SAME client.
// No bytes are touched: object keys are stored directly on the MediaFile row
// and read as-is everywhere (never reconstructed from projectId), so this is
// just re-pointing the row at the target project and deleting the old one —
// the same trick Raw File Transfer's import-to-gallery route already uses.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, fileId } = params
    const { targetProjectId } = await req.json().catch(() => ({}))
    if (!targetProjectId || typeof targetProjectId !== 'string') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: 'targetProjectId is required' }, { status: 400 })
    }
    if (targetProjectId === projectId) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT', message: 'Already in this event' }, { status: 400 })
    }

    const [file, sourceProject, targetProject] = await Promise.all([
      studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId }),
      studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId }),
      studioGetItem<StudioProject>(TABLES.projects, { studioId: auth.studioId, projectId: targetProjectId }),
    ])
    if (!file || file.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (!sourceProject || !targetProject) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    // Composite-key GetItem on {studioId, projectId} already enforces studio
    // ownership for both projects — this additional check keeps the move
    // scoped to one client's own events, not any event the studio owns.
    if (targetProject.clientName !== sourceProject.clientName) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'Target event belongs to a different client' }, { status: 403 })
    }

    const now = new Date().toISOString()
    const movedFile: MediaFile = { ...file, projectId: targetProjectId, displayOrder: Date.now() }

    await studioPutItem(TABLES.mediafiles, movedFile as unknown as Record<string, unknown>)
    await Promise.all([
      studioDeleteItem(TABLES.mediafiles, { projectId, fileId }),
      studioDeleteItem(TABLES.selections, { projectId, fileId }).catch(() => {}),
    ])

    await Promise.all([
      studioUpdateItem(
        TABLES.projects, { studioId: auth.studioId, projectId },
        'ADD totalFiles :neg SET updatedAt = :now', { ':neg': -1, ':now': now },
        undefined, 'attribute_exists(studioId)'
      ).catch(() => {}),
      studioUpdateItem(
        TABLES.projects, { studioId: auth.studioId, projectId: targetProjectId },
        'ADD totalFiles :one SET updatedAt = :now', { ':one': 1, ':now': now },
        undefined, 'attribute_exists(studioId)'
      ).catch(() => {}),
    ])

    return NextResponse.json({ success: true, data: { fileId, targetProjectId } })
  } catch (err) {
    console.error('[files move POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
