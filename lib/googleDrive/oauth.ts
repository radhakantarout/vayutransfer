import { google } from 'googleapis'
import crypto from 'crypto'
import { getDriveToken } from '@/lib/googleDrive/tokens'

// Separate OAuth2 client/flow from NextAuth's own Google login (lib/auth.ts)
// — same GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (one Google Cloud OAuth
// client, reused), but its own redirect URI and its own minimal scope, so
// ordinary sign-in is completely unaffected by this feature existing.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export const DRIVE_OAUTH_STATE_COOKIE = 'vayu_drive_oauth_state'

function driveOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI
  )
}

export function generateOAuthState(): string {
  return crypto.randomBytes(24).toString('hex')
}

// access_type=offline + prompt=consent guarantees a refresh_token comes
// back even if this Google account previously authorized the app —
// without prompt=consent, Google silently omits refresh_token on repeat
// authorizations, which would leave us with only a short-lived token.
export function buildDriveAuthUrl(state: string): string {
  return driveOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_SCOPE],
    state,
  })
}

export async function exchangeDriveCode(code: string): Promise<{ refreshToken: string; scope: string }> {
  const client = driveOAuthClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error('NO_REFRESH_TOKEN')
  }
  return { refreshToken: tokens.refresh_token, scope: tokens.scope ?? DRIVE_SCOPE }
}

// Mints a short-lived access token from the stored refresh token — the
// refresh token itself never leaves this function/the DB. Returns null if
// the user has never connected Drive, or if Google has revoked the grant
// (surfaced to the caller as "reconnect your Google Drive account").
export async function getDriveAccessToken(userId: string): Promise<string | null> {
  const stored = await getDriveToken(userId)
  if (!stored) return null

  const client = driveOAuthClient()
  client.setCredentials({ refresh_token: stored.refreshToken })
  try {
    const { token } = await client.getAccessToken()
    return token ?? null
  } catch {
    // Expired/revoked refresh token — caller should treat this the same as
    // "not connected" and prompt reconnection rather than surfacing the
    // raw Google error.
    return null
  }
}
