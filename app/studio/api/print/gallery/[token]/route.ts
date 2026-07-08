import { NextRequest, NextResponse } from 'next/server'
import { studioQueryByIndex, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { getStudioSignedDownloadUrl, resolveMediaPreviewUrl } from '@/lib/studio/s3'
// getStudioCloudFrontSignedUrl (lib/studio/s3.ts) is kept available but unused
// here for now — direct S3 presigned URLs avoid the CloudFront distribution's
// origin-bucket-per-environment config entirely. Swap back in later if CDN
// acceleration for print-quality downloads becomes worth the config overhead.
import { recordDownload } from '@/lib/studio/usage'
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

    // Generate direct S3 signed download URLs (same mechanism as every other
    // download path in this app) — edited version if available, else original
    const printFiles = await Promise.all(selectedFiles.map(async (f) => {
      const s3Key    = f.editedS3Key ?? f.s3Key
      const isEdited = !!f.editedS3Key
      let downloadUrl = ''
      try {
        downloadUrl = await getStudioSignedDownloadUrl(s3Key, f.originalFilename, expirySeconds)
      } catch (err) {
        console.error(`[print gallery] S3 signing failed for fileId=${f.fileId} s3Key=${s3Key}`, err)
        downloadUrl = ''
      }
      // The cached R2 preview only ever reflects the original upload — for
      // edited files, regenerate straight from the edited key.
      const previewUrl = await resolveMediaPreviewUrl(f)
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

    // Batch of links issued at once — record the sum against this studio's
    // monthly quota, same "counted at URL issuance" approximation used for
    // the other two download paths (no server-side egress byte tracking exists).
    const totalBytes = printFiles.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)
    if (totalBytes > 0) recordDownload(studioId, totalBytes).catch((e) => console.error('[usage record]', e))

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
