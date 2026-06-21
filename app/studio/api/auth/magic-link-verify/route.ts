import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { randomUUID } from 'crypto'
import { signStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioPutItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioUser } from '@/types/studio'

function getMagicSecret() {
  return new TextEncoder().encode((process.env.STUDIO_JWT_SECRET ?? '') + '_magic')
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('t')
    if (!token) {
      return NextResponse.json({ success: false, error: 'MISSING_TOKEN' }, { status: 400 })
    }

    const { payload } = await jwtVerify(token, getMagicSecret())
    const { email, projectId, projectToken } = payload as {
      email: string; projectId: string; projectToken: string
    }

    const now = new Date().toISOString()
    const existingUsers = await studioQueryByIndex<StudioUser>(
      TABLES.users,
      'email-index',
      'email = :email',
      { ':email': email }
    )

    let user = existingUsers.find((u) => u.role === 'CLIENT')

    if (!user) {
      const userId = randomUUID()
      user = {
        userId,
        role: 'CLIENT',
        email,
        phone: '',
        name: '',
        linkedProjectIds: [projectId],
        status: 'ACTIVE',
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      }
      await studioPutItem(TABLES.users, user as unknown as Record<string, unknown>)
    } else {
      const ids = new Set(user.linkedProjectIds ?? [])
      ids.add(projectId)
      await studioUpdateItem(
        TABLES.users,
        { userId: user.userId },
        'SET linkedProjectIds = :ids, lastLoginAt = :now, updatedAt = :now',
        { ':ids': Array.from(ids), ':now': now }
      )
    }

    const studioToken = await signStudioJWT({
      userId: user.userId,
      role: 'CLIENT',
      projectId,
    })

    const response = NextResponse.json({ success: true, data: { token: studioToken, role: 'CLIENT' } })
    response.cookies.set('studio_token', studioToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return response
  } catch (err) {
    console.error('[magic-link-verify]', err)
    return NextResponse.json({ success: false, error: 'INVALID_OR_EXPIRED_TOKEN' }, { status: 401 })
  }
}
