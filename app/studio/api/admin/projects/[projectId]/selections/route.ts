import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import type { Selection, MediaFile } from '@/types/studio'

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

    const [allSelections, allFiles] = await Promise.all([
      studioQueryByPK<Selection>(TABLES.selections, 'projectId', projectId),
      studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId),
    ])

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

    return NextResponse.json({ success: true, data: selected })
  } catch (err) {
    console.error('[admin selections GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
