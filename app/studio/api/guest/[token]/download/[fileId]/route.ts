import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { getMediaDownloadUrl } from '@/lib/studio/storage'
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
    let allowOriginalDownload = false
    try {
      const { payload } = await jwtVerify(params.token, getSecret())
      if (payload.type !== 'GUEST_QR') {
        return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
      }
      projectId = payload.projectId as string
      allowOriginalDownload = payload.allowOriginalDownload === true
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? ''
      if (name === 'JWTExpired') return NextResponse.json({ success: false, error: 'TOKEN_EXPIRED' }, { status: 410 })
      return NextResponse.json({ success: false, error: 'INVALID_TOKEN' }, { status: 401 })
    }

    const file = await studioGetItem<MediaFile>(TABLES.mediafiles, { projectId, fileId: params.fileId })
    if (!file || file.processingStatus !== 'READY') {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    // Only honor ?original=true when the signed token itself allows it —
    // server-side enforcement via the JWT, not just a hidden UI option, since
    // a guest could otherwise hand-craft the query param.
    const wantsOriginal = allowOriginalDownload && req.nextUrl.searchParams.get('original') === 'true'
    const downloadUrl = await getMediaDownloadUrl(file, file.originalFilename, { original: wantsOriginal })
    return NextResponse.redirect(downloadUrl)
  } catch (err) {
    console.error('[guest download GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
