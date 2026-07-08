import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioGetItem, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { resolveMediaPreviewUrl } from '@/lib/studio/s3'
import type { StudioProject, MediaFile } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const { token, projectId } = params

    // Resolve entry project (the one whose token the client used to auth)
    const entryProjects = await studioQueryByIndex<StudioProject>(
      TABLES.projects,
      'clientShareToken-index',
      'clientShareToken = :token',
      { ':token': token }
    )
    const entry = entryProjects[0]
    if (!entry || auth.projectId !== entry.projectId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    if (!entry.clientShareExpiresAt || new Date(entry.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    // Load the requested project
    const project = await studioGetItem<StudioProject>(TABLES.projects, {
      studioId: entry.studioId,
      projectId,
    })
    if (!project) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Verify this project belongs to the same client
    if (project.clientEmail !== entry.clientEmail) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    // Verify this project also has an active share token
    if (!project.clientShareToken || !project.clientShareExpiresAt || new Date(project.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)

    const sharedSet = project.sharedFileIds && project.sharedFileIds.length > 0
      ? new Set(project.sharedFileIds)
      : null

    const readyFiles = allFiles
      .filter(f => f.processingStatus === 'READY' && (!sharedSet || sharedSet.has(f.fileId)))
      .sort((a, b) => a.displayOrder - b.displayOrder)

    // Enrich with a fresh signed URL when preview is missing, or when an
    // edited version exists (client must see the edited photo, not the stale
    // cached preview from the original upload)
    const enriched = await Promise.all(
      readyFiles.map(async (f) => {
        const previewUrl = await resolveMediaPreviewUrl(f)
        return { ...f, r2PreviewUrl: previewUrl, isEdited: !!f.editedS3Key }
      })
    )

    return NextResponse.json({ success: true, data: { project, files: enriched } })
  } catch (err) {
    console.error('[client-gallery event GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
