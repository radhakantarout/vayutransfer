import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { getBooking, updateBookingStatus } from '@/lib/studio/bookings'
import type { BookingStatus } from '@/types/studio'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const { status } = await req.json() as { status: BookingStatus }
  if (!['NEW', 'SEEN', 'REPLIED'].includes(status)) {
    return NextResponse.json({ success: false, error: 'INVALID_STATUS' }, { status: 400 })
  }

  const booking = await getBooking(params.bookingId)
  if (!booking || booking.studioId !== auth.studioId) {
    return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
  }

  await updateBookingStatus(params.bookingId, status)
  return NextResponse.json({ success: true })
}
