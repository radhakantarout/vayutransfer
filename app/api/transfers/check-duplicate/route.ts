import { NextRequest, NextResponse } from 'next/server'
import { queryItems } from '@/lib/aws/dynamodb'
import { resolveOwnWalletId } from '@/lib/walletAuth'
import type { ApiResponse, Transfer } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

interface DuplicateCheckResult {
  duplicate: boolean
  fileId?: string
  shareableLink?: string
  createdAt?: string
  expiryTime?: string
}

// Cross-transfer duplicate check, scoped to the caller's own wallet only —
// single-file (non-batch) transfers only for now, matched by exact
// fileName + fileSizeBytes (name-only would false-positive constantly on
// common camera-default names like IMG_0001.jpg). Only an ACTIVE,
// not-yet-expired transfer counts as "already sent" — an expired one isn't
// really still out there for anyone to be confused by.
export async function GET(req: NextRequest) {
  try {
    const walletId = await resolveOwnWalletId()
    if (!walletId) {
      return NextResponse.json<ApiResponse<DuplicateCheckResult>>({ success: true, data: { duplicate: false } })
    }

    const fileName = req.nextUrl.searchParams.get('fileName')
    const fileSizeBytes = Number(req.nextUrl.searchParams.get('fileSizeBytes'))
    if (!fileName || !fileSizeBytes) {
      return NextResponse.json<ApiResponse<never>>({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const transfers = await queryItems<Transfer>(TRANSFERS_TABLE, 'walletId-index', 'walletId = :w', { ':w': walletId })
    const now = Date.now()
    const match = transfers.find((t) =>
      !t.fileCount &&
      t.status === 'active' &&
      new Date(t.expiryTime).getTime() > now &&
      t.fileName === fileName &&
      t.fileSizeBytes === fileSizeBytes
    )

    if (!match) {
      return NextResponse.json<ApiResponse<DuplicateCheckResult>>({ success: true, data: { duplicate: false } })
    }

    return NextResponse.json<ApiResponse<DuplicateCheckResult>>({
      success: true,
      data: {
        duplicate: true,
        fileId: match.fileId,
        shareableLink: `${req.nextUrl.origin}/download/${match.fileId}`,
        createdAt: match.createdAt,
        expiryTime: match.expiryTime,
      },
    })
  } catch (err) {
    console.error('[transfers check-duplicate]', err)
    return NextResponse.json<ApiResponse<never>>({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
