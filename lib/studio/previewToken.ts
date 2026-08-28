import { SignJWT, jwtVerify } from 'jose'

// Signed with a derived secret (STUDIO_JWT_SECRET + '_preview'), same pattern as
// the magic-link token (app/studio/api/auth/magic-link-verify) — a distinct
// secret means this narrow-purpose token can never be confused with, or forged
// into, a real session JWT even if verification logic elsewhere had a bug.
// Grants exactly one thing: viewing one specific draft site for a few minutes.
function getPreviewSecret() {
  return new TextEncoder().encode((process.env.STUDIO_JWT_SECRET ?? '') + '_preview')
}

export async function signPreviewToken(payload: { studioId: string; subdomain: string }): Promise<string> {
  return new SignJWT({ ...payload, purpose: 'preview' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(getPreviewSecret())
}

// Only checks that the token is validly signed, unexpired, and was issued for
// THIS subdomain — deliberately doesn't return studioId/etc. to the caller,
// since the only thing this is ever used for is a yes/no gate check.
export async function verifyPreviewToken(token: string, subdomain: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getPreviewSecret())
    return payload.purpose === 'preview' && payload.subdomain === subdomain && typeof payload.studioId === 'string'
  } catch {
    return false
  }
}
