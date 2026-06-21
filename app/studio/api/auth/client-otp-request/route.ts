import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'
import { studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { generateOTP, storeOTP } from '@/lib/studio/otp'
import type { StudioProject } from '@/types/studio'

const sns = new SNSClient({ region: process.env.SNS_REGION ?? 'ap-south-1' })

export async function POST(req: NextRequest) {
  try {
    const { phone, projectToken } = await req.json()

    if (!phone || !projectToken) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    // Validate project token exists and is not expired
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
    if (new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    const otp = generateOTP()
    const sessionId = randomUUID()

    await storeOTP(sessionId, otp, phone, projectToken)

    // Send OTP via SNS SMS
    if (process.env.NODE_ENV === 'production') {
      await sns.send(new PublishCommand({
        PhoneNumber: phone.startsWith('+') ? phone : `+91${phone}`,
        Message: `Your VayuStudio OTP is ${otp}. Valid for 10 minutes. Do not share this with anyone.`,
      }))
    } else {
      // Dev mode — log OTP to console
      console.log(`[DEV] OTP for ${phone}: ${otp}`)
    }

    return NextResponse.json({ success: true, data: { sessionId } })
  } catch (err) {
    console.error('[client-otp-request]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
