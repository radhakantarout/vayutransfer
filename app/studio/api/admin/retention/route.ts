import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { RETENTION_GRACE_DAY_OPTIONS } from '@/constants/studioPricing'

export async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { days } = await req.json().catch(() => ({})) as { days?: number }
    if (!days || !(RETENTION_GRACE_DAY_OPTIONS as readonly number[]).includes(days)) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    await studioUpdateItem(
      TABLES.studios,
      { studioId: auth.studioId },
      'SET dataRetentionGraceDays = :days, updatedAt = :now',
      { ':days': days, ':now': new Date().toISOString() }
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/retention PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
