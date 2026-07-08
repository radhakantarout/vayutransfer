import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { studioQueryByIndex, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { getStudioObjectBuffer } from '@/lib/studio/s3'
import type { StudioProject, MediaFile, Selection } from '@/types/studio'

// Give zip assembly room to run for larger batches (Vercel default is 10s on Hobby).
export const maxDuration = 60

function uniqueFilename(name: string, fileId: string, used: Set<string>): string {
  if (!used.has(name)) return name
  const dot = name.lastIndexOf('.')
  return dot === -1 ? `${name}-${fileId.slice(0, 8)}` : `${name.slice(0, dot)}-${fileId.slice(0, 8)}${name.slice(dot)}`
}

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

    const { projectId } = project

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
    const zip = new JSZip()
    const usedNames = new Set<string>()
    for (const f of selectedFiles) {
      const s3Key = f.editedS3Key ?? f.s3Key
      const buffer = await getStudioObjectBuffer(s3Key)
      const name = uniqueFilename(f.originalFilename, f.fileId, usedNames)
      usedNames.add(name)
      zip.file(name, buffer)
    }

    // JPEGs are already compressed — skip DEFLATE, just bundle (faster, same size).
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
    const zipFilename = `${(project.clientName || 'photos').replace(/[^a-z0-9]+/gi, '-')}-photos.zip`

    return new NextResponse(new Blob([Uint8Array.from(zipBuffer)]), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Content-Length': String(zipBuffer.length),
      },
    })
  } catch (err) {
    console.error('[print gallery download-all]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
