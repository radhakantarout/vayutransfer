import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'

export async function GET(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth) return NextResponse.json({ success: true, data: null })
  return NextResponse.json({
    success: true,
    data: { role: auth.role, userId: auth.userId, studioId: auth.studioId },
  })
}
