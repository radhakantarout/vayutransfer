import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getItem } from '@/lib/aws/dynamodb'
import { getTransferFiles } from '@/lib/transferBatch'
import type { ApiResponse, Transfer } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

export interface ResumeInfoFile {
  fileId: string
  fileName: string
  relativePath?: string
  fileSizeBytes: number
  status: 'pending' | 'uploaded' | 'failed' | 'skipped'
  // Every batch file gets a multipart uploadId at batch-creation time
  // (initiateUpload runs for all files up front in createBatchTransfer),
  // so any still-'pending' file already has one — the resume page uses it
  // to check completed parts via GET /api/upload/batch/upload-status.
  uploadId?: string
}

// Owner-facing — used by the My Transfers "Paused" badge (to show accurate
// X/Y-uploaded counts for a transfer no longer tracked in any browser
// tab's in-memory state) and by the resume-by-reselect page. Same auth
// pattern as app/api/transfers/[fileId]/route.ts.
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

  const files = transfer.fileCount ? await getTransferFiles(transfer) : []

  return NextResponse.json<ApiResponse<{
    fileId: string
    status: Transfer['status']
    fileCount?: number
    files: ResumeInfoFile[]
  }>>({
    success: true,
    data: {
      fileId: transfer.fileId,
      status: transfer.status,
      fileCount: transfer.fileCount,
      files: files.map((f) => ({
        fileId: f.fileId,
        fileName: f.fileName,
        relativePath: f.relativePath,
        fileSizeBytes: f.fileSizeBytes,
        status: f.status,
        uploadId: f.uploadId,
      })),
    },
  })
}
