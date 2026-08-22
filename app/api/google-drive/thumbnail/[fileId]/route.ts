import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getFileThumbnail } from '@/lib/googleDrive/driveClient'

// Proxies a Drive file's thumbnail image so the pre-upload preview panel can
// show something for a Drive-picked file without downloading the whole
// file — thumbnailLink needs the same OAuth bearer token this route already
// holds server-side, so the browser can never load it directly.
export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse(null, { status: 401 })
  }

  const thumbnail = await getFileThumbnail(session.user.id, params.fileId).catch(() => null)
  if (!thumbnail) {
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(new Uint8Array(thumbnail.buffer), {
    headers: {
      'Content-Type': thumbnail.contentType,
      // Private — tied to this user's own OAuth grant, not a shared/public asset.
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
