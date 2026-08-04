import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioUser } from '@/types/studio'

export async function GET(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth) return NextResponse.json(
    { success: true, data: null },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )

  const user = await studioGetItem<StudioUser>(TABLES.users, { userId: auth.userId }).catch(() => null)

  return NextResponse.json(
    {
      success: true,
      data: {
        role:     auth.role,
        userId:   auth.userId,
        studioId: auth.studioId,
        name:     user?.name  ?? '',
        email:    user?.email ?? '',
        phone:    user?.phone ?? '',
      },
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

// Self-service profile edit — name/phone only. Email changes need
// re-verification and aren't supported here.
export async function PATCH(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const { name, phone } = await req.json().catch(() => ({})) as { name?: string; phone?: string }
  const updates: string[] = ['updatedAt = :now']
  const values: Record<string, unknown> = { ':now': new Date().toISOString() }
  const names: Record<string, string> = {}

  if (typeof name === 'string' && name.trim().length > 0) {
    updates.push('#n = :name')
    values[':name'] = name.trim()
    names['#n'] = 'name'
  }
  if (typeof phone === 'string') {
    updates.push('phone = :phone')
    values[':phone'] = phone.trim()
  }

  await studioUpdateItem(
    TABLES.users,
    { userId: auth.userId },
    `SET ${updates.join(', ')}`,
    values,
    Object.keys(names).length > 0 ? names : undefined
  )

  return NextResponse.json({ success: true })
}
