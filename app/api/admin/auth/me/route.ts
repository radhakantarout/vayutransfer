import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminJWT } from '@/lib/adminAuth'

// Lets the client-side admin layout know whether the httpOnly admin_token
// cookie is currently valid, without exposing the token itself.
export async function GET(req: NextRequest) {
  const auth = await verifyAdminJWT(req)
  if (!auth) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
  }
  return NextResponse.json({ success: true, data: { email: auth.email } })
}
