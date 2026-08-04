import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { getBookingsByStudio } from '@/lib/studio/bookings'

export async function GET(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }
  const studioId = auth.studioId
  if (!studioId) return NextResponse.json({ success: false, error: 'NO_STUDIO' }, { status: 400 })

  const bookings = await getBookingsByStudio(studioId)
  // Sort newest first
  bookings.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return NextResponse.json({ success: true, data: bookings })
}
