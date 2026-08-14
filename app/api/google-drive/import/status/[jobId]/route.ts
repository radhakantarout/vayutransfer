import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import type { ApiResponse, DriveJob } from '@/types'

const DRIVE_JOBS_TABLE = process.env.DYNAMO_DRIVE_JOBS_TABLE ?? 'vayu-drive-jobs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const job = await getItem<DriveJob>(DRIVE_JOBS_TABLE, { jobId: params.jobId })
  if (!job) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'NOT_FOUND', message: 'Import job not found' },
      { status: 404 }
    )
  }

  return NextResponse.json<ApiResponse<{
    status: DriveJob['status']
    processed: number
    total: number
    currentFileName?: string
    errorMessage?: string
    batchId: string
  }>>({
    success: true,
    data: {
      status: job.status,
      processed: job.processed,
      total: job.total,
      currentFileName: job.currentFileName,
      errorMessage: job.errorMessage,
      batchId: job.batchId,
    },
  })
}
