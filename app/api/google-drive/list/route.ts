import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { resolveDriveSelection, type ResolvedDriveFile } from '@/lib/googleDrive/resolveSelection'
import { MAX_DRIVE_IMPORT_SIZE_GB } from '@/constants/pricing'
import type { ApiResponse } from '@/types'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'UNAUTHORIZED', message: 'Sign in first' },
      { status: 401 }
    )
  }

  const body = await req.json() as { items?: { id: string; mimeType: string }[] }
  const items = body.items ?? []
  if (items.length === 0) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'MISSING_PARAMS', message: 'No items selected' },
      { status: 400 }
    )
  }

  try {
    const { files, totalSizeBytes, unsupported } = await resolveDriveSelection(session.user.id, items)

    if (files.length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: 'NO_SUPPORTED_FILES',
          message: unsupported.length > 0
            ? `These file types can't be imported: ${unsupported.slice(0, 3).join(', ')}${unsupported.length > 3 ? '…' : ''}`
            : 'No accessible files found in your selection',
        },
        { status: 400 }
      )
    }

    const maxBytes = MAX_DRIVE_IMPORT_SIZE_GB * 1024 * 1024 * 1024
    if (totalSizeBytes > maxBytes) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: 'FILE_TOO_LARGE',
          message: `Google Drive import works best for smaller transfers — up to ${MAX_DRIVE_IMPORT_SIZE_GB}GB total. For larger files, download them to your device first and use Browse Files instead.`,
        },
        { status: 400 }
      )
    }

    return NextResponse.json<ApiResponse<{
      files: ResolvedDriveFile[]
      totalSizeBytes: number
      unsupported: string[]
    }>>({
      success: true,
      data: { files, totalSizeBytes, unsupported },
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'DRIVE_NOT_CONNECTED') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'DRIVE_NOT_CONNECTED', message: 'Reconnect your Google Drive account and try again' },
        { status: 403 }
      )
    }
    console.error('[google-drive/list]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Unable to read your Google Drive selection. Please try again.' },
      { status: 500 }
    )
  }
}
