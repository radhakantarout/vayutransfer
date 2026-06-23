import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { generateOTP, storeOTP } from '@/lib/studio/otp'
import { sendClientOtpEmail } from '@/lib/aws/ses'
import type { StudioProject } from '@/types/studio'

export async function POST(req: NextRequest) {
  try {
    const { email, projectToken } = await req.json()

    if (!email || !projectToken) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const projects = await studioQueryByIndex<StudioProject>(
      TABLES.projects,
      'clientShareToken-index',
      'clientShareToken = :token',
      { ':token': projectToken }
    )

    const project = projects[0]
    if (!project) {
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 404 })
    }
    if (!project.clientShareExpiresAt || new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    const otp = generateOTP()
    const sessionId = randomUUID()

    await storeOTP(sessionId, otp, email, projectToken)
    await sendClientOtpEmail(email, project.clientName, otp)

    console.log(`[OTP] ${email}: ${otp}`)

    return NextResponse.json({ success: true, data: { sessionId } })
  } catch (err) {
    console.error('[client-otp-request]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
