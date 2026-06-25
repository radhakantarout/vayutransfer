import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioUser } from '@/types/studio'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    // Platform Owner — credentials are env-only, never in DB
    const ownerEmail = process.env.PLATFORM_OWNER_EMAIL
    const ownerHash  = process.env.PLATFORM_OWNER_PASSWORD_HASH

    if (email === ownerEmail && ownerHash) {
      const valid = await bcrypt.compare(password, ownerHash)
      if (!valid) {
        return NextResponse.json({ success: false, error: 'INVALID_CREDENTIALS' }, { status: 401 })
      }

      const token = await signStudioJWT({ userId: 'platform-owner', role: 'OWNER' })
      const response = NextResponse.json({ success: true, data: { token, role: 'OWNER' } })
      response.cookies.set('studio_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
      })
      response.cookies.set('studio_ui', JSON.stringify({ role: 'OWNER', name: 'Platform Owner', email: ownerEmail ?? '' }), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
      })
      return response
    }

    // Studio Admin — look up in vayustudio-users by email GSI
    const users = await studioQueryByIndex<StudioUser>(
      TABLES.users,
      'email-index',
      'email = :email',
      { ':email': email }
    )

    const user = users[0]
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'INVALID_CREDENTIALS' }, { status: 401 })
    }

    if (user.status === 'SUSPENDED') {
      return NextResponse.json({ success: false, error: 'ACCOUNT_SUSPENDED' }, { status: 403 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash ?? '')
    if (!valid) {
      return NextResponse.json({ success: false, error: 'INVALID_CREDENTIALS' }, { status: 401 })
    }

    // Update lastLoginAt
    await studioUpdateItem(
      TABLES.users,
      { userId: user.userId },
      'SET lastLoginAt = :now',
      { ':now': new Date().toISOString() }
    )

    const token = await signStudioJWT({
      userId: user.userId,
      role: 'ADMIN',
      studioId: user.linkedStudioId,
    })

    const response = NextResponse.json({
      success: true,
      data: { token, role: user.role, studioId: user.linkedStudioId },
    })
    response.cookies.set('studio_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
    response.cookies.set('studio_ui', JSON.stringify({ role: user.role, name: user.name ?? '', email: user.email ?? '' }), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
    return response
  } catch (err) {
    console.error('[admin-login]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
