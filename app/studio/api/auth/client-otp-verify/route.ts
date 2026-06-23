import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { signStudioJWT } from '@/lib/studio/auth'
import { verifyAndConsumeOTP } from '@/lib/studio/otp'
import { studioQueryByIndex, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, StudioUser } from '@/types/studio'

export async function POST(req: NextRequest) {
  try {
    const { sessionId, otp, projectToken, name, phone } = await req.json()

    if (!sessionId || !otp || !projectToken) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const verified = await verifyAndConsumeOTP(sessionId, otp)
    if (!verified) {
      return NextResponse.json({ success: false, error: 'INVALID_OTP' }, { status: 401 })
    }

    const { email } = verified

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

    // Find or create CLIENT user by email (primary identifier)
    const existingUsers = await studioQueryByIndex<StudioUser>(
      TABLES.users,
      'email-index',
      'email = :e',
      { ':e': email }
    )

    let user = existingUsers[0]
    const now = new Date().toISOString()

    if (!user) {
      const userId = randomUUID()
      user = {
        userId,
        role: 'CLIENT',
        email,
        name:  name  || project.clientName,
        phone: phone || undefined,
        linkedProjectIds: [project.projectId],
        status: 'ACTIVE',
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      }
      await studioPutItem(TABLES.users, user as unknown as Record<string, unknown>)
    } else {
      // Merge new project + update profile fields if provided
      const ids = new Set(user.linkedProjectIds ?? [])
      ids.add(project.projectId)
      const updates: string[] = [
        'SET linkedProjectIds = :ids',
        'lastLoginAt = :now',
        'updatedAt = :now',
      ]
      const values: Record<string, unknown> = { ':ids': Array.from(ids), ':now': now }

      if (name && !user.name)   { updates.push('  #n = :name');  values[':name']  = name;  }
      if (phone && !user.phone) { updates.push('  phone = :phone'); values[':phone'] = phone; }

      await studioUpdateItem(
        TABLES.users,
        { userId: user.userId },
        updates.join(', '),
        values,
        name && !user.name ? { '#n': 'name' } : undefined
      )
      user = { ...user, linkedProjectIds: Array.from(ids) }
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
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return response
  } catch (err) {
    console.error('[client-otp-verify]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
