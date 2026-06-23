import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { signStudioJWT } from '@/lib/studio/auth'
import { verifyAndConsumeOTP } from '@/lib/studio/otp'
import { studioQueryByIndex, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, StudioUser } from '@/types/studio'

export async function POST(req: NextRequest) {
  try {
    const { sessionId, otp, projectToken } = await req.json()

    if (!sessionId || !otp || !projectToken) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const verified = await verifyAndConsumeOTP(sessionId, otp)
    if (!verified) {
      return NextResponse.json({ success: false, error: 'INVALID_OTP' }, { status: 401 })
    }

    // Get project to extract projectId
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

    // Find or create CLIENT user record by phone
    const existingUsers = await studioQueryByIndex<StudioUser>(
      TABLES.users,
      'phone-index',
      'phone = :phone',
      { ':phone': verified.phone }
    )

    let user = existingUsers[0]
    const now = new Date().toISOString()

    if (!user) {
      const userId = randomUUID()
      user = {
        userId,
        role: 'CLIENT',
        phone: verified.phone,
        linkedProjectIds: [project.projectId],
        status: 'ACTIVE',
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      }
      await studioPutItem(TABLES.users, user as unknown as Record<string, unknown>)
    } else {
      // Add projectId to linkedProjectIds if not already there
      const ids = new Set(user.linkedProjectIds ?? [])
      ids.add(project.projectId)
      await studioUpdateItem(
        TABLES.users,
        { userId: user.userId },
        'SET linkedProjectIds = :ids, lastLoginAt = :now, updatedAt = :now',
        { ':ids': Array.from(ids), ':now': now }
      )
    }

    const token = await signStudioJWT({
      userId: user.userId,
      role: 'CLIENT',
      projectId: project.projectId,
      studioId: project.studioId,
    })

    const response = NextResponse.json({ success: true, data: { token, role: 'CLIENT' } })
    response.cookies.set('studio_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30d
      path: '/',
    })
    return response
  } catch (err) {
    console.error('[client-otp-verify]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
