import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getItem } from '@/lib/aws/dynamodb'
import { getTransferFiles } from '@/lib/transferBatch'
import type { ApiResponse, Transfer } from '@/types'

// Checks a password-protected transfer's password server-side and, only on
// success, returns the same file info GET /api/download/[fileId] would —
// no client-side password checking, matches the rule enforced on the real
// download-issuing POST too (which re-validates independently rather than
// trusting that this route was ever called).
export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params
  const transfersTable = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
  const transfer = await getItem<Transfer>(transfersTable, { fileId })

  if (!transfer) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_FOUND', message: 'File not found' },
      { status: 404 }
    )
  }
  if (new Date() > new Date(transfer.expiryTime)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'LINK_EXPIRED', message: 'This download link has expired' },
      { status: 410 }
    )
  }
  if (transfer.status !== 'active') {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'FILE_NOT_READY', message: 'File is not available for download' },
      { status: 404 }
    )
  }
  if (!transfer.passwordEnabled) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'NOT_PASSWORD_PROTECTED', message: 'This transfer is not password protected' },
      { status: 400 }
    )
  }

  const { password } = await req.json() as { password?: string }
  const valid = password ? await bcrypt.compare(password, transfer.passwordHash ?? '') : false
  if (!valid) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INCORRECT_PASSWORD', message: 'Incorrect password' },
      { status: 401 }
    )
  }

  const files = transfer.fileCount
    ? (await getTransferFiles(transfer))
        .filter((f) => f.status !== 'failed')
        .map((f) => ({ fileId: f.fileId, fileName: f.fileName, relativePath: f.relativePath, fileSizeBytes: f.fileSizeBytes }))
    : undefined

  return NextResponse.json<ApiResponse<{
    fileName: string
    fileSizeBytes: number
    expiryTime: string
    fileCount?: number
    files?: { fileId: string; fileName: string; relativePath?: string; fileSizeBytes: number }[]
  }>>({
    success: true,
    data: {
      fileName: transfer.fileName,
      fileSizeBytes: transfer.fileSizeBytes,
      expiryTime: transfer.expiryTime,
      fileCount: transfer.fileCount,
      files,
    },
  })
}
