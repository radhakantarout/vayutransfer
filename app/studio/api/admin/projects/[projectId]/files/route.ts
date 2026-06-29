import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioSignedViewUrl } from '@/lib/studio/s3'
import type { MediaFile } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params

    // projectId is the table PK — query main table directly, no GSI needed
    const files = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)

    // Auto-heal: if Lambda not configured and any files are stuck PROCESSING, mark them READY now
    if (!process.env.WATERMARK_LAMBDA_ARN) {
      const stuckFiles = files.filter((f) => f.processingStatus === 'PROCESSING')
      if (stuckFiles.length > 0) {
        const now = new Date().toISOString()
        await Promise.all(
          stuckFiles.map((f) =>
            studioUpdateItem(TABLES.mediafiles, { projectId, fileId: f.fileId },
              'SET processingStatus = :s, uploadedAt = :now',
              { ':s': 'READY', ':now': f.uploadedAt ?? now }
            ).catch(() => {})
          )
        )
        stuckFiles.forEach((f) => { f.processingStatus = 'READY' })
        console.log(`[auto-heal] Marked ${stuckFiles.length} stuck files READY for project ${projectId}`)
      }
    }

    // Sort by displayOrder then uploadedAt
    files.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? '')
    })

    // For READY image files without an R2 preview (dev mode / pre-Lambda), generate
    // a presigned S3 view URL so the admin can see photos immediately.
    const enriched = await Promise.all(
      files.map(async (f) => {
        if (f.processingStatus === 'READY' && f.fileType === 'IMAGE' && !f.r2PreviewUrl) {
          try {
            const viewUrl = await getStudioSignedViewUrl(f.s3Key)
            console.log(`[files] presigned URL generated for ${f.fileId}: ${viewUrl.substring(0, 80)}...`)
            return { ...f, r2PreviewUrl: viewUrl }
          } catch (err) {
            console.error(`[files] presigned URL FAILED for fileId=${f.fileId} s3Key=${f.s3Key}`, err)
            return f
          }
        }
        return f
      })
    )

    // Auto-heal: keep project.totalFiles in sync with the actual file count
    studioUpdateItem(
      TABLES.projects,
      { studioId: auth.studioId!, projectId },
      'SET totalFiles = :tf',
      { ':tf': files.length }
    ).catch(() => {})

    return NextResponse.json({ success: true, data: enriched })
  } catch (err) {
    console.error('[files GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
