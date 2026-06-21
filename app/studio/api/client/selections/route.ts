import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import type { Selection } from '@/types/studio'

// GET — load all selections for the client's project
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const projectId = auth.projectId!
    const selections = await studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId)

    return NextResponse.json({ success: true, data: selections })
  } catch (err) {
    console.error('[selections GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// POST — upsert a single selection
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const { fileId, isSelected, editingRequired = false, comment = '' } = await req.json()
    if (!fileId || typeof isSelected !== 'boolean') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const projectId = auth.projectId!
    const now = new Date().toISOString()

    const selection: Selection = {
      projectId,
      fileId,
      studioId: auth.studioId!,
      clientId: auth.userId,
      isSelected,
      editingRequired,
      comment,
      selectedAt: now,
      updatedAt: now,
    }

    await studioPutItem(TABLES.selections, selection as unknown as Record<string, unknown>)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[selections POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
