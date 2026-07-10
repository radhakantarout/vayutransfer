import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { studioQueryByIndex, studioQueryByPK, studioPutItem, TABLES } from '@/lib/studio/dynamodb'
import type { StudioProject, MediaFile, Selection, StudioJob } from '@/types/studio'

const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

interface ZipSourceFile {
  fileId: string
  filename: string
  backend: 'S3' | 'R2'
  key: string
}

// Same priority order as resolveCurrent() in lib/studio/storage.ts — inlined
// here because the Lambda needs plain {backend,key} pairs, not a Buffer.
function resolveZipSource(f: MediaFile): ZipSourceFile {
  if (f.editedR2Key) return { fileId: f.fileId, filename: f.originalFilename, backend: 'R2', key: f.editedR2Key }
  if (f.editedS3Key) return { fileId: f.fileId, filename: f.originalFilename, backend: 'S3', key: f.editedS3Key }
  if (f.r2Key)       return { fileId: f.fileId, filename: f.originalFilename, backend: 'R2', key: f.r2Key }
  return { fileId: f.fileId, filename: f.originalFilename, backend: 'S3', key: f.s3Key! }
}

// Kicks off an async ZIP_DOWNLOAD job (same StudioJob pattern as face
// indexing) instead of building the zip inline — avoids the old route's
// timeout risk on large print batches. The vayustudio-zip Lambda does the
// actual work; the client polls status/[jobId] until READY.
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params

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
    if (!project.printShareExpiresAt || new Date(project.printShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    const { projectId, studioId } = project

    const allSelections = await studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId)
    const selectedIds = new Set(allSelections.filter((s) => s.isSelected).map((s) => s.fileId))

    const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)
    const selectedFiles = allFiles
      .filter((f) => selectedIds.has(f.fileId))
      .sort((a, b) => a.displayOrder - b.displayOrder)

    if (selectedFiles.length === 0) {
      return NextResponse.json({ success: false, error: 'NO_FILES' }, { status: 404 })
    }

    // Note: bytes for these same selected files are already counted against the
    // studio's download quota when the print gallery itself is loaded — no
    // second recordDownload here, that would double-count the same batch.
    const files = selectedFiles.map(resolveZipSource)
    const zipFilename = `${(project.clientName || 'photos').replace(/[^a-z0-9]+/gi, '-')}-photos.zip`

    if (!process.env.ZIP_LAMBDA_ARN) {
      console.error('[download-all init] ZIP_LAMBDA_ARN not set')
      return NextResponse.json({ success: false, error: 'NOT_CONFIGURED' }, { status: 503 })
    }

    const jobId = randomUUID()
    const now = new Date().toISOString()
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 1 day — zip jobs are short-lived

    const job: StudioJob = {
      jobId, jobType: 'ZIP_DOWNLOAD', status: 'PENDING',
      projectId, studioId,
      inputPayload: { fileCount: files.length },
      createdAt: now, ttl,
    }
    await studioPutItem(TABLES.jobs, job as unknown as Record<string, unknown>)

    lambda.send(new InvokeCommand({
      FunctionName: process.env.ZIP_LAMBDA_ARN,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({
        jobId, studioId, projectId, files, zipFilename,
        s3Bucket: process.env.STUDIO_S3_BUCKET ?? 'vayutransfer-studio-originals',
        r2Bucket: process.env.STUDIO_R2_ORIGINAL_BUCKET,
        r2Endpoint: process.env.STUDIO_R2_ENDPOINT,
        r2AccessKeyId: process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID,
        r2SecretAccessKey: process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY,
      })),
    })).catch((err: unknown) => console.error('[zip invoke]', err))

    return NextResponse.json({ success: true, data: { jobId } })
  } catch (err) {
    console.error('[print gallery download-all init]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
