import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, StudioJob } from '@/types/studio'

// Polled by the print portal every few seconds after download-all/init.
// Scoped to the print share token (not just the jobId) so one print
// recipient can't probe another project's job by guessing a jobId.
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; jobId: string } }
) {
  try {
    const { token, jobId } = params

    const projects = await studioQueryByIndex<StudioProject>(
      TABLES.projects,
      'printShareToken-index',
      'printShareToken = :token',
      { ':token': token }
    )
    const project = projects[0]
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const job = await studioGetItem<StudioJob>(TABLES.jobs, { jobId })
    if (!job || job.projectId !== project.projectId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const output = (job.outputPayload ?? {}) as {
      processed?: number
      total?: number
      downloadUrl?: string
      filename?: string
    }

    return NextResponse.json({
      success: true,
      data: {
        status: job.status,
        processed: output.processed ?? 0,
        total: output.total ?? 0,
        downloadUrl: output.downloadUrl ?? null,
        filename: output.filename ?? null,
        errorMessage: job.errorMessage ?? null,
      },
    })
  } catch (err) {
    console.error('[print gallery download-all status]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
