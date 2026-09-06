import { NextRequest, NextResponse } from 'next/server'
import { getWebsiteBySubdomain } from '@/lib/studio/website'
import { createBooking } from '@/lib/studio/bookings'
import { getStudioAdminEmails } from '@/lib/studio/notify'
import { sendBookingNotificationEmail } from '@/lib/aws/ses'
import { MAX_NAME_LENGTH, MAX_MESSAGE_LENGTH, validateEmail, validatePhone, validateName } from '@/lib/studio/bookingValidation'

export async function POST(
  req: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  try {
    const { subdomain } = params
    const body = await req.json()
    const { name, email, phone, eventType, eventDate, message } = body

    // This is a public, unauthenticated endpoint — the form's own client-side
    // checks (BookingForm.tsx) can always be bypassed by posting here
    // directly, so this is the authoritative validation, not just a mirror
    // of it. Same rules, shared from lib/studio/bookingValidation so the two
    // can't drift out of sync.
    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ success: false, message: 'Name and email are required' }, { status: 400 })
    }
    if (!validateName(name)) {
      return NextResponse.json({ success: false, message: 'Please enter a valid name' }, { status: 400 })
    }
    if (!validateEmail(email)) {
      return NextResponse.json({ success: false, message: 'Please enter a valid email address' }, { status: 400 })
    }
    if (phone && !validatePhone(phone)) {
      return NextResponse.json({ success: false, message: 'Please enter a valid phone number' }, { status: 400 })
    }

    const site = await getWebsiteBySubdomain(subdomain)
    if (!site || site.status !== 'LIVE' || !site.bookingEnabled) {
      return NextResponse.json({ success: false, message: 'Booking not available' }, { status: 404 })
    }

    const booking = await createBooking({
      studioId: site.studioId,
      subdomain,
      // Truncated (not rejected) — a safety net for length regardless of
      // what the client sends, matching how the editor's own fields are
      // handled (see the website PUT route's bookingMessage truncation).
      name: name.trim().slice(0, MAX_NAME_LENGTH),
      email: email.trim().toLowerCase(),
      phone: phone?.trim(),
      eventType,
      eventDate,
      message: message?.trim().slice(0, MAX_MESSAGE_LENGTH),
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
