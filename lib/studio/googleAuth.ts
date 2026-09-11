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

// timeoutDuration bumped from jose's 5s default — a cold module (every dev
// hot-reload, or a real Lambda/Vercel cold start) has an empty key cache, so
// the very next login has to do a live fetch of Google's certs first; on a
// slow first connection that can exceed 5s and fail with a generic
// OAUTH_FAILED even though the login itself was fine (retrying then works
// instantly since the keys are cached after the first successful fetch).
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration: 15000,
})

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

export type GoogleAuthIntent = 'admin' | 'moments'

export async function signOAuthState(next?: string, intent: GoogleAuthIntent = 'admin'): Promise<string> {
  return new SignJWT({ next: next ?? null, intent })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(stateSecret())
}

export async function verifyOAuthState(state: string): Promise<{ next?: string | null; intent: GoogleAuthIntent } | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret())
    return { next: payload.next as string | null | undefined, intent: (payload.intent as GoogleAuthIntent) ?? 'admin' }
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
