import { SignJWT, jwtVerify } from 'jose'
import { NextRequest } from 'next/server'

export type StudioRole = 'OWNER' | 'ADMIN' | 'CLIENT' | 'PRINT'

export interface StudioJWTPayload {
  userId: string
  role: StudioRole
  studioId?: string
  projectId?: string
  isImpersonation?: boolean
  originalUserId?: string
  exp?: number
}

function getSecret() {
  const secret = process.env.STUDIO_JWT_SECRET
  if (!secret) throw new Error('STUDIO_JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

const ROLE_EXPIRY: Record<StudioRole, string> = {
  OWNER: '24h',
  ADMIN: '24h',
  CLIENT: '30d',
  PRINT: '7d',
}

export async function signStudioJWT(payload: StudioJWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ROLE_EXPIRY[payload.role])
    .sign(getSecret())
}

export async function verifyStudioJWT(
  request: NextRequest
): Promise<StudioJWTPayload | null> {
  try {
    const token =
      request.cookies.get('studio_token')?.value ??
      request.headers.get('authorization')?.replace('Bearer ', '')

    if (!token) return null

    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as StudioJWTPayload
  } catch {
    return null
  }
}

export function isOwner(payload: StudioJWTPayload) {
  return payload.role === 'OWNER'
}

export function isAdminOrOwner(payload: StudioJWTPayload) {
  return payload.role === 'ADMIN' || payload.role === 'OWNER'
}
