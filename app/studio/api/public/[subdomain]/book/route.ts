import { NextRequest, NextResponse } from 'next/server'
import { getWebsiteBySubdomain } from '@/lib/studio/website'
import { createBooking } from '@/lib/studio/bookings'
import { getStudioAdminEmails } from '@/lib/studio/notify'
import { sendBookingNotificationEmail } from '@/lib/aws/ses'

export async function POST(
  req: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  try {
    const { subdomain } = params
    const body = await req.json()
    const { name, email, phone, eventType, eventDate, message } = body

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ success: false, message: 'Name and email are required' }, { status: 400 })
    }

    const site = await getWebsiteBySubdomain(subdomain)
    if (!site || site.status !== 'LIVE' || !site.bookingEnabled) {
      return NextResponse.json({ success: false, message: 'Booking not available' }, { status: 404 })
    }

    const booking = await createBooking({
      studioId: site.studioId,
      subdomain,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim(),
      eventType,
      eventDate,
      message: message?.trim(),
    })

    // Fire-and-forget email to studio — contactEmail if set, else fall back to admin accounts
    const recipients = site.contactEmail
      ? [site.contactEmail]
      : await getStudioAdminEmails(site.studioId)

    recipients.forEach((to) => {
      sendBookingNotificationEmail(to, site.heroTitle, booking)
        .catch(err => console.error('[booking] email failed', err))
    })

    return NextResponse.json({ success: true, data: { bookingId: booking.bookingId } })
  } catch (err) {
    console.error('[public/book]', err)
    return NextResponse.json({ success: false, message: 'Something went wrong' }, { status: 500 })
  }
}
