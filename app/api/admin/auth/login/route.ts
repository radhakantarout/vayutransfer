import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signAdminJWT } from '@/lib/adminAuth'

// Env-only credentials, never in a database — matches VayuStudios'
// app/studio/api/auth/admin-login/route.ts "Platform Owner" branch,
// re-implemented here as VayuTransfer's own separate instance.
export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, password } = await req.json().catch(() => ({}))
    if (!rawEmail || !password) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const email = String(rawEmail).trim().toLowerCase()
    const adminEmail = process.env.PLATFORM_ADMIN_EMAIL
    const adminHash = process.env.PLATFORM_ADMIN_PASSWORD_HASH

    if (!adminEmail || !adminHash || email !== adminEmail.toLowerCase()) {
      return NextResponse.json({ success: false, error: 'INVALID_CREDENTIALS' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, adminHash)
    if (!valid) {
      return NextResponse.json({ success: false, error: 'INVALID_CREDENTIALS' }, { status: 401 })
    }

    const token = await signAdminJWT(adminEmail)
    const response = NextResponse.json({ success: true, data: { email: adminEmail } })
    response.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
    response.cookies.set('admin_ui', JSON.stringify({ email: adminEmail }), {
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
