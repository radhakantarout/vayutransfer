import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getMediaDownloadUrl } from '@/lib/studio/storage'
import type { MediaFile } from '@/types/studio'

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId, fileId } = params

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file || file.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Default: edited version if available, otherwise original. The "Download
    // Original" control in the Needs Editing UI passes ?version=original to
    // force the pristine file even after an edit exists — e.g. the studio
    // admin wants to redo the edit from scratch rather than build on the last one.
    const forceOriginal = req.nextUrl.searchParams.get('version') === 'original'
    const isEdited = !forceOriginal && !!(file.editedS3Key || file.editedR2Key)
    const suffix   = isEdited ? '_edited' : '_original'
    const filename = file.originalFilename.replace(/(\.[^.]+)$/, `${suffix}$1`)

    const url = await getMediaDownloadUrl(file, filename, { original: forceOriginal })
    return NextResponse.json({ success: true, data: { url, filename } })
  } catch (err) {
    console.error('[file download GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
