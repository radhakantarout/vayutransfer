import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import type { ApiResponse, ZipJob } from '@/types'

const ZIP_JOBS_TABLE = process.env.DYNAMO_ZIP_JOBS_TABLE ?? 'vayu-zip-jobs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string; jobId: string } }
) {
  const { fileId, jobId } = params
  const job = await getItem<ZipJob>(ZIP_JOBS_TABLE, { jobId })

  // batchId must match the fileId in the URL — stops one download link
  // from probing another link's zip job by guessing a jobId.
  if (!job || job.batchId !== fileId) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'NOT_FOUND', message: 'Zip job not found' },
      { status: 404 }
    )
  }

  return NextResponse.json<ApiResponse<{
    status: ZipJob['status']
    processed: number
    total: number
    downloadUrl?: string
    zipFileName?: string
    errorMessage?: string
  }>>({
    success: true,
    data: {
      status: job.status,
      processed: job.processed,
      total: job.total,
      downloadUrl: job.downloadUrl,
      zipFileName: job.zipFileName,
      errorMessage: job.errorMessage,
    },
  })
}
