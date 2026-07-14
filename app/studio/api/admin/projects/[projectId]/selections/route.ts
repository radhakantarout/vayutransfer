import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByPK, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { getMediaPreviewUrl } from '@/lib/studio/storage'
import type { Selection, MediaFile, StudioProject } from '@/types/studio'

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
    const studioId = auth.studioId!

    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const [allSelections, allFiles] = await Promise.all([
      studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId),
      studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId),
    ])

    // Auto-heal stuck PROCESSING files when Lambda not configured
    if (!process.env.WATERMARK_LAMBDA_ARN) {
      const stuckFiles = allFiles.filter((f) => f.processingStatus === 'PROCESSING')
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
      }
    }

    const fileMap = new Map(allFiles.map((f) => [f.fileId, f]))
    const selected = allSelections
      .filter((s) => s.isSelected)
      .map((s) => ({ selection: s, file: fileMap.get(s.fileId) ?? null }))
      .filter((x): x is { selection: Selection; file: MediaFile } => x.file !== null)

    // Sort: editing-required first, then by displayOrder
    selected.sort((a, b) => {
      if (a.selection.editingRequired !== b.selection.editingRequired)
        return a.selection.editingRequired ? -1 : 1
      return a.file.displayOrder - b.file.displayOrder
    })

    // Regenerate preview when missing, or when an edited version exists
    // (the cached R2 preview only ever reflects the original upload)
    const enriched = await Promise.all(
      selected.map(async ({ selection, file }) => {
        const previewUrl = await getMediaPreviewUrl(file)
        return { selection, file: { ...file, r2PreviewUrl: previewUrl } }
      })
    )

    return NextResponse.json({ success: true, data: enriched })
  } catch (err) {
    console.error('[admin selections GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
