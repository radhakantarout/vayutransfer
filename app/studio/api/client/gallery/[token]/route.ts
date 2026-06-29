import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { getStudioSignedViewUrl } from '@/lib/studio/s3'
import type { StudioProject, MediaFile } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const { token } = params

    const projects = await studioQueryByIndex<StudioProject>(
      TABLES.projects,
      'clientShareToken-index',
      'clientShareToken = :token',
      { ':token': token }
    )
    const project = projects[0]
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }
    if (!project.clientShareExpiresAt || new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }
    if (auth.projectId !== project.projectId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const files = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', project.projectId)

    // If admin shared only specific photos, filter to those IDs
    const sharedSet = project.sharedFileIds && project.sharedFileIds.length > 0
      ? new Set(project.sharedFileIds)
      : null

    const readyFiles = files
      .filter((f) => f.processingStatus === 'READY' && (!sharedSet || sharedSet.has(f.fileId)))
      .sort((a, b) => a.displayOrder - b.displayOrder)

    // Fallback to presigned S3 view URL when R2 preview not yet generated (dev / pre-Lambda)
    const enriched = await Promise.all(
      readyFiles.map(async (f) => {
        if (f.fileType === 'IMAGE' && !f.r2PreviewUrl) {
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

    return NextResponse.json({ success: true, data: { project, files: enriched } })
  } catch (err) {
    console.error('[client-gallery GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
