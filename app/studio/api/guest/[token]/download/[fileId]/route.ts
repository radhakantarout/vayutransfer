import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getStudioSignedDownloadUrl } from '@/lib/studio/s3'
import { recordDownload } from '@/lib/studio/usage'
import type { MediaFile } from '@/types/studio'

function getSecret() {
  return new TextEncoder().encode(process.env.STUDIO_JWT_SECRET!)
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; fileId: string } }
) {
  try {
    let projectId: string
    try {
      const { payload } = await jwtVerify(params.token, getSecret())
      if (payload.type !== 'GUEST_QR') {
        return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
      }
      projectId = payload.projectId as string
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? ''
      if (name === 'JWTExpired') return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
    }

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId: params.fileId })
    if (!file || file.processingStatus !== 'READY') {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const downloadUrl = await getStudioSignedDownloadUrl(file.editedS3Key ?? file.s3Key, file.originalFilename)
    recordDownload(file.studioId, file.sizeBytes).catch((e) => console.error('[usage record]', e))
    return NextResponse.redirect(downloadUrl)
  } catch (err) {
    console.error('[guest download GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
