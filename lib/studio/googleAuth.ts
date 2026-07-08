import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose'

// Reuses the same Google Cloud OAuth client as VayuTransfer's NextAuth login
// (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET) but with its own redirect_uri and its
// own short-lived signed tokens — entirely independent of NextAuth/lib/auth.ts.

function stateSecret() {
  return new TextEncoder().encode((process.env.STUDIO_JWT_SECRET ?? 'fallback') + '_google_state')
}

function signupSecret() {
  return new TextEncoder().encode((process.env.STUDIO_JWT_SECRET ?? 'fallback') + '_google_signup')
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export function googleCallbackUrl(origin: string): string {
  return `${origin}/studio/api/auth/google/callback`
}

export function getGoogleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleCallbackUrl(origin),
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function signOAuthState(next?: string): Promise<string> {
  return new SignJWT({ next: next ?? null })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(stateSecret())
}

export async function verifyOAuthState(state: string): Promise<{ next?: string | null } | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret())
    return payload as { next?: string | null }
  } catch {
    return null
  }
}

export async function signGoogleSignupToken(email: string, name: string): Promise<string> {
  return new SignJWT({ email, name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(signupSecret())
}

export async function verifyGoogleSignupToken(token: string): Promise<{ email: string; name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, signupSecret())
    return payload as { email: string; name: string }
  } catch {
    return null
  }
}

export async function exchangeCodeForIdToken(code: string, origin: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleCallbackUrl(origin),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`)
  const data = await res.json()
  if (!data.id_token) throw new Error('No id_token in Google token response')
  return data.id_token as string
}

export async function verifyGoogleIdToken(idToken: string): Promise<{ email: string; name: string }> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: process.env.GOOGLE_CLIENT_ID!,
  })
  const email = payload.email as string | undefined
  const emailVerified = payload.email_verified as boolean | undefined
  if (!email || !emailVerified) throw new Error('Google email not present or not verified')
  return { email: email.toLowerCase(), name: (payload.name as string | undefined) ?? '' }
}
