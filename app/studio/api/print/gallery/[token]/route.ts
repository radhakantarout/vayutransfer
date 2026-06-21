import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { getStudioCloudFrontSignedUrl } from '@/lib/studio/s3'
import type { StudioProject, MediaFile, Selection } from '@/types/studio'

export async function GET(
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

    // Get selected file IDs
    const allSelections = await studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId)
    const selectedIds = new Set(allSelections.filter((s) => s.isSelected).map((s) => s.fileId))

    // Get all media files and filter to selected
    const allFiles = await studioQueryByIndex<MediaFile>(
      TABLES.mediafiles,
      'projectId-index',
      'projectId = :pid',
      { ':pid': projectId }
    )
    const selectedFiles = allFiles
      .filter((f) => selectedIds.has(f.fileId))
      .sort((a, b) => a.displayOrder - b.displayOrder)

    const expirySeconds = parseInt(process.env.PRINT_LINK_EXPIRY_SECONDS ?? '604800', 10)

    // Generate CloudFront signed download URLs — edited version if available, else original
    const printFiles = selectedFiles.map((f) => {
      const s3Key    = f.editedS3Key ?? f.s3Key
      const isEdited = !!f.editedS3Key
      let downloadUrl = ''
      try {
        downloadUrl = getStudioCloudFrontSignedUrl(s3Key, expirySeconds)
      } catch {
        downloadUrl = ''
      }
      return {
        fileId:           f.fileId,
        originalFilename: f.originalFilename,
        r2PreviewUrl:     f.r2PreviewUrl ?? null,
        isEdited,
        downloadUrl,
        sizeBytes:        f.sizeBytes,
        selection:        allSelections.find((s) => s.fileId === f.fileId) ?? null,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        project: {
          clientName: project.clientName,
          eventDate:  project.eventDate,
          eventType:  project.eventType,
        },
        studioId,
        files: printFiles,
        expiresAt: project.printShareExpiresAt,
      },
    })
  } catch (err) {
    console.error('[print gallery GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
