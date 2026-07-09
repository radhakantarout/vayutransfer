import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioR2EditedKey, getStudioR2EditedPresignedPutUrl } from '@/lib/studio/r2'
import type { MediaFile } from '@/types/studio'

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; fileId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { filename, mimeType } = await req.json()
    if (!filename || !mimeType) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const { projectId, fileId } = params

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId })
    if (!file || file.studioId !== auth.studioId) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Edited re-uploads always go to R2 going forward, regardless of which
    // backend the original file happens to be on.
    const editedR2Key = getStudioR2EditedKey(file.studioId, projectId, fileId, filename)
    const presignedUrl = await getStudioR2EditedPresignedPutUrl(editedR2Key, mimeType)

    return NextResponse.json({ success: true, data: { presignedUrl, editedR2Key } })
  } catch (err) {
    console.error('[upload-edited POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
