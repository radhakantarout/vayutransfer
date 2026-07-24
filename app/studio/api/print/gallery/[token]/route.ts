import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { getMediaDownloadUrl, getMediaPreviewUrl } from '@/lib/studio/storage'
// getStudioCloudFrontSignedUrl (lib/studio/s3.ts) is kept available but unused
// here for now — direct presigned URLs avoid the CloudFront distribution's
// origin-bucket-per-environment config entirely. Swap back in later if CDN
// acceleration for print-quality downloads becomes worth the config overhead.
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

    // projectId is the table PK — query main table directly
    const allFiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)
    const selectedFiles = allFiles
      .filter((f) => selectedIds.has(f.fileId))
      .sort((a, b) => a.displayOrder - b.displayOrder)

    const expirySeconds = parseInt(process.env.PRINT_LINK_EXPIRY_SECONDS ?? '604800', 10)

    // Generate direct signed download URLs (same mechanism as every other
    // download path in this app) — edited version if available, else original
    const printFiles = await Promise.all(selectedFiles.map(async (f) => {
      const isEdited = !!(f.editedS3Key || f.editedR2Key)
      let downloadUrl = ''
      try {
        downloadUrl = await getMediaDownloadUrl(f, f.originalFilename, { expiresInSeconds: expirySeconds })
      } catch (err) {
        console.error(`[print gallery] signing failed for fileId=${f.fileId}`, err)
        downloadUrl = ''
      }
      // The cached R2 preview only ever reflects the original upload — for
      // edited files, regenerate straight from the edited key.
      const previewUrl = await getMediaPreviewUrl(f)
      return {
        fileId:           f.fileId,
        originalFilename: f.originalFilename,
        r2PreviewUrl:     previewUrl ?? null,
        isEdited,
        downloadUrl,
        sizeBytes:        f.sizeBytes,
        selection:        allSelections.find((s) => s.fileId === f.fileId) ?? null,
      }
    }))

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
