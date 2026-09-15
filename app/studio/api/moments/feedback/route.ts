import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { sendMomentsFeedbackEmail } from '@/lib/aws/ses'
import type { StudioUser } from '@/types/studio'

const MAX_LENGTH = 2000

// A durable record of feedback/legal reports, sent server-side via SES
// (support@vayutransfer.com) rather than relying solely on the client's own
// mailto: link, which does nothing at all if the visitor has no mail client
// configured. The Profile UI still also opens mailto: as a redundant path,
// not a replacement for this.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth?.userId) return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })

    const { kind, text } = await req.json().catch(() => ({})) as { kind?: string; text?: string }
    if (kind !== 'feedback' && kind !== 'legal') {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }
    const trimmed = text?.trim().slice(0, MAX_LENGTH)
    if (!trimmed) return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })

    const user = await studioGetItem<StudioUser>(TABLES.users, { userId: auth.userId }).catch(() => null)
    await sendMomentsFeedbackEmail(kind, user?.name || 'A Moments user', user?.email || 'unknown', trimmed)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[moments feedback POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
