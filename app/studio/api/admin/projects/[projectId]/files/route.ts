import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
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
            return { ...f, r2PreviewUrl: viewUrl }
          } catch {
            return f
          }
        }
        return f
      })
    )

    return NextResponse.json({ success: true, data: enriched })
  } catch (err) {
    console.error('[files GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
