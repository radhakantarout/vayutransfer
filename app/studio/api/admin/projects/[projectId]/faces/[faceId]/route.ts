import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject } from '@/types/studio'

export async function PATCH(
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
    const { label } = await req.json()

    if (typeof label !== 'string' || label.length > 50) {
      return NextResponse.json({ success: false, error: 'INVALID_LABEL' }, { status: 400 })
    }

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const sanitised = label.replace(/<[^>]*>/g, '').trim()
    await studioUpdateItem(
      TABLES.faces,
      { projectId, faceId },
      'SET #lbl = :label, updatedAt = :now',
      { ':label': sanitised, ':now': new Date().toISOString() },
      { '#lbl': 'label' }
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[face PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
