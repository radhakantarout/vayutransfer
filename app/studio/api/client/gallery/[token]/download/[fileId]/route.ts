import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioQueryByIndex, studioGetItem, studioUpdateItem, TABLES } from '@/lib/studio/dynamodb'
import { getMediaDownloadUrl } from '@/lib/studio/storage'
import { recordDownload } from '@/lib/studio/usage'
import type { StudioProject, MediaFile } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth) {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const { token, fileId } = params

    const entryProjects = await studioQueryByIndex<StudioProject>(
      TABLES.projects,
      'clientShareToken-index',
      'clientShareToken = :token',
      { ':token': token }
    )
    const entry = entryProjects[0]
    if (!entry) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    if (!entry.clientShareExpiresAt || new Date(entry.clientShareExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
    }

    // Same broadened check every client-gallery route uses — the client
    // themselves, or the owning studio's own staff previewing.
    const isClient = auth.role === 'CLIENT' && auth.projectId === entry.projectId
    const isStudioPreview = ['ADMIN', 'OWNER'].includes(auth.role) && auth.studioId === entry.studioId
    if (!isClient && !isStudioPreview) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId: entry.projectId, fileId })
    if (!file || file.processingStatus !== 'READY') {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const downloadUrl = await getMediaDownloadUrl(file, file.originalFilename)

    // Only count real client downloads toward Recent Transfers' download
    // count — the studio previewing its own shared link isn't a "download".
    if (isClient) {
      studioUpdateItem(
        TABLES.projects,
        { studioId: entry.studioId, projectId: entry.projectId },
        'ADD shareDownloadCount :one',
        { ':one': 1 }
      ).catch((err) => console.error('[client download] shareDownloadCount increment failed', err))
      recordDownload(entry.studioId, file.sizeBytes).catch((err) => console.error('[usage record]', err))
    }

    return NextResponse.redirect(downloadUrl)
  } catch (err) {
    console.error('[client download GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
