import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioDeleteItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject } from '@/types/studio'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string; faceId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, faceId } = params
    const studioId = auth.studioId!
    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    // Deletes only the group record — the photos themselves are untouched,
    // this just removes the saved "which photos belong together" bucket.
    await studioDeleteItem(TABLES.faces, { projectId, faceId })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[faces/groups/[faceId] DELETE]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
