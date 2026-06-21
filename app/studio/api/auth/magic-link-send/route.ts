import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject } from '@/types/studio'

const ses = new SESClient({ region: process.env.SES_REGION ?? 'ap-south-1' })

function getMagicSecret() {
  return new TextEncoder().encode((process.env.STUDIO_JWT_SECRET ?? '') + '_magic')
}

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
    if (!project || new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 404 })
    }

    const magicToken = await new SignJWT({ email, projectToken, projectId: project.projectId })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(getMagicSecret())

    const studioUrl = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.vayutransfer.com'
    const magicLink = `${studioUrl}/studio/magic?t=${encodeURIComponent(magicToken)}`

    if (process.env.NODE_ENV === 'production') {
      await ses.send(new SendEmailCommand({
        Source: process.env.SES_FROM_EMAIL ?? 'noreply@vayutransfer.com',
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: `Access your gallery — ${project.clientName}` },
          Body: {
            Html: {
              Data: `
                <p>Hello,</p>
                <p>Click the link below to access your photo gallery. The link expires in 1 hour.</p>
                <p><a href="${magicLink}" style="background:#00C6FF;color:#0a1628;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">View My Gallery</a></p>
                <p>Or copy this link: ${magicLink}</p>
                <p style="color:#888;font-size:12px;">Powered by VayuStudio | studio.vayutransfer.com</p>
              `,
            },
          },
        },
      }))
    } else {
      console.log(`[DEV] Magic link for ${email}: ${magicLink}`)
    }

    return NextResponse.json({ success: true, data: { sent: true } })
  } catch (err) {
    console.error('[magic-link-send]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
