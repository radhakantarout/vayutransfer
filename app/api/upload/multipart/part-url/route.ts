import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import { generatePartPresignedUrl } from '@/lib/aws/s3'
import type { ApiResponse, Transfer } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fileId?: string
      uploadId?: string
      partNumber?: number
      s3Key?: string
      walletId?: string
    }

    const { fileId, uploadId, partNumber, s3Key, walletId } = body

    if (!fileId || !uploadId || !partNumber || !s3Key || !walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'MISSING_PARAMS', message: 'fileId, uploadId, partNumber, s3Key, walletId are required' },
        { status: 400 }
      )
    }

    // Validate the fileId belongs to this wallet
    const transfersTable = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
    const transfer = await getItem<Transfer>(transfersTable, { fileId })

    if (!transfer || transfer.walletId !== walletId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'UNAUTHORIZED', message: 'Transfer not found or access denied' },
        { status: 403 }
      )
    }

    if (partNumber < 1 || partNumber > 10000) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'INVALID_PART_NUMBER', message: 'Part number must be between 1 and 10000' },
        { status: 400 }
      )
    }

    const presignedUrl = await generatePartPresignedUrl(s3Key, uploadId, partNumber)

    return NextResponse.json<ApiResponse<{
      presignedUrl: string
      partNumber: number
      expiresIn: number
    }>>({
      success: true,
      data: {
        presignedUrl,
        partNumber,
        expiresIn: 7200,
      },
    })
  } catch (err) {
    console.error('[upload/part-url]', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'INTERNAL_ERROR', message: 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}
