import { SignJWT, jwtVerify } from 'jose'
import { NextRequest } from 'next/server'

// VayuTransfer's own platform-admin JWT — deliberately separate from
// VayuStudios' lib/studio/auth.ts (own secret, own cookie name, own
// payload shape). support@vayutransfer.com is a mail alias, not a real
// Google account, so this can't reuse NextAuth's Google-only session.
export interface AdminJWTPayload {
  email: string
  exp?: number
}

function getSecret() {
  const secret = process.env.ADMIN_JWT_SECRET
  if (!secret) throw new Error('ADMIN_JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function signAdminJWT(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret())
}

export async function verifyAdminJWT(request: NextRequest): Promise<AdminJWTPayload | null> {
  try {
    const token = request.cookies.get('admin_token')?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as AdminJWTPayload
  } catch {
    return null
  }
}
