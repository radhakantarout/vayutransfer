import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getDriveToken } from '@/lib/googleDrive/tokens'
import type { ApiResponse } from '@/types'

// "Is Drive connected for the signed-in user" — lets the frontend decide
// whether clicking "Import from Google Drive" should jump straight to the
// Picker or first send the user through /api/google-drive/auth.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<{ signedIn: boolean; connected: boolean }>>({
      success: true,
      data: { signedIn: false, connected: false },
    })
  }

  const token = await getDriveToken(session.user.id)
  return NextResponse.json<ApiResponse<{ signedIn: boolean; connected: boolean }>>({
    success: true,
    data: { signedIn: true, connected: !!token },
  })
}
