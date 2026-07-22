import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { signStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, StudioUser } from '@/types/studio'

// Grants gallery access without the email-OTP round trip — either because
// the link isn't password-protected at all (default), or because the
// visitor supplied the static password shown to the admin at link-creation
// time (client-otp-request/verify's live-emailed-OTP flow is the other,
// unchanged path — used when the client arrives via "Send Email").
export async function POST(req: NextRequest) {
  try {
    const { projectToken, password, name, email, phone } = await req.json()

    if (!projectToken) {
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

    if (project.sharePasswordProtected) {
      const submitted = typeof password === 'string' ? password.trim().toUpperCase() : ''
      if (!submitted || submitted !== (project.sharePassword ?? '').toUpperCase()) {
        return NextResponse.json({ success: false, error: 'INVALID_PASSWORD' }, { status: 401 })
      }
    }

    const resolvedEmail = (email as string | undefined) || project.clientEmail
    if (!resolvedEmail) {
      return NextResponse.json({ success: false, error: 'EMAIL_REQUIRED' }, { status: 400 })
    }

    // Find or create CLIENT user by email (primary identifier) — same as
    // client-otp-verify, kept in sync with it deliberately.
    const existingUsers = await studioQueryByIndex<StudioUser>(
      TABLES.users,
      'email-index',
      'email = :e',
      { ':e': resolvedEmail }
    )

    let user = existingUsers[0]
    const now = new Date().toISOString()

    if (!user) {
      const userId = randomUUID()
      user = {
        userId,
        role: 'CLIENT',
        email: resolvedEmail,
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
      const ids = new Set(user.linkedProjectIds ?? [])
      ids.add(project.projectId)
      const updates: string[] = ['SET linkedProjectIds = :ids', 'lastLoginAt = :now', 'updatedAt = :now']
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

    const cookieOpts = {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    }
    const response = NextResponse.json({ success: true, data: { token, role: 'CLIENT' } })
    response.cookies.set('studio_token', token, { ...cookieOpts, httpOnly: true })
    response.cookies.set('studio_ui', JSON.stringify({
      role: 'CLIENT',
      name:  user.name  ?? '',
      email: user.email ?? '',
      projectToken,
    }), { ...cookieOpts, httpOnly: false })
    return response
  } catch (err) {
    console.error('[client-gallery-access]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
