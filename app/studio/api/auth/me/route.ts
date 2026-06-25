import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
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
      },
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
