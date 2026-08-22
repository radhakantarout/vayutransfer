import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { deleteStorageObject, deleteStorageObjectByKey } from '@/lib/aws/storage'
import { getTransferFiles, transferFileKey } from '@/lib/transferBatch'
import { logAudit } from '@/lib/audit'
import type { ApiResponse, Transfer } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

// Owner-facing single-transfer fetch for the Share & Manage page — never
// returns passwordHash. Distinct from the public GET /api/download/[fileId]
// (recipient-facing, no auth, gated by passwordEnabled/expiry) — this one
// is auth-gated to the owning wallet instead.
export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'UNAUTHORIZED', message: 'Sign in to view this transfer' },
      { status: 401 }
    )
  }

  const { fileId } = params
  const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId })
  if (!transfer) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'NOT_FOUND', message: 'Transfer not found' },
      { status: 404 }
    )
  }

  const user = await getUserById(session.user.id)
  if (!user || transfer.walletId !== user.walletId) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FORBIDDEN', message: 'This transfer does not belong to you' },
      { status: 403 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return NextResponse.json<ApiResponse<{
    fileId: string
    fileName: string
    displayName?: string
    fileSizeBytes: number
    fileCount?: number
    status: Transfer['status']
    downloadsUsed: number
    expiryDays: number
    expiryTime: string
    createdAt: string
    passwordEnabled?: boolean
    shareableLink: string
  }>>({
    success: true,
    data: {
      fileId: transfer.fileId,
      fileName: transfer.fileName,
      displayName: transfer.displayName,
      fileSizeBytes: transfer.fileSizeBytes,
      fileCount: transfer.fileCount,
      status: transfer.status,
      downloadsUsed: transfer.downloadsUsed,
      expiryDays: transfer.expiryDays,
      expiryTime: transfer.expiryTime,
      createdAt: transfer.createdAt,
      passwordEnabled: transfer.passwordEnabled,
      shareableLink: `${appUrl}/download/${transfer.fileId}`,
    },
  })
}

// Permanently deletes a transfer — no refund (deleting early forfeits any
// remaining retention time, same as letting it expire naturally, just
// sooner), and removes the underlying R2/S3 object(s) since the mockup's
// own confirmation copy says "delete all files permanently," not just hide
// the link. Irreversible; the client is expected to confirm first.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Sign in to delete this transfer' },
        { status: 401 }
      )
    }

    const { fileId } = params
    const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId })
    if (!transfer) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'NOT_FOUND', message: 'Transfer not found' },
        { status: 404 }
      )
    }

    const user = await getUserById(session.user.id)
    if (!user || transfer.walletId !== user.walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'FORBIDDEN', message: 'This transfer does not belong to you' },
        { status: 403 }
      )
    }

    if (transfer.status === 'deleted') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'ALREADY_DELETED', message: 'This transfer was already deleted' },
        { status: 409 }
      )
    }

    // Best-effort object cleanup — a failed delete on one object shouldn't
    // block the rest, and shouldn't block the transfer from being marked
    // deleted (the link is gated on status, not on storage state, so a
    // stray leftover object is a cleanup nit, not a correctness issue).
    if (transfer.fileCount) {
      const files = await getTransferFiles(transfer)
      await Promise.all(
        files
          .filter((f) => f.status === 'uploaded')
          .map((f) =>
            deleteStorageObjectByKey(f.storageBackend, transferFileKey(f))
              .catch((err) => console.error('[transfers/delete] failed to delete object for', f.fileId, err))
          )
      )
    } else if (transfer.status === 'active') {
      await deleteStorageObject(transfer).catch((err) => console.error('[transfers/delete] failed to delete object for', fileId, err))
    }

    await updateItem(
      TRANSFERS_TABLE,
      { fileId },
      'SET #s = :deleted',
      { ':deleted': 'deleted' },
      undefined,
      { '#s': 'status' }
    )

    void logAudit({
      eventType: 'TRANSFER_DELETED',
      actor: 'user',
      outcome: 'success',
      walletId: user.walletId,
      fileId,
      metadata: { fileCount: transfer.fileCount, fileSizeBytes: transfer.fileSizeBytes },
    })

    return NextResponse.json<ApiResponse<{ ok: true }>>({ success: true, data: { ok: true } })
  } catch (err) {
    console.error('[transfers/delete]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to delete transfer' },
      { status: 500 }
    )
  }
}
