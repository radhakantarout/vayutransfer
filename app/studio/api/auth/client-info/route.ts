import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, Studio, StudioUser } from '@/types/studio'

// Unauthenticated — returns project's client details + whether email already registered.
// Used to pre-populate the signup form before OTP is sent.
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('t')
    if (!token) {
      return NextResponse.json({ success: false, error: 'MISSING_TOKEN' }, { status: 400 })
    }

    const projects = await studioQueryByIndex<StudioProject>(
      TABLES.projects,
      'clientShareToken-index',
      'clientShareToken = :token',
      { ':token': token }
    )

    const project = projects[0]
    if (!project) {
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 404 })
    }
    if (!project.clientShareExpiresAt || new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    const [studio, existingUsers] = await Promise.all([
      studioGetItem<Studio>(TABLES.studios, { studioId: project.studioId }),
      project.clientEmail
        ? studioQueryByIndex<StudioUser>(TABLES.users, 'email-index', 'email = :e', { ':e': project.clientEmail }).catch(() => [] as StudioUser[])
        : Promise.resolve([] as StudioUser[]),
    ])

    return NextResponse.json({
      success: true,
      data: {
        clientName:  project.clientName,
        clientEmail: project.clientEmail ?? '',
        clientPhone: project.clientPhone ?? '',
        studioName:  studio?.name ?? 'Your photographer',
        isReturning: existingUsers.length > 0,
        sharePasswordProtected: project.sharePasswordProtected === true,
      },
    })
  } catch (err) {
    console.error('[client-info]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
