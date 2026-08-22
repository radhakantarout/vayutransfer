import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getDriveAccessToken } from '@/lib/googleDrive/oauth'
import type { ApiResponse } from '@/types'

// Mints a short-lived access token for the Google Picker widget to use
// client-side — the widget needs a token to render authorized results, but
// it only ever sees this short-lived token, never the refresh token stored
// server-side. Not cached/persisted anywhere on the client.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'UNAUTHORIZED', message: 'Sign in first' },
      { status: 401 }
    )
  }

  const accessToken = await getDriveAccessToken(session.user.id)
  if (!accessToken) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'DRIVE_NOT_CONNECTED', message: 'Reconnect your Google Drive account and try again' },
      { status: 403 }
    )
  }

  return NextResponse.json<ApiResponse<{ accessToken: string }>>({ success: true, data: { accessToken } })
}
