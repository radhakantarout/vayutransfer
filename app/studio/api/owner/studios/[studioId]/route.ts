import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { Studio, StudioUser } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { studioId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { studioId } = params
    const [studio, users] = await Promise.all([
      studioGetItem<Studio>(TABLES.studios, { studioId }),
      studioQueryByIndex<StudioUser>(TABLES.users, 'studioId-index', 'linkedStudioId = :sid', { ':sid': studioId }).catch(() => [] as StudioUser[]),
    ])

    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ success: true, data: { studio, users } })
  } catch (err) {
    console.error('[owner studio GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { studioId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { status } = await req.json()
    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
      return NextResponse.json({ success: false, error: 'INVALID_STATUS' }, { status: 400 })
    }

    const { studioId } = params
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const now = new Date().toISOString()
    await studioUpdateItem(
      TABLES.studios,
      { studioId },
      'SET #s = :status, updatedAt = :now',
      { ':status': status, ':now': now },
      { '#s': 'status' }
    )

    // Suspend/reactivate the studio's admin users too
    const adminUsers = await studioQueryByIndex<StudioUser>(
      TABLES.users, 'email-index',
      'linkedStudioId = :sid',
      { ':sid': studioId }
    ).catch(() => [] as StudioUser[])

    await Promise.all(
      adminUsers
        .filter((u) => u.role === 'ADMIN')
        .map((u) =>
          studioUpdateItem(TABLES.users, { userId: u.userId }, 'SET #s = :status, updatedAt = :now', { ':status': status, ':now': now }, { '#s': 'status' })
        )
    )

    return NextResponse.json({ success: true, data: { studioId, status } })
  } catch (err) {
    console.error('[owner studio PATCH]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
