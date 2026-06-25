import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { Studio } from '@/types/studio'

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const studioId = auth.studioId
    if (!studioId) {
      return NextResponse.json({ success: false, error: 'MISSING_STUDIO_ID' }, { status: 400 })
    }
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({
      success: true,
      data: {
        studioName:       studio.name,
        storageUsedBytes: studio.storageUsedBytes,
        plan:             studio.plan,
      },
    })
  } catch (err) {
    console.error('[admin/stats GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
