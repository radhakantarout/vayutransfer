import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioSignedDownloadUrl } from '@/lib/studio/s3'
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

    // Use edited version if available, otherwise original
    const s3Key   = file.editedS3Key ?? file.s3Key
    const suffix  = file.editedS3Key ? '_edited' : '_original'
    const filename = file.originalFilename.replace(/(\.[^.]+)$/, `${suffix}$1`)

    const url = await getStudioSignedDownloadUrl(s3Key, filename)
    return NextResponse.json({ success: true, data: { url, filename } })
  } catch (err) {
    console.error('[file download GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
