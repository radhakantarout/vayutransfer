import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { studioQueryByIndex, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioUser } from '@/types/studio'

function getSecret() {
  const s = process.env.STUDIO_JWT_SECRET
  if (!s) throw new Error('STUDIO_JWT_SECRET not set')
  return new TextEncoder().encode(s)
}

export async function POST(req: NextRequest) {
  try {
    const { resetToken, password } = await req.json()
    if (!resetToken || !password || password.length < 8) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const { payload } = await jwtVerify(resetToken, getSecret())
    const { email, type } = payload as { email: string; type: string }

    if (type !== 'pw_reset_verified') {
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 400 })
    }

    const users = await studioQueryByIndex<StudioUser>(
      TABLES.users, 'email-index', 'email = :e', { ':e': email }
    )
    if (users.length === 0) {
      return NextResponse.json({ success: false, error: 'USER_NOT_FOUND' }, { status: 404 })
    }

    const user         = users[0]
    const passwordHash = await bcrypt.hash(password, 12)

    await studioUpdateItem(
      TABLES.users,
      { userId: user.userId },
      'SET passwordHash = :h, updatedAt = :u',
      { ':h': passwordHash, ':u': new Date().toISOString() }
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[reset/set-password]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
